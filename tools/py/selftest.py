#!/usr/bin/env python3
"""Self-tests for the Python tools, against signals whose answers are known.

    python tools/py/selftest.py            # quick set (about half a minute)
    python tools/py/selftest.py --full     # also the longer songs: sections, labels, impacts, swing
    python tools/py/selftest.py -k beats   # only tests whose name contains "beats"
    python tools/py/selftest.py --keep out/selftest   # keep the generated audio for listening

The songs come from music.py, which writes down where it put every beat, hit and section; the
analyzer has to find them again. Loudness is checked against EBU Tech 3341 test signals.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io as A  # noqa: E402

TESTS = []


def test(full=False):
    def deco(fn):
        TESTS.append((fn.__name__, fn, full))
        return fn
    return deco


class Check:
    """Collects named measurements and their limits; fails the test if any limit is missed."""

    def __init__(self):
        self.rows, self.bad = [], []

    def __call__(self, name, value, ok, limit):
        self.rows.append(f'{name} {value} ({limit})')
        if not ok:
            self.bad.append(f'{name} = {value}, wanted {limit}')

    def done(self):
        if self.bad:
            raise AssertionError('; '.join(self.bad))
        return '; '.join(self.rows)


def match(est, ref, tol):
    """Greedy one-to-one matching within +-tol: F-measure, precision, recall, signed errors."""
    est, ref = np.asarray(est, float), np.asarray(ref, float)
    used = np.zeros(len(est), bool)
    errs = []
    for r in ref:
        if not len(est):
            break
        d = est - r
        cand = np.flatnonzero((np.abs(d) <= tol) & ~used)
        if len(cand):
            k = cand[np.argmin(np.abs(d[cand]))]
            used[k] = True
            errs.append(d[k])
    hits = len(errs)
    p, r = hits / max(len(est), 1), hits / max(len(ref), 1)
    return 2 * p * r / max(p + r, 1e-9), p, r, np.array(errs)


# ─── Songs ────────────────────────────────────────────────────────────────────────────────

_cache = {}


def song(name, plan, *, seed=7, drift=0.0, stems=False, **overrides):
    """Render a music.py song once per run; returns (wav path, truth, stems folder or None)."""
    if name in _cache:
        return _cache[name]
    import music
    p = json.loads(json.dumps(music.PLANS[plan]))
    p.update(overrides)
    mix, truth, parts = music.render(p, seed, 0.5, drift, want_stems=stems)
    path = os.path.join(WORK, name + '.wav')
    A.save_wav(path, mix, music.SR, 24)
    folder = None
    if parts:
        folder = os.path.join(WORK, name + '_stems')
        for k, y in parts.items():
            A.save_wav(os.path.join(folder, k + '.wav'), y, music.SR, 24)
    with open(os.path.join(WORK, name + '.truth.json'), 'w', encoding='utf-8') as f:
        json.dump(truth, f)
    _cache[name] = (path, truth, folder)
    return _cache[name]


_maps = {}


def analysis(name, plan, stems=False, **kw):
    import analyze_song as AS
    hints = {k: kw.pop(k) for k in ('bpm_hint', 'first_downbeat') if k in kw}
    if 'section_bars' in kw:  # --sections; a bare "sections" is the music.py plan's
        hints['sections'] = kw.pop('section_bars')
    key = (name, stems, tuple(sorted(hints.items())))
    if key not in _maps:
        path, truth, folder = song(name, plan, stems=stems, **kw)
        _maps[key] = (AS.analyze(path, stems=folder if stems else None, verbose=False, **hints), truth)
    return _maps[key]


def beat_checks(c, sm, truth, tol_ms=15):
    c('tempo', f"{sm['bpm']:.2f} BPM vs {truth['bpm']}", abs(sm['bpm'] / truth['bpm'] - 1) <= 0.01, 'within 1%')
    f, p, r, e = match(sm['beats'], truth['beats'], 0.07)
    c('beat F', f'{f:.3f}', f >= 0.95, '>= 0.95 at +-70 ms')
    med = float(np.median(np.abs(e))) * 1000 if len(e) else 999
    c('beat |error| median', f'{med:.1f} ms', med <= tol_ms, f'<= {tol_ms} ms')
    bias = float(np.median(e)) * 1000 if len(e) else 999
    c('beat bias', f'{bias:+.1f} ms', abs(bias) <= 6, '|bias| <= 6 ms (LATENCY calibration)')
    f, p, r, e = match(sm['downbeats'], truth['downbeats'], 0.07)
    c('downbeat F', f'{f:.3f}', f >= 0.9, '>= 0.9')
    c('beats per bar', sm['beatsPerBar'], sm['beatsPerBar'] == truth['beatsPerBar'], f"= {truth['beatsPerBar']}")


def section_f(sm, truth):
    bar = 60 / truth['bpm'] * truth['beatsPerBar']
    return match([s['start'] for s in sm['sections']][1:], [s['start'] for s in truth['sections']][1:], bar * 0.5)[0]


def event_f(sm, truth, kind):
    return match([e[0] for e in sm['events'][kind]], truth['events'][kind], 0.05)[0]


# ─── Loudness ─────────────────────────────────────────────────────────────────────────────

@test()
def loudness_ebu3341():
    """EBU Tech 3341 case 1 and 2: 1 kHz stereo sine at -23 and -33 dBFS reads -23.0 / -33.0 LUFS."""
    c = Check()
    t = np.arange(20 * A.SR) / A.SR
    for level in (-23.0, -33.0):
        x = np.sin(2 * np.pi * 1000 * t) * 10 ** (level / 20)
        lufs = A.integrated_lufs(np.stack([x, x], axis=1), A.SR)
        c(f'sine {level:g} dBFS', f'{lufs:.2f} LUFS', abs(lufs - level) <= 0.1, f'{level:g} +- 0.1')
    # gating: 10 s at -36, 60 s at -23, 10 s at -36 integrates to -23.0 (case 3 shape)
    seg = lambda dur, lv: np.sin(2 * np.pi * 1000 * np.arange(int(dur * A.SR)) / A.SR) * 10 ** (lv / 20)
    x = np.concatenate([seg(10, -36), seg(60, -23), seg(10, -36)])
    lufs = A.integrated_lufs(np.stack([x, x], axis=1), A.SR)
    c('gated -36/-23/-36', f'{lufs:.2f} LUFS', abs(lufs + 23) <= 0.1, '-23 +- 0.1')
    return c.done()


@test()
def true_peak_and_limiter():
    c = Check()
    rng = np.random.default_rng(1)
    x = rng.normal(size=(10 * A.SR, 2)) * 0.03
    x[::A.SR // 3] = 0.9  # sparse clicks: reaching -14 LUFS pushes them far over full scale
    y = A.normalize(x, A.SR, -14.0, -1.0)
    lufs, tp = A.integrated_lufs(y, A.SR), A.true_peak_db(y, A.SR)
    c('normalized loudness', f'{lufs:.2f} LUFS', abs(lufs + 14) <= 0.2, '-14 +- 0.2')
    c('true peak', f'{tp:.2f} dBTP', tp <= -0.95, '<= -1.0 (+0.05)')
    # an inter-sample peak: fs/4 sine at 45 degrees has sample peaks 3 dB under the true peak
    n = np.arange(4800)
    s = np.sin(2 * np.pi * n / 4 + np.pi / 4) * 0.5
    c('inter-sample peak', f'{A.true_peak_db(s, A.SR):.2f} dBTP', abs(A.true_peak_db(s, A.SR) - 20 * np.log10(0.5)) <= 0.3, '-6.02 +- 0.3')
    return c.done()


# ─── Analyzer ─────────────────────────────────────────────────────────────────────────────

@test()
def beats_4_4_with_stop():
    """120 BPM, 4/4: beats, downbeats, the one-beat stop before the chorus, events from the mix."""
    sm, truth = analysis('short', 'short', stems=True)
    sm_mix = analysis('short', 'short')[0]
    c = Check()
    beat_checks(c, sm_mix, truth)
    st = sm_mix['stops']
    ok = len(st) == 1 and all(abs(a - b) <= 0.06 for a, b in zip((st[0]['start'], st[0]['end']), truth['stops'][0])) if st else False
    c('stop', st and f"{st[0]['start']:.3f}-{st[0]['end']:.3f} vs {truth['stops'][0][0]:.3f}-{truth['stops'][0][1]:.3f}", ok, 'one stop, both ends within 60 ms')
    imp = [i['t'] for i in sm_mix['impacts']]
    c('impact after the stop', imp, any(abs(t - truth['impacts'][0]) <= 0.06 for t in imp), f"near {truth['impacts'][0]:.3f}")
    for kind, lim in (('kick', 0.8), ('hat', 0.8)):
        f = event_f(sm_mix, truth, kind)
        c(f'{kind} F (mix)', f'{f:.2f}', f >= lim, f'>= {lim}')
    return c.done()


@test()
def events_from_stems():
    """With separated stems the events are precise: drums by NMF on the drum stem, vocal onsets."""
    sm, truth = analysis('short', 'short', stems=True)
    c = Check()
    c('event source', sm['eventSource'], all(v == 'stems' for v in sm['eventSource'].values()), 'all from stems')
    for kind, lim in (('kick', 0.85), ('snare', 0.8), ('hat', 0.8), ('vocal', 0.85)):
        f = event_f(sm, truth, kind)
        c(f'{kind} F', f'{f:.2f}', f >= lim, f'>= {lim}')
    return c.done()


@test()
def meter_3_4():
    sm, truth = analysis('waltz', 'short', beatsPerBar=3, bpm=96, seed=3)
    c = Check()
    beat_checks(c, sm, truth)
    return c.done()


WALTZ_STOP = {'bpm': 112, 'key': 'F#', 'mode': 'minor', 'beatsPerBar': 3, 'sections': [
    {'name': 'intro', 'bars': 4, 'energy': 2, 'progression': [1, 1, 7, 7]},
    {'name': 'verse', 'bars': 8, 'energy': 4, 'progression': [1, 7, 6, 5]},
    {'name': 'pre', 'bars': 2, 'energy': 6, 'build': True, 'stop': True, 'progression': [4, 7]},
    {'name': 'chorus', 'bars': 8, 'energy': 7, 'impact': True, 'progression': [1, 4, 7, 3, 6, 2, 5, 1]},
    {'name': 'outro', 'bars': 2, 'energy': 2, 'progression': [6, 1]}]}


@test()
def waltz_stop_sections_and_stem_events():
    """3/4 with a two-bar pre-chorus that stops for a beat, the shape that once put the chorus a bar
    late without a word, turned the snare on beat 3 into kicks and the vocal's reverb into onsets."""
    sm, truth = analysis('waltz_stop', 'short', stems=True, seed=4, **WALTZ_STOP)
    c = Check()
    chorus = next(s['start'] for s in truth['sections'] if s['name'] == 'chorus')
    err = min(abs(s['start'] - chorus) for s in sm['sections'])
    c('chorus start', f'{err * 1000:.0f} ms off', err <= 0.06, 'a section starts within 60 ms of the true chorus')
    f = section_f(sm, truth)
    c('section boundaries F', f'{f:.2f}', f >= 0.85, '>= 0.85 within half a bar')
    c('notes', sm['notes'], any('after a stop' in n for n in sm['notes']), 'says the boundary follows the stop')
    for kind, lim in (('kick', 0.95), ('vocal', 0.9)):
        f, p, r, e = match([x[0] for x in sm['events'][kind]], truth['events'][kind], 0.05)
        c(f'{kind} F / precision (stems)', f'{f:.2f} / {p:.2f}', f >= lim and p >= 0.97, f'F >= {lim}, precision >= 0.97')
    return c.done()


@test()
def stop_off_the_bar_line_is_reported():
    """Bars forced a beat late: the stop now ends on beat 4, where no section can start. Say so."""
    _, truth, _ = song('short', 'short', stems=True)  # the first render of a name decides its stems
    sm, _ = analysis('short', 'short', first_downbeat=truth['downbeats'][0] + 60 / truth['bpm'])
    c = Check()
    end = sm['stops'][0]['end'] if sm['stops'] else 0.0
    said = [w for w in sm['warnings'] if w.startswith('SECTION MISMATCH') and f'{end:.3f} s' in w and 'not on a bar line' in w]
    c('warning', said, len(said) == 1 and abs(end - truth['stops'][0][1]) <= 0.06, f"one SECTION MISMATCH at the stop's end ({truth['stops'][0][1]:.3f} s)")
    return c.done()


@test()
def sections_given_by_bar_number():
    """Sections really start at bars 1, 3, 7, 9 and 15; --sections 1,3,10,15 is used as given, and
    the notes say so, where the analysis on its own puts them, and that the band comes back after
    the stop (bar 9) inside a given section."""
    import analyze_song as AS
    song('short', 'short', stems=True)  # the first render of a name decides its stems
    sm, _ = analysis('short', 'short', section_bars=(1, 3, 10, 15))
    c = Check()
    got = [s['start'] for s in sm['sections']]
    want = [sm['downbeats'][b - 1] for b in (1, 3, 10, 15)]
    c('section starts', got, len(got) == 4 and all(abs(a - b) < 1e-3 for a, b in zip(got, want)), 'the downbeats of bars 1, 3, 10 and 15')
    first = sm['notes'][0] if sm['notes'] else ''
    c('first note', first, 'as given with --sections' in first and 'on its own the analysis puts them at bars' in first, 'says the bars were given and where the analysis puts them')
    inside = [n for n in sm['notes'] if '(bar 9)' in n and 'given at bar 3' in n]
    c('stop inside a section', inside, len(inside) == 1 and 'add 9 to --sections' in inside[0], 'one note on bar 9, 6 bars into the section given at bar 3')
    c('no in-section warnings', sm['warnings'], not any('into the section' in w for w in sm['warnings']), 'the given sections are not argued with')
    try:
        AS.given_edges([1, 99], 16)
        said = 'no error'
    except AS.SectionsError as e:
        said = str(e)
    c('bar outside the song', said, '99' in said and '1-16' in said, 'an error naming bar 99 and bars 1-16')
    c('bar list', AS.bar_list('1, 5 13'), AS.bar_list('1, 5 13') == [1, 5, 13], '"1, 5 13" reads as bars 1, 5, 13')
    return c.done()


@test()
def click_preview_marks_sections():
    """The click preview rings a bell where a section starts; after other bar lines it is quiet."""
    import analyze_song as AS
    sr, period = 48000, 0.6
    beats = 0.3 + period * np.arange(32)
    downbeats, starts = beats[::4], beats[[0, 8, 24]]
    y = AS.click_signal(int((beats[-1] + 1.0) * sr), sr, beats, downbeats, starts)
    ring = lambda t: float(np.sqrt(np.mean(y[int((t + 0.1) * sr):int((t + 0.4) * sr)] ** 2)))
    bell = min(ring(t) for t in starts)
    other = max(ring(t) for t in downbeats if t not in starts)
    c = Check()
    c('level 0.1-0.4 s after a bar line', f'section start {bell:.3f}, other bars {other:.4f} RMS', bell >= 0.05 and other <= 0.001,
      'a section start still rings (>= 0.05), other bars are quiet (<= 0.001)')
    return c.done()


@test()
def drift_is_followed_and_reported():
    """A song that speeds up and slows down by +-4 %: beats must follow it and DRIFT must be said."""
    sm, truth = analysis('drift', 'short', drift=0.04, seed=5)
    c = Check()
    f, p, r, e = match(sm['beats'], truth['beats'], 0.07)
    c('beat F', f'{f:.3f}', f >= 0.95, '>= 0.95')
    c('drift warning', sm['drift']['maxMs'], any(w.startswith('DRIFT') for w in sm['warnings']), 'DRIFT reported')
    return c.done()


@test()
def songmap_contract():
    """The fields the engine and the docs rely on are present and well-formed."""
    sm, _ = analysis('short', 'short')
    c = Check()
    need = ['bpm', 'tempo', 'beatsPerBar', 'beats', 'downbeats', 'phase', 'drift', 'sections', 'stops', 'impacts', 'events', 'envelopes', 'warnings', 'notes']
    c('fields', 'present', all(k in sm for k in need), ', '.join(need))
    env = sm['envelopes']
    n = int(np.ceil(sm['duration'] * env['fps']))
    c('envelopes', f"{env['fps']} fps x {n}", all(len(env[k]) == n and max(env[k]) <= env['scale'] and min(env[k]) >= 0 for k in ('rms', 'low', 'mid', 'high', 'onset')), 'rms/low/mid/high/onset, 0..scale')
    c('beats increasing', 'ok', bool(np.all(np.diff(sm['beats']) > 0)), 'strictly increasing')
    secs = sm['sections']
    c('sections tile the song', len(secs), all(abs(a['end'] - b['start']) < 1e-6 for a, b in zip(secs[:-1], secs[1:])), 'end of one = start of next')
    c('section fields', 'ok', all({'start', 'end', 'label', 'energy', 'bars', 'kind'} <= set(s) for s in secs), 'start end label energy bars kind')
    c('event pairs', 'ok', all(all(len(e) == 2 and 0 <= e[1] <= 1 for e in v) for v in sm['events'].values()), '[time, strength 0-1]')
    json.dumps(sm)  # serializable
    return c.done()


@test(full=True)
def sections_pop():
    sm, truth = analysis('pop', 'pop')
    c = Check()
    beat_checks(c, sm, truth)
    f = section_f(sm, truth)
    c('section boundaries F', f'{f:.2f}', f >= 0.8, '>= 0.8 within half a bar')
    imp = [i['t'] for i in sm['impacts']]
    for t in truth['impacts']:
        c(f'impact {t:.2f}', imp, any(abs(x - t) <= 0.06 for x in imp), 'found within 60 ms')
    return c.done()


@test(full=True)
def sections_and_labels_full_song():
    """A 64-bar song: verse / pre / chorus x3. Repeated choruses must share a letter."""
    sm, truth = analysis('full', 'full', seed=11)
    c = Check()
    beat_checks(c, sm, truth)
    f = section_f(sm, truth)
    c('section boundaries F', f'{f:.2f}', f >= 0.85, '>= 0.85')
    starts = {round(s['start'], 1): s['label'].rstrip("'") for s in sm['sections']}
    chorus_letters = {starts.get(round(s['start'], 1)) for s in truth['sections'] if s['name'] == 'chorus'}
    c('chorus letters', chorus_letters, len(chorus_letters) == 1 and None not in chorus_letters, 'one letter for all choruses')
    loud = [s['energy'] for s in sm['sections'] if s['kind'] == 'chorus']
    quiet = [s['energy'] for s in sm['sections'] if s['kind'] in ('intro', 'outro')]
    c('energy order', f'chorus {loud} / intro+outro {quiet}', bool(loud and quiet and min(loud) > max(quiet)), 'choruses above intro and outro')
    return c.done()


@test(full=True)
def swing_and_slow():
    c = Check()
    for name, plan, kw in (('chill', 'chill', {}), ('slow', 'chill', {'bpm': 68, 'seed': 4})):
        sm, truth = analysis(name, plan, **kw)
        f, p, r, e = match(sm['beats'], truth['beats'], 0.07)
        c(f'{name} beat F', f'{f:.3f}', f >= 0.97, '>= 0.97')
        c(f'{name} tempo', f"{sm['bpm']:.2f}", abs(sm['bpm'] / truth['bpm'] - 1) <= 0.01, 'within 1%')
    return c.done()


@test(full=True)
def fast_tempo_is_flagged_or_right():
    """174 BPM: half time is a fair reading, but then it must say AMBIGUOUS TEMPO; --bpm fixes it."""
    sm, truth = analysis('fast', 'drive', bpm=174, seed=9)
    c = Check()
    right = abs(sm['bpm'] / truth['bpm'] - 1) <= 0.01
    flagged = any(w.startswith('AMBIGUOUS TEMPO') for w in sm['warnings'])
    c('tempo', f"{sm['bpm']:.1f}", right or flagged, 'right, or reported as ambiguous')
    sm2, _ = analysis('fast', 'drive', bpm=174, seed=9, bpm_hint=174)
    f = match(sm2['beats'], truth['beats'], 0.07)[0]
    c('with --bpm 174', f'beat F {f:.3f}', f >= 0.95, '>= 0.95')
    return c.done()


# ─── Fonts ────────────────────────────────────────────────────────────────────────────────

FONT_CANDIDATES = [
    'C:/Windows/Fonts/NotoSansTC-VF.ttf', 'C:/Windows/Fonts/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf', '/Library/Fonts/NotoSansTC-VariableFont_wght.ttf',
    os.path.expanduser('~/Library/Fonts/NotoSansTC-VariableFont_wght.ttf'),
]


@test()
def fonts_subset_keeps_shapes():
    """A subset draws exactly the asked characters, with the same advance widths, in fewer bytes."""
    import fonts as F
    src = next((p for p in FONT_CANDIDATES if os.path.exists(p) and F.Font(p).outlines == 'TrueType' and F.Font(p).embedding[1]), None)
    if not src:
        return 'skipped: no subsettable TrueType font (Noto Sans TC, Noto Sans or DejaVu Sans) found'
    font = F.Font(src)
    text = 'Hello, 光影！' if not font.missing('光影') else 'Hello, world!'
    out = os.path.join(WORK, 'subset.ttf')
    info = F.subset(src, text, out, ascii=False)
    sub = F.Font(out)
    c = Check()
    c('characters kept', info['characters'], not sub.missing(text.replace(' ', '')), f'all of {text!r}')
    c('others dropped', 'Z' in sub.cmap and 'kept' or 'gone', ord('Z') not in sub.cmap, '"Z" not in the subset')
    w0, w1 = font.width(text, 100), sub.width(text, 100)
    c('advance widths', f'{w1:.2f} vs {w0:.2f}', abs(w0 - w1) < 0.01, 'equal')
    c('size', f"{info['bytes'] / 1024:.0f} KB of {info['sourceBytes'] / 1024:.0f} KB", info['bytes'] < info['sourceBytes'] / 4, 'under a quarter')
    c('family', sub.family, sub.family == font.family, font.family)
    return c.done()


# ─── Lyrics ───────────────────────────────────────────────────────────────────────────────

def tmp_project(name, cfg, files=None):
    root = os.path.join(WORK, name)
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(os.path.join(root, 'data'), exist_ok=True)
    with open(os.path.join(root, 'studio.json'), 'w', encoding='utf-8') as f:
        json.dump({'name': name, **cfg}, f, ensure_ascii=False)
    for rel, body in (files or {}).items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(body if isinstance(body, str) else json.dumps(body, ensure_ascii=False))
    return root


@test()
def lyrics_lrc_import_and_export():
    """LRC with an offset tag, end marks, word stamps and a translation line → lines → SRT in film time."""
    import lyrics as LY
    lrc = ('[ti:test]\n[offset:+100]\n[00:01.00]第一句\n[00:03.50]\n'
           '[00:04.00]<00:04.00>Hello <00:04.50>world<00:05.20>\n[00:06.00]第三句\n[00:06.00]Third line\n'
           '[00:08.00]<00:08.00>光<00:08.40>影<00:08.90>\n')
    entries, warns = LY.parse_lrc(lrc, dupes='translation')
    lines = LY.finish(entries, duration=12)
    c = Check()
    c('lines', len(lines), len(lines) == 4, '4 (the translation joins line 3)')
    c('offset tag', f"{lines[0]['start']:.3f}", abs(lines[0]['start'] - 0.9) < 1e-6, '0.900 (+100 ms moves lyrics earlier)')
    c('end mark', f"{lines[0]['end']:.3f}", abs(lines[0]['end'] - 3.4) < 1e-6, '3.400')
    w = lines[1]['chars']
    c('word stamps', f"{w[0]['start']:.2f}/{w[6]['start']:.2f}", abs(w[0]['start'] - 3.9) < 1e-6 and w[6]['c'] == 'w' and abs(w[6]['start'] - 4.4) < 1e-6, 'Hello 3.90, world 4.40')
    k = lines[3]['chars']
    c('character stamps', f"{k[0]['start']:.2f}/{k[1]['start']:.2f} est {k[0]['est']}", abs(k[1]['start'] - 8.3) < 1e-6 and not k[0]['est'] and not k[1]['est'], '影 at 8.30, measured (not estimated)')
    c('translation', lines[2]['translation'], lines[2]['translation'] == 'Third line', 'Third line')
    c('estimated end', lines[2].get('endEst'), lines[2].get('endEst') is True and not lines[0].get('endEst'), 'a guessed end is marked, a measured one not')
    root = tmp_project('lyr', {'offset': -0.5, 'width': 1920, 'height': 1080})
    LY.write_lyrics(os.path.join(root, 'data', 'lyrics.json'), {'lines': lines})
    out = os.path.join(root, 'out', 'subs.srt')
    LY.main(['export', root, '--format', 'srt', '--out', out])
    back, _ = LY.parse_srt(open(out, encoding='utf-8').read(), two_line='translation')
    c('srt in film time', f"{back[0]['start']:.3f}", abs(back[0]['start'] - 0.4) < 0.0015, '0.400 (song 0.900 + offset -0.5)')
    c('srt translation', back[2].get('translation'), back[2].get('translation') == 'Third line', 'second text line')
    return c.done()


@test()
def lyrics_check_on_an_excerpt():
    """In an excerpt only the lines inside the film get reading-time warnings."""
    import lyrics as LY
    line = lambda i, a, b, t: {'i': i, 'start': a, 'end': b, 'text': t, 'translation': '', 'chars': LY.estimate_chars(t, a, b)}
    data = {'lines': [line(0, 5.0, 5.3, '早'), line(1, 22.0, 22.3, '中'), line(2, 40.0, 40.3, '晚')]}
    root = tmp_project('excerpt', {'offset': -20, 'duration': 10, 'width': 1080, 'height': 1920}, {'data/lyrics.json': data})
    r = LY.check(LY.Project(root), verbose=False)
    c = Check()
    short_lines = [w for w in r['warnings'] if 'only' in w]
    c('warned lines', short_lines, len(short_lines) == 1 and 'line 2' in short_lines[0] and '(film 00:02.00)' in short_lines[0], 'only line 2, with its film time')
    c('note', r['info'], any('1 of 3 lines are in the film' in i for i in r['info']), 'says how many lines are in the film')
    return c.done()


# ─── Sound ────────────────────────────────────────────────────────────────────────────────

@test()
def sfx_recipes_have_landmarks():
    """Every recipe renders finite stereo audio under full scale with onset <= peak <= end."""
    import sfx as X
    c = Check()
    bad = []
    for k in X.RECIPES:
        x, meta = X.make(k, 1)
        lm = meta['landmarks']
        ok = (np.isfinite(x).all() and x.ndim == 2 and x.shape[1] == 2 and np.abs(x).max() <= 1.0
              and 0 <= lm['onset'] <= lm['peak'] <= lm['end'] <= meta['duration'] + 1e-6 and meta['sync'] in ('onset', 'peak', 'end'))
        if not ok:
            bad.append(k)
    c('recipes', f'{len(X.RECIPES) - len(bad)}/{len(X.RECIPES)} well-formed', not bad, 'all' + (f' (bad: {", ".join(bad)})' if bad else ''))
    return c.done()


@test()
def mix_places_ducks_and_fades():
    """An excerpt with one whoosh: −14 LUFS, true peak under the ceiling, the whoosh's peak on its
    cue, the music ducked under it, and a fade-out to silence at the cut."""
    import mix as M
    import sfx as X
    wav, truth, _ = song('short', 'short')
    cue_t, offset, dur = 6.0, -8.0, 12.0
    root = tmp_project('mix', {'audio': wav.replace('\\', '/'), 'duration': dur, 'offset': offset,
                               'mix': {'target': -14, 'ceiling': -1.5, 'fadeOut': 0.8}},
                       {'qa/sfx_cues.json': {'duration': dur, 'fps': 30, 'cuts': [], 'sfx': [{'t': cue_t, 'sound': 'whoosh', 'why': 'test', 'from': 'S01'}]}})
    P = M.Project(root)
    rep = M.mix(P, cues_path=os.path.join(root, 'qa', 'sfx_cues.json'), verbose=False)
    out = A.load(os.path.join(root, 'audio', 'mix.wav'))
    fx = A.load(os.path.join(root, 'audio', 'mix_sfx.wav'))
    mus = A.load(os.path.join(root, 'audio', 'mix_music.wav'))
    raw = A.load(wav)
    c = Check()
    lufs, tp = A.integrated_lufs(out), A.true_peak_db(out)
    c('loudness', f'{lufs:.2f} LUFS', abs(lufs + 14) <= 0.3, '-14 +- 0.3')
    c('true peak', f'{tp:.2f} dBTP', tp <= -1.45, '<= -1.5 (+0.05)')
    env = np.convolve(np.abs(fx).max(axis=1), np.ones(240) / 240, 'same')
    peak_t = np.argmax(env) / A.SR
    lm = X.make('whoosh', 1)[1]['landmarks']
    c('whoosh peak on the cue', f'{peak_t:.3f} s', abs(peak_t - cue_t) <= 0.04, f'{cue_t} +- 40 ms (sync on its peak)')
    seg = lambda x, a, b: float(np.sqrt(np.mean(x[int(a * A.SR):int(b * A.SR)] ** 2)) + 1e-12)
    ratio = lambda a, b: seg(mus, a, b) / seg(raw, a - offset, b - offset)
    duck = 20 * np.log10(ratio(cue_t - 0.02, cue_t + 0.1) / ratio(2.0, 3.0))
    c('duck under the whoosh', f'{duck:+.1f} dB', duck <= -2.5, '<= -2.5 dB (transition role: about -4)')
    tail = 20 * np.log10(seg(out, dur - 0.02, dur))
    c('fade-out', f'{tail:.0f} dBFS in the last 20 ms', tail <= -50, '<= -50')
    c('notes', rep['notes'][:2], any('faded out' in n for n in rep['notes']), 'reports the fade')
    return c.done()


@test()
def beat_grid_counts_on_past_the_ends():
    """Mix and QA measure sounds and cuts against the beats, and past either end against the grid
    counted on as song.timeOfBeat does: the bar line where the music stops is on the beat."""
    beats = [0.5 + 0.5 * i for i in range(16)]  # the last beat at 8.0
    c = Check()
    for t, want in ((4.1, 0.1), (8.3, -0.2), (8.5, 0.0), (10.0, 0.0), (0.0, 0.0), (0.2, 0.2)):
        got = A.beat_offset(beats, t)
        c(f'offset at {t:g} s', f'{got:+.3f} s', abs(got - want) < 1e-6, f'{want:+.3f}')
    c('no beats', A.beat_offset([], 1.0), A.beat_offset([], 1.0) is None, 'None')
    return c.done()


# ─── QA ───────────────────────────────────────────────────────────────────────────────────

@test()
def qa_catches_strobe_and_gap():
    """A test video with a strobe and a black frame at a cut: QA must fail both and nothing else in frames."""
    import qa as Q
    W, H, fps, dur = 320, 180, 30, 8
    root = tmp_project('qa', {'width': W, 'height': H, 'fps': fps})
    os.makedirs(os.path.join(root, 'out'), exist_ok=True)
    yy, xx = np.mgrid[0:H, 0:W]
    base = np.stack([40 + 80 * xx / W, 50 + 60 * yy / H, 90 + 0 * xx], axis=2).astype(np.uint8)
    video = os.path.join(root, 'out', 'qa.mp4')
    p = __import__('subprocess').Popen([A.ffmpeg_bin(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'veryfast', video], stdin=__import__('subprocess').PIPE)
    for i in range(dur * fps):
        f = base.copy()
        f[60:120, (i * 3) % (W - 40):(i * 3) % (W - 40) + 40] = 200  # a moving box: a real picture
        if 3 * fps <= i < 4 * fps:
            f[:] = 255 if (i // 2) % 2 else 0  # strobe: 7.5 flashes per second
        if i == 6 * fps:
            f[:] = 0  # one black frame where the next shot should start
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()
    with open(os.path.join(root, 'out', 'qa.json'), 'w', encoding='utf-8') as fh:
        json.dump({'width': W, 'height': H, 'fps': fps, 'cuts': [6.0], 'shots': [], 'warnings': []}, fh)
    r = Q.run_qa(Q.Project(root), 'out/qa.mp4', verbose=False)
    fails = [x for x in r['checks'] if x['level'] == 'FAIL']
    c = Check()
    flash = [x['message'] for x in fails if x['area'] == 'flash']
    c('strobe', flash, len(flash) == 1 and '0:03.' in flash[0], 'one FAIL at 0:03')
    gap = [x['message'] for x in fails if x['area'] == 'frames']
    c('black frame at the cut', gap, len(gap) == 1 and 'at a cut' in gap[0], 'one FAIL, "at a cut"')
    first = [x for x in r['checks'] if 'first frame' in x['message']]
    c('first frame', 'flagged' if first else 'not flagged', not first, 'a picture, not flagged')
    return c.done()


# ─── Frame sequences ──────────────────────────────────────────────────────────────────────

def green_screen_clip(path, W=320, H=180, fps=24, n=24):
    """A filmed-looking green screen: uneven light, sensor noise, a moving two-colour subject with
    anti-aliased edges and a frame-number stamp; encoded as 4:2:0 H.264 tagged BT.709.
    Returns the true mattes and the screen colour's true Y'CbCr (BT.709, limited range)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    rng = np.random.default_rng(3)
    screen = np.stack([70 + 20 * xx / W, 175 + 25 * yy / H - 10 * xx / W, 80 + 10 * yy / H], 2)
    p = subprocess.Popen([A.ffmpeg_bin(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                          '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '12',
                          '-preset', 'veryfast', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', path], stdin=subprocess.PIPE)
    ss = 4
    sy, sx = np.mgrid[0:H * ss, 0:W * ss].astype(np.float64) / ss
    mattes = []
    for i in range(n):
        cx, cy = 110 + 4 * i, 95
        m = ((((sx - cx) / 55) ** 2 + ((sy - cy) / 65) ** 2) <= 1).reshape(H, ss, W, ss).mean((1, 3))
        subj = np.empty((H, W, 3))
        subj[:] = (205, 150, 125)
        subj[yy > cy + 10] = (40, 50, 125)
        img = (screen + rng.normal(0, 2.5, screen.shape)) * (1 - m[..., None]) + subj * m[..., None]
        img[:16, :16] = 10 + 5 * i
        p.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
        mattes.append(m)
    p.stdin.close()
    p.wait()
    edge = np.zeros((H, W), bool)
    edge[:7] = edge[-7:] = True
    edge[:, :7] = edge[:, -7:] = True
    edge[:16, :16] = False
    r, g, b = (screen[edge][:, k] / 255 for k in range(3))
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    truth = [float(np.median(16 + 219 * y)), float(np.median(128 + 224 * (b - y) / 1.8556)), float(np.median(128 + 224 * (r - y) / 1.5748))]
    return mattes, truth


@test()
def frames_key_matches_the_true_matte():
    """studio frames --key auto on a green-screen clip: the measured screen colour, the matte against
    the true one, frame alignment, and what frames.json says."""
    import frames as F
    from PIL import Image
    root = tmp_project('frames', {'width': 640, 'height': 360, 'fps': 30})
    clip = os.path.join(WORK, 'green.mp4')
    mattes, truth = green_screen_clip(clip)
    a = F.parser().parse_args([root, clip, '--key', 'auto', '--name', 'take'])
    r = F.import_clip(a.project, a.source, a, verbose=False)
    c = Check()
    k = r['key']
    err = max(abs(x - t) for x, t in zip(k['yuv'], truth))
    c('screen colour', f"Y'CbCr {k['yuv']} vs {[round(t, 1) for t in truth]}", err <= 2.5, 'within 2.5 levels')
    ious, errs, stamps, inside = [], [], [], []
    for i, m in enumerate(mattes):
        px = np.asarray(Image.open(os.path.join(r['dir'], f'{i + 1:06d}.png'))).astype(np.float64)
        al = px[..., 3] / 255
        ious.append(((al > 0.5) & (m > 0.5)).sum() / ((al > 0.5) | (m > 0.5)).sum())
        errs.append(np.abs(al - m).mean())
        stamps.append(px[3:13, 3:13, 1].mean() - (10 + 5 * i))
        inside.append(al[m >= 1].min())
    c('matte IoU', f'{min(ious):.3f}', min(ious) >= 0.96, '>= 0.96 on every frame (4:2:0 chroma)')
    c('alpha error', f'{max(errs):.4f}', max(errs) <= 0.01, 'mean |alpha - truth| <= 0.01')
    c('inside the subject', f'{min(inside):.3f}', min(inside) >= 0.98, 'alpha >= 0.98 (no see-through)')
    c('frame alignment', f'{max(abs(s) for s in stamps):.1f} levels', max(abs(s) for s in stamps) <= 3, 'stamp of frame n on file n')
    meta = r['meta']
    c('frames.json', f"{meta['count']} @ {meta['fps']} {meta['width']}x{meta['height']} alpha {meta['alpha']}",
      (meta['count'], meta['fps'], meta['width'], meta['height'], meta['alpha']) == (24, 24.0, 320, 180, True), '24 @ 24.0 320x180 alpha True')
    c('holes and specks', f"{len(r['matte']['holes'])}/{r['matte']['specks']}", not r['matte']['holes'] and r['matte']['specks'] == 0, '0/0')
    c('warnings', r['warnings'], not r['warnings'], 'none')
    return c.done()


@test()
def frames_sequence_gaps_trim_and_edges():
    """Numbered images: a gap stops the import, --from/--to trims on frames, JPEG keeps the colour,
    and transparent images are scaled without dark fringes."""
    import frames as F
    from PIL import Image
    root = tmp_project('frames_seq', {'width': 160, 'height': 90, 'fps': 25})
    seq = os.path.join(WORK, 'seq')
    shutil.rmtree(seq, ignore_errors=True)
    os.makedirs(seq)
    yy, xx = np.mgrid[0:90, 0:160]
    for i in range(1, 21):
        img = np.stack([xx * 255 // 159, yy * 255 // 89, 0 * xx + i * 10], 2).astype(np.uint8)
        Image.fromarray(img).save(os.path.join(seq, f'shot_{i:04d}.png'))
    c = Check()
    os.rename(os.path.join(seq, 'shot_0007.png'), os.path.join(WORK, 'shot_0007.png'))
    try:
        F.import_clip(root, seq, F.parser().parse_args([root, seq]), verbose=False)
        c('gap', 'imported', False, 'stops')
    except F.Stop as e:
        c('gap', 'stopped', 'missing' in str(e) and ': 7.' in str(e), 'stops and names frame 7')
    os.rename(os.path.join(WORK, 'shot_0007.png'), os.path.join(seq, 'shot_0007.png'))
    a = F.parser().parse_args([root, os.path.join(seq, 'shot_0001.png'), '--from', '0.2', '--to', '0.6'])
    r = F.import_clip(a.project, a.source, a, verbose=False)
    meta = r['meta']
    c('trim', f"{meta['count']} frames from {meta['source']}", meta['count'] == 10 and '(6–15)' in meta['source'], '10 frames: 6–15 at 25 fps')
    out = np.asarray(Image.open(os.path.join(r['dir'], '000001.jpg')).convert('RGB')).astype(int)
    ref = np.asarray(Image.open(os.path.join(seq, 'shot_0006.png'))).astype(int)
    c('JPEG colour', f'{np.abs(out - ref).mean():.2f}', np.abs(out - ref).mean() <= 1.5, 'mean error <= 1.5 levels')
    alpha = os.path.join(WORK, 'alpha')
    shutil.rmtree(alpha, ignore_errors=True)
    os.makedirs(alpha)
    yy, xx = np.mgrid[0:360, 0:640]
    disc = ((xx - 320) ** 2 + (yy - 180) ** 2 <= 120 ** 2)
    for i in range(1, 4):
        img = np.zeros((360, 640, 4), np.uint8)  # transparent pixels are black, as renderers write them
        img[disc] = (255, 255, 255, 255)
        Image.fromarray(img).save(os.path.join(alpha, f'{i:03d}.png'))
    a = F.parser().parse_args([root, alpha, '--name', 'disc'])
    r = F.import_clip(a.project, a.source, a, verbose=False)
    px = np.asarray(Image.open(os.path.join(r['dir'], '000001.png'))).astype(int)
    rim = (px[..., 3] > 25) & (px[..., 3] < 230)
    c('size', f"{r['meta']['width']}x{r['meta']['height']} {r['meta']['pattern']}",
      (r['meta']['width'], r['meta']['height']) == (160, 90) and r['meta']['alpha'], '160x90 PNG with alpha (fit inside the film)')
    c('edge colour', f'{px[rim][:, :3].min()} on {rim.sum()} edge pixels', rim.sum() > 20 and px[rim][:, :3].min() >= 240, 'white stays white (premultiplied scaling)')
    return c.done()


# ─── Main ─────────────────────────────────────────────────────────────────────────────────

def main(argv=None):
    global WORK
    ap = argparse.ArgumentParser(description='Self-tests for tools/py.')
    ap.add_argument('--full', action='store_true', help='also run the slower tests')
    ap.add_argument('-k', default='', help='only tests whose name contains this')
    ap.add_argument('--keep', help='keep generated files in this folder')
    a = ap.parse_args(argv)
    if not A.have_ffmpeg():
        print('  - python self-tests skipped: ffmpeg not found (set STUDIO_FFMPEG or add it to PATH)')
        return 0
    WORK = a.keep or tempfile.mkdtemp(prefix='studio-selftest-')
    os.makedirs(WORK, exist_ok=True)
    passed = failed = 0
    t0 = time.time()
    try:
        for name, fn, full in TESTS:
            if a.k not in name or (full and not a.full):
                continue
            t = time.time()
            try:
                info = fn()
                passed += 1
                print(f'  ✓ py › {name} ({time.time() - t:.1f}s): {info}')
            except Exception as e:  # noqa: BLE001
                failed += 1
                detail = str(e) if isinstance(e, AssertionError) else traceback.format_exc(limit=4)
                print(f'  ✗ py › {name}: {detail}')
    finally:
        if not a.keep:
            shutil.rmtree(WORK, ignore_errors=True)
    skipped = '' if a.full else ' (--full runs the longer songs too)'
    print(f'  python: {passed} passed, {failed} failed in {time.time() - t0:.0f}s{skipped}')
    return 1 if failed else 0


WORK = None

if __name__ == '__main__':
    sys.exit(main())
