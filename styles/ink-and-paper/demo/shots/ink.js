// 水墨紙本 · ink and paper. One ridge in a single stroke, washes that soak down from it, moss dots
// and ripples on the eighths, two columns of text brushed in, and a seal on the last downbeat.
// Every stroke is painted once, offscreen, and then uncovered along its path. The painting is a
// ribbon as wide as the brush presses, a halo where the ink bleeds into the paper, and dry-brush
// streaks (飛白) that open up hair by hair as the brush runs out of ink.
import { camera, clamp, drawText, ease, fbm2, lerp, noise1, rng, shake, smoothstep, span, verticalText } from '../engine/studio.js';

export const PAPER = '#F3EEE2';
const INK = [26, 23, 20]; // warm black: ink is never #000
const SEAL = '#C8352B'; // the only colour, under 2% of the frame
const ink = a => `rgba(${INK[0]},${INK[1]},${INK[2]},${a})`;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** One short curved fibre, in the current stroke style and alpha. */
function fibre(g, r, x, y) {
  const len = 6 + r() * 26, a = r() * Math.PI;
  g.lineWidth = 0.6 + r() * 0.8;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 6, x + Math.cos(a) * len, y + Math.sin(a) * len);
  g.stroke();
}

/** Rice paper: low mottling (computed small, scaled up) and a few thousand fibres. */
export function paper(W, H) {
  const [c, g] = canvas(W, H);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const [m, mg] = canvas(240, 135);
  const img = mg.createImageData(240, 135);
  for (let y = 0; y < 135; y++) {
    for (let x = 0; x < 240; x++) {
      const v = fbm2(x / 38, y / 38, { octaves: 4, seed: 11 });
      const i = (y * 240 + x) * 4;
      img.data[i] = 120;
      img.data[i + 1] = 100;
      img.data[i + 2] = 70;
      img.data[i + 3] = clamp(20 + v * 40, 0, 255);
    }
  }
  mg.putImageData(img, 0, 0);
  g.globalAlpha = 0.35;
  g.drawImage(m, 0, 0, W, H);
  const r = rng('fibres');
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = r() * H;
    g.globalAlpha = 0.05 + r() * 0.08;
    g.strokeStyle = r() < 0.5 ? '#8a7a60' : '#ffffff';
    fibre(g, r, x, y);
  }
  return c;
}

/** Sample a path y = fn(x) every `step` px; each point carries its unit normal. */
export function sample(fn, x0, x1, step = 4) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) pts.push([x, fn(x)]);
  return pts.map(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    return [x, y, -(by - ay) / len, (bx - ax) / len];
  });
}

/**
 * Paint a stroke offscreen. pressure(s) is the brush's width along the stroke (a share of `width`),
 * dry(s) how far it has run out of ink (0 wet, 1 dry), tone how dark the ink is (濃 0.9, 淡 0.6).
 * `hairs` is how many streaks the dry brush can open; 0 keeps the stroke whole.
 */
export function brushStroke(pts, { width, pressure, dry, tone = 0.9, hairs = 14, seed }) {
  const n = pts.length - 1, r = rng(seed), sd = r() * 100;
  // Each side has its own ragged edge: the hairs leave the paper a little unevenly.
  const rag = (s, k) => 1 + 0.12 * noise1(s * 24, sd + k) + 0.05 * noise1(s * 160, sd + k + 1);
  const half = pts.map((_, i) => {
    const s = i / n, w = 0.5 * width * pressure(s);
    return [w * rag(s, 0), w * rag(s, 2)];
  });
  const side = (i, o) => half[i][o > 0 ? 0 : 1];
  const pad = width + 16, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.floor(Math.min(...xs) - pad), y0 = Math.floor(Math.min(...ys) - pad);
  const cw = Math.ceil(Math.max(...xs) + pad) - x0, ch = Math.ceil(Math.max(...ys) + pad) - y0;
  // An alpha that changes along the stroke, as a gradient (strokes are sampled evenly in x, so s runs left to right).
  const along = (g, fn) => {
    const grad = g.createLinearGradient(pts[0][0], 0, pts[n][0], 0);
    for (let k = 0; k <= 16; k++) grad.addColorStop(k / 16, `rgba(0,0,0,${clamp(fn(k / 16))})`);
    return grad;
  };
  // The body, widened by a share of its own width (a thin stroke gets a thin halo).
  const body = (g, grow) => {
    const w = (i, k) => half[i][k] * (1 + grow);
    g.beginPath();
    pts.forEach(([x, y, nx, ny], i) => g.lineTo(x + nx * w(i, 0), y + ny * w(i, 0)));
    for (let i = n; i >= 0; i--) {
      const [x, y, nx, ny] = pts[i];
      g.lineTo(x - nx * w(i, 1), y - ny * w(i, 1));
    }
    g.closePath();
    g.fill();
    for (const i of [0, n]) { // round where the brush lands and lifts
      g.beginPath();
      g.arc(pts[i][0], pts[i][1], (w(i, 0) + w(i, 1)) / 2, 0, Math.PI * 2);
      g.fill();
    }
  };
  const [c, g] = canvas(cw, ch);
  g.translate(-x0, -y0);
  // 墨暈: wet ink bleeds a little way into the fibres around the stroke; a dry brush leaves no halo.
  const [hc, hg] = canvas(cw, ch);
  hg.translate(-x0, -y0);
  hg.filter = 'blur(3px)';
  hg.fillStyle = ink(0.3 * tone);
  body(hg, 0.25);
  hg.filter = 'none';
  hg.globalCompositeOperation = 'destination-in';
  hg.fillStyle = along(hg, s => 1 - smoothstep(0.2, 0.7, dry(s)));
  hg.fillRect(x0, y0, cw, ch);
  g.drawImage(hc, x0, y0);
  g.fillStyle = ink(tone);
  body(g, 0);
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = '#000';
  g.lineCap = 'round';
  // 飛白: hairs run out of ink one at a time and leave streaks of bare paper, wider as the brush dries.
  // While the brush is wet the streaks stay shut; the wobble only starts once it begins to dry.
  for (let k = 0; k < hairs; k++) {
    const o = ((k + 0.5) / hairs) * 2 - 1, th = 0.3 + r() * 0.75, hs = r() * 100, gw = (width / hairs) * (0.7 + 1.1 * r());
    const hairAt = i => {
      const [x, y, nx, ny] = pts[i], off = (o + 0.18 * noise1((i / n) * 14, hs + 2)) * side(i, o); // hairs splay and cross
      return [x + nx * off, y + ny * off];
    };
    for (let i = 0; i < n; i++) {
      const s = i / n, d = dry(s);
      if (d + smoothstep(0.1, 0.35, d) * 0.25 * noise1(s * 6, hs) <= th) continue;
      g.lineWidth = gw * (0.5 + 0.6 * d);
      g.beginPath();
      g.moveTo(...hairAt(i));
      g.lineTo(...hairAt(i + 1));
      g.stroke();
    }
  }
  // Dry hairs skip over the paper's tooth: short scratches along the stroke where it runs dry.
  for (let i = 0; i < n; i++) {
    const d = clamp(dry(i / n)), [x, y, nx, ny] = pts[i], want = d ** 3 * width * 0.5;
    for (let j = 0, count = Math.floor(want) + (r() < want % 1 ? 1 : 0); j < count; j++) {
      const o = r() * 2 - 1, off = o * side(i, o), len = 2 + r() * 6;
      g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath();
      g.moveTo(x + nx * off, y + ny * off);
      g.lineTo(x + nx * off + ny * len, y + ny * off - nx * len);
      g.stroke();
    }
  }
  // Less ink is paler ink.
  g.fillStyle = along(g, s => 0.25 * smoothstep(0.4, 1, dry(s)));
  g.fillRect(x0, y0, cw, ch);
  // The paper's fibres show faintly through the ink.
  for (let i = 0, count = (c.width * c.height) / 700; i < count; i++) {
    const x = x0 + r() * c.width, y = y0 + r() * c.height;
    g.globalAlpha = 0.1 + r() * 0.15;
    fibre(g, r, x, y);
  }
  return { canvas: c, x: x0, y: y0, pts, n, reach: Math.max(...half.flat()) * 1.25 + 8 };
}

/** Uncover a painted stroke along its path up to progress p (0–1). */
export function reveal(ctx, st, p) {
  const f = clamp(p) * st.n;
  if (f <= 0) return;
  if (f >= st.n) {
    ctx.drawImage(st.canvas, st.x, st.y);
    return;
  }
  const i = Math.floor(f), R = st.reach;
  // A union of discs along the path (all wound the same way, so they never cancel in the clip),
  // narrowing toward the head: the tip of the brush leads and the ink spreads out behind it.
  const disc = (x, y, at) => {
    const rad = R * clamp(0.35 + (f - at) / 6);
    ctx.moveTo(x + rad, y);
    ctx.arc(x, y, rad, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k <= i; k++) disc(st.pts[k][0], st.pts[k][1], k);
  const [ax, ay] = st.pts[i], [bx, by] = st.pts[i + 1];
  disc(lerp(ax, bx, f - i), lerp(ay, by, f - i), f);
  ctx.clip();
  ctx.drawImage(st.canvas, st.x, st.y);
  ctx.restore();
}

/**
 * A wash (渲染): pale ink under a ridge, darkest along it and fading with depth, uneven where the
 * wet ink wandered. Computed per pixel at quarter size and scaled up soft. Both ends fade into the
 * paper; `mist` leaves bare paper (留白) above a ridge in front, so the two never merge.
 */
export function wash(W, H, ridge, { alpha, depth, x0, x1, seed, pool = 0, soft = 4, mist }) {
  const q = 4, w = Math.ceil(W / q), h = Math.ceil(H / q);
  const [m, mg] = canvas(w, h);
  const img = mg.createImageData(w, h);
  for (let px = 0; px < w; px++) {
    const x = (px + 0.5) * q, top = ridge(x), edge = smoothstep(x0, x0 + 160, x) * smoothstep(x1, x1 - 160, x);
    if (edge <= 0) continue;
    // the mist does not follow the ridge in front exactly: it rises and sinks along it
    const base = mist ? mist.ridge(x) - mist.gap - 50 * (0.5 + 0.5 * noise1(x / 150, seed + 3)) : Infinity;
    for (let py = 0; py < h; py++) {
      const y = (py + 0.5) * q, d = (y - top) / depth;
      if (d < -0.1 || d > 1) continue;
      let a = alpha * smoothstep(-0.06, 0, d) * (1 - clamp(d)) ** 1.6 + alpha * pool * Math.exp(-(((y - top) / 5) ** 2));
      // wet-in-wet: broad pools of darker and paler ink, and a finer mottle inside them
      a *= (0.7 + 0.3 * fbm2(x / 260, y / 190, { octaves: 3, seed })) * (0.85 + 0.15 * fbm2(x / 60, y / 45, { octaves: 2, seed: seed + 7 })) * edge;
      if (mist) a *= 1 - smoothstep(base - 120, base, y);
      const i = (py * w + px) * 4;
      img.data[i] = INK[0];
      img.data[i + 1] = INK[1];
      img.data[i + 2] = INK[2];
      img.data[i + 3] = clamp(a * 255, 0, 255);
    }
  }
  mg.putImageData(img, 0, 0);
  const [c, g] = canvas(W, H);
  g.filter = `blur(${soft}px)`;
  g.imageSmoothingQuality = 'high';
  g.drawImage(m, 0, 0, W, H);
  return { canvas: c, ridge, depth, x0, x1, seed };
}

/**
 * Draw a wash soaking down from its ridge, u = 0 to 1; the wet front moves unevenly. It goes through
 * a half-resolution scratch canvas: a wash has no sharp edges to lose.
 */
export function soak(ctx, w, u, [c, g], W, H) {
  if (u <= 0) return;
  const k = c.width / W;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  g.filter = 'blur(8px)';
  g.fillStyle = '#000';
  g.beginPath();
  for (let x = w.x0 - 60; x <= w.x1 + 60; x += 16) g.lineTo(x * k, (w.ridge(x) - 80) * k);
  for (let x = w.x1 + 60; x >= w.x0 - 60; x -= 16) {
    const front = ((w.depth + 100) * u * (1 + 0.25 * noise1(x / 90, w.seed))) / 0.75;
    g.lineTo(x * k, (w.ridge(x) + front) * k);
  }
  g.fill();
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.drawImage(w.canvas, 0, 0, c.width, c.height);
  ctx.drawImage(c, 0, 0, W, H);
}

/** A 白文 seal: the character is carved out of the red, with a worn, speckled print. */
export function seal(text, size) {
  const [c, g] = canvas(size, size);
  const r = rng('seal');
  g.beginPath();
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const sq = Math.min(1 / Math.abs(Math.cos(a)), 1 / Math.abs(Math.sin(a))); // a square in polar form
    const rad = size * 0.47 * Math.min(sq, 1.3) * (1 + (r() - 0.5) * 0.025);
    g.lineTo(size / 2 + Math.cos(a) * rad * 0.97, size / 2 + Math.sin(a) * rad * 0.97);
  }
  g.closePath();
  g.fillStyle = SEAL;
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  drawText(g, text, size / 2, size / 2 + size * 0.04, { size: size * 0.72, family: 'Noto Serif TC', weight: 900, align: 'center', baseline: 'middle', fill: '#000' });
  for (let k = 0; k < 160; k++) {
    g.globalAlpha = 0.25 + r() * 0.5;
    g.beginPath();
    g.arc(r() * size, r() * size, 0.5 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function inkAndPaper({ song, width: W, height: H }) {
  // Mountains: a near ridge on the left, a pale far ridge behind it, bare paper on the right.
  const peaks = (x, list) => list.reduce((y, [cx, h, w]) => y - h * Math.exp(-(((x - cx) / w) ** 2)), 0);
  const near = x => 660 + peaks(x, [[230, 160, 150], [560, 270, 190], [930, 150, 150]]) + noise1(x / 70, 3) * 16;
  const far = x => 560 + peaks(x, [[930, 200, 220], [1220, 110, 150]]) + noise1(x / 90, 5) * 10;

  // 勾: the ridge in one stroke, pressed and lifted along its length; the brush runs dry in its second half.
  const ridge = brushStroke(sample(near, 60, 1180), {
    width: 26,
    seed: 'ridge',
    pressure: s => lerp(0.55, 1, smoothstep(0, 0.04, s)) * (0.35 + 0.65 * (0.5 + 0.5 * noise1(s * 7, 2))) * (1 - 0.75 * smoothstep(0.8, 1, s)),
    dry: s => 0.05 + 0.85 * smoothstep(0.45, 1, s),
  });
  // 點苔: moss dots in twos and threes, sitting on top of the ridge. Each is a dab: pressed, then lifted.
  const moss = [170, 470, 640, 900].map((x, k) => ({
    x,
    y: near(x) - 20,
    dots: [[0, -26, 1], [22, -19, 0.7], [-19, -17, 0.6]].slice(0, 2 + (k % 2)).map(([dx, dy, sc], j) => {
      const cx = x + dx, cy = near(cx) + dy, len = 9 * sc;
      return brushStroke(sample(v => cy - (v - cx) * 0.25, cx - len, cx + len, 1.5), {
        width: 11 * sc,
        hairs: 0,
        seed: `moss${k}.${j}`,
        tone: 0.92,
        pressure: s => (0.75 + 0.25 * smoothstep(0, 0.2, s)) * (1 - 0.6 * smoothstep(0.5, 1, s)),
        dry: () => 0,
      });
    }),
  }));
  // 水紋: three ripples in pale ink, long and light, broken once or twice where the brush skipped.
  const ripples = [[150, 610, 790], [330, 860, 838], [80, 420, 884]].map(([a, b, y], k) =>
    brushStroke(sample(x => y + noise1(x / 120, 20 + k) * 6, a, b, 5), {
      width: 7,
      hairs: 0,
      seed: `ripple${k}`,
      tone: 0.6,
      pressure: s => smoothstep(0, 0.1, s) * (1 - 0.7 * smoothstep(0.5, 1, s)) * smoothstep(-0.55, -0.1, noise1(s * 4, 30 + k)),
      dry: s => 0.1 + 0.6 * smoothstep(0.4, 1, s),
    }),
  );
  const bg = paper(W, H);
  const nearWash = wash(W, H, near, { alpha: 0.26, depth: 320, x0: 20, x1: 1200, seed: 1 });
  const farWash = wash(W, H, far, { alpha: 0.18, depth: 230, x0: 560, x1: 1480, seed: 2, pool: 0.5, soft: 5, mist: { ridge: near, gap: 30 } });
  const scratch = canvas(W / 2, H / 2);
  const SEAL_SIZE = 88, stamp = seal('聲', SEAL_SIZE);

  const T = (...a) => song.T(...a);
  const at = {
    stroke: [T(1), T(1, 4) + 0.3],
    soak: [T(1, 3), T(2, 2)],
    far: [T(2), T(2, 4)],
    moss: [T(2), T(2, 1, 3), T(2, 2), T(2, 2, 3)],
    ripple: [T(2, 3), T(2, 3, 3), T(2, 4)],
    col1: T(3),
    col2: T(3, 3),
    seal: T(4),
  };

  return {
    id: 'ink',
    start: 0,
    end: song.duration,
    draw(ctx, s) {
      const { t } = s;
      const push = lerp(1, 1.03, ease.inOut(span(t, 0, song.duration)));
      const jolt = shake(t, { amp: t < at.seal ? 0 : 3 * Math.pow(0.5, (t - at.seal) / 0.05), freq: 30, seed: 4 });
      camera(ctx, { x: jolt.x, y: jolt.y, zoom: push }, () => {
        ctx.drawImage(bg, -12, -12, W + 24, H + 24); // a little overscan for the jolt
        // 染: the washes soak down from the ridge while the brush is still moving.
        soak(ctx, farWash, ease.out(span(t, ...at.far)), scratch, W, H);
        soak(ctx, nearWash, ease.out(span(t, ...at.soak)), scratch, W, H);
        // 勾: the brush lands on the downbeat of bar 1.
        reveal(ctx, ridge, ease.inOut(span(t, ...at.stroke)));
        // 點苔 on the first four eighths of bar 2: each cluster lands at once and spreads a little.
        moss.forEach((m, k) => {
          const d = span(t, at.moss[k], at.moss[k] + 0.08);
          if (d <= 0) return;
          const z = lerp(0.8, 1, ease.out(d));
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.scale(z, z);
          ctx.translate(-m.x, -m.y);
          for (const dot of m.dots) reveal(ctx, dot, 1);
          ctx.restore();
        });
        // 水紋 on the last three eighths.
        ripples.forEach((r, k) => reveal(ctx, r, ease.out(span(t, at.ripple[k], at.ripple[k] + 0.3))));
        // Text, brushed in from the top: 山在 on a downbeat, 水在 two beats later.
        for (const [text, x, t0] of [['山在', 1680, at.col1], ['水在', 1560, at.col2]]) {
          const u = ease.inOut(span(t, t0, t0 + 0.6));
          if (u <= 0) continue;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - 70, 240, 140, 30 + 220 * u);
          ctx.clip();
          ctx.filter = 'blur(1.6px)'; // the bleed into the fibres
          verticalText(ctx, text, x, 300, { size: 96, family: 'Noto Serif TC', weight: 600, fill: ink(0.35) });
          ctx.filter = 'none';
          verticalText(ctx, text, x, 300, { size: 96, family: 'Noto Serif TC', weight: 600, fill: ink(0.92) });
          ctx.restore();
        }
        // The seal comes down in 0.12 s and lands on the downbeat of bar 4, under the last column.
        const d = span(t, at.seal - 0.12, at.seal);
        if (d > 0) {
          const k = lerp(1.3, 1, ease.quadIn(d));
          ctx.save();
          ctx.translate(1560, 535);
          ctx.scale(k, k);
          ctx.globalAlpha = 0.25 + 0.75 * d;
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(stamp, -SEAL_SIZE / 2, -SEAL_SIZE / 2, SEAL_SIZE, SEAL_SIZE);
          ctx.restore();
        }
      });
    },
  };
}
