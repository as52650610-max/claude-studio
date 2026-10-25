// The song as the analyser heard it: the onset envelope of data/songmap.json as a comb of bars,
// the beats under it and a red playhead. One drawing serves three chapters. Only the lens moves
// (the intro as it plays, then the whole song, then bars 5–6) and the comb follows, so the
// picture never cuts while the data stays the same.
import { ease, lerp, span } from '../engine/studio.js';
import { INK, MOVE, RED, TINT, grid, type } from './page.js';

const PITCH = 6, BAR = 4; // one bar of the comb every 6 px, 4 px wide, whatever the lens

/** Where the lens is at t: the stretch of song across the 12 columns, and the comb's baseline and height. */
export function lens(song, G) {
  const T = (...a) => song.T(...a);
  const stops = [
    { at: -Infinity, from: T(1), to: T(3), base: 600, amp: 340 }, // 01 聽: the intro, as it is heard
    { at: T(3), from: 0, to: song.duration, base: 520, amp: 200 }, // 02 對拍: the whole song, known
    { at: T(5), from: T(5), to: T(7), base: 640, amp: 64 }, // 03 歌詞: the two bars of line 2
  ];
  return t => {
    let k = 0;
    while (k + 1 < stops.length && t >= stops[k + 1].at) k++;
    const a = stops[Math.max(0, k - 1)], b = stops[k], u = k ? ease.expoOut(span(t, b.at, b.at + MOVE)) : 1;
    const v = { k, from: lerp(a.from, b.from, u), to: lerp(a.to, b.to, u), base: lerp(a.base, b.base, u), amp: lerp(a.amp, b.amp, u) };
    v.x = time => G.x(0) + ((time - v.from) / (v.to - v.from)) * G.w(G.cols);
    v.time = x => v.from + ((x - G.x(0)) / G.w(G.cols)) * (v.to - v.from);
    return v;
  };
}

export function timeline({ song, width: W, height: H }) {
  const G = grid(W, H), T = (...a) => song.T(...a), at = lens(song, G);
  const right = G.x(G.cols - 1) + G.cw, cols = Math.floor(G.w(G.cols) / PITCH);
  // The envelope, 60 values a second, and the loudest onset (the comb's full height).
  const RATE = 60, onset = Float32Array.from({ length: Math.ceil(song.duration * RATE) + 1 }, (_, i) => song.env('onset', i / RATE));
  const peak = Math.max(...onset) || 1;
  const level = (a, b) => {
    let v = 0;
    for (let i = Math.max(0, Math.floor(a * RATE)); i <= Math.min(onset.length - 1, Math.ceil(b * RATE)); i++) v = Math.max(v, onset[i]);
    return v / peak;
  };
  const first = Math.round(song.beatAt(T(1))), last = Math.round(song.beatAt(T(17)));
  const beats = song.beats.filter((_, i) => i >= first && i < last);
  // Beats appear as they are heard; on 對拍 the rest of the song's beats arrive at once, left to right.
  const appear = (b, i) => (b < T(3) ? b : Math.min(b, T(3) + (0.4 * i) / beats.length));

  return {
    id: 'timeline',
    start: T(1),
    end: T(7),
    layer: 1,
    draw(ctx, { t }) {
      const v = at(t), heardOnly = v.k === 0;
      // the comb: what is heard in ink; on 對拍 and 歌詞 the rest of the song is known, in tint
      for (let c = 0; c < cols; c++) {
        const x = G.x(0) + c * PITCH, a = v.time(x), b = v.time(x + PITCH);
        if (b < 0 || a > song.duration) continue;
        if (heardOnly && a > t) break;
        const h = Math.max(1, level(a, b) * v.amp);
        ctx.fillStyle = a <= t ? INK : TINT;
        ctx.fillRect(x, v.base - h, BAR, h);
      }
      // the beats: a tick each, taller on the downbeat; labels while there is room for them
      const spacing = v.x(song.timeOfBeat(1)) - v.x(song.timeOfBeat(0));
      beats.forEach((b, i) => {
        const x = v.x(b);
        if (x < G.x(0) - 1 || x > right + 1) return;
        const t0 = appear(b, i);
        if (t < t0) return;
        const u = ease.expoOut(span(t, t0, t0 + MOVE)), down = (first + i) % song.beatsPerBar === 0;
        ctx.fillStyle = t >= b ? INK : TINT;
        ctx.fillRect(Math.round(x) - 1, v.base + 12, 2, (down ? 28 : 12) * u);
        const { bar, beat } = song.position(b + 1e-3);
        if (spacing >= 90) type(ctx, `${bar}.${beat}`, x, v.base + 72, 18, down ? 700 : 500, { align: 'center', alpha: u, fill: t >= b ? INK : TINT });
        else if (down && spacing >= 18) type(ctx, String(bar), x, v.base + 62, 14, 700, { align: 'center', alpha: u, fill: t >= b ? INK : TINT });
      });
      // the playhead
      const px = v.x(t);
      if (px >= G.x(0) && px <= right) {
        ctx.fillStyle = RED;
        ctx.fillRect(Math.round(px) - 1, v.base - v.amp - 24, 2, v.amp + 24 + 44);
      }
    },
  };
}
