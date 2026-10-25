// The six style cards, played inside this film. Each card's demo is copied into shots/styles/
// unchanged except for the engine path (tests/examples.test.mjs keeps the copies in step with
// styles/) and embedded with embed.js. 04 分鏡 shows each one at its poster frame; 05 風格 gives
// each one bar of the chorus, driven by this song's beats; 06 交片 plays all six endings at once.
import { ease, grain, lerp, span, vignette } from '../engine/studio.js';
import { embed } from './embed.js';
import { CHAPTERS, INK, MOVE, PAPER, RED, TINT, chapterTitle, foot, grid, rise, type } from './page.js';
import { blueprint } from './styles/blueprint.js';
import { inkAndPaper } from './styles/ink.js';
import { paperCutout } from './styles/paper.js';
import { pixelCrt } from './styles/pixel.js';
import { riso } from './styles/riso.js';
import { swissKinetic } from './styles/swiss.js';

// In chorus order. bar: the demo's bar (1–4) that plays in the chorus. poster: the demo's poster
// frame (posterAt in its studio.json). background and post: as in the demo's own film.html.
export const LOOKS = [
  { zh: 'Riso 印刷', en: 'RISO PRINT', card: 'riso-print', make: riso, background: '#F5F0E6', bar: 2, poster: 7.9 },
  { zh: '像素 CRT', en: 'PIXEL CRT', card: 'pixel-crt', make: pixelCrt, background: '#000000', bar: 3, poster: 7.2 },
  { zh: '剪紙', en: 'PAPER CUTOUT', card: 'paper-cutout', make: paperCutout, background: '#E8D8B8', bar: 2, poster: 5.95, post: ctx => vignette(ctx, { amount: 0.22, inner: 0.45 }) },
  { zh: '藍圖', en: 'BLUEPRINT', card: 'blueprint', make: blueprint, background: '#0E2A47', bar: 2, poster: 7.9 },
  { zh: '水墨紙本', en: 'INK AND PAPER', card: 'ink-and-paper', make: inkAndPaper, background: '#F3EEE2', bar: 2, poster: 7.5, post: (ctx, s) => grain(ctx, s.frame, { amount: 0.025 }) },
  { zh: '瑞士動態排版', en: 'SWISS KINETIC', card: 'swiss-kinetic', make: swissKinetic, background: '#F4F1EA', bar: 2, poster: 7.8 },
];

// A CRT needs three output rows per scanline (180 lines) or it moirés: small views are painted
// larger and scaled down.
const ROWS = 540;
const lerpRect = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));

export async function looks(api) {
  const { song, lyrics, width: W, height: H } = api;
  const G = grid(W, H), T = (...a) => song.T(...a);
  const right = G.x(G.cols - 1) + G.cw;
  const demos = [];
  for (const look of LOOKS) {
    const d = await embed(api, look.make, { background: look.background, post: look.post });
    demos.push({ ...look, d, big: d.view(), cell: d.view() });
  }
  /** Demo time for film time t: the demo's beats follow this song's beats from bar `from` on. */
  const demoTime = (d, t, from, demoBar) => d.song.timeOfBeat(4 * (demoBar - 1) + song.beatAt(t) - song.beatAt(T(from)));
  function show(ctx, s, look, view, tau, [x, y, w, h], { frame = true } = {}) {
    const k = s.film.scale, ss = Math.max(1, Math.ceil(ROWS / (h * k)));
    const c = view.paint(tau, w * k * ss, h * k * ss);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, x, y, w, h);
    ctx.restore();
    if (frame) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }
  function label(ctx, i, x, y, size = 18) {
    const l = demos[i];
    let w = type(ctx, String(i + 1).padStart(2, '0'), x, y, size, 700, { fill: RED });
    w += type(ctx, l.zh, x + w + 12, y, size, 700) + 12;
    type(ctx, l.en, x + w + 8, y, size * 0.7, 700, { spacing: 0.12 });
  }

  // ── 04 分鏡 STORYBOARD: six cells, one a beat; in the stop only the first is left ──
  const story = CHAPTERS[3], cellW = G.w(4), cellH = (cellW * 9) / 16;
  const storyCell = i => [G.x(4 * (i % 3)), i < 3 ? G.y(1) : G.y(1) + cellH + 72, cellW, cellH];
  const lands = [T(7, 1), T(7, 2), T(7, 3), T(7, 4), T(8, 1), T(8, 2)];
  const blink = [T(8, 3), T(8, 3, 3)], stopAt = song.stops[0]?.start ?? T(8, 4);
  const storyboard = {
    id: 'storyboard',
    start: T(story.bars[0]),
    end: T(story.bars[1]),
    layer: 2,
    sfx: lands.map((t, i) => ({ t, sound: 'click', params: { pitch: i * 2 }, why: `storyboard cell ${i + 1} lands`, role: 'click', gain: -12 })),
    draw(ctx, s) {
      const { t } = s;
      chapterTitle(ctx, G, t, T(story.bars[0]), story);
      demos.forEach((l, i) => {
        if (i > 0 && t >= stopAt) return; // 停: the rest of the page drops out with the band
        const [x, y, w, h] = storyCell(i);
        rise(ctx, t, lands[i], [x - 2, y - 2, w + 4, h + 44], () => {
          show(ctx, s, l, l.cell, l.poster, [x, y, w, h]);
          label(ctx, i, x, y + h + 30);
          type(ctx, `小節 ${9 + i}`, x + w, y + h + 30, 18, 500, { align: 'right' });
        }, MOVE);
      });
      const on = blink.some(b => t >= b && t < b + 0.12) || t >= stopAt;
      if (on) {
        const [x, y, w, h] = storyCell(0);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 6;
        ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
      }
    },
  };

  // ── 05 風格 STYLE: a window on the page, one look a bar (a shot each, cut on the downbeat) ──
  const style = CHAPTERS[4], WIN = [G.x(0), G.my, G.w(10), (G.w(10) * 9) / 16], col = G.x(10);
  const montage = demos.map((l, k) => ({
    id: `look${k + 1}`,
    start: T(style.bars[0] + k),
    end: T(style.bars[0] + k + 1),
    layer: 2,
    sfx: k ? [] : [{ t: T(9), sound: 'whoosh', params: { dur: 0.3, bright: 0.2 }, sync: 'peak', why: 'the first cell opens into the window on the impact', role: 'transition', gain: -14 }],
    draw(ctx, s) {
      const { t } = s;
      const tau = demoTime(l.d, t, 9 + k, l.bar);
      const rect = k === 0 ? lerpRect(storyCell(0), WIN, ease.expoOut(span(t, T(9), T(9) + MOVE))) : WIN;
      show(ctx, s, l, l.big, tau, rect);
      // the label column: chapter, then which look, which bar of the song and which bar of the demo
      const y0 = foot(G.y(0) + G.rh, G.rh);
      rise(ctx, t, T(9), [col, G.y(0), G.w(2), G.h(3)], () => {
        type(ctx, style.n, col, y0, G.rh, 300);
        type(ctx, style.zh, col, 268, 64, 900);
        type(ctx, style.en, col, 298, 16, 700, { spacing: 0.12 });
      });
      // rows 2–6: the 200 px numeral stands above row 3, so its cell starts a row higher
      rise(ctx, t, T(9 + k), [col, G.y(2), G.w(2), G.h(5)], () => {
        const w = type(ctx, String(k + 1), col - 8, 560, 200, 300);
        type(ctx, `/ ${LOOKS.length}`, col - 8 + w + 8, 560, 40, 300);
        type(ctx, l.zh, col, 620, 32, 900);
        type(ctx, l.en, col, 648, 14, 700, { spacing: 0.12 });
        type(ctx, `副歌第 ${k + 1} 小節　示範第 ${l.bar} 小節`, col, 700, 16, 500);
        type(ctx, `styles/${l.card}`, col, 726, 16, 700, { fill: RED });
      });
    },
  }));

  // ── 06 交片 DELIVER: all six, then all six endings at once; the facts, counted from the data ──
  const deliver = CHAPTERS[5], dW = G.w(3), dH = (dW * 9) / 16;
  const deliverCell = i => [G.x(3 * (i % 3)), i < 3 ? G.y(1) : G.y(1) + dH + 72, dW, dH];
  const enter = i => (i === LOOKS.length - 1 ? T(15) : T(15, 1, 2 + i));
  const words = lyrics.lines.reduce((n, l) => n + l.chars.filter(c => c.c.trim()).length, 0);
  const beats = Math.round(song.beatAt(T(17)) - song.beatAt(T(1)));
  const facts = [
    { value: song.bpm.toFixed(2), unit: 'BPM', label: '量到的速度　MEASURED TEMPO' },
    { value: String(beats), unit: '拍', label: '每一拍都有時間　BEATS, EACH ONE TIMED' },
    { value: String(words), unit: '字', label: '每個字一個音　WORDS, ONE ON EACH NOTE' },
    { value: String(LOOKS.length), unit: '種', label: '風格，同一個引擎　LOOKS, ONE ENGINE' },
    { value: '0', unit: '張', label: '生成的圖片　GENERATED IMAGES' },
  ];
  const factAt = [T(15, 3), T(15, 4), T(16, 1), T(16, 2), T(16, 3)];
  const target = api.film.studio.mix?.target ?? -14;
  const outro = {
    id: 'deliver',
    start: T(deliver.bars[0]),
    end: T(deliver.bars[1]),
    layer: 2,
    sfx: [
      { t: T(15), sound: 'whoosh', params: { dur: 0.25, pitch: -4 }, sync: 'peak', why: 'the window folds back into the grid', role: 'transition', gain: -16 },
      ...factAt.map((t, i) => ({ t, sound: 'tick', params: { pitch: 5 + i }, why: `fact ${i + 1} lands`, gain: -18 })),
    ],
    draw(ctx, s) {
      const { t } = s;
      chapterTitle(ctx, G, t, T(15), deliver, { cols: 9 });
      demos.forEach((l, i) => {
        // bar 15: each look waits on the last frame before its ending; bar 16: all six endings
        const tau = t < T(16) ? 6 - 1 / 30 : demoTime(l.d, t, 16, 4);
        const home = deliverCell(i);
        if (i === LOOKS.length - 1) {
          // the look that was in the window folds back into its place
          show(ctx, s, l, l.cell, tau, lerpRect(WIN, home, ease.expoOut(span(t, T(15), T(15) + MOVE))));
          rise(ctx, t, T(15), [home[0], home[1] + dH, dW, 44], () => label(ctx, i, home[0], home[1] + dH + 30, 16));
          return;
        }
        rise(ctx, t, enter(i), [home[0] - 2, home[1] - 2, dW + 4, dH + 46], () => {
          show(ctx, s, l, l.cell, tau, home);
          label(ctx, i, home[0], home[1] + dH + 30, 16);
        }, MOVE);
      });
      const fx = G.x(9);
      facts.forEach((f, i) => {
        const y = G.y(1) + i * 110;
        rise(ctx, t, factAt[i], [fx, y, G.w(3), 104], () => {
          type(ctx, f.label, fx, y + 18, 15, 700, { spacing: 0.04 });
          const w = type(ctx, f.value, fx - 4, y + 84, 64, 300);
          type(ctx, f.unit, fx - 4 + w + 8, y + 84, 20, 700);
        }, MOVE);
      });
      rise(ctx, t, T(16, 4), [G.x(0), G.y(7) - 24, G.w(12), G.rh + 24], () => {
        const loud = `${target < 0 ? '−' : ''}${Math.abs(target)} LUFS`;
        type(ctx, `交片只要一行：混音到 ${loud}、算圖、品管　ONE COMMAND: MIX, RENDER, CHECK`, G.x(0), G.y(7) + 10, 18, 700);
        type(ctx, 'node tools/studio.mjs deliver examples/song-to-mv', G.x(0), foot(G.y(7) + G.rh, 44), 44, 500);
      }, MOVE);
    },
  };

  return [storyboard, ...montage, outro];
}
