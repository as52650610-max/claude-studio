// claude-studio engine — a frame is a pure function of time.
// MIT License. Zero dependencies. Runs in a browser; the math helpers also run in Node.
//
// A film page calls film({ shots: [...] }). The engine loads studio.json, data/songmap.json,
// data/lyrics.json, data/cues.json and the project's fonts, resolves every shot, and publishes
//
//   window.SHOT = { width, height, fps, duration, ready, render(t), renderAsync(t), cuts, meta, canvas, sfx }
//
// which tools/render.mjs (and Multiplane) can render frame by frame; renderAsync(t) also waits for
// the frame-sequence images a frame uses. Without ?render=1 the page opens the preview player
// (engine/player.js). Full API: engine/README.md.

export const VERSION = '0.2.0';

// ─── Math ──────────────────────────────────────────────────────────────────────────────────

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d, clamped = true) => {
  const u = invLerp(a, b, x);
  return lerp(c, d, clamped ? clamp(u) : u);
};
export const fract = x => x - Math.floor(x);
export const mod = (x, m) => ((x % m) + m) % m;
export const smoothstep = (a, b, x) => {
  const u = clamp(invLerp(a, b, x));
  return u * u * (3 - 2 * u);
};
export const smootherstep = (a, b, x) => {
  const u = clamp(invLerp(a, b, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
/** Progress 0→1 of t through the window [a, b]. */
export const span = (t, a, b) => clamp(invLerp(a, b, t));
/** 0 before t0, 1 at t0, then halves every halfLife seconds. */
export const pulse = (t, t0, halfLife = 0.12) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / halfLife));
/** Quantise time to a lower frame rate (animate "on twos" at 12 fps, "on threes" at 8 fps). */
export const stepTime = (t, fps = 12) => Math.floor(t * fps + 1e-6) / fps;
export const TAU = Math.PI * 2;

// ─── Easing ────────────────────────────────────────────────────────────────────────────────

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  const solve = x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-7) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 48; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return x => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

const backOut = (s = 1.6) => x => {
  const c = s + 1;
  return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
const expoOut = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const expoIn = x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));

export const ease = {
  linear: x => x,
  /** House defaults: entrances decelerate, exits accelerate (EGSECDA presets). */
  out: bezier(0.16, 1, 0.3, 1),
  in: bezier(0.7, 0, 0.84, 0),
  inOut: bezier(0.87, 0, 0.13, 1),
  quadIn: x => x * x,
  quadOut: x => 1 - (1 - x) * (1 - x),
  quadInOut: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  cubicIn: x => x * x * x,
  cubicOut: x => 1 - Math.pow(1 - x, 3),
  cubicInOut: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  quartIn: x => x * x * x * x,
  quartOut: x => 1 - Math.pow(1 - x, 4),
  quartInOut: x => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  expoIn,
  expoOut,
  expoInOut: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  sineIn: x => 1 - Math.cos((x * Math.PI) / 2),
  sineOut: x => Math.sin((x * Math.PI) / 2),
  sineInOut: x => -(Math.cos(Math.PI * x) - 1) / 2,
  /** Pop-in with overshoot; s = 1.4–1.7 reads as deliberate. */
  backOut: backOut(1.6),
  back: s => backOut(s),
  /** Impact: 90% of the distance in 85% of the time, then a hard snap. */
  impact: x => (x < 0.85 ? 0.9 * (1 - Math.pow(1 - x / 0.85, 3)) : 0.9 + 0.1 * expoIn((x - 0.85) / 0.15)),
  /** Hand-drawn feel: ease, then hold each value for 1/fps of the move's duration. */
  steps: (n, fn = x => x) => x => fn(Math.min(1, Math.floor(x * n + 1e-9) / n)),
  bezier,
};

// ─── Springs (closed form, no state) ────────────────────────────────────────────────────────

/**
 * Step response of a damped spring at time t after the step: 0 → 1 (may overshoot).
 * freq = natural angular frequency ω (rad/s), damp = damping ratio ζ.
 * Presets: buttons 22–26/0.8, cards & camera 14–16/0.72, big type & logos 9–11/0.9, mascots 16–20/0.45.
 */
export function spring(t, { freq = 14, damp = 0.75 } = {}) {
  if (t <= 0) return 0;
  const w = freq, z = damp;
  if (Math.abs(z - 1) < 1e-6) return 1 - Math.exp(-w * t) * (1 + w * t);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  const s = Math.sqrt(z * z - 1), r1 = -w * (z - s), r2 = -w * (z + s);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}

/** Retargeting spring: keys [[t0, v0], [t1, v1], ...]; v(t) = v0 + Σ (v_i − v_{i−1})·spring(t − t_i). */
export function springTrack(t, keys, opts) {
  if (!keys.length) return 0;
  const vec = Array.isArray(keys[0][1]);
  let v = vec ? keys[0][1].slice() : keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = spring(t - keys[i][0], opts);
    if (k === 0) continue;
    if (vec) for (let j = 0; j < v.length; j++) v[j] += (keys[i][1][j] - keys[i - 1][1][j]) * k;
    else v += (keys[i][1] - keys[i - 1][1]) * k;
  }
  return v;
}

/** Keyframes: [[time, value, easeToNext?], ...]. Values may be numbers or arrays. */
export function track(t, keys, defaultEase = ease.inOut) {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [t0, v0, e] = keys[i], [t1, v1] = keys[i + 1];
  const u = (e || defaultEase)(clamp((t - t0) / (t1 - t0)));
  if (Array.isArray(v0)) return v0.map((x, j) => lerp(x, v1[j], u));
  return lerp(v0, v1, u);
}

// ─── Seeded randomness and noise ────────────────────────────────────────────────────────────

function hashInt(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
function seedOf(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v | 0 : Math.floor(v * 1e6) | 0;
  let h = 2166136261;
  for (const ch of String(v)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h | 0;
}
/** Deterministic hash of any arguments → [0, 1). */
export function hash(...args) {
  let h = 0x9e3779b9;
  for (const a of args) h = hashInt(h ^ seedOf(a));
  return h / 4294967296;
}
/** Seeded PRNG (mulberry32): const r = rng('stars'); r() → [0, 1). */
export function rng(seed = 1) {
  let a = hashInt(seedOf(seed)) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}
const grad1 = (i, seed) => hash(i, seed) * 2 - 1;
/** Smooth 1D gradient noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(grad1(i, seed) * f, grad1(i + 1, seed) * (f - 1), u) * 2;
}
/** Smooth 2D gradient noise in about [-1, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (cx, cy, dx, dy) => {
    const a = hash(cx, cy, seed) * TAU;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n0 = lerp(g(ix, iy, fx, fy), g(ix + 1, iy, fx - 1, fy), ux);
  const n1 = lerp(g(ix, iy + 1, fx, fy - 1), g(ix + 1, iy + 1, fx - 1, fy - 1), ux);
  return lerp(n0, n1, uy) * 1.414;
}
/** Fractal noise: octaves of noise2. */
export function fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x, y, seed + o * 101);
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum / norm;
}

// ─── Colour ────────────────────────────────────────────────────────────────────────────────

function parseColor(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3] ?? 1];
  const s = String(c).trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(ch => ch + ch).join('');
    const n = parseInt(h, 16);
    if (h.length === 8) return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`color: cannot parse "${c}" (use #rrggbb or rgb())`);
}
const toLin = v => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toSrgb = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map(v => clamp(Math.round(v), 0, 255));
}
const css = ([r, g, b, a = 1]) => (a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+a.toFixed(4)})`);

export const color = {
  parse: parseColor,
  css,
  /** Perceptual mix in OKLab: color.mix('#000', '#f40', 0.3). */
  mix(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    const la = rgbToOklab(A), lb = rgbToOklab(B);
    const rgb = oklabToRgb([0, 1, 2].map(i => lerp(la[i], lb[i], t)));
    return css([...rgb, lerp(A[3], B[3], t)]);
  },
  alpha(c, a) {
    const p = parseColor(c);
    return css([p[0], p[1], p[2], p[3] * a]);
  },
  /** Relative luminance 0..1 (WCAG). */
  luminance(c) {
    const [r, g, b] = parseColor(c);
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  },
};

// ─── Fonts: load from the project, read cmap, fail loudly on missing glyphs ─────────────────

/** Parse an sfnt (TTF/OTF/TTC) cmap. Returns { glyph(cp) } or null for WOFF/WOFF2. */
export function parseCmap(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0);
  let base = 0;
  const tag = dv.getUint32(0);
  if (tag === 0x74746366) base = dv.getUint32(12); // 'ttcf' → first face
  else if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null; // not TTF/OTF/'true'
  const numTables = dv.getUint16(base + 4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    if (dv.getUint32(rec) === 0x636d6170) cmap = dv.getUint32(rec + 8);
  }
  if (cmap < 0) return null;
  const n = dv.getUint16(cmap + 2);
  let f12 = -1, f4 = -1;
  for (let i = 0; i < n; i++) {
    const p = dv.getUint16(cmap + 4 + i * 8), e = dv.getUint16(cmap + 6 + i * 8);
    const off = cmap + dv.getUint32(cmap + 8 + i * 8);
    const fmt = dv.getUint16(off);
    if (fmt === 12 && ((p === 3 && e === 10) || p === 0)) f12 = off;
    if (fmt === 4 && ((p === 3 && (e === 1 || e === 0)) || p === 0)) f4 = off;
  }
  if (f12 >= 0) {
    const groups = dv.getUint32(f12 + 12);
    return {
      glyph(cp) {
        let lo = 0, hi = groups - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, g = f12 + 16 + mid * 12;
          const s = dv.getUint32(g), e = dv.getUint32(g + 4);
          if (cp < s) hi = mid - 1;
          else if (cp > e) lo = mid + 1;
          else return dv.getUint32(g + 8) + (cp - s);
        }
        return 0;
      },
    };
  }
  if (f4 >= 0) {
    const segX2 = dv.getUint16(f4 + 6), seg = segX2 / 2;
    const ends = f4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    return {
      glyph(cp) {
        if (cp > 0xffff) return 0;
        let lo = 0, hi = seg - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (dv.getUint16(ends + mid * 2) < cp) lo = mid + 1; else hi = mid;
        }
        const s = dv.getUint16(starts + lo * 2);
        if (cp < s || cp > dv.getUint16(ends + lo * 2)) return 0;
        const delta = dv.getInt16(deltas + lo * 2), ro = dv.getUint16(ranges + lo * 2);
        if (ro === 0) return (cp + delta) & 0xffff;
        const g = dv.getUint16(ranges + lo * 2 + ro + (cp - s) * 2);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      },
    };
  }
  return null;
}

const IGNORABLE = /[\s​-‏⁠︀-️]/u;

class FontBook {
  constructor() {
    this.families = new Map(); // family → [{ cmap, face }]
  }
  async load(list = [], resolve = u => u) {
    for (const spec of list) {
      if (!spec || !spec.family || !spec.src) throw new Error('studio.json fonts[]: each font needs "family" and "src"');
      const url = resolve(spec.src);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`font "${spec.family}": cannot load ${spec.src} (HTTP ${res.status}). Fonts must live in the project folder.`);
      const buf = await res.arrayBuffer();
      const desc = {};
      if (spec.weight) desc.weight = String(spec.weight);
      if (spec.style) desc.style = spec.style;
      if (spec.stretch) desc.stretch = spec.stretch;
      const face = new FontFace(spec.family, buf, desc);
      await face.load();
      document.fonts.add(face);
      const entry = { cmap: parseCmap(buf), face, src: spec.src };
      if (!this.families.has(spec.family)) this.families.set(spec.family, []);
      this.families.get(spec.family).push(entry);
    }
    await document.fonts.ready;
  }
  has(family, ch) {
    const faces = this.families.get(family);
    if (!faces) return false;
    const cp = ch.codePointAt(0);
    return faces.some(f => !f.cmap || f.cmap.glyph(cp) !== 0);
  }
  /** Characters of text that the family cannot draw. */
  missing(family, text) {
    const out = new Set();
    for (const ch of String(text)) if (!IGNORABLE.test(ch) && !this.has(family, ch)) out.add(ch);
    return [...out];
  }
  assert(family, text, where = '') {
    if (!this.families.has(family)) {
      throw new Error(`font family "${family}" is not loaded${where}. Add it to studio.json "fonts" (known: ${[...this.families.keys()].join(', ') || 'none'}).`);
    }
    const miss = this.missing(family, text);
    if (miss.length) {
      const list = miss.map(c => `'${c}' U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(', ');
      throw new Error(`missing glyphs in "${family}"${where}: ${list}. Use a font that covers them, or re-run "studio fonts" to re-subset.`);
    }
  }
}

// ─── Song: the beat map as functions of time ────────────────────────────────────────────────

function upperBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo; // first index with arr[i] > x
}
const median = a => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

export function makeSong(map, { offset = 0, duration } = {}) {
  const beats = (map.beats || []).map(b => b + offset);
  if (beats.length < 2) throw new Error('songmap: needs at least two beats');
  const bpb = map.beatsPerBar || 4;
  const periods = beats.slice(1).map((b, i) => b - beats[i]);
  const P = median(periods);
  const P0 = periods.slice(0, 8).length ? median(periods.slice(0, 8)) : P;
  const P1 = periods.slice(-8).length ? median(periods.slice(-8)) : P;
  const n = beats.length;
  // Downbeat positions as beat indices.
  let dIdx = (map.downbeats || []).map(d => {
    const i = upperBound(beats, d + offset + 1e-3) - 1;
    const j = Math.min(n - 1, i + 1);
    return Math.abs(beats[Math.max(0, i)] - d - offset) <= Math.abs(beats[j] - d - offset) ? Math.max(0, i) : j;
  });
  dIdx = [...new Set(dIdx)].sort((a, b) => a - b);
  if (!dIdx.length) for (let i = 0; i < n; i += bpb) dIdx.push(i);
  const downbeats = dIdx.map(i => beats[i]);

  const timeOfBeat = p => {
    if (p <= 0) return beats[0] + p * P0;
    if (p >= n - 1) return beats[n - 1] + (p - (n - 1)) * P1;
    const i = Math.floor(p);
    return lerp(beats[i], beats[i + 1], p - i);
  };
  const beatAt = t => {
    if (t <= beats[0]) return (t - beats[0]) / P0;
    if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / P1;
    const i = upperBound(beats, t) - 1;
    return i + (t - beats[i]) / (beats[i + 1] - beats[i]);
  };
  const barStart = k => (k < 0 ? dIdx[0] + k * bpb : k >= dIdx.length ? dIdx[dIdx.length - 1] + (k - dIdx.length + 1) * bpb : dIdx[k]);
  const barAtBeat = p => {
    if (p < dIdx[0]) return 1 + (p - dIdx[0]) / bpb;
    const k = upperBound(dIdx, p) - 1;
    const a = barStart(k), b = barStart(k + 1);
    return k + 1 + (p - a) / (b - a);
  };
  const env = map.envelopes || null;
  const events = map.events || {};
  const evCache = {};
  const eventList = kind => {
    if (evCache[kind]) return evCache[kind];
    let list;
    if (kind === 'beat') list = beats.map(t => [t, 1]);
    else if (kind === 'downbeat') list = downbeats.map(t => [t, 1]);
    else if (kind === 'impact') list = (map.impacts || []).map(e => [e.t + offset, e.strength ?? 1]);
    else list = (events[kind] || []).map(e => (Array.isArray(e) ? [e[0] + offset, e[1] ?? 1] : [e.t + offset, e.strength ?? 1]));
    list.times = list.map(e => e[0]);
    return (evCache[kind] = list);
  };
  const sections = (map.sections || []).map((s, i) => ({ ...s, index: i, start: s.start + offset, end: s.end + offset, name: s.name || s.label }));
  const stops = (map.stops || []).map(s => ({ start: s.start + offset, end: s.end + offset }));

  const song = {
    synthetic: !!map.synthetic,
    bpm: map.bpm || 60 / P,
    beatsPerBar: bpb,
    beats,
    downbeats,
    sections,
    stops,
    duration: duration ?? (map.duration != null ? map.duration : beats[n - 1] + P),
    period: P,
    timeOfBeat,
    beatAt,
    /** Fractional bar number, 1-based (bar 1 starts on the first downbeat). */
    barAt: t => barAtBeat(beatAt(t)),
    /** Integer musical position for display: { bar, beat, sixteenth }. */
    position(t) {
      const p = beatAt(t), last = dIdx.length - 1;
      let k = p < dIdx[0] ? Math.floor((p - dIdx[0]) / bpb) : upperBound(dIdx, p) - 1;
      if (k === last && p >= dIdx[last] + bpb) k = last + Math.floor((p - dIdx[last]) / bpb); // past the last measured bar
      const start = barStart(k);
      const inBar = p - start;
      return { bar: k + 1, beat: Math.floor(inBar) + 1, sixteenth: Math.floor(fract(inBar) * 4) + 1 };
    },
    /** Time of bar (1-based), beat (1-based) and sixteenth (1–4). Follows the measured beats. */
    T(bar, beat = 1, sixteenth = 1) {
      const k = Math.floor(bar) - 1;
      const a = barStart(k), b = barStart(k + 1);
      return timeOfBeat(a + (bar - Math.floor(bar)) * (b - a) + (beat - 1) + (sixteenth - 1) / 4);
    },
    nextBeat: t => timeOfBeat(Math.floor(beatAt(t) + 1e-6) + 1),
    prevBeat: t => timeOfBeat(Math.floor(beatAt(t) + 1e-6)),
    nearestBeat: t => timeOfBeat(Math.round(beatAt(t))),
    prevDownbeat(t) {
      const i = upperBound(downbeats, t + 1e-6) - 1;
      return i >= 0 ? downbeats[i] : downbeats[0] - bpb * P0;
    },
    nextDownbeat(t) {
      const i = upperBound(downbeats, t + 1e-6);
      return i < downbeats.length ? downbeats[i] : downbeats[downbeats.length - 1] + bpb * P1;
    },
    section(t) {
      for (const s of sections) if (t >= s.start && t < s.end) return s;
      return null;
    },
    /** Energy envelope 0–1: 'rms' | 'low' | 'mid' | 'high' | 'onset'. */
    env(name, t) {
      if (!env) return 0;
      const key = name === 'overall' ? 'rms' : name;
      const arr = env[key];
      if (!arr) throw new Error(`song.env: unknown envelope "${name}" (have ${Object.keys(env).filter(k => Array.isArray(env[k])).join(', ')})`);
      const x = (t - offset) * env.fps;
      if (x <= 0) return arr[0] / env.scale;
      if (x >= arr.length - 1) return arr[arr.length - 1] / env.scale;
      const i = Math.floor(x);
      return lerp(arr[i], arr[i + 1], x - i) / env.scale;
    },
    /** Decaying pulse 0–1 from the latest event of a kind: kick | snare | hat | vocal | beat | downbeat | impact. */
    hit(kind, t, halfLife = 0.12) {
      const list = eventList(kind);
      let i = upperBound(list.times, t) - 1, v = 0;
      for (let k = 0; k < 3 && i >= 0; k++, i--) v = Math.max(v, list[i][1] * Math.pow(0.5, (t - list[i][0]) / halfLife));
      return v;
    },
    events: kind => eventList(kind).map(e => ({ t: e[0], strength: e[1] })),
    isStop: t => stops.some(s => t >= s.start && t < s.end),
  };
  return song;
}

/** A metronome grid for films without analysed music. */
export function syntheticSongmap({ bpm = 120, beatsPerBar = 4, firstBeat = 0, duration = 60 }) {
  const P = 60 / bpm, beats = [];
  for (let t = firstBeat; t <= duration + P * beatsPerBar; t += P) beats.push(+t.toFixed(6));
  return { synthetic: true, bpm, beatsPerBar, beats, downbeats: beats.filter((_, i) => i % beatsPerBar === 0), duration };
}

// ─── Lyrics ────────────────────────────────────────────────────────────────────────────────

const RE_PUNCT = /[\p{P}\p{S}]/u;
const RE_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
/** Karaoke weight of one character when only line times are known. */
export function charWeight(ch) {
  if (/\s/u.test(ch)) return 0.1;
  if (RE_PUNCT.test(ch)) return 0;
  if (RE_CJK.test(ch)) return 1;
  return 0.25;
}
export function graphemes(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(text))].map(s => s.segment);
  return Array.from(String(text));
}
/** Spread a line's time over its characters by weight; marks every char est: true. */
export function estimateChars(text, start, end) {
  const cs = graphemes(text), w = cs.map(charWeight), total = w.reduce((a, b) => a + b, 0) || 1;
  let acc = start;
  return cs.map((c, i) => {
    const d = ((end - start) * w[i]) / total;
    const o = { c, start: acc, end: acc + d, est: true };
    acc += d;
    return o;
  });
}
const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function makeLyrics(data, { offset = 0 } = {}) {
  const lines = (data?.lines || []).map((l, i) => {
    const start = l.start + offset, end = l.end + offset;
    const text = l.text ?? '';
    const chars = l.chars && l.chars.length && l.chars.every(c => c.c !== undefined)
      ? l.chars.map(c => ({ c: c.c, start: c.start + offset, end: c.end + offset, est: !!c.est }))
      : text ? estimateChars(text, start, end) : [];
    return { ...l, i, start, end, text, translation: l.translation || '', chars, key: normalize(text) };
  });
  const hasText = lines.some(l => l.text);
  const lyrics = {
    lines,
    hasText,
    source: data?.source || '',
    /** The line being sung at t (lead/hold widen the window). */
    lineAt(t, { lead = 0, hold = 0 } = {}) {
      let found = null;
      for (const l of lines) if (t >= l.start - lead && t < l.end + hold) found = l;
      return found;
    },
    /** nth line (1-based) whose text contains query (spaces and punctuation ignored). */
    find(query, { nth = 1 } = {}) {
      if (typeof query === 'number') {
        const l = lines[query - 1];
        if (!l) throw new Error(`lyrics: there is no line ${query} (have ${lines.length})`);
        return l;
      }
      if (!hasText) throw new Error('lyrics: data/lyrics.json has no text (timing-only). Run "studio lyrics fill" or address lines by number: at.lyric(3).');
      const q = normalize(query);
      const hits = lines.filter(l => l.key.includes(q));
      if (hits.length >= nth) return hits[nth - 1];
      const sample = lines.slice(0, 12).map(l => `${l.i + 1}:${l.text}`).join(' | ');
      throw new Error(`lyrics: "${query}" ${hits.length ? `occurs only ${hits.length}×, asked for nth ${nth}` : 'is not in any line'}. Lines: ${sample}${lines.length > 12 ? ' …' : ''}`);
    },
    /** How many characters have been sung at t, as a fraction (2.4 = two done, third 40%). */
    progress(line, t) {
      let p = 0;
      for (let j = 0; j < line.chars.length; j++) {
        const c = line.chars[j];
        if (t >= c.end) p = j + 1;
        else {
          if (t > c.start) p = j + (t - c.start) / Math.max(1e-6, c.end - c.start);
          break;
        }
      }
      return p;
    },
  };
  return lyrics;
}

// ─── Addressing: never hard-code seconds ───────────────────────────────────────────────────

export function makeAt(song, lyrics, cues) {
  const tol = 0.06;
  const beatAtOrBefore = t => song.timeOfBeat(Math.floor(song.beatAt(t + tol) + 1e-9));
  const at = {
    T: (...a) => song.T(...a),
    /**
     * Time for a lyric line: by default the beat at (or just before) the line starts.
     * snap: 'beat' (default) | 'downbeat' | 'half' | 'none' (the exact sung start).
     */
    lyric(query, { nth = 1, snap = 'beat' } = {}) {
      const l = lyrics.find(query, { nth });
      if (snap === 'none') return l.start;
      if (snap === 'downbeat') return song.prevDownbeat(l.start + tol);
      if (snap === 'half') return song.timeOfBeat(Math.floor(song.beatAt(l.start + tol) * 2 + 1e-9) / 2);
      return beatAtOrBefore(l.start);
    },
    /** The nearest downbeat at or after the line ends. */
    afterLine(query, { nth = 1 } = {}) {
      const l = lyrics.find(query, { nth });
      return song.nextDownbeat(l.end - 1e-3);
    },
    /** The line object itself: { start, end, text, chars, ... }. */
    line: (query, opts) => lyrics.find(query, opts),
    /** When a word inside a line is sung: at.word('就在這裡', '這裡'). */
    word(query, word, { nth = 1, occurrence = 1 } = {}) {
      const l = lyrics.find(query, { nth });
      const cs = l.chars.map(c => c.c).join('');
      let idx = -1;
      for (let k = 0; k < occurrence; k++) idx = cs.indexOf(word, idx + 1);
      if (idx < 0) throw new Error(`at.word: "${word}" is not in line "${l.text}"`);
      let pos = 0;
      for (let j = 0; j < l.chars.length; j++) {
        if (pos >= idx) return l.chars[j].start;
        pos += l.chars[j].c.length;
      }
      return l.end;
    },
    /** A human-checked time from data/cues.json. */
    cue(name) {
      const c = cues.get(name);
      if (c === undefined) throw new Error(`at.cue: "${name}" is not in data/cues.json (have: ${[...cues.keys()].join(', ') || 'none'})`);
      return c;
    },
    beat: n => song.timeOfBeat(n),
    bar: n => song.T(n, 1),
  };
  return at;
}

// ─── Text ──────────────────────────────────────────────────────────────────────────────────

let BOOK = null; // FontBook of the running film, for glyph checks in helpers
let FILM = null; // the running film: helpers default to its size and first font
const checked = new Set();
const defaultFamily = () => (FILM && FILM.defaultFamily) || 'sans-serif';
const filmSize = (ctx, width, height) => [width ?? (FILM ? FILM.width : ctx.canvas.width), height ?? (FILM ? FILM.height : ctx.canvas.height)];
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif']);
function checkGlyphs(family, text) {
  if (!BOOK || !family) return;
  const k = family + '\u0000' + text;
  if (checked.has(k)) return;
  // System fonts cannot be checked and differ between machines: allowed, with one warning.
  if (GENERIC.has(family) || family.includes(',')) {
    if (!checked.has('\u0000system')) {
      const msg = `drawing with the system font "${family}": renders differ between machines; add a project font to studio.json "fonts"`;
      console.warn(`[studio] ${msg}`);
      FILM?.SHOT?.meta?.warnings?.push(msg); // reaches the render log (once) when frame 0 draws it
    }
    checked.add('\u0000system');
    checked.add(k);
    return;
  }
  BOOK.assert(family, text);
  checked.add(k);
}
export function fontString({ size = 64, family, weight = 400, style = 'normal' } = {}) {
  family = family || defaultFamily();
  const fam = family.includes(',') || /^["']/.test(family) || GENERIC.has(family) ? family : `"${family}"`;
  return `${style} ${weight} ${size}px ${fam}`;
}

/**
 * Draw text with project fonts. Returns the drawn width.
 * opts: size, family, weight, style, fill, stroke, strokeWidth, align, baseline, spacing (em), alpha, maxWidth.
 */
export function drawText(ctx, text, x, y, opts = {}) {
  const { size = 64, family = defaultFamily(), weight = 400, style = 'normal', fill = '#fff', stroke = null, strokeWidth = 0, align = 'left', baseline = 'alphabetic', spacing = 0, alpha = 1 } = opts;
  text = String(text);
  if (!text) return 0;
  checkGlyphs(family, text);
  ctx.save();
  ctx.font = fontString({ size, family, weight, style });
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${spacing * size}px`;
  ctx.globalAlpha *= alpha;
  if (stroke && strokeWidth) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * Text drawn once into its own canvas and scaled with drawImage afterwards: for display type that
 * changes size, or anything over about 250 px. On the GPU, very large glyphs can come out a level
 * or two different from one run to the next, depending on what was drawn before them (studio verify
 * catches it); an image scales the same way every time. Make sprites when the shot is built, not
 * inside draw(). opts as drawText (align and baseline are set by draw()).
 * Returns { canvas, size, width(s), draw(ctx, x, y, s = size, { align = 'left' }) } with the
 * alphabetic baseline at y.
 */
export function textSprite(text, opts = {}) {
  const { size = 64, family = defaultFamily(), weight = 400, style = 'normal', spacing = 0, strokeWidth = 0 } = opts;
  text = String(text);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = fontString({ size, family, weight, style });
  g.letterSpacing = `${spacing * size}px`;
  const m = g.measureText(text), pad = Math.ceil(2 + strokeWidth);
  const asc = Math.ceil(m.fontBoundingBoxAscent), desc = Math.ceil(m.fontBoundingBoxDescent);
  c.width = Math.max(1, Math.ceil(m.width) + 2 * pad);
  c.height = asc + desc + 2 * pad;
  drawText(g, text, pad, pad + asc, { ...opts, align: 'left', baseline: 'alphabetic' });
  return {
    canvas: c,
    size,
    width: s => (m.width * s) / size,
    draw(ctx, x, y, s = size, { align = 'left' } = {}) {
      const k = s / size, w = m.width * k;
      const ox = align === 'center' ? w / 2 : align === 'right' ? w : 0;
      ctx.drawImage(c, x - ox - pad * k, y - (pad + asc) * k, c.width * k, c.height * k);
    },
  };
}

const NO_START = new Set([...'，。、；：！？」』）】〉》〕…—～‧·．,.;:!?)]}%’”〙〗ーぁぃぅぇぉっゃゅょァィゥェォッャュョ']);
const NO_END = new Set([...'「『（【〈《〔([{‘“〘〖']);
/** Break text into lines that fit maxWidth (CJK per character, Latin per word, kinsoku rules). Set ctx.font first. */
export function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const units = [];
    for (const m of para.matchAll(/[A-Za-z0-9À-ɏ'’\-]+\s*|\s+|./gsu)) units.push(m[0]);
    let line = '';
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const trial = line + u;
      const w = ctx.measureText(trial.trimEnd()).width;
      if (w <= maxWidth || !line) {
        line = trial;
        continue;
      }
      // Kinsoku: keep closing punctuation with the previous line, opening punctuation with the next.
      if (NO_START.has(u[0])) {
        line = trial;
        continue;
      }
      let carry = '';
      while (line.length > 1 && NO_END.has(line[line.length - 1])) {
        carry = line[line.length - 1] + carry;
        line = line.slice(0, -1);
      }
      out.push(line.trimEnd());
      line = (carry + u).trimStart();
    }
    out.push(line.trimEnd());
  }
  return out;
}
/** Largest font size (≤ maxSize) at which text fits maxWidth. */
export function fitText(ctx, text, maxWidth, { family = defaultFamily(), weight = 400, style = 'normal', maxSize = 200, minSize = 8, spacing = 0 } = {}) {
  let lo = minSize, hi = maxSize;
  ctx.save();
  for (let i = 0; i < 20 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = fontString({ size: mid, family, weight, style });
    ctx.letterSpacing = `${spacing * mid}px`;
    if (ctx.measureText(text).width <= maxWidth) lo = mid; else hi = mid;
  }
  ctx.restore();
  return Math.floor(lo);
}

const V_ROTATE = new Set([...'ー—―–-…‥～〜~「」『』（）()【】《》〈〉〔〕［］[]｛｝{}＜＞<>→←']);
const V_SHIFT = new Set([...'、。，．,.']);
/**
 * Vertical text, top to bottom from (x, y) = centre of the first character.
 * Long marks, dashes, ellipses, brackets and Latin rotate; 、。 move to the upper right.
 */
export function verticalText(ctx, text, x, y, opts = {}) {
  const { size = 84, family = defaultFamily(), weight = 400, fill = '#fff', spacing = 0.05, alpha = 1, rotateLatin = true } = opts;
  text = String(text);
  checkGlyphs(family, text);
  ctx.save();
  ctx.font = fontString({ size, family, weight });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.globalAlpha *= alpha;
  let cy = y;
  for (const ch of graphemes(text)) {
    const latin = rotateLatin && /[A-Za-z0-9]/.test(ch);
    if (V_ROTATE.has(ch) || latin) {
      const adv = latin ? ctx.measureText(ch).width : size;
      ctx.save();
      ctx.translate(x, cy + (adv - size) / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      cy += (latin ? adv : size) + size * spacing;
      continue;
    }
    if (V_SHIFT.has(ch)) ctx.fillText(ch, x + size * 0.6, cy - size * 0.6);
    else ctx.fillText(ch, x, cy);
    cy += size * (1 + spacing);
  }
  ctx.restore();
  return cy - y;
}

/**
 * Karaoke line: unsung characters in `base`, sung ones in `fill`, the current one swept.
 * The fill never runs ahead of the voice; the dim preview may lead by `lead` seconds (≤ 0.4).
 */
export function karaoke(ctx, line, t, opts = {}) {
  const { x = 0, y = 0, size = 96, family = defaultFamily(), weight = 700, align = 'center', base = 'rgba(255,255,255,0.32)', fill = '#ffffff', lead = 0.3, fadeOut = 0.25, spacing = 0, stroke = null, strokeWidth = 0 } = opts;
  if (!line || !line.text) return null;
  if (t < line.start - lead || t > line.end + fadeOut) return null;
  const text = line.chars.map(c => c.c).join('');
  checkGlyphs(family, text);
  const appear = clamp((t - (line.start - lead)) / Math.max(1e-3, lead));
  const vanish = 1 - clamp((t - line.end) / Math.max(1e-3, fadeOut));
  ctx.save();
  ctx.font = fontString({ size, family, weight });
  ctx.letterSpacing = `${spacing * size}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const widths = line.chars.map(c => ctx.measureText(c.c).width + spacing * size);
  const total = widths.reduce((a, b) => a + b, 0);
  const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.globalAlpha *= appear * vanish;
  if (stroke && strokeWidth) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x0, y);
  }
  ctx.fillStyle = base;
  ctx.fillText(text, x0, y);
  const p = t < line.start ? 0 : clamp(lyricsProgress(line, t), 0, line.chars.length);
  if (p > 0) {
    let w = 0;
    const done = Math.floor(p);
    for (let j = 0; j < done; j++) w += widths[j];
    if (done < widths.length) w += widths[done] * (p - done);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - size, y - size * 1.5, w + size, size * 2.5);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillText(text, x0, y);
    ctx.restore();
  }
  ctx.restore();
  return { x: x0, width: total, progress: p };
}
function lyricsProgress(line, t) {
  let p = 0;
  for (let j = 0; j < line.chars.length; j++) {
    const c = line.chars[j];
    if (t >= c.end) p = j + 1;
    else {
      if (t > c.start) p = j + (t - c.start) / Math.max(1e-6, c.end - c.start);
      break;
    }
  }
  return p;
}

// ─── Texture and camera ────────────────────────────────────────────────────────────────────

const grainTiles = new Map();
function grainTile(size, variant, seed) {
  const key = `${size}:${variant}:${seed}`;
  if (grainTiles.has(key)) return grainTiles.get(key);
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const r = rng(`grain:${variant}:${seed}`);
  for (let i = 0; i < n * n; i++) {
    const v = Math.round(128 + (r() + r() + r() - 1.5) * 120);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTiles.set(key, c);
  return c;
}
/** Film grain seeded by frame index (so motion-blur subframes share one grain pattern). */
export function grain(ctx, frame, { amount = 0.06, size = 1, seed = 0, mode = 'overlay', width, height } = {}) {
  if (amount <= 0) return;
  const [W, H] = filmSize(ctx, width, height);
  const tile = grainTile(size, Math.floor(hash(frame, seed, 'v') * 6), seed);
  const pat = ctx.createPattern(tile, 'repeat');
  const ox = Math.floor(hash(frame, seed, 'x') * 256), oy = Math.floor(hash(frame, seed, 'y') * 256);
  pat.setTransform(new DOMMatrix().translate(-ox * size, -oy * size).scale(size));
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = amount;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/** Darken the edges. amount 0–1; inner = radius (fraction of the half-diagonal) where it starts. */
export function vignette(ctx, { amount = 0.35, inner = 0.5, color: c = '#000', width, height } = {}) {
  const [W, H] = filmSize(ctx, width, height);
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * inner, W / 2, H / 2, r);
  g.addColorStop(0, color.alpha(c, 0));
  g.addColorStop(1, color.alpha(c, amount));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/**
 * Draw inside a 2D camera. cam = { x, y, zoom, rot } in film units around the frame centre.
 * depth scales the move for parallax: far layers 0.02–0.06, subject 1, blurred foreground 1.2–1.5.
 */
export function camera(ctx, cam, draw, { depth = 1, width, height } = {}) {
  const [W, H] = filmSize(ctx, width, height);
  const { x = 0, y = 0, zoom = 1, rot = 0 } = cam || {};
  const z = Math.pow(zoom, depth);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rot * depth);
  ctx.scale(z, z);
  ctx.translate(-W / 2 - x * depth, -H / 2 - y * depth);
  draw(ctx);
  ctx.restore();
}
/** Where a world point lands on screen under camera(cam, depth). */
export function toScreen(cam, px, py, { depth = 1, width = FILM?.width, height = FILM?.height } = {}) {
  const { x = 0, y = 0, zoom = 1, rot = 0 } = cam || {};
  const z = Math.pow(zoom, depth), a = rot * depth;
  const dx = (px - width / 2 - x * depth) * z, dy = (py - height / 2 - y * depth) * z;
  return [width / 2 + dx * Math.cos(a) - dy * Math.sin(a), height / 2 + dx * Math.sin(a) + dy * Math.cos(a)];
}
/** Seeded handheld drift: calm amp 2–4 px, panic 8–13 px. */
export function shake(t, { amp = 3, freq = 1.2, rot = 0.002, seed = 0 } = {}) {
  return { x: noise1(t * freq, seed + 1) * amp, y: noise1(t * freq, seed + 2) * amp, rot: noise1(t * freq * 0.7, seed + 3) * rot };
}

// ─── Frame sequences: pictures made by other tools ─────────────────────────────────────────
//
// Blender renders, generated clips and anything else that arrives as numbered images come in
// through `studio frames`, which writes frames.json beside them. A frame of the film still depends
// only on t: SHOT.renderAsync(t) loads the images a frame needs before the frame is captured, so
// frames can be rendered in any order. The preview shows the nearest decoded frame meanwhile.

/** Index of the clip frame showing `time` seconds into a clip: held at both ends, or looped. */
export function frameIndex(time, fps, count, { loop = false, rate = 1 } = {}) {
  if (!(count > 0) || !(fps > 0)) return -1;
  const i = Math.floor(time * fps * rate + 1e-6);
  return loop ? mod(i, count) : clamp(i, 0, count - 1);
}

const frameMemory = { used: 0, limit: 256 * 2 ** 20, order: new Map() }; // decoded frames, least recently drawn first
let sequenceCount = 0;

function rememberFrame(seq, i, img) {
  const key = `${seq.id}:${i}`, bytes = img.width * img.height * 4;
  frameMemory.order.set(key, [seq, i, bytes]);
  frameMemory.used += bytes;
  const inUse = seq.film?._inUse;
  for (const [k, [s, j, b]] of frameMemory.order) {
    if (frameMemory.used <= frameMemory.limit) break;
    if (k === key || inUse?.has(k)) continue; // never drop what the frame being drawn uses
    s.images.get(j)?.close?.();
    s.images.delete(j);
    frameMemory.order.delete(k);
    frameMemory.used -= b;
  }
}

class FrameSeq {
  constructor(meta, dir, resolve, film) {
    Object.assign(this, { meta, dir, film, fps: meta.fps, count: meta.count, width: meta.width, height: meta.height });
    this.duration = meta.count / meta.fps;
    this.id = ++sequenceCount;
    const pattern = String(meta.pattern || '%06d.png'), first = meta.first ?? 1;
    this.url = i => resolve(`${dir}/${pattern.replace(/%0?(\d*)d/, (_, n) => String(first + i).padStart(+n || 0, '0'))}`);
    this.images = new Map();
    this.loading = new Map();
    this.failed = new Map();
  }
  /** Frame index at `time` seconds into the clip; opts { loop, rate } as frameIndex. */
  index(time, opts) {
    return frameIndex(time, this.fps, this.count, opts);
  }
  load(i) {
    if (this.images.has(i)) return Promise.resolve(this.images.get(i));
    if (this.loading.has(i)) return this.loading.get(i);
    if (this.failed.has(i)) return Promise.reject(this.failed.get(i));
    const url = this.url(i);
    const preview = this.film?.mode !== 'render';
    const what = `frames ${this.dir}: ${url.split('/').pop()} (frame ${i + 1} of ${this.count})`;
    const p = (async () => {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${what} cannot be loaded (HTTP ${res.status})`);
      const blob = await res.blob();
      return createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'premultiply' }).catch(e => {
        throw new Error(`${what} cannot be decoded (${e.message}); bring the clip in again with studio frames`);
      });
    })().then(
      img => {
        this.loading.delete(i);
        this.images.set(i, img);
        rememberFrame(this, i, img);
        if (preview) this.film?.invalidate?.();
        return img;
      },
      err => {
        this.loading.delete(i);
        this.failed.set(i, err);
        if (preview) this.film?.invalidate?.();
        throw err;
      },
    );
    this.loading.set(i, p);
    return p;
  }
  /** The decoded frame i, or null while it loads (render: the frame is drawn again once it has). */
  image(i) {
    if (!(i >= 0 && i < this.count)) return null;
    i = Math.floor(i);
    if (this.failed.has(i)) throw this.failed.get(i);
    const key = `${this.id}:${i}`, film = this.film, render = film?.mode === 'render';
    film?._inUse?.add(key);
    // Keep the next frames coming, so playback and sequential renders rarely wait.
    for (let k = 1; k <= (render ? 4 : 8) && i + k < this.count; k++) if (!this.images.has(i + k)) this.load(i + k).catch(() => {});
    const img = this.images.get(i);
    if (img) {
      const entry = frameMemory.order.get(key); // the frame drawn last goes to the back of the queue
      frameMemory.order.delete(key);
      if (entry) frameMemory.order.set(key, entry);
      return img;
    }
    const p = this.load(i);
    if (!render) {
      p.catch(() => {});
      for (let d = 1; d <= 12; d++) for (const j of [i - d, i + d]) if (this.images.has(j)) return this.images.get(j);
      return null;
    }
    if (!film._pending) throw new Error(`frames ${this.dir}: frame ${i + 1} is not loaded yet; render with SHOT.renderAsync(t)`);
    film._pending.push(p);
    return null;
  }
  /** [x, y, w, h] that fits the clip into width × height: 'contain', 'cover' or 'fill'; ax, ay anchor 0–1. */
  fit(width, height, mode = 'contain', ax = 0.5, ay = 0.5) {
    if (mode === 'fill') return [0, 0, width, height];
    const k = (mode === 'cover' ? Math.max : Math.min)(width / this.width, height / this.height);
    const w = this.width * k, h = this.height * k;
    return [(width - w) * ax, (height - h) * ay, w, h];
  }
  /** Draw the frame showing `time` seconds into the clip. opts: loop, rate, alpha. Returns the image or null. */
  draw(ctx, time, x = 0, y = 0, w = this.width, h = this.height, { loop = false, rate = 1, alpha = 1 } = {}) {
    const img = this.image(this.index(time, { loop, rate }));
    if (!img) return null;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return img;
  }
}

async function loadFrames(dir, resolve, film) {
  const base = String(dir).replace(/[\\/]+$/, '');
  const meta = await fetchJSON(resolve(`${base}/frames.json`), false);
  if (!meta) throw new Error(`${base}/frames.json not found: bring the clip in with "studio frames <project> <clip> --name ${base.split('/').pop()}"`);
  for (const k of ['fps', 'count', 'width', 'height']) if (!(meta[k] > 0)) throw new Error(`${base}/frames.json: "${k}" must be a positive number`);
  const seq = new FrameSeq(meta, base, resolve, film);
  film.sequences.push(seq);
  return seq;
}

// ─── Film ──────────────────────────────────────────────────────────────────────────────────

async function fetchJSON(url, required) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    if (required) throw new Error(`cannot load ${url}: ${e.message}`);
    return null;
  }
  if (!res.ok) {
    if (required) throw new Error(`cannot load ${url} (HTTP ${res.status})`);
    return null;
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url} is not valid JSON: ${e.message}`);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => reject(new Error(`image not found: ${url}`));
    img.src = url;
  });
}

/**
 * Build a film. Call once from film.html:
 *   film({ shots: [opening, verse1], background: '#0e0e10', post: (ctx, s) => grain(ctx, s.frame) })
 * Each entry of shots may be a shot { id, start, end, draw(ctx, s) }, an array of shots, or a
 * (possibly async) function (api) => shot | shot[], called after the music, lyrics and cues load.
 */
export function film(config = {}) {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const mode = params.get('render') ? 'render' : 'preview';
  const base = new URL('.', location.href);
  const resolve = p => new URL(p, base).href;
  const SHOT = {
    engine: `claude-studio ${VERSION}`,
    width: config.width || 0,
    height: config.height || 0,
    fps: config.fps || 0,
    duration: config.duration || 0,
    cuts: [],
    meta: {},
    sfx: [],
    capture: config.capture || 'canvas',
    canvas: null,
    ready: null,
    render: (t, info) => f.render(t, info),
    /** render(t), after loading every frame-sequence image the frame needs (a Promise). */
    renderAsync: (t, info) => f.renderAsync(t, info),
    /** Where t falls: time, bar.beat, section, active shots and lyric line (for labels and sheets). */
    describe: t => f.describe(t),
  };
  window.SHOT = SHOT;
  const f = { mode, params, SHOT, shots: [], errors: [], sequences: [] };
  window.studio = f;

  SHOT.ready = (async () => {
    const studio = (await fetchJSON(resolve(config.config || 'studio.json'), !config.width)) || {};
    const W0 = config.width || studio.width || 1920, H0 = config.height || studio.height || 1080;
    const W = +params.get('w') || W0, H = +params.get('h') || H0;
    const fps = config.fps || studio.fps || 30;
    const scale = +params.get('scale') || (mode === 'render' ? 1 : +studio.previewScale || 1);
    const offset = +(studio.offset || 0), lyricOffset = +(studio.lyricOffset || 0);

    const fonts = new FontBook();
    await fonts.load([...(studio.fonts || []), ...(config.fonts || [])], resolve);
    BOOK = fonts;

    const songmap = await fetchJSON(resolve(studio.songmap || 'data/songmap.json'), false);
    const lyricData = await fetchJSON(resolve(studio.lyrics || 'data/lyrics.json'), false);
    const cueData = await fetchJSON(resolve(studio.cues || 'data/cues.json'), false);
    const duration = config.duration || studio.duration || songmap?.duration;
    const song = makeSong(songmap || syntheticSongmap({ bpm: studio.bpm || 120, beatsPerBar: studio.beatsPerBar || 4, firstBeat: studio.firstBeat || 0, duration: duration || 60 }), { offset, duration });
    const lyrics = makeLyrics(lyricData, { offset: offset + lyricOffset });
    const cues = new Map((cueData?.cues || []).map(c => [c.name, c.t + offset]));
    const at = makeAt(song, lyrics, cues);
    if (lyrics.hasText && studio.lyricFont !== false) {
      const fam = studio.lyricFont || studio.fonts?.[0]?.family;
      if (fam) for (const l of lyrics.lines) fonts.assert(fam, l.text + l.translation, ` (lyrics line ${l.i + 1})`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    Object.assign(f, { width: W, height: H, fps, scale, duration: 0, canvas, ctx, song, lyrics, at, cues, fonts, studio, offset, lyricOffset, resolve });
    f.defaultFamily = studio.fonts?.[0]?.family || config.fonts?.[0]?.family || 'sans-serif';
    FILM = f;
    frameMemory.limit = (+config.frameCacheMB || +studio.frameCacheMB || 256) * 2 ** 20;

    const api = { film: f, song, lyrics, at, cues, fonts, width: W, height: H, fps, params, loadImage: u => loadImage(resolve(u)), loadJSON: u => fetchJSON(resolve(u), true), loadText: async u => (await fetch(resolve(u))).text(), loadFrames: d => loadFrames(d, resolve, f) };
    if (config.setup) await config.setup(api);
    let list = [];
    for (const entry of config.shots || []) {
      const v = typeof entry === 'function' ? await entry(api) : entry;
      list = list.concat(v || []);
    }
    const ids = new Set();
    list.forEach((s, i) => {
      if (!s || typeof s.draw !== 'function') throw new Error(`shot #${i + 1}${s?.id ? ` (${s.id})` : ''} has no draw(ctx, s) function`);
      s.id = s.id || `S${String(i + 1).padStart(2, '0')}`;
      if (ids.has(s.id)) throw new Error(`duplicate shot id "${s.id}"`);
      ids.add(s.id);
      if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) throw new Error(`shot ${s.id}: start/end must be numbers with end > start (got ${s.start}, ${s.end})`);
      s.index = i;
      s.layer = s.layer || 0;
    });
    f.shots = list;
    f.order = [...list].sort((a, b) => a.layer - b.layer || a.index - b.index);
    const dur = duration || Math.max(0, ...list.map(s => s.end));
    if (!dur) throw new Error('film has no duration: set "duration" in studio.json, analyse a song, or add shots');
    f.duration = dur;

    const cuts = new Set(config.cuts || []);
    for (const s of list) if (s.cut !== false && s.start > 1e-6 && s.start < dur - 1e-6) cuts.add(+s.start.toFixed(6));
    // A gap matters when a frame lands in it: that frame shows only the background.
    const warnings = [];
    const sorted = [...list].sort((a, b) => a.start - b.start);
    const firstFrameFrom = t => Math.ceil(t * fps - 1e-6) / fps;
    const gap = (a, b) => {
      const f = firstFrameFrom(a);
      if (f < b - 1e-6) {
        const n = Math.ceil(b * fps - 1e-6) - Math.round(f * fps);
        warnings.push(`no shot covers ${a.toFixed(3)}–${b.toFixed(3)} s (${n} frame${n === 1 ? '' : 's'} of background)`);
      }
    };
    let cover = 0;
    for (const s of sorted) {
      if (s.start > cover) gap(cover, s.start);
      cover = Math.max(cover, s.end);
    }
    if (list.length && cover < dur) gap(cover, dur);

    const sfx = [];
    const collect = (arr, from) => {
      for (const e of arr || []) {
        if (!Number.isFinite(e.t)) throw new Error(`sfx in ${from}: every sound needs a time t (got ${e.t})`);
        sfx.push({ ...e, from });
      }
    };
    for (const s of list) collect(s.sfx, s.id);
    if (config.sfx) collect(typeof config.sfx === 'function' ? config.sfx(api) : config.sfx, 'film');
    sfx.sort((a, b) => a.t - b.t);

    Object.assign(SHOT, {
      width: Math.round(W * scale),
      height: Math.round(H * scale),
      fps,
      duration: dur,
      cuts: [...cuts].sort((a, b) => a - b),
      canvas,
      sfx,
      meta: {
        title: studio.name || document.title,
        scale,
        song: songmap ? { bpm: song.bpm, beatsPerBar: song.beatsPerBar, sections: song.sections.map(s => ({ name: s.name, label: s.label, start: s.start, end: s.end })) } : null,
        shots: list.map(s => ({ id: s.id, start: s.start, end: s.end, cut: s.cut !== false, layer: s.layer })),
        font: studio.lyricFont || studio.fonts?.[0]?.family || null,
        frames: f.sequences.map(s => ({ dir: s.dir, fps: s.fps, count: s.count, width: s.width, height: s.height })),
        warnings,
      },
    });
    for (const w of warnings) console.warn('[studio]', w);

    f.background = config.background || studio.background || '#000';
    f.post = config.post || null;
    f.label = params.get('label') === '1';
    f.labelFont = studio.lyricFont || studio.fonts?.[0]?.family || 'sans-serif';
    if (mode === 'render') {
      // Pure-function guard rails: per-frame seeded Math.random, time-driven clocks, no CSS motion.
      const seeded = { r: rng(1) };
      Math.random = () => seeded.r();
      f._reseed = frame => (seeded.r = rng(`frame:${frame}`));
      const epoch = Date.UTC(2026, 0, 1);
      window.__studioClock = performance.now.bind(performance); // the real clock, for tools
      Date.now = () => epoch + (f._t || 0) * 1000;
      performance.now = () => (f._t || 0) * 1000;
      const style = document.createElement('style');
      style.textContent = 'html,body{margin:0;padding:0;overflow:hidden;background:#000}canvas{display:block}*{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
      document.body.appendChild(canvas);
      await f.renderAsync(0);
    } else {
      const { mountPlayer } = await import(new URL('./player.js', import.meta.url).href);
      mountPlayer(f);
    }
    return true;
  })();
  SHOT.ready.catch(err => {
    console.error('[studio]', err);
    f.errors.push(err);
    if (mode !== 'render') showFatal(err);
  });

  /** Draw the frame at time t (seconds). info = { frame } from the renderer when motion blur is on. */
  f.render = (t, info = {}) => {
    const { ctx, width: W, height: H, scale } = f;
    const frame = info.frame ?? Math.round(t * f.fps);
    f._t = t;
    if (f._reseed) f._reseed(frame);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = f.background;
    ctx.fillRect(0, 0, W, H);
    const active = [];
    for (const s of f.order) if (t >= s.start && t < s.end) active.push(s);
    for (const shot of active) {
      ctx.save();
      try {
        shot.draw(ctx, shotState(shot, t, frame));
      } catch (e) {
        e.message = `shot ${shot.id} at t=${t.toFixed(3)}: ${e.message}`;
        ctx.restore();
        throw e;
      }
      ctx.restore();
    }
    if (f.post) {
      ctx.save();
      f.post(ctx, { t, frame, width: W, height: H, film: f, song: f.song, lyrics: f.lyrics, shots: active });
      ctx.restore();
    }
    if (f.label) drawLabel(ctx, t);
    return active;
  };

  /**
   * Draw the frame at t once every frame-sequence image it uses has loaded: a missing image is
   * fetched and the frame drawn again (the renderer calls this; a film without sequences draws once).
   */
  f.renderAsync = async (t, info = {}) => {
    if (!f.sequences.length) return f.render(t, info);
    f._inUse = new Set();
    try {
      for (let pass = 1; ; pass++) {
        f._pending = [];
        const active = f.render(t, info);
        const pending = f._pending;
        f._pending = null;
        if (!pending.length) return active;
        if (pass === 8) throw new Error(`t=${t.toFixed(3)}: frame-sequence images still missing after ${pass} passes (does a shot choose its clip frame from something other than t?)`);
        await Promise.all(pending);
      }
    } finally {
      f._pending = null;
      f._inUse = null;
    }
  };

  function shotState(shot, t, frame) {
    const local = t - shot.start, dur = shot.end - shot.start;
    return {
      t,
      local,
      dur,
      u: clamp(local / dur),
      start: shot.start,
      end: shot.end,
      frame,
      fps: f.fps,
      width: f.width,
      height: f.height,
      id: shot.id,
      shot,
      film: f,
      song: f.song,
      lyrics: f.lyrics,
      at: f.at,
      /** 0→1 over the first d seconds of the shot. */
      in: d => clamp(local / d),
      /** 0→1 over the last d seconds of the shot. */
      out: d => clamp((t - (shot.end - d)) / d),
    };
  }

  f.describe = t => {
    const pos = f.song.position(t);
    const sec = f.song.section(t);
    const line = f.lyrics.lineAt(t);
    const mm = Math.floor(t / 60);
    const missing = line?.text && f.fonts.families.has(f.labelFont) ? f.fonts.missing(f.labelFont, line.text) : [];
    return {
      time: `${mm}:${(t - mm * 60).toFixed(2).padStart(5, '0')}`,
      bar: `${pos.bar}.${pos.beat}`,
      section: sec ? (sec.name && sec.label && sec.name !== sec.label ? `${sec.name} ${sec.label}` : sec.name || sec.label || '') : '',
      shots: f.order.filter(s => t >= s.start && t < s.end).map(s => s.id),
      line: line?.text ? (missing.length ? `line ${line.i + 1}` : line.text) : '',
    };
  };

  function drawLabel(ctx, t) {
    const { width: W, height: H } = f;
    const h = Math.round(H * 0.12);
    const d = f.describe(t);
    ctx.save();
    ctx.setTransform(f.scale, 0, 0, f.scale, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, H - h, W, h);
    const size = Math.round(h * 0.45);
    ctx.font = fontString({ size, family: f.labelFont, weight: 600 });
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd34d';
    const head = `${d.time}  ${d.bar}  ${d.section || '-'}  ${d.shots.join('+') || '—'}`;
    ctx.fillText(head, h * 0.3, H - h / 2);
    if (d.line) {
      const x = h * 0.3 + ctx.measureText(head).width + size;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(d.line, x, H - h / 2, W - x - h * 0.3);
    }
    ctx.restore();
  }

  return f;
}

function showFatal(err) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;inset:24px;z-index:99;margin:0;padding:24px;background:#2a0d0d;color:#ffd7d7;font:14px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow:auto;border:1px solid #ff6b6b;border-radius:8px';
  box.textContent = `The film could not load.\n\n${err && err.stack ? err.stack : err}`;
  document.body.appendChild(box);
}
