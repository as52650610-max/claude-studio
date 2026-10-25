// Riso 印刷 · Riso print. Three spot inks, each a layer of its own, multiplied onto warm paper, so
// that wherever two overlap they make a third colour. No ink sits exactly on the others, none lies
// evenly, and both change twelve times a second, as if every frame had come off the machine on its
// own. The demo prints its three passes on the first three beats, kicks the registration on the
// backbeats, looks at the dots through a loupe in bar 3 and pulls the top sheet off the stack in bar 4.
import { camera, clamp, drawText, fbm2, fontString, hash, lerp, noise1, rng, stepTime, textSprite, TAU } from '../../engine/studio.js';

export const PAPER = '#F5F0E6';
/** The screen values Riso gives for three of its stock inks. */
export const INK = { yellow: '#FFE800', pink: '#FF48B0', blue: '#0078BF' };
const ORDER = ['yellow', 'pink', 'blue']; // the order the sheet goes through the machine
const FAMILY = 'Noto Sans TC';
const FPS = 12; // the print rate: ink texture and registration change on twelves
const step = t => Math.floor(t * FPS + 1e-6);
const PULL = [0.04, 0.18, 0.45, 0.85]; // a sheet pulled off the stack, one print at a time

/**
 * How ink fails to cover, as two destination-out masks: soft blotches (quarter resolution and half
 * as big again as the sheet, so every print can take a different window of it) and a 256 px tile of
 * pinholes and grain. Built once; draw both under the same transform as the ink.
 */
export function inkTexture(W, H, { seed = 'riso', blotch = 0.24, holes = 0.012, grain = 0.16 } = {}) {
  const q = 4, bw = Math.ceil((1.5 * W) / q), bh = Math.ceil((1.5 * H) / q);
  const b = document.createElement('canvas');
  b.width = bw;
  b.height = bh;
  const bg = b.getContext('2d'), bi = bg.createImageData(bw, bh), s = Math.floor(hash(seed) * 1e4);
  for (let y = 0, i = 3; y < bh; y++)
    for (let x = 0; x < bw; x++, i += 4) bi.data[i] = 255 * blotch * clamp(0.45 + 0.9 * fbm2(x / 12, y / 12, { octaves: 3, seed: s }));
  bg.putImageData(bi, 0, 0);
  const N = 256, p = document.createElement('canvas');
  p.width = p.height = N;
  const pg = p.getContext('2d'), pi = pg.createImageData(N, N), r = rng(`${seed}:holes`);
  for (let i = 3; i < pi.data.length; i += 4) pi.data[i] = r() < holes ? 150 + 105 * r() : 255 * grain * r() ** 3;
  pg.putImageData(pi, 0, 0);
  return { blotch: b, q, holes: p };
}

/**
 * A halftone of a lit ball: dots on a screen turned by `angle` degrees, each with the area of its
 * tone, from `lo` where the light hits to `hi` in shadow (0.785 is where neighbours touch).
 * Returns one Path2D, worked out once; clip to the ball when filling it.
 */
export function halftoneBall({ x: cx, y: cy }, R, { pitch = 16, angle = 15, light = [-0.5, -0.6, 0.62], lo = 0.09, hi = 0.8, seed = 'dots' } = {}) {
  const a = (angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  const l = Math.hypot(...light), [lx, ly, lz] = light.map(v => v / l);
  const r = rng(seed), path = new Path2D(), n = Math.ceil(R / pitch) + 2;
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const x = cx + (i * ux - j * uy) * pitch, y = cy + (i * uy + j * ux) * pitch;
      const nx = (x - cx) / R, ny = (y - cy) / R, d2 = nx * nx + ny * ny;
      if (d2 > (1 + pitch / R) ** 2) continue;
      const lit = Math.max(0, nx * lx + ny * ly + Math.sqrt(Math.max(0, 1 - d2)) * lz);
      const rad = pitch * Math.sqrt(lerp(hi, lo, lit ** 0.9) / Math.PI) * r.range(0.94, 1.06);
      // No real dot is a circle: ink spreads into the paper unevenly. Under the loupe it shows.
      const ox = x + r.range(-0.4, 0.4), oy = y + r.range(-0.4, 0.4), ph = [r(), r(), r(), r()].map(v => v * TAU);
      for (let k = 0; k <= 28; k++) {
        const th = (k / 28) * TAU;
        const e = rad * (1 + 0.035 * Math.sin(2 * th + ph[0]) + 0.03 * Math.sin(3 * th + ph[1]) + 0.025 * Math.sin(5 * th + ph[2]) + 0.02 * Math.sin(7 * th + ph[3]));
        if (k) path.lineTo(ox + e * Math.cos(th), oy + e * Math.sin(th));
        else path.moveTo(ox + e, oy);
      }
      path.closePath();
    }
  return path;
}

export function riso({ song, width: W, height: H }) {
  const T = (...a) => song.T(...a);
  const tex = inkTexture(W, H);
  const ball = { x: 1200, y: 520 }, R = 380, rings = [404, 482];
  const dots = halftoneBall(ball, R);
  // Where the loupe looks in bar 3: the rim of the ball, both rings, the ring of type and the top
  // of the waveform all meet there, so every ink and every overprint is in the close-up.
  const P = { x: 1420, y: 830 };
  const at = {
    pass: { yellow: T(1, 1), pink: T(1, 2), blue: T(1, 3) },
    kicks: [T(1, 4), T(2, 2), T(2, 4), T(3, 4), T(4, 3)],
    zoom: [[T(3, 1), 1.6], [T(3, 2), 2.6], [T(3, 3), 4.2], [T(3, 4), 1]],
    groove: T(2, 1),
    next: T(4, 1),
  };

  // The title is large and is in the loupe's first frame, so it is a sprite (see textSprite).
  const TITLE = 210;
  const title = ['印出來的', '聲音'].map(s => textSprite(s, { size: TITLE, family: FAMILY, weight: 900, fill: INK.blue }));
  const lines = [[title[0], 430], [title[1], 660]];
  const knockout = lines.map(([sp, y]) => [96 - 14, y - 0.88 * TITLE - 14, sp.width(TITLE) + 28, TITLE + 28]);
  // The ring of type around the ball: one phrase, repeated to close the circle exactly.
  const RT = 432, RS = 26, phrase = 'SOUND IN INK · 印出來的聲音 · ';
  const ring = (() => {
    const m = document.createElement('canvas').getContext('2d');
    m.font = fontString({ size: RS, family: FAMILY, weight: 700 });
    const chars = [...phrase], adv = chars.map(ch => m.measureText(ch).width + 0.12 * RS);
    const len = adv.reduce((a, b) => a + b, 0), reps = Math.max(1, Math.round((TAU * RT) / len)), k = (TAU * RT) / (reps * len);
    const out = [];
    for (let rep = 0, s = 0; rep < reps; rep++)
      chars.forEach((ch, i) => {
        if (ch.trim()) out.push({ ch, a: (s + (adv[i] * k) / 2) / RT });
        s += adv[i] * k;
      });
    return out;
  })();
  // Paper: flecks and fibres, as paths so that they stay sharp under the loupe.
  const flecks = new Path2D(), fibres = new Path2D();
  for (let i = 0, r = rng('paper'); i < 900; i++) {
    const x = r() * W, y = r() * H, a = r() * TAU, len = r.range(4, 16), size = r.range(0.4, 1.1);
    if (r() < 0.25) {
      fibres.moveTo(x, y);
      fibres.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 3, y + Math.sin(a) * len * 0.5 - 3, x + Math.cos(a) * len, y + Math.sin(a) * len);
    } else {
      flecks.moveTo(x + size, y);
      flecks.arc(x, y, size, 0, TAU);
    }
  }

  // Each ink lands a few pixels off and turned a fraction of a degree, differently on every sheet;
  // it shivers on every print and jumps on the kicks.
  function registration(ink, copy, t) {
    const r = rng(`reg:${ink}:${copy}`), j = rng(`shiver:${ink}:${copy}:${step(t)}`);
    let x = r.range(-3.5, 3.5) + j.range(-0.7, 0.7), y = r.range(-3.5, 3.5) + j.range(-0.7, 0.7);
    const rot = r.range(-0.0015, 0.0015);
    for (const k of at.kicks) {
      if (t < k) break;
      const d = Math.pow(0.5, stepTime(t - k, FPS) / 0.07), a = hash(k, ink) * TAU, m = 7 + 6 * hash(k, ink, 'm');
      x += Math.cos(a) * m * d;
      y += Math.sin(a) * m * d;
    }
    return { x, y, rot };
  }
  // A pass prints from the top of the sheet down, in three prints (a quarter of a second).
  const fed = (ink, t) => clamp((step(t - at.pass[ink]) + 1) / 3);
  // The loupe: snaps in three steps about P, which stays where it is on screen, and snaps back.
  function view(t) {
    const k = at.zoom.findLastIndex(([t0]) => t >= t0), z = k < 0 ? 1 : at.zoom[k][1];
    return { x: (P.x - W / 2) * (1 - 1 / z), y: (P.y - H / 2) * (1 - 1 / z), zoom: z };
  }
  const lastBeat = t => song.timeOfBeat(Math.floor(song.beatAt(t) + 1e-6));

  // Registration marks in the corners and a swatch strip, printed by every ink: where the inks sit
  // exactly on each other the marks go nearly black, and where they do not, they fringe.
  function marks(g) {
    g.lineWidth = 2;
    g.beginPath();
    for (const [x, y] of [[56, 56], [W - 56, 56], [56, H - 56], [W - 56, H - 56]]) {
      g.moveTo(x + 13, y);
      g.arc(x, y, 13, 0, TAU);
      g.moveTo(x - 24, y);
      g.lineTo(x + 24, y);
      g.moveTo(x, y - 24);
      g.lineTo(x, y + 24);
    }
    g.stroke();
  }
  const SWATCH = { yellow: [0, 3, 5], pink: [1, 3, 4], blue: [2, 4, 5] }; // Y P B, then Y+P P+B B+Y
  const swatches = (g, ink) => SWATCH[ink].forEach(i => g.fillRect(W - 306 + i * 34, H - 64, 26, 26));

  const plates = {
    // the waveform, mirrored about y 870 (a new one every eighth once the groove starts), and a
    // band under the second line of the title
    yellow(g, t, copy) {
      const f = t < at.groove ? 0 : Math.floor(song.beatAt(t) * 2 + 1e-6), n = 72, x0 = 96, pitch = (W - 2 * x0) / n;
      for (let i = 0; i < n; i++) {
        const v = 0.5 + 0.5 * noise1(i * 0.21 + f * 2.3, 11 + copy);
        const h = 6 + 90 * Math.pow(v, 1.4) * (f % 2 ? 0.8 : 1);
        g.fillRect(x0 + i * pitch + pitch / 4, 870 - h, pitch / 2, 2 * h);
      }
      g.fillRect(76, 592, 520, 108);
    },
    // the ball and two rings that ring on every beat of the groove
    pink(g, t) {
      g.save();
      g.beginPath();
      g.arc(ball.x, ball.y, R, 0, TAU);
      g.clip();
      g.fill(dots);
      g.restore();
      const d = t < at.groove ? 0 : Math.pow(0.5, stepTime(t - lastBeat(t), FPS) / 0.1);
      g.lineWidth = 3;
      g.beginPath();
      for (const r of rings) {
        g.moveTo(ball.x + r + 12 * d, ball.y);
        g.arc(ball.x, ball.y, r + 12 * d, 0, TAU);
      }
      g.stroke();
    },
    // all the type: header, title, the ring of type (turning one print at a time) and the slug
    blue(g, t, copy) {
      drawText(g, 'RISO PRINT', 96, 128, { size: 26, family: FAMILY, weight: 700, spacing: 0.14, fill: INK.blue });
      drawText(g, '孔版印刷　三色疊印', 96, 168, { size: 26, family: FAMILY, weight: 500, fill: INK.blue });
      for (const [sp, y] of lines) sp.draw(g, 96, y, TITLE);
      // The ring of type goes under the title: the same ink, so it is cut away there, as a
      // designer would have cut it, and the pink rings cross the title alone.
      g.save();
      g.beginPath();
      g.rect(-W, -H, 3 * W, 3 * H);
      for (const [x, y, w, h] of knockout) g.rect(x, y, w, h);
      g.clip('evenodd');
      const a0 = -Math.PI / 2 + 0.11 * stepTime(t, FPS);
      for (const { ch, a } of ring) {
        g.save();
        g.translate(ball.x + RT * Math.cos(a0 + a), ball.y + RT * Math.sin(a0 + a));
        g.rotate(a0 + a + Math.PI / 2);
        drawText(g, ch, 0, 0, { size: RS, family: FAMILY, weight: 700, align: 'center', fill: INK.blue });
        g.restore();
      }
      g.restore();
      const slug = `No. ${String(copy).padStart(2, '0')} / 50　FLUO PINK · BLUE · YELLOW　${Math.round(song.bpm)} BPM`;
      drawText(g, slug, 112, H - 40, { size: 20, family: FAMILY, weight: 500, spacing: 0.08, fill: INK.blue });
    },
  };

  let plate = null, holes = null; // one offscreen canvas, reused for every ink
  function print(ctx, t, ink, copy, cam, dy, k) {
    const g = plate.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, plate.width, plate.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    camera(g, cam, () => {
      g.translate(0, dy);
      const f = fed(ink, t);
      if (f < 1) {
        g.beginPath();
        g.rect(0, 0, W, H * f);
        g.clip();
      }
      const reg = registration(ink, copy, t);
      g.translate(W / 2 + reg.x, H / 2 + reg.y);
      g.rotate(reg.rot);
      g.translate(-W / 2, -H / 2);
      g.fillStyle = g.strokeStyle = INK[ink];
      plates[ink](g, t, copy);
      marks(g);
      swatches(g, ink);
      // The ink fails to cover: blotches, a different window of them on every print, and pinholes,
      // the same on the whole sheet (fine grain that changes every print costs ten times the bits).
      const o = rng(`ink:${ink}:${copy}:${step(t)}`), h = rng(`holes:${ink}:${copy}`);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(tex.blotch, -o() * W * 0.5, -o() * H * 0.5, tex.blotch.width * tex.q, tex.blotch.height * tex.q);
      holes.setTransform(new DOMMatrix().translate(Math.floor(h() * 256), Math.floor(h() * 256)));
      g.fillStyle = holes;
      g.fillRect(-16, -16, W + 32, H + 32);
    }, { width: W, height: H });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(plate, 0, 0);
    ctx.restore();
  }

  function sheet(ctx, t, copy, dy, cam, k) {
    camera(ctx, cam, () => {
      ctx.translate(0, dy);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgb(120 100 70 / 0.18)';
      ctx.fill(flecks);
      ctx.strokeStyle = 'rgb(120 100 70 / 0.07)';
      ctx.lineWidth = 0.8;
      ctx.stroke(fibres);
    }, { width: W, height: H });
    for (const ink of ORDER) if (t >= at.pass[ink]) print(ctx, t, ink, copy, cam, dy, k);
  }

  return {
    id: 'riso',
    start: 0,
    end: song.duration,
    draw(ctx, s) {
      const { t } = s, c = ctx.canvas, k = c.width / W;
      if (!plate || plate.width !== c.width || plate.height !== c.height) {
        plate = document.createElement('canvas');
        plate.width = c.width;
        plate.height = c.height;
        holes = plate.getContext('2d').createPattern(tex.holes, 'repeat');
      }
      const cam = view(t);
      if (t < at.next) return sheet(ctx, t, 1, 0, cam, k);
      // 換張: the top sheet is pulled up off the stack in four prints, and copy 2 is underneath.
      const u = PULL[step(t - at.next)] ?? 1;
      sheet(ctx, t, 2, 0, cam, k);
      if (u >= 1) return;
      const y = -u * (H + 80);
      camera(ctx, cam, () => {
        const g = ctx.createLinearGradient(0, y + H, 0, y + H + 70);
        g.addColorStop(0, 'rgb(60 40 20 / 0.28)');
        g.addColorStop(1, 'rgb(60 40 20 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y + H, W, 70);
      }, { width: W, height: H });
      sheet(ctx, t, 1, y, cam, k);
    },
  };
}
