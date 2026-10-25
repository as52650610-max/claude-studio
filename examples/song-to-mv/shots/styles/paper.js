// 剪紙 · Paper cutout. A set built from pieces of coloured paper on a sheet of kraft: every piece is
// cut by hand (its edge wanders a little), lies at its own height (its shadow says how high) and
// is moved by hand twelve times a second (it never sits exactly where it sat a frame ago). Depth
// comes from shadows and from parallax, never from shading. The demo builds the set on the first
// four beats, hangs the title on tags in bar 2, sails past a lighthouse in bar 3 and, in bar 4,
// covers it all with an orange sheet and cuts a window in it.
import { drawText, ease, lerp, noise1, rng, span, stepTime, TAU } from '../../engine/studio.js';

export const PALETTE = { kraft: '#E8D8B8', teal: '#2F4858', orange: '#F26B38', mustard: '#F7C548', sage: '#A3C4BC' };
const FAMILY = 'Noto Sans TC';
const FPS = 12; // moved by hand: everything changes on twelves
const step = t => Math.floor(t * FPS + 1e-6);
// Stepped moves, one value per print-frame (1/12 s), as fractions of the distance still to go.
const ENTER = [0.55, 0.16, -0.035, 0]; // slides in, overshoots a hair, settles
const DROP = [-0.45, 0.07, -0.025, 0]; // drops from above, bounces, settles
const POP = [0.4, 1.15, 0.95, 1]; // scale
const frameOf = (table, t, t0) => (t < t0 ? null : table[Math.min(step(t - t0), table.length - 1)]);

/** A tileable paper texture: soft mottling and a few fibres, as an N px pattern tile. */
export function paperTile(seed = 'paper', N = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), r = rng(seed);
  // periodic value noise, three octaves, so the tile repeats without a seam
  const octaves = [8, 16, 32].map(n => ({ n, v: Float32Array.from({ length: n * n }, () => r()) }));
  const at = ({ n, v }, x, y) => {
    const fx = (x / N) * n, fy = (y / N) * n, ix = Math.floor(fx), iy = Math.floor(fy);
    const sx = fx - ix, sy = fy - iy, ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    const p = (i, j) => v[((j + n) % n) * n + ((i + n) % n)];
    return lerp(lerp(p(ix, iy), p(ix + 1, iy), ux), lerp(p(ix, iy + 1), p(ix + 1, iy + 1), ux), uy);
  };
  for (let y = 0, i = 0; y < N; y++)
    for (let x = 0; x < N; x++, i += 4) {
      const m = 0.55 * at(octaves[0], x, y) + 0.3 * at(octaves[1], x, y) + 0.15 * at(octaves[2], x, y);
      img.data[i + 3] = 255 * (0.02 + 0.07 * m + 0.03 * r()); // black, a few per cent: mottling and tooth
    }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let k = 0; k < 260; k++) {
    const x = r() * N, y = r() * N, a = r() * TAU, len = 6 + 18 * r(), light = r() < 0.6;
    g.strokeStyle = light ? 'rgb(255 255 255 / 0.11)' : 'rgb(0 0 0 / 0.07)';
    g.lineWidth = 0.6 + r() * 0.8;
    for (const ox of [-N, 0, N]) // draw across the seams so fibres wrap
      for (const oy of [-N, 0, N]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a) * len * 0.5 + 2, y + oy + Math.sin(a) * len * 0.5 - 2, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
  }
  return c;
}

/**
 * Cut a closed outline the way scissors do: resample it every `every` px into short straight cuts
 * and push each point off the line by up to `jitter` px. Returns a Path2D.
 */
export function cut(points, { jitter = 1.1, every = 9, seed = 0 } = {}) {
  const p = new Path2D();
  let s = 0, first = true;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, k = Math.max(1, Math.round(len / every));
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let j = 0; j < k; j++) {
      const u = j / k, d = jitter * noise1((s + u * len) / 23, seed);
      const x = lerp(x0, x1, u) + nx * d, y = lerp(y0, y1, u) + ny * d;
      if (first) p.moveTo(x, y);
      else p.lineTo(x, y);
      first = false;
    }
    s += len;
  }
  p.closePath();
  return p;
}

const bbox = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
};

/** How high a piece lies: its shadow's offset, blur and darkness. */
const LIFT = {
  low: { dx: 4, dy: 6, blur: 6, alpha: 0.24 },
  mid: { dx: 6, dy: 8, blur: 8, alpha: 0.28 },
  high: { dx: 9, dy: 12, blur: 10, alpha: 0.3 },
  top: { dx: 14, dy: 18, blur: 14, alpha: 0.32 },
};

/**
 * A paper piece: the path filled with colour and paper texture, an edge that catches the light, and
 * a soft shadow of the same shape, as blurred as its `lift` says. Built once (drawing it is two
 * drawImage calls); `decorate(g)` draws on top in the piece's own coordinates (glued-on type).
 */
export function piece(path, [x, y, w, h], { fill, tile, lift = 'mid', rule = 'nonzero', seed = 0, decorate } = {}) {
  const blur = LIFT[lift].blur, pad = Math.ceil(blur * 2.5) + 4;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w + 2 * pad);
    c.height = Math.ceil(h + 2 * pad);
    return c;
  };
  const img = make(), g = img.getContext('2d');
  g.translate(pad - x, pad - y);
  g.fillStyle = fill;
  g.fill(path, rule);
  g.globalCompositeOperation = 'source-atop';
  const pat = g.createPattern(tile, 'repeat'), r = rng(`tile:${seed}`);
  pat.setTransform(new DOMMatrix().translate(Math.floor(r() * tile.width), Math.floor(r() * tile.height)));
  g.fillStyle = pat;
  g.fillRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
  g.strokeStyle = 'rgb(255 255 255 / 0.3)'; // the cut edge catches the light
  g.lineWidth = 2.2;
  g.stroke(path);
  g.globalCompositeOperation = 'source-over';
  if (decorate) decorate(g);
  const shadow = make(), sg = shadow.getContext('2d');
  sg.filter = `blur(${blur}px)`;
  sg.translate(pad - x, pad - y);
  sg.fillStyle = '#000';
  sg.fill(path, rule);
  return { img, shadow, x: x - pad, y: y - pad, w, h, lift };
}

/**
 * Draw a piece at (dx, dy), turned by `rot` about `pivot`, with the hand-placed shiver of print
 * frame step(t): up to 0.6 px and, for small pieces, a fifth of a degree.
 */
function place(ctx, pc, { dx = 0, dy = 0, rot = 0, pivot = [0, 0], scale = 1, id = '', t = 0 } = {}) {
  const j = rng(`hand:${id}:${step(t)}`), wob = (0.0035 * Math.min(1, 220 / Math.max(pc.w, pc.h))) * j.range(-1, 1);
  ctx.save();
  ctx.translate(dx + j.range(-0.6, 0.6) + pivot[0], dy + j.range(-0.6, 0.6) + pivot[1]);
  // the shadow does not turn with the piece: the light stays where it is
  const draw = (img, ox, oy) => {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(rot + wob);
    ctx.scale(scale, scale);
    ctx.drawImage(img, pc.x - pivot[0], pc.y - pivot[1]);
    ctx.restore();
  };
  const L = LIFT[pc.lift];
  ctx.globalAlpha = L.alpha;
  draw(pc.shadow, L.dx, L.dy);
  ctx.globalAlpha = 1;
  draw(pc.img, 0, 0);
  ctx.restore();
}

const circlePts = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU)]);
function ridgePts(x0, x1, base, amp, seed, bottom) {
  const pts = [];
  for (let x = x0; x <= x1; x += 8) pts.push([x, base - amp * (0.7 * noise1(x / 380, seed) + 0.3 * noise1(x / 150, seed + 7))]);
  return [...pts, [x1, bottom], [x0, bottom]];
}
/** Scalloped waves: a row of half-circle bumps along `top`. */
function scallopPts(x0, x1, top, w, h, bottom) {
  const pts = [];
  for (let x = x0; x <= x1; x += 6) {
    const u = ((x - x0) / w) % 1;
    pts.push([x, top - h * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))]);
  }
  return [...pts, [x1, bottom], [x0, bottom]];
}
/** A cloud: bumps (dx, r) on a flat bottom at (x, y). */
function cloudPts(x, y, bumps) {
  const x0 = x + Math.min(...bumps.map(([d, r]) => d - r)), x1 = x + Math.max(...bumps.map(([d, r]) => d + r)), pts = [];
  for (let xx = x0; xx <= x1; xx += 5) pts.push([xx, y - Math.max(0, ...bumps.map(([d, r]) => Math.sqrt(Math.max(0, r * r - (xx - x - d) ** 2)) - 0.35 * r))]);
  return [...pts, [x1, y], [x0, y]];
}
const starPts = (n, r0, r1) => Array.from({ length: 2 * n }, (_, i) => [(i % 2 ? r0 : r1) * Math.cos((i / (2 * n)) * TAU), (i % 2 ? r0 : r1) * Math.sin((i / (2 * n)) * TAU)]);

export function paperCutout({ song, width: W, height: H }) {
  const T = (...a) => song.T(...a);
  const C = PALETTE, tile = paperTile();
  // How far the near layer travels: in bar 3 on screen, then in bar 4 under the orange sheet, so
  // that the window opens on the boat arriving at the lighthouse.
  const PAN = [700, 300], REACH = PAN[0] + PAN[1];
  const at = {
    far: T(1, 1), near: T(1, 2), sun: T(1, 2), waves: T(1, 3), boat: T(1, 4),
    tags: [T(2, 1), T(2, 2), T(2, 3), T(2, 4), T(2, 4, 3)],
    strip: T(3, 1), pan: [[T(3, 1), T(4, 1)], [T(4, 1), T(4, 4)]],
    sheet: T(4, 1), cut: [T(4, 2), T(4, 4)], fall: T(4, 4),
  };
  let n = 0;
  const P = (pts, fill, lift, opts = {}) => {
    const seed = ++n;
    return piece(cut(pts, { seed, ...opts.cut }), bbox(pts), { fill, tile, lift, seed, ...opts });
  };

  // The set, back to front. Each layer has a depth: how much of the camera's travel it follows.
  const sun = { at: [1480, 290], rays: P(starPts(14, 128, 176), C.orange, 'low'), disc: P(circlePts(0, 0, 112), C.mustard, 'mid') };
  const clouds = [
    { at: [420, 210], pc: P(cloudPts(0, 0, [[-70, 46], [-10, 66], [62, 50], [118, 34]]), C.sage, 'low') },
    { at: [1150, 150], pc: P(cloudPts(0, 0, [[-48, 34], [8, 50], [62, 36]]), C.sage, 'low') },
  ];
  const far = P(ridgePts(-60, W + 0.3 * REACH + 120, 565, 80, 3, H + 40), C.sage, 'low');
  const near = P(ridgePts(-60, W + 0.6 * REACH + 120, 692, 64, 11, H + 40), C.teal, 'mid');
  // the lighthouse on its rock, off to the right until the boat sails to it
  const LX = 1300 + REACH;
  const tower = (y0, y1) => [[LX - 48 + (16 * (812 - y0)) / 252, y0], [LX + 48 - (16 * (812 - y0)) / 252, y0], [LX + 48 - (16 * (812 - y1)) / 252, y1], [LX - 48 + (16 * (812 - y1)) / 252, y1]];
  const island = [
    P([...ridgePts(LX - 190, LX + 190, 832, 30, 5, 1000).slice(0, -2).map(([x, y]) => [x, y + 0.004 * (x - LX) ** 2 - 20]), [LX + 190, 1000], [LX - 190, 1000]], C.sage, 'mid'),
    P(tower(812, 560), C.kraft, 'mid'),
    ...[[630, 602], [700, 672], [770, 742]].map(([a, b]) => P(tower(a, b), C.orange, 'low', { cut: { jitter: 0.7 } })),
    P([[LX - 48, 552], [LX + 48, 552], [LX + 48, 562], [LX - 48, 562]], C.teal, 'low', { cut: { jitter: 0.5 } }),
    P([[LX - 34, 510], [LX + 34, 510], [LX + 34, 552], [LX - 34, 552]], C.mustard, 'low'),
    P([[LX - 50, 512], [LX + 50, 512], [LX, 462]], C.teal, 'mid'),
  ];
  const waves = [
    { pc: P(scallopPts(-60, W + REACH + 120, 808, 150, 24, H + 40), C.sage, 'mid'), delay: 0 },
    { pc: P(scallopPts(-120, W + REACH + 60, 884, 130, 22, H + 40), C.teal, 'mid'), delay: 1 },
    { pc: P(scallopPts(-90, W + REACH + 90, 968, 170, 26, H + 40), C.sage, 'high'), delay: 2 },
  ];
  // the boat: a folded paper boat, its sail in two tones where the paper is folded; it rides
  // between the first two strips of waves
  const boat = {
    at: [760, 806],
    parts: [
      P([[-114, 0], [0, 0], [0, -180]], C.mustard, 'mid'),
      P([[0, 0], [114, 0], [0, -180]], C.kraft, 'mid'),
      P([[-198, -5], [198, -5], [134, 79], [-134, 79]], C.orange, 'high'),
    ],
  };
  const wing = (a, b) => [[-42, a], [-20, b], [0, -3], [20, b], [42, a], [20, b + 12], [0, 9], [-20, b + 12]];
  const birds = [wing(0, -20), wing(-12, 4)].map(pts => P(pts, C.teal, 'high', { cut: { jitter: 0.5, every: 6 } }));
  // the title, one character on each hanging tag, all in teal: the one colour that reads on every
  // other paper (3.2:1 on orange, 5-7:1 on the rest; kraft on orange is only 2.2:1)
  const TAG = [140, 172], tagColour = [C.mustard, C.sage, C.orange, C.mustard, C.sage];
  const tagPts = [[16, 0], [124, 0], [140, 22], [140, 172], [0, 172], [0, 22]];
  const tags = [...'紙上的旅行'].map((ch, i) => {
    const path = cut(tagPts, { seed: 40 + i });
    path.addPath(cut(circlePts(70, 22, 8, 24), { seed: 50 + i, jitter: 0.4 }));
    return piece(path, [0, 0, ...TAG], {
      fill: tagColour[i], tile, lift: 'top', rule: 'evenodd', seed: 60 + i,
      decorate: g => drawText(g, ch, 70, 140, { size: 96, family: FAMILY, weight: 900, align: 'center', fill: C.teal }),
    });
  });
  const strip = piece(cut([[0, 0], [560, 0], [560, 58], [0, 58]], { seed: 70 }), [0, 0, 560, 58], {
    fill: C.teal, tile, lift: 'high', seed: 71,
    decorate: g => drawText(g, 'A JOURNEY ON PAPER', 280, 40, { size: 28, family: FAMILY, weight: 700, spacing: 0.22, align: 'center', fill: C.kraft }),
  });
  // the end: an orange sheet, a window cut in it, and the disc that falls out. The sheet is wider
  // than the frame by more than ENTER's overshoot (3.5% of its travel, 74 px), so no edge shows.
  const O = [1190, 600], RW = 340, M = 90;
  const sheetPts = [[-M, -M], [W + M, -M], [W + M, H + M], [-M, H + M]];
  const sheet = P(sheetPts, C.orange, 'top', { cut: { jitter: 0 } });
  const windowPath = cut(sheetPts, { jitter: 0 });
  windowPath.addPath(cut(circlePts(...O, RW, 160), { seed: 80, jitter: 1.4, every: 7 }));
  const framed = piece(windowPath, bbox(sheetPts), { fill: C.orange, tile, lift: 'top', rule: 'evenodd', seed: 81 });
  const disc = P(circlePts(...O, RW, 160), C.orange, 'top', { cut: { seed: 80, jitter: 1.4, every: 7 } });
  // the scissors: two halves, each a blade, a shank and a ring, pivoting at the origin
  const half = new Path2D(), ks = 1.3;
  half.moveTo(0, 0);
  half.lineTo(80 * ks, 3 * ks);
  half.lineTo(0, 11 * ks);
  half.closePath();
  half.moveTo(0, 2 * ks);
  half.lineTo(0, 11 * ks);
  half.lineTo(-27 * ks, 25 * ks);
  half.lineTo(-34 * ks, 16 * ks);
  half.closePath();
  half.moveTo(-27 * ks, 28 * ks);
  half.arc(-44 * ks, 28 * ks, 17 * ks, 0, TAU);
  half.moveTo(-34 * ks, 28 * ks);
  half.arc(-44 * ks, 28 * ks, 10 * ks, 0, TAU, true); // the finger hole: wound the other way
  const mirrored = new Path2D();
  mirrored.addPath(half, new DOMMatrix([1, 0, 0, -1, 0, 0]));
  const snips = [half, mirrored].map((path, i) =>
    piece(path, i ? [-64 * ks, -48 * ks, 148 * ks, 52 * ks] : [-64 * ks, -4 * ks, 148 * ks, 52 * ks], { fill: C.teal, tile, lift: 'high', seed: 95 + i }));
  const endTag = piece(cut([[0, 0], [250, 0], [250, 120], [0, 120]], { seed: 90 }), [0, 0, 250, 120], {
    fill: C.kraft, tile, lift: 'high', seed: 91,
    decorate: g => {
      drawText(g, '完', 64, 86, { size: 72, family: FAMILY, weight: 900, align: 'center', fill: C.teal });
      drawText(g, 'THE END', 176, 74, { size: 24, family: FAMILY, weight: 700, spacing: 0.16, align: 'center', fill: C.teal });
    },
  });

  let ground = null; // the kraft sheet's texture, as a pattern of the film's own canvas
  // The camera travels one print-frame at a time.
  const travel = (t, [a, b]) => ease.inOut(span(stepTime(t, FPS), a, b));
  const camX = t => PAN[0] * travel(t, at.pan[0]) + PAN[1] * travel(t, at.pan[1]);

  function scenery(ctx, t) {
    const tt = stepTime(t, FPS), cx = camX(t);
    ctx.fillStyle = C.kraft;
    ctx.fillRect(0, 0, W, H);
    ground ||= ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);
    // sun: pops on beat 2, its rays turning slowly
    const sp = frameOf(POP, t, at.sun);
    if (sp !== null) {
      const [x, y] = sun.at, o = { dx: x - 0.1 * cx, dy: y, scale: sp, t };
      place(ctx, sun.rays, { ...o, rot: 0.12 * tt, id: 'rays' });
      place(ctx, sun.disc, { ...o, id: 'sun' });
    }
    // clouds drop in with the far hills
    const cd = frameOf(DROP, t, at.far);
    if (cd !== null) clouds.forEach((c, i) => place(ctx, c.pc, { dx: c.at[0] - 0.2 * cx, dy: c.at[1] + cd * 420, id: `cloud${i}`, t }));
    // hills slide up from below the frame
    const fe = frameOf(ENTER, t, at.far);
    if (fe !== null) place(ctx, far, { dx: -0.3 * cx, dy: fe * 520, id: 'far', t });
    const ne = frameOf(ENTER, t, at.near);
    if (ne !== null) place(ctx, near, { dx: -0.6 * cx, dy: ne * 420, id: 'near', t });
    // birds cross the sky while the boat travels, flapping on every print
    if (t >= at.pan[0][0]) {
      const k = step(t - at.pan[0][0]);
      [[1850, 380, 0], [2010, 330, 1], [2140, 420, 0]].forEach(([x, y, ph], i) =>
        place(ctx, birds[(k + ph) % 2], { dx: x - 0.8 * cx - 140 * (tt - at.pan[0][0]), dy: y + 6 * Math.sin(TAU * (tt + i / 3)), id: `bird${i}`, t }));
    }
    for (const [i, pc] of island.entries()) place(ctx, pc, { dx: -cx, id: `island${i}`, t });
    // waves: three strips, sliding against each other and bobbing, the boat between the first two
    waves.forEach((w, i) => {
      const e = frameOf(ENTER, t, at.waves + w.delay / FPS);
      if (e === null) return;
      const dx = -cx + 26 * Math.sin(TAU * (tt / 2 + i / 2)), dy = e * 300 + 5 * Math.sin(TAU * (tt + i / 3));
      place(ctx, w.pc, { dx, dy, id: `wave${i}`, t });
      if (i === 0) boatAt(ctx, t, tt);
    });
  }

  function boatAt(ctx, t, tt) {
    const d = frameOf(DROP, t, at.boat);
    if (d === null) return;
    // under the sheet the boat sails on towards the lighthouse
    const x = boat.at[0] + 320 * travel(t, at.pan[1]), y = boat.at[1], rot = 0.055 * Math.sin(TAU * 0.5 * tt), bob = 6 * Math.sin(TAU * (tt + 0.25));
    boat.parts.forEach((pc, i) => place(ctx, pc, { dx: x, dy: y + bob + d * 600, rot, pivot: [0, 72], id: `boat${i}`, t }));
  }

  function titles(ctx, t, tt) {
    tags.forEach((pc, i) => {
      const d = frameOf(DROP, t, at.tags[i]);
      if (d === null) return;
      const x = 150 + i * 176, y = 200 + d * 380, tau = tt - at.tags[i];
      const base = 0.05 * (2 * rng(`tag${i}`)() - 1); // each hangs a little crooked, ±3°
      const swing = base + 0.09 * Math.exp(-tau / 0.6) * Math.sin(TAU * 1.4 * tau) + 0.012 * Math.sin(TAU * 0.5 * tt + i);
      // the string, from above the frame to the hole
      ctx.strokeStyle = C.teal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 70, -10);
      ctx.lineTo(x + 70, y + 22);
      ctx.stroke();
      place(ctx, pc, { dx: x, dy: y, rot: swing, pivot: [70, 22], id: `tag${i}`, t });
    });
    const s = frameOf(ENTER, t, at.strip);
    if (s !== null) place(ctx, strip, { dx: 150 - s * 900, dy: 420, id: 'strip', t });
  }

  function ending(ctx, t) {
    const e = frameOf(ENTER, t, at.sheet);
    if (e === null) return;
    const dx = e * (W + 200);
    if (t < at.fall) {
      place(ctx, sheet, { dx, id: 'sheet', t });
      // ✂ the cut line: dashes going round, one twelfth of the circle per print-frame
      const k = t < at.cut[0] ? 0 : Math.min(12, step(t - at.cut[0]) + 1);
      if (k) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.strokeStyle = C.teal;
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.arc(...O, RW, -Math.PI / 2, -Math.PI / 2 + (k / 12) * TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        scissors(ctx, O[0] + RW * Math.cos(-Math.PI / 2 + (k / 12) * TAU), O[1] + RW * Math.sin(-Math.PI / 2 + (k / 12) * TAU), (k / 12) * TAU, k, t);
        ctx.restore();
      }
    } else {
      place(ctx, framed, { id: 'sheet', t });
      // the cut-out disc drops away, turning
      const f = stepTime(t - at.fall, FPS);
      place(ctx, disc, { dy: 0.5 * 9000 * f * f, rot: 1.3 * f, pivot: O, id: 'disc', t });
    }
    place(ctx, endTag, { dx: dx + 120, dy: 860, rot: -0.04, pivot: [125, 60], id: 'end', t });
  }

  /** Paper scissors at the head of the cut, pointing along it, snipping on alternate prints. */
  function scissors(ctx, x, y, a, k, t) {
    const open = k % 2 ? 0.3 : 0.08;
    snips.forEach((pc, i) => place(ctx, pc, { dx: x, dy: y, rot: a + (i ? -open : open), id: `snip${i}`, t }));
  }

  return {
    id: 'paper',
    start: 0,
    end: song.duration,
    draw(ctx, s) {
      const { t } = s, tt = stepTime(t, FPS);
      scenery(ctx, t);
      titles(ctx, t, tt);
      ending(ctx, t);
    },
  };
}
