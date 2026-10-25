// 藍圖 · Blueprint. White lines on blueprint paper, in two widths, and one orange kept for measured
// values. Everything is drawn by a pen, in the order a drafter works: faint construction first, the
// object line over it, then dimensions, hatching, a detail view and the title block. The demo draws
// sound: a circle divided like a clock face projects a sine wave, one period per beat, and the pen
// that draws it is the playhead.
import { clamp, drawText, ease, fbm2, fontString, lerp, rng, span, TAU, vignette } from '../../engine/studio.js';

export const PALETTE = {
  top: '#12355B', // the paper at the top of the sheet
  bottom: '#0E2A47', // and at the bottom
  line: '#E8F1FF', // every line and every letter
  value: '#FF8A3D', // measured values only: the figures of the dimensions
};
/** Two pen widths, 2:1 as in ISO 128 (0.7 and 0.35 mm); construction lines are thin, at 35%. */
export const PEN = { thick: 3.2, thin: 1.6, build: 0.35 };
const CENTRE = [32, 6, 6, 6]; // long dash, short dash: axes and centre lines
const FAMILY = 'Noto Sans TC';
const CELL = 24; // one square of the grid; every length below is a whole number of squares

// The sheet: a border 60 px in, 8 × 4 zones in the margin, the title block in the bottom-right corner.
const FRAME = [60, 60, 1860, 1020];
const ZONES = [8, 4];
const TB = [1260, 840, 1860, 1020];
// The wave: one period per beat, 12 squares long and 6 high; four beats, one bar.
const AXIS = 420, AMP = 144, LAMBDA = 288, X0 = 540, PERIODS = 4;
const CC = [300, AXIS]; // the construction circle, radius AMP, divided into 12
const DIM1 = AXIS - AMP - 72, DIM2 = DIM1 - 60; // the chain of beats, and the bar above it
// Detail A: the first quarter period (downbeat to crest, one sixteenth), drawn again at 2:1.
const DA = { at: [576, 348], r: 86, view: [576, 792], k: 2 };
const wave = x => AXIS - AMP * Math.sin((TAU * (x - X0)) / LAMBDA);
const RISE = [Math.SQRT1_2, -Math.SQRT1_2], FALL = [Math.SQRT1_2, Math.SQRT1_2]; // hatching at 45° and 135°
const GAP = 12; // hatching pitch

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Blueprint paper: the gradient, uneven exposure (computed small, scaled up), specks, two folds, the grid. */
export function paper(W, H) {
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, PALETTE.top);
  grad.addColorStop(1, PALETTE.bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Uneven exposure: clouds a little lighter and a little darker than the paper.
  const [m, mg] = canvas(240, 135);
  const img = mg.createImageData(240, 135);
  for (let y = 0; y < 135; y++) {
    for (let x = 0; x < 240; x++) {
      const v = fbm2(x / 40, y / 40, { octaves: 4, seed: 23 }), i = (y * 240 + x) * 4;
      img.data.set(v > 0 ? [150, 195, 240] : [2, 12, 26], i);
      img.data[i + 3] = clamp(Math.abs(v) * (v > 0 ? 45 : 75), 0, 255);
    }
  }
  mg.putImageData(img, 0, 0);
  g.drawImage(m, 0, 0, W, H);
  // Specks of dust and lint, mostly light.
  const r = rng('blueprint');
  for (let i = 0; i < 5000; i++) {
    g.globalAlpha = 0.03 + r() * 0.07;
    g.fillStyle = r() < 0.85 ? '#D6E6F8' : '#03101E';
    const s = r() < 0.92 ? 1 : 2;
    g.fillRect(Math.floor(r() * W), Math.floor(r() * H), s, s);
  }
  g.globalAlpha = 1;
  // Folded once each way: a crease is a worn, lighter line with a shadow on one side.
  for (const vertical of [true, false]) {
    const [x, y, w, h] = vertical ? [W / 2 - 1, 0, 16, H] : [0, H / 2 - 1, W, 16];
    const cg = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, 'rgba(214,230,248,0.16)');
    cg.addColorStop(0.12, 'rgba(214,230,248,0)');
    cg.addColorStop(0.16, 'rgba(3,13,24,0.22)');
    cg.addColorStop(1, 'rgba(3,13,24,0)');
    g.fillStyle = cg;
    g.fillRect(x, y, w, h);
  }
  // The grid, inside the border: a square every 24 px and a heavier line every five.
  const [x0, y0, x1, y1] = FRAME;
  g.fillStyle = PALETTE.line;
  for (let x = x0; x <= x1; x += CELL) {
    g.globalAlpha = (x - x0) % (5 * CELL) ? 0.06 : 0.12;
    g.fillRect(x, y0, 1, y1 - y0);
  }
  for (let y = y0; y <= y1; y += CELL) {
    g.globalAlpha = (y - y0) % (5 * CELL) ? 0.06 : 0.12;
    g.fillRect(x0, y, x1 - x0, 1);
  }
  g.globalAlpha = 1;
  vignette(g, { amount: 0.32, inner: 0.55, color: '#030D18', width: W, height: H });
  return c;
}

/** Set the pen: 'thick' for the object, 'thin' for everything else, 'build' for construction, 'centre' for axes. */
function pen(g, kind = 'thin') {
  g.lineWidth = kind === 'thick' ? PEN.thick : PEN.thin;
  g.strokeStyle = g.fillStyle = PALETTE.line;
  g.globalAlpha = kind === 'build' ? PEN.build : 1;
  g.setLineDash(kind === 'centre' ? CENTRE : []);
  g.lineCap = g.lineJoin = 'round';
}

/** A straight line from a to b, drawn for u of its length. */
function seg(g, ax, ay, bx, by, u = 1) {
  if (u <= 0) return;
  u = Math.min(1, u);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(lerp(ax, bx, u), lerp(ay, by, u));
  g.stroke();
}

/** A polyline with its length measured, for trace(). */
export function path(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

/** Draw a path() from its first point for u of its length: the pen stops where the line stops. */
export function trace(g, p, u) {
  if (u <= 0) return;
  const d = p.len * Math.min(1, u);
  g.beginPath();
  g.moveTo(...p.pts[0]);
  for (let i = 1; i < p.pts.length; i++) {
    if (p.cum[i] <= d) {
      g.lineTo(...p.pts[i]);
      continue;
    }
    const k = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1]);
    g.lineTo(lerp(p.pts[i - 1][0], p.pts[i][0], k), lerp(p.pts[i - 1][1], p.pts[i][1], k));
    break;
  }
  g.stroke();
}

function measure(g, text, size, spacing = 0) {
  g.save();
  g.font = fontString({ size, family: FAMILY, weight: 500 });
  g.letterSpacing = `${spacing * size}px`;
  const w = g.measureText(text).width;
  g.restore();
  return w - spacing * size; // no tracking after the last letter
}

/**
 * Text lettered one character at a time from t0, `rate` characters a second. Each character lands
 * where the finished line puts it, so centred and right-aligned text does not slide.
 */
export function letter(g, text, x, y, t, t0, { size = 24, spacing = 0, fill = PALETTE.line, align = 'left', rate = 30 } = {}) {
  if (t < t0) return;
  const chars = [...text], n = Math.min(chars.length, 1 + Math.floor((t - t0) * rate + 1e-6));
  const w = align === 'left' ? 0 : measure(g, text, size, spacing);
  g.globalAlpha = 1;
  drawText(g, chars.slice(0, n).join(''), align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y, { size, family: FAMILY, weight: 500, spacing, fill });
}

/** A closed, filled arrowhead with its tip at (x, y), pointing along (dx, dy). 30° included angle. */
function arrow(g, x, y, dx, dy, L = 16) {
  const w = L * Math.tan(Math.PI / 12);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - dx * L - dy * w, y - dy * L + dx * w);
  g.lineTo(x - dx * L + dy * w, y - dy * L - dx * w);
  g.closePath();
  g.fill();
}

/**
 * A horizontal dimension between x1 and x2 on the line y. The line grows out from its middle, the
 * arrowheads land when it reaches the extension lines, and the value is lettered above it in orange,
 * first character at t0 + 0.1. `cx` moves the value off the middle when a line runs through it.
 */
export function dimension(g, x1, x2, y, value, t, t0, { cx = (x1 + x2) / 2, size = 24 } = {}) {
  if (t < t0) return;
  const u = ease.cubicOut(span(t, t0, t0 + 0.1)), xm = (x1 + x2) / 2, h = ((x2 - x1) / 2) * u;
  pen(g, 'thin');
  seg(g, xm - h, y, xm + h, y);
  if (u >= 1) {
    arrow(g, x1, y, -1, 0);
    arrow(g, x2, y, 1, 0);
  }
  letter(g, value, cx, y - 9, t, t0 + 0.1, { size, fill: PALETTE.value, align: 'center', rate: 60 });
}

/**
 * Hatching: parallel lines `gap` apart along `dir` (a unit vector), clipped to where inside(x, y)
 * holds within the box. Lines in the same direction line up from one region to the next.
 * Returns [x1, y1, x2, y2] segments, left end first.
 */
export function hatch(inside, [bx0, by0, bx1, by1], dir, gap = GAP) {
  const [dx, dy] = dir, nx = -dy, ny = dx, out = [];
  const cs = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]].map(([x, y]) => nx * x + ny * y);
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, R = Math.hypot(bx1 - bx0, by1 - by0) / 2;
  for (let c = Math.ceil(Math.min(...cs) / gap) * gap; c <= Math.max(...cs); c += gap) {
    const k = c - (nx * cx + ny * cy), px = cx + k * nx, py = cy + k * ny;
    let a = null, b = null;
    for (let s = -R; s <= R; s += 0.5) {
      if (!inside(px + s * dx, py + s * dy)) continue;
      if (a === null) a = s;
      b = s;
    }
    if (a !== null && b - a > 3) out.push([px + a * dx, py + a * dy, px + b * dx, py + b * dy]);
  }
  return out;
}

/** Hatch lines swept on from left to right: each starts when the sweep reaches its middle. */
function sweepHatch(g, segs, t, t0, dur, x0, x1, each = 0.06) {
  pen(g, 'thin');
  g.beginPath();
  for (const [ax, ay, bx, by] of segs) {
    const ts = t0 + (dur * ((ax + bx) / 2 - x0)) / (x1 - x0), u = span(t, ts, ts + each);
    if (u <= 0) continue;
    g.moveTo(ax, ay);
    g.lineTo(lerp(ax, bx, u), lerp(ay, by, u));
  }
  g.stroke();
}

/** The part of segment a→b inside a circle, or null. */
function clip([ax, ay, bx, by], [cx, cy], r) {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r, D = B * B - 4 * A * C;
  if (D <= 0) return null;
  const s = Math.sqrt(D), t1 = Math.max(0, (-B - s) / (2 * A)), t2 = Math.min(1, (-B + s) / (2 * A));
  return t2 > t1 ? [ax + t1 * dx, ay + t1 * dy, ax + t2 * dx, ay + t2 * dy] : null;
}

function ring(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
}

/** A circle drawn by a compass from angle a0 (canvas angles, clockwise), u of the way round. */
function compass(g, x, y, r, a0, u) {
  if (u <= 0) return;
  g.beginPath();
  g.arc(x, y, r, a0, a0 + TAU * Math.min(1, u));
  g.stroke();
}

/** The same, the other way round: the construction circle turns like the angle it measures. */
function compassCCW(g, x, y, r, u) {
  if (u <= 0) return;
  g.beginPath();
  g.arc(x, y, r, 0, -TAU * Math.min(1, u), true);
  g.stroke();
}

export function blueprint({ song, width: W, height: H }) {
  const T = (...a) => song.T(...a);
  const PAPER = paper(W, H);
  /** Put the paper back under lettering: lines stop short of the letters, as on a drawing. */
  const knock = (g, x, y, w, h) => {
    g.globalAlpha = 1;
    g.drawImage(PAPER, x, y, w, h, x, y, w, h);
  };

  const beatAt = t => song.beatAt(t);
  const secs = (a, b, digits = 2) => `${(b - a).toFixed(digits)} s`;
  const xs = Array.from({ length: PERIODS + 1 }, (_, k) => X0 + k * LAMBDA); // the downbeats on the sheet
  const at = {
    frame: T(1, 1),
    axis: T(1, 2),
    circle: T(1, 3),
    project: T(1, 4),
    pen: [T(2, 1), T(3, 1)],
    ext: xs.map((_, k) => T(2, 1 + k)), // an extension line on every downbeat the pen reaches
    chain: [0, 1, 2, 3].map(j => T(2, 2 + j)), // and a dimension for the beat it has just drawn
    bar: T(3, 1, 3),
    hatch: T(3, 2),
    notes: [T(3, 3), T(3, 3, 3)],
    callout: T(3, 4),
    view: T(3, 4, 3),
    value: T(4, 1),
    block: T(4, 2),
    rows: [T(4, 2), T(4, 3), T(4, 4)],
  };

  // ── The sheet: the border, drawn as two strokes from the top-left corner that meet in the
  // bottom-right one; zone marks, labels and centring marks land as the pen passes them.
  const [fx0, fy0, fx1, fy1] = FRAME;
  const fw = fx1 - fx0, fh = fy1 - fy0, zw = fw / ZONES[0], zh = fh / ZONES[1];
  const border = [path([[fx0, fy0], [fx1, fy0], [fx1, fy1]]), path([[fx0, fy0], [fx0, fy1], [fx1, fy1]])];
  const marks = []; // { s: stroke, d: distance along it, tick: [x1, y1, x2, y2], thick, label: [text, x, y] }
  for (let i = 1; i < ZONES[0]; i++) {
    const x = fx0 + i * zw, centre = i === ZONES[0] / 2;
    marks.push({ s: 0, d: x - fx0, tick: [x, fy0, x, centre ? 10 : fy0 - 14], thick: centre });
    marks.push({ s: 1, d: fh + x - fx0, tick: [x, fy1, x, centre ? H - 10 : fy1 + 14], thick: centre });
  }
  for (let j = 1; j < ZONES[1]; j++) {
    const y = fy0 + j * zh, centre = j === ZONES[1] / 2;
    marks.push({ s: 1, d: y - fy0, tick: [fx0, y, centre ? 10 : fx0 - 14, y], thick: centre });
    marks.push({ s: 0, d: fw + y - fy0, tick: [fx1, y, centre ? W - 10 : fx1 + 14, y], thick: centre });
  }
  for (let i = 0; i < ZONES[0]; i++) {
    const x = fx0 + (i + 0.5) * zw;
    marks.push({ s: 0, d: x - fx0, label: [String(i + 1), x, fy0 / 2 + 7] });
    marks.push({ s: 1, d: fh + x - fx0, label: [String(i + 1), x, (H + fy1) / 2 + 7] });
  }
  for (let j = 0; j < ZONES[1]; j++) {
    const y = fy0 + (j + 0.5) * zh + 7, name = 'ABCD'[j];
    marks.push({ s: 1, d: y - fy0, label: [name, fx0 / 2, y] });
    marks.push({ s: 0, d: fw + y - fy0, label: [name, (W + fx1) / 2, y] });
  }
  function sheet(g, t) {
    const u = ease.quadInOut(span(t, at.frame, at.frame + 0.45));
    if (u <= 0) return;
    pen(g, 'thick');
    for (const b of border) trace(g, b, u);
    for (const m of marks) {
      if (m.d > u * border[m.s].len) continue;
      if (m.tick) {
        pen(g, m.thick ? 'thick' : 'thin');
        seg(g, ...m.tick);
      } else letter(g, m.label[0], m.label[1], m.label[2], t, at.frame, { size: 18, align: 'center' });
    }
  }

  // ── Construction: the axis and the circle's centre line, the circle divided into twelve, a
  // vertical every twelfth of a beat, and the division points projected across to them.
  const [ccx, ccy] = CC;
  const P = Array.from({ length: 13 }, (_, k) => [ccx + AMP * Math.cos((k * TAU) / 12), ccy - AMP * Math.sin((k * TAU) / 12)]);
  const vx = P.map((_, k) => X0 + (k * LAMBDA) / 12);
  const diameters = [1, 2, 4, 5].map(k => {
    const dx = Math.cos((k * TAU) / 12), dy = -Math.sin((k * TAU) / 12), e = AMP + 12;
    return { k, line: [ccx - dx * e, ccy - dy * e, ccx + dx * e, ccy + dy * e] };
  });
  const projected = P.map((_, k) => k % 6 !== 0); // 0, 6 and 12 lie on the axis already
  const axisLine = [ccx - AMP - 24, AXIS, xs[PERIODS] + 72, AXIS];
  const centreLine = [ccx, ccy - AMP - 24, ccx, ccy + AMP + 24];
  const vTop = AXIS - AMP - 12, vBottom = AXIS + AMP + 12;
  const tProject = k => at.project + k * 0.025;
  function construction(g, t) {
    pen(g, 'centre');
    seg(g, ...axisLine, ease.sineInOut(span(t, at.axis, at.axis + 0.4)));
    seg(g, ...centreLine, ease.sineInOut(span(t, at.axis, at.axis + 0.3)));
    pen(g, 'build');
    compassCCW(g, ccx, ccy, AMP, ease.sineInOut(span(t, at.circle, at.circle + 0.35)));
    const swept = 12 * ease.sineInOut(span(t, at.circle, at.circle + 0.35));
    for (const { k, line } of diameters) {
      const t0 = at.circle + (0.35 * k) / 12;
      if (swept >= k) seg(g, ...line, span(t, t0, t0 + 0.08));
    }
    for (let k = 0; k <= 12; k++) {
      const t0 = tProject(k);
      seg(g, vx[k], vTop, vx[k], vBottom, span(t, t0, t0 + 0.12));
      if (projected[k]) seg(g, P[k][0], P[k][1], vx[k] + 12, P[k][1], span(t, t0, t0 + 0.12));
    }
    pen(g, 'thin');
    for (let k = 0; k <= 12; k++) if (t >= tProject(k) + 0.12) ring(g, vx[k], wave(vx[k]), 4);
  }
  // ── The object: the sine, drawn by a pen that moves one period per beat.
  const curve = Array.from({ length: (PERIODS * LAMBDA) / 2 + 1 }, (_, i) => [X0 + 2 * i, wave(X0 + 2 * i)]);
  const beat0 = beatAt(at.pen[0]);
  const penX = t => X0 + LAMBDA * clamp(beatAt(t) - beat0, 0, PERIODS);
  function object(g, t) {
    if (t < at.pen[0]) return;
    const xe = penX(t);
    pen(g, 'thick');
    g.beginPath();
    g.moveTo(...curve[0]);
    for (const p of curve) {
      if (p[0] > xe) break;
      g.lineTo(...p);
    }
    g.lineTo(xe, wave(xe));
    g.stroke();
  }

  // ── Dimensions: a chain of beats as the pen reaches each downbeat, then the bar above it.
  function dimensions(g, t) {
    pen(g, 'thin');
    xs.forEach((x, k) => {
      const t0 = at.ext[k], long = k === 0 || k === PERIODS;
      const u = ease.cubicOut(span(t, t0, t0 + 0.1));
      seg(g, x, AXIS - 8, x, DIM1 - 10, u);
      if (long && u >= 1) seg(g, x, DIM1 - 10, x, DIM2 - 10, ease.cubicOut(span(t, at.bar - 0.08, at.bar)));
    });
    at.chain.forEach((t0, j) => dimension(g, xs[j], xs[j + 1], DIM1, secs(at.ext[j], at.ext[j + 1]), t, t0));
    dimension(g, xs[0], xs[PERIODS], DIM2, secs(at.ext[0], at.ext[PERIODS]), t, at.bar);
  }

  // ── Section: the wave as a solid, cut; compressions hatched one way, rarefactions the other.
  const lobes = Array.from({ length: PERIODS * 2 }, (_, j) => {
    const xa = X0 + (j * LAMBDA) / 2, xb = xa + LAMBDA / 2, up = j % 2 === 0;
    const inside = (x, y) => x > xa && x < xb && (up ? y > wave(x) && y < AXIS : y < wave(x) && y > AXIS);
    return hatch(inside, [xa, up ? AXIS - AMP : AXIS, xb, up ? AXIS : AXIS + AMP], up ? RISE : FALL);
  }).flat();

  // ── Leader notes: a dot on the area, a leader, a short shoulder, the words on the shoulder.
  const NOTES = [
    { dot: [900, 372], bend: [972, 648], zh: '密部', en: 'COMPRESSION' },
    { dot: [1332, 468], bend: [1404, 648], zh: '疏部', en: 'RAREFACTION' },
  ];
  function notes(g, t) {
    NOTES.forEach((n, i) => {
      const t0 = at.notes[i];
      if (t < t0) return;
      pen(g, 'thin');
      g.beginPath();
      g.arc(...n.dot, 4, 0, TAU);
      g.fill();
      seg(g, ...n.dot, ...n.bend, ease.cubicOut(span(t, t0, t0 + 0.12)));
      seg(g, ...n.bend, n.bend[0] + 24, n.bend[1], span(t, t0 + 0.12, t0 + 0.16));
      const x = n.bend[0] + 34, y = n.bend[1] + 8;
      letter(g, n.zh, x, y, t, t0 + 0.16, { size: 24 });
      letter(g, n.en, x + measure(g, n.zh, 24) + 12, y - 1, t, t0 + 0.22, { size: 16, spacing: 0.12, rate: 60 });
    });
  }

  // ── Detail A: a circle and a letter on the drawing, and the same geometry again at 2:1 below it,
  // drawn with the same pens (line widths and hatching pitch do not scale), with its own dimension.
  const [dcx, dcy] = DA.at, [vcx, vcy] = DA.view, VR = DA.r * DA.k;
  const toView = (x, y) => [vcx + DA.k * (x - dcx), vcy + DA.k * (y - dcy)];
  const toSheet = (x, y) => [dcx + (x - vcx) / DA.k, dcy + (y - vcy) / DA.k];
  const viewLine = ([ax, ay, bx, by]) => clip([...toView(ax, ay), ...toView(bx, by)], DA.view, VR);
  const view = {
    axis: viewLine(axisLine),
    build: [
      ...vx.map(x => viewLine([x, vTop, x, vBottom])),
      ...P.map(([px, py], k) => (projected[k] ? viewLine([px, py, vx[k] + 12, py]) : null)),
    ].filter(Boolean),
    points: vx.map(x => toView(x, wave(x))).filter(([x, y]) => Math.hypot(x - vcx, y - vcy) < VR - 6),
    curve: curve.map(p => toView(...p)).filter(([x, y]) => Math.hypot(x - vcx, y - vcy) < VR - 1),
    hatch: hatch((x, y) => {
      if (Math.hypot(x - vcx, y - vcy) >= VR - 1) return false;
      const [sx, sy] = toSheet(x, y);
      return sx > X0 && sx < X0 + LAMBDA / 2 && sy > wave(sx) && sy < AXIS;
    }, [vcx - VR, vcy - VR, vcx + VR, vcy + VR], RISE),
  };
  const [zx, zy] = toView(X0, AXIS), [kx, ky] = toView(X0 + LAMBDA / 4, AXIS - AMP); // downbeat, crest
  const vDim = vcy + 40; // above the axis, clear of the arrowheads where the curve leaves the downbeat
  const vValue = vcx + 26; // right of the curve, between it and the crest's extension line
  const calloutAt = -0.22 * Math.PI; // where the compass starts, and where the letter A sits
  function detail(g, t) {
    if (t < at.callout) return;
    // The callout on the drawing, its letter, and a leader down to the view.
    pen(g, 'thin');
    compass(g, dcx, dcy, DA.r, calloutAt, ease.sineInOut(span(t, at.callout, at.callout + 0.12)));
    if (t >= at.callout + 0.1) {
      const lx = dcx + (DA.r + 22) * Math.cos(calloutAt), ly = dcy + (DA.r + 22) * Math.sin(calloutAt) + 9;
      knock(g, lx - 12, ly - 22, 24, 28);
      letter(g, 'A', lx, ly, t, at.callout + 0.1, { size: 26, align: 'center' });
    }
    pen(g, 'thin');
    seg(g, dcx, dcy + DA.r, vcx, vcy - VR, ease.cubicOut(span(t, at.callout + 0.12, at.view)));
    if (t < at.view) return;
    // The view: the boundary in two strokes from where the leader lands, meeting at the bottom;
    // then construction, curve, hatching and points inside it, and the dimension.
    const tv = at.view, ua = ease.sineInOut(span(t, tv, tv + 0.12)) / 2;
    compass(g, vcx, vcy, VR, -Math.PI / 2, ua);
    compass(g, vcx, vcy, VR, -Math.PI / 2 - TAU * ua, ua);
    const ub = ease.cubicOut(span(t, tv + 0.08, tv + 0.14));
    pen(g, 'build');
    for (const l of view.build) seg(g, ...l, ub);
    pen(g, 'centre');
    if (view.axis) seg(g, ...view.axis, ub);
    sweepHatch(g, view.hatch, t, tv + 0.14, 0.08, zx, kx + 72, 0.04);
    const xe = lerp(zx, vcx + VR, span(t, tv + 0.1, tv + 0.2));
    if (t >= tv + 0.1) {
      pen(g, 'thick');
      g.beginPath();
      g.moveTo(...view.curve[0]);
      for (const p of view.curve) {
        if (p[0] > xe) break;
        g.lineTo(...p);
      }
      g.stroke();
    }
    pen(g, 'thin');
    for (const [x, y] of view.points) if (t >= tv + 0.12) ring(g, x, y, 4);
    const ue = ease.cubicOut(span(t, tv + 0.15, tv + 0.21));
    seg(g, zx, zy - 8, zx, vDim - 10, ue);
    seg(g, kx, ky + 8, kx, vDim + 10, ue);
    if (t >= at.value) {
      const w = measure(g, '0.125 s', 24);
      knock(g, vValue - w / 2 - 6, vDim - 9 - 22, w + 12, 28);
    }
    dimension(g, zx, kx, vDim, secs(at.pen[0], T(2, 1, 2), 3), t, at.value - 0.1, { cx: vValue });
    // The label under the view.
    const zhLabel = '細部 A　比例 2:1', enLabel = 'DETAIL A · SCALE 2:1';
    const wz = measure(g, zhLabel, 20), we = measure(g, enLabel, 14, 0.12), lx = vcx - (wz + 16 + we) / 2, ly = vcy + VR + 32;
    letter(g, zhLabel, lx, ly, t, at.value + 0.12, { size: 20 });
    letter(g, enLabel, lx + wz + 16, ly - 1, t, at.value + 0.12 + 9 / 30, { size: 14, spacing: 0.12, rate: 60 });
  }

  // ── The title block, in the corner of the border: its rules first, then one row a beat.
  const [tx0, ty0, tx1, ty1] = TB;
  const blockEdge = path([[tx1, ty0], [tx0, ty0], [tx0, ty1]]);
  const rules = [[tx0, 924, tx1, 924], [tx0, 972, tx1, 972], [1560, 924, 1560, ty1], [1710, 972, 1710, ty1]];
  const label = (g, text, x, y, t, t0) => letter(g, text, x, y, t, t0, { size: 12, spacing: 0.12, rate: 40 });
  const valueAt = (g, text, x, y, t, t0, size = 22) => letter(g, text, x, y, t, t0, { size, align: 'right', rate: 30 });
  function titleBlock(g, t) {
    if (t < at.block) return;
    pen(g, 'thick');
    trace(g, blockEdge, ease.cubicOut(span(t, at.block, at.block + 0.18)));
    pen(g, 'thin');
    for (const r of rules) seg(g, ...r, ease.cubicOut(span(t, at.block + 0.1, at.block + 0.22)));
    const [r1, r2, r3] = at.rows;
    label(g, '圖名 TITLE', tx0 + 12, ty0 + 22, t, r1 + 0.2);
    letter(g, '把聲音畫成圖', tx0 + 12, ty0 + 70, t, r1 + 0.24, { size: 40, rate: 24 });
    letter(g, 'DRAWING SOUND', tx1 - 12 - measure(g, 'DRAWING SOUND', 18, 0.12), ty0 + 70, t, r1 + 0.32, { size: 18, spacing: 0.12, rate: 40 });
    label(g, '速度 TEMPO', tx0 + 12, 944, t, r2);
    valueAt(g, `${Math.round(song.bpm)} BPM`, 1548, 962, t, r2 + 0.08);
    label(g, '比例 SCALE', 1572, 944, t, r2 + 0.04);
    valueAt(g, '1 拍 = 12 格', tx1 - 12, 962, t, r2 + 0.12);
    label(g, '圖號 DWG NO.', tx0 + 12, 992, t, r3);
    valueAt(g, 'MV-001', 1548, 1010, t, r3 + 0.08);
    label(g, '單位 UNIT', 1572, 992, t, r3 + 0.04);
    valueAt(g, '秒 s', 1698, 1010, t, r3 + 0.12);
    label(g, '張 SHEET', 1722, 992, t, r3 + 0.08);
    valueAt(g, '1/1', tx1 - 12, 1010, t, r3 + 0.2);
  }

  return {
    id: 'blueprint',
    start: 0,
    end: song.duration,
    draw(g, { t }) {
      g.drawImage(PAPER, 0, 0, W, H);
      sheet(g, t);
      construction(g, t);
      sweepHatch(g, lobes, t, at.hatch, 0.36, X0, xs[PERIODS]);
      object(g, t);
      dimensions(g, t);
      notes(g, t);
      detail(g, t);
      titleBlock(g, t);
      g.globalAlpha = 1;
      g.setLineDash([]);
    },
  };
}
