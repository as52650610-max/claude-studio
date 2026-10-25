// The page every chapter is printed on: the Swiss card's paper, ink and one red on its 12-column
// grid (styles/swiss-kinetic), a running header, and the plan of the film. Bars are the bars of
// music.json; every time comes from the analysed beats through song.T, never a number of seconds.
import { drawText, ease, span } from '../engine/studio.js';
import { INK, PAPER, RED, grid, rise } from './styles/swiss.js';

export { INK, PAPER, RED, grid, rise };
export const FAMILY = 'Noto Sans TC';
export const MOVE = 0.22; // as on the card: every move is over in under a quarter of a second
export const TINT = 'rgba(17, 17, 17, 0.2)'; // ink at 20%: known, not heard yet

// The parts of the song. The analyser found 3 sections (parts under 4 bars are merged), so the
// names come from the plan; where each bar starts comes from the measured beats.
export const PARTS = [
  { zh: '前奏', en: 'INTRO', bars: [1, 3] },
  { zh: '主歌', en: 'VERSE', bars: [3, 7] },
  { zh: '導歌', en: 'PRE', bars: [7, 9] },
  { zh: '副歌', en: 'CHORUS', bars: [9, 15] },
  { zh: '尾奏', en: 'OUTRO', bars: [15, 17] },
];

// The six chapters: the steps of the workflow, one per part of the song. [from, to) in bars.
export const CHAPTERS = [
  { n: '01', zh: '聽', en: 'LISTEN', bars: [1, 3] },
  { n: '02', zh: '對拍', en: 'TIME LOCK', bars: [3, 5] },
  { n: '03', zh: '歌詞', en: 'LYRICS', bars: [5, 7] },
  { n: '04', zh: '分鏡', en: 'STORYBOARD', bars: [7, 9] },
  { n: '05', zh: '風格', en: 'STYLE', bars: [9, 15] },
  { n: '06', zh: '交片', en: 'DELIVER', bars: [15, 17] },
];
export const LAST_BAR = 16;

/** Text in the film's one family; returns the width drawn. */
export function type(ctx, text, x, y, size, weight = 400, opts = {}) {
  return drawText(ctx, text, x, y, { size, weight, family: FAMILY, fill: INK, ...opts });
}

/** The baseline that puts a line of `size` px type at the foot of a box ending at `bottom`. */
export const foot = (bottom, size) => bottom - 0.12 * size;

/** A chapter's title on row 0: number, word and English on one baseline, rising on its downbeat. */
export function chapterTitle(ctx, G, t, t0, ch, { cols = 12 } = {}) {
  const y = foot(G.y(0) + G.rh, G.rh);
  rise(ctx, t, t0, [G.x(0), G.y(0), G.w(cols), G.rh], () => {
    type(ctx, ch.n, G.x(0), y, G.rh, 300);
    type(ctx, ch.zh, G.x(1), y, G.rh, 900);
    type(ctx, ch.en, G.x(3), y, 28, 700, { spacing: 0.12 });
  });
}

/** The paper and its grid: the column edges draw themselves on the first downbeat, as on the card. */
export function paper({ song, width: W, height: H }) {
  const G = grid(W, H), t0 = song.T(1);
  return {
    id: 'paper',
    start: 0,
    end: song.duration,
    cut: false,
    draw(ctx, { t }) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.1;
      for (let c = 0; c < G.cols * 2; c++) {
        const u = ease.expoOut(span(t, t0 + c * 0.02, t0 + c * 0.02 + MOVE));
        if (u <= 0) continue;
        const x = c % 2 ? G.x(c >> 1) + G.cw - 1 : G.x(c >> 1);
        ctx.fillRect(x, G.my, 1, G.h(G.rows) * u);
      }
      ctx.globalAlpha = 1;
    },
  };
}

/** The running header in the top margin: the film's name, and where in the song we are. */
export function header({ song, width: W, height: H }) {
  const G = grid(W, H), right = G.x(G.cols - 1) + G.cw, y = 50;
  const end = song.T(LAST_BAR + 1), beats = Math.round(song.beatAt(end) - song.beatAt(song.T(1)));
  return {
    id: 'header',
    start: song.T(1),
    end,
    layer: 5,
    cut: false,
    draw(ctx, { t }) {
      const w = type(ctx, '從一首歌到一支 MV', G.x(0), y, 18, 700);
      type(ctx, 'FROM A SONG TO A MUSIC VIDEO', G.x(0) + w + 24, y, 14, 700, { spacing: 0.12 });
      const { bar } = song.position(t), beat = Math.floor(song.beatAt(t) - song.beatAt(song.T(1)) + 1e-6) + 1;
      const pad = n => String(n).padStart(2, '0');
      type(ctx, `小節 ${pad(bar)} / ${LAST_BAR}　拍 ${pad(beat)} / ${beats}`, right, y, 18, 500, { align: 'right' });
      ctx.fillStyle = INK;
      ctx.fillRect(G.x(0), y + 12, right - G.x(0), 1);
    },
  };
}
