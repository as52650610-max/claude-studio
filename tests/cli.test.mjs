// Tests for tools/studio.mjs commands that need no browser, ffmpeg or Python.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(ROOT, 'tools', 'studio.mjs');
const run = (...args) => spawnSync(process.execPath, [STUDIO, ...args], { encoding: 'utf8' });

function tmpProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cli-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}
const cfg = dir => JSON.parse(fs.readFileSync(path.join(dir, 'studio.json'), 'utf8'));

// 120 BPM in 4/4: a bar every 2 s; verse–chorus–verse–chorus, the last chorus the strongest.
function songmap() {
  const beats = Array.from({ length: 140 }, (_, i) => i * 0.5);
  return {
    duration: 70,
    bpm: 120,
    beatsPerBar: 4,
    beats,
    downbeats: beats.filter((_, i) => i % 4 === 0),
    sections: [
      { start: 0, end: 16, kind: 'verse', name: 'verse', label: 'A', energy: 3 },
      { start: 16, end: 32, kind: 'chorus', name: 'chorus', label: 'B', energy: 8 },
      { start: 32, end: 48, kind: 'verse', name: 'verse', label: "A'", energy: 3 },
      { start: 48, end: 64, kind: 'chorus', name: 'chorus', label: "B'", energy: 9 },
      { start: 64, end: 70, kind: 'outro', name: 'outro', label: 'C', energy: 2 },
    ],
  };
}

export const tests = {
  'excerpt cuts the strongest chorus on whole bars'() {
    const dir = tmpProject({ 'studio.json': { name: 'x', width: 1080, height: 1920, fps: 30 }, 'data/songmap.json': songmap() });
    try {
      let r = run('excerpt', dir);
      assert.equal(r.status, 0, r.stderr);
      let c = cfg(dir);
      assert.equal(c.offset, -48, 'starts on the last chorus (energy 9)');
      assert.equal(c.duration, 16, 'eight bars');
      assert.equal(c.mix.fadeOut, 0.8, 'the song goes on: fade out');
      assert.equal(c.mix.fadeIn, 0, 'starts on a downbeat: no fade in');

      r = run('excerpt', dir, '--nth', '1', '--lead-bars', '1');
      c = cfg(dir);
      assert.equal(c.offset, -14, 'one bar of run-up before the first chorus');
      assert.equal(c.duration, 18, 'the chorus plus the run-up');

      r = run('excerpt', dir, '--bar', '5', '--bars', '4');
      c = cfg(dir);
      assert.deepEqual([c.offset, c.duration], [-8, 8], 'bar 5 starts at 8 s; four bars');

      r = run('excerpt', dir, '--section', 'chorus', '--nth', 'last', '--max', '10');
      c = cfg(dir);
      assert.deepEqual([c.offset, c.duration], [-48, 8], 'cut to whole phrases (4 bars) under --max');

      r = run('excerpt', dir, '--bar', '30', '--bars', '8');
      c = cfg(dir);
      assert.deepEqual([c.offset, c.duration, c.mix.fadeOut], [-58, 12, 0], 'clamped to the end of the song, which needs no fade');

      r = run('excerpt', dir, '--section', 'bridge');
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /no "bridge" section/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  'lint flags what breaks the contract'() {
    const shot = [
      "export const a = { id: 'S01', start: 0, end: 12.5, draw() {} };",
      'const r = Math.random();',
      'const now = Date.now();',
      'setTimeout(() => {}, 10);',
      "const img = 'https://example.com/a.png';",
      'const b = { start: 3, end: 4 }; // lint-ignore',
      'const ok = { start: 0, end: at.bar(5) };',
    ].join('\n');
    const dir = tmpProject({ 'studio.json': { name: 'x' }, 'film.html': '<script type="module"></script>', 'shots/a.js': shot, 'engine/studio.js': 'Math.random()' });
    try {
      const r = run('lint', dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /5 finding\(s\)/);
      for (const line of [1, 2, 3, 4, 5]) assert.match(r.stdout, new RegExp(`shots/a\\.js:${line} `));
      assert.doesNotMatch(r.stdout, /shots\/a\.js:[67] /, 'ignored and clean lines pass');
      assert.doesNotMatch(r.stdout, /engine\//, 'the engine is not linted');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  'timing counts film time the way the engine does'() {
    // The song starts 2 s before the film (offset −2); lyrics are sung 0.1 s later than written.
    const dir = tmpProject({
      'studio.json': { name: 'x', fps: 30, offset: -2, lyricOffset: 0.1, duration: 10 },
      'data/songmap.json': songmap(),
      'data/lyrics.json': { lines: [{ start: 4, end: 5.5, text: 'Hello, "world"' }, { start: 100, end: 101, text: 'after the film' }] },
      'data/cues.json': { cues: [{ name: 'drop', t: 6 }] },
    });
    try {
      let r = run('timing', dir, '--no-shots');
      assert.equal(r.status, 0, r.stderr);
      const T = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'timing.json'), 'utf8'));
      assert.deepEqual([T.duration, T.frames, T.shots], [10, 300, null]);
      assert.equal(T.beats.length, 20, 'beats every 0.5 s inside the 10 s film');
      assert.deepEqual(T.bars[0], { bar: 2, t: 0, frame: 0 }, 'the film opens on bar 2 of the song');
      assert.deepEqual(T.lines, [{ line: 1, text: 'Hello, "world"', start: 2.1, end: 3.6, startFrame: 63, endFrame: 108, frames: 45, bar: 3, beat: 1 }], 'offset and lyricOffset applied; lines outside the film left out');
      assert.deepEqual(T.cues, [{ name: 'drop', t: 4, frame: 120, bar: 4, beat: 1 }]);
      assert.deepEqual([T.sections[0].start, T.sections[0].endFrame], [0, 300], 'sections are clipped to the film');
      const csv = fs.readFileSync(path.join(dir, 'out', 'timing.csv'), 'utf8').split('\n');
      assert.equal(csv[0], 'kind,name,start,end,start_frame,end_frame,bar,beat,text');
      assert.ok(csv.includes('line,line 1,2.1,3.6,63,108,3,1,"Hello, ""world"""'), 'CSV quotes text');
      assert.match(fs.readFileSync(path.join(dir, 'out', 'timing.md'), 'utf8'), /## Lyric lines/);

      r = run('timing', dir, '--no-shots', '--fps', '24', '--no-text', '--out', path.join(dir, 'blender.json'));
      const B = JSON.parse(fs.readFileSync(path.join(dir, 'blender.json'), 'utf8'));
      assert.deepEqual([B.fps, B.cues[0].frame, B.lines[0].text, B.lines[0].startFrame], [24, 96, undefined, 51], 'frames at another tool\'s rate, without the lyric text');
      assert.match(r.stdout, /counted at 24 fps/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  'mix collects data/sfx.json without a film page'() {
    const dir = tmpProject({ 'studio.json': { name: 'x', fps: 24, duration: 6 }, 'data/sfx.json': { sfx: [{ t: 4.5, sound: 'impact' }, { t: 2, sound: 'whoosh', why: 'door' }] } });
    try {
      const r = run('mix', dir); // mix.py runs after this when Python is there; the cues are written first
      assert.match(r.stdout, /2 sound cue\(s\) from data\/sfx\.json \(no film page; timed by studio\.json\)/);
      const cues = JSON.parse(fs.readFileSync(path.join(dir, 'qa', 'sfx_cues.json'), 'utf8'));
      assert.deepEqual([cues.duration, cues.fps, cues.sfx.map(s => s.t), cues.sfx[0].from], [6, 24, [2, 4.5], 'data/sfx.json'], 'sorted by time, marked with where they came from');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  'engine compares and updates the project copy'() {
    const dir = tmpProject({ 'studio.json': { name: 'x' } });
    try {
      let r = run('engine', dir);
      assert.match(r.stdout, /project engine none/);
      assert.match(r.stdout, /different: .*studio\.js/);
      r = run('engine', dir, '--update');
      assert.match(r.stdout, /updated/);
      r = run('engine', dir);
      assert.match(r.stdout, /identical/);
      fs.appendFileSync(path.join(dir, 'engine', 'player.js'), '\n// local change\n');
      r = run('engine', dir);
      assert.match(r.stdout, /different: player\.js/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
