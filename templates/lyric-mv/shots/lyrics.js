// Karaoke lyrics in the lower third. A line appears motion.lead seconds before it is sung, fills
// with the voice (never ahead of it), and slides up and fades when the next line arrives.
// Translations (data/lyrics.json "translation") sit under the line.
import { clamp, drawText, ease, fitText, karaoke } from '../engine/studio.js';
import { motion, palette } from './style.js';

export function lyricLayer({ film, lyrics, song }) {
  if (!lyrics.hasText) return [];
  const st = film.studio;
  const family = st.lyricFont || undefined;
  const size0 = st.lyricSize || 84;
  const tsize0 = st.translationSize || Math.round(size0 * 0.5);
  const { lead, fade } = motion;
  return {
    id: 'LYR',
    start: 0,
    end: song.duration,
    layer: 10,
    cut: false,
    draw(ctx, s) {
      const { t, width: W, height: H } = s;
      const lines = lyrics.lines;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i], next = lines[i + 1];
        if (t < l.start - lead || t > l.end + fade) continue;
        const size = Math.min(size0, fitText(ctx, l.text, W * 0.86, { family, weight: 700, maxSize: size0 }));
        const leave = next ? clamp((t - (next.start - lead)) / lead) : 0;
        const y = H * 0.84 - ease.out(leave) * size * 1.3;
        ctx.save();
        ctx.globalAlpha = 1 - leave;
        karaoke(ctx, l, t, { x: W / 2, y, size, family, weight: 700, lead, fadeOut: fade, fill: palette.paper, base: palette.dim, stroke: 'rgba(0, 0, 0, 0.35)', strokeWidth: size * 0.08 });
        if (l.translation) {
          const appear = clamp((t - (l.start - lead)) / lead) * (1 - clamp((t - l.end) / fade));
          const tsize = Math.min(tsize0, fitText(ctx, l.translation, W * 0.86, { family, weight: 400, maxSize: tsize0 }));
          drawText(ctx, l.translation, W / 2, y + tsize * 1.6, { size: tsize, family, weight: 400, align: 'center', fill: palette.paper, alpha: 0.72 * appear });
        }
        ctx.restore();
      }
    },
  };
}
