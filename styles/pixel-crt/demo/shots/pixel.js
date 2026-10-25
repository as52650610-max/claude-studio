// 像素 CRT · Pixel CRT. Pixel art on a 320 × 180 screen: every pixel one of 16 colours, every
// coordinate a whole pixel, the picture changing twelve times a second. Then it is shown on a
// television: blown up six times, with scanlines, the glow of the glass, a curved tube and the tube's
// own way of switching on and off. The demo switches the set on and lists its specs in bar 1, loads
// the song on the eighths of bar 2, cuts through static to a rooftop at night where the title types
// itself out in bar 3, tears once on the backbeat of bar 4 and switches off on its last beat.
import { ease, hash, lerp, rng, span, vignette } from '../engine/studio.js';

export const PALETTE = {
  ink: '#090C18', night: '#121A33', deep: '#1D2B52', dusk: '#2E4580', steel: '#4D74AD', frost: '#93B8E6', white: '#EEF4FF',
  plum: '#5B3388', violet: '#A54BD6', neon: '#FF4F86', rust: '#7E3346', ember: '#F2733D', amber: '#FFB547', lamp: '#FFE6A1',
  cyan: '#36E2CD', moss: '#3E9E6E',
};
export const LW = 320, LH = 180; // the logical screen
const C = PALETTE, FAMILY = 'Noto Sans TC';
const FPS = 12; // the picture changes on twelves; the tube itself (switching on and off) runs at the film's rate
const step = t => Math.floor(t * FPS + 1e-6);

const canvas = (w, h, opts) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', opts);
  g.imageSmoothingEnabled = false;
  return [c, g];
};
const RGB = new Map();
const rgb = hex => RGB.get(hex) ?? (RGB.set(hex, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))), RGB.get(hex));

// ─── Type ────────────────────────────────────────────────────────────────────────────────────────

// A 5 × 7 font: capitals, digits and a little punctuation, rows top to bottom, '#' lit.
const GLYPHS = {
  A: '.###. #...# #...# #...# ##### #...# #...#', B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.', D: '###.. #..#. #...# #...# #...# #..#. ###..',
  E: '##### #.... #.... ####. #.... #.... #####', F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####', H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.', J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#', L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#', N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.', P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#', R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.', V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# #...# .#.#. ..#.. ..#.. ..#..', Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.', 1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####', 3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.', 5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.', 7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.', 9: '.###. #...# #...# .#### ....# ...#. .##..',
  '.': '..... ..... ..... ..... ..... .##.. .##..', ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##', '/': '..... ....# ...#. ..#.. .#... #.... .....',
  '-': '..... ..... ..... ##### ..... ..... .....', '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '▶': '#.... ##... ###.. ####. ###.. ##... #....', '█': '##### ##### ##### ##### ##### ##### #####',
};
const FONT = new Map(Object.entries(GLYPHS).map(([ch, rows]) => [ch, rows.split(' ')]));

/** Latin text in the 5 × 7 font, top left at whole pixel (x, y). Returns its width. */
export function bitmapText(g, text, x, y, colour, { scale = 1, spacing = 1 } = {}) {
  g.fillStyle = colour;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    FONT.get(ch)?.forEach((row, r) => {
      for (let c = 0; c < 5; c++) if (row[c] === '#') g.fillRect(cx + c * scale, y + r * scale, scale, scale);
    });
    cx += (5 + spacing) * scale;
  }
  return cx - x - spacing * scale;
}
export const bitmapWidth = (text, { scale = 1, spacing = 1 } = {}) => Math.max(0, [...text].length * (5 + spacing) - spacing) * scale;

/**
 * Text as pixels, for Chinese: drawn once with the project font at `size` px and cut at half
 * coverage (`cut`), so every pixel is lit or not, never in between. Below 18 px most characters
 * close up. Returns a mask for stamp(): { w, h, base, mask, ink: { x, y, w, h } }, the pen at (1, base).
 */
export function pixelText(text, { size = 18, weight = 700, family = FAMILY, cut = 0.5 } = {}) {
  const font = `${weight} ${size}px "${family}"`;
  const [, probe] = canvas(1, 1);
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 2, h = Math.ceil(size * 1.3) + 2, base = Math.round(size * 1.05);
  // a CPU canvas: the same coverage in every browser that renders the film
  const [mask, g] = canvas(w, h, { willReadFrequently: true });
  g.font = font;
  g.fillStyle = '#fff';
  g.fillText(text, 1, base);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    const on = d[4 * i + 3] >= 255 * cut;
    d.fill(on ? 255 : 0, 4 * i, 4 * i + 4);
    if (on) {
      const x = i % w, y = (i / w) | 0;
      x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
    }
  }
  g.putImageData(img, 0, 0);
  return { w, h, base, mask, ink: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, tints: new Map() };
}

/** The mask grown by one pixel all round: stamp it first, one pixel up and left, for an outline. */
export function outline(m) {
  const [mask, g] = canvas(m.w + 2, m.h + 2);
  for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) g.drawImage(m.mask, dx, dy);
  return { w: m.w + 2, h: m.h + 2, base: m.base + 1, mask, ink: { ...m.ink, w: m.ink.w + 2, h: m.ink.h + 2 }, tints: new Map() };
}

/** Draw a mask in one palette colour at whole pixel (x, y). */
export function stamp(g, m, x, y, colour) {
  let tint = m.tints.get(colour);
  if (!tint) {
    const [c, tg] = canvas(m.mask.width, m.mask.height);
    tg.drawImage(m.mask, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = colour;
    tg.fillRect(0, 0, c.width, c.height);
    m.tints.set(colour, (tint = c));
  }
  g.drawImage(tint, Math.round(x), Math.round(y));
}

// ─── Pixels ──────────────────────────────────────────────────────────────────────────────────────

/** A sprite from rows of characters, each a key of `key` (anything else is clear). */
export function sprite(rows, key) {
  const [c, g] = canvas(Math.max(...rows.map(r => r.length)), rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!key[ch]) return;
      g.fillStyle = key[ch];
      g.fillRect(x, y, 1, 1);
    }));
  return c;
}

/** Rim light: `body` pixels facing the light (right, and up on the right half) become `rim`. */
export function rimLight(rows, body = 'K', rim = 'R') {
  const at = (x, y) => rows[y]?.[x] ?? '.', mid = rows[0].length / 2;
  return rows.map((row, y) => [...row].map((ch, x) => (ch === body && (at(x + 1, y) === '.' || (x >= mid && at(x, y - 1) === '.')) ? rim : ch)).join(''));
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dithering along a ramp of colours: position p (0 … length − 1) at pixel (x, y). */
export function ramp(colours, p, x, y) {
  const i = Math.floor(p), up = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < p - i;
  return colours[Math.min(colours.length - 1, i + (up ? 1 : 0))];
}

/** A pixel surface: set(x, y, colour), then done() writes it into its canvas. */
function surface(w, h) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const set = (x, y, colour) => {
    if (!colour || x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, gg, b] = rgb(colour), i = 4 * (y * w + x);
    img.data[i] = r;
    img.data[i + 1] = gg;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  const rect = (x, y, rw, rh, colour) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, colour);
  };
  return { c, set, rect, done: () => (g.putImageData(img, 0, 0), c) };
}

/**
 * Signal trouble, in whole pixels and palette colours only: the picture rolls up, bands of lines
 * slip sideways and a few lines flare. `strength` 0–1; `buf` a spare canvas of the same size.
 */
export function tear(g, strength, seed, buf) {
  const bg = buf.getContext('2d'), W = buf.width, H = buf.height;
  bg.drawImage(g.canvas, 0, 0);
  g.fillStyle = C.ink;
  g.fillRect(0, 0, W, H);
  const roll = Math.round(strength * strength * H * 0.35 * (0.5 + 0.5 * hash(seed, 'roll')));
  for (let y = 0, band = 0; y < H; band++) {
    const h = Math.min(H - y, 2 + Math.floor(hash(seed, band, 'h') * 12)), sy = (y + roll) % H, h1 = Math.min(h, H - sy);
    const dx = hash(seed, band, 'on') < 0.6 * strength ? Math.round((2 * hash(seed, band, 'dx') - 1) * 0.18 * W * strength) : 0;
    for (const ox of [dx - W, dx, dx + W]) {
      g.drawImage(buf, 0, sy, W, h1, ox, y, W, h1);
      if (h1 < h) g.drawImage(buf, 0, 0, W, h - h1, ox, y + h1, W, h - h1);
    }
    y += h;
  }
  if (roll) {
    g.fillStyle = C.ink; // the blanking interval, rolling through
    g.fillRect(0, H - roll, W, 3);
  }
  for (let i = 0; i < Math.round(8 * strength); i++) {
    g.fillStyle = [C.white, C.frost, C.cyan][Math.floor(3 * hash(seed, i, 'fc'))];
    g.fillRect(Math.floor(hash(seed, i, 'fx') * W * 0.7), Math.floor(hash(seed, i, 'fy') * H), 16 + Math.floor(hash(seed, i, 'fw') * W * 0.4), 1);
  }
}

/** Static between channels: every pixel a random grey of the palette, darker ones likelier. */
export function snow(g, seed) {
  const W = g.canvas.width, H = g.canvas.height, img = g.createImageData(W, H), r = rng(seed);
  const greys = [C.ink, C.night, C.deep, C.dusk, C.steel, C.frost, C.white].map(rgb);
  for (let i = 0; i < W * H; i++) {
    const [cr, cg, cb] = greys[Math.floor(r() ** 1.7 * greys.length)];
    img.data.set([cr, cg, cb, 255], 4 * i);
  }
  g.putImageData(img, 0, 0);
}

// ─── The television ──────────────────────────────────────────────────────────────────────────────

/**
 * A television for a small canvas. show(ctx, px, opts) blows `px` up by the largest whole factor
 * that fits, shades each line of pixels like a scanline, adds the glow of the glass, bends the
 * picture like a curved tube and draws it into ctx (W × H film units). opts: `sx`, `sy` squeeze the
 * picture about the centre and `flash` (0–1) burns it white, for switching on and off; `spot`
 * (0–1) is the last point of light after the picture has gone.
 */
export function television(W, H, { lw = LW, lh = LH, scan = 0.5, glow = 0.35, bend = 0.035 } = {}) {
  const k = Math.floor(Math.min(W / lw, H / lh)), ox = Math.round((W - lw * k) / 2), oy = Math.round((H - lh * k) / 2);
  const [flat, fg] = canvas(W, H), [tube, tg] = canvas(W, H), [rows, rg] = canvas(W, H), [cols, cg] = canvas(W, H);
  const [halo, hg] = canvas(Math.ceil(lw * 1.5), Math.ceil(lh * 1.5));
  // a line of pixels is k rows of the tube: bright in the middle, dark where two lines meet
  const [line, lg] = canvas(1, k);
  for (let y = 0; y < k; y++) {
    const v = Math.round(255 * (1 - scan * (1 - Math.sin((Math.PI * (y + 0.5)) / k)) ** 2));
    lg.fillStyle = `rgb(${v} ${v} ${v})`;
    lg.fillRect(0, y, 1, 1);
  }
  const lines = fg.createPattern(line, 'repeat');
  lines.setTransform(new DOMMatrix().translate(0, oy));
  for (const g of [rg, cg]) g.imageSmoothingEnabled = true;
  hg.imageSmoothingEnabled = true;

  return {
    k,
    show(ctx, px, { sx = 1, sy = 1, flash = 0, spot = null } = {}) {
      // 1. the picture in whole pixels, scanlines over it, the glow of the glass over both
      fg.globalCompositeOperation = 'source-over';
      fg.globalAlpha = 1;
      fg.fillStyle = '#000';
      fg.fillRect(0, 0, W, H);
      fg.drawImage(px, ox, oy, lw * k, lh * k);
      fg.globalCompositeOperation = 'multiply';
      fg.fillStyle = lines;
      fg.fillRect(0, 0, W, H);
      hg.filter = 'blur(2px)';
      hg.clearRect(0, 0, halo.width, halo.height);
      hg.drawImage(px, 0, 0, halo.width, halo.height);
      fg.globalCompositeOperation = 'screen';
      fg.globalAlpha = glow;
      fg.imageSmoothingEnabled = true;
      fg.drawImage(halo, ox, oy, lw * k, lh * k);
      fg.imageSmoothingEnabled = false;
      fg.globalAlpha = 1;
      fg.globalCompositeOperation = 'source-over';
      // 2. switching on and off: the beam squeezes the picture and burns it white
      let src = flat;
      if (sx !== 1 || sy !== 1 || flash || spot !== null) {
        tg.fillStyle = '#000';
        tg.fillRect(0, 0, W, H);
        const w = W * sx, h = H * sy;
        if (spot === null) {
          tg.imageSmoothingEnabled = true;
          tg.drawImage(flat, (W - w) / 2, (H - h) / 2, w, h);
          tg.globalAlpha = flash;
          tg.fillStyle = C.white;
          tg.fillRect((W - w) / 2, (H - h) / 2, w, h);
          tg.globalAlpha = 1;
        }
        src = tube;
      }
      // 3. curved glass: each row a little narrower towards the top and bottom, then each column a
      // little shorter towards the sides
      rg.fillStyle = '#000';
      rg.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y++) {
        const v = (2 * (y + 0.5)) / H - 1, w = W * (1 - bend * v * v);
        rg.drawImage(src, 0, y, W, 1, (W - w) / 2, y, w, 1);
      }
      cg.fillStyle = '#000';
      cg.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x++) {
        const u = (2 * (x + 0.5)) / W - 1, h = H * (1 - 1.4 * bend * u * u);
        cg.drawImage(rows, x, 0, 1, H, x, (H - h) / 2, 1, h);
      }
      ctx.drawImage(cols, 0, 0, W, H);
      // 4. the glass itself: a glow around a burning line or spot, darker edges, a reflection
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (flash && spot === null) {
        const h = Math.max(H * sy, 8), w = W * sx, g = ctx.createLinearGradient(0, H / 2 - h / 2 - 40, 0, H / 2 + h / 2 + 40);
        g.addColorStop(0, 'rgb(147 184 230 / 0)');
        g.addColorStop(0.5, `rgb(147 184 230 / ${0.5 * flash})`);
        g.addColorStop(1, 'rgb(147 184 230 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect((W - w) / 2 - 20, H / 2 - h / 2 - 40, w + 40, h + 80);
      }
      if (spot !== null) {
        const r = lerp(30, 12, spot), g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
        g.addColorStop(0, `rgb(238 244 255 / ${1 - spot})`);
        g.addColorStop(0.35, `rgb(147 184 230 / ${0.6 * (1 - spot)})`);
        g.addColorStop(1, 'rgb(147 184 230 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(W / 2 - r, H / 2 - r, 2 * r, 2 * r);
      }
      ctx.restore();
      vignette(ctx, { amount: 0.5, inner: 0.55, width: W, height: H });
      const shine = ctx.createRadialGradient(W * 0.28, H * 0.18, 0, W * 0.28, H * 0.18, W * 0.42);
      shine.addColorStop(0, 'rgb(255 255 255 / 0.05)');
      shine.addColorStop(1, 'rgb(255 255 255 / 0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

// ─── The demo ────────────────────────────────────────────────────────────────────────────────────

// A cat on the parapet seen from behind, headphones on, looking at the city. 'K' body, 'C' and 'W'
// the headphones; rimLight() adds the moonlight down its right side.
const CAT = rimLight([
  '.....K..........K.....',
  '.....KK........KK.....',
  '.....KKK......KKK.....',
  '.....KKKKCCCCKKKK.....',
  '....KKKCCKKKKCCKKK....',
  '...KKCCKKKKKKKKCCKK...',
  '.CCCCKKKKKKKKKKKKCCCW.',
  '.CCCKKKKKKKKKKKKKKCCC.',
  '.CCCKKKKKKKKKKKKKKCCC.',
  '.CCCKKKKKKKKKKKKKKCCC.',
  '..CKKKKKKKKKKKKKKKKC..',
  '....KKKKKKKKKKKKKK....',
  '.....KKKKKKKKKKKK.....',
  '.....KKKKKKKKKKKK.....',
  '....KKKKKKKKKKKKKK....',
  '....KKKKKKKKKKKKKK....',
  '...KKKKKKKKKKKKKKKK...',
  '...KKKKKKKKKKKKKKKK...',
  '..KKKKKKKKKKKKKKKKKK..',
  '..KKKKKKKKKKKKKKKKKK..',
  '.KKKKKKKKKKKKKKKKKKKK.',
  '.KKKKKKKKKKKKKKKKKKKK.',
  'KKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKK',
  '.KKKKKKKKKKKKKKKKKKKK.',
]);
const HEAD = 12; // rows of the cat that nod
// the tail curled round its right side, the tip flicking: three drawings, played to the eighths
const TAIL = [
  ['.........K', '........KK', '........K.', '.......KK.', '.......K..', '......KK..', '....KKK...', 'KKKKK.....', 'KKK.......'],
  ['..........', '..........', '..........', '........KK', '.......KK.', '......KK..', '....KKK...', 'KKKKK.....', 'KKK.......'],
  ['..........', '..........', '..........', '..........', '..........', '........KK', '......KKK.', 'KKKKKKK...', 'KKK.......'],
].map(r => rimLight(r));
const NOTE = ['...#..', '...##.', '...#.#', '...#..', '.###..', '####..', '.##...'];

/** The demo: boot screen, loading bar, the rooftop at night, the title, a tear and switching off. */
export function pixelCrt({ song, width: W, height: H, film }) {
  const T = (...a) => song.T(...a);
  const at = {
    on: T(1, 1), specs: [T(1, 2), T(1, 3), T(1, 4)],
    load: Array.from({ length: 8 }, (_, i) => T(2, 1 + (i >> 1), i & 1 ? 3 : 1)), // the eighths of bar 2
    cut: T(3, 1), title: [T(3, 1), T(3, 2), T(3, 3), T(3, 4)],
    sub: T(4, 1), tear: T(4, 2), off: T(4, 4),
  };
  const raw = film.params.get('crt') === '0'; // ?crt=0: the bare pixels, six times, for checking
  const tv = television(W, H);
  const [px, g] = canvas(LW, LH), [buf] = canvas(LW, LH);
  const key = { K: C.ink, R: C.frost, C: C.cyan, W: C.white };
  const cat = sprite(CAT, key), tails = TAIL.map(r => sprite(r, key));
  const [head] = canvas(cat.width, HEAD);
  head.getContext('2d').drawImage(cat, 0, 0);
  const note = colour => sprite(NOTE, { '#': colour });
  const notes = { on: note(C.neon), off: note(C.rust) };
  const loading = pixelText('正在載入歌曲', { size: 18, weight: 400 }); // heavier than 500 closes up at 18 px
  const title = [...'像素之夜'].map(ch => pixelText(ch, { size: 34, weight: 700 })); // 900 closes up even at 34 px
  const titleLine = title.map(outline);

  // ── the set, drawn once ──
  const world = surface(LW, LH), r = rng('night');
  const SKY = [C.night, C.deep, C.dusk, C.plum];
  const skyAt = y => (y < 24 ? 0 : y < 66 ? (y - 24) / 42 : y < 98 ? 1 + (y - 66) / 32 : y < 124 ? 2 + (y - 98) / 26 : 3);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) world.set(x, y, ramp(SKY, skyAt(y), x, y));
  // the moon, its craters and a dithered halo
  const MOON = [262, 40], MR = 13;
  for (let y = -MR - 10; y <= MR + 10; y++)
    for (let x = -MR - 10; x <= MR + 10; x++) {
      const d2 = x * x + y * y, X = MOON[0] + x, Y = MOON[1] + y, b = (BAYER[(Y & 3) * 4 + (X & 3)] + 0.5) / 16;
      if (d2 <= MR * MR + MR) {
        const crater = [[-5, -3, 3], [3, 4, 4], [5, -6, 2], [-3, 7, 2]].some(([cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 <= cr * cr);
        world.set(X, Y, crater || (x < 0 && d2 > (MR - 2) ** 2) ? C.frost : C.white);
      } else if (d2 <= (MR + 4) ** 2) world.set(X, Y, b < 0.5 ? C.steel : null);
      else if (d2 <= (MR + 9) ** 2 && b < 0.25) world.set(X, Y, C.dusk);
    }
  // far city: low blocks against the glow, a few windows lit
  const windows = [];
  for (let x = -2; x < LW + 2; ) {
    const w = r.int(8, 18), top = r.int(106, 122);
    world.rect(x, top, w, LH - top, C.deep);
    for (let y = top; y < LH; y++) world.set(x + w - 1, y, C.dusk);
    if (r() < 0.3) world.rect(x + r.int(2, Math.max(2, w - 5)), top - 3, 3, 3, C.deep); // a tank on the roof
    for (let wy = top + 3; wy < 152; wy += 3) for (let wx = x + 2; wx < x + w - 2; wx += 3) windows.push({ x: wx, y: wy, w: 1, h: 1, far: true });
    x += w + r.int(0, 2);
  }
  // near city: hand-placed for the composition (low on the left under the title, the tower right of
  // centre under the moon)
  const NEAR = [[-4, 30, 136], [26, 22, 128], [48, 34, 150], [82, 26, 124], [108, 36, 132], [144, 24, 118], [168, 26, 128], [196, 28, 98], [224, 30, 124], [254, 24, 134], [278, 46, 120]];
  for (const [x, w, top] of NEAR) {
    world.rect(x, top, w, LH - top, C.night);
    world.rect(x, top, w, 1, C.dusk);
    for (let y = top; y < LH; y++) world.set(x + w - 1, y, C.dusk);
    for (let wy = top + 4; wy < 154; wy += 6)
      for (let wx = x + 3; wx < x + w - 4; wx += 5) {
        world.rect(wx, wy, 2, 3, C.deep);
        windows.push({ x: wx, y: wy, w: 2, h: 3, far: false });
      }
  }
  const ANTENNA = [209, 84];
  world.rect(ANTENNA[0], ANTENNA[1], 2, 98 - ANTENNA[1], C.night);
  world.rect(ANTENNA[0] - 3, 90, 8, 1, C.night);
  const SIGN = [182, 108]; // the neon sign hangs off the tower's left side
  world.rect(SIGN[0] + 9, SIGN[1] + 4, 5, 1, C.ink);
  world.rect(SIGN[0] + 9, SIGN[1] + 26, 5, 1, C.ink);
  // the parapet in front: a lit coping, then the dark wall with its courses of bricks
  world.rect(0, 156, LW, 1, C.dusk);
  world.rect(0, 157, LW, 3, C.deep);
  world.rect(0, 160, LW, LH - 160, C.night);
  for (let y = 165; y < LH; y += 5) world.rect(0, y, LW, 1, C.ink);
  for (let y = 160, row = 0; y < LH; y += 5, row++) for (let x = (row % 2) * 6; x < LW; x += 12) world.rect(x, y, 1, 5, C.ink);
  // a pot plant, and a TV aerial at the right
  world.rect(26, 148, 10, 1, C.ember);
  world.rect(27, 149, 8, 7, C.ember);
  world.rect(27, 149, 2, 7, C.rust);
  for (const [lx, ly, len, dir] of [[31, 147, 9, 0], [30, 146, 7, -1], [33, 146, 8, 1], [29, 147, 5, -1], [34, 147, 6, 1]])
    for (let i = 0; i < len; i++) world.set(lx + Math.round(dir * i * 0.45), ly - i, i === len - 1 ? C.frost : C.moss);
  world.rect(300, 100, 1, 56, C.ink);
  for (const [y, w] of [[102, 17], [108, 15], [114, 13], [120, 11]]) world.rect(300 - (w >> 1), y, w, 1, C.ink);
  // stars, not on the moon, the tower or its antenna
  const stars = [];
  while (stars.length < 64) {
    const x = r.int(2, LW - 3), y = r.int(2, 96);
    if (Math.hypot(x - MOON[0], y - MOON[1]) < MR + 12 || (x > 192 && x < 228 && y > 78)) continue;
    stars.push({ x, y, level: r() < 0.06 ? 2 : r() < 0.3 ? 1 : 0 });
  }
  const set = world.done();

  // ── each frame ──
  const beatAt = t => Math.floor(song.beatAt(t) + 1e-6);
  const sinceBeat = t => step(t - song.timeOfBeat(beatAt(t))); // print-frames since the last beat
  const typed = (text, t0, t, perFrame) => (t < t0 ? '' : text.slice(0, perFrame * (step(t - t0) + 1)));

  function boot(t) {
    g.fillStyle = C.ink;
    g.fillRect(0, 0, LW, LH);
    bitmapText(g, 'PIXEL NIGHT BIOS 1.0', 12, 12, C.cyan);
    g.fillStyle = C.deep;
    g.fillRect(12, 23, 296, 1);
    // the specs, a line a beat, six characters a print-frame
    const specs = [['VIDEO', '320X180  16 COLOURS'], ['AUDIO', '120 BPM  4/4'], ['MEMORY', 'OK']];
    let cursor = [12, 32];
    specs.forEach(([name, value], i) => {
      const text = typed(name.padEnd(8, ' ') + value, at.specs[i], t, 6);
      if (!text) return;
      bitmapText(g, text.slice(0, 8), 12, 32 + 10 * i, C.steel);
      const w = bitmapText(g, text.slice(8), 60, 32 + 10 * i, C.white);
      cursor = text.length > 8 ? [60 + w + 2, 32 + 10 * i] : [12 + bitmapWidth(text) + 2, 32 + 10 * i];
    });
    if (t < at.load[0]) {
      if (sinceBeat(t) < 3) bitmapText(g, '█', ...cursor, C.white);
      return;
    }
    // the loading screen: a segment on every eighth, a dot more on every beat
    stamp(g, loading, Math.round((LW - loading.ink.w) / 2) - loading.ink.x, 74 - loading.ink.y, C.white);
    const n = at.load.filter(x => t >= x).length, done = n === 8;
    const label = done ? 'READY ▶' : 'LOADING SONG' + '.'.repeat((beatAt(t) - beatAt(at.load[0])) % 4);
    bitmapText(g, label, Math.round((LW - bitmapWidth(done ? label : 'LOADING SONG...')) / 2), 100, done ? C.cyan : C.amber);
    g.fillStyle = C.steel;
    for (const [x, y, w, h] of [[62, 112, 196, 1], [62, 125, 196, 1], [62, 112, 1, 14], [257, 112, 1, 14]]) g.fillRect(x, y, w, h);
    const flash = done && step(t - at.load[7]) === 0;
    for (let i = 0; i < n; i++) {
      g.fillStyle = flash ? C.white : C.amber;
      g.fillRect(65 + 24 * i, 115, 22, 8);
      g.fillStyle = flash ? C.white : C.lamp; // the top edge of a lit segment catches the light
      g.fillRect(65 + 24 * i, 115, 22, 1);
    }
    const pct = `${Math.round((100 * n) / 8)}%`;
    bitmapText(g, pct, 258 - bitmapWidth(pct), 130, C.white);
  }

  function scene(t) {
    const f = step(t), beat = beatAt(t), fb = sinceBeat(t);
    g.drawImage(set, 0, 0);
    // stars: a few flare on every beat
    for (const [i, s] of stars.entries()) {
      const level = s.level + (fb < 2 && hash('flare', i, beat) < 0.14 ? 1 : 0);
      g.fillStyle = [C.steel, C.frost, C.white, C.white][level];
      g.fillRect(s.x, s.y, 1, 1);
      if (level >= 3) {
        g.fillStyle = C.frost;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillRect(s.x + dx, s.y + dy, 1, 1);
      }
    }
    // windows: some are lit, a few change every two beats, and on 4.1 the city answers, left to right
    const wave = t >= at.sub ? 40 + 64 * step(t - at.sub) : -1;
    for (const [i, w] of windows.entries()) {
      let lit = hash('lit', i) < (w.far ? 0.14 : 0.32);
      if (hash('flip', i, beat >> 1) < 0.05) lit = !lit;
      if (w.x < wave && hash('wave', i) < 0.4) lit = true;
      if (!lit) continue;
      g.fillStyle = w.far ? (hash('warm', i) < 0.3 ? C.lamp : C.steel) : hash('warm', i) < 0.7 ? C.lamp : C.amber;
      g.fillRect(w.x, w.y, w.w, w.h);
    }
    // the red light on the antenna, on for the first half of every beat
    g.fillStyle = fb < 3 ? C.neon : C.rust;
    g.fillRect(ANTENNA[0], ANTENNA[1] - 2, 2, 2);
    // the neon sign: on, except when it stutters or the signal tears
    const tearing = t >= at.tear && step(t - at.tear) < 3;
    const neonOn = !tearing && hash('neon', f) > 0.07;
    g.fillStyle = neonOn ? C.violet : C.rust;
    g.fillRect(SIGN[0], SIGN[1], 9, 1), g.fillRect(SIGN[0], SIGN[1] + 30, 9, 1);
    g.fillRect(SIGN[0], SIGN[1], 1, 31), g.fillRect(SIGN[0] + 8, SIGN[1], 1, 31);
    g.fillStyle = C.ink;
    g.fillRect(SIGN[0] + 1, SIGN[1] + 1, 7, 29);
    g.drawImage(neonOn ? notes.on : notes.off, SIGN[0] + 1, SIGN[1] + 3);
    g.drawImage(neonOn ? notes.on : notes.off, SIGN[0] + 1, SIGN[1] + 17);
    // the cat nods on every beat, its tail flicks on the eighths
    const CX = 54, CY = 156 - cat.height;
    g.drawImage(tails[[0, 1, 2, 1][Math.floor(song.beatAt(t) * 2 + 1e-6) % 4]], CX + 19, CY + 17);
    g.drawImage(cat, 0, HEAD, cat.width, cat.height - HEAD, CX, CY + HEAD, cat.width, cat.height - HEAD);
    g.drawImage(head, CX, CY + (fb < 2 ? 1 : 0));
    // the title types itself out, a character a beat, then the subtitle, two letters a print-frame
    const shown = at.title.filter(x => t >= x).length, blink = fb < 3;
    for (let i = 0; i < shown; i++) {
      // pen at (14 + 36i, 40) on the baseline, so the characters line up as the font made them
      const x = 13 + 36 * i, y = 40 - title[i].base;
      stamp(g, titleLine[i], x - 1, y - 1, C.ink);
      stamp(g, title[i], x, y, C.lamp);
    }
    if (t < at.sub && blink) {
      g.fillStyle = C.lamp;
      g.fillRect(14 + 36 * shown, 44, 30, 3);
    }
    const sub = typed('PIXEL NIGHT', at.sub, t, 2);
    if (sub) {
      const w = bitmapText(g, sub, 15, 52, C.cyan, { spacing: 2 });
      if (blink) bitmapText(g, '█', 15 + w + 3, 52, C.cyan);
    }
  }

  return {
    id: 'pixel',
    start: 0,
    end: song.duration,
    draw(ctx, s) {
      const { t } = s;
      // the picture
      if (t < at.cut) boot(t);
      else if (step(t - at.cut) === 0) snow(g, `snow:${step(t)}`); // a print-frame of static between the channels
      else scene(t);
      const k = step(t - at.cut), kt = step(t - at.tear);
      if (k === 1 || k === 2) tear(g, [0, 0.7, 0.3][k], `cut:${k}`, buf);
      if (t >= at.tear && kt < 3) tear(g, [1, 0.55, 0.2][kt], `tear:${kt}`, buf);
      if (raw) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(px, 0, 0, W, H);
        return;
      }
      // the tube: on with a line that opens; off by falling to a line, then a spot, then nothing
      const u = t - at.on, o = t - at.off;
      let opts = {};
      if (u < 0.08) opts = { sx: lerp(0.3, 1, ease.cubicOut(span(u, 0, 0.08))), sy: 0.006, flash: 1 };
      else if (u < 0.3) opts = { sy: lerp(0.006, 1, ease.cubicOut(span(u, 0.08, 0.3))), flash: 1 - span(u, 0.08, 0.3) };
      else if (o >= 0 && o < 0.14) opts = { sy: lerp(1, 0.006, ease.quadIn(span(o, 0, 0.14))), flash: 0.85 * span(o, 0, 0.14) };
      else if (o >= 0.14 && o < 0.24) opts = { sx: lerp(1, 0.004, ease.quadIn(span(o, 0.14, 0.24))), sy: 0.006, flash: 1 };
      else if (o >= 0.24) opts = { spot: span(o, 0.24, 0.5) ** 0.7 };
      tv.show(ctx, px, opts);
    },
  };
}
