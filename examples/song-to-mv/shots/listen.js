// 01 聽 LISTEN. The comb (timeline.js) records the intro as it is heard; after one bar the
// measurements land, one a beat: the tempo, the metre and where the first downbeat is. All three
// are read from data/songmap.json, so they are what the analyser measured, not what was planned.
import { CHAPTERS, MOVE, RED, chapterTitle, foot, grid, rise, type } from './page.js';

export function listen({ song, width: W, height: H }) {
  const G = grid(W, H), T = (...a) => song.T(...a), ch = CHAPTERS[0];
  const size = 160, y = foot(G.y(7) + G.rh, size);
  const readings = [
    { at: T(2, 1), col: 0, label: '速度　TEMPO', value: song.bpm.toFixed(2), unit: 'BPM' },
    { at: T(2, 2), col: 5, label: '拍號　METER', value: `${song.beatsPerBar}/4`, unit: '' },
    { at: T(2, 3), col: 8, label: '第一拍　DOWNBEAT', value: song.downbeats[0].toFixed(3), unit: 's' },
  ];
  return {
    id: 'listen',
    start: T(ch.bars[0]),
    end: T(ch.bars[1]),
    layer: 2,
    sfx: readings.map((r, i) => ({ t: r.at, sound: 'click', params: { pitch: 4 * i }, why: `the ${r.label.split('　')[1].toLowerCase()} reading lands`, role: 'click', gain: -14 })),
    draw(ctx, { t }) {
      chapterTitle(ctx, G, t, T(ch.bars[0]), ch);
      for (const r of readings) {
        const x = G.x(r.col);
        rise(ctx, t, r.at, [x, G.y(6), G.w(12 - r.col), G.h(2)], () => {
          type(ctx, r.label, x, G.y(6) + 24, 18, 700);
          const w = type(ctx, r.value, x - 6, y, size, 300);
          if (r.unit) type(ctx, r.unit, x - 6 + w + 12, y, 28, 700, { spacing: 0.12 });
        }, MOVE);
      }
      // a red hairline under the labels as each reading lands
      for (const r of readings) {
        const u = Math.min(1, Math.max(0, (t - r.at) / 0.3));
        if (u <= 0 || u >= 1) continue;
        ctx.globalAlpha = 1 - u;
        ctx.fillStyle = RED;
        ctx.fillRect(G.x(r.col), G.y(6) + 36, G.w(r.col === 0 ? 5 : 3), 2);
        ctx.globalAlpha = 1;
      }
    },
  };
}
