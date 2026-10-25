// Backdrop: one shot per section of the song, so the cuts land on the analysed section starts.
// Soft fields of light drift with the music; choruses add a ring on every downbeat.
import { color, ease, hash, lerp, mod, noise2, pulse, TAU } from '../engine/studio.js';
import { moodOf, palette } from './style.js';

export function backdrop({ song }) {
  const secs = song.sections.length ? song.sections : [{ name: 'verse', start: 0, end: song.duration }];
  return secs
    .map((sec, i) => ({
      id: `S${String(i + 1).padStart(2, '0')}`,
      start: i === 0 ? 0 : sec.start,
      end: i === secs.length - 1 ? song.duration : secs[i + 1].start,
      draw: (ctx, s) => lightField(ctx, s, sec, i),
    }))
    .filter(shot => shot.end > shot.start);
}

// Dust: fixed seeds, positions are a function of time only.
const DUST = Array.from({ length: 80 }, (_, k) => ({ x: hash(k, 'x'), y: hash(k, 'y'), z: 0.3 + 0.7 * hash(k, 'z'), p: hash(k, 'p') }));

function lightField(ctx, s, sec, i) {
  const { t, width: W, height: H, song } = s;
  const m = moodOf(sec);
  const e = m.energy;
  // Kick drum if the analysis found one, otherwise the beat.
  const kick = Math.max(song.hit('kick', t, 0.16), 0.6 * song.hit('beat', t, 0.12));
  const loud = song.env('rms', t); // 0–1; 0 without an analysed song

  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const x = W * (0.5 + 0.38 * noise2(t * 0.045 * (0.6 + e), k * 7.1, i));
    const y = H * (0.5 + 0.32 * noise2(k * 3.3, t * 0.04 * (0.6 + e), i + 11));
    const r = H * (0.55 + 0.12 * k) * (1 + 0.06 * e * kick);
    const a = (0.26 + 0.22 * e) * (0.8 + 0.4 * loud) * (k === 2 ? 0.6 : 1);
    const c = k === 1 ? m.b : m.a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.alpha(c, a));
    g.addColorStop(1, color.alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = palette.paper;
  for (const d of DUST) {
    const y = mod(d.y - t * 0.012 * d.z * (0.5 + e), 1) * H;
    const x = (d.x + 0.01 * Math.sin(TAU * (t * 0.05 + d.p))) * W;
    const size = 1.2 + 2.2 * d.z;
    ctx.globalAlpha = (0.08 + 0.3 * d.z) * (0.4 + 0.6 * e);
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  if (e >= 0.9) {
    // A ring that leaves the centre on every downbeat.
    const bar = song.hit('downbeat', t, 0.45);
    ctx.strokeStyle = color.alpha(palette.paper, 0.2 * bar);
    ctx.lineWidth = 2 + 4 * bar;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.45, H * lerp(0.12, 0.62, ease.out(1 - bar)), 0, TAU);
    ctx.stroke();
    // The chorus arrives with a soft swell of light (one change, not a flash).
    const swell = 0.22 * pulse(t, sec.start, 0.15);
    if (swell > 0.003) {
      ctx.fillStyle = color.alpha(palette.paper, swell);
      ctx.fillRect(0, 0, W, H);
    }
  }
}
