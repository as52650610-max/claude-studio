// Backdrop: wide diagonal bands that step forward on every beat, one shot per section.
// Low contrast on purpose: moving high-contrast stripes count as flashing.
import { clamp, color, ease } from '../engine/studio.js';
import { moodOf } from './style.js';

export function bands({ song }) {
  // In an excerpt, sections before the start (negative times) and after the end are cut away.
  const secs = (song.sections.length ? song.sections : [{ name: 'chorus', start: 0, end: song.duration }]).filter(s => s.end > 0 && s.start < song.duration);
  return secs
    .map((sec, i) => ({
      id: `S${String(i + 1).padStart(2, '0')}`,
      start: i === 0 ? 0 : sec.start,
      end: i === secs.length - 1 ? song.duration : secs[i + 1].start,
      draw: (ctx, s) => drawBands(ctx, s, sec),
    }))
    .filter(shot => shot.end > shot.start);
}

function drawBands(ctx, s, sec) {
  const { t, width: W, height: H, song } = s;
  const m = moodOf(sec);
  ctx.fillStyle = m.b;
  ctx.fillRect(0, 0, W, H);
  // A staircase in time: each beat moves the bands a quarter step, settling in 0.35 beats.
  const p = song.beatAt(t);
  const step = Math.floor(p) + ease.out(clamp((p - Math.floor(p)) / 0.35));
  const bw = H * 0.2;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.38);
  for (let k = -7; k <= 7; k++) {
    const x = (k + ((step * 0.25) % 2)) * bw * 1.7;
    ctx.fillStyle = k % 2 ? m.a : color.mix(m.a, m.b, 0.55);
    ctx.globalAlpha = 0.18 + 0.22 * m.energy;
    ctx.fillRect(x - bw / 2, -H, bw, H * 2);
  }
  ctx.restore();
  // Kick (or beat) breathes the whole frame a little.
  const kick = Math.max(song.hit('kick', t, 0.14), 0.5 * song.hit('beat', t, 0.1));
  ctx.fillStyle = color.alpha('#ffffff', 0.05 * m.energy * kick);
  ctx.fillRect(0, 0, W, H);
}
