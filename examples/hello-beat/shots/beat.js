// hello, beat: the smallest complete film. One dot follows one song, and the screen shows what
// drives each motion. Every time comes from data/songmap.json (studio analyze) or the bar grid
// (song.T); there is no hard-coded second, so the picture stays on the music.
import { color, drawText, ease, fontString, lerp, span, spring, TAU } from '../engine/studio.js';

const INK = '#111111', RED = '#FF4D2E', PAPER = '#F2EFE8';
const DIM = color.alpha(INK, 0.32);
const CX = 960, CY = 450, R = 84; // the dot, in a 1920×1080 frame
const TOL = 0.03; // analysed beats and hits can disagree by a few milliseconds

// The arrangement in bars, as music.json wrote it. The analysis finds every bar line but merges
// sections this short, so the parts are named here; their times still come from the beats.
const PARTS = [
  { zh: '前奏', en: 'intro', from: 1, to: 3 },
  { zh: '主歌', en: 'verse', from: 3, to: 5 },
  { zh: '導歌', en: 'pre-chorus', from: 5, to: 7 },
  { zh: '副歌', en: 'chorus', from: 7, to: 11 },
  { zh: '尾奏', en: 'outro', from: 11, to: 13 },
];

/** The moments every shot shares. */
function moments({ song, width: W, height: H }) {
  // The snare roll of the build, on the grid music.py plays it: eighths in bar 5, then
  // sixteenths in bar 6 up to the stop on its fourth beat. Twenty hits.
  const roll = [];
  for (let q = 1; q <= 4; q++) roll.push(song.T(5, q), song.T(5, q, 3));
  for (let q = 1; q <= 3; q++) for (let x = 1; x <= 4; x++) roll.push(song.T(6, q, x));
  const drop = song.events('impact')[0]?.t ?? song.T(7), fold = song.T(11);
  const full = Math.hypot(W, H); // a disc this big covers the frame from anywhere
  return {
    land: song.T(1),
    build: song.T(5),
    roll,
    stop: song.stops[0] || { start: song.T(6, 4), end: song.T(7) },
    drop,
    fold,
    last: song.T(13), // where bar 13 would begin: the song is over
    /** The chorus is a red disc around the dot: its radius at t, 0 outside the chorus. */
    red(t) {
      if (t < drop || t >= fold + 0.45) return 0;
      const open = ease.out(span(t, drop, drop + 0.32));
      const close = ease.inOut(span(t, fold, fold + 0.45));
      return lerp(lerp(R * 0.7, full, open), R, close);
    },
  };
}

/** Seconds since the latest time in a sorted list at or before t (Infinity before the first). */
function since(times, t) {
  let last = -Infinity;
  for (const x of times) {
    if (x > t) break;
    last = x;
  }
  return t - last;
}

function disc(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** The dot: falls onto bar 1, pulses on every kick, charges up in the build, holds its breath in the stop. */
export function dot(api) {
  const { song } = api;
  const m = moments(api);
  const snares = song.events('snare').map(e => e.t);
  return {
    id: 'dot',
    start: 0,
    end: m.last,
    layer: 1,
    sfx: [{ t: m.land, sound: 'pop', why: 'the dot lands on bar 1', role: 'click', gain: -4 }],
    draw(ctx, s) {
      const { t } = s;
      if (t >= m.drop && t < m.fold + 0.45) return; // inside the chorus, which swallowed it
      // Waiting at the top, then gravity: it lands exactly on bar 1, squashes and wobbles.
      let y = CY, sx = 1, sy = 1;
      if (t < m.land) {
        const f = ease.quadIn(span(t, m.land - 0.3, m.land));
        y = lerp(200, CY, f);
        sx = lerp(1, 0.88, f);
        sy = lerp(1, 1.16, f);
      } else {
        const k = 1 - spring(t - m.land, { freq: 22, damp: 0.3 }); // 1 on landing → 0, wobbling
        sx = 1 + 0.25 * k;
        sy = 1 - 0.3 * k;
        y = CY + R * 0.3 * k; // the bottom stays on the floor while it squashes
      }
      // A pulse on every kick; through the build it shrinks (anticipation) before the drop.
      let r = R * (1 + 0.2 * song.hit('kick', t, 0.09));
      r *= lerp(1, 0.7, ease.in(span(t, m.build, m.stop.start)));
      const fill = t >= m.fold ? RED : INK; // after the chorus the dot keeps its colour
      ctx.save();
      ctx.translate(CX, y);
      ctx.scale(sx, sy);
      if (song.isStop(t)) {
        // The band drops out, and so does the dot: only its outline keeps the place.
        ctx.beginPath();
        ctx.arc(0, 0, r - 3, 0, TAU);
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.restore();
        return;
      }
      disc(ctx, 0, 0, r, fill);
      ctx.restore();

      // Every snare flicks a ring off the dot (the build has its own ring, below).
      const ds = since(snares, t);
      if (ds < 0.32 && (t < m.build || t >= m.fold)) {
        const u = ds / 0.32;
        ctx.beginPath();
        ctx.arc(CX, y, r * lerp(1.15, 1.9, ease.out(u)), 0, TAU);
        ctx.lineWidth = lerp(5, 1, u);
        ctx.strokeStyle = color.alpha(fill, 0.55 * (1 - u));
        ctx.stroke();
      }

      // The build: twenty ticks around the dot, one lit by each hit of the snare roll.
      const show = span(t, m.build - 0.12, m.build + 0.12);
      if (show > 0 && t < m.stop.start) {
        ctx.lineCap = 'round';
        ctx.globalAlpha = show;
        m.roll.forEach((hitAt, i) => {
          const a = -Math.PI / 2 + (i / m.roll.length) * TAU;
          const lit = t >= hitAt;
          const pop = lit ? Math.pow(0.5, (t - hitAt) / 0.06) : 0;
          const r0 = 150, r1 = 178 + 16 * pop;
          ctx.beginPath();
          ctx.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0);
          ctx.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
          ctx.lineWidth = lit ? 7 : 3;
          ctx.strokeStyle = lit ? RED : DIM;
          ctx.stroke();
        });
      }
    },
  };
}

/** The chorus: on the impact the dot bursts open into the words; on bar 11 it folds back. */
export function chorus(api) {
  const { song, width: W, height: H } = api;
  const m = moments(api);
  const far = Math.hypot(W, H) * 0.55;
  return {
    id: 'chorus',
    start: m.drop,
    end: m.fold + 0.45, // then the dot shot takes over the red dot
    layer: 2,
    sfx: [{ t: m.fold + 0.15, sound: 'whoosh', sync: 'peak', why: 'the red folds back into the dot', role: 'transition', gain: -6 }],
    draw(ctx, s) {
      const { t } = s;
      const r = m.red(t);
      disc(ctx, CX, CY, r, RED);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = 1 - span(t, m.fold, m.fold + 0.25);
      // A paper ring leaves the centre on every downbeat.
      const bar0 = song.prevDownbeat(t + TOL);
      const ub = span(t, bar0, bar0 + 0.7);
      if (ub < 1) {
        ctx.beginPath();
        ctx.arc(CX, CY, lerp(R, far, ease.out(ub)), 0, TAU);
        ctx.lineWidth = lerp(10, 1, ub);
        ctx.strokeStyle = color.alpha(PAPER, 0.5 * (1 - ub));
        ctx.stroke();
      }
      // The words: one language per bar, cut on the downbeat. Each bar slams them in, each kick pushes.
      const zh = song.position(t + TOL).bar % 2 === 1;
      const [big, small] = zh ? ['你好，節拍', 'hello, beat'] : ['hello, beat', '你好，節拍'];
      const slam = 1 - ease.out(span(t, bar0, bar0 + 0.18));
      const k = 1 + 0.14 * slam + 0.035 * song.hit('kick', t, 0.08);
      ctx.translate(CX, CY);
      ctx.scale(k, k);
      drawText(ctx, big, 0, 0, { size: 200, weight: 900, align: 'center', baseline: 'middle', fill: INK });
      drawText(ctx, small, 0, 180, { size: 54, weight: 500, align: 'center', baseline: 'middle', fill: INK, alpha: 0.75 });
      ctx.restore();
    },
  };
}

/** The end card: the dot hops to the end of the line and falls into place as its full stop. */
export function ending(api) {
  const { song, height: H } = api;
  const m = moments(api);
  const over = m.last + 0.45, land = m.last + 0.75; // the same 0.3 s fall as the first one
  return {
    id: 'end',
    start: m.last,
    end: song.duration,
    layer: 3,
    cut: false, // the dot carries on from the outro: a move, not a cut
    sfx: [{ t: land, sound: 'bell', params: { note: 86, dur: 1.4 }, why: 'the dot lands as the full stop: a D, the key of the song', role: 'brand', gain: -10 }],
    draw(ctx, s) {
      const { t } = s;
      const size = 128, pr = 15, base = CY + 44;
      ctx.font = fontString({ size, weight: 700 });
      const w = ctx.measureText('hello, beat').width;
      const tx = CX - pr; // centre the words and the full stop together
      const px = tx + w / 2 + pr + 10, py = base - pr;
      const hop = ease.inOut(span(t, m.last, over));
      const fall = ease.quadIn(span(t, over, land));
      const x = lerp(CX, px, hop), y = lerp(CY, py - 220, hop) + 220 * fall;
      const r = lerp(R, pr, hop);
      // Stretched while it falls, squashed when it lands, as on bar 1; the bottom stays put.
      const k = t > land ? 1 - spring(t - land, { freq: 26, damp: 0.35 }) : 0;
      const sx = t < land ? 1 - 0.1 * fall : 1 + 0.3 * k;
      const sy = t < land ? 1 + 0.14 * fall : 1 - 0.25 * k;
      ctx.save();
      ctx.translate(x, y + r * (1 - sy));
      ctx.scale(sx, sy);
      disc(ctx, 0, 0, r, RED);
      ctx.restore();
      // Only then do the words appear in front of it.
      const a = ease.out(span(t, land + 0.05, land + 0.45));
      drawText(ctx, 'hello, beat', tx, base + 14 * (1 - a), { size, weight: 700, align: 'center', fill: INK, alpha: a });
      const b = ease.out(span(t, land + 0.25, land + 0.65));
      drawText(ctx, '你好，節拍', CX, base + 110, { size: 52, weight: 500, align: 'center', fill: INK, alpha: 0.7 * b });
      drawText(ctx, 'claude-studio · examples/hello-beat · music: tools/py/music.py, seed 7', CX, H - 96, { size: 22, align: 'center', fill: DIM, alpha: b });
    },
  };
}

/** The read-out: the part, bar.beat, the four beats of the bar, and the whole song as a strip. */
export function hud(api) {
  const { song, width: W } = api;
  const m = moments(api);
  const kicks = song.events('kick').map(e => e.t);
  const x0 = 160, x1 = W - 160, yl = 960;
  const X = t => lerp(x0, x1, t / song.duration);
  return {
    id: 'hud',
    start: 0,
    end: song.duration,
    layer: 4,
    draw(ctx, s) {
      const { t } = s;
      // Silence is part of the music: during the stop the frame holds only the dot.
      const shown = song.isStop(t) ? 0 : 1 - ease.in(span(t, m.last, m.last + 0.4));
      if (shown <= 0) return;
      ctx.globalAlpha = shown;
      // The accent is red on paper and paper on red: whatever lies under that spot of the frame.
      const accent = (x, y) => (Math.hypot(x - CX, y - CY) < m.red(t) ? PAPER : RED);
      const pos = song.position(t + TOL);
      const part = PARTS.find(p => t + TOL >= song.T(p.from) && t + TOL < song.T(p.to)) || (t >= m.land ? PARTS.at(-1) : null);

      // Top left: the title and the part of the song. Top right: where we are, as a musician counts.
      drawText(ctx, 'hello, beat', 120, 120, { size: 34, weight: 700, fill: INK });
      const lw = drawText(ctx, part ? `${part.zh}  ${part.en}` : '預備  count-in', 120, 168, { size: 26, weight: 500, fill: INK });
      if (part) drawText(ctx, `   bars ${part.from}–${part.to - 1}`, 120 + lw, 168, { size: 22, fill: DIM });
      drawText(ctx, `${Math.round(song.bpm)} BPM · ${song.beatsPerBar}/4`, W - 120, 104, { size: 22, align: 'right', fill: DIM });
      drawText(ctx, `${pos.bar}.${pos.beat}`, W - 120, 226, { size: 120, weight: 200, align: 'right', fill: INK });

      // The four beats of the bar: the one being played is filled, beat 1 in the accent.
      for (let b = 1; b <= 4; b++) {
        const size = 34, x = CX + (b - 2.5) * 58 - size / 2, y = 742;
        if (t >= m.land - TOL && pos.beat === b) {
          ctx.fillStyle = b === 1 ? accent(x, y) : INK;
          ctx.fillRect(x, y, size, size);
        } else {
          ctx.lineWidth = 2;
          ctx.strokeStyle = DIM;
          ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        }
      }

      // The song as a strip: parts, bars and beats, the kicks the analysis found, the stop, the impact.
      for (const p of PARTS) {
        const a = X(song.T(p.from)), cur = p === part;
        ctx.fillStyle = DIM;
        ctx.fillRect(a, yl - 70, 1, 76);
        drawText(ctx, `${p.zh} ${p.en}`, a + 10, yl - 52, { size: 18, weight: cur ? 700 : 400, fill: cur ? INK : DIM });
      }
      for (const [a, b] of [[0, m.stop.start], [m.stop.end, song.duration]]) {
        ctx.fillStyle = DIM; // the line breaks where the band stops
        ctx.fillRect(X(a), yl - 1, X(b) - X(a), 2);
        if (t > a) {
          ctx.fillStyle = INK;
          ctx.fillRect(X(a), yl - 2, X(Math.min(t, b)) - X(a), 4);
        }
      }
      for (const b of song.beats) {
        ctx.fillStyle = b <= t ? INK : DIM;
        ctx.fillRect(X(b) - 0.5, yl - 8, 1, 8);
      }
      song.downbeats.forEach((d, i) => {
        ctx.fillStyle = d <= t + TOL ? INK : DIM;
        ctx.fillRect(X(d) - 1, yl - 16, 2, 16);
        drawText(ctx, String(i + 1), X(d), yl + 32, { size: 16, align: 'center', fill: d <= t + TOL ? INK : DIM });
      });
      drawText(ctx, 'kick', x0 - 18, yl - 19, { size: 15, align: 'right', fill: DIM });
      drawText(ctx, 'bar', x0 - 18, yl + 32, { size: 15, align: 'right', fill: DIM });
      for (const k of kicks) {
        const r = 3.5 * (1 + 0.8 * (k <= t ? Math.pow(0.5, (t - k) / 0.08) : 0));
        disc(ctx, X(k), yl - 24, r, k <= t ? INK : DIM);
      }
      drawText(ctx, '停頓 stop', X(m.stop.start) - 8, yl + 62, { size: 16, align: 'right', fill: DIM });
      drawText(ctx, '重擊 impact', X(m.drop) + 8, yl + 62, { size: 16, fill: t >= m.drop ? INK : DIM });
      const xd = X(m.drop);
      ctx.beginPath();
      ctx.moveTo(xd - 9, yl - 84);
      ctx.lineTo(xd + 9, yl - 84);
      ctx.lineTo(xd, yl - 70);
      ctx.closePath();
      ctx.fillStyle = accent(xd, yl - 77);
      ctx.fill();
      // The playhead.
      ctx.fillStyle = accent(X(t), yl);
      ctx.fillRect(X(t) - 1, yl - 40, 2, 52);
      disc(ctx, X(t), yl, 6, accent(X(t), yl));
    },
  };
}
