#!/usr/bin/env python3
"""Sound effects with landmarks. numpy + scipy only.

    python tools/py/sfx.py list                                   # recipes, default landmark and role
    python tools/py/sfx.py make whoosh --out audio/sfx/whoosh.wav [--seed 3] [--dur 0.9] [--pitch -2]
    python tools/py/sfx.py pack audio/sfx                         # every recipe, three variations each
    python tools/py/sfx.py info some_library_sound.wav            # measure landmarks of any sound file

The moment you hear in a sound is rarely its first sample. Every sound gets a sidecar JSON with
three measured landmarks (seconds from the start of the file):

    onset  where it becomes audible   -> clicks, pops, beeps, plucks, steps
    peak   its loudest moment          -> whooshes (the pass-by), impacts
    end    where it stops or cuts off  -> risers, reverse cymbals, swells (end on the action)

and the landmark to sync on. mix.py places each sound so that its landmark lands on the action:
    start = action time - landmark            (guizang's rule: sfx start + landmark = action time)

The recipes start from papermotion's published numbers (impact 150->40 Hz, whoosh band-pass
250 Hz->2.5 kHz, beeps as 60-250 ms triangle glides, bell FM ratio 7.1, music box FM ratio 4
index 1.3, Karplus-Strong plucks, pads of three saws +-14 cents low-passed at 850 Hz, snow steps
as 2.3 kHz band-passed noise with crackle) and are implemented here from scratch. Synthesis has
a ceiling: for anything that must sound real, use recorded sounds and measure them with `info`.
Stereo is a mono-compatible mid/side spread (no Haas delays).
"""
import argparse
import hashlib
import json
import os
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io as A  # noqa: E402
from music import SR, bandpass, fade, highpass, lowpass, mtof, saw, sweep_lowpass  # noqa: E402

PENTA = [0, 2, 4, 7, 9]  # notes struck on contact stay consonant


# ─── Building blocks ──────────────────────────────────────────────────────────────────────

def t_axis(dur):
    n = max(1, int(round(dur * SR)))
    return n, np.arange(n) / SR


def expenv(t, tau):
    return np.exp(-t / max(tau, 1e-6))


def sweep_bandpass(x, f0, f1, q=1.4, block=128, curve=None):
    """Band-pass whose centre glides from f0 to f1 (exponentially, or along `curve` 0..1 per block)."""
    out = np.empty_like(x)
    nb = max(1, (len(x) + block - 1) // block)
    zi = np.zeros(2)
    for i in range(nb):
        u = i / max(nb - 1, 1) if curve is None else curve[min(len(curve) - 1, i * block)]
        fc = min(f0 * (f1 / f0) ** u, SR * 0.45)
        w0 = 2 * np.pi * fc / SR
        al = np.sin(w0) / (2 * q)
        b = np.array([al, 0, -al]) / (1 + al)
        a = np.array([1, -2 * np.cos(w0) / (1 + al), (1 - al) / (1 + al)])
        out[i * block:(i + 1) * block], zi = signal.lfilter(b, a, x[i * block:(i + 1) * block], zi=zi)
    return out


def spread(mid, side_amount, rng, pan=0.0):
    """Stereo from mono: a decorrelated side (filtered noise-modulated copy) at side_amount,
    then an equal-power pan. Correlation stays well above 0.3, so mono playback keeps it."""
    side = mid * 0.0
    if side_amount > 0:
        d = int(0.0007 * SR)  # allpass-ish decorrelation: short comb on the side only
        side = np.concatenate([np.zeros(d), mid[:-d]]) - mid
        side = highpass(side, 300) * side_amount
    L, R = mid + side, mid - side
    g = (pan + 1) * np.pi / 4
    return np.stack([L * np.cos(g) * np.sqrt(2), R * np.sin(g) * np.sqrt(2)], axis=1)


def norm(x, peak_db=-3.0):
    return x / (np.abs(x).max() + 1e-12) * 10 ** (peak_db / 20)


def fm(f, ratio, index, t, index_tau=0.6):
    """Two-operator FM: carrier f, modulator f*ratio, index decaying with index_tau."""
    mod = index * expenv(t, index_tau) * np.sin(2 * np.pi * f * ratio * t)
    return np.sin(2 * np.pi * f * t + mod)


def triangle(freq, n):
    ph = np.cumsum(np.broadcast_to(np.asarray(freq, dtype=np.float64) / SR, (n,))) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def penta_note(rng, base=72):
    return base + PENTA[rng.integers(len(PENTA))] + 12 * rng.integers(0, 2)


# ─── Recipes ──────────────────────────────────────────────────────────────────────────────

def impact(rng, dur=1.4, pitch=0.0, bright=0.5, **_):
    """Sine thump 150->40 Hz + a short click + low-passed noise sweeping down."""
    n, t = t_axis(dur)
    k = 2 ** (pitch / 12)
    f = (40 + 110 * np.exp(-t / 0.06)) * k
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(t, 0.35)
    thump = np.tanh(2.2 * thump) / np.tanh(2.2)  # harmonics so phones hear the low end
    click = highpass(rng.normal(size=n), 2000) * expenv(t, 0.004) * 0.6
    noise = sweep_lowpass(rng.normal(size=n), 3000 + 5000 * bright, 180) * expenv(t, 0.25) * 0.5
    x = thump + click + noise
    x[: int(0.0015 * SR)] *= np.linspace(0, 1, int(0.0015 * SR))
    return spread(fade(norm(x), 30), 0.25, rng)


def boom(rng, dur=2.2, pitch=0.0, **_):
    """Sub drop 70->30 Hz with saturation: the floor falling away under a cut."""
    n, t = t_axis(dur)
    f = (30 + 40 * np.exp(-t / 0.4)) * 2 ** (pitch / 12)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(t, 0.7)
    x = np.tanh(2.5 * x) / np.tanh(2.5)
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return spread(fade(norm(x), 40), 0.0, rng)


def whoosh(rng, dur=0.9, pitch=0.0, bright=0.5, **_):
    """Noise through a band-pass gliding 250 Hz -> 2.5 kHz (and back down a little after the
    pass-by), loudest at about 60% of its length, panning across."""
    n, t = t_axis(dur)
    u = t / t[-1]
    shape = np.where(u < 0.6, (u / 0.6) ** 2.4, np.exp(-(u - 0.6) / 0.12))
    k = 2 ** (pitch / 12)
    curve = np.where(u < 0.6, u / 0.6, 1 - 0.35 * (u - 0.6) / 0.4)
    x = sweep_bandpass(rng.normal(size=n), 250 * k, (2500 + 1500 * bright) * k, q=1.2, curve=curve)
    air = highpass(rng.normal(size=n), 4000) * 0.15
    x = (x / (np.abs(x).max() + 1e-9) + air) * shape
    mid = fade(norm(x), 5)
    g = (np.clip(-0.6 + 1.2 * u, -1, 1) + 1) * np.pi / 4  # pans left -> right through the centre
    return np.stack([mid * np.cos(g), mid * np.sin(g)], axis=1) * np.sqrt(2)


def riser(rng, dur=2.5, pitch=0.0, bright=0.6, **_):
    """Noise swell plus a tone gliding up an octave; ends hard (landmark: end)."""
    n, t = t_axis(dur)
    u = t / t[-1]
    noise = sweep_bandpass(rng.normal(size=n), 400, 6000 + 4000 * bright, q=0.9)
    f = mtof(55 + pitch) * 2 ** (u * 1.0)
    tone = saw(f, n) * 0.25 + np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * 0.15
    x = (noise / (np.abs(noise).max() + 1e-9) + lowpass(tone, 1200 + 6000 * u.mean())) * u ** 2.2
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
    return spread(norm(x), 0.3, rng)


def reverse(rng, dur=1.8, bright=0.6, **_):
    """Reverse cymbal: a metallic decay played backwards, cutting off at the end."""
    n, t = t_axis(dur)
    metal = sum(np.sign(np.sin(2 * np.pi * f * 2.3 * t + rng.uniform(0, 6.28))) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = highpass(metal / 6 * 0.6 + rng.normal(size=n), 3000 + 2000 * bright) * expenv(t, dur / 3.2)
    x = x[::-1].copy()
    x[-int(0.003 * SR):] *= np.linspace(1, 0, int(0.003 * SR))
    return spread(norm(x), 0.3, rng)


def pop(rng, pitch=0.0, **_):
    """UI pop: a sine dropping 900 -> 380 Hz in 40 ms."""
    n, t = t_axis(0.16)
    f = (380 + 520 * np.exp(-t / 0.012)) * 2 ** (pitch / 12)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(t, 0.035)
    x += highpass(rng.normal(size=n), 3000) * expenv(t, 0.002) * 0.2
    x[: int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    return spread(fade(norm(x), 4), 0.0, rng)


def click(rng, pitch=0.0, **_):
    """Mouse/switch click: a 4 ms noise tick plus a short 2 kHz ping."""
    n, t = t_axis(0.08)
    x = bandpass(rng.normal(size=n), 1500, 9000) * expenv(t, 0.0015)
    x += 0.35 * np.sin(2 * np.pi * 2100 * 2 ** (pitch / 12) * t) * expenv(t, 0.008)
    return spread(fade(norm(x), 2), 0.0, rng)


def tick(rng, pitch=0.0, **_):
    """A tiny high tick (clock, counter, subtitle typing)."""
    n, t = t_axis(0.03)
    x = highpass(rng.normal(size=n), 5000) * expenv(t, 0.0012)
    x += 0.3 * np.sin(2 * np.pi * 4200 * 2 ** (pitch / 12) * t) * expenv(t, 0.003)
    return spread(fade(norm(x, -6), 1), 0.0, rng)


def beep(rng, dur=0.14, pitch=0.0, glide=7.0, **_):
    """'Voice' beep: a triangle wave gliding `glide` semitones over 60-250 ms."""
    dur = float(np.clip(dur, 0.06, 0.25))
    n, t = t_axis(dur)
    f0 = mtof(penta_note(rng, 76) + pitch)
    f = f0 * 2 ** (glide / 12 * t / t[-1])
    env = np.minimum(1, t / 0.006) * np.minimum(1, (t[-1] - t) / 0.03)
    x = lowpass(triangle(f, n), 6000) * env
    return spread(fade(norm(x, -4), 2), 0.0, rng)


def bell(rng, dur=1.8, pitch=0.0, note=None, **_):
    """Bright bell: FM with an inharmonic ratio of 7.1."""
    n, t = t_axis(dur)
    f = mtof((note if note is not None else penta_note(rng, 84)) + pitch)
    x = fm(f, 7.1, 2.2, t, 0.25) * expenv(t, dur / 3) + 0.3 * np.sin(2 * np.pi * f * 2 * t) * expenv(t, dur / 6)
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return spread(fade(norm(x, -4), 20), 0.2, rng)


def musicbox(rng, dur=1.6, pitch=0.0, note=None, **_):
    """Music-box tine: FM ratio 4, index 1.3."""
    n, t = t_axis(dur)
    f = mtof((note if note is not None else penta_note(rng, 79)) + pitch)
    x = fm(f, 4.0, 1.3, t, 0.15) * expenv(t, dur / 4)
    x[: int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    return spread(fade(norm(x, -4), 20), 0.15, rng)


def pluck_(rng, dur=1.2, pitch=0.0, note=None, bright=0.55, **_):
    """Karplus-Strong string."""
    from music import pluck as ks
    m = (note if note is not None else penta_note(rng, 64)) + pitch
    x = ks(m, dur, rng, decay=0.996, bright=bright)
    return spread(fade(norm(x, -4), 15), 0.2, rng)


def pad(rng, dur=4.0, pitch=0.0, note=None, **_):
    """Ambient bed: three saws +-14 cents per note, low-passed at 850 Hz, slow in and out."""
    n, t = t_axis(dur)
    root = (note if note is not None else 57) + pitch
    x = np.zeros(n)
    for m in (root, root + 7, root + 12):
        for c in (-14, 0, 14):
            x += saw(mtof(m) * 2 ** (c / 1200), n, rng.uniform())
    x = lowpass(lowpass(x, 850), 850)
    env = np.minimum(1, t / min(1.0, dur / 3)) * np.minimum(1, (t[-1] - t) / min(1.5, dur / 3))
    return spread(norm(x * env, -6), 0.35, rng)


def step(rng, pitch=0.0, **_):
    """Snow footstep: band-passed noise around 2.3 kHz with crackle."""
    n, t = t_axis(0.22)
    body = bandpass(rng.normal(size=n), 1600 * 2 ** (pitch / 12), 3200 * 2 ** (pitch / 12)) * (np.minimum(1, t / 0.008) * expenv(t, 0.045))
    crackle = np.zeros(n)
    for _ in range(int(rng.integers(18, 30))):
        i = int(rng.uniform(0.0, 0.12) * SR)
        crackle[i] += rng.uniform(0.3, 1.0) * rng.choice([-1, 1])
    crackle = highpass(crackle, 2500) * expenv(t, 0.08)
    x = body / (np.abs(body).max() + 1e-9) + 0.8 * crackle
    return spread(fade(norm(x, -6), 3), 0.1, rng)


def typing(rng, pitch=0.0, **_):
    """One key press: a plastic 'thock' and a click."""
    n, t = t_axis(0.09)
    thock = bandpass(rng.normal(size=n), 300, 1400) * expenv(t, 0.012)
    clk = highpass(rng.normal(size=n), 3500) * expenv(t, 0.0015) * 0.7
    x = thock / (np.abs(thock).max() + 1e-9) + clk
    return spread(fade(norm(x, -6), 2), 0.0, rng, pan=rng.uniform(-0.2, 0.2))


def shimmer(rng, dur=1.6, pitch=0.0, **_):
    """A quick upward pentatonic arpeggio of bells: sparkle on a reveal (landmark: onset)."""
    n, t = t_axis(dur)
    x = np.zeros(n)
    base = 79 + pitch
    for i, step_ in enumerate([0, 2, 4, 7, 9, 12]):
        o = int(i * 0.045 * SR)
        m = n - o
        tt = np.arange(m) / SR
        x[o:] += fm(mtof(base + step_), 7.1, 1.4, tt, 0.15) * expenv(tt, 0.5) * np.minimum(1, tt / 0.001) * (0.9 ** i)
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return spread(fade(norm(x, -5), 20), 0.35, rng)


# name: (function, default landmark to sync on, default ducking role, description)
RECIPES = {
    'impact': (impact, 'onset', 'transition', 'thump 150->40 Hz + click + falling noise'),
    'boom': (boom, 'onset', 'transition', 'sub drop 70->30 Hz'),
    'whoosh': (whoosh, 'peak', 'transition', 'band-pass sweep 250 Hz->2.5 kHz, panning'),
    'riser': (riser, 'end', None, 'noise + tone rising an octave, hard stop'),
    'reverse': (reverse, 'end', None, 'reverse cymbal into the hit'),
    'pop': (pop, 'onset', 'click', 'UI pop, sine 900->380 Hz'),
    'click': (click, 'onset', 'click', 'mouse/switch click'),
    'tick': (tick, 'onset', None, 'tiny high tick'),
    'beep': (beep, 'onset', 'click', 'triangle glide, 60-250 ms'),
    'bell': (bell, 'onset', 'notify', 'FM bell, ratio 7.1'),
    'musicbox': (musicbox, 'onset', 'notify', 'FM tine, ratio 4, index 1.3'),
    'pluck': (pluck_, 'onset', None, 'Karplus-Strong string'),
    'pad': (pad, 'onset', None, 'three saws +-14 cents, low-pass 850 Hz'),
    'step': (step, 'onset', None, 'snow footstep, 2.3 kHz noise + crackle'),
    'typing': (typing, 'onset', 'typing', 'one key press'),
    'shimmer': (shimmer, 'onset', 'notify', 'pentatonic bell arpeggio'),
}


# ─── Landmarks ────────────────────────────────────────────────────────────────────────────

def envelope_db(x, sr=SR, win=0.002):
    mono = x.mean(axis=1) if x.ndim == 2 else x
    k = max(1, int(win * sr))
    p = np.convolve(mono.astype(np.float64) ** 2, np.ones(k) / k, mode='same')
    return 10 * np.log10(p + 1e-12)


def loudness_max(x, sr=SR):
    """Loudest momentary loudness (LUFS, 400 ms blocks every 10 ms): how loud the sound feels."""
    lufs, _, _ = A.block_loudness(x, sr, block=0.4, hop=0.01)
    return round(float(lufs.max()), 1)


def landmarks(x, sr=SR):
    """onset / peak / end / tail in seconds, measured from the sound itself."""
    e = envelope_db(x, sr)
    k = max(1, int(0.01 * sr))
    smooth = 10 * np.log10(np.convolve(10 ** (e / 10), np.ones(k) / k, mode='same') + 1e-12)
    pk = int(np.argmax(smooth))
    top = smooth[pk]
    above = np.flatnonzero(e >= top - 24)
    onset = int(above[0]) if len(above) else 0
    end = int(above[-1]) if len(above) else len(e) - 1
    audible = np.flatnonzero(e >= top - 60)
    tail = int(audible[-1]) if len(audible) else len(e) - 1
    return {'onset': round(onset / sr, 4), 'peak': round(pk / sr, 4), 'end': round(end / sr, 4), 'tail': round(tail / sr, 4)}


def guess_sync(lm):
    """Default landmark for an unknown sound: risers end on the action, swooshes peak on it."""
    if lm['peak'] - lm['onset'] > 0.3 and lm['end'] - lm['peak'] < 0.1:
        return 'end'
    if lm['peak'] - lm['onset'] > 0.08:
        return 'peak'
    return 'onset'


def seed_for(kind, key):
    return int(hashlib.sha1(f'{kind}:{key}'.encode()).hexdigest()[:8], 16)


def make(kind, seed=0, **params):
    """Render a recipe. Returns (stereo float32 at 48 kHz, sidecar dict)."""
    if kind not in RECIPES:
        raise KeyError(f'unknown sound "{kind}" (have: {", ".join(RECIPES)})')
    fn, sync, role, _ = RECIPES[kind]
    rng = np.random.default_rng(seed)
    p = {k: v for k, v in params.items() if v is not None}
    x = fn(rng, **p).astype(np.float32)
    lm = landmarks(x)
    meta = {'kind': kind, 'seed': seed, 'params': p, 'sr': SR, 'duration': round(len(x) / SR, 4), 'landmarks': lm,
            'loudness': loudness_max(x), 'sync': sync, 'role': role, 'generator': 'claude-studio tools/py/sfx.py'}
    return x, meta


def sidecar_path(wav):
    return os.path.splitext(wav)[0] + '.json'


def write(path, x, meta):
    A.save_wav(path, x, SR, bits=24)
    with open(sidecar_path(path), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return path


def describe_file(path, sync=None):
    """Measure a sound file (any format ffmpeg reads) and write its sidecar."""
    x = A.load(path, sr=SR)
    lm = landmarks(x)
    old = {}
    if os.path.exists(sidecar_path(path)):  # keep what a recipe or a person decided (kind, sync, role, notes)
        try:
            with open(sidecar_path(path), encoding='utf-8') as f:
                old = json.load(f)
        except (OSError, ValueError):
            old = {}
    meta = {**old, 'kind': old.get('kind', 'file'), 'file': os.path.basename(path), 'sr': SR, 'duration': round(len(x) / SR, 4), 'landmarks': lm,
            'loudness': loudness_max(x), 'sync': sync or old.get('sync') or guess_sync(lm), 'role': old.get('role'),
            'peakDb': round(float(20 * np.log10(np.abs(x).max() + 1e-12)), 1)}
    with open(sidecar_path(path), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser(description='Sound effects with landmarks.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    p = sub.add_parser('make')
    p.add_argument('kind', choices=list(RECIPES))
    p.add_argument('--out', required=True)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--dur', type=float)
    p.add_argument('--pitch', type=float, help='semitones')
    p.add_argument('--note', type=int, help='MIDI note (bell, musicbox, pluck, pad)')
    p.add_argument('--bright', type=float, help='0-1')
    p = sub.add_parser('pack')
    p.add_argument('dir')
    p.add_argument('--variations', type=int, default=3)
    p = sub.add_parser('info')
    p.add_argument('file')
    p.add_argument('--sync', choices=['onset', 'peak', 'end'])
    a = ap.parse_args(argv)
    if a.cmd == 'list':
        for k, (_, sync, role, desc) in RECIPES.items():
            print(f'  {k:9s} sync {sync:5s} duck {str(role or "-"):10s} {desc}')
    elif a.cmd == 'make':
        x, meta = make(a.kind, a.seed, dur=a.dur, pitch=a.pitch, note=a.note, bright=a.bright)
        write(a.out, x, meta)
        lm = meta['landmarks']
        print(f'  {a.out}: {meta["duration"]:.2f} s, onset {lm["onset"]:.3f} peak {lm["peak"]:.3f} end {lm["end"]:.3f}; sync on {meta["sync"]}')
    elif a.cmd == 'pack':
        for k in RECIPES:
            for v in range(1, a.variations + 1):
                x, meta = make(k, seed=v)
                write(os.path.join(a.dir, f'{k}_{v:02d}.wav'), x, meta)
        print(f'  {len(RECIPES) * a.variations} sounds → {a.dir}')
    elif a.cmd == 'info':
        if not os.path.isfile(a.file):
            if a.file in RECIPES:  # a recipe name: show what it makes
                x, meta = make(a.file, 1)
                lm = meta['landmarks']
                print(f'  {a.file} (recipe, seed 1): {meta["duration"]:.2f} s, onset {lm["onset"]:.3f} peak {lm["peak"]:.3f} end {lm["end"]:.3f}; sync on {meta["sync"]}, ducks as {meta.get("role") or "-"}')
                print(f'  {RECIPES[a.file][3]}')
                return 0
            raise SystemExit(f'  no such file: {a.file} (info measures a sound file; recipes: {", ".join(RECIPES)})')
        meta = describe_file(a.file, a.sync)
        lm = meta['landmarks']
        print(f'  {a.file}: {meta["duration"]:.2f} s, onset {lm["onset"]:.3f} peak {lm["peak"]:.3f} end {lm["end"]:.3f}, peak {meta["peakDb"]} dBFS; sync on {meta["sync"]} → {sidecar_path(a.file)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
