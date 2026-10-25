// Big lyrics in the middle of the safe box: the line is readable ahead (dim), and each
// character pops to full white the moment it is sung. Lines marked "keyword": true in
// data/lyrics.json use the accent colour.
import { clamp, ease, fontString, graphemes, lerp, wrapText } from '../engine/studio.js';
import { palette, safe } from './style.js';

export function bigLyrics({ film, lyrics, song }) {
  if (!lyrics.hasText) return [];
  const st = film.studio;
  const family = st.lyricFont || undefined;
  const size0 = st.lyricSize || 128;
  return {
    id: 'LYR',
    start: 0,
    end: song.duration,
    layer: 10,
    cut: false,
    draw(ctx, s) {
      const { t, width: W, height: H } = s;
      const l = lyrics.lineAt(t, { lead: 0.2, hold: 0.3 });
      if (!l) return;
      const boxW = W * (safe.right - safe.left) * 0.94;
      const cx = W * (safe.left + safe.right) / 2, cy = H * (safe.top + safe.bottom) / 2 + H * 0.03;
      const { size, rows } = layout(ctx, l.text, boxW, size0, family);
      const lineH = size * 1.22;
      const out = 1 - clamp((t - l.end) / 0.3); // fades after the line ends
      const ink = l.keyword ? palette.accent : palette.paper;
      ctx.font = fontString({ size, family, weight: 900 });
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      let k = 0; // index into l.chars, which carry the sung times
      rows.forEach((row, r) => {
        const glyphs = graphemes(row);
        const widths = glyphs.map(g => ctx.measureText(g).width);
        let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
        const y = cy + (r - (rows.length - 1) / 2) * lineH;
        glyphs.forEach((g, j) => {
          while (k < l.chars.length && l.chars[k].c !== g && /\s/.test(l.chars[k].c)) k++;
          const c = l.chars[k] && l.chars[k].c === g ? l.chars[k++] : null;
          const u = c ? clamp((t - c.start + 0.06) / 0.16) : 1;
          const gx = x + widths[j] / 2;
          if (u < 1) {
            ctx.globalAlpha = out;
            ctx.fillStyle = palette.dim;
            ctx.fillText(g, gx, y);
          }
          if (u > 0) {
            const scale = lerp(1.25, 1, ease.out(u)); // lands from slightly larger
            ctx.save();
            ctx.translate(gx, y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = out * u;
            ctx.fillStyle = ink;
            ctx.fillText(g, 0, 0);
            ctx.restore();
          }
          x += widths[j];
        });
      });
      ctx.globalAlpha = 1;
    },
  };
}

/** One line if it fits at ≥ 75% size; otherwise rows of balanced length, never a lone character. */
function layout(ctx, text, boxW, size0, family) {
  ctx.font = fontString({ size: size0, family, weight: 900 });
  const full = ctx.measureText(text).width;
  if (full <= boxW) return { size: size0, rows: [text] };
  if (full * 0.75 <= boxW) return { size: (size0 * boxW) / full, rows: [text] };
  let size = size0;
  for (;;) {
    ctx.font = fontString({ size, family, weight: 900 });
    const width = ctx.measureText(text).width;
    const n = Math.ceil(width / boxW);
    const rows = wrapText(ctx, text, Math.min(boxW, (width / n) * 1.08));
    if (rows.length <= 3 || size < 56) return { size, rows };
    size *= 0.9;
  }
}
