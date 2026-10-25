"""Lyrics for claude-studio: import, check, snap, strip/fill and export. No dependencies.

  python tools/py/lyrics.py import  PROJECT song.lrc       # LRC (enhanced <mm:ss.xx> too), SRT or JSON
  python tools/py/lyrics.py check   PROJECT                # reading time, overlaps, width, glyphs, timing
  python tools/py/lyrics.py snap    PROJECT [--dry-run]    # line starts to vocal onsets or half beats
  python tools/py/lyrics.py listen  PROJECT [-n 10]        # excerpts of the least certain starts, with a tick
  python tools/py/lyrics.py strip   PROJECT                # data/lyrics.timing.json: times only, no text
  python tools/py/lyrics.py fill    PROJECT lyrics.txt     # put the text back on the timing
  python tools/py/lyrics.py export  PROJECT [--format srt|vtt|lrc]
  python tools/py/lyrics.py check-repo ROOT               # no lyric fragments or audio in versioned files

Times in data/lyrics.json are song times (seconds into the analysed audio). The engine adds
studio.json's offset and lyricOffset; `export` adds them too, because subtitle files sit next to the
video. Per-character times that were not measured are estimated by weight (CJK 1, other letters
0.25, spaces 0.1, punctuation 0, the same weights as the engine) and marked "est".
"""
import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SWEEP = 0.25        # seconds per weighted character when an end time has to be guessed (4 CJK chars/s)
SHORT = 0.6         # lines shorter than this are hard to read
FIRST = 1.0         # a first line this early usually means a missing lead-in
WIDE_UNITS = 33     # import-time width limit: 33 CJK characters at 50 px on 1920 px (about 70 Latin letters)
READ_CJK = 4.5      # CJK characters read per second
READ_WORDS = 2.5    # Latin words read per second
AUDIO_EXT = {'.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.aif', '.aiff', '.wma', '.alac', '.ape'}
VIDEO_EXT = {'.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'}

# Characters that only occur in one script. Both kinds in one text usually means a copy-paste mix.
# (Shared with Japanese forms are left out so Japanese lyrics do not trip it.)
SIMPLIFIED = set('们这说时间爱么个对过还发听让动样问见觉经长头开关门风飞马鸟东车书语话认识边远连进运选网电视场热无乐习变欢亿买亲从众优伟传伤侧债倾儿兰兴养军农冻净减凤击则刚创删劝办务劳势华协单卖卫历压厌县吗员响团园围图圆圣坏块坚执扩扫扬扰抢护报拥择挂挡挥损换摄摆显晓暂杀杂权杨极构枪标树桥梦检楼欧毕气汇汉泪洁测济浓涛润涨满灭灵灿烂烟烦烧爷猎环现疗盐监盘矿码础祸离种称稳穷竞笔简粮紧红约级纪纯纸线练组细织终结绕绘给络绝统继绩续维绿缓编缘罗职联肠肤胜脑脸舰艰艺节苏苹荣药获营萧蓝虑虽补观规览计订讨训议记讲许论设访证评诉词译试诗诚询该详误请读课谁调谈谢谱贝负财责败货质贫购贵费贺资赏赛赞赶跃践踪轨转轮软轻载较辆辈辉输达迈违迟适递遗邮郑释针钟钢钱铁铃银链销锁错键镜闪闭闲闻阅队阳阴阵阶际陆陈险随隐难雾韩页顶项顺须顾预领频题颜额飘饭饮馆驶验骑鱼鲜鸡鸣鸭齐龙')
TRADITIONAL = set('們這說麼對會發聽讓樣覺經關邊樂寫變歡亂爭從眾傳體兒黨淨擊刪勸辦勵勞單賣歷壓縣嗎團圍國圖圓壞擴擾搶擔擇擋據攝擺數斷舊顯曉雜權條檢樓歐畢氣匯淚淺濟濤漲溫灣濕滿燈靈燒獨獵獻畫鹽礦禮稱穩繞繪絕繼續綠聯腦腳臉艱藝蘋榮藥營蕭雖裝觀覽證譯讀讚趕踐蹤轉輕輛辭邁遲遞釋錢鐵鏈銷閒閱險隨隱靜顏飄駛驗雞麥黃齊來沒點')

IGNORABLE = re.compile('[\\s​-‏⁠︀-️]')


# ─── Text ────────────────────────────────────────────────────────────────────────────────────

def is_cjk(cp):
    return (0x3400 <= cp <= 0x4dbf or 0x4e00 <= cp <= 0x9fff or 0xf900 <= cp <= 0xfaff or 0x20000 <= cp <= 0x3134f
            or 0x3040 <= cp <= 0x30ff or 0x31f0 <= cp <= 0x31ff or 0xff66 <= cp <= 0xff9f
            or 0xac00 <= cp <= 0xd7af or 0x1100 <= cp <= 0x11ff or 0x3130 <= cp <= 0x318f
            or 0x3100 <= cp <= 0x312f or 0x31a0 <= cp <= 0x31bf)


def graphemes(text):
    """User-perceived characters: base + combining marks, variation selectors, ZWJ sequences, flags."""
    out = []
    for ch in str(text):
        cp = ord(ch)
        glue = (unicodedata.category(ch) in ('Mn', 'Me', 'Mc') or 0xfe00 <= cp <= 0xfe0f or 0xe0100 <= cp <= 0xe01ef
                or 0x1f3fb <= cp <= 0x1f3ff or cp in (0x200d, 0x20e3) or 0xe0020 <= cp <= 0xe007f)
        if out and (glue or out[-1].endswith('‍')):
            out[-1] += ch
        elif out and 0x1f1e6 <= cp <= 0x1f1ff and len(out[-1]) == 1 and 0x1f1e6 <= ord(out[-1]) <= 0x1f1ff:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def char_weight(g):
    """Karaoke weight of one grapheme (same rule as the engine's charWeight)."""
    if any(c.isspace() for c in g):
        return 0.1
    if any(unicodedata.category(c)[0] in 'PS' for c in g):
        return 0.0
    if any(is_cjk(ord(c)) for c in g):
        return 1.0
    return 0.25


def estimate_chars(text, start, end):
    gs = graphemes(text)
    w = [char_weight(g) for g in gs]
    total = sum(w) or 1.0
    out, acc = [], start
    for g, wi in zip(gs, w):
        d = (end - start) * wi / total
        out.append({'c': g, 'start': round(acc, 3), 'end': round(acc + d, 3), 'est': True})
        acc += d
    return out


def normalize(s):
    s = unicodedata.normalize('NFKC', str(s)).lower()
    return ''.join(c for c in s if not c.isspace() and unicodedata.category(c)[0] not in 'PS')


def text_key(s):
    return hashlib.sha1(normalize(s).encode('utf-8')).hexdigest()[:8]


def width_units(text):
    """Approximate width in CJK-character units, for when no font is at hand."""
    u = 0.0
    for c in str(text):
        if c.isspace():
            u += 0.25
        elif unicodedata.east_asian_width(c) in ('W', 'F'):
            u += 1.0
        elif unicodedata.category(c)[0] in 'PS':
            u += 0.3
        else:
            u += WIDE_UNITS / 70
    return u


def reading_need(text):
    """Seconds a viewer needs to read a line (CJK at 4.5 chars/s, Latin at 2.5 words/s)."""
    cjk = sum(1 for c in text if is_cjk(ord(c)))
    words = len(re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)?|\d+", ''.join(' ' if is_cjk(ord(c)) else c for c in text)))
    return max(0.8, cjk / READ_CJK + words / READ_WORDS + 0.5)


def fmt_t(t):
    t = max(0.0, t)
    return f'{int(t // 60):02d}:{t % 60:05.2f}'


def short(text, n=14):
    gs = graphemes(text)
    return ''.join(gs[:n]) + ('…' if len(gs) > n else '')


# ─── Project files ───────────────────────────────────────────────────────────────────────────

class Project:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        p = os.path.join(self.root, 'studio.json')
        self.cfg = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
        self.lyrics_path = self.path(self.cfg.get('lyrics', 'data/lyrics.json'))
        self.timing_path = self.path('data/lyrics.timing.json')
        self.songmap_path = self.path(self.cfg.get('songmap', 'data/songmap.json'))
        self.name = self.cfg.get('name') or os.path.basename(self.root)

    def path(self, rel):
        return rel if os.path.isabs(rel) else os.path.join(self.root, rel)

    def songmap(self):
        return json.load(open(self.songmap_path, encoding='utf-8')) if os.path.exists(self.songmap_path) else None

    def lyrics(self):
        if not os.path.exists(self.lyrics_path):
            raise SystemExit(f'no lyrics yet: {self.lyrics_path}\n  import some: python tools/py/lyrics.py import {self.root} song.lrc')
        return json.load(open(self.lyrics_path, encoding='utf-8'))

    def audio(self):
        a = self.cfg.get('audio')
        return self.path(a) if a else None

    def save_lyrics(self, data, path=None):
        write_lyrics(path or self.lyrics_path, data)


def write_lyrics(path, data):
    """One JSON line per lyric line: readable, and a retimed line is a one-line diff."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    head = {k: v for k, v in data.items() if k != 'lines'}
    parts = ['{']
    for k, v in head.items():
        parts.append(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},')
    parts.append('  "lines": [')
    lines = data.get('lines', [])
    for i, line in enumerate(lines):
        parts.append('    ' + json.dumps(line, ensure_ascii=False, separators=(', ', ': ')) + (',' if i + 1 < len(lines) else ''))
    parts.append('  ]')
    parts.append('}')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(parts) + '\n')


def section_names(songmap):
    """[(start, end, 'verse1')] from the songmap's sections."""
    out, count = [], {}
    for s in (songmap or {}).get('sections', []):
        k = s.get('kind') or s.get('label') or 'part'
        count[k] = count.get(k, 0) + 1
        out.append((s['start'], s['end'], f'{k}{count[k]}'))
    return out


def section_at(names, t):
    for a, b, n in names:
        if a - 0.25 <= t < b - 0.25:
            return n
    return names[-1][2] if names and t >= names[-1][0] else ''


# ─── Import ──────────────────────────────────────────────────────────────────────────────────

TIME = r'(\d+):(\d{1,2}(?:[.:]\d{1,3})?)'
TAG = re.compile(r'\[' + TIME + r'\]')
WORD = re.compile(r'<' + TIME + r'>')
META = re.compile(r'^\[([A-Za-z#]+):(.*)\]\s*$')


def parse_time(m, s):
    sec = s
    if ':' in sec:  # [mm:ss:xx] means hundredths
        a, b = sec.split(':')
        return int(m) * 60 + int(a) + int(b) / (10 ** len(b))
    return int(m) * 60 + float(sec)


def parse_lrc(text, dupes='drop'):
    """Returns (entries, warnings). Each entry: {start, text, words?, end?}."""
    warns, raw, offset = [], [], 0.0
    for n, line in enumerate(text.lstrip('﻿').splitlines(), 1):
        s = line.strip()
        if not s:
            continue
        stamps, pos = [], 0
        while True:
            m = TAG.match(s, pos)
            if not m:
                break
            stamps.append(parse_time(m.group(1), m.group(2)))
            pos = m.end()
        if not stamps:
            meta = META.match(s)
            if meta and meta.group(1).lower() == 'offset':
                try:
                    offset = float(meta.group(2).strip()) / 1000.0
                except ValueError:
                    warns.append(f'line {n}: unreadable offset tag {s!r}')
            elif not meta:
                warns.append(f'line {n}: no timestamp, ignored: {short(s, 24)}')
            continue
        body = s[pos:]
        words = None
        if WORD.search(body):
            words, last, cur = [], None, None
            pieces = WORD.split(body)  # text, m, s, text, m, s, text ...
            lead = pieces[0]
            for k in range(1, len(pieces), 3):
                t = parse_time(pieces[k], pieces[k + 1])
                seg = pieces[k + 2]
                if cur is not None:
                    cur['end'] = t
                if seg:
                    cur = {'t': t, 'text': seg, 'end': None}
                    words.append(cur)
                last = t
            if lead.strip():
                words.insert(0, {'t': stamps[0], 'text': lead, 'end': words[0]['t'] if words else last})
            words = [w for w in words if w['text']]
            for k, w in enumerate(words):  # one space between words, none at the ends
                if k and words[k - 1]['text'].endswith(' '):
                    w['text'] = w['text'].lstrip(' ')
            if words:
                words[0]['text'] = words[0]['text'].lstrip()
                words[-1]['text'] = words[-1]['text'].rstrip()
            words = [w for w in words if w['text']]
            body = ''.join(w['text'] for w in words)
        for t in stamps:
            raw.append({'start': t, 'text': body.strip(), 'words': words, 'n': n})
    raw.sort(key=lambda e: e['start'])
    if offset:
        warns.append(f'applied the file\'s offset tag: times moved {-offset * 1000:+.0f} ms')
        for e in raw:
            e['start'] -= offset
            for w in e['words'] or []:
                w['t'] -= offset
                if w['end'] is not None:
                    w['end'] -= offset
    entries = []
    for e in raw:
        if not e['text']:
            if entries and entries[-1].get('end') is None:
                entries[-1]['end'] = e['start']  # a blank time line ends the previous line
            continue
        if entries and abs(entries[-1]['start'] - e['start']) < 0.001:
            prev = entries[-1]
            if dupes == 'translation' and not prev.get('translation'):
                prev['translation'] = e['text']
            else:
                warns.append(f'{fmt_t(e["start"])} two lines share one timestamp; kept "{short(prev["text"])}", dropped "{short(e["text"])}" (use --dupes translation to keep it as the translation)')
            continue
        if e['words']:
            w_end = e['words'][-1]['end']
            e['end'] = w_end if w_end is not None else None
        else:
            e['end'] = None
        entries.append(e)
    return entries, warns


def parse_srt(text, two_line='join'):
    entries, warns = [], []
    blocks = re.split(r'\n\s*\n', text.lstrip('﻿').replace('\r\n', '\n').strip())
    rx = re.compile(r'(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)')
    for b in blocks:
        rows = [r for r in b.split('\n') if r.strip()]
        k = next((i for i, r in enumerate(rows) if rx.search(r)), None)
        if k is None:
            continue
        m = rx.search(rows[k])
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 10 ** len(m.group(4))
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 10 ** len(m.group(8))
        body = [re.sub(r'<[^>]+>', '', r).strip() for r in rows[k + 1:]]
        if not body:
            continue
        e = {'start': start, 'end': end, 'text': body[0] if two_line == 'translation' else ' '.join(body), 'words': None}
        if two_line == 'translation' and len(body) > 1:
            e['translation'] = ' '.join(body[1:])
        entries.append(e)
    entries.sort(key=lambda e: e['start'])
    return entries, warns


def chars_from_words(words, end):
    """Per-character times from enhanced-LRC word stamps; characters inside one stamp are estimated."""
    out = []
    for k, w in enumerate(words):
        w_end = w['end'] if w['end'] is not None else (words[k + 1]['t'] if k + 1 < len(words) else end)
        cs = estimate_chars(w['text'], w['t'], max(w['t'], w_end))
        solid = [c for c in cs if c['c'].strip()]
        for c in cs:
            c['est'] = len(solid) > 1
        out.extend(cs)
    return out


def finish(entries, duration=None):
    """Fill missing ends, build chars, and number the lines."""
    lines = []
    for i, e in enumerate(entries):
        start = e['start']
        sweep = sum(char_weight(g) for g in graphemes(e['text'])) * SWEEP
        guess = start + max(2.0, 2 * sweep)
        end, est_end = e.get('end'), False
        if end is None or end <= start:
            nxt = entries[i + 1]['start'] if i + 1 < len(entries) else None
            end = min(nxt - 0.1, guess) if nxt is not None else guess
            if duration:
                end = min(end, duration)
            est_end = True
        line = {'i': i, 'start': round(start, 3), 'end': round(max(end, start + 0.05), 3), 'text': e['text'],
                'translation': e.get('translation', ''), 'section': '', 'keyword': False}
        if est_end:
            line['endEst'] = True
        line['chars'] = chars_from_words(e['words'], line['end']) if e.get('words') else estimate_chars(e['text'], line['start'], line['end'])
        lines.append(line)
    return lines


def import_warnings(lines):
    warns = []
    for k, l in enumerate(lines):
        n = k + 1
        if k and l['start'] < lines[k - 1]['end'] - 0.005:
            warns.append(f'line {n} {fmt_t(l["start"])}: overlaps line {n - 1} by {lines[k - 1]["end"] - l["start"]:.2f} s')
        if l['end'] - l['start'] < SHORT:
            warns.append(f'line {n} {fmt_t(l["start"])}: only {l["end"] - l["start"]:.2f} s long')
        u = width_units(l['text'])
        if u > WIDE_UNITS:
            warns.append(f'line {n} {fmt_t(l["start"])}: about {u:.0f} characters wide (limit ~{WIDE_UNITS} at 50 px on 1920 px); consider splitting')
    if lines and lines[0]['start'] < FIRST:
        warns.append(f'line 1 starts at {lines[0]["start"]:.2f} s: check the lead-in (a missing intro or an offset?)')
    return warns


def cmd_import(a):
    P = Project(a.project)
    src = a.file
    text = open(src, encoding='utf-8-sig', errors='replace').read()
    ext = os.path.splitext(src)[1].lower()
    sm = P.songmap()
    duration = sm.get('duration') if sm else None
    if ext == '.json':
        data = json.loads(text)
        rows = data['lines'] if isinstance(data, dict) else data
        entries = [{'start': float(r['start']), 'end': float(r['end']) if r.get('end') is not None else None, 'text': str(r.get('text', '')).strip(),
                    'translation': r.get('translation', ''), 'words': None, 'chars': r.get('chars')} for r in rows]
        warns = []
        entries.sort(key=lambda e: e['start'])
    elif ext == '.srt' or ext == '.vtt':
        entries, warns = parse_srt(text, a.two_line)
    else:
        entries, warns = parse_lrc(text, a.dupes)
    if not entries:
        raise SystemExit(f'{src}: no timed lines found. Plain text has no times: tap them in tools/lyric-tapper.html, or use "fill" with a timing file.')
    if a.offset:
        for e in entries:
            e['start'] += a.offset
            if e.get('end') is not None:
                e['end'] += a.offset
            for w in e.get('words') or []:
                w['t'] += a.offset
                if w['end'] is not None:
                    w['end'] += a.offset
    lines = finish(entries, duration)
    for l, e in zip(lines, entries):  # JSON input may carry measured per-character times
        cs = e.get('chars')
        if cs and all('c' in c and 'start' in c and 'end' in c for c in cs):
            l['chars'] = [{'c': c['c'], 'start': round(float(c['start']), 3), 'end': round(float(c['end']), 3), 'est': bool(c.get('est', False))} for c in cs]
    names = section_names(sm)
    for l in lines:
        l['section'] = section_at(names, l['start']) if names else ''
    old = json.load(open(P.lyrics_path, encoding='utf-8')) if os.path.exists(P.lyrics_path) else {}
    source = old.get('source') or f'imported from {os.path.basename(src)} — write where the text comes from (official lyrics, booklet, …)'
    data = {'version': 1, 'source': source, 'lines': lines}
    if old.get('publishable'):
        data['publishable'] = True
    backup = os.path.exists(P.lyrics_path) and not a.force
    if backup:
        os.replace(P.lyrics_path, P.lyrics_path + '.bak')
    P.save_lyrics(data)
    warns += import_warnings(lines)
    est = sum(1 for l in lines if all(c['est'] for c in l['chars']))
    print(f'  {len(lines)} lines → {os.path.relpath(P.lyrics_path)}' + (f' (previous file kept as {os.path.basename(P.lyrics_path)}.bak)' if backup else ''))
    if est:
        print(f'  {est} lines have estimated per-character times (fine for whole-line designs, not for karaoke wipes)')
    for w in warns:
        print(f'  ! {w}')
    return 0


# ─── Check ───────────────────────────────────────────────────────────────────────────────────

def project_font(P):
    """(path of the font the engine will load for lyrics, family, note) or (None, None, note)."""
    fam = P.cfg.get('lyricFont') or (P.cfg.get('fonts') or [{}])[0].get('family')
    for spec in P.cfg.get('fonts', []):
        if spec.get('family') == fam:
            src = P.path(spec['src']) if spec.get('src') else None
            if src and os.path.exists(src):
                return src, fam, ''
            if spec.get('from') and os.path.exists(P.path(spec['from'])):
                return P.path(spec['from']), fam, f'{spec.get("src")} does not exist yet: run "studio fonts"'
            return None, fam, f'font file for "{fam}" not found'
    return None, fam, 'no lyric font in studio.json'


def vocal_onsets(sm):
    ev = (sm or {}).get('events', {}).get('vocal') or []
    return sorted(e[0] if isinstance(e, (list, tuple)) else float(e) for e in ev)


def half_beats(sm):
    b = (sm or {}).get('beats') or []
    out = []
    for x, y in zip(b, b[1:]):
        out += [x, (x + y) / 2]
    return out + b[-1:]


def nearest(sorted_list, t):
    import bisect
    if not sorted_list:
        return None
    i = bisect.bisect_left(sorted_list, t)
    cands = [sorted_list[j] for j in (i - 1, i) if 0 <= j < len(sorted_list)]
    return min(cands, key=lambda x: abs(x - t))


def uncertainty(lines, sm, lyric_offset=0.0):
    """Line starts ranked by how likely they are wrong: [(score, line index, reasons)]."""
    onsets, grid = vocal_onsets(sm), half_beats(sm)
    out = []
    for k, l in enumerate(lines):
        s = l['start'] + lyric_offset
        score, why = 0.0, []
        if onsets:
            o = nearest(onsets, s)
            d = o - s
            if abs(d) > 0.5:
                score += 2.5
                why.append('no vocal onset within 0.5 s')
            elif abs(d) > 0.1:
                score += abs(d) / 0.1
                why.append(f'nearest vocal onset {d * 1000:+.0f} ms')
        if grid:
            g = nearest(grid, s)
            if abs(g - s) > 0.09 and not (onsets and abs(nearest(onsets, s) - s) <= 0.05):
                score += 0.5
                why.append(f'{(s - g) * 1000:+.0f} ms off the half-beat grid')
        gap = l['start'] - lines[k - 1]['end'] if k else l['start']
        if k == 0 or gap > 4:
            score += 0.6
            why.append('first line after a long gap' if k else 'first line')
        if l['end'] - l['start'] < SHORT:
            score += 1.0
            why.append('very short')
        if k and l['start'] < lines[k - 1]['end'] - 0.005:
            score += 1.0
            why.append('overlaps the previous line')
        snap = l.get('snap')
        if snap and abs(snap['to'] - snap['from']) > 0.08:
            score += 0.5
            why.append(f'snapped {(snap["to"] - snap["from"]) * 1000:+.0f} ms to a {snap["by"]}')
        if score > 0:
            out.append((round(score, 2), k, why))
    out.sort(key=lambda x: -x[0])
    return out


def check(P, verbose=True):
    data = P.lyrics()
    lines = data.get('lines', [])
    sm = P.songmap()
    lyric_offset = float(P.cfg.get('lyricOffset', 0) or 0)
    W, H = int(P.cfg.get('width', 1920)), int(P.cfg.get('height', 1080))
    size = float(P.cfg.get('lyricSize', 96))
    tsize = float(P.cfg.get('translationSize', round(size * 0.5)))
    safe = 0.9 * W
    errors, warns, info = [], [], []
    has_text = any(l.get('text') for l in lines)
    if not lines:
        errors.append('no lines')
    font_path, fam, note = project_font(P)
    font = None
    if font_path:
        import fonts as FT
        font = FT.Font(font_path)
    if note:
        (warns if font_path else info).append(note)
    all_text = ''
    # An excerpt ("offset" < 0 or a "duration" shorter than the song) shows only some lines:
    # reading time and width are checked for those; the file's structure is checked for all.
    shift = float(P.cfg.get('offset', 0) or 0) + lyric_offset
    film_dur = float(P.cfg.get('duration', 0) or 0)
    excerpt = shift < -0.5 or bool(film_dur and sm and sm.get('duration', 0) > film_dur + 1)
    shown = 0
    inside_set = set()
    for k, l in enumerate(lines):
        n, t0 = k + 1, fmt_t(l['start'])
        inside = not excerpt or (l['end'] + shift > 0 and (not film_dur or l['start'] + shift < film_dur))
        shown += inside
        if inside:
            inside_set.add(k)
        where = f'line {n} {t0}' + (f' (film {fmt_t(max(0.0, l["start"] + shift))})' if excerpt else '')
        text, tr = l.get('text', ''), l.get('translation', '') or ''
        all_text += text + tr
        dur = l['end'] - l['start']
        if dur <= 0:
            errors.append(f'{where}: ends before it starts')
            continue
        if has_text and not text:
            errors.append(f'{where}: no text (run "lyrics fill"?)')
        if k and l['start'] < lines[k - 1]['end'] - 0.005:
            errors.append(f'{where}: overlaps line {n - 1} by {lines[k - 1]["end"] - l["start"]:.2f} s')
        if k and l['start'] < lines[k - 1]['start']:
            errors.append(f'{where}: starts before line {n - 1} (lines must be in time order)')
        if inside and dur < SHORT:
            warns.append(f'{where}: only {dur:.2f} s long')
        nxt = lines[k + 1]['start'] if k + 1 < len(lines) else l['end'] + 2.0
        if inside and text:
            need = reading_need(text)
            room = max(dur, nxt - l['start'])
            if room < need - 0.05:
                warns.append(f'{where}: hard to read — at most {room:.2f} s on screen, needs ~{need:.2f} s (hold it into the gap, show it as a group, or shorten)')
        for label, s, px in (('', text, size), (' translation', tr, tsize)):
            if not s:
                continue
            w = font.width(s, px) if font else width_units(s) * px
            if inside and w > safe:
                warns.append(f'{where}{label}: {w:.0f} px wide at {px:g} px, safe width {safe:.0f} px (fits at {px * safe / w:.0f} px, or split the line)')
            if font:
                miss = font.missing(s)
                if miss:
                    errors.append(f'{where}{label}: "{fam}" has no glyph for {" ".join(miss)}')
        cs = l.get('chars') or []
        real = [c for c in cs if not c.get('est')]
        if cs:
            if any(c['start'] < l['start'] - 0.02 or c['end'] > l['end'] + 0.02 for c in cs):
                errors.append(f'{where}: per-character times fall outside the line')
            if any(b['start'] < a['start'] - 1e-6 for a, b in zip(cs, cs[1:])):
                errors.append(f'{where}: per-character times go backwards')
            if text and ''.join(c.get('c', '') for c in cs) not in ('', text):
                errors.append(f'{where}: chars do not spell the line text')
        if real:
            solid = [c for c in real if c.get('c', 'x').strip()]
            zero = sum(1 for c in solid if c['end'] - c['start'] < 0.005)
            if solid and zero / len(solid) > 0.2:
                warns.append(f'{where}: {zero} of {len(solid)} characters have zero length (an aligner swallowed them?)')
            fast = sum(1 for c in solid if is_cjk(ord(c.get('c', 'a')[0])) and 0.005 <= c['end'] - c['start'] < 0.08)
            if fast >= 2:
                warns.append(f'{where}: {fast} CJK characters shorter than 0.08 s (impossibly fast; check the alignment)')
    if lines and lines[0]['start'] < FIRST and not excerpt:
        warns.append(f'line 1 starts at {lines[0]["start"]:.2f} s: check the lead-in')
    if excerpt:
        info.append(f'excerpt: {shown} of {len(lines)} lines are in the film (reading time and width checked for those only)')
        if has_text and not shown:
            warns.append('no lyric line falls inside the excerpt: check "offset" and "duration"')
    if sm and lines and lines[-1]['end'] > sm.get('duration', 1e9) + 0.05:
        errors.append(f'the last line ends at {lines[-1]["end"]:.2f} s, after the song ({sm["duration"]:.2f} s)')
    s_hits, t_hits = sorted(set(all_text) & SIMPLIFIED), sorted(set(all_text) & TRADITIONAL)
    if s_hits and t_hits:
        warns.append(f'mixed scripts: simplified {"".join(s_hits[:8])} and traditional {"".join(t_hits[:8])} — convert the whole text to one')
    est_lines = sum(1 for l in lines if l.get('chars') and all(c.get('est') for c in l['chars']))
    if est_lines:
        info.append(f'{est_lines} of {len(lines)} lines have estimated per-character times: fine for whole-line designs, not for karaoke wipes')
    if not has_text:
        info.append('timing only (no text): run "lyrics fill" with your lyrics file')
    if not vocal_onsets(sm):
        info.append('no vocal onsets in the songmap: run "studio analyze" (with --stems for precise onsets) to rank uncertain lines')
    unc = [u for u in uncertainty(lines, sm, lyric_offset) if u[1] in inside_set][:10]
    report = {'lines': len(lines), 'errors': errors, 'warnings': warns, 'info': info,
              'uncertain': [{'line': k + 1, 'start': lines[k]['start'], 'score': s, 'why': why} for s, k, why in unc]}
    if verbose:
        print(f'  {len(lines)} lines, {sum(len(graphemes(l.get("text", ""))) for l in lines)} characters' + (f', font "{fam}"' if font else ''))
        for e in errors:
            print(f'  ERROR {e}')
        for w in warns:
            print(f'  ! {w}')
        for i in info:
            print(f'  · {i}')
        if unc:
            print('  listen to these line starts first (least certain; "lyrics listen" cuts excerpts with a tick):')
            for s, k, why in unc:
                print(f'    line {k + 1:3d} {fmt_t(lines[k]["start"])}  {short(lines[k].get("text", ""), 12):14s} {"; ".join(why)}')
        if not errors and not warns:
            print('  OK')
    qa = P.path('qa')
    os.makedirs(qa, exist_ok=True)
    with open(os.path.join(qa, 'lyrics_check.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    return report


def cmd_check(a):
    r = check(Project(a.project))
    return 1 if r['errors'] else 0


# ─── Snap ────────────────────────────────────────────────────────────────────────────────────

def rescale_chars(cs, a0, b0, a1, b1):
    """Map character times from [a0, b0] onto [a1, b1]."""
    k = (b1 - a1) / max(1e-6, b0 - a0)
    out = []
    for c in cs:
        d = dict(c)
        d['start'], d['end'] = round(a1 + (c['start'] - a0) * k, 3), round(a1 + (c['end'] - a0) * k, 3)
        out.append(d)
    return out


def clamp_chars(cs, start, end):
    """Keep measured character times inside [start, end] and in order."""
    out, t = [], start
    for c in cs:
        d = dict(c)
        d['start'] = round(min(max(d['start'], t), end), 3)
        d['end'] = round(min(max(d['end'], d['start']), end), 3)
        t = d['start']
        out.append(d)
    return out


def snap(P, to='auto', max_vocal=0.15, max_grid=0.06, dry=False, undo=False, verbose=True):
    data = P.lyrics()
    lines = data['lines']
    sm = P.songmap()
    off = float(P.cfg.get('lyricOffset', 0) or 0)
    onsets = vocal_onsets(sm) if to in ('auto', 'vocal') else []
    grid = half_beats(sm) if to in ('auto', 'half') else []
    if not undo and not onsets and not grid:
        raise SystemExit('nothing to snap to: the songmap has no beats or vocal onsets (run "studio analyze")')
    moves = []
    for k, l in enumerate(lines):
        base = l['snap']['from'] if l.get('snap') else l['start']
        if undo:
            new, by = base, None
        else:
            s = base + off
            new, by = base, None
            o = nearest(onsets, s)
            if o is not None and abs(o - s) <= max_vocal:
                new, by = o - off, 'vocal onset'
            else:
                g = nearest(grid, s)
                if g is not None and abs(g - s) <= max_grid:
                    new, by = g - off, 'half beat'
            lo = lines[k - 1]['start'] + 0.1 if k else 0.0
            new = min(max(new, lo), l['end'] - 0.2)
        new = round(new, 3)
        if abs(new - l['start']) < 0.001:
            continue
        moves.append((k, l['start'], new, by))
        if dry:
            continue
        old = l['start']
        l['start'] = new
        if by:
            l['snap'] = {'from': base, 'to': new, 'by': by}
        else:
            l.pop('snap', None)
        cs = l.get('chars') or []
        if cs and all(c.get('est') for c in cs):
            l['chars'] = estimate_chars(l['text'], new, l['end']) if l.get('text') else rescale_chars(cs, old, l['end'], new, l['end'])
        elif cs:
            cs[0]['start'] = new
            l['chars'] = clamp_chars(cs, new, l['end'])
        if k and lines[k - 1]['end'] > new:
            lines[k - 1]['end'] = new
            pc = lines[k - 1].get('chars') or []
            if pc:
                lines[k - 1]['chars'] = clamp_chars(pc, lines[k - 1]['start'], new)
    if verbose:
        if not moves:
            print('  nothing to move')
        for k, a_, b_, by in moves:
            print(f'  line {k + 1:3d} {fmt_t(a_)} → {fmt_t(b_)} ({(b_ - a_) * 1000:+.0f} ms{", " + by if by else ", restored"})  {short(lines[k].get("text", ""), 12)}')
        if moves and dry:
            print('  (dry run: nothing written)')
    if moves and not dry:
        P.save_lyrics(data)
    return moves


def cmd_snap(a):
    snap(Project(a.project), a.to, a.max_vocal, a.max_grid, a.dry_run, a.undo)
    return 0


# ─── Listen ──────────────────────────────────────────────────────────────────────────────────

def cmd_listen(a):
    import numpy as np
    import audio_io as A
    P = Project(a.project)
    audio = a.audio or P.audio()
    if not audio or not os.path.exists(audio):
        raise SystemExit('no song: set "audio" in studio.json or pass --audio')
    data = P.lyrics()
    lines = data['lines']
    off = float(P.cfg.get('lyricOffset', 0) or 0)
    unc = uncertainty(lines, P.songmap(), off)[:a.n]
    out_dir = P.path('qa/listen')
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith('.wav'):
            os.remove(os.path.join(out_dir, f))
    sr = 48000
    tick_n = int(0.012 * sr)
    tick = 0.3 * np.sin(2 * np.pi * 2000 * np.arange(tick_n) / sr) * np.hanning(tick_n)
    md = ['# Listen', '', 'Each file starts 1.5 s before a lyric line and has a short tick where the line starts. ',
          'If the tick is not on the first sung syllable, fix the start in data/lyrics.json (or data/cues.json).', '',
          '| file | line | start | why |', '|---|---|---|---|']
    for rank, (score, k, why) in enumerate(unc, 1):
        s = lines[k]['start'] + off
        a0 = max(0.0, s - 1.5)
        x = A.load(audio, sr=sr, start=a0, duration=3.5)
        p = int(round((s - a0) * sr))
        if p + tick_n <= len(x):
            x[p:p + tick_n] += tick[:, None]
        name = f'{rank:02d}_line{k + 1:03d}_{fmt_t(s).replace(":", "m")}s.wav'
        A.save_wav(os.path.join(out_dir, name), np.clip(x, -1, 1), sr, bits=16)
        md.append(f'| {name} | {k + 1} | {fmt_t(s)} | {"; ".join(why)} |')
    with open(os.path.join(out_dir, 'README.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(md) + '\n')
    print(f'  {len(unc)} excerpts → {os.path.relpath(out_dir)} (README.md lists why each one is uncertain)')
    return 0


# ─── Strip and fill ──────────────────────────────────────────────────────────────────────────

def cmd_strip(a):
    P = Project(a.project)
    data = P.lyrics()
    out = {'version': 1, 'timingOnly': True, 'source': data.get('source', ''), 'lines': []}
    for l in data['lines']:
        t = {'i': l['i'], 'start': l['start'], 'end': l['end'], 'section': l.get('section', ''), 'keyword': l.get('keyword', False)}
        if l.get('text'):
            t['n'] = len(graphemes(l['text']))
            t['key'] = text_key(l['text'])
        if l.get('translation'):
            t['tkey'] = text_key(l['translation'])
        if l.get('endEst'):
            t['endEst'] = True
        if l.get('snap'):
            t['snap'] = l['snap']
        t['chars'] = [{'start': c['start'], 'end': c['end'], 'est': bool(c.get('est'))} for c in l.get('chars') or []]
        out['lines'].append(t)
    write_lyrics(P.timing_path, out)
    print(f'  {len(out["lines"])} lines, times only → {os.path.relpath(P.timing_path)} (safe to publish; keep data/lyrics.json private)')
    return 0


def read_text_lines(path):
    """Lyric lines from a text, LRC, SRT or JSON file, in order."""
    text = open(path, encoding='utf-8-sig', errors='replace').read()
    ext = os.path.splitext(path)[1].lower()
    if ext == '.lrc':
        return [e['text'] for e in parse_lrc(text)[0]]
    if ext in ('.srt', '.vtt'):
        return [e['text'] for e in parse_srt(text)[0]]
    if ext == '.json':
        d = json.loads(text)
        return [str(l.get('text', '')) for l in (d['lines'] if isinstance(d, dict) else d) if l.get('text')]
    # Plain text: one line per lyric line; blank lines, section headers ([Chorus], [副歌]) and
    # # comments are skipped (the same rule as tools/lyric-tapper.html).
    return [s.strip() for s in text.splitlines() if s.strip() and not re.match(r'^(\[[^\]:]*\]|#)', s.strip())]


def align_keys(keys, cand):
    """Edit-distance alignment of timing keys with candidate text keys.
    Returns {timing index: candidate index} for matches and substitutions, plus the substituted set."""
    n, m = len(keys), len(cand)
    D = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        D[i][0] = i
    for j in range(1, m + 1):
        D[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = 0 if keys[i - 1] == cand[j - 1] else 1
            D[i][j] = min(D[i - 1][j - 1] + sub, D[i - 1][j] + 1, D[i][j - 1] + 1)
    pairs, subs = {}, set()
    i, j = n, m
    while i > 0 and j > 0:
        sub = 0 if keys[i - 1] == cand[j - 1] else 1
        if D[i][j] == D[i - 1][j - 1] + sub:
            pairs[i - 1] = j - 1
            if sub:
                subs.add(i - 1)
            i, j = i - 1, j - 1
        elif D[i][j] == D[i - 1][j] + 1:
            i -= 1
        else:
            j -= 1
    return pairs, subs


def cmd_fill(a):
    P = Project(a.project)
    src = a.timing or P.timing_path
    if not os.path.exists(src):
        raise SystemExit(f'no timing file: {src} (make one with "lyrics strip")')
    timing = json.load(open(src, encoding='utf-8'))
    tl = timing['lines']
    texts = read_text_lines(a.file)
    trans = read_text_lines(a.translation) if a.translation else []
    if all(l.get('key') for l in tl):
        pairs, subs = align_keys([l['key'] for l in tl], [text_key(t) for t in texts])
    else:
        pairs, subs = {i: i for i in range(min(len(tl), len(texts)))}, set()
    lines, missing, changed, rechar = [], [], [], []
    for i, t in enumerate(tl):
        text = texts[pairs[i]] if i in pairs else ''
        if i not in pairs:
            missing.append(i)
        elif i in subs:
            changed.append(i)
        line = {'i': i, 'start': t['start'], 'end': t['end'], 'text': text, 'translation': trans[i] if i < len(trans) else '',
                'section': t.get('section', ''), 'keyword': t.get('keyword', False)}
        for k in ('endEst', 'snap'):
            if t.get(k):
                line[k] = t[k]
        tc = t.get('chars') or []
        gs = graphemes(text)
        if text and tc and len(tc) == len(gs) and not all(c.get('est') for c in tc):
            line['chars'] = [{'c': g, 'start': c['start'], 'end': c['end'], 'est': bool(c.get('est'))} for g, c in zip(gs, tc)]
        else:
            if text and tc and not all(c.get('est') for c in tc):
                rechar.append(i)
            line['chars'] = estimate_chars(text, t['start'], t['end']) if text else []
        lines.append(line)
    used = set(pairs.values())
    unused = [j for j in range(len(texts)) if j not in used]
    data = {'version': 1, 'source': timing.get('source', ''), 'lines': lines}
    if os.path.exists(P.lyrics_path):
        os.replace(P.lyrics_path, P.lyrics_path + '.bak')
    P.save_lyrics(data)
    print(f'  filled {len(tl) - len(missing)} of {len(tl)} lines → {os.path.relpath(P.lyrics_path)}')
    for i in missing:
        print(f'  ERROR line {i + 1} {fmt_t(tl[i]["start"])}: no text matched (it will render empty)')
    for i in sorted(set(changed)):
        print(f'  ! line {i + 1} {fmt_t(tl[i]["start"])}: the text differs from the one this timing was made for — check it ("{short(lines[i]["text"])}")')
    for i in rechar:
        print(f'  ! line {i + 1} {fmt_t(tl[i]["start"])}: measured per-character times do not fit this text ({len(tl[i]["chars"])} times, {len(graphemes(lines[i]["text"]))} characters); estimated again')
    for j in unused:
        print(f'  ! not used: "{short(texts[j], 20)}" (a heading, or a line the timing does not have?)')
    if trans and len(trans) != len(tl):
        print(f'  ! {len(trans)} translation lines for {len(tl)} lines: filled in order, check the end')
    return 1 if missing else 0


# ─── Export ──────────────────────────────────────────────────────────────────────────────────

def ts(t, sep=','):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{sep}{ms % 1000:03d}'


def cmd_export(a):
    P = Project(a.project)
    data = P.lyrics()
    lines = [l for l in data['lines'] if l.get('text')]
    if not lines:
        raise SystemExit('no text to export (timing only? run "lyrics fill")')
    shift = float(P.cfg.get('offset', 0) or 0) + float(P.cfg.get('lyricOffset', 0) or 0) - a.lead
    fmt = a.format
    out = a.out or P.path(f'out/{P.name}.{fmt}')
    rows = []
    with_tr = not a.no_translation
    if fmt in ('srt', 'vtt'):
        if fmt == 'vtt':
            rows.append('WEBVTT\n')
        for n, l in enumerate(lines, 1):
            body = l['text'] + (f'\n{l["translation"]}' if with_tr and l.get('translation') else '')
            sep = ',' if fmt == 'srt' else '.'
            if fmt == 'srt':
                rows.append(str(n))
            rows.append(f'{ts(l["start"] + shift, sep)} --> {ts(l["end"] + shift, sep)}')
            rows.append(body + '\n')
    else:
        lrc = lambda t: f'{int(max(0, t) // 60):02d}:{max(0, t) % 60:05.2f}'
        for k, l in enumerate(lines):
            s = l['start'] + shift
            cs = l.get('chars') or []
            if a.words and cs and not all(c.get('est') for c in cs):
                body = ''.join(f'<{lrc(c["start"] + shift)}>{c["c"]}' for c in cs) + f'<{lrc(cs[-1]["end"] + shift)}>'
            else:
                body = l['text']
            rows.append(f'[{lrc(s)}]{body}')
            nxt = lines[k + 1]['start'] + shift if k + 1 < len(lines) else None
            if nxt is None or nxt - (l['end'] + shift) > 0.5:
                rows.append(f'[{lrc(l["end"] + shift)}]')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(rows).rstrip('\n') + '\n')
    print(f'  {len(lines)} lines → {os.path.relpath(out, P.root).replace(os.sep, "/")}' + (f' (shifted {shift:+.3f} s to video time)' if shift else ''))
    return 0


# ─── Repository check ────────────────────────────────────────────────────────────────────────

def shingles(text):
    """4-character runs of CJK text and 4-word runs of other text, normalised."""
    out = set()
    for line in str(text).splitlines() or [str(text)]:
        s = normalize(line)
        cjk = ''.join(c if is_cjk(ord(c)) else ' ' for c in s).split()
        for run in cjk:
            out.update(run[i:i + 4] for i in range(len(run) - 3))
        words = re.findall(r"[a-z0-9']+", ''.join(' ' if is_cjk(ord(c)) else c for c in unicodedata.normalize('NFKC', line).lower()))
        out.update(' '.join(words[i:i + 4]) for i in range(len(words) - 3))
    return out


def repo_files(root):
    """Files that would be published: git's view when this is a repository, else a walk that
    honours the simple patterns of .gitignore."""
    try:
        p = subprocess.run(['git', '-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], capture_output=True)
        if p.returncode == 0:
            return [f for f in p.stdout.decode('utf-8', 'replace').split('\0') if f]
    except OSError:
        pass
    pats = []
    gi = os.path.join(root, '.gitignore')
    if os.path.exists(gi):
        for s in open(gi, encoding='utf-8', errors='replace').read().splitlines():
            s = s.strip()
            if s and not s.startswith('#') and not s.startswith('!'):
                pats.append(s)

    def ignored(rel, is_dir):
        parts = rel.split('/')
        for pat in pats:
            dir_only = pat.endswith('/')
            p = pat.rstrip('/').lstrip('/')
            if dir_only and not is_dir:
                continue
            p2 = p[3:] if p.startswith('**/') else p
            if '/' in p2 and not p.startswith('**/'):
                if fnmatch.fnmatch(rel, p2):
                    return True
            elif any(fnmatch.fnmatch(x, p2) for x in parts[-1:]) or (p.startswith('**/') and fnmatch.fnmatch(rel, '*' + p2)):
                return True
        return False

    out = []
    for d, dirs, files in os.walk(root):
        rd = os.path.relpath(d, root).replace('\\', '/')
        rd = '' if rd == '.' else rd + '/'
        dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules') and not ignored(rd + x, True)]
        out += [rd + f for f in files if not ignored(rd + f, False)]
    return out


def cmd_check_repo(a):
    root = os.path.abspath(a.root)
    sources, own = list(a.lyrics or []), []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules')]
        if os.path.basename(d) == 'data' and 'lyrics.json' in files:
            p = os.path.join(d, 'lyrics.json')
            try:
                publishable = json.load(open(p, encoding='utf-8')).get('publishable')
            except (ValueError, OSError):
                publishable = False
            (own if publishable else sources).append(p)
    grams = set()
    for s in sources:
        for t in read_text_lines(s):
            grams |= shingles(t)
        if s.endswith('.json'):
            d = json.load(open(s, encoding='utf-8'))
            for l in d.get('lines', []):
                grams |= shingles(l.get('translation', '') or '')
    allow = a.allow or []
    errors, notes = [], []
    for rel in repo_files(root):
        if any(fnmatch.fnmatch(rel, g) for g in allow):
            continue
        ext = os.path.splitext(rel)[1].lower()
        full = os.path.join(root, rel)
        if ext in AUDIO_EXT:
            errors.append(f'{rel}: audio file (publish only audio you own; allow it with --allow "{rel}")')
            continue
        if ext in VIDEO_EXT:
            notes.append(f'{rel}: video file — make sure its soundtrack may be published')
            continue
        if not grams:
            continue
        try:
            if os.path.getsize(full) > 5_000_000:
                continue
            raw = open(full, 'rb').read()
        except OSError:
            continue
        if b'\0' in raw[:4096]:
            continue
        text = raw.decode('utf-8', 'replace')
        for n, line in enumerate(text.splitlines(), 1):
            hit = shingles(line) & grams
            if hit:
                frag = sorted(hit, key=len)[-1]
                errors.append(f'{rel}:{n}: contains a lyric fragment ("{frag[:2]}…", {len(hit)} matching runs)')
                break
    for e in errors:
        print(f'  ERROR {e}')
    for n in notes:
        print(f'  · {n}')
    print(f'  checked against {len(sources)} lyric file(s), {len(grams)} fragments' if sources else '  no lyric files found (pass --lyrics FILE to check against your lyrics)')
    if own:
        print(f'  skipped {len(own)} lyric file(s) marked "publishable": true (text you own): ' + ', '.join(os.path.relpath(p, root).replace(os.sep, '/') for p in own))
    if not errors:
        print('  OK: no lyric fragments and no audio in the files that would be published')
    else:
        print('  Keep these files out of what you publish (.gitignore), or, for lyrics you hold the rights to,\n'
              '  add "publishable": true to that lyrics.json.')
    return 1 if errors else 0


# ─── CLI ─────────────────────────────────────────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description='Lyric timing for music videos.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('import', help='LRC / enhanced LRC / SRT / JSON → data/lyrics.json')
    p.add_argument('project')
    p.add_argument('file')
    p.add_argument('--dupes', choices=['drop', 'translation'], default='drop', help='a second line with the same timestamp')
    p.add_argument('--two-line', choices=['join', 'translation'], default='join', help='SRT blocks with two text lines')
    p.add_argument('--offset', type=float, default=0.0, help='add this many seconds to every time')
    p.add_argument('--force', action='store_true', help='overwrite without keeping a .bak')
    p = sub.add_parser('check')
    p.add_argument('project')
    p = sub.add_parser('snap')
    p.add_argument('project')
    p.add_argument('--to', choices=['auto', 'vocal', 'half'], default='auto')
    p.add_argument('--max-vocal', type=float, default=0.15)
    p.add_argument('--max-grid', type=float, default=0.06)
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--undo', action='store_true', help='restore every snapped start')
    p = sub.add_parser('listen')
    p.add_argument('project')
    p.add_argument('-n', type=int, default=10)
    p.add_argument('--audio')
    p = sub.add_parser('strip')
    p.add_argument('project')
    p = sub.add_parser('fill')
    p.add_argument('project')
    p.add_argument('file')
    p.add_argument('--translation')
    p.add_argument('--timing', help='timing file (default data/lyrics.timing.json)')
    for name in ('export', 'srt'):
        p = sub.add_parser(name)
        p.add_argument('project')
        p.add_argument('--format', choices=['srt', 'vtt', 'lrc'], default='srt')
        p.add_argument('--out')
        p.add_argument('--lead', type=float, default=0.0, help='show subtitles this many seconds early')
        p.add_argument('--no-translation', action='store_true')
        p.add_argument('--words', action='store_true', help='LRC: per-character stamps where they were measured')
    p = sub.add_parser('check-repo')
    p.add_argument('root')
    p.add_argument('--lyrics', action='append', help='a lyrics file to check against (text, LRC, SRT, JSON)')
    p.add_argument('--allow', action='append', help='glob of files allowed anyway (e.g. examples/*/audio.wav you own)')
    a = ap.parse_args(argv)
    run = {'import': cmd_import, 'check': cmd_check, 'snap': cmd_snap, 'listen': cmd_listen, 'strip': cmd_strip,
           'fill': cmd_fill, 'export': cmd_export, 'srt': cmd_export, 'check-repo': cmd_check_repo}[a.cmd]
    return run(a)


if __name__ == '__main__':
    sys.exit(main())
