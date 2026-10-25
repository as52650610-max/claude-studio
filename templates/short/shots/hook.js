// The hook: one line at the top for the first seconds (visible from frame 0, which is the
// thumbnail), then the song label stays small in the corner.
import { drawText, ease, fitText, fontString } from '../engine/studio.js';
import { palette, safe } from './style.js';

export function hook({ film, song }) {
  const st = film.studio;
  const shots = [];
  // Two bars from the first downbeat of the film (in an excerpt, song bar numbers start before 0).
  const downs = song.downbeats.filter(d => d >= -0.05);
  if (st.hook) {
    shots.push({
      id: 'HOOK',
      start: 0,
      end: Math.min(song.duration, Math.max(2.5, downs[2] ?? 0)),
      layer: 6,
      cut: false,
      draw(ctx, s) {
        const { width: W, height: H } = s;
        const a = 1 - ease.in(s.out(0.4));
        const max = W * (safe.right - safe.left);
        const size = Math.min(H * 0.045, fitText(ctx, st.hook, max * 0.9, { weight: 900, maxSize: H * 0.045 }));
        const x = W * (safe.left + safe.right) / 2, y = H * (safe.top + 0.07);
        ctx.font = fontString({ size, weight: 900 });
        const w = Math.min(max, ctx.measureText(st.hook).width + size * 1.2);
        ctx.globalAlpha = a;
        ctx.fillStyle = palette.accent;
        ctx.fillRect(x - w / 2, y - size * 0.95, w, size * 1.9);
        ctx.globalAlpha = 1;
        drawText(ctx, st.hook, x, y, { size, weight: 900, align: 'center', baseline: 'middle', fill: palette.ink, alpha: a });
      },
    });
  }
  if (st.title) {
    const label = st.artist ? `${st.title} — ${st.artist}` : st.title;
    shots.push({
      id: 'LABEL',
      start: 0,
      end: song.duration,
      layer: 6,
      cut: false,
      draw(ctx, s) {
        const { width: W, height: H } = s;
        drawText(ctx, label, W * safe.left, H * (safe.bottom - 0.02), { size: H * 0.018, weight: 500, fill: palette.paper, alpha: 0.75 });
      },
    });
  }
  return shots;
}
