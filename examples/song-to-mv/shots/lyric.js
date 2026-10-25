// The lyrics. Every character's time is an onset measured on the vocals stem (data/lyrics.json).
// 03 歌詞 LYRICS lays line 2 out in time instead of in a row: each character stands where its note
// starts, over a bar as long as the note, and lands when it is sung. Lines 1, 3, 4 and 5 run as a
// plain karaoke line at the foot of the page: grey before, ink once sung, red while it is sung.
import { lens } from './timeline.js';
import { CHAPTERS, INK, MOVE, RED, TINT, chapterTitle, foot, grid, rise, type } from './page.js';

const SPACE = '　';

export function lyricChapter({ song, lyrics, width: W, height: H }) {
  const G = grid(W, H), T = (...a) => song.T(...a), ch = CHAPTERS[2];
  // Laid out on the lens once it has settled on bars 5–6, not on the lens as it moves: the words
  // wait in place and the comb zooms in under them. (Riding the move, all nine start in one heap.)
  const v = lens(song, G)(T(6));
  const line = lyrics.lines[1];
  const notes = line.chars.filter(c => c.c !== SPACE).map((c, i, all) => {
    const next = all[i + 1]?.start ?? c.end;
    return { ...c, next, x: v.x(c.start), w: Math.max(4, v.x(next) - v.x(c.start) - 8) };
  });
  const size = 96, base = 440, bar = { y: 470, h: 10 };
  return {
    id: 'lyrics',
    start: T(ch.bars[0]),
    end: T(ch.bars[1]),
    layer: 2,
    draw(ctx, { t }) {
      chapterTitle(ctx, G, t, T(ch.bars[0]), ch);
      // the row rises with the chapter: each word waiting in tint over its note and its time
      rise(ctx, t, T(ch.bars[0]), [G.x(0), base - size, G.w(12), bar.y + 48 - (base - size)], () => {
        for (const c of notes) {
          // the note: tint ahead, red while it sounds, ink once it is over
          ctx.fillStyle = TINT;
          ctx.fillRect(c.x, bar.y, c.w, bar.h);
          if (t >= c.start) {
            ctx.fillStyle = t < c.next ? RED : INK;
            ctx.fillRect(c.x, bar.y, c.w * Math.min(1, (t - c.start) / (c.next - c.start)), bar.h);
          }
          type(ctx, c.c, c.x, base, size, 900, { fill: TINT });
          type(ctx, c.start.toFixed(2), c.x, bar.y + 40, 16, t >= c.start ? 700 : 500, { fill: t >= c.start ? INK : TINT });
        }
      }, MOVE);
      // each word lands in ink on its note
      for (const c of notes) rise(ctx, t, c.start, [c.x - 4, base - size, size + 8, size * 1.2], () => type(ctx, c.c, c.x, base, size, 900), MOVE);
      rise(ctx, t, T(5, 2), [G.x(0), G.y(6), G.w(12), G.h(2)], () => {
        type(ctx, '每個字的時間　WHERE EACH WORD STARTS', G.x(0), G.y(6) + 24, 18, 700);
        type(ctx, `${notes.length} 個字，${notes.length} 個音：從人聲分軌量到的起音`, G.x(0), foot(G.y(6) + G.rh, 40), 40, 700);
        type(ctx, line.translation, G.x(0), foot(G.y(7) + G.rh, 28), 28, 500);
      });
    },
  };
}

/** Lines 1, 3, 4 and 5: shown for the bars they are sung in, at the foot of the page. */
export function lyricLine({ song, lyrics, width: W, height: H }) {
  const G = grid(W, H), T = (...a) => song.T(...a), right = G.x(G.cols - 1) + G.cw;
  const size = 64, y = foot(G.y(7) + G.rh, size);
  const shown = [[0, 3, 5], [2, 9, 11], [3, 11, 13], [4, 13, 15]].map(([i, a, b]) => ({ l: lyrics.lines[i], from: T(a), to: T(b) }));
  return shown.map(({ l, from, to }) => ({
    id: `line${l.i + 1}`,
    start: from,
    end: to,
    layer: 6,
    cut: false,
    draw(ctx, { t }) {
      rise(ctx, t, from, [G.x(0), G.y(7) - 12, G.w(12), G.rh + 12], () => {
        let x = G.x(0);
        l.chars.forEach((c, j) => {
          if (c.c === SPACE) return void (x += size * 0.5);
          const next = l.chars.slice(j + 1).find(n => n.c !== SPACE);
          const now = t >= c.start && (next ? t < next.start : t < c.end + 0.5);
          x += type(ctx, c.c, x, y, size, 900, { fill: t < c.start ? TINT : now ? RED : INK });
        });
        type(ctx, l.translation, right, y, 24, 500, { align: 'right' });
      });
    },
  }));
}
