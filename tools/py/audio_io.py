"""Audio input/output and measurement for claude-studio.

Only numpy, scipy and ffmpeg. Decoding goes through ffmpeg, so any format ffmpeg reads works.
Loudness follows ITU-R BS.1770-4 / EBU R128 (K-weighting, 400 ms blocks, -70 LUFS absolute
and -10 LU relative gates); true peak uses 4x oversampling.
"""
import json
import os
import shutil
import subprocess
import wave

import numpy as np
from scipy import ndimage, signal

SR = 48000


def ffmpeg_bin():
    return os.environ.get('STUDIO_FFMPEG') or 'ffmpeg'


def ffprobe_bin():
    ff = os.environ.get('STUDIO_FFMPEG')
    if ff:
        probe = os.path.join(os.path.dirname(ff), 'ffprobe' + ('.exe' if ff.lower().endswith('.exe') else ''))
        if os.path.exists(probe):
            return probe
    return 'ffprobe'


def have_ffmpeg():
    return shutil.which(ffmpeg_bin()) is not None or os.path.exists(ffmpeg_bin())


def run(cmd, input=None):
    """Run a command; raise with its stderr tail on failure. Returns stdout bytes."""
    p = subprocess.run(cmd, input=input, capture_output=True)
    if p.returncode != 0:
        tail = p.stderr.decode('utf-8', 'replace')[-1500:]
        raise RuntimeError(f'{os.path.basename(cmd[0])} failed ({p.returncode}):\n{tail}')
    return p.stdout


def load(path, sr=SR, mono=False, start=None, duration=None):
    """Decode any audio file to float32: shape (n,) when mono, else (n, 2)."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    cmd = [ffmpeg_bin(), '-v', 'error', '-nostdin']
    if start:
        cmd += ['-ss', f'{start:.6f}']
    cmd += ['-i', path]
    if duration:
        cmd += ['-t', f'{duration:.6f}']
    cmd += ['-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1' if mono else '2', '-ar', str(sr), '-']
    data = np.frombuffer(run(cmd), dtype='<f4').astype(np.float32)
    return data if mono else data.reshape(-1, 2)


def save_wav(path, data, sr=SR, bits=24):
    """Write a WAV file. bits: 16 or 24 (PCM, clipped to [-1, 1]) or 32 (IEEE float)."""
    x = np.asarray(data, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    n, ch = x.shape
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if bits == 32:
        payload = np.ascontiguousarray(x.astype('<f4')).tobytes()
        fmt = (3).to_bytes(2, 'little') + ch.to_bytes(2, 'little') + sr.to_bytes(4, 'little') + (sr * ch * 4).to_bytes(4, 'little') + (ch * 4).to_bytes(2, 'little') + (32).to_bytes(2, 'little') + (0).to_bytes(2, 'little')
        fact = b'fact' + (4).to_bytes(4, 'little') + n.to_bytes(4, 'little')
        body = b'WAVE' + b'fmt ' + len(fmt).to_bytes(4, 'little') + fmt + fact + b'data' + len(payload).to_bytes(4, 'little') + payload
        with open(path, 'wb') as f:
            f.write(b'RIFF' + len(body).to_bytes(4, 'little') + body)
        return path
    x = np.clip(x, -1.0, 1.0)
    if bits == 16:
        payload = np.ascontiguousarray(np.round(x * 32767).astype('<i2')).tobytes()
        width = 2
    elif bits == 24:
        ints = np.ascontiguousarray(np.round(x * 8388607).astype('<i4'))
        payload = ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
        width = 3
    else:
        raise ValueError('bits must be 16, 24 or 32')
    with wave.open(path, 'wb') as w:
        w.setnchannels(ch)
        w.setsampwidth(width)
        w.setframerate(sr)
        w.writeframes(payload)
    return path


def probe(path):
    """ffprobe as a dict (format + streams)."""
    out = run([ffprobe_bin(), '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
    return json.loads(out.decode('utf-8', 'replace'))


# ─── Loudness (BS.1770-4) ─────────────────────────────────────────────────────────────────

def _k_filters(sr):
    """K-weighting as two biquads, derived for any sample rate (same derivation as libebur128)."""
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / sr)
    vh = 10 ** (gain / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf_b = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    shelf_a = [1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / sr)
    d = 1 + k / q + k * k
    hp_b = [1.0, -2.0, 1.0]
    hp_a = [1.0, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d]
    return (shelf_b, shelf_a), (hp_b, hp_a)


def _channels(x):
    x = np.asarray(x, dtype=np.float64)
    return x[:, None] if x.ndim == 1 else x


def block_loudness(x, sr=SR, block=0.4, hop=0.1):
    """Loudness of each gating block (LUFS) and the block start times. Momentary = 0.4 s blocks."""
    x = _channels(x)
    (sb, sa), (hb, ha) = _k_filters(sr)
    y = signal.lfilter(hb, ha, signal.lfilter(sb, sa, x, axis=0), axis=0)
    n, step = int(round(block * sr)), int(round(hop * sr))
    if len(y) < n:
        y = np.pad(y, ((0, n - len(y)), (0, 0)))
    sq = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y * y]), axis=0)
    starts = np.arange(0, len(y) - n + 1, step)
    z = (sq[starts + n] - sq[starts]) / n  # mean square per channel
    power = z.sum(axis=1)  # channel weights are 1 for L, R (and mono)
    with np.errstate(divide='ignore'):
        lufs = -0.691 + 10 * np.log10(np.maximum(power, 1e-20))
    return lufs, starts / sr, power


def integrated_lufs(x, sr=SR):
    lufs, _, power = block_loudness(x, sr)
    keep = lufs > -70
    if not keep.any():
        return -70.0
    rel = -0.691 + 10 * np.log10(power[keep].mean()) - 10
    keep &= lufs > rel
    if not keep.any():
        return -70.0
    return float(-0.691 + 10 * np.log10(power[keep].mean()))


def loudness_range(x, sr=SR):
    """EBU 3342 loudness range (LU) from 3 s short-term blocks."""
    lufs, _, power = block_loudness(x, sr, block=3.0, hop=0.1)
    keep = lufs > -70
    if keep.sum() < 2:
        return 0.0
    rel = -0.691 + 10 * np.log10(power[keep].mean()) - 20
    vals = np.sort(lufs[keep & (lufs > rel)])
    if len(vals) < 2:
        return 0.0
    return float(np.percentile(vals, 95) - np.percentile(vals, 10))


def true_peak_db(x, sr=SR):
    x = _channels(x)
    up = signal.resample_poly(x, 4, 1, axis=0)
    peak = max(float(np.abs(up).max()), float(np.abs(x).max()), 1e-12)
    return 20 * np.log10(peak)


def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def limit(x, sr=SR, ceiling_db=-1.0, lookahead=0.005, release_db_per_s=40.0):
    """Look-ahead peak limiter on the 4x-oversampled envelope: no overshoot above the ceiling.

    Gain reduction (dB) looks ahead `lookahead` seconds, recovers at a constant dB/s rate, and the
    attack is smoothed over the look-ahead window only, so every peak is fully covered.
    """
    x = _channels(x)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    n = len(x)
    env = np.maximum(np.pad(up, (0, max(0, 4 * n - len(up))))[: 4 * n].reshape(n, 4).max(axis=1), np.abs(x).max(axis=1))
    gr = np.maximum(0.0, 20 * np.log10(np.maximum(env, 1e-12)) - ceiling_db)  # dB of reduction needed
    la = max(1, int(lookahead * sr))
    gr = ndimage.maximum_filter1d(gr, size=la + 1, origin=-(la // 2), mode='nearest')  # max over [i, i+la]
    d = release_db_per_s / sr
    ramp = np.arange(n) * d
    gr = np.maximum.accumulate(gr + ramp) - ramp  # instant attack, linear-in-dB release
    gr = ndimage.uniform_filter1d(gr, size=la + 1, origin=la // 2, mode='nearest')  # mean over [i-la, i]
    return (x * (10 ** (-gr / 20))[:, None]).astype(np.float32)


def normalize(x, sr=SR, target=-14.0, ceiling_db=-1.0, rounds=3):
    """Gain to the target integrated loudness, then limit true peaks; repeat to settle."""
    y = _channels(x).astype(np.float64)
    for _ in range(rounds):
        cur = integrated_lufs(y, sr)
        y = y * 10 ** ((target - cur) / 20)
        if true_peak_db(y, sr) > ceiling_db - 0.05:
            y = limit(y, sr, ceiling_db - 0.1).astype(np.float64)
        if abs(integrated_lufs(y, sr) - target) < 0.1:
            break
    return y.astype(np.float32)


# ─── Spectral helpers ─────────────────────────────────────────────────────────────────────

def stft_mag(x, n_fft=2048, hop=256, window='hann'):
    """Magnitude STFT, frames centred on t = i * hop / sr. Returns (frames, bins)."""
    x = np.asarray(x, dtype=np.float32)
    pad = n_fft // 2
    x = np.pad(x, (pad, pad))
    n = 1 + (len(x) - n_fft) // hop
    frames = np.lib.stride_tricks.as_strided(x, shape=(n, n_fft), strides=(x.strides[0] * hop, x.strides[0]), writeable=False)
    win = signal.get_window(window, n_fft).astype(np.float32)
    out = np.empty((n, n_fft // 2 + 1), dtype=np.float32)
    step = 2048
    for i in range(0, n, step):
        out[i:i + step] = np.abs(np.fft.rfft(frames[i:i + step] * win, axis=1))
    return out


def mel_filterbank(sr, n_fft, n_mels=64, fmin=30.0, fmax=None):
    fmax = fmax or sr / 2
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    inv = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = inv(np.linspace(mel(fmin), mel(fmax), n_mels + 2))
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    fb = np.zeros((n_mels, len(freqs)), dtype=np.float32)
    for i in range(n_mels):
        lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
        up = (freqs - lo) / max(c - lo, 1e-9)
        down = (hi - freqs) / max(hi - c, 1e-9)
        fb[i] = np.maximum(0, np.minimum(up, down))
    return fb, (pts[1:-1])


# ─── Beat grid ────────────────────────────────────────────────────────────────────────────

def beat_offset(beats, t):
    """Seconds from t to the nearest beat (positive: after it), or None without beats. Before the
    first and after the last beat the grid counts on with the median of the first or last eight
    periods, as the engine's song.timeOfBeat does: a cut on song.T(lastBar + 1), the bar line
    where the music stops, is on the beat."""
    b = np.asarray(beats, dtype=float)
    if not len(b):
        return None
    if len(b) > 1 and not b[0] <= t <= b[-1]:
        edge, p = (b[0], float(np.median(np.diff(b[:9])))) if t < b[0] else (b[-1], float(np.median(np.diff(b[-9:]))))
        if p > 0:
            return round(float(t - (edge + round((t - edge) / p) * p)), 6) + 0.0  # + 0.0: no "-0.0" in reports
    return round(float(t - b[int(np.argmin(np.abs(b - t)))]), 6) + 0.0
