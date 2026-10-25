"""Fonts for claude-studio: coverage, widths and subsets. No dependencies.

  python tools/py/fonts.py info FONT [--index N]          # names, license, embedding, glyphs, axes
  python tools/py/fonts.py missing FONT "text" [--text-file F]
  python tools/py/fonts.py width FONT "text" --size 100
  python tools/py/fonts.py subset FONT --out OUT.ttf [--text "…"] [--text-file F ...] [--no-ascii]
  python tools/py/fonts.py project DIR                    # subset every studio.json font that has "from"

Reads TrueType and OpenType fonts and collections (.ttc). Subsets fonts with TrueType outlines
(glyf), variable fonts (gvar) included. Glyph IDs are kept, so every layout table (GSUB, GPOS,
GDEF, HVAR, kern) stays valid and kerning, ligatures and contextual forms still work: unused
glyphs are emptied, glyphs reachable through composites or GSUB substitutions are kept, cmap
lists only the characters the subset really draws, and vertical metrics are dropped (canvas text
never uses them). A Noto Sans TC subset for a few hundred characters is about 0.7 MB instead of
12 MB. CFF-flavoured fonts (.otf) can be checked and measured but not subset.
"""
import argparse
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OFL_TEXT = os.path.join(HERE, '..', 'licenses', 'OFL-1.1.txt')

# Characters that need no glyph (same set as the engine's FontBook): whitespace, zero-width
# marks and variation selectors.
IGNORABLE = re.compile('[\\s​-‏⁠︀-️]')
ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))
# Punctuation that turns up in titles and credits even when the lyrics do not use it.
CJK_PUNCT = '，。、！？：；…—～·・「」『』（）《》〈〉【】“”‘’　'

# Tables rebuilt by the subsetter, and tables it drops (vertical metrics, signatures, caches).
REBUILT = {'glyf', 'loca', 'gvar', 'cmap', 'head', 'post'}
DROPPED = {'vhea', 'vmtx', 'VORG', 'VVAR', 'DSIG', 'hdmx', 'LTSH'}


def u16(b, o):
    return struct.unpack_from('>H', b, o)[0]


def i16(b, o):
    return struct.unpack_from('>h', b, o)[0]


def u32(b, o):
    return struct.unpack_from('>I', b, o)[0]


class Font:
    """One font from a .ttf/.otf file or one face of a .ttc collection."""

    def __init__(self, path, index=0):
        self.path = path
        with open(path, 'rb') as f:
            data = f.read()
        base = 0
        if data[:4] == b'ttcf':
            count = u32(data, 8)
            if index >= count:
                raise ValueError(f'{path}: collection has {count} fonts, asked for index {index}')
            base = u32(data, 12 + 4 * index)
        self.flavor = data[base:base + 4]
        if self.flavor not in (b'\x00\x01\x00\x00', b'OTTO', b'true'):
            raise ValueError(f'{path}: not a TrueType/OpenType font (starts with {self.flavor!r})')
        n = u16(data, base + 4)
        self.tables = {}
        for i in range(n):
            tag, _, off, ln = struct.unpack_from('>4sIII', data, base + 12 + 16 * i)
            self.tables[tag.decode('latin-1')] = data[off:off + ln]
        for need in ('head', 'maxp', 'cmap', 'hhea', 'hmtx'):
            if need not in self.tables:
                raise ValueError(f'{path}: missing required table {need}')
        head = self.tables['head']
        self.units_per_em = u16(head, 18)
        self.num_glyphs = u16(self.tables['maxp'], 4)
        self.cmap = parse_cmap(self.tables['cmap'])
        n_hm = u16(self.tables['hhea'], 34)
        hmtx = self.tables['hmtx']
        adv = [u16(hmtx, 4 * i) for i in range(n_hm)]
        self.advances = adv + [adv[-1]] * (self.num_glyphs - n_hm)
        self.names = parse_names(self.tables.get('name', b''))

    # ── description ──────────────────────────────────────────────────────────────────────
    @property
    def family(self):
        return self.names.get(16) or self.names.get(1) or os.path.basename(self.path)

    @property
    def style(self):
        return self.names.get(17) or self.names.get(2) or ''

    @property
    def outlines(self):
        if 'glyf' in self.tables:
            return 'TrueType'
        if 'CFF2' in self.tables:
            return 'CFF2'
        if 'CFF ' in self.tables:
            return 'CFF'
        return 'bitmap/other'

    @property
    def axes(self):
        """Variation axes: [(tag, min, default, max)]."""
        fvar = self.tables.get('fvar')
        if not fvar:
            return []
        off, count, size = u16(fvar, 4), u16(fvar, 8), u16(fvar, 10)
        out = []
        for i in range(count):
            o = off + i * size
            tag = fvar[o:o + 4].decode('latin-1')
            lo, de, hi = (struct.unpack_from('>i', fvar, o + 4 + 4 * k)[0] / 65536 for k in range(3))
            out.append((tag, lo, de, hi))
        return out

    @property
    def license(self):
        """SPDX-style id guessed from the license description (name ID 13), or 'unknown'."""
        text = (self.names.get(13, '') + ' ' + self.names.get(14, '')).lower()
        if 'open font license' in text or 'scripts.sil.org/ofl' in text or 'openfontlicense' in text:
            return 'OFL-1.1'
        if 'apache license' in text or 'apache.org/licenses' in text:
            return 'Apache-2.0'
        if 'ubuntu font licen' in text:
            return 'UFL-1.0'
        return 'unknown'

    @property
    def embedding(self):
        """OS/2 fsType as words; restricted fonts may not be embedded or subset."""
        os2 = self.tables.get('OS/2')
        if not os2 or len(os2) < 10:
            return 'unknown', True
        fs = u16(os2, 8)
        notes, ok = [], True
        if fs & 0x0002:
            notes.append('restricted license (no embedding)')
            ok = False
        if fs & 0x0004:
            notes.append('preview & print')
        if fs & 0x0008:
            notes.append('editable')
        if fs & 0x0100:
            notes.append('no subsetting')
            ok = False
        if fs & 0x0200:
            notes.append('bitmap embedding only')
            ok = False
        return (', '.join(notes) or 'installable'), ok

    # ── coverage and measurement ─────────────────────────────────────────────────────────
    def glyph(self, ch):
        return self.cmap.get(ord(ch), 0)

    def missing(self, text):
        """Characters of text the font cannot draw, in order of first appearance."""
        out = []
        for ch in str(text):
            if not IGNORABLE.match(ch) and ord(ch) not in self.cmap and ch not in out:
                out.append(ch)
        return out

    def width(self, text, size=1.0, spacing=0.0):
        """Advance width of text in px at font size `size` (no kerning; spacing in em per char)."""
        total = 0
        n = 0
        for ch in str(text):
            if ch in '​‌‍⁠' or '︀' <= ch <= '️':
                continue
            total += self.advances[self.cmap.get(ord(ch), 0)]
            n += 1
        return total / self.units_per_em * size + spacing * size * n

    def describe(self):
        emb, ok = self.embedding
        return {
            'path': self.path, 'family': self.family, 'style': self.style, 'outlines': self.outlines,
            'glyphs': self.num_glyphs, 'characters': len(self.cmap), 'unitsPerEm': self.units_per_em,
            'axes': [{'tag': t, 'min': a, 'default': b, 'max': c} for t, a, b, c in self.axes],
            'license': self.license, 'licenseText': self.names.get(13, '')[:160],
            'copyright': self.names.get(0, ''), 'embedding': emb, 'embeddingAllowed': ok,
        }


# ─── Parsing ─────────────────────────────────────────────────────────────────────────────────

def parse_names(name):
    out = {}
    if len(name) < 6:
        return out
    count, so = u16(name, 2), u16(name, 4)
    best = {}
    for i in range(count):
        pid, eid, lid, nid, ln, off = struct.unpack_from('>6H', name, 6 + 12 * i)
        raw = name[so + off:so + off + ln]
        if pid == 3 or pid == 0:
            s = raw.decode('utf-16-be', 'replace')
        elif pid == 1 and eid == 0:
            s = raw.decode('mac_roman', 'replace')
        else:
            continue
        rank = 0 if (pid == 3 and lid == 0x409) else 1 if pid == 3 else 2
        if nid not in best or rank < best[nid]:
            best[nid] = rank
            out[nid] = s
    return out


def parse_cmap(cmap):
    """All Unicode mappings of a cmap table: {codepoint: glyph id}."""
    out = {}
    n = u16(cmap, 2)
    subs = []
    for i in range(n):
        pid, eid, off = struct.unpack_from('>HHI', cmap, 4 + 8 * i)
        if pid == 0 or (pid == 3 and eid in (1, 10)):
            subs.append(off)
    # Prefer full-repertoire subtables: parse BMP ones first, let format 12/13 overwrite.
    subs.sort(key=lambda o: u16(cmap, o) in (12, 13))
    for off in dict.fromkeys(subs):
        fmt = u16(cmap, off)
        if fmt == 4:
            seg2 = u16(cmap, off + 6)
            ends = off + 14
            starts = ends + seg2 + 2
            deltas = starts + seg2
            ranges = deltas + seg2
            for s in range(seg2 // 2):
                end, start = u16(cmap, ends + 2 * s), u16(cmap, starts + 2 * s)
                delta, ro = u16(cmap, deltas + 2 * s), u16(cmap, ranges + 2 * s)
                for c in range(start, min(end, 0xfffe) + 1):
                    if ro == 0:
                        g = (c + delta) & 0xffff
                    else:
                        p = ranges + 2 * s + ro + 2 * (c - start)
                        g = u16(cmap, p)
                        if g:
                            g = (g + delta) & 0xffff
                    if g:
                        out[c] = g
        elif fmt in (12, 13):
            groups = u32(cmap, off + 12)
            for k in range(groups):
                a, b, g = struct.unpack_from('>III', cmap, off + 16 + 12 * k)
                for c in range(a, b + 1):
                    gid = g + (c - a) if fmt == 12 else g
                    if gid:
                        out[c] = gid
        elif fmt == 6:
            first, count = u16(cmap, off + 6), u16(cmap, off + 8)
            for k in range(count):
                g = u16(cmap, off + 10 + 2 * k)
                if g:
                    out[first + k] = g
        elif fmt == 0:
            for c in range(256):
                g = cmap[off + 6 + c]
                if g:
                    out[c] = g
    return out


def loca_offsets(font):
    loca = font.tables['loca']
    if i16(font.tables['head'], 50) == 0:
        return [2 * u16(loca, 2 * i) for i in range(font.num_glyphs + 1)]
    return [u32(loca, 4 * i) for i in range(font.num_glyphs + 1)]


def components(glyph):
    """Glyph ids used by a composite glyph."""
    if len(glyph) < 10 or i16(glyph, 0) >= 0:
        return []
    out, p = [], 10
    while True:
        flags, gid = u16(glyph, p), u16(glyph, p + 2)
        out.append(gid)
        p += 4 + (4 if flags & 0x0001 else 2)
        if flags & 0x0008:
            p += 2
        elif flags & 0x0040:
            p += 4
        elif flags & 0x0080:
            p += 8
        if not flags & 0x0020:
            return out


def coverage(t, off):
    """[(glyph, coverage index)] of an OpenType coverage table."""
    fmt = u16(t, off)
    if fmt == 1:
        return [(u16(t, off + 4 + 2 * i), i) for i in range(u16(t, off + 2))]
    out = []
    for r in range(u16(t, off + 2)):
        a, b, idx = struct.unpack_from('>HHH', t, off + 4 + 6 * r)
        out.extend((g, idx + g - a) for g in range(a, b + 1))
    return out


def gsub_closure(gsub, glyphs):
    """Add every glyph that GSUB can substitute for glyphs already in the set."""
    if not gsub:
        return glyphs
    lookups_off = u16(gsub, 8)
    count = u16(gsub, lookups_off)
    subtables = []
    for i in range(count):
        lo = lookups_off + u16(gsub, lookups_off + 2 + 2 * i)
        kind, n = u16(gsub, lo), u16(gsub, lo + 4)
        for k in range(n):
            st = lo + u16(gsub, lo + 6 + 2 * k)
            t = kind
            if t == 7:  # extension: the real subtable sits further away
                t = u16(gsub, st + 2)
                st = st + u32(gsub, st + 4)
            subtables.append((t, st))
    for _ in range(16):
        before = len(glyphs)
        for t, st in subtables:
            fmt = u16(gsub, st)
            if t in (1, 2, 3, 4, 8):
                cov = [(g, i) for g, i in coverage(gsub, st + u16(gsub, st + 2)) if g in glyphs]
            else:
                continue
            if t == 1 and fmt == 1:
                d = u16(gsub, st + 4)
                glyphs.update((g + d) & 0xffff for g, _ in cov)
            elif t == 1 and fmt == 2:
                glyphs.update(u16(gsub, st + 6 + 2 * i) for _, i in cov)
            elif t in (2, 3):
                for _, i in cov:
                    so = st + u16(gsub, st + 6 + 2 * i)
                    glyphs.update(u16(gsub, so + 2 + 2 * k) for k in range(u16(gsub, so)))
            elif t == 4:
                for _, i in cov:
                    ls = st + u16(gsub, st + 6 + 2 * i)
                    for k in range(u16(gsub, ls)):
                        lig = ls + u16(gsub, ls + 2 + 2 * k)
                        comp = [u16(gsub, lig + 4 + 2 * j) for j in range(u16(gsub, lig + 2) - 1)]
                        if all(c in glyphs for c in comp):
                            glyphs.add(u16(gsub, lig))
            elif t == 8:
                p = st + 4
                p += 2 + 2 * u16(gsub, p)  # backtrack coverages
                p += 2 + 2 * u16(gsub, p)  # lookahead coverages
                glyphs.update(u16(gsub, p + 2 + 2 * i) for _, i in cov)
        if len(glyphs) == before:
            break
    return {g for g in glyphs if g < 0xffff}


# ─── Building ────────────────────────────────────────────────────────────────────────────────

def checksum(data):
    data = data + b'\0' * (-len(data) % 4)
    return sum(struct.unpack(f'>{len(data) // 4}I', data)) & 0xffffffff


def build_cmap(mapping):
    """cmap with format 4 (BMP) and format 12 (everything) for Unicode and Windows platforms."""
    items = sorted((c, g) for c, g in mapping.items() if g)
    bmp = [(c, g) for c, g in items if c < 0xffff]
    segs = []
    for c, g in bmp:
        if segs and c == segs[-1][1] + 1 and g == segs[-1][2] + (c - segs[-1][0]):
            segs[-1][1] = c
        else:
            segs.append([c, c, g])
    segs.append([0xffff, 0xffff, 1])
    n = len(segs)
    sr = 2 * (1 << (n.bit_length() - 1))
    es = (n.bit_length() - 1)
    f4 = struct.pack('>HHHH', 2 * n, sr, es, 2 * n - sr)
    f4 += b''.join(struct.pack('>H', e) for _, e, _ in segs) + b'\0\0'
    f4 += b''.join(struct.pack('>H', s) for s, _, _ in segs)
    f4 += b''.join(struct.pack('>H', (g - s) & 0xffff) for s, _, g in segs)
    f4 += b'\0\0' * n
    f4 = struct.pack('>HHH', 4, 6 + len(f4), 0) + f4
    groups = []
    for c, g in items:
        if groups and c == groups[-1][1] + 1 and g == groups[-1][2] + (c - groups[-1][0]):
            groups[-1][1] = c
        else:
            groups.append([c, c, g])
    f12 = struct.pack('>HHIII', 12, 0, 16 + 12 * len(groups), 0, len(groups))
    f12 += b''.join(struct.pack('>III', *grp) for grp in groups)
    records = [(0, 3, 0), (0, 4, 1), (3, 1, 0), (3, 10, 1)]
    head = struct.pack('>HH', 0, len(records))
    off4 = 4 + 8 * len(records)
    off12 = off4 + len(f4)
    head += b''.join(struct.pack('>HHI', p, e, off12 if which else off4) for p, e, which in records)
    return head + f4 + f12


def write_sfnt(tables, flavor=b'\x00\x01\x00\x00'):
    tags = sorted(tables)
    n = len(tags)
    sr = 16 * (1 << (n.bit_length() - 1))
    out = bytearray(flavor + struct.pack('>HHHH', n, sr, n.bit_length() - 1, 16 * n - sr))
    offset = 12 + 16 * n
    body = bytearray()
    head_at = None
    for tag in tags:
        data = tables[tag]
        if tag == 'head':
            data = data[:8] + b'\0\0\0\0' + data[12:]
            head_at = offset + len(body)
        out += struct.pack('>4sIII', tag.encode('latin-1'), checksum(data), offset + len(body), len(data))
        body += data + b'\0' * (-len(data) % 4)
    font = bytearray(out + body)
    if head_at is not None:
        adj = (0xB1B0AFBA - checksum(bytes(font))) & 0xffffffff
        struct.pack_into('>I', font, head_at + 8, adj)
    return bytes(font)


def subset(src, text, out, index=0, ascii=True, extra='', force=False):
    """Write a subset of `src` that draws `text`; returns a summary dict."""
    font = Font(src, index)
    if font.outlines != 'TrueType':
        raise ValueError(f'{src}: {font.outlines} outlines cannot be subset by this tool; use a TrueType (.ttf) build of the font or the full file')
    emb, ok = font.embedding
    if not ok and not force:
        raise PermissionError(f'{src}: the font forbids this ({emb}). Use a font whose license allows embedding and subsetting.')
    want = set(text) | set(extra) | (set(ASCII) if ascii else set())
    want = {ch for ch in want if not IGNORABLE.match(ch) or ch == ' '}
    mapping = {ord(ch): font.cmap[ord(ch)] for ch in want if ord(ch) in font.cmap}
    missing = sorted(ch for ch in want if ord(ch) not in font.cmap and ch != ' ')

    loca = loca_offsets(font)
    glyf = font.tables['glyf']
    keep = {0} | set(mapping.values())
    keep = gsub_closure(font.tables.get('GSUB'), keep)
    todo = list(keep)
    while todo:  # composite glyphs pull in their components
        g = todo.pop()
        for c in components(glyf[loca[g]:loca[g + 1]]):
            if c not in keep:
                keep.add(c)
                todo.append(c)

    new_glyf, new_loca = bytearray(), [0]
    for g in range(font.num_glyphs):
        if g in keep:
            data = glyf[loca[g]:loca[g + 1]]
            new_glyf += data + b'\0' * (-len(data) % 4)
        new_loca.append(len(new_glyf))
    tables = {tag: data for tag, data in font.tables.items() if tag not in REBUILT and tag not in DROPPED}
    tables['glyf'] = bytes(new_glyf)
    tables['loca'] = struct.pack(f'>{len(new_loca)}I', *new_loca)
    head = bytearray(font.tables['head'])
    struct.pack_into('>h', head, 50, 1)  # long loca
    tables['head'] = bytes(head)
    post = font.tables.get('post')
    if post:
        tables['post'] = struct.pack('>I', 0x00030000) + post[4:32]
    tables['cmap'] = build_cmap(mapping)
    gvar = font.tables.get('gvar')
    if gvar:
        axis_count, shared_count = u16(gvar, 4), u16(gvar, 6)
        shared_off, glyph_count, flags, data_off = u32(gvar, 8), u16(gvar, 12), u16(gvar, 14), u32(gvar, 16)
        if flags & 1:
            offs = [u32(gvar, 20 + 4 * i) for i in range(glyph_count + 1)]
        else:
            offs = [2 * u16(gvar, 20 + 2 * i) for i in range(glyph_count + 1)]
        shared = gvar[shared_off:shared_off + 2 * axis_count * shared_count]
        data, new_offs = bytearray(), [0]
        for g in range(glyph_count):
            if g in keep:
                data += gvar[data_off + offs[g]:data_off + offs[g + 1]]
            new_offs.append(len(data))
        s_off = 20 + 4 * (glyph_count + 1)
        tables['gvar'] = (struct.pack('>HHHHIHHI', 1, 0, axis_count, shared_count, s_off, glyph_count, flags | 1, s_off + len(shared))
                          + struct.pack(f'>{glyph_count + 1}I', *new_offs) + shared + bytes(data))
    blob = write_sfnt(tables, b'\x00\x01\x00\x00')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(blob)
    check = Font(out)
    lost = [chr(c) for c in mapping if c not in check.cmap]
    if lost:
        raise RuntimeError(f'subset lost characters: {"".join(lost)}')
    return {'src': src, 'out': out, 'family': font.family, 'license': font.license, 'characters': len(mapping),
            'glyphs': len(keep), 'bytes': len(blob), 'sourceBytes': os.path.getsize(src), 'missing': missing}


def license_text(fonts):
    """The license file for the subsets in one folder: each font's copyright line, then the
    license. fonts: a Font or [(family, Font)]. None unless every font is OFL-1.1."""
    if not isinstance(fonts, list):
        fonts = [(fonts.family, fonts)]
    if not fonts or any(f.license != 'OFL-1.1' for _, f in fonts):
        return None
    lines = []
    for family, f in fonts:
        line = f.names.get(0, '').strip()
        entry = f'{family}: {line}' if len(fonts) > 1 else line
        if entry not in lines:
            lines.append(entry)
    body = open(OFL_TEXT, encoding='utf-8').read()
    copyright_line = '\n'.join(lines)
    return (f'{copyright_line}\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n'
            f'This license is copied below, and is also available with a FAQ at: https://openfontlicense.org\n\n{body}')


# ─── Projects ────────────────────────────────────────────────────────────────────────────────

def project_text(root):
    """Every character a project may draw: lyrics (text and translation), non-ASCII text in its
    source files (.js .mjs .html .css .json) and text files under data/ (.md .txt). Planning
    documents (BRIEF.md, STORYBOARD.md, …) are not drawn, so they are not included."""
    chars = set()
    lyr = os.path.join(root, 'data', 'lyrics.json')
    if os.path.exists(lyr):
        data = json.load(open(lyr, encoding='utf-8'))
        for line in data.get('lines', []):
            chars.update(line.get('text', '') or '')
            chars.update(line.get('translation', '') or '')
    skip = {'out', 'qa', 'audio', 'fonts', 'engine', 'node_modules', '.git', '.segments'}
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in skip]
        for name in files:
            in_data = os.path.relpath(d, root).split(os.sep)[0] == 'data'
            source = name.endswith(('.js', '.mjs', '.html', '.css')) or (in_data and name.endswith(('.md', '.txt')))
            if source or (name.endswith('.json') and name not in ('songmap.json', 'lyrics.json', 'lyrics.timing.json')):
                try:
                    s = open(os.path.join(d, name), encoding='utf-8').read()
                except (UnicodeDecodeError, OSError):
                    continue
                chars.update(ch for ch in s if ord(ch) > 0x7e)
    return ''.join(sorted(ch for ch in chars if not IGNORABLE.match(ch) and ch.isprintable()))


def subset_project(root, ascii=True, log=print):
    cfg_path = os.path.join(root, 'studio.json')
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    text = project_text(root)
    results = []
    licenses = {}  # folder → [(family, Font)]: one OFL.txt per folder names every font in it
    for spec in cfg.get('fonts', []):
        src = spec.get('from')
        out = os.path.join(root, spec['src'])
        src_path = (src if os.path.isabs(src) else os.path.join(root, src)) if src else None
        if not src_path or not os.path.exists(src_path):
            # No source on this machine (another computer, a cloned example): keep the subset.
            why = 'no "from"' if not src else f'{src} is not on this machine'
            if os.path.exists(out):
                licenses.setdefault(os.path.dirname(out), []).append((spec['family'], Font(out)))
                miss = Font(out).missing(text)
                results.append({'family': spec['family'], 'src': spec['src'], 'missing': miss})
                log(f'  {spec["family"]}: {spec["src"]} (not subset; {why})' + (f' — missing {"".join(miss)}' if miss else ''))
            elif src:
                raise SystemExit(f'  {spec["family"]}: {why} and {spec["src"]} does not exist. Point "from" at the font file on this machine.')
            continue
        r = subset(src_path, text, out, index=int(spec.get('index', 0)), ascii=ascii, extra=CJK_PUNCT)
        font = Font(src_path, int(spec.get('index', 0)))
        licenses.setdefault(os.path.dirname(out), []).append((spec['family'], font))
        if font.license != 'OFL-1.1':
            log(f'  ! {spec["family"]}: license "{r["license"]}" — put the font\'s license next to it yourself and check it allows redistribution')
        r['family'] = spec['family']
        results.append(r)
        log(f'  {spec["family"]}: {r["characters"]} characters, {r["glyphs"]} glyphs, {r["bytes"] / 1e6:.2f} MB (from {r["sourceBytes"] / 1e6:.1f} MB) → {spec["src"]}'
            + (f' — missing {"".join(r["missing"])}' if r['missing'] else ''))
    for folder, fonts in licenses.items():
        lic = license_text(fonts)
        if lic:
            with open(os.path.join(folder, 'OFL.txt'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(lic)
    return results


# ─── CLI ─────────────────────────────────────────────────────────────────────────────────────

def read_text(args):
    s = args.text or ''
    for p in args.text_file or []:
        s += open(p, encoding='utf-8').read()
    return s


def main(argv=None):
    ap = argparse.ArgumentParser(description='Font coverage, widths and subsets.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('info')
    p.add_argument('font')
    p.add_argument('--index', type=int, default=0)
    for name in ('missing', 'width'):
        p = sub.add_parser(name)
        p.add_argument('font')
        p.add_argument('text', nargs='?')
        p.add_argument('--text-file', action='append')
        p.add_argument('--index', type=int, default=0)
        p.add_argument('--size', type=float, default=100.0)
    p = sub.add_parser('subset')
    p.add_argument('font')
    p.add_argument('--out', required=True)
    p.add_argument('--text')
    p.add_argument('--text-file', action='append')
    p.add_argument('--index', type=int, default=0)
    p.add_argument('--no-ascii', action='store_true')
    p.add_argument('--force', action='store_true', help='subset even if the font\'s embedding flags forbid it (you hold the rights)')
    p = sub.add_parser('project')
    p.add_argument('dir')
    p.add_argument('--no-ascii', action='store_true')
    a = ap.parse_args(argv)

    if a.cmd == 'info':
        print(json.dumps(Font(a.font, a.index).describe(), ensure_ascii=False, indent=2))
    elif a.cmd == 'missing':
        miss = Font(a.font, a.index).missing(read_text(a))
        print(''.join(miss) if miss else 'all characters covered')
        return 1 if miss else 0
    elif a.cmd == 'width':
        print(f'{Font(a.font, a.index).width(read_text(a), a.size):.1f} px at {a.size:g} px')
    elif a.cmd == 'subset':
        r = subset(a.font, read_text(a), a.out, a.index, ascii=not a.no_ascii, force=a.force)
        print(f'{r["characters"]} characters, {r["glyphs"]} glyphs, {r["bytes"] / 1e6:.2f} MB → {a.out}')
        if r['missing']:
            print(f'not in the font: {"".join(r["missing"])}')
        lic = license_text(Font(a.font, a.index))
        if lic:
            path = os.path.join(os.path.dirname(os.path.abspath(a.out)), 'OFL.txt')
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(lic)
            print(f'license → {path}')
    elif a.cmd == 'project':
        subset_project(a.dir, ascii=not a.no_ascii)
    return 0


if __name__ == '__main__':
    sys.exit(main())
