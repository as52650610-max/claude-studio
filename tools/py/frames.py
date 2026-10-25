#!/usr/bin/env python3
"""Bring pictures made elsewhere into a film: Blender renders, generated clips, filmed footage.

    python tools/py/frames.py PROJECT SOURCE [--name N] [--fps F] [--from S] [--to S]
                              [--size fit|cover|source|WxH] [--crop W:H:X:Y] [--format png|jpg]
                              [--key auto|green|blue|#rrggbb] [--similarity S] [--blend B]
                              [--despill M] [--matrix bt709|bt601|bt2020] [--force]

SOURCE is a video file, a folder of numbered images (Blender's output folder), one image of such a
folder, or an ffmpeg pattern such as render_%04d.png. The result is frames/NAME/000001.png … and
frames/NAME/frames.json, which a shot loads with api.loadFrames('frames/NAME') and draws by time
(engine/README.md, "Frame sequences"). Opaque clips are stored as JPEG (quality 2, 4:4:4), clips
with transparency as PNG.

--key removes a green or blue screen with ffmpeg's chromakey. This tool does not key anything
itself; it measures. Before: the screen colour on the edges of six frames, in the colour space
chromakey works in (Y'CbCr after the same scaling), and how far the screen pixels spread, which
sets the threshold. After: screen left at the frame edges, closed holes, specks, the soft edge and
colour spill, with qa/frames_NAME.png showing the source, the keyed frames over a checkerboard and
the matte.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from fractions import Fraction

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audio_io as A  # noqa: E402
import plots  # noqa: E402
import qa as Q  # noqa: E402

IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp')
SAMPLES = 6
# Hue sectors in the CbCr plane, degrees of atan2(Cr, Cb): pure green sits near -130, pure blue near -5.
SECTORS = {'green': (-170.0, -80.0), 'blue': (-60.0, 30.0)}
MATRIX = {'bt709': (0.2126, 0.0722), 'bt601': (0.299, 0.114), 'bt2020': (0.2627, 0.0593)}
SCALE = 'flags=lanczos+accurate_rnd+full_chroma_int'


class Stop(Exception):
    """A problem with the input that the user has to resolve; printed without a traceback."""


def fraction(x):
    return Fraction(x).limit_denominator(1001)


def rate_str(fr):
    return str(fr.numerator) if fr.denominator == 1 else f'{fr.numerator}/{fr.denominator}'


def where(path, root):
    """How frames.json names the source: inside the project relative to it, else its last two parts."""
    path = os.path.abspath(path)
    try:
        rel = os.path.relpath(path, root)
        if not rel.startswith('..'):
            return rel.replace(os.sep, '/')
    except ValueError:  # another drive
        pass
    return '/'.join(path.replace(os.sep, '/').split('/')[-2:])


# ─── Sources ────────────────────────────────────────────────────────────────────────────────

def find_sequence(path):
    """A numbered image sequence from a folder, one of its images, or a printf pattern."""
    if '%' in os.path.basename(path):
        folder, pat = os.path.split(os.path.abspath(path))
        m = re.search(r'%0?(\d*)d', pat)
        if not m:
            raise Stop(f'{path}: a pattern needs %d or %0Nd, e.g. render_%04d.png')
        prefix, tail, width = pat[:m.start()], pat[m.end():], int(m.group(1) or 0)
        if not os.path.isdir(folder):
            raise Stop(f'no such folder: {folder}')
        rx = re.compile(re.escape(prefix) + r'(\d+)' + re.escape(tail) + '$')
        found = [(n, mm.group(1)) for n in os.listdir(folder) if (mm := rx.match(n)) and len(mm.group(1)) >= width]
        groups = {(prefix, tail): found}
    else:
        if os.path.isdir(path):
            folder, pick = os.path.abspath(path), None
        else:
            folder, pick = os.path.split(os.path.abspath(path))
        groups = {}
        for n in os.listdir(folder):
            stem, ext = os.path.splitext(n)
            if ext.lower() not in IMAGE_EXT:
                continue
            m = re.match(r'^(.*?)(\d+)(\D*)$', stem)
            if m:
                groups.setdefault((m.group(1), m.group(3) + ext), []).append((n, m.group(2)))
        if pick:
            m = re.match(r'^(.*?)(\d+)(\D*)$', os.path.splitext(pick)[0])
            key = (m.group(1), m.group(3) + os.path.splitext(pick)[1]) if m else None
            if key not in groups:
                raise Stop(f'{pick} is one picture, not a numbered sequence: draw it with api.loadImage(), or pass a video')
            groups = {key: groups[key]}
        if not groups:
            exr = [n for n in os.listdir(folder) if n.lower().endswith('.exr')]
            if exr:
                raise Stop(f'{folder} holds OpenEXR files ({len(exr)}): EXR is scene-linear light. Render PNG from Blender instead '
                           '(Output: PNG, RGBA for transparency, with the view transform you want baked in).')
            raise Stop(f'no numbered images ({", ".join(IMAGE_EXT)}) in {folder}')
    (prefix, tail), found = max(groups.items(), key=lambda kv: len(kv[1]))
    if not found:
        raise Stop(f'no files match {path}')
    digits = [d for _, d in found]
    nums = sorted(int(d) for d in digits)
    lengths = {len(d) for d in digits}
    if len(lengths) == 1 and (digits[0].startswith('0') or len(found) == 1 or all(len(d) == len(digits[0]) for d in digits)):
        token = f'%0{lengths.pop()}d'
    elif not any(d.startswith('0') and len(d) > 1 for d in digits):
        token = '%d'
    else:
        raise Stop(f'the numbers in {folder} are padded in different ways ({", ".join(sorted(set(digits))[:4])} …): rename them to one width')
    want = set(range(nums[0], nums[-1] + 1))
    missing = sorted(want - set(nums))
    if missing:
        show = ', '.join(str(n) for n in missing[:8]) + (' …' if len(missing) > 8 else '')
        raise Stop(f'{len(missing)} of {len(want)} frames are missing from {folder}{os.sep}{prefix}{token}{tail}: {show}. '
                   'Render them again (holding or repeating frames would change the timing).')
    pattern = prefix.replace('%', '%%') + token + tail.replace('%', '%%')
    return {'folder': folder, 'pattern': pattern, 'first': nums[0], 'count': len(nums),
            'example': os.path.join(folder, next(n for n, d in found if int(d) == nums[0]))}


def has_alpha(pix_fmt):
    return bool(re.search(r'(yuva|rgba|argb|bgra|abgr|gbrap|^ya|pal8)', pix_fmt or ''))


def is_yuv(pix_fmt):
    return bool(re.match(r'(yuv|nv|p01|p21|y21|uyv|yuyv|yvyu|ayuv|vuya|xv|v30|v41)', pix_fmt or ''))


def open_source(path, P, a):
    """Probe SOURCE. Returns what the filter graphs and the sampler need to read it."""
    if not os.path.exists(path) and '%' not in os.path.basename(path) and os.path.exists(P.path(path)):
        path = P.path(path)
    film_fps = float(P.cfg.get('fps') or 30)
    seq = None
    if os.path.isdir(path) or '%' in os.path.basename(path) or os.path.splitext(path)[1].lower() in IMAGE_EXT:
        seq = find_sequence(path)
        probe_path = seq['example']
    elif not os.path.exists(path):
        raise Stop(f'no such file or folder: {path}')
    else:
        probe_path = path
    info = Q.ffprobe(probe_path)
    vs = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
    if not vs:
        raise Stop(f'{probe_path} has no picture ffmpeg can read')
    st = vs[0]
    w, h = int(st.get('width') or 0), int(st.get('height') or 0)
    rot = 0
    for sd in st.get('side_data_list', []) or []:
        if 'rotation' in sd:
            rot = int(float(sd['rotation']))
    rot = rot or int(float((st.get('tags') or {}).get('rotate', 0) or 0))
    if abs(rot) % 180 == 90:
        w, h = h, w  # ffmpeg turns the picture upright when it decodes
    sar = Q.ratio((st.get('sample_aspect_ratio') or '1:1').replace(':', '/')) or 1.0
    if a.crop:
        m = re.fullmatch(r'(\d+):(\d+):(\d+):(\d+)', a.crop)
        if not m:
            raise Stop('--crop wants W:H:X:Y in source pixels, e.g. 1500:1080:210:0')
        cw, ch, cx, cy = map(int, m.groups())
        if cx + cw > w or cy + ch > h:
            raise Stop(f'--crop {a.crop} reaches outside the {w}×{h} source')
        w, h = cw, ch
    pix = st.get('pix_fmt', '')
    tags = {k.lower(): v for k, v in (st.get('tags') or {}).items()}
    decoder = []
    alpha = has_alpha(pix)
    if st.get('codec_name') in ('vp8', 'vp9') and str(tags.get('alpha_mode', '0')) == '1':
        decoder, alpha = ['-c:v', 'libvpx-vp9' if st['codec_name'] == 'vp9' else 'libvpx'], True
    src = {'path': path, 'seq': seq, 'width': max(1, round(w * sar)), 'height': h, 'pix_fmt': pix, 'alpha': alpha,
           'yuv': is_yuv(pix), 'crop': a.crop, 'notes': [], 'audio': any(s.get('codec_type') == 'audio' for s in info.get('streams', []))}
    trc = st.get('color_transfer', '')
    if trc in ('smpte2084', 'arib-std-b67'):
        raise Stop(f'{os.path.basename(path)} is HDR video ({trc}). The film is SDR: export a Rec.709 SDR version first '
                   '(the camera app or editor does the tone mapping better than a guess here).')
    if src['yuv']:
        cs = st.get('color_space', '')
        if a.matrix:
            src['matrix'] = a.matrix
        elif cs == 'bt709':
            src['matrix'] = 'bt709'
        elif cs in ('smpte170m', 'bt470bg', 'fcc'):
            src['matrix'] = 'bt601'
        elif cs.startswith('bt2020'):
            src['matrix'] = 'bt2020'
        else:
            src['matrix'] = 'bt709' if h >= 720 else 'bt601'
            src['notes'].append(f'colour matrix not tagged: read as {src["matrix"]} for a {h}-line picture (pass --matrix bt601|bt709 if colours look off)')
        src['range'] = 'pc' if st.get('color_range') == 'pc' or pix.startswith('yuvj') else 'tv'
    if seq:
        fps = fraction(a.fps or film_fps)
        if not a.fps:
            src['notes'].append(f'images played at {float(fps):g} fps (the film\'s); pass --fps if they were made at another rate')
        start = seq['first'] + (round(a.from_ * float(fps)) if a.from_ else 0)
        end = seq['first'] + seq['count'] if a.to is None else min(seq['first'] + seq['count'], seq['first'] + round(a.to * float(fps)))
        if end <= start:
            raise Stop(f'--from/--to leave no frames of the {seq["count"]} in {seq["folder"]}')
        src.update(kind='images', fps=fps, count=end - start, start=start, label=f'{where(os.path.join(seq["folder"], seq["pattern"]), P.root)} ({start}–{end - 1})')
    else:
        avg, real = Q.ratio(st.get('avg_frame_rate', '0/0')), Q.ratio(st.get('r_frame_rate', '0/0'))
        native = avg or real
        if not native:
            raise Stop(f'{os.path.basename(path)}: ffprobe reports no frame rate; pass --fps')
        if avg and real and abs(avg / real - 1) > 0.01:
            src['notes'].append(f'variable frame rate ({avg:.3f} average, {real:.3f} nominal): resampled to a steady rate')
        fps = fraction(a.fps or native)
        dur = float(st.get('duration') or info.get('format', {}).get('duration') or 0)
        if not dur:
            raise Stop(f'{os.path.basename(path)}: ffprobe reports no duration')
        t0 = a.from_ or 0.0
        t1 = min(dur, a.to) if a.to is not None else dur
        if t1 <= t0:
            raise Stop(f'--from/--to leave nothing of the {dur:.2f} s clip')
        src.update(kind='video', fps=fps, count=max(1, round((t1 - t0) * float(fps))), t0=t0, dur=t1 - t0, decoder=decoder, label=where(path, P.root))
    return src


def input_args(src, sample=None):
    """ffmpeg input options: the whole clip, or one frame (sample = 0-based frame of the clip)."""
    if src['kind'] == 'images':
        n = src['start'] + (sample or 0)
        args = ['-framerate', rate_str(src['fps']), '-start_number', str(n), '-i', os.path.join(src['seq']['folder'], src['seq']['pattern'])]
        return args + ['-frames:v', str(1 if sample is not None else src['count'])]
    t = src['t0'] + (0 if sample is None else (sample + 0.5) / float(src['fps']))
    args = ['-ss', f'{t:.6f}'] if t > 0 else []
    if sample is None:
        args += ['-t', f'{src["dur"]:.6f}']
    args += src['decoder'] + ['-i', src['path']]
    return args + (['-frames:v', '1'] if sample is not None else [])


def target_size(spec, src, P):
    sw, sh = src['width'], src['height']
    fw, fh = int(P.cfg.get('width') or 1920), int(P.cfg.get('height') or 1080)
    if spec == 'source':
        return sw, sh
    m = re.fullmatch(r'(\d+)[x×:](\d+)', spec or '')
    if m:
        return int(m.group(1)), int(m.group(2))
    if spec not in ('fit', 'cover'):
        raise Stop(f'--size {spec}: use fit, cover, source or WxH')
    k = min(1.0, (min if spec == 'fit' else max)(fw / sw, fh / sh))  # never upscale: the engine can do that when drawing
    return max(1, round(sw * k)), max(1, round(sh * k))


# ─── Filter graphs ──────────────────────────────────────────────────────────────────────────

def color_chain(src, size, out_fmt):
    """Source → straight RGB(A) at the output size; one colour conversion with the source's own matrix."""
    W, H = size
    yuv = f':in_color_matrix={src["matrix"]}:in_range={src["range"]}' if src['yuv'] else ''
    if src['alpha'] and out_fmt == 'rgba' and (W, H) != (src['width'], src['height']):
        # Scale with premultiplied alpha, or the colour of transparent pixels bleeds into the edges.
        return f'scale=flags=accurate_rnd+full_chroma_int{yuv},format=gbrap16le,premultiply=inplace=1,scale={W}:{H}:flags=lanczos+accurate_rnd,unpremultiply=inplace=1,format=rgba'
    return f'scale={W}:{H}:{SCALE}{yuv},format={out_fmt}'


def key_chain(src, size):
    """Source → Y'CbCr 4:4:4 at the output size: what chromakey sees, and what the sampler measures."""
    W, H = size
    to_yuv = '' if src['yuv'] else ':out_color_matrix=bt709:out_range=pc'
    return f'scale={W}:{H}:{SCALE}{to_yuv},format=yuva444p'


def key_domain(src):
    return (src['matrix'], src['range']) if src['yuv'] else ('bt709', 'pc')


def head(src):
    parts = [f'crop={src["crop"]}'] if src['crop'] else []
    return parts


def keyed_graph(src, size, key, fps=True):
    pre = head(src) + ([f'fps={rate_str(src["fps"])}'] if fps and src['kind'] == 'video' else [])
    col = '0x' + ''.join(f'{int(round(c)):02x}' for c in key['yuv'])
    tail = f',despill=type={key["despillType"]}:mix={key["despill"]:.3f}' if key['despill'] > 0 and key['despillType'] else ''
    return (f'[0:v]{",".join(pre + ["split"])}[c][k];[c]{color_chain(src, size, "rgba")}[c2];'
            f'[k]{key_chain(src, size)},chromakey=color={col}:similarity={key["similarity"]:.4f}:blend={key["blend"]:.4f}:yuv=1,alphaextract[a];'
            f'[c2][a]alphamerge{tail}[out]')


def plain_graph(src, size, out_fmt):
    pre = head(src) + ([f'fps={rate_str(src["fps"])}'] if src['kind'] == 'video' else [])
    return f'[0:v]{",".join(pre + [color_chain(src, size, out_fmt)])}[out]'


def ffmpeg(args):
    return A.run([A.ffmpeg_bin(), '-v', 'error', '-nostdin', '-y', *args])


def raw_frame(data, shape, what):
    need = int(np.prod(shape))
    if len(data) < need:
        raise Stop(f'{what} could not be read ({len(data)} of {need} bytes): is the source damaged, or --from/--to past its end?')
    return np.frombuffer(data[:need], np.uint8).reshape(shape)


def grab(src, sample, graph, fmt, shape):
    raw = ffmpeg(input_args(src, sample) + ['-an', '-filter_complex', graph, '-map', '[out]', '-f', 'rawvideo', '-pix_fmt', fmt, '-'])
    return raw_frame(raw, shape, f'frame {sample + 1}')


# ─── Measurements ───────────────────────────────────────────────────────────────────────────

def chroma_distance(yuva, key):
    """chromakey's distance: CbCr distance to the key over 255·√2, averaged over the 3×3 neighbourhood."""
    u, v = yuva[1].astype(np.float64), yuva[2].astype(np.float64)
    d = np.sqrt(((u - key[1]) ** 2 + (v - key[2]) ** 2) / (255.0 * 255.0 * 2))
    return ndimage.uniform_filter(d, 3, mode='nearest')


def border_mask(h, w):
    b = max(2, round(0.04 * min(w, h)))
    m = np.zeros((h, w), bool)
    m[:b] = m[-b:] = True
    m[:, :b] = m[:, -b:] = True
    return m


def yuv_to_rgb(y, u, v, matrix, rng):
    kr, kb = MATRIX[matrix]
    y, u, v = (np.asarray(c, np.float64) for c in (y, u, v))
    if rng == 'tv':
        y, cb, cr = (y - 16) / 219, (u - 128) / 224, (v - 128) / 224
    else:
        y, cb, cr = y / 255, (u - 128) / 255, (v - 128) / 255
    r = y + 2 * (1 - kr) * cr
    b = y + 2 * (1 - kb) * cb
    g = (y - kr * r - kb * b) / (1 - kr - kb)
    return np.clip(np.stack([r, g, b], -1) * 255, 0, 255)


def rgb_to_yuv(rgb, matrix, rng):
    kr, kb = MATRIX[matrix]
    r, g, b = (c / 255 for c in rgb)
    y = kr * r + (1 - kr - kb) * g + kb * b
    cb, cr = (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))
    return (16 + 219 * y, 128 + 224 * cb, 128 + 224 * cr) if rng == 'tv' else (255 * y, 128 + 255 * cb, 128 + 255 * cr)


def hue_kind(u, v):
    sat, ang = np.hypot(u - 128, v - 128), np.degrees(np.arctan2(v - 128, u - 128))
    for kind, (lo, hi) in SECTORS.items():
        if sat >= 12 and lo <= ang <= hi:
            return kind
    return None


def measure_screen(samples, a, src):
    """The screen colour and spread, from the frame edges of the sampled frames (pass 1)."""
    h, w = samples[0].shape[1:]
    edge = border_mask(h, w)
    matrix, rng = key_domain(src)
    per = []
    for s in samples:
        u, v = s[1].astype(np.float64), s[2].astype(np.float64)
        sat, ang = np.hypot(u - 128, v - 128), np.degrees(np.arctan2(v - 128, u - 128))
        per.append({kind: (sat >= 12) & (ang >= lo) & (ang <= hi) for kind, (lo, hi) in SECTORS.items()})
    share = {kind: float(np.mean([p[kind][edge].mean() for p in per])) for kind in SECTORS}
    want = a.key.lower()
    if want == 'auto':
        kind = max(share, key=share.get)
        if share[kind] < 0.4:
            raise Stop(f'no green or blue screen at the frame edges ({share["green"]:.0%} green, {share["blue"]:.0%} blue): '
                       'pass --key "#rrggbb" with the screen colour, or --crop to the screen')
    elif want in SECTORS:
        kind = want
        if share[kind] < 0.1:
            raise Stop(f'only {share[kind]:.0%} of the frame edges is {kind}: is this a {kind}-screen clip? '
                       'Pass --key "#rrggbb" with the screen colour, or --crop to the screen')
    elif re.fullmatch(r'#?[0-9a-fA-F]{6}', want):
        kind = None
    else:
        raise Stop(f'--key {a.key}: use auto, green, blue or #rrggbb')
    if kind:
        found = [p[kind] for p in per]
    else:
        rgb = tuple(int(want.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
        key = rgb_to_yuv(rgb, matrix, rng)
        kind = hue_kind(key[1], key[2])
        found = [chroma_distance(s, key) < 0.1 for s in samples]
    covered = float(np.mean([m[edge].mean() for m in found]))
    # Measure on screen pixels whose neighbourhood is all screen: next to the subject (or through 4:2:0
    # chroma), the 3×3 distance chromakey uses is pulled up by colours that are not the screen.
    sel = [edge & ndimage.binary_erosion(m, iterations=2) for m in found]
    if not any(m.any() for m in sel):
        sel = [edge & m for m in found]
    if want in ('auto', *SECTORS):
        key = tuple(float(np.median(np.concatenate([s[c][m] for s, m in zip(samples, sel)]))) for c in range(3))
    dist = [chroma_distance(s, key) for s in samples]
    near = np.concatenate([d[m] for d, m in zip(dist, sel)])
    if not len(near):
        raise Stop(f'the colour {a.key} does not appear at the frame edges: check it, or --crop to the screen')
    spread = float(np.percentile(near, 99.9))
    floor = spread * 1.3 + 0.005  # clears the screen's own noise, creases and shading
    # The other side: how far the subject's colours are from the screen. An edge pixel that is half
    # subject sits about half that distance away, so the soft edge is centred there.
    rest = np.concatenate([d[d > 2 * floor].ravel() for d in dist])
    subject = float(np.percentile(rest, 10)) if rest.size >= 100 else None
    blend = a.blend if a.blend is not None else float(np.clip(floor * 0.5, 0.02, 0.1))
    if a.similarity is not None:
        sim = a.similarity
    else:
        sim = float(np.clip(floor if subject is None else max(floor, 0.5 * subject - blend / 2), 0.02, 0.4))
    rgb = yuv_to_rgb(*key, matrix, rng)
    return {
        'kind': kind or 'custom', 'yuv': [round(c, 1) for c in key], 'rgb': '#' + ''.join(f'{int(round(c)):02x}' for c in rgb),
        'edgeShare': round(covered, 3), 'spread': round(spread, 4), 'subject': None if subject is None else round(subject, 4),
        'similarity': round(sim, 4), 'blend': round(blend, 4),
        'despill': float(a.despill) if kind else 0.0, 'despillType': kind, 'matrix': matrix, 'range': rng,
        'measured': a.similarity is None, 'given': want not in ('auto', *SECTORS),
    }


def components(mask):
    lab, n = ndimage.label(mask)
    if not n:
        return lab, np.zeros(0, int), []
    sizes = np.bincount(lab.ravel())[1:]
    return lab, sizes, ndimage.find_objects(lab)


def measure_matte(keyed, key):
    """What came out (pass 2): per sampled frame, then the worst case across them."""
    h, w = keyed[0].shape[:2]
    area = h * w
    b = max(2, round(0.02 * min(w, h)))
    out = {'opaque': [], 'edges': {'top': 0.0, 'bottom': 0.0, 'left': 0.0, 'right': 0.0}, 'holes': [], 'specks': 0, 'soft': 0.0, 'spill': 0.0}
    ch = {'green': 1, 'blue': 2}.get(key['kind'])
    for k, f in enumerate(keyed):
        al = f[..., 3].astype(np.float64) / 255
        solid = al >= 0.5
        out['opaque'].append(float(solid.mean()))
        for side, band in (('top', solid[:b]), ('bottom', solid[-b:]), ('left', solid[:, :b]), ('right', solid[:, -b:])):
            out['edges'][side] = max(out['edges'][side], float(band.mean()))
        lab, sizes, boxes = components(~solid)
        touch = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
        for i, n in enumerate(sizes, 1):
            if i not in touch and n >= max(16, area * 2e-4):
                sl = boxes[i - 1]
                cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
                out['holes'].append({'sample': k, 'share': n / area, 'x': cx / w, 'y': cy / h})
        lab, sizes, _ = components(solid)
        out['specks'] = max(out['specks'], int(np.sum(sizes < max(9, area * 1e-4))))
        if solid.any():
            seen = al > 0.05
            out['soft'] = max(out['soft'], float((seen & (al < 0.95)).sum() / max(1, seen.sum())))
        if ch is not None:
            core = al >= 0.95
            rim = core & ndimage.binary_dilation(~core, iterations=3)
            if rim.any():
                rgb = f[..., :3].astype(np.int32)
                others = np.max(np.delete(rgb, ch, axis=2), axis=2)
                out['spill'] = max(out['spill'], float(((rgb[..., ch] - others) > 12)[rim].mean()))
    return out


def advice(m, key, name):
    warn = []
    if key['subject'] is not None and key['subject'] < key['similarity'] + key['blend']:
        warn.append(f'a tenth of the subject is within {key["subject"]} of the screen colour, inside the soft edge (to {key["similarity"] + key["blend"]:.3f}): '
                    'expect see-through patches; light the subject apart from the screen, or set --similarity yourself')
    lo, hi = min(m['opaque']), max(m['opaque'])
    if hi < 0.005:
        warn.append(f'almost everything was keyed out (at most {hi:.1%} of a frame is left): the subject is close to the screen colour, or --similarity {key["similarity"]} is too high')
    if lo > 0.9:
        warn.append(f'almost nothing was keyed out ({lo:.0%} of every frame is opaque): wrong screen colour? Check --key')
    big = sorted(m['holes'], key=lambda x: -x['share'])
    if big:
        h = big[0]
        warn.append(f'{len(big)} closed transparent area(s) inside the subject, the largest {h["share"]:.2%} of the frame at '
                    f'({h["x"]:.0%}, {h["y"]:.0%}) in sample {h["sample"] + 1}: a hole (lower --similarity, now {key["similarity"]}) '
                    f'or a real gap such as between an arm and the body? Look at qa/frames_{name}.png')
    if m['specks'] > 20:
        warn.append(f'{m["specks"]} specks of screen left in a frame: raise --similarity a little (now {key["similarity"]}), or --crop away the noisy edge')
    if m['soft'] > 0.25:
        warn.append(f'{m["soft"]:.0%} of what is left is partly transparent: lower --similarity (now {key["similarity"]}) or --blend (now {key["blend"]}) '
                    'unless the subject is hair, smoke or motion blur')
    if m['spill'] > 0.1:
        warn.append(f'{key["kind"]} fringe on {m["spill"]:.0%} of the edge pixels: raise --despill (now {key["despill"]}) or lower --blend')
    return warn


# ─── Pictures ───────────────────────────────────────────────────────────────────────────────

def checker(h, w, cell=8):
    yy, xx = np.mgrid[0:h, 0:w]
    return np.where(((yy // cell + xx // cell) % 2)[..., None] == 0, 0x58, 0x7a).astype(np.float64) * np.ones(3)


def sheet(path, title, columns, captions):
    """columns: list of rows of RGB uint8 arrays (one list per row)."""
    fnt = plots.font()
    rows = len(columns)
    n = len(columns[0])
    th, tw = columns[0][0].shape[:2]
    pad, cap, top = 6, 18, 24
    img = Image.new('RGB', (pad + n * (tw + pad), top + rows * (th + pad) + cap + pad), (16, 16, 18))
    d = ImageDraw.Draw(img)
    d.text((pad, 5), title, fill=(255, 214, 120), font=fnt)
    for r, row in enumerate(columns):
        for c, im in enumerate(row):
            img.paste(Image.fromarray(im), (pad + c * (tw + pad), top + r * (th + pad)))
    for c, text in enumerate(captions):
        d.text((pad + c * (tw + pad), top + rows * (th + pad) + 2), text, fill=(210, 210, 215), font=fnt)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def thumb(arr, tw):
    h, w = arr.shape[:2]
    th = max(1, round(h * tw / w))
    return np.asarray(Image.fromarray(arr).resize((tw, th), Image.LANCZOS))


# ─── Import ─────────────────────────────────────────────────────────────────────────────────

def clear_output(folder, force, rel):
    if not os.path.exists(folder):
        return
    ours = re.compile(r'^(\d{6}\.(png|jpg)|frames\.json)$')
    names = os.listdir(folder)
    if not names:
        return
    if not force:
        raise Stop(f'{rel} exists: pass --force to replace it, or --name another')
    stray = [n for n in names if not ours.match(n)]
    if stray:
        raise Stop(f'{rel} holds other files ({", ".join(stray[:3])}): move them out first; --force only replaces frames')
    for n in names:
        os.remove(os.path.join(folder, n))


def convert(src, graph, out_dir, ext, alpha):
    enc = ['-c:v', 'png', '-pix_fmt', 'rgba' if alpha else 'rgb24'] if ext == 'png' else ['-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuv444p', '-color_range', 'pc']
    cmd = [A.ffmpeg_bin(), '-v', 'error', '-nostdin', '-y', *input_args(src), '-an', '-filter_complex', graph, '-map', '[out]',
           *enc, '-start_number', '1', '-progress', 'pipe:1', '-nostats', os.path.join(out_dir, f'%06d.{ext}')]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    shown = 0
    for line in p.stdout:
        if line.startswith('frame='):
            n = int(line[6:].strip() or 0)
            pct = int(100 * n / max(1, src['count']))
            if pct >= shown + 25 and pct < 100:
                shown = pct - pct % 25
                print(f'  … {n} of about {src["count"]} frames')
    err = p.stderr.read()
    if p.wait() != 0:
        raise RuntimeError(f'ffmpeg failed:\n{err[-1500:]}')


def import_clip(project, source, a, verbose=True):
    P = Q.Project(project)
    log = print if verbose else (lambda *x, **k: None)
    src = open_source(source, P, a)
    size = target_size(a.size, src, P)
    W, H = size
    keying = bool(a.key)
    if keying and src['alpha']:
        raise Stop('the clip already has transparency: drop --key (its own alpha is kept)')
    alpha = keying or src['alpha']
    ext = a.format or ('png' if alpha else 'jpg')
    if ext == 'jpg' and alpha:
        raise Stop('JPEG has no transparency: use --format png for keyed or transparent clips')
    base = a.name or (os.path.basename(src['seq']['folder']) if src['seq'] else os.path.splitext(os.path.basename(src['path']))[0])
    name = re.sub(r'[^\w-]+', '-', base).strip('-').lower() or 'clip'
    out_dir = P.path(os.path.join('frames', name))
    clear_output(out_dir, a.force, f'frames/{name}')
    os.makedirs(out_dir, exist_ok=True)

    n = min(SAMPLES, src['count'])
    picks = [int((k + 0.5) / n * src['count']) for k in range(n)]
    key = matte = None
    shots = []
    if keying:
        pre = head(src)
        split = f'[0:v]{",".join(pre + ["split"])}[c][k];[c]{color_chain(src, size, "rgb24")}[co];[k]{key_chain(src, size)}[ko]'
        samples = []
        tmp = tempfile.mkdtemp(prefix='studio-frames-')
        try:
            for i in picks:
                c_raw, k_raw = os.path.join(tmp, 'c.raw'), os.path.join(tmp, 'k.raw')
                ffmpeg(input_args(src, i) + ['-an', '-filter_complex', split, '-map', '[co]', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', c_raw,
                                             '-map', '[ko]', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'yuva444p', k_raw])
                shots.append(raw_frame(np.fromfile(c_raw, np.uint8), (H, W, 3), f'frame {i + 1}'))
                samples.append(raw_frame(np.fromfile(k_raw, np.uint8), (4, H, W), f'frame {i + 1}'))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        key = measure_screen(samples, a, src)
        keyed = [grab(src, i, keyed_graph(src, size, key, fps=False), 'rgba', (H, W, 4)) for i in picks]
        matte = measure_matte(keyed, key)
        graph = keyed_graph(src, size, key)
    else:
        graph = plain_graph(src, size, 'rgba' if alpha else 'rgb24')

    convert(src, graph, out_dir, ext, alpha)
    files = sorted(f for f in os.listdir(out_dir) if re.fullmatch(rf'\d{{6}}\.{ext}', f))
    if not files:
        raise Stop('ffmpeg wrote no frames: check --from/--to and the source')
    if [int(f[:6]) for f in files] != list(range(1, len(files) + 1)):
        raise Stop(f'the frames in {out_dir} are not numbered 1…{len(files)}: run again with --force')
    count = len(files)
    total = sum(os.path.getsize(os.path.join(out_dir, f)) for f in files)
    meta = {
        'fps': round(float(src['fps']), 9), 'rate': rate_str(src['fps']), 'count': count, 'width': W, 'height': H, 'pattern': f'%06d.{ext}', 'first': 1,
        'alpha': alpha, 'source': src['label'], 'size': [src['width'], src['height']],
    }
    if src['kind'] == 'video':
        meta.update({'from': round(src['t0'], 6), 'to': round(src['t0'] + src['dur'], 6)})
    if src['crop']:
        meta['crop'] = src['crop']
    if key:
        meta['key'] = {k: key[k] for k in ('kind', 'rgb', 'yuv', 'similarity', 'blend', 'despill', 'matrix', 'range', 'edgeShare', 'spread', 'subject')}
        meta['matte'] = {'opaque': [round(min(matte['opaque']), 4), round(max(matte['opaque']), 4)], 'edges': {k: round(v, 4) for k, v in matte['edges'].items()},
                         'holes': len(matte['holes']), 'specks': matte['specks'], 'soft': round(matte['soft'], 4), 'spill': round(matte['spill'], 4)}
    meta.update({'filter': graph, 'made': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'by': 'studio frames'})
    with open(os.path.join(out_dir, 'frames.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)

    # The contact sheet: source, result, matte.
    tw = min(320, W)
    caps = [f'frame {i + 1} · {i / float(src["fps"]):.2f} s' for i in picks]
    rel = f'frames/{name}'
    if key:
        board = checker(H, W, max(4, W // 64))
        over = [(k[..., :3] * (k[..., 3:] / 255) + board * (1 - k[..., 3:] / 255)).astype(np.uint8) for k in keyed]
        mats = [np.repeat(k[..., 3:], 3, axis=2) for k in keyed]
        rows = [[thumb(x, tw) for x in shots], [thumb(x, tw) for x in over], [thumb(x, tw) for x in mats]]
        title = f'{rel} · source / keyed over a checkerboard / matte · {key["kind"]} {key["rgb"]} similarity {key["similarity"]} blend {key["blend"]} despill {key["despill"]}'
    else:
        imgs = [np.asarray(Image.open(os.path.join(out_dir, files[min(i, count - 1)])).convert('RGBA')) for i in picks]
        board = checker(H, W, max(4, W // 64))
        rows = [[thumb((x[..., :3] * (x[..., 3:] / 255) + board * (1 - x[..., 3:] / 255)).astype(np.uint8), tw) for x in imgs]]
        title = f'{rel} · {count} frames' + (' (over a checkerboard: transparent parts show it)' if alpha else '')
    sheet_path = P.path(f'qa/frames_{name}.png')
    sheet(sheet_path, title, rows, caps)

    log(f'\n  {rel}: {count} frames, {W}×{H} @ {float(src["fps"]):g} fps ({count / float(src["fps"]):.2f} s), '
        f'{"PNG with transparency" if alpha else ext.upper()}, {total / 2 ** 20:.0f} MB')
    log(f'  from:  {src["label"]}' + (f', {src["width"]}×{src["height"]}' if (src['width'], src['height']) != size else ''))
    for note in src['notes']:
        log(f'  note:  {note}')
    if src['audio']:
        log('  note:  the clip\'s sound is not imported; put sounds in data/sfx.json or the shot\'s sfx so "studio mix" places them')
    warn = []
    if key:
        how = 'given with --key' if key['given'] else 'measured on the frame edges'
        log(f'  key:   {key["kind"]} {key["rgb"]} (Y\'CbCr {key["yuv"][0]:.0f}/{key["yuv"][1]:.0f}/{key["yuv"][2]:.0f} {key["matrix"]} {key["range"]}, '
            f'{how}: {key["edgeShare"]:.0%} of the edges is screen)')
        seen = f'screen 99.9% within {key["spread"]}' + (f', subject 90% beyond {key["subject"]}' if key['subject'] is not None else '')
        log(f'         similarity {key["similarity"]} ({seen}{"" if key["measured"] else "; set with --similarity"}) · blend {key["blend"]} · despill {key["despill"]}')
        e = matte['edges']
        log(f'  matte: opaque {min(matte["opaque"]):.0%}–{max(matte["opaque"]):.0%} of a frame · edges opaque top {e["top"]:.0%} bottom {e["bottom"]:.0%} '
            f'left {e["left"]:.0%} right {e["right"]:.0%} · {len(matte["holes"])} closed hole(s) · {matte["specks"]} speck(s) · '
            f'partly transparent {matte["soft"]:.0%} of what is left · fringe {matte["spill"]:.0%} of the edge pixels')
        if max(e.values()) > 0.02:
            log('         (an opaque frame edge is the subject cut by the frame, or screen, floor or rigging that was not keyed: --crop it)')
        warn = advice(matte, key, name)
        for w_ in warn:
            log(f'  WARN   {w_}')
    log(f'  look:  qa/frames_{name}.png')
    log(f"  use:   const clip = await api.loadFrames('{rel}');   then in draw: clip.draw(ctx, s.local, ...clip.fit(s.width, s.height, 'cover'))")
    return {'dir': out_dir, 'meta': meta, 'warnings': warn, 'sheet': sheet_path, 'key': key, 'matte': matte}


def parser():
    ap = argparse.ArgumentParser(prog='studio frames', description='Bring a video or numbered images into the film as a frame sequence.')
    ap.add_argument('project', help='the film folder (with studio.json)')
    ap.add_argument('source', help='video file, folder of numbered images, one of its images, or a pattern like render_%%04d.png')
    ap.add_argument('--name', help='folder under frames/ (default: from the source name)')
    ap.add_argument('--fps', type=float, help="frame rate: images default to the film's, video keeps its own")
    ap.add_argument('--from', dest='from_', type=float, metavar='S', help='start, seconds into the source')
    ap.add_argument('--to', type=float, metavar='S', help='end, seconds into the source')
    ap.add_argument('--size', default='fit', help='fit (inside the film frame, default), cover, source or WxH; never upscales unless WxH')
    ap.add_argument('--crop', help='W:H:X:Y in source pixels, before anything else')
    ap.add_argument('--format', choices=['png', 'jpg'], help='default: png with transparency, jpg otherwise')
    ap.add_argument('--key', help='remove a screen: auto, green, blue or #rrggbb')
    ap.add_argument('--similarity', type=float, help='chromakey threshold (default: measured from the screen)')
    ap.add_argument('--blend', type=float, help='width of the soft edge (default: half the similarity, 0.02–0.1)')
    ap.add_argument('--despill', type=float, default=0.5, help='spill suppression 0–1 (default 0.5; 0 turns it off)')
    ap.add_argument('--matrix', choices=sorted(MATRIX), help="the source's colour matrix when it is not tagged")
    ap.add_argument('--force', action='store_true', help='replace frames/NAME')
    return ap


def main(argv=None):
    a = parser().parse_args(argv)
    if not A.have_ffmpeg():
        print('\n  ffmpeg not found: install it or set STUDIO_FFMPEG\n')
        return 1
    try:
        import_clip(a.project, a.source, a)
    except Stop as e:
        print(f'\n  {e}\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
