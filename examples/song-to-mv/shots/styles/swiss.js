// 瑞士動態排版 · Swiss kinetic. A 12-column grid, two weights, one red. Everything moves in whole
// grid units, lands on a beat within a quarter of a second, and then stops dead. A red bar scans
// the grid on the eighths and floods the frame; the type swaps sizes; the red shrinks to a flag.
import { drawText, ease, lerp, span, textSprite } from '../../engine/studio.js';

export const PAPER = '#F4F1EA';
export const INK = '#111111';
export const RED = '#E4322B'; // at most 8% of a frame at rest; the one exception is the full-frame flip
const FAMILY = 'Noto Sans TC';
const MOVE = 0.22; // every move is over in under a quarter of a second

/** The grid: `cols` columns and `rows` rows inside the margins, with gutters between them. */
export function grid(W, H, { cols = 12, rows = 8, mx = 96, my = 80, gutter = 24 } = {}) {
  const cw = (W - 2 * mx - (cols - 1) * gutter) / cols, rh = (H - 2 * my - (rows - 1) * gutter) / rows;
  return {
    cols, rows, mx, my, gutter, cw, rh,
    x: c => mx + c * (cw + gutter), // left edge of column c
    y: r => my + r * (rh + gutter), // top edge of row r
    w: n => n * cw + (n - 1) * gutter, // n columns wide
    h: n => n * rh + (n - 1) * gutter, // n rows high
  };
}

/** Draw something rising into its own box from below, clipped to the box, in place after `dur`. */
export function rise(ctx, t, t0, [x, y, w, h], draw, dur = MOVE) {
  if (t < t0) return;
  const u = ease.expoOut(span(t, t0, t0 + dur));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(0, (1 - u) * h);
  draw();
  ctx.restore();
}

const lerpRect = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));

export function swissKinetic({ song, width: W, height: H }) {
  const G = grid(W, H);
  const T = (...a) => song.T(...a);
  const right = G.x(G.cols - 1) + G.cw;
  // Three headline lines, two rows each: the em box fills the band, and the English beside each
  // line stands on the same baseline.
  const HEAD = G.h(2);
  const base = r => G.y(r) + G.h(2) - 0.12 * HEAD;
  const lines = [
    { zh: '節拍', en: 'THE BEAT', row: 1, at: T(1, 1) },
    { zh: '就是', en: 'IS THE', row: 3, at: T(1, 2) },
    { zh: '網格', en: 'GRID', row: 5, at: T(1, 3), red: true },
  ];
  const at = {
    english: [T(1, 4, 1), T(1, 4, 2), T(1, 4, 3)],
    scan: [T(2, 1), T(2, 1, 3), T(2, 2), T(2, 2, 3), T(2, 3), T(2, 3, 3)],
    flood: T(2, 4),
    big: T(3, 1),
    flip: T(3, 3),
    retract: T(4, 1),
    info: T(4, 2),
    align: [T(1, 4), T(4, 3)],
  };

  // The red: a one-column bar that scans the grid on the eighths (two columns a step), floods the
  // frame on beat 4 of bar 2, and shrinks to a one-module flag on the downbeat of bar 4.
  const bar = k => [G.x(2 * k), G.my, G.cw, G.h(G.rows)];
  const full = [0, 0, W, H], flag = [G.x(G.cols - 1), G.y(0), G.cw, G.rh];
  function red(t) {
    if (t < at.scan[0]) return null;
    if (t < at.flood) {
      const k = at.scan.findLastIndex(s => t >= s), u = ease.expoOut(span(t, at.scan[k], at.scan[k] + 0.1));
      if (k === 0) return lerpRect([G.x(0), G.my, G.cw, 0], bar(0), u); // drops in from the top margin
      return lerpRect(bar(k - 1), bar(k), u);
    }
    if (t < at.retract) return lerpRect(bar(at.scan.length - 1), full, ease.expoOut(span(t, at.flood, at.flood + MOVE)));
    return lerpRect(full, flag, ease.expoOut(span(t, at.retract, at.retract + MOVE)));
  }

  // 數字計數: the beat number, 01 to 16; each new number pushes the last one up and out of its row.
  function counter(ctx, t, ink) {
    const p = Math.floor(song.beatAt(t) + 1e-6), u = ease.expoOut(span(t, song.timeOfBeat(p), song.timeOfBeat(p) + 0.15));
    const num = (n, dy) => drawText(ctx, String(n).padStart(2, '0'), G.x(10) + G.cw, G.y(0) + G.rh - 2 + dy, { size: 128, family: FAMILY, weight: 300, align: 'right', fill: ink });
    rise(ctx, t, T(1), [G.x(8), G.y(0), G.w(3), G.rh], () => {
      if (p > 0) num(p, -u * G.rh);
      num(p + 1, p > 0 ? (1 - u) * G.rh : 0);
    });
  }

  // Layout A: caption, headline, English on the same baselines, the counter and, in the last bar,
  // a line of facts. Drawn twice: ink on paper, and paper wherever the red covers it.
  function layoutA(ctx, t, ink, accent) {
    rise(ctx, t, T(1), [G.x(0), G.y(0), G.w(8), G.rh], () => {
      drawText(ctx, 'SWISS KINETIC', G.x(0), G.y(0) + 30, { size: 24, family: FAMILY, weight: 700, spacing: 0.12, fill: ink });
      drawText(ctx, '瑞士動態排版　節拍就是網格', G.x(0), G.y(0) + 70, { size: 24, family: FAMILY, weight: 500, fill: ink });
    });
    lines.forEach((l, k) => {
      rise(ctx, t, l.at, [G.x(0), G.y(l.row), G.w(6), G.h(2)], () =>
        drawText(ctx, l.zh, G.x(0), base(l.row), { size: HEAD, family: FAMILY, weight: 900, fill: l.red ? accent : ink }));
      rise(ctx, t, at.english[k], [G.x(6), G.y(l.row), G.w(6), G.h(2)], () =>
        drawText(ctx, l.en, G.x(6), base(l.row), { size: 64, family: FAMILY, weight: 700, spacing: 0.02, fill: ink }));
    });
    counter(ctx, t, ink);
    rise(ctx, t, at.info, [G.x(0), G.y(7), G.w(12), G.rh], () => {
      const facts = `${Math.round(song.bpm)} BPM　${song.beatsPerBar}/4　${G.cols} COLUMNS　${G.rows} ROWS　ONE RED`;
      drawText(ctx, facts, G.x(0), G.y(7) + 58, { size: 28, family: FAMILY, weight: 500, spacing: 0.08, fill: ink });
    });
  }

  // Layout B, only inside the red in bar 3: 網格 fills the frame, then trades sizes with GRID.
  // Both stand on the bottom of row 6; the big one is flush left, the small one flush right.
  // 網格 fills six rows; GRID is wider, so it stops short of the corner. Both are sprites: at
  // 600 px, live glyphs on the GPU are not the same from run to run (see textSprite).
  const SMALL = 120, display = { family: FAMILY, weight: 900, fill: PAPER };
  const words = [
    { sprite: textSprite('網格', { ...display, size: G.h(6) }), big: G.h(6), startsBig: true, cjk: true },
    { sprite: textSprite('GRID', { ...display, size: 600 }), big: 600, startsBig: false, cjk: false },
  ];
  function layoutB(ctx, t) {
    const u = ease.expoOut(span(t, at.flip, at.flip + MOVE)), floor = G.y(6) + G.rh;
    rise(ctx, t, at.big, [0, 0, W, H], () => {
      for (const { sprite, big, startsBig, cjk } of words) {
        const size = startsBig ? lerp(big, SMALL, u) : lerp(SMALL, big, u), w = sprite.width(size);
        const x = startsBig ? lerp(G.x(0), right - w, u) : lerp(right - w, G.x(0), u);
        // a CJK em box sits on the floor; a Latin word without descenders stands on its baseline
        sprite.draw(ctx, x, floor - (cjk ? 0.12 * size : 0), size);
      }
    });
    counter(ctx, t, PAPER);
  }

  return {
    id: 'swiss',
    start: 0,
    end: song.duration,
    draw(ctx, s) {
      const { t } = s;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      // The grid draws itself on the first downbeat, one column edge after another.
      ctx.fillStyle = INK;
      for (let c = 0; c < G.cols * 2; c++) {
        const u = ease.expoOut(span(t, T(1) + c * 0.02, T(1) + c * 0.02 + MOVE));
        if (u <= 0) continue;
        const x = c % 2 ? G.x(c >> 1) + G.cw - 1 : G.x(c >> 1);
        ctx.globalAlpha = 0.1;
        ctx.fillRect(x, G.my, 1, G.h(G.rows) * u);
      }
      ctx.globalAlpha = 1;
      layoutA(ctx, t, INK, RED);
      const r = red(t);
      if (r) {
        ctx.fillStyle = RED;
        ctx.fillRect(...r);
        ctx.save();
        ctx.beginPath();
        ctx.rect(...r);
        ctx.clip();
        if (t < at.big) layoutA(ctx, t, PAPER, PAPER);
        else layoutB(ctx, t);
        ctx.restore();
      }
      // 對齊線: hairlines flash where things share an edge: the baselines when the English lands,
      // the flush-left edge near the end.
      const [a1, a2] = at.align, f1 = 1 - span(t, a1, a1 + 0.3), f2 = 1 - span(t, a2, a2 + 0.3);
      ctx.fillStyle = RED;
      if (t >= a1 && f1 > 0) {
        ctx.globalAlpha = f1;
        for (const l of lines) ctx.fillRect(G.x(0), base(l.row), right - G.x(0), 2);
      }
      if (t >= a2 && f2 > 0) {
        ctx.globalAlpha = f2;
        ctx.fillRect(G.x(0) - 1, G.my, 2, G.h(G.rows));
      }
      ctx.globalAlpha = 1;
    },
  };
}
