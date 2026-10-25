#!/usr/bin/env python3
"""Procedural, rights-clean music with ground truth. numpy + scipy only.

    python tools/py/music.py song.wav                       # 'pop' plan, 112 BPM, A minor
    python tools/py/music.py song.wav --plan drive --bpm 128 --key E --seed 3
    python tools/py/music.py song.wav --plan-file plan.json --truth truth.json
    python tools/py/music.py song.wav --stems stems/        # also drums / bass / vocals / other

Next to the song it writes a ground-truth JSON: every beat, downbeat, section, drum hit, lead
note onset ("vocal"), stop and impact, exactly where they were placed. The analyser is tested
against these files, and the examples use the songs as soundtracks you are free to reuse.

It is a practice and demo generator, not a composer: drums, bass, pad, plucked arpeggios and a
vocal-like formant lead, mixed to -14 LUFS / -1 dBTP. For real work use real music.
"""
import argparse
import json
import os
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io as A  # noqa: E402

SR = A.SR
NOTE = {'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11}
SCALES = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10]}
PROGRESSIONS = {
    'minor': {'intro': [1, 6, 3, 7], 'verse': [1, 6, 3, 7], 'pre': [4, 5, 6, 7], 'chorus': [6, 3, 7, 1], 'break': [6, 7], 'bridge': [4, 1, 6, 7], 'outro': [1, 6, 3, 1]},
    'major': {'intro': [1, 5, 6, 4], 'verse': [1, 5, 6, 4], 'pre': [2, 4, 5, 5], 'chorus': [4, 1, 5, 6], 'break': [4, 5], 'bridge': [6, 4, 1, 5], 'outro': [1, 5, 4, 1]},
}
PLANS = {
    'pop': {'bpm': 112, 'key': 'A', 'mode': 'minor', 'sections': [
        {'name': 'intro', 'bars': 4, 'energy': 2},
        {'name': 'verse', 'bars': 8, 'energy': 4},
        {'name': 'pre', 'bars': 4, 'energy': 6, 'build': True, 'stop': True},
        {'name': 'chorus', 'bars': 8, 'energy': 9, 'impact': True},
        {'name': 'break', 'bars': 2, 'energy': 1},
        {'name': 'chorus', 'bars': 8, 'energy': 10, 'impact': True},
        {'name': 'outro', 'bars': 4, 'energy': 3},
    ]},
    'short': {'bpm': 120, 'key': 'D', 'mode': 'minor', 'sections': [
        {'name': 'intro', 'bars': 2, 'energy': 2},
        {'name': 'verse', 'bars': 4, 'energy': 4},
        {'name': 'pre', 'bars': 2, 'energy': 6, 'build': True, 'stop': True},
        {'name': 'chorus', 'bars': 6, 'energy': 9, 'impact': True},
        {'name': 'outro', 'bars': 2, 'energy': 3},
    ]},
    'drive': {'bpm': 128, 'key': 'E', 'mode': 'minor', 'sections': [
        {'name': 'intro', 'bars': 4, 'energy': 3},
        {'name': 'verse', 'bars': 8, 'energy': 5},
        {'name': 'pre', 'bars': 4, 'energy': 7, 'build': True},
        {'name': 'chorus', 'bars': 8, 'energy': 10, 'impact': True},
        {'name': 'outro', 'bars': 4, 'energy': 4},
    ]},
    'full': {'bpm': 104, 'key': 'G', 'mode': 'major', 'sections': [
        {'name': 'intro', 'bars': 4, 'energy': 2},
        {'name': 'verse', 'bars': 8, 'energy': 4},
        {'name': 'pre', 'bars': 4, 'energy': 6, 'build': True},
        {'name': 'chorus', 'bars': 8, 'energy': 8, 'impact': True},
        {'name': 'verse', 'bars': 8, 'energy': 5},
        {'name': 'pre', 'bars': 4, 'energy': 6, 'build': True, 'stop': True},
        {'name': 'chorus', 'bars': 8, 'energy': 9, 'impact': True},
        {'name': 'bridge', 'bars': 8, 'energy': 5},
        {'name': 'chorus', 'bars': 8, 'energy': 10, 'impact': True},
        {'name': 'outro', 'bars': 4, 'energy': 3},
    ]},
    'chill': {'bpm': 86, 'key': 'F', 'mode': 'major', 'swing': 0.12, 'sections': [
        {'name': 'intro', 'bars': 2, 'energy': 2},
        {'name': 'verse', 'bars': 8, 'energy': 4},
        {'name': 'chorus', 'bars': 8, 'energy': 6},
        {'name': 'outro', 'bars': 4, 'energy': 3},
    ]},
}


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=np.float64) - 69) / 12)


# ─── Oscillators, envelopes, filters ──────────────────────────────────────────────────────

def saw(freq, n, phase=0.0):
    """Band-limited sawtooth (polyBLEP). freq: Hz, scalar or per-sample array."""
    dt = np.broadcast_to(np.asarray(freq, dtype=np.float64) / SR, (n,))
    ph = (phase + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    a = ph < dt
    t = ph[a] / dt[a]
    y[a] -= t + t - t * t - 1
    b = ph > 1 - dt
    t = (ph[b] - 1) / dt[b]
    y[b] -= t * t + t + t + 1
    return y


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.1, hold=None):
    """ADSR over n samples; the release starts at `hold` seconds (default: n - r)."""
    t = np.arange(n) / SR
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    if rel.any():
        level = e[np.argmax(rel) - 1] if np.argmax(rel) > 0 else e[0]
        e[rel] = level * np.clip(1 - (t[rel] - hold) / max(r, 1e-6), 0, 1)
    return e


def fade(x, ms=3.0):
    k = min(len(x) // 2, int(SR * ms / 1000))
    if k > 0:
        ramp = np.linspace(0, 1, k)
        x[:k] *= ramp
        x[-k:] *= ramp[::-1]
    return x


def lowpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x)


def highpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)


def shelf(x, f0, gain_db, high=True):
    """RBJ shelving filter (slope 1) applied along axis 0."""
    A_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    cw, al = np.cos(w0), np.sin(w0) / 2 * np.sqrt(2)
    sa = 2 * np.sqrt(A_) * al
    sgn = 1 if high else -1
    b = [A_ * ((A_ + 1) + sgn * (A_ - 1) * cw + sa), -2 * sgn * A_ * ((A_ - 1) + sgn * (A_ + 1) * cw), A_ * ((A_ + 1) + sgn * (A_ - 1) * cw - sa)]
    a = [(A_ + 1) - sgn * (A_ - 1) * cw + sa, 2 * sgn * ((A_ - 1) - sgn * (A_ + 1) * cw), (A_ + 1) - sgn * (A_ - 1) * cw - sa]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def sweep_lowpass(x, f_start, f_end, block=256):
    """Low-pass whose cutoff glides exponentially from f_start to f_end (filter state carried)."""
    out = np.empty_like(x)
    nb = max(1, (len(x) + block - 1) // block)
    zi = np.zeros((1, 2))
    for i in range(nb):
        fc = f_start * (f_end / f_start) ** (i / max(nb - 1, 1))
        sos = signal.butter(2, min(fc, SR * 0.45), 'low', fs=SR, output='sos')
        out[i * block:(i + 1) * block], zi = signal.sosfilt(sos, x[i * block:(i + 1) * block], zi=zi)
    return out


# ─── Instruments ──────────────────────────────────────────────────────────────────────────

def kick(rng):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 54 + 100 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17)
    click = highpass(rng.normal(size=n), 2500) * np.exp(-t / 0.003) * 0.25
    x = np.tanh(1.6 * (body + click)) / np.tanh(1.6)
    return fade(x, 1)


def snare(rng):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    tone = 0.6 * np.sin(2 * np.pi * 186 * t) * np.exp(-t / 0.055) + 0.25 * np.sin(2 * np.pi * 334 * t) * np.exp(-t / 0.035)
    noise = bandpass(rng.normal(size=n), 1500, 8000) * np.exp(-t / 0.13)
    x = tone + 0.8 * noise / (np.abs(noise).max() + 1e-9)
    return fade(x / np.abs(x).max(), 1)


def clap(rng):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        m = t >= off
        e[m] += np.exp(-(t[m] - off) / 0.007)
    m = t >= 0.028
    e[m] += 0.7 * np.exp(-(t[m] - 0.028) / 0.11)
    x = bandpass(rng.normal(size=n), 900, 4200) * e
    return fade(x / np.abs(x).max(), 1)


def hat(rng, open_=False):
    n = int((0.42 if open_ else 0.09) * SR)
    t = np.arange(n) / SR
    metal = sum(np.sign(np.sin(2 * np.pi * f * 1.6 * t + rng.uniform(0, 6.28))) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = highpass(bandpass(metal / 6 + 0.6 * rng.normal(size=n), 6000, 16000), 7000)
    x *= np.exp(-t / (0.22 if open_ else 0.028))
    return fade(x / np.abs(x).max(), 1)


def crash(rng):
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    metal = sum(np.sign(np.sin(2 * np.pi * f * 2.3 * t + rng.uniform(0, 6.28))) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = highpass(metal / 6 * 0.5 + rng.normal(size=n), 3500) * np.exp(-t / 0.9)
    return fade(x / np.abs(x).max(), 2)


def sub_drop(rng):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    f = 32 + 48 * np.exp(-t / 0.25)
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5), 2)


def riser(rng, dur):
    """Noise swell that ends exactly at its last sample (landmark = end)."""
    n = int(dur * SR)
    x = rng.normal(size=n)
    x = sweep_lowpass(highpass(x, 300), 500, 9000)
    e = np.linspace(0, 1, n) ** 2.2
    return fade(x / (np.abs(x).max() + 1e-9) * e, 2)


def bass_note(midi, dur, cutoff, rng):
    n = int(dur * SR)
    f = mtof(midi)
    x = 0.75 * saw(f, n, rng.uniform()) + 0.45 * np.sin(2 * np.pi * f * np.arange(n) / SR)
    x = np.tanh(1.8 * lowpass(x, cutoff)) / np.tanh(1.8)  # saturation: 2nd/3rd harmonics reach small speakers
    return fade(x * env_adsr(n, 0.004, 0.12, 0.7, 0.05), 2)


def pad_chord(notes, dur, cutoff, rng):
    n = int(dur * SR)
    x = np.zeros(n)
    for m in notes:
        for cents in (-14, 0, 14):
            x += saw(mtof(m) * 2 ** (cents / 1200), n, rng.uniform())
    x = lowpass(x, cutoff, 2)
    return fade(x / (3 * len(notes)) * env_adsr(n, 0.35, 0.6, 0.8, 0.45), 4)


def pluck(midi, dur, rng, decay=0.994, bright=0.55):
    """Karplus-Strong, computed one period at a time."""
    n = int(dur * SR)
    period = max(2, int(round(SR / mtof(midi) - 0.5)))
    y = np.zeros(n + period + 2)  # y[0] stays 0 so the first period can look one sample back
    y[1:period + 1] = lowpass(rng.uniform(-1, 1, period), 1500 + 7000 * bright)
    for s in range(period + 1, len(y), period):
        e = min(s + period, len(y))
        y[s:e] = decay * 0.5 * (y[s - period:e - period] + y[s - period - 1:e - period - 1])
    y = y[1:n + 1]
    return fade(y / (np.abs(y).max() + 1e-9), 2)


VOWELS = {'a': (730, 1090, 2440), 'o': (570, 840, 2410), 'e': (530, 1840, 2480), 'u': (440, 1020, 2240), 'i': (390, 1990, 2550)}


def lead_note(midi, dur, vowel, rng, scoop=True):
    """A vocal-like line: saw with vibrato and a pitch scoop through three formant resonators."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    cents = 22 * np.sin(2 * np.pi * 5.3 * t + rng.uniform(0, 6.28)) * np.clip((t - 0.18) / 0.25, 0, 1)
    if scoop:
        cents -= 45 * np.exp(-t / 0.05)
    src = saw(mtof(midi) * 2 ** (cents / 1200), n, rng.uniform()) + 0.05 * rng.normal(size=n)
    x = np.zeros(n)
    for f, g in zip(VOWELS[vowel], (1.0, 0.55, 0.3)):
        x += g * bandpass(src, f / 1.18, f * 1.18, 1)
    x = highpass(x, 180)
    return fade(x * env_adsr(n, 0.025, 0.2, 0.85, min(0.12, dur * 0.4)), 3)


# ─── Arrangement ──────────────────────────────────────────────────────────────────────────

class Bus:
    def __init__(self, n):
        self.x = np.zeros((n, 2))

    def add(self, t, mono, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= len(self.x) or i + len(mono) <= 0:
            return
        a, b = max(0, i), min(len(self.x), i + len(mono))
        seg = mono[a - i:b - i] * gain
        ang = (pan + 1) * np.pi / 4
        self.x[a:b, 0] += seg * np.cos(ang)
        self.x[a:b, 1] += seg * np.sin(ang)


def chord_notes(root_pc, scale, degree):
    pcs = [(root_pc + scale[(degree - 1 + k) % 7] + 12 * ((degree - 1 + k) // 7)) for k in (0, 2, 4)]
    return pcs


def voice(pcs, prev):
    """Closest inversion to the previous voicing, inside MIDI 52..74."""
    pcs = [p % 12 for p in pcs]
    best, cost = None, 1e9
    for inv in range(3):
        order = pcs[inv:] + pcs[:inv]
        for octave in range(3, 7):
            cand, last = [], -1
            for p in order:
                m = p + 12 * octave
                while m <= last:
                    m += 12
                cand.append(m)
                last = m
            if cand[0] < 52 or cand[-1] > 74:
                continue
            c = sum(abs(a - b) for a, b in zip(cand, prev)) if prev else abs(sum(cand) / 3 - 62)
            if c < cost:
                best, cost = cand, c
    return best or [pcs[0] + 57, pcs[1] + 60, pcs[2] + 64]


MOTIFS = [
    [(0, 3), (4, 2), (6, 2), (8, 4), (14, 2), (16, 3), (20, 2), (22, 2), (24, 6)],
    [(2, 2), (4, 2), (6, 4), (10, 2), (12, 4), (18, 2), (20, 2), (22, 2), (24, 7)],
    [(0, 2), (2, 2), (4, 4), (8, 2), (10, 2), (12, 4), (16, 6), (24, 4), (28, 2)],
    [(0, 4), (6, 2), (8, 2), (10, 2), (12, 4), (16, 2), (18, 2), (20, 4), (26, 5)],
]


def melody(bars, chords, scale_pcs, rng, center, sixteenths):
    """Two-bar phrases: chord tones on strong 16ths, stepwise scale tones between, long endings."""
    notes = []
    pool = sorted({p + 12 * o for p in scale_pcs for o in range(3, 8)})
    prev = center
    motif = MOTIFS[rng.integers(len(MOTIFS))]
    for phrase in range(0, bars, 2):
        if phrase == bars - 2 and bars >= 4:
            motif_now = MOTIFS[(MOTIFS.index(motif) + 1) % len(MOTIFS)]
        else:
            motif_now = motif
        for k, (s16, d16) in enumerate(motif_now):
            bar = phrase + s16 // sixteenths
            if bar >= bars:
                break
            c_root, c_third, chord = chords[bar]
            last = k == len(motif_now) - 1
            arch = center + 3 * np.sin(np.pi * (k + 0.5) / len(motif_now))
            if s16 % 4 == 0 or last:
                tones = [m for m in pool if m % 12 in [c % 12 for c in chord] and center - 9 <= m <= center + 9]
                if last:
                    tones = [m for m in tones if m % 12 in (c_root, c_third)] or tones
                target = 0.6 * prev + 0.4 * arch
                m = min(tones, key=lambda v: abs(v - target) + rng.uniform(0, 1.5))
            else:
                i = int(np.searchsorted(pool, prev))
                step = rng.choice([-2, -1, -1, 1, 1, 2]) if prev < arch + 2 else rng.choice([-2, -1, -1, 1])
                m = pool[int(np.clip(i + step, 0, len(pool) - 1))]
                m = int(np.clip(m, center - 9, center + 9))
            notes.append((phrase * sixteenths + s16, d16, int(m)))
            prev = m
    return notes


def render(plan, seed=7, lead_in=0.5, drift=0.0, tail=2.5, want_stems=False):
    rng = np.random.default_rng(seed)
    bpm, bpb = float(plan['bpm']), int(plan.get('beatsPerBar', 4))
    mode = plan.get('mode', 'minor')
    scale = SCALES[mode]
    root = NOTE[plan.get('key', 'A').upper()]
    swing = float(plan.get('swing', 0.0))
    sections = plan['sections']
    total_beats = sum(s['bars'] for s in sections) * bpb
    # beat grid, optionally with a smooth tempo drift (+-drift fraction) to test drift detection
    spb = 60.0 / bpm
    k = np.arange(total_beats + 1)
    factor = 1 + drift * np.sin(2 * np.pi * k / max(total_beats, 1))
    beat_t = lead_in + np.concatenate([[0], np.cumsum(spb / factor[:-1])])
    end_t = beat_t[-1]
    n = int((end_t + tail) * SR)
    sixteenths = 4 * bpb

    def T(beat, sub16=0.0):
        """Time of a 16th position inside a beat, with swing on the off-16ths."""
        b = int(beat)
        frac = (beat - b) + sub16 / 4
        b += int(frac)
        frac -= int(frac)
        q = frac * 4
        if swing and abs(q - round(q)) < 1e-6:
            frac += swing * {0: 0.0, 1: 0.5, 2: 1.0, 3: 0.5}[int(round(q)) % 4]
        b = min(b, total_beats - 1)
        return beat_t[b] + frac * (beat_t[b + 1] - beat_t[b])

    drums, bass, pad, plk, lead, fx = (Bus(n) for _ in range(6))
    truth = {'kick': [], 'snare': [], 'hat': [], 'vocal': []}
    stops, impacts, sec_out = [], [], []
    labels = {}
    jit = lambda: float(np.clip(rng.normal(0, 0.0018), -0.004, 0.004))
    samples = {'kick': [kick(rng) for _ in range(3)], 'snare': [snare(rng) for _ in range(3)], 'clap': [clap(rng) for _ in range(2)],
               'hat': [hat(rng) for _ in range(4)], 'ohat': [hat(rng, True) for _ in range(2)]}
    pick = lambda name: samples[name][rng.integers(len(samples[name]))]
    prog_all = PROGRESSIONS[mode]
    prev_voicing = None
    bar0 = 0
    duck = np.ones(n)
    scale_pcs = [(root + s) % 12 for s in scale]
    for si, sec in enumerate(sections):
        name, bars, E = sec['name'], int(sec['bars']), float(sec.get('energy', 5))
        labels.setdefault(name, chr(ord('A') + len(labels)))
        start_beat = bar0 * bpb
        sec_start, sec_end = beat_t[start_beat], beat_t[start_beat + bars * bpb]
        sec_out.append({'name': name, 'label': labels[name], 'start': round(float(sec_start), 6), 'end': round(float(sec_end), 6), 'bars': bars, 'energy': E})
        prog = sec.get('progression') or prog_all.get(name, prog_all['verse'])
        chords = []
        for b in range(bars):
            pcs = chord_notes(root, scale, prog[b % len(prog)])
            prev_voicing = voice(pcs, prev_voicing)
            chords.append((pcs[0] % 12, pcs[1] % 12, prev_voicing))
        stop_from = (start_beat + bars * bpb - (1 if sec.get('stop') else 0)) if sec.get('stop') else None
        if sec.get('stop'):
            stops.append([round(float(beat_t[stop_from]), 6), round(float(sec_end), 6)])
        if sec.get('impact'):
            impacts.append(round(float(sec_start), 6))
            fx.add(sec_start, crash(rng), 0.32, 0.15)
            fx.add(sec_start, sub_drop(rng), 0.55)
        if sec.get('build'):
            dur = sec_end - sec_start if bars <= 2 else beat_t[start_beat + bars * bpb] - beat_t[start_beat + (bars - 2) * bpb]
            r = riser(rng, dur)
            fx.add(sec_end - len(r) / SR, r, 0.22)
        for b in range(bars):
            bar_beat = start_beat + b * bpb
            chord_root, _, chord = chords[b]
            last_bars = bars - b
            for q in range(bpb):
                beat = bar_beat + q
                if stop_from is not None and beat >= stop_from:
                    continue
                t = beat_t[beat]
                # kick
                kick_beats = []
                if E >= 8:
                    kick_beats = list(range(bpb))
                elif E >= 5:
                    kick_beats = [0, 2] if bpb == 4 else [0]
                elif E >= 3:
                    kick_beats = [0] if (b % 2 == 0 or bpb != 4) else [0, 2]
                if q in kick_beats:
                    tt = t + jit()
                    drums.add(tt, pick('kick'), 0.9 * (1.0 if q == 0 else 0.85))
                    truth['kick'].append(round(float(tt), 6))
                    if E >= 7:
                        i = int(tt * SR)
                        m = min(n - i, int(0.18 * SR))
                        if m > 0:
                            duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.45 * np.exp(-np.arange(m) / (0.06 * SR)))
                if E >= 5 and bpb == 4 and q == 1 and E < 8 and b % 2 == 1:
                    tt = T(beat, 2) + jit()
                    drums.add(tt, pick('kick'), 0.55)
                    truth['kick'].append(round(float(tt), 6))
                # snare / clap on the backbeat
                back = (q % 2 == 1) if bpb == 4 else (q == bpb - 1)
                if E >= 5 and back:
                    tt = t + jit()
                    drums.add(tt, pick('snare'), 0.6, -0.05)
                    if E >= 8:
                        drums.add(tt + 0.004, pick('clap'), 0.38, 0.1)
                    truth['snare'].append(round(float(tt), 6))
                # build: snare roll in the last two bars
                if sec.get('build') and last_bars <= 2:
                    subdiv = 2 if last_bars == 2 else 4
                    for s in range(subdiv):
                        if s == 0 and back and E >= 5:
                            continue
                        tt = T(beat, s * 4 / subdiv) + jit()
                        prog_ = (b - (bars - 2) + (q + s / subdiv) / bpb) / 2
                        drums.add(tt, pick('snare'), 0.16 + 0.32 * prog_, 0.05)
                        truth['snare'].append(round(float(tt), 6))
                # hats
                if E >= 3:
                    per = 4 if E >= 7 else 2
                    for s in range(per):
                        tt = T(beat, s * 4 / per) + jit()
                        if E >= 8 and per == 4 and s == 2:
                            drums.add(tt, pick('ohat'), 0.16, 0.25)
                        else:
                            accent = 1.0 if s % 2 == 1 else 0.7
                            drums.add(tt, pick('hat'), (0.13 if E < 7 else 0.15) * accent * rng.uniform(0.85, 1.1), 0.25)
                        truth['hat'].append(round(float(tt), 6))
                # bass
                if E >= 3:
                    root_m = chord_root + 36
                    if root_m > 45:
                        root_m -= 12
                    cutoff = 520 + 90 * E
                    if E >= 8:
                        for s in (2,):
                            tt = T(beat, s)
                            bass.add(tt, bass_note(root_m + (12 if q == bpb - 1 else 0), (beat_t[beat + 1] - beat_t[beat]) * 0.45, cutoff, rng), 0.55)
                    elif E >= 5:
                        for s in (0, 2):
                            tt = T(beat, s)
                            bass.add(tt, bass_note(root_m, (beat_t[beat + 1] - beat_t[beat]) * 0.42, cutoff, rng), 0.5 if s == 0 else 0.38)
                    elif q == 0:
                        bass.add(t, bass_note(root_m, (beat_t[min(beat + bpb, total_beats)] - t) * 0.9, cutoff, rng), 0.5)
                # plucked arpeggio
                if E >= 2 and name != 'break':
                    per = 4 if E >= 6 else 2
                    tones = chord + [chord[0] + 12]
                    for s in range(per):
                        idx = (q * per + s) % len(tones)
                        tt = T(beat, s * 4 / per)
                        plk.add(tt, pluck(tones[idx] + 12, 0.7, rng, 0.993, 0.35 + 0.05 * E), 0.16 + 0.01 * E, (-0.35 if idx % 2 else 0.35))
            # pad: one chord per bar
            if stop_from is not None and bar_beat + bpb > stop_from:
                dur = beat_t[stop_from] - beat_t[bar_beat]
            else:
                dur = beat_t[bar_beat + bpb] - beat_t[bar_beat] + 0.35
            cutoff = 900 + 320 * E
            if sec.get('build'):
                cutoff *= 1 + 1.5 * (b / max(bars - 1, 1))
            pad.add(beat_t[bar_beat], pad_chord(chord, dur, cutoff, rng), 0.42 + 0.03 * E)
        # lead melody
        if name in ('verse', 'chorus', 'bridge') and E >= 4:
            center = 69 if name == 'chorus' else 66
            vowels = list('aoeaui') if name == 'verse' else list('aaoae')
            for vi, (s16, d16, m) in enumerate(melody(bars, chords, scale_pcs, rng, center, sixteenths)):
                beat = start_beat + s16 // 4
                if stop_from is not None and beat >= stop_from:
                    continue
                tt = T(beat, s16 % 4)
                end_beat = start_beat + (s16 + d16) / 4
                eb = min(int(end_beat), total_beats - 1)
                t_end = beat_t[eb] + (end_beat - int(end_beat)) * (beat_t[eb + 1] - beat_t[eb])
                lead.add(tt, lead_note(m, max(0.12, (t_end - tt) * 0.92), vowels[vi % len(vowels)], rng), 0.5 if name == 'chorus' else 0.42)
                truth['vocal'].append(round(float(tt), 6))
        bar0 += bars

    # mix
    reverb_ir = make_ir(rng, 2.2)
    bass.x = lowpass(bass.x.T, 1800).T * duck[:, None]
    pad.x = highpass(pad.x.T, 150).T * duck[:, None]
    plk.x = highpass(plk.x.T, 220).T * (0.5 + 0.5 * duck[:, None])
    lead.x = highpass(lead.x.T, 200).T
    verb = lambda y: np.stack([signal.oaconvolve(y[:, c], reverb_ir[:, c])[:n] for c in range(2)], axis=1)
    parts = {  # each part keeps its own reverb return, so the stems add up to the mix
        'drums': 0.85 * drums.x + 0.35 * verb(0.08 * drums.x),
        'bass': 0.8 * bass.x,
        'vocals': 1.0 * lead.x + 0.35 * verb(0.26 * lead.x),
        'other': 0.6 * pad.x + 0.75 * plk.x + 0.8 * fx.x + 0.35 * verb(0.22 * pad.x + 0.3 * plk.x + 0.15 * fx.x),
    }
    master_eq = lambda y: shelf(highpass(y.T, 28).T, 3500, 2.5)
    mix = master_eq(sum(parts.values()))
    g = section_gain(mix, sec_out)
    g = g * glue_gain(mix * g[:, None])
    pre = mix * g[:, None]
    mix = A.normalize(pre, SR, -14.0, -1.0)
    stems = None
    if want_stems:  # same EQ and gain riding as the mix; the final limiter is left out
        k = 10 ** ((A.integrated_lufs(mix, SR) - A.integrated_lufs(pre, SR)) / 20)
        stems = {name: (master_eq(y) * (g * k)[:, None]).astype(np.float32) for name, y in parts.items()}
    truth_out = {
        'version': 1,
        'generator': 'claude-studio tools/py/music.py',
        'seed': seed,
        'sr': SR,
        'duration': round(n / SR, 6),
        'bpm': bpm,
        'beatsPerBar': bpb,
        'leadIn': lead_in,
        'drift': drift,
        'swing': swing,
        'key': plan.get('key', 'A'),
        'mode': mode,
        'beats': [round(float(x), 6) for x in beat_t[:-1]],
        'downbeats': [round(float(x), 6) for x in beat_t[:-1:bpb]],
        'end': round(float(end_t), 6),
        'sections': sec_out,
        'events': {k: sorted(v) for k, v in truth.items()},
        'stops': stops,
        'impacts': impacts,
        'plan': plan,
    }
    return mix, truth_out, stems


def section_gain(x, sections, crossfade=0.05):
    """Gain curve riding each section toward a loudness set by its energy (0.9 LU per step below 10)."""
    gains = []
    for s in sections:
        seg = x[int(s['start'] * SR):int(s['end'] * SR)]
        cur = A.integrated_lufs(seg, SR) if len(seg) > SR // 2 else -70
        want = -14 - 0.9 * (10 - s['energy'])
        gains.append(10 ** (np.clip(want - cur, -12, 12) / 20) if cur > -60 else 1.0)
    ref = max(gains)
    g = np.full(len(x), gains[-1] / ref)
    k = int(crossfade * SR)
    for s, gs in zip(sections, gains):
        a, b = int(s['start'] * SR), int(s['end'] * SR)
        g[a:b] = gs / ref
    return ndimage_smooth(g, k)


def ndimage_smooth(g, k):
    if k < 2:
        return g
    kernel = np.ones(k) / k
    return np.convolve(np.pad(g, (k // 2, k - k // 2 - 1), mode='edge'), kernel, mode='valid')


def make_ir(rng, seconds):
    """Stereo reverb impulse: decorrelated noise, exponential decay, darker as it decays."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.normal(size=(n, 2)) * np.exp(-t / (seconds / 6.9))[:, None]
    early = int(0.02 * SR)
    ir[:early] = 0
    dark = np.stack([sweep_lowpass(ir[:, c], 9000, 1500, 1024) for c in range(2)], axis=1)
    return dark / np.sqrt((dark ** 2).sum(axis=0, keepdims=True))


def glue_gain(x, threshold_db=-18.0, ratio=2.0, attack=0.01, release=0.15):
    """Gain curve of a gentle bus compressor on the RMS envelope."""
    level = np.sqrt(signal.lfilter([1 - np.exp(-1 / (release * SR))], [1, -np.exp(-1 / (release * SR))], (x ** 2).mean(axis=1)) + 1e-12)
    over = np.maximum(0, 20 * np.log10(level) - threshold_db)
    g = 10 ** (-over * (1 - 1 / ratio) / 20)
    return signal.lfilter([1 - np.exp(-1 / (attack * SR))], [1, -np.exp(-1 / (attack * SR))], g)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Procedural, rights-clean music with ground truth.')
    ap.add_argument('out', help='output .wav')
    ap.add_argument('--plan', default='pop', choices=sorted(PLANS), help='arrangement preset')
    ap.add_argument('--plan-file', help='JSON plan: {bpm, key, mode, beatsPerBar, swing, sections:[{name, bars, energy, build, stop, impact}]}')
    ap.add_argument('--bpm', type=float)
    ap.add_argument('--key')
    ap.add_argument('--mode', choices=['major', 'minor'])
    ap.add_argument('--beats-per-bar', type=int)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--lead-in', type=float, default=0.5, help='silence before the first beat (s)')
    ap.add_argument('--drift', type=float, default=0.0, help='tempo wander, e.g. 0.02 = +-2%%')
    ap.add_argument('--truth', help='ground-truth JSON path (default: <out>.truth.json)')
    ap.add_argument('--stems', help='also write drums / bass / vocals / other stems to this folder')
    a = ap.parse_args(argv)
    plan = json.load(open(a.plan_file, encoding='utf-8')) if a.plan_file else json.loads(json.dumps(PLANS[a.plan]))
    for k, v in (('bpm', a.bpm), ('key', a.key), ('mode', a.mode), ('beatsPerBar', a.beats_per_bar)):
        if v is not None:
            plan[k] = v
    mix, truth, stems = render(plan, a.seed, a.lead_in, a.drift, want_stems=bool(a.stems))
    A.save_wav(a.out, mix, SR, 24)
    for name, y in (stems or {}).items():
        A.save_wav(os.path.join(a.stems, name + '.wav'), y, SR, 24)
    truth_path = a.truth or os.path.splitext(a.out)[0] + '.truth.json'
    with open(truth_path, 'w', encoding='utf-8') as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)
    lufs = A.integrated_lufs(mix, SR)
    print(f'wrote {a.out}  {truth["duration"]:.1f} s  {plan["bpm"]} BPM  {plan.get("key", "A")} {plan.get("mode", "minor")}  {lufs:.1f} LUFS  {A.true_peak_db(mix, SR):.1f} dBTP')
    print(f'wrote {truth_path}  {len(truth["beats"])} beats, {len(truth["sections"])} sections, {len(truth["events"]["vocal"])} lead notes')
    if stems:
        print(f'wrote {len(stems)} stems to {a.stems}: ' + ', '.join(f'{k}.wav' for k in stems))


if __name__ == '__main__':
    main()
