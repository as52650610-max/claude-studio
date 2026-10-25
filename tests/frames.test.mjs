// Frame sequences end to end: frames.json and numbered images → api.loadFrames → SHOT.renderAsync
// in the renderer. Needs Chrome or Edge; skipped without one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { findBrowser } from '../tools/lib/cdp.mjs';
import { encodePNG } from '../tools/lib/png.mjs';
import { probe, renderStills, verify } from '../tools/render.mjs';

/** 8-bit RGB or RGBA, not interlaced: what encodePNG writes. */
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, ch = 3;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') [width, height, ch] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9] === 6 ? 4 : 3];
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * ch, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[o + i - ch] : 0, b = y ? out[o - stride + i] : 0, c = i >= ch && y ? out[o - stride + i - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[o + i] = (raw[y * (stride + 1) + 1 + i] + pred) & 255;
    }
  }
  return { width, height, ch, data: out };
}

function solid(w, h, rgb) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < px.length; i += 4) [px[i], px[i + 1], px[i + 2], px[i + 3]] = [...rgb, 255];
  return encodePNG(px, w, h);
}

// One shot that fills the frame with frames/clip, from its own time.
const CLIP_FILM = `<!doctype html><meta charset="utf-8"><script type="module">
import { film } from './engine/studio.js';
film({ shots: [async api => {
  const clip = await api.loadFrames('frames/clip');
  return { id: 'S01', start: 0, end: 2, draw(ctx, s) { clip.draw(ctx, s.local, 0, 0, s.width, s.height); } };
}] });
</script>`;

export const tests = {
  async 'frame sequences show the clip frame for t, in any order, in a fresh browser'() {
    if (!findBrowser()) return 'skip';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-frames-'));
    try {
      // A 2 s clip at 6 fps (frame i is red 20·i) in a 12 fps film: each clip frame holds two film frames.
      fs.mkdirSync(path.join(dir, 'frames', 'clip'), { recursive: true });
      for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, 'frames', 'clip', `${String(i + 1).padStart(6, '0')}.png`), solid(32, 18, [20 * i, 100, 200]));
      fs.writeFileSync(path.join(dir, 'frames', 'clip', 'frames.json'), JSON.stringify({ fps: 6, count: 12, width: 32, height: 18, pattern: '%06d.png', first: 1 }));
      fs.writeFileSync(path.join(dir, 'studio.json'), JSON.stringify({ name: 'seq', width: 64, height: 36, fps: 12, duration: 2 }));
      fs.writeFileSync(path.join(dir, 'film.html'), CLIP_FILM);
      const info = await probe({ root: dir });
      assert.deepEqual(info.meta.frames, [{ dir: 'frames/clip', fps: 6, count: 12, width: 32, height: 18 }], 'meta lists the sequence');
      const times = [1.95, 0, 1 / 6, 0.5, 1.0];
      const r = await renderStills({ root: dir, times, outDir: path.join(dir, 'qa'), naming: 'index', log: () => {} });
      r.files.forEach((f, k) => {
        const png = decodePNG(fs.readFileSync(f));
        const i = (18 * png.width + 32) * png.ch;
        const want = 20 * Math.min(11, Math.floor(times[k] * 6 + 1e-6));
        assert.deepEqual([...png.data.subarray(i, i + 3)], [want, 100, 200], `t=${times[k]} shows clip frame ${want / 20}`);
      });
      const v = await verify({ root: dir, samples: 10, log: () => {} });
      assert.deepEqual(v.mismatches, [], 'the same pixels in shuffled order, in a fresh browser');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  async 'a missing or broken clip image stops the render and names the file'() {
    if (!findBrowser()) return 'skip';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-frames-'));
    try {
      // Three frames at 1 fps: the first is fine, the second is not a picture, the third is missing.
      fs.mkdirSync(path.join(dir, 'frames', 'clip'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'frames', 'clip', '000001.png'), solid(32, 18, [0, 100, 200]));
      fs.writeFileSync(path.join(dir, 'frames', 'clip', '000002.png'), Buffer.from('not a picture'));
      fs.writeFileSync(path.join(dir, 'frames', 'clip', 'frames.json'), JSON.stringify({ fps: 1, count: 3, width: 32, height: 18, pattern: '%06d.png', first: 1 }));
      fs.writeFileSync(path.join(dir, 'studio.json'), JSON.stringify({ name: 'bad', width: 64, height: 36, fps: 2, duration: 3 }));
      fs.writeFileSync(path.join(dir, 'film.html'), CLIP_FILM.replace('end: 2', 'end: 3'));
      const still = t => renderStills({ root: dir, times: [t], outDir: path.join(dir, 'qa'), naming: 'index', log: () => {} });
      await still(0.5);
      await assert.rejects(still(1.5), /000002\.png \(frame 2 of 3\) cannot be decoded/);
      await assert.rejects(still(2.5), /000003\.png \(frame 3 of 3\) cannot be loaded \(HTTP 404\)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
