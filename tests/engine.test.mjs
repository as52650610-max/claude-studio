// Unit tests for the pure parts of engine/studio.js (no browser needed).
import assert from 'node:assert/strict';
import * as S from '../engine/studio.js';

export const tests = {
  'easing endpoints and house curves'() {
    for (const [name, fn] of Object.entries(S.ease)) {
      if (typeof fn !== 'function' || ['back', 'steps', 'bezier'].includes(name)) continue;
      assert.ok(Math.abs(fn(0)) < 1e-9, `${name}(0)`);
      assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${name}(1)`);
    }
    assert.ok(S.ease.out(0.5) > 0.85, 'expo-out is front-loaded');
    assert.ok(S.ease.in(0.5) < 0.15, 'expo-in is back-loaded');
    assert.ok(Math.abs(S.ease.impact(0.85) - 0.9) < 1e-9, 'impact reaches 90% at 85%');
    assert.equal(S.ease.steps(4)(0.3), 0.25);
  },
  'springs settle and retarget'() {
    for (const damp of [0.45, 0.75, 1, 1.5]) {
      assert.equal(S.spring(0, { freq: 14, damp }), 0);
      assert.ok(Math.abs(S.spring(3, { freq: 14, damp }) - 1) < 1e-3, `settles at damp ${damp}`);
    }
    assert.ok(S.spring(0.25, { freq: 18, damp: 0.45 }) > 1, 'underdamped overshoots');
    const v = S.springTrack(10, [[0, 0], [1, 10], [2, -5]], { freq: 14, damp: 0.8 });
    assert.ok(Math.abs(v + 5) < 1e-3, 'retarget ends at last value');
  },
  'keyframe tracks'() {
    assert.equal(S.track(-1, [[0, 2], [1, 4]]), 2);
    assert.equal(S.track(5, [[0, 2], [1, 4]]), 4);
    assert.equal(S.track(0.5, [[0, 0, S.ease.linear], [1, 10]]), 5);
    assert.deepEqual(S.track(0.5, [[0, [0, 0], S.ease.linear], [1, [2, 4]]]), [1, 2]);
  },
  'seeded randomness is reproducible'() {
    const a = S.rng('seed'), b = S.rng('seed');
    for (let i = 0; i < 5; i++) assert.equal(a(), b());
    assert.equal(S.hash(3, 'x'), S.hash(3, 'x'));
    assert.notEqual(S.hash(3, 'x'), S.hash(4, 'x'));
    for (let i = 0; i < 50; i++) {
      const n = S.noise2(i * 0.37, i * 0.11, 2);
      assert.ok(n >= -1.5 && n <= 1.5);
    }
  },
  'frame sequences pick the clip frame from time'() {
    assert.equal(S.frameIndex(0, 24, 48), 0);
    assert.equal(S.frameIndex(1 / 24, 24, 48), 1, 'a frame boundary lands on the new frame');
    assert.equal(S.frameIndex(0.999, 24, 48), 23);
    assert.equal(S.frameIndex(-1, 24, 48), 0, 'held before the start');
    assert.equal(S.frameIndex(5, 24, 48), 47, 'held after the end');
    assert.equal(S.frameIndex(2.5, 24, 48, { loop: true }), 12, 'looped');
    assert.equal(S.frameIndex(-0.5, 24, 48, { loop: true }), 36, 'looped backwards');
    assert.equal(S.frameIndex(1, 24, 48, { rate: 0.5 }), 12, 'half speed');
    assert.equal(S.frameIndex(1, 24, 0), -1, 'empty clip');
    for (let f = 0; f < 300; f++) assert.equal(S.frameIndex(f / 30, 30, 300), f, 'film fps = clip fps maps frame to frame');
    // A layer rendered at the film's rate for a shot starting anywhere: clip frame k is on film frame
    // startFrame + k (the renderer draws frame f at f / fps; studio timing counts startFrame so).
    for (const fps of [24, 25, 30, 60]) {
      for (const start of [0, 1 / 3, 2.0001, 7.123456, 12.5, 83.25]) {
        const startFrame = Math.ceil(start * fps - 1e-6);
        for (let k = 0; k < 120; k++) assert.equal(S.frameIndex((startFrame + k) / fps - start, fps, 120), k, `${fps} fps, shot at ${start} s, clip frame ${k}`);
      }
    }
  },
  'colour mixing'() {
    assert.equal(S.color.mix('#000000', '#ffffff', 0), 'rgb(0 0 0)');
    assert.equal(S.color.mix('#000000', '#ffffff', 1), 'rgb(255 255 255)');
    assert.equal(S.color.alpha('#ff0000', 0.5), 'rgb(255 0 0 / 0.5)');
    assert.ok(Math.abs(S.color.luminance('#ffffff') - 1) < 1e-9);
  },
  'song addressing follows measured beats'() {
    // beats every 0.5 s from 0.5; first downbeat at 1.0 (beat index 1); 4/4.
    const beats = Array.from({ length: 40 }, (_, i) => 0.5 + i * 0.5);
    const song = S.makeSong({ beats, downbeats: beats.filter((_, i) => i % 4 === 1), beatsPerBar: 4 });
    assert.equal(song.T(1), 1.0);
    assert.equal(song.T(2), 3.0);
    assert.equal(song.T(2, 3), 4.0);
    assert.equal(song.T(2, 1, 3), 3.25);
    assert.equal(song.T(0), -1.0, 'bar 0 is the pickup bar');
    assert.deepEqual(song.position(3.6), { bar: 2, beat: 2, sixteenth: 1 });
    assert.deepEqual(song.position(21.2), { bar: 11, beat: 1, sixteenth: 2 }, 'bars go on after the last downbeat');
    const s3 = S.makeSong({ beats, stops: [{ start: 2, end: 2.5 }] }, { offset: 1 });
    assert.deepEqual(s3.stops, [{ start: 3, end: 3.5 }], 'stops in film time');
    assert.ok(s3.isStop(3.2) && !s3.isStop(2.2));
    assert.equal(song.nextBeat(1.0), 1.5);
    assert.equal(song.prevBeat(1.2), 1.0);
    assert.equal(song.nextDownbeat(1.0), 3.0);
    assert.equal(song.prevDownbeat(2.9), 1.0);
    assert.ok(Math.abs(song.barAt(2.0) - 1.5) < 1e-9);
    // Tempo change: later beats are farther apart and T() follows them.
    const b2 = [0, 0.5, 1, 1.5, 2, 2.6, 3.2, 3.8, 4.4];
    const s2 = S.makeSong({ beats: b2, downbeats: [0, 2, 4.4], beatsPerBar: 4 });
    assert.equal(s2.T(2, 2), 2.6);
    assert.ok(Math.abs(s2.T(3, 2) - 5.0) < 1e-9, 'extrapolates with the last period');
  },
  'lyrics, karaoke weights and at.*'() {
    const beats = Array.from({ length: 40 }, (_, i) => 0.5 + i * 0.5);
    const song = S.makeSong({ beats, downbeats: beats.filter((_, i) => i % 4 === 1), beatsPerBar: 4 });
    const lyrics = S.makeLyrics({ lines: [
      { start: 2.02, end: 4, text: '就在這裡 here' },
      { start: 5.1, end: 7, text: '再見' },
      { start: 9, end: 10, text: '就在這裡' },
    ] });
    const at = S.makeAt(song, lyrics, new Map([['boom', 8.25]]));
    assert.equal(at.lyric('就在這裡'), 2.0, 'beat at or just before the line');
    assert.equal(at.lyric('就在這裡', { nth: 2 }), 9.0);
    assert.equal(at.lyric('再見', { snap: 'none' }), 5.1);
    assert.equal(at.lyric(2, { snap: 'none' }), 5.1, 'lines can be addressed by number');
    assert.equal(at.afterLine('就在這裡'), 5.0);
    assert.equal(at.cue('boom'), 8.25);
    assert.throws(() => at.lyric('不存在'), /not in any line/);
    assert.throws(() => at.cue('nope'), /not in data\/cues.json/);
    const chars = lyrics.lines[0].chars;
    assert.equal(chars.length, 9);
    assert.ok(chars.every(c => c.est));
    assert.ok(Math.abs(chars.at(-1).end - 4) < 1e-9, 'estimated chars span the line');
    assert.deepEqual(['中', 'a', ' ', '，', 'ア'].map(S.charWeight), [1, 0.25, 0.1, 0, 1]);
    assert.ok(at.word('就在這裡', '這裡') > 2.02);
    const p = lyrics.progress(lyrics.lines[1], 6.05);
    assert.ok(p > 0.9 && p < 1.1, 'half way through a two-character line');
  },
  'timing-only lyrics refuse text queries'() {
    const lyrics = S.makeLyrics({ lines: [{ start: 1, end: 2 }] });
    assert.throws(() => lyrics.find('abc'), /timing-only/);
    assert.equal(lyrics.find(1).start, 1);
  },
};
