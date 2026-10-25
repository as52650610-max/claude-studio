// Tests for examples/: each one is a complete film someone can rebuild, and the flagship's style
// windows stay the style cards' own demo shots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'examples');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const examples = () => fs.readdirSync(EXAMPLES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

// examples/song-to-mv/shots/styles/<file> is styles/<card>/demo/shots/<file> with one change: the
// engine import climbs one more folder.
const COPIES = { 'riso.js': 'riso-print', 'pixel.js': 'pixel-crt', 'paper.js': 'paper-cutout', 'blueprint.js': 'blueprint', 'ink.js': 'ink-and-paper', 'swiss.js': 'swiss-kinetic' };

export const tests = {
  'every example has its documents, data and font licences'() {
    const need = ['README.md', 'BRIEF.md', 'TREATMENT.md', 'STORYBOARD.md', 'PROGRESS.md', 'REVIEW_LOG.md', 'CREDITS.md', 'REPRODUCE.md',
      'film.html', 'studio.json', 'music.json', 'data/songmap.json', 'data/song.truth.json', 'audio/README.md', '.gitignore'];
    assert.ok(examples().length >= 2, 'examples/ lost an example');
    for (const name of examples()) {
      const dir = path.join(EXAMPLES, name);
      for (const f of need) assert.ok(fs.existsSync(path.join(dir, f)), `${name}: ${f} is missing`);
      const cfg = JSON.parse(read(dir, 'studio.json'));
      for (const font of cfg.fonts || []) {
        assert.ok(fs.existsSync(path.join(dir, font.src)), `${name}: ${font.src} is missing (run "studio fonts")`);
        assert.ok(fs.existsSync(path.join(dir, path.dirname(font.src), 'OFL.txt')), `${name}: no licence beside ${font.src}`);
      }
      const lyrics = path.join(dir, cfg.lyrics || 'data/lyrics.json');
      if (fs.existsSync(lyrics)) assert.equal(JSON.parse(read(lyrics)).publishable, true, `${name}: committed lyrics must be the repository's own ("publishable": true)`);
    }
  },

  "song-to-mv's style windows are the cards' own demo shots"() {
    const dir = path.join(EXAMPLES, 'song-to-mv', 'shots', 'styles');
    assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(COPIES).sort());
    for (const [file, card] of Object.entries(COPIES)) {
      const want = read(ROOT, 'styles', card, 'demo', 'shots', file).replaceAll("from '../engine/studio.js'", "from '../../engine/studio.js'");
      assert.equal(read(dir, file), want, `shots/styles/${file} differs from styles/${card}/demo/shots/${file}: copy it again (only the engine import changes)`);
    }
  },
};
