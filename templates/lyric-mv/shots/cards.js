// Title card over the intro, end card after the last line. Text comes from studio.json
// (title, artist, credits); times come from the song and the lyrics.
import { drawText, ease } from '../engine/studio.js';
import { motion, palette } from './style.js';

export function titleCard({ film, song, lyrics }) {
  const st = film.studio;
  if (!st.title) return [];
  const first = lyrics.lines[0];
  // Until just before the first sung line, but at least to bar 2 and at most to bar 5.
  const end = Math.max(song.T(2), Math.min(first ? first.start - motion.lead - 0.4 : Infinity, song.T(5)));
  return {
    id: 'TITLE',
    start: 0,
    end,
    layer: 5,
    cut: false,
    draw(ctx, s) {
      const { width: W, height: H } = s;
      // Visible from frame 0: the first frame is the thumbnail players show before play.
      const a = 1 - ease.in(s.out(motion.titleOut));
      const spacing = 0.32 - 0.12 * ease.out(s.u); // the title slowly tightens
      drawText(ctx, st.title, W / 2, H * 0.47, { size: H * 0.1, weight: 200, align: 'center', baseline: 'middle', spacing, fill: palette.paper, alpha: a });
      if (st.artist) drawText(ctx, st.artist, W / 2, H * 0.47 + H * 0.1, { size: H * 0.03, weight: 400, align: 'center', baseline: 'middle', spacing: 0.3, fill: palette.paper, alpha: 0.7 * a });
    },
  };
}

export function endCard({ film, song, lyrics }) {
  const st = film.studio;
  const last = lyrics.lines[lyrics.lines.length - 1];
  const after = Math.max(last ? last.end + motion.fade + 0.2 : 0, song.duration - 6);
  const start = Math.min(song.nextBeat(after - 1e-3), song.duration - 2);
  if (start <= 0 || start >= song.duration - 0.5) return [];
  return {
    id: 'END',
    start,
    end: song.duration,
    layer: 5,
    cut: false,
    draw(ctx, s) {
      const { width: W, height: H } = s;
      const a = ease.out(s.in(1.2));
      if (st.title) drawText(ctx, st.title, W / 2, H * 0.46, { size: H * 0.06, weight: 300, align: 'center', baseline: 'middle', spacing: 0.2, fill: palette.paper, alpha: a });
      if (st.credits) drawText(ctx, st.credits, W / 2, H * 0.46 + H * 0.08, { size: H * 0.022, weight: 400, align: 'center', baseline: 'middle', spacing: 0.15, fill: palette.paper, alpha: 0.6 * a });
      // The picture fades to black over the last 1.5 s.
      ctx.fillStyle = `rgba(0, 0, 0, ${ease.inOut(s.out(1.5)).toFixed(4)})`;
      ctx.fillRect(0, 0, W, H);
    },
  };
}
