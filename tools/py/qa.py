#!/usr/bin/env python3
"""Quality checks on a rendered film: numbers and pictures for people and agents.

    python tools/py/qa.py PROJECT                         # newest out/*.mp4 and its manifest
    python tools/py/qa.py PROJECT --video out/x.mp4 [--manifest out/x.json] [--check-lyrics]

Writes qa/report.md and qa/report.json plus pictures:
  qa/video_sheet_NN.png  contact sheets from the encoded video, captioned with time, bar.beat,
                         section and the lyric line at that moment
  qa/strips_NN.png       every cut from -0.3 s to +0.3 s (is the hand-off intact? a one-frame flash?)
  qa/luma.png            brightness per frame with cuts, flash windows and black frames marked
  qa/wave.png, qa/spec.png   the final audio track (waveform with loudness, spectrogram)

Checks: spec (size, frame rate, duration, pixel format, colour tags, audio), photosensitive
flashes (an approximation of WCAG 2.3.1: more than three general flashes or red flashes in any
one second over a quarter of the screen fails), black and white frames, brightness drops inside
a shot, loudness and true peak after encoding, audio offset against the mix, how far cuts and
sounds sit from the beat, shot-length variety, storyboard coverage and hand-offs, lyrics.
The flash check is an approximation: use a professional analyser for broadcast or commercial
release.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audio_io as A  # noqa: E402
import plots  # noqa: E402

THUMB_W = 384
GENERAL_DELTA = 0.1     # WCAG: a change of 10% of the maximum relative luminance
DARK_LIMIT = 0.8        # ... where the darker image is below 0.80
RED_DELTA = 20.0        # WCAG red flash: change in (R-G-B)*320 above 20 with R/(R+G+B) >= 0.8


def fmt(t):
    t = max(0.0, t)
    return f'{int(t // 60)}:{t % 60:05.2f}'


# ─── Project and inputs ──────────────────────────────────────────────────────────────────────

class Project:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        p = os.path.join(self.root, 'studio.json')
        self.cfg = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}

    def path(self, rel):
        return rel if os.path.isabs(rel) else os.path.join(self.root, rel)

    def json(self, rel, default=None):
        p = self.path(rel)
        return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else default


def newest_video(P):
    vids = [v for v in glob.glob(P.path('out/*.mp4')) + glob.glob(P.path('out/*.mov')) if not os.path.basename(v).startswith('.')]
    return max(vids, key=os.path.getmtime) if vids else None


def ffprobe(path):
    out = A.run([A.ffprobe_bin(), '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path])
    return json.loads(out.decode('utf-8', 'replace'))


def ratio(s):
    try:
        a, b = s.split('/')
        return float(a) / float(b) if float(b) else 0.0
    except (ValueError, AttributeError):
        return 0.0


# ─── Frames ──────────────────────────────────────────────────────────────────────────────────

def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def regions(h, w):
    """The whole frame and nine overlapping quarter-area windows (each 1/2 x 1/2 of the frame)."""
    out = [(0, h, 0, w)]
    for fy in (0, 0.25, 0.5):
        for fx in (0, 0.25, 0.5):
            out.append((int(fy * h), int((fy + 0.5) * h), int(fx * w), int((fx + 0.5) * w)))
    return out


def scan_video(path, width, height, fps, keep):
    """Decode once at THUMB_W wide. Per frame: mean luma (gamma), luma spread, relative luminance
    and red-flash value per region, mean absolute change. Frames whose index is in `keep` are
    returned as images."""
    tw = THUMB_W
    th = int(round(tw * height / width / 2)) * 2
    cmd = [A.ffmpeg_bin(), '-v', 'error', '-nostdin', '-i', path, '-an', '-vf', f'scale={tw}:{th}:flags=area,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = tw * th * 3
    ah, aw = th // 4 * 4, tw // 4 * 4
    regs = regions(ah // 4, aw // 4)
    luma, spread, Y, RV, diff, kept = [], [], [], [], [], {}
    prev = None
    i = 0
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, np.uint8).reshape(th, tw, 3)
        if i in keep:
            kept[i] = img.copy()
        small = img[:ah, :aw].reshape(ah // 4, 4, aw // 4, 4, 3).mean(axis=(1, 3))
        g = small / 255.0
        yp = 0.2126 * g[..., 0] + 0.7152 * g[..., 1] + 0.0722 * g[..., 2]  # Rec.709 luma, gamma-encoded
        lin = srgb_to_linear(small)
        yl = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
        s = lin.sum(axis=2) + 1e-9
        red = np.where(lin[..., 0] / s >= 0.8, np.maximum(0.0, (lin[..., 0] - lin[..., 1] - lin[..., 2]) * 320), 0.0)
        luma.append(float(yp.mean()))
        spread.append(float(yp.std()))
        Y.append([float(yl[a:b, c:d].mean()) for a, b, c, d in regs])
        RV.append([float(red[a:b, c:d].mean()) for a, b, c, d in regs])
        diff.append(0.0 if prev is None else float(np.abs(yp - prev).mean()))
        prev = yp
        i += 1
    p.stdout.close()
    err = p.stderr.read().decode('utf-8', 'replace')
    p.wait()
    if i == 0:
        raise RuntimeError(f'could not decode {path}: {err[-500:]}')
    return {'n': i, 'size': (tw, th), 'luma': np.array(luma), 'spread': np.array(spread), 'Y': np.array(Y), 'RV': np.array(RV),
            'diff': np.array(diff), 'kept': kept}


def transitions(series, delta, dark=None):
    """Frame indices where a series turns: it moved at least `delta` away from its last extreme in
    the opposite direction (with the darker state below `dark`, for luminance)."""
    out = []
    ext, dirn = series[0], 0
    for i in range(1, len(series)):
        v = series[i]
        if dirn == 1 and v > ext or dirn == -1 and v < ext:
            ext = v
            continue
        d = v - ext
        if abs(d) >= delta and (dark is None or min(v, ext) < dark):
            nd = 1 if d > 0 else -1
            if nd != dirn:
                out.append(i)
                dirn = nd
            ext = v
    return out


def flash_windows(ev_lists, fps, n):
    """Per frame: the most flashes (pairs of opposing transitions) in any one-second window that
    contains the frame, over all regions."""
    win = int(round(fps))
    worst = np.zeros(n)
    for ev in ev_lists:
        if len(ev) < 2:
            continue
        ev = np.array(ev)
        for k in range(len(ev)):
            j = int(np.searchsorted(ev, ev[k] + win))
            c = (j - k) // 2
            if c:
                seg = worst[ev[k]:ev[j - 1] + 1]
                np.maximum(seg, c, out=seg)
    return worst


def ranges(mask, fps, min_len=1):
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i >= min_len:
                out.append((i / fps, j / fps, j - i))
            i = j
        else:
            i += 1
    return out


def detect_cuts(diff, fps, thresh=0.12):
    idx = [i for i in range(1, len(diff)) if diff[i] >= thresh and diff[i] >= 3 * np.median(diff[max(0, i - 15):i + 15] + 1e-6)]
    return [i / fps for i in idx]


# ─── Captions ────────────────────────────────────────────────────────────────────────────────

def caption_font(P, size=15):
    for spec in P.cfg.get('fonts', []):
        for key in ('src', 'from'):
            p = spec.get(key)
            if p and os.path.exists(P.path(p)):
                try:
                    f = ImageFont.truetype(P.path(p), size)
                    try:
                        f.set_variation_by_axes([500])
                    except (OSError, AttributeError, ValueError):
                        pass
                    return f
                except OSError:
                    continue
    return plots.font()


class Timeline:
    """Where t (video time) falls: bar.beat, section, lyric line."""

    def __init__(self, P):
        off = float(P.cfg.get('offset', 0) or 0)
        lo = float(P.cfg.get('lyricOffset', 0) or 0)
        sm = P.json(P.cfg.get('songmap', 'data/songmap.json'))
        ly = P.json(P.cfg.get('lyrics', 'data/lyrics.json'))
        self.beats = [b + off for b in (sm or {}).get('beats', [])]
        self.bpb = (sm or {}).get('beatsPerBar', 4)
        self.first_down = (sm or {}).get('firstDownbeat', self.beats[0] - off if self.beats else 0) + off
        self.sections = [(s['start'] + off, s['end'] + off, s.get('kind') or s.get('label', '')) for s in (sm or {}).get('sections', [])]
        self.lines = [(l['start'] + off + lo, l['end'] + off + lo, l.get('text', '') or f'line {l.get("i", 0) + 1}') for l in (ly or {}).get('lines', [])]

    def where(self, t):
        bb = ''
        if self.beats:
            b = np.asarray(self.beats)
            i = int(np.searchsorted(b, t + 1e-6)) - 1
            if i == len(b) - 1 and len(b) > 1:  # past the last beat: count on with the last period
                i += int((t + 1e-6 - b[-1]) // (b[-1] - b[-2]))
            if i >= 0:
                d0 = int(np.argmin(np.abs(b - self.first_down)))
                k = i - d0
                bar, beat = k // self.bpb + 1, k % self.bpb + 1
                bb = f'{bar}.{beat}'
        sec = next((s for a, e, s in self.sections if a <= t < e), '')
        line = next((x for a, e, x in self.lines if a <= t < e), '')
        return bb, sec, line


def contact_sheets(P, scan, fps, times, out_prefix, cols=6, per=36):
    tl = Timeline(P)
    f = caption_font(P, 15)
    fs = plots.font()
    tw, th = scan['size']
    tw2 = 300
    th2 = int(th * tw2 / tw)
    files = []
    for k in range(0, len(times), per):
        chunk = times[k:k + per]
        rows = (len(chunk) + cols - 1) // cols
        cap = 40
        img = Image.new('RGB', (cols * (tw2 + 6) + 6, rows * (th2 + cap + 6) + 6), (16, 16, 18))
        d = ImageDraw.Draw(img)
        for j, t in enumerate(chunk):
            fi = min(scan['n'] - 1, int(round(t * fps)))
            fr = scan['kept'].get(fi)
            x, y = 6 + (j % cols) * (tw2 + 6), 6 + (j // cols) * (th2 + cap + 6)
            if fr is not None:
                img.paste(Image.fromarray(fr).resize((tw2, th2), Image.LANCZOS), (x, y))
            bb, sec, line = tl.where(t)
            d.text((x, y + th2 + 3), f'{fmt(t)}  {bb}  {sec}', fill=(210, 210, 215), font=fs)
            if line:
                d.text((x, y + th2 + 19), line[:24], fill=(255, 214, 120), font=f)
        path = f'{out_prefix}_{k // per + 1:02d}.png'
        img.save(path)
        files.append(path)
    return files


STRIP = (-0.3, -0.2, -0.1, 'prev', 0.0, 'next', 0.1, 0.2, 0.3)


def strip_frames(t, fps):
    c = int(round(t * fps))
    return [c - 1 if o == 'prev' else c + 1 if o == 'next' else c + int(round(o * fps)) for o in STRIP]


def strips(scan, fps, cuts, out_prefix, per=10):
    fs = plots.font()
    tw, th = scan['size']
    w2 = 190
    h2 = int(th * w2 / tw)
    label = 70
    files = []
    for k in range(0, len(cuts), per):
        chunk = cuts[k:k + per]
        img = Image.new('RGB', (label + len(STRIP) * (w2 + 4) + 4, len(chunk) * (h2 + 22) + 24), (16, 16, 18))
        d = ImageDraw.Draw(img)
        for c, o in enumerate(STRIP):
            name = '-1f' if o == 'prev' else '+1f' if o == 'next' else f'{o:+.1f}s' if o else 'cut'
            d.text((label + c * (w2 + 4) + 4, 4), name, fill=(170, 170, 180), font=fs)
        for r, t in enumerate(chunk):
            y = 22 + r * (h2 + 22)
            d.text((4, y + h2 // 2 - 6), fmt(t), fill=(220, 220, 225), font=fs)
            for c, fi in enumerate(strip_frames(t, fps)):
                fr = scan['kept'].get(fi)
                if fr is not None:
                    img.paste(Image.fromarray(fr).resize((w2, h2), Image.LANCZOS), (label + c * (w2 + 4) + 4, y))
        path = f'{out_prefix}_{k // per + 1:02d}.png'
        img.save(path)
        files.append(path)
    return files


def luma_png(path, scan, fps, cuts, flash_ranges, black_ranges, width=1800, height=300):
    luma = scan['luma']
    n = len(luma)
    img = Image.new('RGB', (width, height), (16, 16, 18))
    d = ImageDraw.Draw(img)
    f = plots.font()
    L, R, T, B = 50, width - 20, 24, height - 22
    X = lambda i: L + (R - L) * i / max(n - 1, 1)
    Yp = lambda v: B - (B - T) * v
    for a, b, _ in flash_ranges:
        d.rectangle([X(a * fps), T, X(b * fps), B], fill=(90, 20, 24))
    for a, b, _ in black_ranges:
        d.rectangle([X(a * fps), B - 8, X(b * fps), B], fill=(200, 200, 200))
    for v in (0.25, 0.5, 0.75):
        d.line([(L, Yp(v)), (R, Yp(v))], fill=(48, 48, 54))
        d.text((8, Yp(v) - 7), f'{v:.2f}', fill=(120, 120, 130), font=f)
    for c in cuts:
        d.line([(X(c * fps), T), (X(c * fps), B)], fill=(60, 60, 70))
    d.line([(X(i), Yp(v)) for i, v in enumerate(luma)], fill=(240, 240, 245), width=1)
    d.text((L, 6), 'mean luma per frame (white), cuts (grey lines), flash windows (red), black/white frames (bottom marks)', fill=(200, 200, 205), font=f)
    plots.time_axis(d, L, R, B, B, n / fps, f)
    img.save(path)


# ─── Audio ───────────────────────────────────────────────────────────────────────────────────

def onset_env(x, sr, hop=0.001):
    mono = x.mean(axis=1) if x.ndim == 2 else x
    k = int(hop * sr)
    n = len(mono) // k
    e = np.sqrt((mono[:n * k].astype(np.float64).reshape(n, k) ** 2).mean(axis=1) + 1e-12)
    le = np.log(e + 1e-4)
    return np.maximum(0, np.diff(le, prepend=le[0]))


def av_offset(video_audio, reference, sr, max_lag=0.5, seconds=90):
    """Lag (s) of the video's audio against the reference: positive = the video is late."""
    n = int(seconds * sr)
    a, b = onset_env(video_audio[:n], sr), onset_env(reference[:n], sr)
    m = min(len(a), len(b))
    a, b = a[:m] - a[:m].mean(), b[:m] - b[:m].mean()
    L = int(max_lag * 1000)
    size = 1 << int(np.ceil(np.log2(2 * m)))
    c = np.fft.irfft(np.fft.rfft(a, size) * np.conj(np.fft.rfft(b, size)), size)
    c = np.concatenate([c[-L:], c[:L + 1]])
    lag = int(np.argmax(c)) - L
    peak = float(c.max() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
    return lag / 1000.0, peak


def silences(x, sr, integrated):
    """Stretches of at least 0.25 s whose momentary loudness is 20 LU or more below the film's
    integrated loudness."""
    lufs, starts, _ = A.block_loudness(x, sr, block=0.4, hop=0.05)
    quiet = lufs < integrated - 20
    out = []
    for a, b, k in ranges(quiet, 20.0, 1):
        if b - a + 0.35 >= 0.25:
            out.append((round(a, 2), round(b + 0.35, 2)))
    return out


# ─── Storyboard ──────────────────────────────────────────────────────────────────────────────

TIME_RX = re.compile(r'(?:(\d+):)?(\d+(?:\.\d+)?)\s*[–—~-]\s*(?:(\d+):)?(\d+(?:\.\d+)?)')


def storyboard(P, duration):
    p = P.path('STORYBOARD.md')
    if not os.path.exists(p):
        return {'found': False}
    rows, out_col, issues = [], None, []
    for line in open(p, encoding='utf-8').read().splitlines():
        if not line.strip().startswith('|'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if out_col is None:
            for k, c in enumerate(cells):
                if c.lower().startswith('out') or '交接' in c:
                    out_col = k
            continue
        if all(set(c) <= set('-: ') for c in cells):
            continue
        m = next((TIME_RX.search(c) for c in cells[:3] if TIME_RX.search(c)), None)
        if not m:
            continue
        a = float(m.group(2)) + 60 * float(m.group(1) or 0)
        b = float(m.group(4)) + 60 * float(m.group(3) or 0)
        rows.append({'start': a, 'end': b, 'out': cells[out_col] if out_col is not None and out_col < len(cells) else None, 'id': cells[0]})
    rows.sort(key=lambda r: r['start'])
    cover = 0.0
    for r in rows:
        if r['start'] > cover + 0.05:
            issues.append(f'nothing planned for {fmt(cover)}–{fmt(r["start"])}')
        cover = max(cover, r['end'])
    if rows and duration and cover < duration - 0.1:
        issues.append(f'nothing planned after {fmt(cover)} (film ends {fmt(duration)})')
    empty = [r['id'] for r in rows if out_col is not None and not (r['out'] or '').strip(' -—')]
    if empty:
        issues.append(f'{len(empty)} shots have no Out (hand-off): {", ".join(empty[:8])}{" …" if len(empty) > 8 else ""}')
    return {'found': True, 'shots': len(rows), 'issues': issues}


# ─── Main ────────────────────────────────────────────────────────────────────────────────────

def nearest_offsets(times, beats, fps):
    """Frames from each time to the nearest beat; the grid counts on past either end (A.beat_offset)."""
    return [None if (o := A.beat_offset(beats, t)) is None else o * fps for t in times]


def run_qa(P, video=None, manifest=None, check_lyrics=False, verbose=True):
    video = P.path(video) if video else newest_video(P)
    if not video or not os.path.exists(video):
        raise SystemExit('no video: render one first ("studio render"), or pass --video')
    man_path = P.path(manifest) if manifest else os.path.splitext(video)[0] + '.json'
    man = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
    qa_dir = P.path('qa')
    os.makedirs(qa_dir, exist_ok=True)
    checks = []  # (level, area, message)   level: FAIL | WARN | INFO | PASS

    def add(level, area, msg):
        checks.append({'level': level, 'area': area, 'message': msg})

    # Spec
    pr = ffprobe(video)
    vs = next((s for s in pr['streams'] if s['codec_type'] == 'video'), None)
    aus = next((s for s in pr['streams'] if s['codec_type'] == 'audio'), None)
    if vs is None:
        raise SystemExit(f'{video}: no video stream')
    W, H = int(vs['width']), int(vs['height'])
    fps = ratio(vs.get('avg_frame_rate')) or ratio(vs.get('r_frame_rate')) or float(P.cfg.get('fps', 30))
    duration = float(pr['format'].get('duration', 0))
    want_w, want_h = man.get('width') or P.cfg.get('width'), man.get('height') or P.cfg.get('height')
    want_fps = man.get('fps') or P.cfg.get('fps')
    spec = {'file': os.path.relpath(video, P.root).replace('\\', '/'), 'size': f'{W}x{H}', 'fps': round(fps, 3), 'duration': round(duration, 3),
            'codec': vs.get('codec_name'), 'pixFmt': vs.get('pix_fmt'), 'color': [vs.get('color_primaries'), vs.get('color_transfer'), vs.get('color_space')],
            'bitrateMbps': round(float(pr['format'].get('bit_rate', 0)) / 1e6, 1), 'mb': round(os.path.getsize(video) / 1e6, 1),
            'audio': None if aus is None else f'{aus.get("codec_name")} {aus.get("sample_rate")} Hz {aus.get("channels")} ch'}
    if want_w and want_h and (W, H) != (int(want_w), int(want_h)):
        add('WARN', 'spec', f'size {W}x{H}, planned {want_w}x{want_h}')
    if want_fps and abs(fps - float(want_fps)) > 0.01:
        add('FAIL', 'spec', f'{fps:.3f} fps, planned {want_fps}')
    if man.get('to') is not None and man.get('from') is not None:
        exp = man['to'] - man['from']
        if abs(duration - exp) > 1.5 / fps:
            add('WARN', 'spec', f'duration {duration:.3f} s, the render covered {exp:.3f} s')
    if vs.get('codec_name') == 'h264' and vs.get('pix_fmt') != 'yuv420p':
        add('WARN', 'spec', f'pixel format {vs.get("pix_fmt")}: many players and platforms want yuv420p')
    if vs.get('color_primaries') not in ('bt709',) or vs.get('color_transfer') not in ('bt709',):
        add('INFO', 'spec', f'colour tags {spec["color"]}: tag BT.709 so players do not guess')
    if aus is None:
        add('FAIL', 'spec', 'no audio track')
    elif int(aus.get('sample_rate', 0)) != 48000:
        add('INFO', 'spec', f'audio at {aus.get("sample_rate")} Hz (48 kHz is the video standard)')
    if W % 2 or H % 2:
        add('FAIL', 'spec', f'odd frame size {W}x{H}: H.264 4:2:0 needs even sizes')

    # Frames
    cuts = [c for c in (man.get('cuts') or []) if 0 < c < duration]
    cuts_src = 'manifest'
    n_est = int(round(duration * fps)) + 2
    sheet_every = max(0.5, round(duration / 36, 1)) if duration > 18 else 0.5
    sheet_times = [round(t, 3) for t in np.arange(0, max(duration - 1 / fps, 0), sheet_every)]
    keep = {min(n_est, int(round(t * fps))) for t in sheet_times}
    for c in cuts:
        keep.update(strip_frames(c, fps))
    scan = scan_video(video, W, H, fps, keep)
    n = scan['n']
    if not cuts:
        cuts = detect_cuts(scan['diff'], fps)
        cuts_src = 'detected'
        missing = set()
        for c in cuts:
            missing.update(f for f in strip_frames(c, fps) if f not in scan['kept'])
        if missing:  # second pass for the strip frames of detected cuts
            scan2 = scan_video(video, W, H, fps, missing)
            scan['kept'].update(scan2['kept'])

    # Flashes
    gen = [transitions(scan['Y'][:, r], GENERAL_DELTA, DARK_LIMIT) for r in range(scan['Y'].shape[1])]
    red = [transitions(scan['RV'][:, r], RED_DELTA) for r in range(scan['RV'].shape[1])]
    worst_g = flash_windows(gen, fps, n)
    worst_r = flash_windows(red, fps, n)
    fail_g = ranges(worst_g > 3, fps)
    fail_r = ranges(worst_r > 3, fps)
    edge_g = ranges(worst_g == 3, fps)
    peak = lambda w, a, b: int(w[int(round(a * fps)):max(int(round(b * fps)), int(round(a * fps)) + 1)].max())
    for a, b, _ in fail_g:
        add('FAIL', 'flash', f'{peak(worst_g, a, b)} flashes in one second, {fmt(a)}–{fmt(b)}: lower the contrast of the changes or slow them to 3 per second or fewer')
    for a, b, _ in fail_r:
        add('FAIL', 'flash', f'{peak(worst_r, a, b)} red flashes in one second, {fmt(a)}–{fmt(b)}: saturated red flashing is the most dangerous kind')
    if edge_g and not fail_g:
        add('WARN', 'flash', f'exactly 3 flashes per second at {", ".join(fmt(a) for a, _, _ in edge_g[:5])}: at the limit; consider a photosensitivity warning')
    # Frames inside a flash range are reported once, as the flash, not again as black/white frames or dips.
    flashing = np.convolve(((worst_g > 3) | (worst_r > 3)).astype(float), np.ones(2 * int(round(0.25 * fps)) + 1), 'same') > 0
    if not fail_g and not fail_r and not edge_g:
        add('PASS', 'flash', f'at most {int(worst_g.max())} general and {int(worst_r.max())} red flashes in any second')

    # Black / white frames
    luma, spread = scan['luma'], scan['spread']
    black = (luma < 0.03) & (spread < 0.03)
    white = (luma > 0.97) & (spread < 0.03)
    black_r, white_r = ranges(black & ~flashing, fps), ranges(white & ~flashing, fps)
    for kind, rr in (('black', black_r), ('white', white_r)):
        for a, b, k in rr:
            at_edge = a < 0.5 or b > duration - 0.5
            near_cut = any(abs(a - c) < 2 / fps or abs(b - c) < 2 / fps for c in cuts)
            if k <= 3 and not at_edge:
                level = 'FAIL' if kind == 'white' or near_cut else 'WARN'
                add(level, 'frames', f'{k} {kind} frame{"s" if k > 1 else ""} at {fmt(a)}' + (' at a cut: a gap between shots?' if near_cut else ''))
            else:
                add('INFO', 'frames', f'{kind} {fmt(a)}–{fmt(b)} ({k} frames)' + (' at the start/end' if at_edge else '') + ' — intended?')
    if not black_r and not white_r:
        add('PASS', 'frames', 'no black or white frames')
    f0 = scan['kept'].get(0)
    if f0 is not None:
        g0 = f0.astype(np.float32) @ np.array([0.2126, 0.7152, 0.0722], np.float32) / 255
        if np.mean(np.abs(g0 - np.median(g0)) > 0.04) < 0.0003:  # a small counter is ~0.05%
            add('WARN', 'frames', 'the first frame is one flat colour: players and feeds show it before play; start on a picture (the title, the hook)')

    # Brightness drops inside a shot
    cut_frames = {int(round(c * fps)) for c in cuts}
    drops = []
    for i in range(1, n):
        if luma[i] - luma[i - 1] <= -0.15 and not flashing[i] and not any(abs(i - cf) <= 1 for cf in cut_frames):
            rec = luma[i:i + int(0.5 * fps)].max() >= luma[i - 1] - 0.05
            drops.append((i / fps, luma[i - 1], luma[i], rec))
    for t, a_, b_, rec in drops[:12]:
        add('WARN', 'brightness', f'{fmt(t)}: brightness {a_:.2f} → {b_:.2f} inside a shot' + (' and back within 0.5 s (a flicker?)' if rec else ''))
    if len(drops) > 12:
        add('WARN', 'brightness', f'… and {len(drops) - 12} more brightness drops (see qa/luma.png)')
    jumps = []
    for c0, c1 in zip(cuts, cuts[1:]):
        if c1 - c0 < 0.5:
            i0, i1 = int(round(c0 * fps)), int(round(c1 * fps))
            a_, b_ = luma[max(0, i0 - 1)], luma[min(n - 1, i1)]
            if abs(a_ - b_) / max(a_, b_, 1e-3) > 0.5:
                jumps.append(c0)
    if jumps:
        add('WARN', 'brightness', f'fast cuts with brightness jumps over 50% at {", ".join(fmt(c) for c in jumps[:6])}')

    # Audio
    audio_rep = {}
    if aus is not None:
        xa = A.load(video, sr=A.SR)
        lufs, tp, lra = A.integrated_lufs(xa), A.true_peak_db(xa), A.loudness_range(xa)
        import mix as MIX
        ff = MIX.ebur128(video)
        audio_rep = {'integrated': round(lufs, 2), 'truePeak': round(tp, 2), 'lra': round(lra, 1), 'ffmpeg': ff}
        target = P.cfg.get('mix', {}).get('target', -14.0)
        if abs(lufs - target) > 1.0:
            add('WARN', 'loudness', f'{lufs:.1f} LUFS (target {target} ±1)')
        else:
            add('PASS', 'loudness', f'{lufs:.1f} LUFS integrated (ffmpeg {ff.get("integrated")})')
        if tp > -1.0:
            add('FAIL' if tp > -0.1 else 'WARN', 'loudness', f'true peak {tp:.2f} dBTP after encoding (ceiling -1)')
        else:
            add('PASS', 'loudness', f'true peak {tp:.2f} dBTP after encoding')
        ref_rel = man.get('audio') or (P.cfg.get('mix', {}).get('out') or 'audio/mix.wav')
        ref = P.path(ref_rel)
        if os.path.exists(ref):
            xr = A.load(ref, sr=A.SR)
            start = float(man.get('from') or 0)
            xr = xr[int(start * A.SR):]
            lag, corr = av_offset(xa, xr, A.SR)
            audio_rep['offsetMs'] = round(lag * 1000, 1)
            audio_rep['offsetAgainst'] = os.path.relpath(ref, P.root).replace('\\', '/')
            if corr < 0.2:
                add('WARN', 'sync', f'audio does not match {audio_rep["offsetAgainst"]} well enough to measure an offset (correlation {corr:.2f})')
            elif abs(lag) > 0.02:
                add('FAIL' if abs(lag) > 0.045 else 'WARN', 'sync', f'audio is {lag * 1000:+.0f} ms against {audio_rep["offsetAgainst"]}')
            else:
                add('PASS', 'sync', f'audio offset {lag * 1000:+.0f} ms against {audio_rep["offsetAgainst"]}')
        sil = silences(xa, A.SR, lufs)
        st, starts, _ = A.block_loudness(xa, A.SR, block=3.0, hop=0.25)
        loud_t = float(starts[int(np.argmax(st))] + 1.5) if len(st) else 0.0
        audio_rep['silences'] = sil
        audio_rep['loudestAt'] = round(loud_t, 2)
        before = [s for s in sil if s[1] <= loud_t]
        add('INFO', 'sound', f'loudest moment {fmt(loud_t)}; {len(before)} real silence{"s" if len(before) != 1 else ""} before it'
            + (' (a silence before the climax makes it land; consider at least two)' if len(before) < 2 else ''))
        tl = Timeline(P)
        secs = [(a, b, s) for a, b, s in tl.sections]
        plots.waveform_png(os.path.join(qa_dir, 'wave.png'), xa, A.SR, title=f'final audio  {lufs:.1f} LUFS  TP {tp:.1f} dBTP  LRA {lra:.1f} LU',
                           markers=[(c, '') for c in cuts], bands=secs, target=target)
        plots.spectrogram_png(os.path.join(qa_dir, 'spec.png'), xa, A.SR, title='final audio spectrogram', bands=secs)

    # Cuts, sounds and beats
    tl = Timeline(P)
    beat_rep = {}
    if tl.beats:
        start = float(man.get('from') or 0)
        beats = [b - start for b in tl.beats]
        offs = nearest_offsets(cuts, beats, fps)
        on = sum(1 for o in offs if o is not None and abs(o) <= 1)
        near = [(c, o) for c, o in zip(cuts, offs) if o is not None and 1.5 <= abs(o) <= 4]
        beat_rep['cuts'] = [{'t': round(c, 3), 'beatOffsetFrames': None if o is None else round(o, 2)} for c, o in zip(cuts, offs)]
        if cuts:
            add('INFO', 'timing', f'{on} of {len(cuts)} cuts ({cuts_src}) within ±1 frame of a beat')
        for c, o in near[:8]:
            add('WARN', 'timing', f'cut at {fmt(c)} is {o:+.1f} frames off the nearest beat: on purpose, or a near miss?')
        sfx = man.get('sfx') or []
        so = nearest_offsets([s['t'] - start for s in sfx], beats, fps)
        beat_rep['sfx'] = [{'t': s['t'], 'sound': s.get('sound'), 'beatOffsetFrames': None if o is None else round(o, 2)} for s, o in zip(sfx, so)]

    # Shots
    shots = man.get('shots') or []
    if len(shots) >= 6:
        d = np.array([s['end'] - s['start'] for s in shots if s.get('cut', True)])
        if len(d) >= 6 and d.std() / max(d.mean(), 1e-6) < 0.15:
            add('WARN', 'pacing', f'{len(d)} shots all about {d.mean():.1f} s long: vary shot lengths with the music')
    sb = storyboard(P, duration)
    if sb.get('found'):
        for msg in sb['issues']:
            add('WARN', 'storyboard', msg)
        if not sb['issues']:
            add('PASS', 'storyboard', f'{sb["shots"]} planned shots cover the film; every shot has an Out')
    else:
        add('INFO', 'storyboard', 'no STORYBOARD.md')
    for w in man.get('warnings') or []:
        add('FAIL' if w.startswith('no shot covers') else 'WARN', 'film', w)

    # Lyrics
    lyr_rep = None
    if os.path.exists(P.path(P.cfg.get('lyrics', 'data/lyrics.json'))):
        import lyrics as LY
        r = LY.check(LY.Project(P.root), verbose=False)
        lyr_rep = {'errors': r['errors'], 'warnings': r['warnings'], 'uncertain': r['uncertain'][:5]}
        for e in r['errors']:
            add('FAIL', 'lyrics', e)
        for w in r['warnings'][:10]:
            add('WARN', 'lyrics', w)
        if len(r['warnings']) > 10:
            add('WARN', 'lyrics', f'… and {len(r["warnings"]) - 10} more (qa/lyrics_check.json)')
        if not r['errors'] and not r['warnings']:
            add('PASS', 'lyrics', f'{r["lines"]} lines: reading time, width, glyphs and order OK')
    if check_lyrics:
        root = P.root
        try:
            top = subprocess.run(['git', '-C', P.root, 'rev-parse', '--show-toplevel'], capture_output=True, text=True)
            if top.returncode == 0 and top.stdout.strip():
                root = top.stdout.strip()
        except OSError:
            pass
        import lyrics as LY
        rc = LY.main(['check-repo', root])
        add('FAIL' if rc else 'PASS', 'publish', 'lyric fragments or audio in files that would be published (see above)' if rc else 'no lyric fragments or audio in the files that would be published')

    # Pictures
    sheets = contact_sheets(P, scan, fps, sheet_times, os.path.join(qa_dir, 'video_sheet'))
    strip_files = strips(scan, fps, cuts, os.path.join(qa_dir, 'strips')) if cuts else []
    luma_png(os.path.join(qa_dir, 'luma.png'), scan, fps, cuts, fail_g + fail_r + edge_g, black_r + white_r)

    order = {'FAIL': 0, 'WARN': 1, 'INFO': 2, 'PASS': 3}
    checks.sort(key=lambda c: order[c['level']])
    counts = {k: sum(1 for c in checks if c['level'] == k) for k in order}
    report = {'video': spec, 'counts': counts, 'checks': checks, 'audio': audio_rep, 'beats': beat_rep, 'lyrics': lyr_rep,
              'storyboard': sb, 'cuts': {'source': cuts_src, 'times': [round(c, 3) for c in cuts]},
              'flash': {'maxGeneralPerSecond': int(worst_g.max()), 'maxRedPerSecond': int(worst_r.max()), 'fail': fail_g + fail_r},
              'pictures': [os.path.relpath(p, P.root).replace('\\', '/') for p in sheets + strip_files + [os.path.join(qa_dir, 'luma.png')]]}
    with open(os.path.join(qa_dir, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    md = ['# QA report', '', f'`{spec["file"]}` · {spec["size"]} @ {spec["fps"]:g} fps · {fmt(duration)} · {spec["codec"]} {spec["pixFmt"]} · {spec["bitrateMbps"]} Mb/s · {spec["mb"]} MB · audio {spec["audio"]}', '',
          f'**{counts["FAIL"]} fail · {counts["WARN"]} warn · {counts["INFO"]} info · {counts["PASS"]} pass**', '', '| | area | finding |', '|---|---|---|']
    icon = {'FAIL': '❌', 'WARN': '⚠️', 'INFO': 'ℹ️', 'PASS': '✅'}
    md += [f'| {icon[c["level"]]} {c["level"]} | {c["area"]} | {c["message"]} |' for c in checks]
    if beat_rep.get('cuts'):
        md += ['', '## Cuts against beats', '', '| cut | frames from the nearest beat |', '|---|---|']
        md += [f'| {fmt(c["t"])} | {(round(c["beatOffsetFrames"], 1) or 0.0):+.1f} |' for c in beat_rep['cuts'] if c['beatOffsetFrames'] is not None]
    md += ['', '## Pictures', '', '- contact sheets: ' + ', '.join(f'`{os.path.basename(p)}`' for p in sheets),
           '- transition strips: ' + (', '.join(f'`{os.path.basename(p)}`' for p in strip_files) or 'none (no cuts)'),
           '- `luma.png` (brightness, flashes, black frames), `wave.png` and `spec.png` (final audio)', '',
           'Flash detection approximates WCAG 2.3.1 general and red flash thresholds. It is not a certified photosensitivity test.',
           'These are measurements. A person still has to watch the whole film with sound.']
    with open(os.path.join(qa_dir, 'report.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(md) + '\n')
    if verbose:
        print(f'  {spec["file"]}: {spec["size"]} @ {spec["fps"]:g} fps, {fmt(duration)}, {spec["mb"]} MB')
        for c in checks:
            if c['level'] != 'PASS':
                print(f'  {c["level"]:4s} {c["area"]:10s} {c["message"]}')
        print(f'  {counts["FAIL"]} fail, {counts["WARN"]} warn, {counts["PASS"]} pass → qa/report.md ({len(sheets)} sheets, {len(strip_files)} strips, luma.png, wave.png, spec.png)')
    return report


def plan_check(P, probe, verbose=True):
    """Checks on the film's plan before any video exists: shot coverage, overlaps, shot-length
    variety, cuts against beats, sounds with a reason, storyboard coverage and hand-offs."""
    checks = []

    def add(level, area, msg):
        checks.append({'level': level, 'area': area, 'message': msg})

    fps = float(probe.get('fps') or P.cfg.get('fps', 30))
    duration = float(probe.get('duration') or 0)
    meta = probe.get('meta') or {}
    shots = sorted(meta.get('shots') or [], key=lambda s: s['start'])
    for w in meta.get('warnings') or []:
        add('FAIL' if w.startswith('no shot covers') else 'WARN', 'coverage', w)
    if shots and not any(w.startswith('no shot covers') for w in meta.get('warnings') or []):
        add('PASS', 'coverage', f'{len(shots)} shots cover 0:00.00–{fmt(duration)}')
    by_layer = {}
    for s in shots:
        if s.get('cut', True):
            by_layer.setdefault(s.get('layer', 0), []).append(s)
    for layer, ss in by_layer.items():
        for a, b in zip(ss, ss[1:]):
            if b['start'] < a['end'] - 0.5 / fps:
                add('WARN', 'overlap', f'{a["id"]} and {b["id"]} overlap {fmt(b["start"])}–{fmt(min(a["end"], b["end"]))} on layer {layer}: both draw; a dissolve, or a forgotten end?')
    lens = np.array([s['end'] - s['start'] for s in shots if s.get('cut', True)])
    if len(lens) >= 4:
        r = lens.max() / max(lens.min(), 1e-6)
        if r < 4:
            add('WARN', 'pacing', f'longest shot {lens.max():.2f} s is only {r:.1f}× the shortest {lens.min():.2f} s: vary lengths at least 4×')
        else:
            add('PASS', 'pacing', f'shot lengths {lens.min():.2f}–{lens.max():.2f} s ({r:.1f}×)')
        long = [s['id'] for s in shots if s.get('cut', True) and s['end'] - s['start'] > 8]
        if long:
            add('INFO', 'pacing', f'shots over 8 s: {", ".join(long[:8])} (fine for a long take; plan movement inside it)')
    tl = Timeline(P)
    cuts = [c for c in probe.get('cuts') or [] if 0 < c < duration]
    if tl.beats and cuts:
        offs = nearest_offsets(cuts, tl.beats, fps)
        on = sum(1 for o in offs if o is not None and abs(o) <= 1)
        near = [(c, o) for c, o in zip(cuts, offs) if o is not None and 1.5 <= abs(o) <= 4]
        add('INFO', 'timing', f'{on} of {len(cuts)} cuts within ±1 frame of a beat')
        for c, o in near[:8]:
            add('WARN', 'timing', f'cut at {fmt(c)} is {o:+.1f} frames off the nearest beat: on purpose, or a near miss?')
    sfx = probe.get('sfx') or []
    nowhy = [s for s in sfx if not str(s.get('why', '')).strip()]
    if nowhy:
        add('WARN', 'sound', f'{len(nowhy)} of {len(sfx)} sounds have no "why" (first at {fmt(nowhy[0]["t"])} in {nowhy[0].get("from")}): every sound answers an action')
    elif sfx:
        add('PASS', 'sound', f'{len(sfx)} sounds, each with a reason')
    sb = storyboard(P, duration)
    if sb.get('found'):
        for msg in sb['issues']:
            add('WARN', 'storyboard', msg)
        if not sb['issues']:
            add('PASS', 'storyboard', f'{sb["shots"]} planned shots cover the film; every shot has an Out')
        if shots and abs(sb['shots'] - len(shots)) > max(2, 0.25 * len(shots)):
            add('INFO', 'storyboard', f'STORYBOARD.md plans {sb["shots"]} shots, the film has {len(shots)}: update whichever is stale')
    else:
        add('WARN', 'storyboard', 'no STORYBOARD.md: write the shot table before building (G3)')
    order = {'FAIL': 0, 'WARN': 1, 'INFO': 2, 'PASS': 3}
    checks.sort(key=lambda c: order[c['level']])
    counts = {k: sum(1 for c in checks if c['level'] == k) for k in order}
    os.makedirs(P.path('qa'), exist_ok=True)
    rep = {'counts': counts, 'checks': checks, 'shots': shots, 'cuts': cuts, 'duration': duration}
    with open(P.path('qa/plan.json'), 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    icon = {'FAIL': '❌', 'WARN': '⚠️', 'INFO': 'ℹ️', 'PASS': '✅'}
    md = ['# Plan check', '', f'{len(shots)} shots · {len(cuts)} cuts · {len(sfx)} sounds · {fmt(duration)}', '',
          f'**{counts["FAIL"]} fail · {counts["WARN"]} warn · {counts["INFO"]} info · {counts["PASS"]} pass**', '', '| | area | finding |', '|---|---|---|']
    md += [f'| {icon[c["level"]]} {c["level"]} | {c["area"]} | {c["message"]} |' for c in checks]
    with open(P.path('qa/plan.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(md) + '\n')
    if verbose:
        for c in checks:
            print(f'  {c["level"]:4s} {c["area"]:10s} {c["message"]}')
        print(f'  {counts["FAIL"]} fail, {counts["WARN"]} warn → qa/plan.md')
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description='Quality checks on a rendered film.')
    ap.add_argument('project')
    ap.add_argument('--video')
    ap.add_argument('--manifest')
    ap.add_argument('--check-lyrics', action='store_true', help='also check the files that would be published for lyric fragments and audio')
    ap.add_argument('--plan', metavar='PROBE_JSON', help='check the plan from a page probe instead of a video (studio plan)')
    a = ap.parse_args(argv)
    if a.plan:
        r = plan_check(Project(a.project), json.load(open(a.plan, encoding='utf-8')))
    else:
        r = run_qa(Project(a.project), a.video, a.manifest, a.check_lyrics)
    return 1 if r['counts']['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
