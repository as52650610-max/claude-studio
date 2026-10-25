#!/usr/bin/env python3
"""Mix the song and the sound effects of a film. numpy + scipy (+ ffmpeg to decode and to measure).

    python tools/py/mix.py PROJECT                      # cues from qa/sfx_cues.json or data/sfx.json
    python tools/py/mix.py PROJECT --cues my_cues.json --out audio/mix.wav

Cues are what the film declares (each shot's `sfx`, collected by `studio mix` into
qa/sfx_cues.json) or a hand-written data/sfx.json:

    {"duration": 42.0, "fps": 30, "cuts": [4.6, 9.2],
     "sfx": [{"t": 9.2, "sound": "whoosh", "sync": "peak", "gain": -3, "pan": 0.2,
              "role": "transition", "why": "push into the chorus title"}]}

  t      when the action happens (video time, seconds)
  sound  a recipe from sfx.py (whoosh, impact, ...) or a file in the project (audio/sfx/door.wav)
  sync   which landmark lands on t: onset | peak | end (default: the sound's own)
  gain   dB relative to the reference level (every sound is first set to -20 LUFS momentary)
  role   ducking role: click | typing | transition | notify | brand | voice | silence | none
  why    the reason the sound exists (reported when missing)

What it does: places every sound so its landmark lands on its action (start = t - landmark),
drops repeats of the same sound closer than 0.09 s, ducks the music by role with the deepest
duck winning (guizang's table), sums, sets the integrated loudness to -14 LUFS with true peaks
at or below -1 dBTP, and writes the mix, the two buses (for listening in order: effects, music,
mix), a waveform and a spectrogram, and a report that lists every sound with its distance to the
nearest beat. It reports offsets; it never moves a sound on its own.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io as A  # noqa: E402
import plots  # noqa: E402
import sfx as SFX  # noqa: E402

SR = A.SR
REF_LUFS = -20.0   # every sound is set to this momentary loudness before its own gain
DEBOUNCE = 0.09
# role: (depth dB, attack s, hold s, release s). Overlaps take the deepest, never the sum.
DUCK = {
    'click': (3.25, 0.04, 0.11, 0.22),
    'typing': (2.5, 0.04, 0.35, 0.25),
    'transition': (4.0, 0.04, 0.18, 0.33),
    'notify': (5.5, 0.04, 0.40, 0.38),
    'brand': (5.0, 0.04, 0.55, 0.45),
    'voice': (8.0, 0.08, None, 0.40),      # hold = as long as the voice lasts
    'silence': (40.0, 0.01, 0.25, 0.60),   # the music drops out for an impact
}


def fmt(t):
    return f'{int(t // 60):02d}:{t % 60:05.2f}'


def load_cues(P, path=None):
    for p in ([path] if path else [P.path('qa/sfx_cues.json'), P.path('data/sfx.json')]):
        if p and os.path.exists(p):
            d = json.load(open(p, encoding='utf-8'))
            if isinstance(d, list):
                d = {'sfx': d}
            d['_path'] = p
            return d
    return {'sfx': [], '_path': None}


class Project:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        p = os.path.join(self.root, 'studio.json')
        self.cfg = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

    def path(self, rel):
        return rel if os.path.isabs(rel) else os.path.join(self.root, rel)

    def songmap(self):
        p = self.path(self.cfg.get('songmap', 'data/songmap.json'))
        return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


def resolve_sound(P, cue, cache):
    """(stereo float32, meta) for a cue's sound: a recipe rendered with a stable seed, or a file."""
    name = str(cue['sound'])
    params = dict(cue.get('params') or {})
    if name in SFX.RECIPES:
        seed = int(cue.get('seed', SFX.seed_for(name, f'{float(cue["t"]):.3f}')))
        key = (name, seed, json.dumps(params, sort_keys=True))
        if key not in cache:
            cache[key] = SFX.make(name, seed, **params)
        return cache[key]
    path = P.path(name)
    if not os.path.exists(path):
        raise FileNotFoundError(f'sound "{name}" is neither a recipe ({", ".join(SFX.RECIPES)}) nor a file in the project')
    if path not in cache:
        side = SFX.sidecar_path(path)
        meta = json.load(open(side, encoding='utf-8')) if os.path.exists(side) else SFX.describe_file(path)
        if 'loudness' not in meta:
            meta = SFX.describe_file(path, meta.get('sync'))
        cache[path] = (A.load(path, sr=SR), meta)
    return cache[path]


def duck_curve(n, events):
    """Music gain in dB per sample: each (t, depth, attack, hold, release) is a trapezoid in dB;
    overlapping ducks take the deepest value."""
    g = np.zeros(n)
    for t, depth, att, hold, rel in events:
        a0, a1 = t - att, t
        h1 = t + hold
        r1 = h1 + rel
        i0, i1 = max(0, int(a0 * SR)), min(n, int(r1 * SR) + 1)
        if i1 <= i0:
            continue
        tt = np.arange(i0, i1) / SR
        shape = np.where(tt < a1, (tt - a0) / max(att, 1e-6), np.where(tt <= h1, 1.0, 1 - (tt - h1) / max(rel, 1e-6)))
        g[i0:i1] = np.minimum(g[i0:i1], -depth * np.clip(shape, 0, 1))
    return g


def ebur128(path):
    """Independent measurement with ffmpeg's ebur128 filter (reads the Summary block)."""
    p = subprocess.run([A.ffmpeg_bin(), '-hide_banner', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = p.stderr[p.stderr.rfind('Summary:'):] if 'Summary:' in p.stderr else ''
    out = {}
    for key, label in (('I', 'integrated'), ('LRA', 'lra'), ('Peak', 'truePeak')):
        for line in tail.splitlines():
            s = line.strip()
            if s.startswith(key + ':'):
                try:
                    out[label] = float(s.split(':')[1].split()[0])
                except ValueError:
                    pass
                break
    return out


def mix(P, cues_path=None, out=None, target=None, ceiling=None, verbose=True):
    cfg = P.cfg.get('mix', {})
    target = cfg.get('target', -14.0) if target is None else target
    ceiling = cfg.get('ceiling', -1.5) if ceiling is None else ceiling  # AAC adds up to ~0.5 dB of true peak
    cues = load_cues(P, cues_path)
    for i, cue in enumerate(cues.get('sfx', [])):
        try:
            float(cue['t'])
            assert cue['sound']
        except (KeyError, TypeError, ValueError, AssertionError):
            where = cue.get('from') if isinstance(cue, dict) and cue.get('from') else os.path.relpath(cues.get('_path') or 'the cues', P.root)
            raise SystemExit(f'sound cue {i + 1} from {where} needs "t" (seconds, video time) and "sound" (a recipe from "studio sfx list", '
                             f'or a file such as audio/sfx/door.wav): {json.dumps(cue, ensure_ascii=False)[:160]}')
    song_path = P.path(P.cfg['audio']) if P.cfg.get('audio') else None
    song = A.load(song_path, sr=SR) if song_path and os.path.exists(song_path) else None
    offset = float(P.cfg.get('offset', 0) or 0)
    sm = P.songmap()
    duration = cues.get('duration') or P.cfg.get('duration') or (len(song) / SR + offset if song is not None else None)
    if not duration:
        raise SystemExit('no duration: give the cues file a "duration", set it in studio.json, or set "audio"')
    n = int(round(duration * SR))
    warnings, notes = [], []
    music = np.zeros((n, 2), dtype=np.float64)
    fade_in, fade_out = float(cfg.get('fadeIn', 0) or 0), float(cfg.get('fadeOut', 0) or 0)
    excerpt = False  # the film shows only part of the song
    if song is not None:
        start = int(round(offset * SR))
        src = song[max(0, -start):]
        dst0 = max(0, start)
        k = min(len(src), n - dst0)
        music[dst0:dst0 + k] = src[:k] * 10 ** (cfg.get('music', 0.0) / 20)
        song_end = offset + len(song) / SR
        excerpt = offset < -0.5 or song_end > duration + 1.0
        if offset < -0.5:
            downs = (sm or {}).get('downbeats') or []
            near = min(downs, key=lambda d: abs(d + offset)) if downs else None
            if fade_in > 0:
                how = f', faded in over {fade_in:g} s'
            elif near is not None and abs(near + offset) <= 0.03:
                how = f', on the downbeat of bar {downs.index(near) + 1}'
            else:
                off = f' ({(-offset - near) * 1000:+.0f} ms from the nearest downbeat)' if near is not None else ''
                how = f'{off}: a hard start; begin on a downbeat, or set "mix": {{"fadeIn": 0.3}}'
                warnings.append(f'the film starts {-offset:.2f} s into the song{how}')
                how = None
            if how is not None:
                notes.append(f'the film starts {-offset:.2f} s into the song{how}')
        if song_end > duration + 1.0:
            if fade_out >= 0.3:
                notes.append(f'the song goes on {song_end - duration:.1f} s past the film; faded out over {fade_out:g} s')
            else:
                warnings.append(f'the song runs {song_end - duration:.1f} s past the end of the film (it is cut at {fmt(duration)}); end the film with the song, or fade it: "mix": {{"fadeOut": 1.5}}')
        elif song_end < duration - 0.05:
            notes.append(f'the song ends {duration - song_end:.2f} s before the film: silence after {fmt(song_end)}')
    else:
        warnings.append('no song: set "audio" in studio.json (mixing effects only)')

    beats = [b + offset for b in (sm or {}).get('beats', [])]
    fps = float(cues.get('fps') or P.cfg.get('fps') or 30)
    bus = np.zeros((n, 2), dtype=np.float64)
    ducks, rows, dropped = [], [], []
    last = {}
    cache = {}
    for i, cue in enumerate(sorted(cues.get('sfx', []), key=lambda c: float(c['t']))):
        t = float(cue['t'])
        name = str(cue['sound'])
        if name in last and t - last[name] < DEBOUNCE:
            dropped.append({'t': t, 'sound': name, 'from': cue.get('from', '')})
            continue
        last[name] = t
        x, meta = resolve_sound(P, cue, cache)
        sync = cue.get('sync') or meta.get('sync') or 'onset'
        lm = meta['landmarks'][sync]
        role = cue.get('role', meta.get('role'))
        gain_db = REF_LUFS - float(meta.get('loudness', REF_LUFS)) + float(cue.get('gain', 0.0))
        peak_db = float(20 * np.log10(np.abs(x).max() + 1e-12)) + gain_db
        if peak_db > -1.0:  # never let one sound slam the limiter
            gain_db -= peak_db + 1.0
        y = x.astype(np.float64) * 10 ** (gain_db / 20)
        pan = float(cue.get('pan', 0.0))
        if pan:
            g = (np.clip(pan, -1, 1) + 1) * np.pi / 4
            y = y * np.array([np.cos(g), np.sin(g)]) * np.sqrt(2)
        s0 = int(round((t - lm) * SR))
        a, b = max(0, s0), min(n, s0 + len(y))
        if b > a:
            bus[a:b] += y[a - s0:b - s0]
        if s0 < 0:
            notes.append(f'{name} at {fmt(t)}: starts before the film; its first {-s0 / SR:.2f} s are cut')
        if s0 + len(y) > n:
            notes.append(f'{name} at {fmt(t)}: runs past the end of the film; cut')
        if role and role != 'none':
            if role not in DUCK:
                warnings.append(f'{name} at {fmt(t)}: unknown role "{role}" (known: {", ".join(DUCK)}, none)')
            else:
                depth, att, hold, rel = DUCK[role]
                if hold is None:
                    hold = max(0.0, meta['landmarks']['tail'] - lm)
                ducks.append((t, depth, att, hold, rel))
        off = A.beat_offset(beats, t)
        rows.append({'t': round(t, 4), 'frame': int(round(t * fps)), 'sound': name, 'sync': sync, 'landmark': round(lm, 4),
                     'start': round(t - lm, 4), 'gain': round(gain_db, 1), 'role': role or '', 'beatOffsetMs': None if off is None else round(off * 1000, 1),
                     'beatOffsetFrames': None if off is None else round(off * fps, 2), 'from': cue.get('from', ''), 'why': cue.get('why', '')})
        if not cue.get('why'):
            warnings.append(f'{name} at {fmt(t)} ({cue.get("from", "?")}): no "why" — every sound needs a reason')

    names = [r['sound'] for r in rows]
    cuts = cues.get('cuts') or []
    on_cut = [r['sound'] for r in rows if any(abs(r['t'] - c) < 0.05 for c in cuts)]
    if len(cuts) >= 4 and on_cut and len(on_cut) >= 0.6 * len(cuts):
        top = max(set(on_cut), key=on_cut.count)
        if on_cut.count(top) >= 0.6 * len(cuts):
            warnings.append(f'"{top}" sits on {on_cut.count(top)} of {len(cuts)} cuts — the same sound on every cut tires quickly; keep some cuts silent')
    for k in range(len(rows)):
        dense = [r for r in rows if 0 <= r['t'] - rows[k]['t'] < 1.0]
        if len(dense) > 6:
            warnings.append(f'{len(dense)} sounds within 1 s from {fmt(rows[k]["t"])}: too dense to read; keep the first, the last and the strongest')
            break

    g = duck_curve(n, ducks)
    music_d = music * (10 ** (g / 20))[:, None]
    pre = music_d + bus
    # Fades: "mix": {"fadeIn": s, "fadeOut": s} for excerpts; otherwise only short ones where
    # sound is cut off by either end of the film, so the edit does not click.
    for seconds, at_start, minimum in ((fade_in, True, 0.005), (fade_out, False, 0.012)):
        m = int(max(seconds, minimum) * SR)
        if not 0 < m < n:
            continue
        seg = pre[:m] if at_start else pre[-m:]
        if seconds > 0 or np.abs(seg).max() > 1e-4:
            x = np.linspace(0, np.pi / 2, m)
            seg *= ((np.sin(x) if at_start else np.cos(x)) ** 2)[:, None]
    if not np.abs(pre).max() > 0:
        raise SystemExit('the mix is silent')
    final = A.normalize(pre, SR, target, ceiling)
    k = float(np.sqrt(np.sum(final.astype(np.float64) ** 2) / max(np.sum(pre ** 2), 1e-20)))  # overall gain applied
    out = P.path(out or 'audio/mix.wav')
    A.save_wav(out, final, SR, bits=24)
    base = os.path.splitext(out)[0]
    A.save_wav(base + '_sfx.wav', np.clip(bus * k, -1, 1), SR, bits=24)
    A.save_wav(base + '_music.wav', np.clip(music_d * k, -1, 1), SR, bits=24)

    lufs = A.integrated_lufs(final, SR)
    tp = A.true_peak_db(final, SR)
    lra = A.loudness_range(final, SR)
    st, starts, _ = A.block_loudness(final, SR, block=3.0, hop=0.25)
    loud_t = float(starts[int(np.argmax(st))] + 1.5) if len(st) else 0.0
    secs = [(s['start'] + offset, s['end'] + offset, s.get('kind') or s.get('label', '')) for s in (sm or {}).get('sections', [])]
    sec_at = next((lab for a, b, lab in secs if a <= loud_t < b), '')
    if secs and not excerpt:  # an excerpt is usually one chorus: nothing to build towards
        chorus = [(a, b) for a, b, lab in secs if lab == 'chorus']
        if chorus and not any(a <= loud_t < b for a, b in chorus[-1:]):
            warnings.append(f'the loudest moment is at {fmt(loud_t)} ({sec_at or "?"}), not in the last chorus: the biggest story moment should be the loudest')
    L, R = final[:, 0].astype(np.float64), final[:, 1].astype(np.float64)
    corr = float(np.corrcoef(L, R)[0, 1]) if L.std() > 0 and R.std() > 0 else 1.0
    if corr < 0.3:
        warnings.append(f'stereo correlation {corr:.2f} < 0.3: parts may cancel on a phone speaker (mono)')
    measured = ebur128(out) if A.have_ffmpeg() else {}
    qa = P.path('qa')
    os.makedirs(qa, exist_ok=True)
    markers = [(r['t'], r['sound']) for r in rows]
    plots.waveform_png(os.path.join(qa, 'mix_wave.png'), final, SR, title=f'mix  {lufs:.1f} LUFS  TP {tp:.1f} dBTP  LRA {lra:.1f} LU  (amber: short-term loudness)',
                       markers=markers, bands=secs, target=target)
    plots.spectrogram_png(os.path.join(qa, 'mix_spec.png'), final, SR, title='mix spectrogram (log frequency)', bands=secs)
    report = {'out': os.path.relpath(out, P.root).replace('\\', '/'), 'duration': round(duration, 3), 'integrated': round(lufs, 2), 'truePeak': round(tp, 2),
              'lra': round(lra, 1), 'ffmpeg': measured, 'loudestAt': round(loud_t, 2), 'loudestSection': sec_at, 'stereoCorrelation': round(corr, 2),
              'cues': rows, 'debounced': dropped, 'ducks': len(ducks), 'warnings': warnings, 'notes': notes, 'cuesFile': cues.get('_path')}
    with open(os.path.join(qa, 'mix_report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    md = ['# Mix report', '', f'- file: `{report["out"]}` ({duration:.2f} s)',
          f'- loudness: {lufs:.1f} LUFS integrated (target {target}), true peak {tp:.1f} dBTP (ceiling {ceiling}), LRA {lra:.1f} LU'
          + (f'; ffmpeg ebur128 says {measured.get("integrated")} LUFS, {measured.get("truePeak")} dBTP' if measured else ''),
          f'- loudest moment: {fmt(loud_t)}' + (f' ({sec_at})' if sec_at else ''), f'- stereo correlation: {corr:.2f}',
          f'- listen in this order: `{os.path.basename(base)}_sfx.wav` → `{os.path.basename(base)}_music.wav` → `{os.path.basename(out)}` → the final MP4', '']
    if warnings:
        md += ['## Warnings', ''] + [f'- {w}' for w in warnings] + ['']
    if notes:
        md += ['## Notes', ''] + [f'- {w}' for w in notes] + ['']
    md += ['## Sounds', '', '| time | frame | sound | sync | start | gain dB | duck | beat offset | from | why |', '|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        bo = '' if r['beatOffsetMs'] is None else f'{r["beatOffsetMs"]:+.0f} ms ({r["beatOffsetFrames"]:+.1f} f)'
        md.append(f'| {fmt(r["t"])} | {r["frame"]} | {r["sound"]} | {r["sync"]} | {fmt(r["start"])} | {r["gain"]:+.1f} | {r["role"]} | {bo} | {r["from"]} | {r["why"]} |')
    if dropped:
        md += ['', f'Dropped {len(dropped)} repeats closer than {DEBOUNCE} s: ' + ', '.join(f'{d["sound"]} {fmt(d["t"])}' for d in dropped[:20])]
    md += ['', '![waveform](mix_wave.png)', '', '![spectrogram](mix_spec.png)', '',
           'This mix was checked by measurement only. A person still has to listen to it on headphones and on a phone speaker.']
    with open(os.path.join(qa, 'mix_report.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(md) + '\n')
    if verbose:
        print(f'  {len(rows)} sounds ({len(dropped)} repeats dropped), {len(ducks)} ducks → {report["out"]}')
        print(f'  {lufs:.1f} LUFS, true peak {tp:.1f} dBTP, LRA {lra:.1f} LU' + (f' (ffmpeg: {measured.get("integrated")} LUFS, {measured.get("truePeak")} dBTP)' if measured else '')
              + f'; loudest at {fmt(loud_t)}' + (f' ({sec_at})' if sec_at else ''))
        for w in warnings:
            print(f'  ! {w}')
        for w in notes:
            print(f'  · {w}')
        print('  report: qa/mix_report.md (waveform qa/mix_wave.png, spectrogram qa/mix_spec.png)')
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description='Mix a film\'s song and sound effects.')
    ap.add_argument('project')
    ap.add_argument('--cues', help='cue file (default qa/sfx_cues.json, then data/sfx.json)')
    ap.add_argument('--out', help='default audio/mix.wav')
    ap.add_argument('--target', type=float, help='integrated loudness, LUFS (default -14)')
    ap.add_argument('--ceiling', type=float, help='true-peak ceiling of the WAV, dBTP (default -1.5, so the AAC encode stays under -1)')
    a = ap.parse_args(argv)
    mix(Project(a.project), a.cues, a.out, a.target, a.ceiling)
    return 0


if __name__ == '__main__':
    sys.exit(main())
