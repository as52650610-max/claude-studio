// One shot that shows the whole contract: times from the grid, motion from springs, a pulse
// on every beat, text drawn with the project font. Replace it with your film.
import { drawText, lerp, span, spring, TAU } from '../engine/studio.js';

export function hello({ song }) {
  return {
    id: 'S01',
    start: 0,
    end: song.duration,
    sfx: [{ t: song.T(2), sound: 'pop', why: 'the dot lands on bar 2' }],
    draw(ctx, s) {
      const { t, width: W, height: H } = s;
      // The dot drops in on bar 2 (a spring settles it) and pulses on every beat after.
      const land = song.T(2);
      const y = lerp(-H * 0.2, H * 0.5, spring(t - land + 0.35, { freq: 11, damp: 0.6 }));
      const r = H * 0.06 * (1 + 0.25 * song.hit('beat', t, 0.1) * span(t, land, land + 0.01));
      ctx.fillStyle = '#ff6a3d';
      ctx.beginPath();
      ctx.arc(W / 2, y, r, 0, TAU);
      ctx.fill();
      // Bar and beat, always in sync with the music.
      const p = song.position(t);
      drawText(ctx, `${p.bar}.${p.beat}`, W / 2, H * 0.78, { size: H * 0.05, weight: 300, align: 'center', fill: '#f2efe8', spacing: 0.1 });
      drawText(ctx, '你好', W / 2, H * 0.26, { size: H * 0.09, weight: 700, align: 'center', fill: '#f2efe8' });
    },
  };
}
