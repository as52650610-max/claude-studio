// The title page: the Swiss card's own layout A (two-row headlines with the English on their
// baselines) and its red flag in the corner. It is the first frame, held through the count-in,
// and the last page, built again after the last bar while the song's tail rings out.
import { CHAPTERS, MOVE, RED, foot, grid, rise, type } from './page.js';

export function titlePage({ song, width: W, height: H }) {
  const G = grid(W, H), T = (...a) => song.T(...a), t0 = T(17);
  const HEAD = G.h(2), base = r => G.y(r) + G.h(2) - 0.12 * HEAD, right = G.x(G.cols - 1) + G.cw;
  const lines = [
    { zh: '從一首歌', en: 'FROM A SONG', row: 2, at: t0 },
    { zh: '到一支 MV', en: 'TO A MUSIC VIDEO', row: 4, at: T(17, 1, 3) },
  ];
  function page(ctx, t) {
    rise(ctx, t, t0, [G.x(0), G.y(0), G.w(10), G.rh], () => {
      type(ctx, 'CLAUDE-STUDIO', G.x(0), G.y(0) + 30, 24, 700, { spacing: 0.12 });
      type(ctx, CHAPTERS.map(c => c.zh).join('　'), G.x(0), G.y(0) + 70, 24, 500);
    });
    for (const l of lines) {
      rise(ctx, t, l.at, [G.x(0), G.y(l.row), G.w(7), G.h(2)], () => {
        const [a, b] = l.zh.split(' ');
        const w = type(ctx, a, G.x(0), base(l.row), HEAD, 900);
        if (b) type(ctx, b, G.x(0) + w + 0.25 * HEAD, base(l.row), HEAD, 900, { fill: RED });
      });
      rise(ctx, t, l.at + 0.125, [G.x(7), G.y(l.row), G.w(5), G.h(2)], () => type(ctx, l.en, G.x(7), base(l.row), 56, 700, { spacing: 0.02 }));
    }
    rise(ctx, t, T(17, 2), [G.x(0), G.y(7), G.w(12), G.rh], () => {
      type(ctx, '音樂、歌詞和每一格畫面都是程式　Music, lyrics and every frame: code', G.x(0), foot(G.y(7) + G.rh, 24), 24, 500);
      type(ctx, 'MIT', right, foot(G.y(7) + G.rh, 24), 24, 700, { align: 'right' });
    }, MOVE);
    // the flag: one module of red, top right, as the card ends
    const u = Math.min(1, Math.max(0, (t - t0) / MOVE));
    ctx.fillStyle = RED;
    ctx.fillRect(G.x(11), G.y(0), G.cw, G.rh * (1 - Math.pow(1 - u, 4)));
  }
  return [
    // The count-in shows where the film is going; the first downbeat cuts to an empty page.
    { id: 'open', start: 0, end: T(1), layer: 2, draw: ctx => page(ctx, Infinity) },
    {
      id: 'end',
      start: t0,
      end: song.duration,
      layer: 2,
      sfx: [{ t: t0, sound: 'bell', params: { note: 79, dur: 1.6 }, why: 'the last page: a G, the key of the song', role: 'brand', gain: -10 }],
      draw: (ctx, { t }) => page(ctx, t),
    },
  ];
}
