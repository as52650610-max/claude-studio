// A film inside this film. A style card's demo is a shot factory written for its own 8-second,
// 120 BPM song; embed() builds it against a metronome song of that length and paints any moment
// of it into a canvas of its own. (Some demos composite at the resolution of the canvas they are
// given, so they cannot share this film's context.) Pure: the picture depends only on the demo
// time asked for, so a view that is asked for the same time and size twice paints once.
import { clamp, makeAt, makeLyrics, makeSong, syntheticSongmap } from '../engine/studio.js';

export async function embed(api, factory, { bpm = 120, beatsPerBar = 4, duration = 8, background = '#000', post = null } = {}) {
  const song = makeSong(syntheticSongmap({ bpm, beatsPerBar, duration }), { duration });
  const lyrics = makeLyrics(null);
  const at = makeAt(song, lyrics, new Map());
  const shots = [].concat((await factory({ ...api, song, lyrics, at, cues: new Map() })) || []);
  const { width: W, height: H, fps, film } = api;

  function state(shot, t, frame) {
    const local = t - shot.start, dur = shot.end - shot.start;
    return {
      t, local, dur, u: clamp(local / dur), start: shot.start, end: shot.end, frame, fps, width: W, height: H,
      id: shot.id, shot, film, song, lyrics, at,
      in: d => clamp(local / d),
      out: d => clamp((t - (shot.end - d)) / d),
    };
  }

  /** A canvas that shows the demo: paint(τ, w, h) draws demo time τ at w × h device pixels. */
  function view() {
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d', { alpha: false });
    let painted = '';
    return {
      canvas,
      paint(tau, w, h) {
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        const key = `${tau}:${w}:${h}`;
        if (key === painted) return canvas;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        g.setTransform(w / W, 0, 0, h / H, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.filter = 'none';
        g.fillStyle = background;
        g.fillRect(0, 0, W, H);
        const frame = Math.round(tau * fps);
        for (const shot of shots) {
          if (tau < shot.start || tau >= shot.end) continue;
          g.save();
          shot.draw(g, state(shot, tau, frame));
          g.restore();
        }
        if (post) {
          g.save();
          post(g, { t: tau, frame, width: W, height: H, song });
          g.restore();
        }
        painted = key;
        return canvas;
      },
    };
  }

  return { song, duration, view };
}
