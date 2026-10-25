"""Pictures of sound for people and agents who cannot listen: waveform with loudness, spectrogram.

Pillow + numpy only. Labels are ASCII so the default bitmap font can draw them anywhere.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BG = (16, 16, 18)
GRID = (52, 52, 58)
TEXT = (200, 200, 205)
WAVE = (120, 170, 235)
RMS = (60, 105, 170)
CLIP = (255, 70, 70)
LOUD = (255, 196, 70)
BAND = [(28, 30, 36), (22, 23, 27)]
# Magma-like ramp for spectrograms (dark purple -> orange -> pale yellow).
RAMP = [(0.0, (4, 4, 12)), (0.25, (60, 15, 110)), (0.5, (160, 40, 120)), (0.75, (245, 110, 60)), (1.0, (252, 245, 180))]


def font():
    try:
        return ImageFont.load_default(size=13)
    except TypeError:  # older Pillow
        return ImageFont.load_default()


def fmt(t):
    return f'{int(t // 60)}:{t % 60:04.1f}'


def colormap(v):
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for (a, ca), (b, cb) in zip(RAMP, RAMP[1:]):
        m = (v >= a) & (v <= b)
        u = ((v[m] - a) / (b - a))[:, None]
        out[m] = np.array(ca) * (1 - u) + np.array(cb) * u
    return out.astype(np.uint8)


def time_axis(d, x0, x1, y0, y1, duration, f):
    step = next(s for s in (1, 2, 5, 10, 15, 30, 60, 120, 300) if duration / s <= 16)
    t = 0.0
    while t <= duration + 1e-6:
        x = x0 + (x1 - x0) * t / duration
        d.line([(x, y0), (x, y1)], fill=GRID)
        d.text((x + 2, y1 + 2), fmt(t), fill=TEXT, font=f)
        t += step


def waveform_png(path, x, sr, title='', markers=(), bands=(), width=1800, height=420, loudness=True, target=None):
    """Peak and RMS envelope per column, clipped samples in red, sections as background bands,
    markers (t, label) as thin lines, and the short-term loudness curve (3 s, LUFS) in amber."""
    x = np.asarray(x, dtype=np.float32)
    mono = x if x.ndim == 1 else x.mean(axis=1)
    peak = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    duration = len(mono) / sr
    f = font()
    img = Image.new('RGB', (width, height), BG)
    d = ImageDraw.Draw(img)
    L, R, T, B = 60, width - 60, 28, height - 22
    for i, (a, b, label) in enumerate(bands):
        xa, xb = L + (R - L) * a / duration, L + (R - L) * b / duration
        d.rectangle([xa, T, xb, B], fill=BAND[i % 2])
        d.text((xa + 3, T + 2), str(label)[:18], fill=(150, 150, 160), font=f)
    time_axis(d, L, R, T, B, max(duration, 1e-6), f)
    mid = (T + B) / 2
    half = (B - T) / 2 - 14
    for db in (-6, -12, -24):
        a = 10 ** (db / 20) * half
        for y in (mid - a, mid + a):
            d.line([(L, y), (R, y)], fill=GRID)
        d.text((4, mid - a - 7), f'{db} dB', fill=(110, 110, 120), font=f)
    cols = R - L
    edges = np.linspace(0, len(mono), cols + 1).astype(int)
    for c in range(cols):
        seg = mono[edges[c]:max(edges[c] + 1, edges[c + 1])]
        if not len(seg):
            continue
        hi, lo = float(seg.max()), float(seg.min())
        rms = float(np.sqrt(np.mean(seg.astype(np.float64) ** 2)))
        xx = L + c
        clip = peak[edges[c]:max(edges[c] + 1, edges[c + 1])].max() >= 0.999
        d.line([(xx, mid - hi * half), (xx, mid - lo * half)], fill=CLIP if clip else WAVE)
        d.line([(xx, mid - rms * half), (xx, mid + rms * half)], fill=RMS)
    if loudness and duration > 3:
        import audio_io as A
        lufs, starts, _ = A.block_loudness(x, sr, block=3.0, hop=0.25)
        pts = [(L + (R - L) * (s + 1.5) / duration, T + 14 + (B - T - 28) * (1 - (np.clip(v, -40, 0) + 40) / 40)) for s, v in zip(starts, lufs)]
        if len(pts) > 1:
            d.line(pts, fill=LOUD, width=2)
        for lv in ((-14,) if target is None else (target,)):
            y = T + 14 + (B - T - 28) * (1 - (lv + 40) / 40)
            d.line([(R, y), (R + 6, y)], fill=LOUD)
            d.text((R + 8, y - 7), f'{lv:g}', fill=LOUD, font=f)
        top = int(np.argmax(lufs))
        d.text((R - 330, 8), f'short-term max {lufs[top]:.1f} LUFS at {fmt(starts[top] + 1.5)}', fill=LOUD, font=f)
    row, last_x = 0, -1e9
    for t, label in sorted(markers):
        xx = L + (R - L) * t / max(duration, 1e-6)
        row = (row + 1) % 3 if xx - last_x < 70 else 0  # stagger labels that would collide
        last_x = xx
        d.line([(xx, B - 40 - 14 * row), (xx, B)], fill=(235, 235, 240))
        d.text((xx + 2, B - 54 - 14 * row), str(label)[:12], fill=(235, 235, 240), font=f)
    d.text((L, 8), title, fill=TEXT, font=f)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(path)
    return path


def spectrogram_png(path, x, sr, title='', width=1800, height=480, fmin=20.0, fmax=20000.0, floor_db=-90.0, bands=()):
    """Log-frequency spectrogram (dB, relative to the loudest bin): rumble sits at the bottom,
    harshness at 2-5 kHz, hiss at the top. Gridlines at 50 Hz ... 10 kHz."""
    import audio_io as A
    mono = np.asarray(x, dtype=np.float32)
    mono = mono if mono.ndim == 1 else mono.mean(axis=1)
    duration = len(mono) / sr
    n_fft = 4096
    hop = max(256, int(len(mono) / (width * 1.5)))
    S = A.stft_mag(mono, n_fft, hop)
    db = 20 * np.log10(S + 1e-10)
    db -= db.max()
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    L, R, T, B = 60, width - 20, 28, height - 22
    rows = np.geomspace(fmin, min(fmax, sr / 2), B - T)
    idx = np.clip(np.searchsorted(freqs, rows), 0, len(freqs) - 1)
    cols = np.linspace(0, len(db) - 1, R - L).astype(int)
    v = (db[cols][:, idx].T[::-1] - floor_db) / -floor_db
    img = Image.new('RGB', (width, height), BG)
    img.paste(Image.fromarray(colormap(v)), (L, T))
    d = ImageDraw.Draw(img)
    f = font()
    for hz, label in ((50, '50'), (100, '100'), (200, '200'), (500, '500'), (1000, '1k'), (2000, '2k'), (5000, '5k'), (10000, '10k')):
        if fmin < hz < rows[-1]:
            y = B - (B - T) * np.log(hz / fmin) / np.log(rows[-1] / fmin)
            d.line([(L - 6, y), (L, y)], fill=TEXT)
            d.text((6, y - 7), label, fill=TEXT, font=f)
    for a, b, label in bands:
        xa = L + (R - L) * a / duration
        d.line([(xa, T), (xa, T + 10)], fill=TEXT)
        d.text((xa + 2, T + 2), str(label)[:14], fill=TEXT, font=f)
    step = next(s for s in (1, 2, 5, 10, 15, 30, 60, 120, 300) if duration / s <= 16)
    t = 0.0
    while t <= duration + 1e-6:
        xx = L + (R - L) * t / duration
        d.text((xx + 2, B + 2), fmt(t), fill=TEXT, font=f)
        t += step
    d.text((L, 8), title, fill=TEXT, font=f)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(path)
    return path
