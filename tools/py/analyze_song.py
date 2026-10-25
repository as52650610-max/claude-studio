#!/usr/bin/env python3
"""Beats, bars, sections and events of a song, for timing a music video. numpy + scipy + ffmpeg.

    python tools/py/analyze_song.py audio/song.wav --out data/songmap.json --click qa/click_preview.wav
    options: --bpm 128 (search near this tempo)   --beats-per-bar 3   --first-downbeat 1.234
             --stems audio/stems   (separated vocals / drums / bass / other, e.g. from UVR or Demucs)
             --sections 1,5,13,17  (the bars where sections start, as heard; bar 1 = the first downbeat)

Pipeline (docs/04-music-timing.md):
  1. mono 22.05 kHz, STFT (1024 / hop 128 = 5.8 ms), 64 log-mel bands
  2. onset envelope: log-mel spectral flux with a frequency max-filter (SuperFlux), also per band
  3. tempo: autocorrelation comb scored with a log-normal prior around 120 BPM; ties are reported
  4. beats: dynamic programming (Ellis 2007), then a robust local line fit through nearby onsets
  5. bar phase: kick on 1 and 3, snare on 2 and 4, chord and bass changes on 1, energy jumps on 1
  6. sections: bar-level self-similarity, checkerboard novelty, similar sections share a letter;
     a boundary up to a bar from where the band comes back after a stop (or a big hit lands)
     moves onto that bar, and a stop with no boundary near starts a section of its own;
     sections given with --sections are used as they are; the notes say where the analysis on its
     own puts them and which stops or hits fall inside a given section
  7. events: kick / snare / hat / vocal-band onsets, stops (band drops out), impacts (hit + jump);
     a kick has to leave sub-bass behind, and a vocal onset on a stem must not be a reverb tail
  8. drift: deviation from a straight grid in every 32-beat window; warn above 45 ms

Ambiguities are reported, never silently resolved: AMBIGUOUS TEMPO 2:1 or 3:2, AMBIGUOUS PHASE,
AMBIGUOUS METER, DRIFT, SECTION MISMATCH (a stop or a big hit that no section can start on).
What the analysis changed to make its own measurements agree is listed under "notes". Listen to
the click preview before trusting any of it (gate G1): a high click marks each bar's first beat and
a bell each section start. Sections that start in the wrong bar are given with --sections.
Validated against songs with known beats from tools/py/music.py (tools/py/selftest.py).

Events from a full mix are approximate: a bass note can pass for a kick, a strummed chord for a
snare, and "vocal" means melodic onsets in the 300-3400 Hz band, whoever plays them. With
--stems (vocals.wav, drums.wav, ...) the events come from the separated parts and are precise.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from scipy import ndimage, signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io as A  # noqa: E402

VERSION = '0.4'
SR = 22050
HOP = 128
N_FFT = 1024
FPS = SR / HOP
# Seconds to subtract from detected times. A flux peak comes slightly before the attack it
# belongs to, because the 46 ms window starts to see the attack early. Calibrated on
# music.py songs by selftest.py (median error against the placed hits).
LATENCY = {'beat': -0.012, 'kick': -0.012, 'snare': -0.007, 'hat': -0.010, 'vocal': -0.001,
           'kick_stem': -0.012, 'snare_stem': -0.002, 'hat_stem': -0.005, 'vocal_stem': -0.004}
BANDS = {'low': (30, 150), 'snare_lo': (150, 500), 'snare_hi': (1000, 5000), 'hat': (6000, 11000),
         'vocal': (300, 3400), 'mid': (150, 4000), 'high': (4000, 11000)}
STEM_NAMES = {
    'vocals': r'vocal|vox|voice|acapella|人聲|人声',
    'drums': r'drum|perc|鼓',
    'bass': r'bass|貝斯|贝斯',
    'other': r'other|inst|accomp|karaoke|伴奏|music',
}


# ─── Features ─────────────────────────────────────────────────────────────────────────────

def superflux(L, lag=2):
    """Positive log-spectral difference against a frequency max-filtered reference, centred."""
    ref = ndimage.maximum_filter1d(L, size=3, axis=1)  # vibrato-tolerant reference
    d = np.maximum(0.0, L[lag:] - ref[:-lag])
    flux = np.zeros_like(L)
    flux[lag // 2:lag // 2 + len(d)] = d  # the change between t-1 and t+1 belongs to t
    return flux


def features(x):
    S = A.stft_mag(x, N_FFT, HOP)  # frames x bins
    fb, centers = A.mel_filterbank(SR, N_FFT, 64, 30.0, 11000.0)
    mel = (S ** 2) @ fb.T
    L = 10 * np.log10(mel + 1e-10)
    L = np.maximum(L, L.max() - 80)
    flux = superflux(L)
    F = {'S': S, 'mel': mel, 'L': L, 'centers': centers, 'flux': flux, 'ose': flux.sum(axis=1)}
    # Event bands use a log with an offset 30 dB under each band's usual level, so a tiny change
    # in a nearly silent band (a hat's leakage into the empty bass range) is not an onset.
    ev = superflux(10 * np.log10(mel + 1e-3 * np.quantile(mel, 0.95, axis=0) + 1e-10))
    for k, (lo, hi) in BANDS.items():
        F[k] = ev[:, (centers >= lo) & (centers < hi)].sum(axis=1)
    F['snare'] = F['snare_hi'] + 0.5 * F['snare_lo']
    return F


def band_level(F, lo, hi):
    return 10 * np.log10(F['mel'][:, (F['centers'] >= lo) & (F['centers'] < hi)].sum(axis=1) + 1e-10)


def harmonic_flux(x, lo=300, hi=3400, n_frames=None):
    """Onset envelope of the harmonic (pitched) part only: median-filter HPSS, then flux."""
    hop = HOP * 2
    S = A.stft_mag(x, N_FFT, hop)
    H = ndimage.median_filter(S, size=(17, 1))
    P = ndimage.median_filter(S, size=(1, 17))
    mask = H ** 2 / (H ** 2 + P ** 2 + 1e-12)
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    sel = (freqs >= lo) & (freqs < hi)
    Lh = 20 * np.log10(S[:, sel] * mask[:, sel] + 1e-6)
    Lh = np.maximum(Lh, Lh.max() - 70)
    f = superflux(Lh).sum(axis=1)
    n = n_frames or 2 * len(S)
    return np.interp(np.arange(n) / 2, np.arange(len(S)), f)  # back to the main frame rate


def chroma(S):
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    sel = (freqs >= 65) & (freqs <= 2100)
    pc = np.round(69 + 12 * np.log2(freqs[sel] / 440.0)).astype(int) % 12
    P = S[:, sel] ** 2
    C = np.stack([P[:, pc == k].sum(axis=1) for k in range(12)], axis=1)
    return C / (C.sum(axis=1, keepdims=True) + 1e-12)


def normalize_env(v):
    v = np.asarray(v, dtype=np.float64)
    v = np.maximum(v - ndimage.uniform_filter1d(v, int(FPS * 1.0)), 0)  # remove slow loudness swings
    s = v.std()
    return v / s if s > 0 else v


# ─── Tempo ────────────────────────────────────────────────────────────────────────────────

def tempo_scores(ose, bpm_range=(50, 220), prior_center=120.0, prior_octaves=1.0):
    win, hop = int(8 * FPS), int(1 * FPS)
    max_lag = int(4 * 60 / bpm_range[0] * FPS) + 2
    acf = np.zeros(max_lag)
    count = 0
    e = ose - ose.mean()
    for s in range(0, max(1, len(e) - win), hop):
        seg = e[s:s + win]
        if seg.std() < 1e-9:
            continue
        seg = (seg - seg.mean()) / seg.std()
        f = np.fft.rfft(seg, 2 * len(seg))
        ac = np.fft.irfft(f * np.conj(f))[:max_lag] / len(seg)
        acf[:len(ac)] += ac
        count += 1
    acf /= max(count, 1)
    bpms = np.arange(bpm_range[0], bpm_range[1] + 0.05, 0.1)
    lag = 60 * FPS / bpms
    at = lambda l: np.interp(l, np.arange(len(acf)), acf, right=0)
    comb = at(lag) + 0.5 * at(2 * lag) + 0.33 * at(3 * lag) + 0.25 * at(4 * lag)
    prior = np.exp(-0.5 * (np.log2(bpms / prior_center) / prior_octaves) ** 2)
    return bpms, comb * prior


def pick_tempo(bpms, score, hint=None):
    s = score.copy()
    if hint:
        s[np.abs(bpms / hint - 1) > 0.04] = -np.inf
    peaks = [i for i in range(1, len(s) - 1) if s[i] >= s[i - 1] and s[i] >= s[i + 1] and np.isfinite(s[i])]
    if not peaks:
        peaks = [int(np.nanargmax(s))]
    peaks.sort(key=lambda i: -s[i])
    best = peaks[0]
    cands = []
    for i in peaks[:8]:
        if all(abs(bpms[i] / c['bpm'] - 1) > 0.02 for c in cands):
            cands.append({'bpm': round(float(bpms[i]), 2), 'score': round(float(s[i] / s[best]), 3)})
    amb = None
    if not hint:
        for c in cands[1:]:
            r = c['bpm'] / bpms[best]
            if c['score'] >= 0.8:
                if abs(r - 2) < 0.04 or abs(r - 0.5) < 0.02:
                    amb = amb or '2:1'
                elif abs(r - 1.5) < 0.04 or abs(r - 2 / 3) < 0.03:
                    amb = amb or '3:2'
    conf = 1.0 - (cands[1]['score'] if len(cands) > 1 else 0.0)
    return float(bpms[best]), cands, amb, round(float(conf), 3)


# ─── Beats ────────────────────────────────────────────────────────────────────────────────

def track_beats(ose, bpm, tightness=100.0):
    """Ellis (2007) dynamic programming beat tracker on a frame-rate onset envelope."""
    period = 60.0 * FPS / bpm
    local = ose / (ose.std() + 1e-9)
    w = np.arange(-int(period), int(period) + 1)
    local = np.convolve(local, np.exp(-0.5 * (w * 32.0 / period) ** 2), 'same')
    n = len(local)
    window = np.arange(-int(round(2 * period)), -int(round(period / 2)) + 1)
    txwt = -tightness * np.log(-window / period) ** 2
    cum = np.zeros(n)
    back = np.full(n, -1)
    thresh = 0.01 * local.max()
    started = False
    for i in range(n):
        idx = window + i
        ok = idx >= 0
        if ok.any():
            cand = txwt[ok] + cum[idx[ok]]
            k = int(np.argmax(cand))
            cum[i] = local[i] + cand[k]
            if started or local[i] >= thresh:
                back[i] = idx[ok][k]
                started = True
        else:
            cum[i] = local[i]
    # Start the backtrace from the best score in the final period. Past the end of the music the
    # best chain keeps extending at its own period, so this lands on it rather than on a late
    # off-beat (a swung eighth, say) that a "last local maximum" rule would pick.
    p = int(round(period))
    i = max(0, n - p - 1) + int(np.argmax(cum[max(0, n - p - 1):]))
    beats = []
    while i >= 0:
        beats.append(i)
        i = back[i]
    beats = np.array(beats[::-1])
    # trim weak leading / trailing beats (silence before the music starts or after it ends)
    strength = local[beats]
    thr = 0.5 * np.sqrt(np.mean(strength ** 2))
    keep = np.flatnonzero(strength >= thr)
    if len(keep):
        beats = beats[keep[0]:keep[-1] + 1]
    # and beats at either end whose spacing does not fit the rest
    while len(beats) > 8:
        d = np.diff(beats)
        med = np.median(d)
        if abs(d[-1] / med - 1) > 0.2:
            beats = beats[:-1]
        elif abs(d[0] / med - 1) > 0.2:
            beats = beats[1:]
        else:
            break
    return beats


def onset_near(ose, frames, search):
    """Strongest onset within +-search s of each frame: sub-frame time (s) and height."""
    half = max(1, int(search * FPS))
    t_on, s_on = np.zeros(len(frames)), np.zeros(len(frames))
    for i, b in enumerate(frames):
        a, c = max(1, b - half), min(len(ose) - 1, b + half + 1)
        if c <= a:
            t_on[i] = b / FPS
            continue
        k = a + int(np.argmax(ose[a:c]))
        y0, y1, y2 = ose[k - 1], ose[k], ose[min(k + 1, len(ose) - 1)]
        den = y0 - 2 * y1 + y2
        off = 0.5 * (y0 - y2) / den if den < 0 else 0.0
        t_on[i] = (k + np.clip(off, -0.5, 0.5)) / FPS
        s_on[i] = y1
    return t_on, s_on


def refine_beats(beat_frames, ose, window=4, search=0.035, max_res=0.02):
    """Move each beat onto a straight line through the strong onsets of its +-4 neighbours.

    Neighbours that do not fit the line (syncopation, a fill, a missed beat) are dropped one at
    a time, worst first, so one stray onset cannot bend the grid."""
    n = len(beat_frames)
    t_on, s_on = onset_near(ose, beat_frames, search)
    strong = s_on >= 0.3 * np.median(s_on[s_on > 0]) if (s_on > 0).any() else np.zeros(n, bool)
    out = beat_frames / FPS
    for i in range(n):
        j = np.arange(max(0, i - window), min(n, i + window + 1))
        j = j[strong[j]]
        fit = None
        while len(j) >= 3:
            p = np.polyfit(j, t_on[j], 1, w=np.sqrt(s_on[j]))
            res = np.abs(t_on[j] - np.polyval(p, j))
            if res.max() <= max_res:
                fit = p
                break
            j = np.delete(j, int(np.argmax(res)))
        if fit is not None:
            out[i] = np.polyval(fit, i)
        elif strong[i]:
            out[i] = t_on[i]
    for i in range(1, n):  # strictly increasing
        if out[i] <= out[i - 1]:
            out[i] = out[i - 1] + 1e-3
    return out - LATENCY['beat'], s_on


# ─── Bars ─────────────────────────────────────────────────────────────────────────────────

def segment_mean(values, bounds):
    """Mean of a frame-rate array over each [bounds[i], bounds[i+1]) span (seconds)."""
    fr = np.clip(np.round(np.asarray(bounds) * FPS).astype(int), 0, len(values) - 1)
    out = []
    for a, b in zip(fr[:-1], fr[1:]):
        out.append(values[a:b].mean(axis=0) if b > a else values[a])
    return np.array(out)


def beat_bounds(beats):
    beats = np.asarray(beats)
    step = beats[-1] - beats[-2] if len(beats) > 1 else 0.5
    return np.append(beats, beats[-1] + step)


def peak_at(env, times, width=0.04):
    half = max(1, int(width * FPS))
    fr = np.round(np.asarray(times) * FPS).astype(int)
    return np.array([env[max(0, f - half):min(len(env), f + half + 1)].max() if 0 <= f < len(env) else 0.0 for f in fr])


def zscore(v):
    v = np.asarray(v, dtype=np.float64)
    s = v.std()
    return (v - v.mean()) / s if s > 1e-12 else v * 0


def zscore_cols(M):
    M = np.asarray(M, dtype=np.float64)
    return (M - M.mean(axis=0)) / (M.std(axis=0) + 1e-9)


def meter_and_phase(beats, F, C, bpb_hint=None, first_downbeat=None):
    n = len(beats)
    kick = peak_at(F['low'], beats)
    snare = peak_at(F['snare'], beats)
    bass = peak_at(F['low'], beats, 0.06)
    bounds = beat_bounds(beats)
    level = segment_mean(F['L'].mean(axis=1), bounds)
    ch = segment_mean(C, bounds)
    nov = np.zeros(n)  # harmony change at beat i: two beats before vs two beats after
    jump = np.zeros(n)
    for i in range(1, n):
        a, b = ch[max(0, i - 2):i].mean(axis=0), ch[i:min(n, i + 2)].mean(axis=0)
        nov[i] = 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)
        jump[i] = max(0.0, level[i:min(n, i + 4)].mean() - level[max(0, i - 4):i].mean())

    def phase_scores(m):
        scores = []
        for ph in range(m):
            pos = (np.arange(n) - ph) % m
            on = pos == 0
            comp = [np.mean(nov[on]) - np.mean(nov[~on]), np.mean(jump[on]) - np.mean(jump[~on])]
            if m == 4:
                strong, weak = (pos == 0) | (pos == 2), (pos == 1) | (pos == 3)
                comp += [np.mean(kick[strong]) - np.mean(kick[weak]), np.mean(snare[weak]) - np.mean(snare[strong]),
                         np.mean(bass[on]) - np.mean(bass[pos == 2])]
            else:
                comp += [np.mean(kick[on]) - np.mean(kick[~on]), np.mean(snare[~on]) - np.mean(snare[on]), 0.0]
            scores.append(comp)
        sc = np.array(scores)
        sc = sc / (np.abs(sc).max(axis=0, keepdims=True) + 1e-12)
        return sc @ np.array([1.0, 0.5, 0.6, 0.6, 0.5])

    def periodicity(m):  # do harmony changes and the kick pattern repeat every m (and 2m) beats?
        vals = [np.corrcoef(v[:-m], v[m:])[0, 1] for v in (zscore(nov), zscore(kick), zscore(bass)) if len(v) > 2 * m and v.std() > 0]
        return float(np.nanmean(vals)) if vals else 0.0

    per = {3: periodicity(3) + 0.5 * periodicity(6), 4: periodicity(4) + 0.5 * periodicity(8)}
    if bpb_hint:
        m, meter_amb = bpb_hint, False
    else:
        m = 4 if per[4] >= per[3] else 3
        meter_amb = abs(per[4] - per[3]) < 0.08
    ps = phase_scores(m)
    order = np.argsort(-ps)
    best = int(order[0])
    if first_downbeat is not None:
        best = int(np.argmin(np.abs(beats - first_downbeat))) % m
    margin = float(ps[order[0]] - ps[order[1]]) if m > 1 else 1.0
    phase = {'confidence': round(min(1.0, max(0.0, margin)), 3), 'scores': [round(float(v), 3) for v in ps],
             'chosen': best, 'ambiguous': bool(first_downbeat is None and margin < 0.25)}
    meter = {'beatsPerBar': m, 'periodicity': {str(k): round(v, 3) for k, v in per.items()}, 'ambiguous': bool(meter_amb)}
    return m, best, phase, meter


# ─── Sections ─────────────────────────────────────────────────────────────────────────────

def dct_bands(L, n=13):
    k = np.arange(L.shape[1])
    basis = np.cos(np.pi / L.shape[1] * (k + 0.5)[None, :] * np.arange(n)[:, None])
    return L @ basis.T


def window_novelty(M, w):
    """Distance between the mean feature vectors of the w bars before and the w bars after each bar
    line. Comparing means over whole phrases ignores chord changes inside a section."""
    nb = len(M)
    out = np.zeros(nb)
    for i in range(1, nb):
        out[i] = np.linalg.norm(M[max(0, i - w):i].mean(axis=0) - M[i:min(nb, i + w)].mean(axis=0))
    return out


def onset_rate(F, bounds):
    """Clear onsets per second in each span: how busy the arrangement is."""
    nz = normalize_env(F['ose'])
    pk, _ = signal.find_peaks(nz, height=1.0, distance=int(0.05 * FPS))
    t = pk / FPS
    return np.array([np.sum((t >= a) & (t < b)) / max(b - a, 1e-9) for a, b in zip(bounds[:-1], bounds[1:])])


def bar_features(bounds, F, C, loud):
    group = lambda M: zscore_cols(M) / np.sqrt(M.shape[1])  # each group weighs the same
    bands = np.stack([segment_mean(band_level(F, *BANDS[k]), bounds) for k in ('low', 'mid', 'high')], axis=1)
    return {
        'chroma': group(segment_mean(C, bounds)),
        'timbre': group(segment_mean(dct_bands(F['L']), bounds)[:, 1:13]),
        'level': group(segment_mean(loud, bounds)[:, None]),
        'bands': group(bands),
        'density': group(onset_rate(F, bounds)[:, None]),
    }


def section_edges(downbeats, end_time, F, C, loud, min_bars=2):
    """Section boundaries on bar lines from the sound alone: indices into downbeats, with 0 and the
    bar count at the ends. Also returns the bar features the letters are drawn from."""
    nb = len(downbeats)
    if nb < 6:
        return [], None
    bounds = np.append(downbeats, end_time)
    G = bar_features(bounds, F, C, loud)
    long = np.hstack([G[k] for k in ('chroma', 'timbre', 'level', 'bands', 'density')])
    short = np.hstack([G[k] for k in ('timbre', 'level', 'bands', 'density')])  # 2 bars: chords would alias
    score = zscore(window_novelty(long, 4)) + zscore(window_novelty(short, 2))
    score[0] = -np.inf
    peak = [i for i in range(1, nb) if score[i] >= score[i - 1] and (i + 1 >= nb or score[i] >= score[i + 1])]
    # phrase bonus: sections are usually multiples of 4 bars; the phase is voted by the peaks
    votes = [sum(max(score[i], 0) for i in peak if i % 4 == a) for a in range(4)]
    anchor = int(np.argmax(votes))
    bonus = np.array([0.4 if (i - anchor) % 4 == 0 else 0.0 for i in range(nb)])
    chosen = []
    for i in sorted(peak, key=lambda i: -(score[i] + bonus[i])):
        if score[i] + bonus[i] < 1.0 or len(chosen) >= nb // 4:  # at most one boundary per 4 bars on average
            break
        if all(abs(i - j) >= min_bars for j in chosen) and i >= min_bars and nb - i >= min_bars:
            chosen.append(i)
    return [0] + sorted(chosen) + [nb], G


class SectionsError(ValueError):
    """--sections names a bar the song does not have."""


def given_edges(bars, nb):
    """Section starts given by bar number (bar 1 is the first downbeat, as in song.T) as edges."""
    bars = sorted({int(b) for b in bars})
    bad = [b for b in bars if not 1 <= b <= nb]
    if bad:
        raise SectionsError(f'--sections: the song has bars 1-{nb}, so no section can start at bar {bad[0]}')
    return sorted({0, *(b - 1 for b in bars)}) + [nb]


def align_edges(edges, beats, phase, bpb, stops, hits, given=False):
    """Boundaries go where the analysis measured a landmark: the bar where the band comes back
    after a stop, or where a big hit lands. A boundary up to a bar away moves onto it, and a stop
    with no boundary near starts a section of its own. Returns the edges, notes on what changed and
    SECTION MISMATCH warnings for the landmarks no section can start on. Sections given by bar
    number (given=True) stay where they are; a landmark inside one of them is only noted."""
    notes, warnings = [], []
    if not edges:
        return edges, notes, warnings
    beats = np.asarray(beats)
    downbeats = beats[phase::bpb]
    period = float(np.median(np.diff(beats)))
    edges, fixed = list(edges), set()
    marks = [(s['end'], 'stop') for s in stops] + [(h['t'], 'hit') for h in hits]
    for t, kind in sorted(marks):
        what = 'the band comes back after a stop' if kind == 'stop' else 'a big hit lands'
        k = int(np.argmin(np.abs(downbeats - t)))
        if abs(downbeats[k] - t) > 0.25 * period:
            j = int(np.argmin(np.abs(beats - t)))
            bar, beat = (j - phase) // bpb + 1, (j - phase) % bpb + 1
            warnings.append(f'SECTION MISMATCH: {what} at {t:.3f} s, on beat {beat} of bar {bar}, not on a bar line, so no section can start there. '
                            'If the bar phase is off, the high clicks are off too: pass --first-downbeat. If it is a pickup, cue it in data/cues.json.')
            continue
        if k in edges:
            fixed.add(k)
            continue
        if given:  # the given bars stay; say once per bar what falls inside a section
            if k not in fixed:
                a = max(e for e in edges if e < k)
                notes.append(f'{what} at {t:.3f} s (bar {k + 1}), {k - a} bar{"s" if k - a > 1 else ""} into the section given at bar {a + 1}; '
                             f'if a section starts there, add {k + 1} to --sections')
                fixed.add(k)
            continue
        near = [e for e in edges[1:-1] if abs(e - k) == 1 and e not in fixed]
        if near:
            edges[edges.index(near[0])] = k
            notes.append(f'section boundary moved from bar {near[0] + 1} ({downbeats[near[0]]:.3f} s) to bar {k + 1} ({downbeats[k]:.3f} s), where {what}')
        elif kind == 'stop' and min(abs(e - k) for e in edges) >= 2:
            edges.append(k)
            notes.append(f'new section at bar {k + 1} ({downbeats[k]:.3f} s), where {what}; the sound alone found no boundary there')
        else:
            a = max(e for e in edges if e < k)
            warnings.append(f'SECTION MISMATCH: {what} at {t:.3f} s (bar {k + 1}), {k - a} bar{"s" if k - a > 1 else ""} into the section that starts at bar {a + 1}. '
                            f'Listen there; if a section starts on it, re-run with --sections and include bar {k + 1}.')
            continue
        edges.sort()
        fixed.add(k)
    return edges, notes, warnings


def describe_sections(edges, downbeats, end_time, G, F, loud):
    """Letters for similar sections, energy 0-10 and a guessed kind for each span of bars."""
    if not edges:
        return []
    bounds = np.append(downbeats, end_time)
    secs = [{'start': float(bounds[a]), 'end': float(bounds[b]), 'span': (a, b)} for a, b in zip(edges[:-1], edges[1:])]
    # letters: bar-by-bar similarity of harmony and of sound to the first section of each letter
    unit = lambda M: M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-12)
    ssm = 0.5 * unit(G['chroma']) @ unit(G['chroma']).T
    tb = unit(np.hstack([G['timbre'], G['bands']]))
    ssm += 0.5 * tb @ tb.T
    protos, labels = [], []
    for s in secs:
        a, b = s['span']
        best, best_sim = None, -1.0
        for li, (pa, pb) in enumerate(protos):
            m = min(b - a, pb - pa)
            sim = float(np.mean([ssm[a + k, pa + k] for k in range(m)]))
            if sim > best_sim:
                best, best_sim = li, sim
        if best is not None and best_sim >= 0.55:
            labels.append(chr(ord('A') + best) + ('' if best_sim >= 0.75 else "'"))
        else:
            protos.append((a, b))
            labels.append(chr(ord('A') + len(protos) - 1))
    # energy: loudness relative to the loudest section, minus 3 per halving of the onset rate
    lufs = []
    for s in secs:
        a, b = int(s['start'] * FPS), int(s['end'] * FPS)
        lufs.append(10 * np.log10(np.mean(10 ** (loud[a:b] / 10)) + 1e-12))
    rate = onset_rate(F, [s['start'] for s in secs] + [secs[-1]['end']])
    raw = np.array(lufs) + 3 * np.log2(np.maximum(rate, 0.25))
    top = raw.max()
    for s, lab, l, r in zip(secs, labels, lufs, raw):
        a, b = s.pop('span')
        s.update(label=lab, bars=int(b - a), loudness=round(float(l), 1), energy=round(float(np.clip(10 + r - top, 0, 10)), 1))
    for s, k in zip(secs, guess_kinds(secs)):
        s['kind'] = s['name'] = k
        s['start'], s['end'] = round(s['start'], 4), round(s['end'], 4)
    return secs


def guess_kinds(secs):
    """Heuristic names only; the letters and energies are what the analysis measured."""
    letters = [s['label'].rstrip("'") for s in secs]
    n = len(secs)
    mean_e = lambda l: np.mean([s['energy'] for s, x in zip(secs, letters) if x == l])
    counts = {l: letters.count(l) for l in set(letters)}
    top = max(s['energy'] for s in secs)
    cands = [l for l in counts if counts[l] > 1 and mean_e(l) >= top - 2.5]
    chorus = {max(cands, key=mean_e)} if cands else {l for l, s in zip(letters, secs) if s['energy'] >= top - 1.5}
    ce = np.mean([s['energy'] for l, s in zip(letters, secs) if l in chorus])
    kinds = []
    for i, (l, s) in enumerate(zip(letters, secs)):
        nxt = letters[i + 1] if i + 1 < n else None
        if l in chorus:
            k = 'chorus'
        elif i == 0 and s['energy'] < ce - 1.5:
            k = 'intro'
        elif i == n - 1 and s['energy'] < ce - 1.5:
            k = 'outro'
        elif s['bars'] <= 4 and s['energy'] < ce - 5:
            k = 'break'
        elif nxt in chorus and s['bars'] <= 8 and (counts[l] > 1 or s['bars'] <= 4):
            k = 'pre'
        elif counts[l] > 1 or not any(x in chorus for x in letters[:i]):
            k = 'verse'
        else:
            k = 'bridge'
        kinds.append(k)
    return kinds


# ─── Events ───────────────────────────────────────────────────────────────────────────────

def pick_events(env, kind, gap=0.07, k=3.0, rel=0.3, floor=0.02, win=1.0):
    """Peaks above max(moving median + k*MAD, rel * the loudest peak within +-win/2 s,
    floor * the song's strong peaks (98th percentile)). Returns [[time, strength 0-1], ...]."""
    env = np.asarray(env, dtype=np.float64)
    w = int(FPS * 1.5) | 1
    med = ndimage.median_filter(env, size=w, mode='nearest')
    mad = ndimage.median_filter(np.abs(env - med), size=w, mode='nearest')
    thr = np.maximum(med + k * mad, rel * ndimage.maximum_filter1d(env, int(win * FPS) | 1, mode='nearest'))
    every, _ = signal.find_peaks(env, distance=max(1, int(gap * FPS)))
    if len(every):
        thr = np.maximum(thr, floor * np.quantile(env[every], 0.98))
    peaks, _ = signal.find_peaks(env, height=thr + 1e-12, distance=max(1, int(gap * FPS)))
    if not len(peaks):
        return []
    ref = np.quantile(env[peaks], 0.95) + 1e-12
    out = []
    for p in peaks:
        y0, y1, y2 = env[max(p - 1, 0)], env[p], env[min(p + 1, len(env) - 1)]
        den = y0 - 2 * y1 + y2
        off = 0.5 * (y0 - y2) / den if den < 0 else 0.0
        out.append([round(float((p + np.clip(off, -0.5, 0.5)) / FPS - LATENCY[kind]), 4), round(float(min(1.0, y1 / ref)), 3)])
    return out


def kick_body(F, events, kind, below=24.0):
    """Keep low-band onsets that leave sub-bass behind for a tenth of a second: a kick's 40-90 Hz
    body is within `below` dB of the song's loud kicks, a snare's low leakage stays far under it.
    (The leakage is worst in 3/4, where no kick sits within a beat of the snare to outshout it.)"""
    sub = band_level(F, 40, 90)
    top = np.quantile(sub, 0.95)
    a, b = int(0.03 * FPS), int(0.10 * FPS)
    keep = []
    for e in events:
        f = int(round((e[0] + LATENCY[kind]) * FPS))
        seg = sub[f + a:f + b]
        if len(seg) and seg.mean() >= top - below:
            keep.append(e)
    return keep


def no_tails(level, events, kind, below=20.0, look=2.0):
    """Drop onsets that stay more than `below` dB under the loudest moment of the previous `look`
    seconds: the reverb tail or echo of the last note, not a new one."""
    w, back = int(0.05 * FPS), int(look * FPS)
    keep = []
    for e in events:
        f = int(round((e[0] + LATENCY[kind]) * FPS))
        now, before = level[f:f + w + 1], level[max(0, f - back):max(0, f - w)]
        if len(now) and (not len(before) or now.max() >= before.max() - below):
            keep.append(e)
    return keep


def sustained(level, events, dur=0.12, drop=4.5):
    """Keep onsets whose band level stays within `drop` dB of its attack peak for `dur` s (sung
    notes hold, plucked and struck notes decay)."""
    n, a = int(dur * FPS), int(0.03 * FPS)
    keep = []
    for e in events:
        f = int(round((e[0] + LATENCY['vocal']) * FPS))
        seg = level[f:f + n + a]
        if len(seg) > n and seg[n] >= seg[:a + 1].max() - drop:
            keep.append(e)
    return keep


def drum_templates(centers):
    """Generic spectral shapes on the mel bands: kick (low thump, a little beater click), snare
    (body around 200 Hz plus broad noise), hi-hat (bright noise)."""
    lg = np.log2(centers)
    bump = lambda f, w: np.exp(-0.5 * ((lg - np.log2(f)) / w) ** 2)
    W = np.stack([bump(60, 0.7) + 0.05 * bump(3000, 1.0), 0.6 * bump(200, 0.5) + bump(3000, 1.3), bump(9000, 0.5)], axis=1) + 1e-3
    return W / W.sum(axis=0, keepdims=True)


def nmf_drums(V, W0, iters=60, adapt=0.3, extra=2, seed=0):
    """KL-divergence NMF of a drum stem (bands x frames). The drum templates start from W0 and
    may adapt only partly; `extra` free components soak up toms, crashes and bleed."""
    rng = np.random.default_rng(seed)
    k = W0.shape[1]
    W = np.hstack([W0, rng.uniform(0.1, 1, (V.shape[0], extra))])
    W /= W.sum(axis=0, keepdims=True)
    H = rng.uniform(0.1, 1, (W.shape[1], V.shape[1])) * V.mean()
    eps = 1e-12
    for _ in range(iters):
        H *= (W.T @ (V / (W @ H + eps))) / (W.sum(axis=0)[:, None] + eps)
        Wn = W * ((V / (W @ H + eps)) @ H.T) / (H.sum(axis=1)[None, :] + eps)
        Wn /= Wn.sum(axis=0, keepdims=True) + eps
        W = np.hstack([(1 - adapt) * W0 + adapt * Wn[:, :k], Wn[:, k:]])
        W /= W.sum(axis=0, keepdims=True)
    return W, H


def activation_onsets(a):
    """Rise of the log activation, weighted by the activation itself (ignores near-silence)."""
    la = np.log(a + a.max() * 1e-3)
    nov = np.zeros_like(a)
    nov[1:-1] = np.maximum(0, la[2:] - la[:-2])
    return nov * a


def drum_events(F, separated=False):
    """Mix: band onsets. Drum stem: kick from the low band, snare and hi-hat from NMF activations.
    Either way a kick has to leave sub-bass behind (kick_body)."""
    if not separated:
        return {
            'kick': kick_body(F, pick_events(F['low'], 'kick', 0.1, 3.0, 0.5), 'kick'),
            'snare': pick_events(F['snare'], 'snare', 0.08, 3.0, 0.5),
            'hat': pick_events(F['hat'], 'hat', 0.05, 3.0, 0.15),
        }
    _, H = nmf_drums(np.sqrt(F['mel']).T, drum_templates(F['centers']))
    return {
        'kick': kick_body(F, pick_events(F['low'], 'kick_stem', 0.08, 3.0, 0.5, 0.2), 'kick_stem'),
        'snare': pick_events(activation_onsets(H[1]), 'snare_stem', 0.08, 3.0, 0.2, 0.2),
        'hat': pick_events(activation_onsets(H[2]), 'hat_stem', 0.05, 3.0, 0.1, 0.1),
    }


def vocal_events(x, F, separated=False):
    env = harmonic_flux(x, n_frames=len(F['ose']))
    if separated:
        # On a stem the weak leftovers are reverb tails and vibrato flicker inside held notes.
        ev = no_tails(band_level(F, 300, 3400), pick_events(env, 'vocal_stem', 0.09, 3.0, 0.3), 'vocal_stem')
        return [e for e in ev if e[1] >= 0.12]
    ev = pick_events(env, 'vocal', 0.09, 5.0, 0.5)
    return sustained(band_level(F, 300, 3400), ev)


def find_stems(folder):
    """Map vocals / drums / bass / other to files in a folder by name (Demucs, UVR, Spleeter...)."""
    found = {}
    if not folder or not os.path.isdir(folder):
        return found
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(('.wav', '.flac', '.mp3', '.m4a', '.ogg', '.aiff', '.aif')):
            continue
        low = name.lower()
        for kind, pat in STEM_NAMES.items():
            if kind not in found and re.search(pat, low):
                if kind == 'other' and re.search(STEM_NAMES['vocals'], low) and 'inst' not in low:
                    continue
                found[kind] = os.path.join(folder, name)
                break
    return found


def eighth_grid(beats):
    beats = np.asarray(beats)
    mids = (beats[:-1] + beats[1:]) / 2
    return np.sort(np.concatenate([beats, mids]))


def find_stops(F, loud, beats, beats_per_bar=4):
    """The band drops out for one beat to one bar: no new onsets, the low end collapses >= 15 dB
    and the loudness >= 6 dB, then the music resumes. A riser or a reverb tail may keep sounding; that is still a stop for
    the picture. Starts on the first eighth-note after the last hit, ends on the hit that resumes.
    Longer drop-outs are breaks and show up as their own section."""
    if len(beats) < 8:
        return []
    period = float(np.median(np.diff(beats)))
    min_len, max_len = 0.9 * period, 1.1 * beats_per_bar * period
    low = ndimage.uniform_filter1d(band_level(F, 30, 150), 5)
    w = int(2 * FPS) | 1
    past = lambda v: ndimage.median_filter(v, size=w, origin=(w - 1) // 2, mode='nearest')  # previous 2 s
    ose = F['ose']
    beat_str = np.median(peak_at(ose, beats))
    quiet_onsets = ndimage.maximum_filter1d(ose, int(0.06 * FPS) | 1) < 0.2 * beat_str
    out = (low < past(low) - 15) & (loud < past(loud) - 6) & quiet_onsets
    grid = eighth_grid(beats)
    hits, _ = signal.find_peaks(ose, height=0.3 * beat_str, distance=int(0.04 * FPS))
    stops = []
    i, n = 0, len(out)
    while i < n:
        if not out[i]:
            i += 1
            continue
        j = i
        while j < n and out[j]:
            j += 1
        before, after = hits[hits < i], hits[hits >= j]
        if len(before) and len(after) and before[-1] / FPS > beats[0] + 1.0 and after[0] / FPS < beats[-1]:
            last_hit = before[-1] / FPS - LATENCY['beat']
            resume = onset_near(ose, [after[0]], 0.01)[0][0] - LATENCY['beat']
            on_grid = grid[(grid > last_hit + 0.05) & (grid < resume - 0.1)]
            start = on_grid[0] if len(on_grid) else i / FPS
            if ose[after[0]] >= 0.5 * beat_str and min_len <= resume - start <= max_len and not (stops and stops[-1]['end'] >= start):
                stops.append({'start': round(float(start), 3), 'end': round(float(resume), 3)})
        i = j
    return stops


def find_hits(F, loud, beats):
    """Isolated very strong hits that make the music clearly louder (8 dB over the next 1.5 s)."""
    out = []
    ose = F['ose']
    peaks, _ = signal.find_peaks(ose, distance=int(0.1 * FPS))
    if len(peaks) >= 50:
        p_lin = 10 ** (loud / 10)
        for p in peaks[ose[peaks] >= np.quantile(ose[peaks], 0.995)]:
            if p / FPS < beats[0] + 2.0:
                continue
            before = p_lin[max(0, p - int(1.5 * FPS)):max(1, p - int(0.1 * FPS))].mean()
            after = p_lin[p:p + int(1.5 * FPS)].mean()
            jump = 10 * np.log10((after + 1e-12) / (before + 1e-12))
            if jump >= 8.0 and 10 * np.log10(before + 1e-12) > -45:
                t = onset_near(ose, [p], 0.01)[0][0] - LATENCY['beat']
                out.append({'t': round(float(t), 4), 'strength': round(float(np.clip(jump / 12, 0, 1)), 3), 'why': 'hit'})
    return out


def find_impacts(sections, stops, hits):
    """Moments that hit hard: the band coming back after a stop, a big section jumping in (a
    chorus after a break), and isolated very strong hits that make the music clearly louder."""
    out = [{'t': st['end'], 'strength': 1.0, 'why': 'after stop'} for st in stops]
    for prev, sec in zip(sections[:-1], sections[1:]):
        rise = sec['energy'] - prev['energy']
        if rise >= 2.0 and sec['energy'] >= 7.5:
            out.append({'t': sec['start'], 'strength': round(float(np.clip(0.4 + rise / 10, 0, 1)), 3), 'why': 'section'})
    out += hits
    out.sort(key=lambda e: e['t'])
    merged = []
    for e in out:  # one impact per moment: keep the strongest within 0.25 s
        if merged and e['t'] - merged[-1]['t'] < 0.25:
            if e['strength'] > merged[-1]['strength']:
                merged[-1] = e
        else:
            merged.append(e)
    return merged


# ─── Envelopes, drift, click ──────────────────────────────────────────────────────────────

def loudness_curve(x, n_frames):
    """K-weighted 400 ms loudness (dB) at the analysis frame rate."""
    lufs, starts, _ = A.block_loudness(x, SR, block=0.4, hop=0.05)
    return np.interp(np.arange(n_frames) / FPS, starts + 0.2, lufs)


def envelopes(x, F, duration, fps=60, scale=255):
    t = np.arange(int(np.ceil(duration * fps))) / fps
    frame_t = np.arange(len(F['L'])) / FPS
    hop = int(SR / 200)
    n = len(x) // hop
    rms = 10 * np.log10((x[:n * hop].reshape(n, hop).astype(np.float64) ** 2).mean(axis=1) + 1e-12)
    rms = ndimage.uniform_filter1d(rms, 3)
    out = {'fps': fps, 'scale': scale}

    def norm(v):
        lo, hi = np.quantile(v, 0.02), np.quantile(v, 0.995)
        return np.round(np.clip((v - lo) / max(hi - lo, 1e-9), 0, 1) * scale).astype(int).tolist()

    out['rms'] = norm(np.interp(t, np.arange(n) / 200, rms))
    for name in ('low', 'mid', 'high'):
        out[name] = norm(np.interp(t, frame_t, ndimage.uniform_filter1d(band_level(F, *BANDS[name]), 5)))
    out['onset'] = norm(np.interp(t, frame_t, ndimage.uniform_filter1d(F['ose'], 3)))
    return out


def drift_report(beats, window=32, limit_ms=45):
    beats = np.asarray(beats)
    if len(beats) < 8:
        return {'windowBeats': window, 'maxMs': 0.0, 'globalMs': 0.0, 'windows': [], 'warn': False}
    idx = np.arange(len(beats))
    p = np.polyfit(idx, beats, 1)
    global_ms = float(np.abs(beats - np.polyval(p, idx)).max() * 1000)
    wins = []
    for s in range(0, len(beats) - 4, window):
        j = idx[s:s + window + 1]
        q = np.polyfit(j, beats[j], 1)
        dev = float(np.abs(beats[j] - np.polyval(q, j)).max() * 1000)
        wins.append({'start': round(float(beats[j[0]]), 3), 'end': round(float(beats[j[-1]]), 3), 'ms': round(dev, 1), 'bpm': round(float(60 / q[0]), 2)})
    mx = max(w['ms'] for w in wins) if wins else 0.0
    return {'windowBeats': window, 'maxMs': round(mx, 1), 'globalMs': round(global_ms, 1), 'windows': wins, 'warn': bool(mx > limit_ms)}


def click_signal(n, sr, beats, downbeats, starts=()):
    """The metronome of the click preview: a high click on the first beat of each bar, a lower one
    on the other beats, and a bell that rings for about half a second where a section starts."""
    t = np.arange(int(0.03 * sr)) / sr
    env = np.exp(-t / 0.008)
    hi, lo = np.sin(2 * np.pi * 1760 * t) * env, np.sin(2 * np.pi * 1320 * t) * env * 0.7
    tb = np.arange(int(0.6 * sr)) / sr
    bell = sum(a * np.sin(2 * np.pi * f * tb) for f, a in ((1046.5, 1.0), (2093.0, 0.4), (3139.5, 0.15)))
    bell *= 0.6 * np.exp(-tb / 0.18) * np.minimum(1.0, tb / 0.002) * np.minimum(1.0, (0.6 - tb) / 0.1)
    out = np.zeros(n)
    down = set(np.round(np.asarray(downbeats), 4))

    def add(sound, at):
        i = int(round(at * sr))
        if 0 <= i < n:
            m = min(len(sound), n - i)
            out[i:i + m] += sound[:m]

    for b in beats:
        add(hi if round(b, 4) in down else lo, b)
    for s in starts:
        add(bell, s)
    return out


def click_track(path, beats, downbeats, out_path, starts=()):
    song = A.load(path, sr=48000, mono=False)
    clicks = click_signal(len(song), 48000, beats, downbeats, starts)
    peak = np.abs(song).max() + 1e-9
    mix = song * 0.7 + clicks[:, None] * 0.45 * peak
    A.save_wav(out_path, mix / max(1.0, np.abs(mix).max() / 0.99), 48000, 16)


# ─── Main ─────────────────────────────────────────────────────────────────────────────────

def analyze(path, bpm_hint=None, bpb_hint=None, first_downbeat=None, stems=None, verbose=True, sections=None):
    x = A.load(path, sr=SR, mono=True)
    duration = len(x) / SR
    F = features(x)
    loud = loudness_curve(x, len(F['ose']))
    ose = normalize_env(F['ose'])
    bpms, score = tempo_scores(ose)
    bpm0, cands, tempo_amb, tempo_conf = pick_tempo(bpms, score, bpm_hint)
    beats, _ = refine_beats(track_beats(ose, bpm0), ose)
    bpm = float(60.0 / np.median(np.diff(beats))) if len(beats) > 1 else bpm0
    C = chroma(F['S'])
    bpb, phase, phase_info, meter = meter_and_phase(beats, F, C, bpb_hint, first_downbeat)
    downbeats = beats[phase::bpb]
    end_time = float(beats[-1] + 60 / bpm)
    stops = find_stops(F, loud, beats, bpb)
    hits = find_hits(F, loud, beats)
    edges, G = section_edges(downbeats, end_time, F, C, loud)
    edges, notes, section_warnings = align_edges(edges, beats, phase, bpb, stops, hits)
    if sections:  # bar numbers from someone who listened: used as they are
        own = edges
        edges = given_edges(sections, len(downbeats))
        if G is None:  # too few bars for the analysis to look for sections itself
            G = bar_features(np.append(downbeats, end_time), F, C, loud)
        _, notes, section_warnings = align_edges(edges, beats, phase, bpb, stops, hits, given=True)
        bars = lambda es: ', '.join(str(e + 1) for e in es[:-1])
        said = f'sections start at bars {bars(edges)}, as given with --sections'
        if not own:
            said += '; on its own the analysis does not split songs under 6 bars'
        elif own != edges:
            said += f'; on its own the analysis puts them at bars {bars(own)}'
        else:
            said += '; on its own the analysis finds the same bars'
        notes.insert(0, said)
    secs = describe_sections(edges, downbeats, end_time, G, F, loud)
    stem_files = find_stems(stems) if stems else {}
    if 'drums' in stem_files:
        events = drum_events(features(A.load(stem_files['drums'], sr=SR, mono=True)), separated=True)
    else:
        events = drum_events(F)
    if 'vocals' in stem_files:
        xv = A.load(stem_files['vocals'], sr=SR, mono=True)
        events['vocal'] = vocal_events(xv, features(xv), separated=True)
    else:
        events['vocal'] = vocal_events(x, F)
    impacts = find_impacts(secs, stops, hits)
    drift = drift_report(beats)
    warnings = []
    if tempo_amb:
        alt = [c['bpm'] for c in cands[1:] if c['score'] >= 0.8][:2]
        warnings.append(f'AMBIGUOUS TEMPO {tempo_amb}: {bpm:.1f} BPM chosen, {", ".join(f"{a:g}" for a in alt)} scored almost as well. Listen to the click preview; pass --bpm to choose.')
    if meter['ambiguous']:
        warnings.append(f'AMBIGUOUS METER: {bpb} beats per bar chosen. Pass --beats-per-bar to choose.')
    if phase_info['ambiguous']:
        warnings.append(f'AMBIGUOUS PHASE: bar 1 starts at {downbeats[0]:.3f} s, but another phase scored close. Check the high clicks in the preview; pass --first-downbeat to choose.')
    if drift['warn']:
        w = max(drift['windows'], key=lambda w: w['ms'])
        warnings.append(f'DRIFT: up to {drift["maxMs"]:.0f} ms off a straight grid ({w["start"]:.1f}-{w["end"]:.1f} s). The beats follow the music, but check cuts by ear there.')
    warnings += section_warnings
    from_stems = {'kick': 'drums', 'snare': 'drums', 'hat': 'drums', 'vocal': 'vocals'}
    songmap = {
        'version': 1,
        'analyzer': f'claude-studio analyze_song.py {VERSION}',
        'source': os.path.basename(path),
        'duration': round(duration, 4),
        'bpm': round(bpm, 3),
        'tempo': {'bpm': round(bpm, 3), 'searchBpm': round(bpm0, 2), 'confidence': tempo_conf, 'candidates': cands[:5], 'ambiguous': tempo_amb},
        'beatsPerBar': bpb,
        'meter': meter,
        'beats': [round(float(b), 4) for b in beats],
        'downbeats': [round(float(b), 4) for b in downbeats],
        'firstDownbeat': round(float(downbeats[0]), 4),
        'phase': phase_info,
        'drift': drift,
        'sections': secs,
        'stops': stops,
        'impacts': impacts,
        'events': events,
        'eventSource': {k: 'stems' if from_stems[k] in stem_files else 'mix' for k in events},
        'stems': {k: os.path.basename(v) for k, v in stem_files.items()},
        'envelopes': envelopes(x, F, duration),
        'warnings': warnings,
        'notes': notes,
    }
    if verbose:
        print(f'  {bpm:.2f} BPM ({len(beats)} beats, {bpb} per bar, first downbeat {downbeats[0]:.3f} s)')
        print(f'  {len(secs)} sections: ' + ', '.join(f"{s['label']} bar {e + 1} ({s['start']:.2f} s)" for s, e in zip(secs, edges)))
        src = ' (from stems: ' + ', '.join(sorted(stem_files)) + ')' if stem_files else ''
        print(f"  events{src}: {', '.join(f'{k} {len(v)}' for k, v in events.items())}; stops {len(stops)}; impacts {len(impacts)}; drift max {drift['maxMs']} ms")
        for n in notes:
            print(f'  note: {n}')
        for w in warnings:
            print(f'  WARNING {w}')
    return songmap


def bar_list(text):
    """'1,5,13' or '1 5 13' → [1, 5, 13]."""
    try:
        bars = [int(v) for v in re.split(r'[,\s]+', str(text).strip()) if v]
    except ValueError:
        raise argparse.ArgumentTypeError(f'bar numbers separated by commas, such as 1,5,13,17 (got "{text}")')
    if not bars:
        raise argparse.ArgumentTypeError('give the bars where sections start, such as 1,5,13,17')
    return bars


def main(argv=None):
    ap = argparse.ArgumentParser(description='Beat, bar, section and event analysis for music videos.')
    ap.add_argument('audio')
    ap.add_argument('--out', default=None, help='songmap JSON (default: print a summary only)')
    ap.add_argument('--click', default=None, help='write a click preview WAV here')
    ap.add_argument('--bpm', type=float, help='search near this tempo')
    ap.add_argument('--beats-per-bar', type=int, choices=[2, 3, 4, 5, 6, 7])
    ap.add_argument('--first-downbeat', type=float, help='time (s) of a known downbeat')
    ap.add_argument('--stems', help='folder with separated stems (vocals / drums / bass / other)')
    ap.add_argument('--sections', type=bar_list, metavar='BARS', help='bars where sections start, e.g. 1,5,13,17 (bar 1 = the first downbeat); used as given')
    a = ap.parse_args(argv)
    try:
        sm = analyze(a.audio, a.bpm, a.beats_per_bar, a.first_downbeat, a.stems, sections=a.sections)
    except SectionsError as e:
        ap.error(str(e))
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, 'w', encoding='utf-8') as f:
            json.dump(sm, f, ensure_ascii=False, separators=(',', ':'))
        print(f'  wrote {a.out}')
    if a.click:
        click_track(a.audio, sm['beats'], sm['downbeats'], a.click, [s['start'] for s in sm['sections']])
        print(f'  wrote {a.click} (high click = bar start, bell = section start; listen with headphones)')


if __name__ == '__main__':
    main()
