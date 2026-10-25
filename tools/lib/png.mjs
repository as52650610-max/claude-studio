// Minimal PNG writer. Zero dependencies.
import zlib from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

/**
 * Encode RGBA pixels (row-major, top row first) as a PNG. Alpha is dropped unless `alpha` is set,
 * because rendered frames are already composited. Paeth filter, tagged sRGB.
 */
export function encodePNG(rgba, width, height, { alpha = false, level = 6 } = {}) {
  if (rgba.length !== width * height * 4) throw new Error(`encodePNG: ${rgba.length} bytes is not ${width}×${height} RGBA`);
  const ch = alpha ? 4 : 3, stride = width * ch;
  const raw = Buffer.alloc((stride + 1) * height);
  const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0, i = y * width * 4, j = 0; x < width; x++, i += 4) {
      line[j++] = rgba[i];
      line[j++] = rgba[i + 1];
      line[j++] = rgba[i + 2];
      if (alpha) line[j++] = rgba[i + 3];
    }
    const o = y * (stride + 1);
    raw[o] = 4; // Paeth
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      raw[o + 1 + i] = (line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // RGBA or RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', zlib.deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
