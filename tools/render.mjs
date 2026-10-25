// claude-studio renderer. MIT License. Zero npm dependencies.
//
// Renders any page that exposes a time function — window.SHOT (this engine, Multiplane),
// window.renderFrame(t)+ready, window.render(t)+DUR/READY, window.seek(t), window.renderAt(t) —
// with N headless Chrome/Edge workers, each taking contiguous segments of frames, piping
// frames straight into ffmpeg, then joining the segments without re-encoding and adding audio.
//
// Canvas pages are converted to planar yuv420p (BT.709, limited range) on the GPU and sent over the
// DevTools pipe (2.7x fewer bytes than RGBA, no PNG round trip, no localhost TCP); other pages are
// captured by screenshot. Motion blur averages subframes that never cross a declared cut.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, isSoftwareGL } from './lib/cdp.mjs';
import { startServer } from './lib/server.mjs';
import { encodePNG } from './lib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_DIR = path.join(HERE, '..', 'engine');

// ─── In-page adapter (serialised into the page) ────────────────────────────────────────────

function pageAdapter(opts) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clock = () => (window.__studioClock || performance.now.bind(performance))();
  const detect = () => {
    if (window.SHOT && typeof window.SHOT.render === 'function') return 'shot';
    if (typeof window.renderFrame === 'function') return 'renderFrame';
    if (typeof window.renderAt === 'function') return 'renderAt';
    if (typeof window.render === 'function' && (window.DUR !== undefined || window.READY !== undefined)) return 'render';
    if (typeof window.seek === 'function') return 'seek';
    return null;
  };
  const until = async (fn, ms, what) => {
    const s = clock();
    while (!fn()) {
      if (clock() - s > ms) throw new Error(what);
      await sleep(25);
    }
  };
  const awaitReady = async r => {
    if (r && typeof r.then === 'function') return r;
    if (r === undefined) return;
    await until(() => (typeof r === 'function' ? r() : r === true || window.READY === true || window.ready === true), 180000, 'the page never became ready (look for an error before ready, e.g. a const used before it is defined)');
  };
  return (async () => {
    let kind = detect();
    if (!kind) {
      try {
        await until(() => (kind = detect()), 15000, 'x');
      } catch {
        throw new Error('No render contract on the page. Expose window.SHOT (claude-studio engine / Multiplane), window.renderFrame(t), window.render(t) + DUR, window.seek(t) or window.renderAt(t).');
      }
    }
    let draw, info;
    if (kind === 'shot') {
      const S = window.SHOT;
      await S.ready;
      // renderAsync waits for the frame-sequence images a frame uses (engine 0.2+).
      draw = typeof S.renderAsync === 'function' ? (t, x) => S.renderAsync(t, x) : (t, x) => S.render(t, x);
      info = { width: S.width, height: S.height, fps: S.fps, duration: S.duration, cuts: S.cuts || [], meta: S.meta || {}, sfx: S.sfx || [], engine: S.engine || 'window.SHOT' };
      info.canvasMode = !!(S.canvas && S.capture !== 'page');
      window.__studioCanvas = S.canvas;
    } else {
      if (kind === 'renderFrame') {
        await awaitReady(window.ready);
        draw = t => window.renderFrame(t);
      } else if (kind === 'renderAt') {
        await awaitReady(window.ready ?? window.READY);
        draw = t => window.renderAt(t);
      } else if (kind === 'render') {
        await awaitReady(window.READY ?? window.ready);
        draw = t => window.render(t);
      } else {
        await awaitReady(window.ready ?? window.READY);
        draw = t => window.seek(t);
      }
      const dur = window.DURATION ?? window.DUR ?? window.duration ?? opts.duration;
      info = { width: opts.width, height: opts.height, fps: window.FPS || opts.fps, duration: typeof dur === 'number' ? dur : opts.duration, cuts: window.CUTS || [], meta: {}, sfx: [], engine: `window.${kind}`, canvasMode: false };
    }
    if (!(info.duration > 0)) throw new Error('The page did not report a duration. Pass --duration <seconds>.');
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b64 = u8 => {
      if (u8.toBase64) return u8.toBase64();
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    let rc = null, rctx = null, acc = null, out = null;
    const read = () => {
      const c = window.__studioCanvas;
      if (!rc || rc.width !== c.width || rc.height !== c.height) {
        rc = document.createElement('canvas');
        rc.width = c.width;
        rc.height = c.height;
        rctx = rc.getContext('2d', { willReadFrequently: true, alpha: false });
      }
      rctx.fillStyle = '#000';
      rctx.fillRect(0, 0, rc.width, rc.height);
      rctx.drawImage(c, 0, 0);
      return rctx.getImageData(0, 0, rc.width, rc.height).data;
    };
    const rgbaPixels = async it => {
      if (!it.subs) {
        await draw(it.t, { frame: it.frame });
        return read();
      }
      let first = true;
      for (const st of it.subs) {
        await draw(st, { frame: it.frame, sub: true });
        const d = read();
        if (first) {
          if (!acc || acc.length !== d.length) {
            acc = new Uint32Array(d.length);
            out = new Uint8ClampedArray(d.length);
          }
          for (let i = 0; i < d.length; i++) acc[i] = d[i];
          first = false;
        } else for (let i = 0; i < d.length; i++) acc[i] += d[i];
      }
      const n = it.subs.length, half = n >> 1;
      for (let i = 0; i < acc.length; i++) out[i] = ((acc[i] + half) / n) | 0;
      return out;
    };
    // GPU packer: the canvas becomes planar yuv420p (BT.709, limited range) in an RGBA8 target of
    // (W/4) x (1.5 H) whose bytes are exactly the Y, U and V planes. Chroma is left-sited, as H.264
    // players assume: [1 2 1] across, two rows averaged down. Motion-blur subframes are summed in a
    // float texture and divided once, so a blurred frame is rounded to 8 bits only once.
    const makePacker = (W, H) => {
      if (W % 4 || H % 4) return null;
      const cv = document.createElement('canvas');
      cv.width = W / 4;
      cv.height = H * 1.5;
      const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) return null;
      const floatOK = !!gl.getExtension('EXT_color_buffer_float');
      const VS = '#version 300 es\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
      const PACK = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D src; uniform int W, H; uniform float scale; out vec4 o;
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 px(int x, int y) { return texelFetch(src, ivec2(clamp(x, 0, W - 1), clamp(y, 0, H - 1)), 0).rgb * scale; }
float q(float v) { return clamp(floor(v + 0.5), 0.0, 255.0) / 255.0; }
float luma(vec3 c) { return q(16.0 + 219.0 * dot(c, K)); }
void main() {
  int x = int(gl_FragCoord.x), r = int(gl_FragCoord.y);
  if (r < H) { o = vec4(luma(px(4 * x, r)), luma(px(4 * x + 1, r)), luma(px(4 * x + 2, r)), luma(px(4 * x + 3, r))); return; }
  int rr = r - H, quarter = H / 4; bool isV = rr >= quarter; if (isV) rr -= quarter;
  int cw = W / 2; vec4 res;
  for (int k = 0; k < 4; k++) {
    int b = rr * W + 4 * x + k, cy = b / cw, cx = b - cy * cw, sx = 2 * cx, sy = 2 * cy;
    vec3 c = (px(sx - 1, sy) + 2.0 * px(sx, sy) + px(sx + 1, sy) + px(sx - 1, sy + 1) + 2.0 * px(sx, sy + 1) + px(sx + 1, sy + 1)) * 0.125;
    float y = dot(c, K);
    res[k] = q(isV ? 128.0 + 224.0 * (c.r - y) / 1.5748 : 128.0 + 224.0 * (c.b - y) / 1.8556);
  }
  o = res;
}`;
      const ADD = `#version 300 es
precision highp float;
uniform highp sampler2D acc, src; uniform float keep; out vec4 o;
void main() { ivec2 p = ivec2(gl_FragCoord.xy); o = texelFetch(acc, p, 0) * keep + texelFetch(src, p, 0); }`;
      const program = fs => {
        const pr = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
          const sh = gl.createShader(type);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
          gl.attachShader(pr, sh);
        }
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        return pr;
      };
      const texture = (fmt, w, h) => {
        const tx = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        return tx;
      };
      const target = tx => {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('incomplete framebuffer');
        return fb;
      };
      const pack = program(PACK);
      gl.useProgram(pack);
      gl.uniform1i(gl.getUniformLocation(pack, 'W'), W);
      gl.uniform1i(gl.getUniformLocation(pack, 'H'), H);
      gl.uniform1i(gl.getUniformLocation(pack, 'src'), 0);
      const uScale = gl.getUniformLocation(pack, 'scale');
      const srcTex = texture(gl.RGBA8, W, H);
      const outFb = target(texture(gl.RGBA8, W / 4, H * 1.5));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // transparent pixels become black, like the RGBA path
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const buf = new Uint8Array(W * H * 1.5);
      let add = null, uKeep = null, accTex = null, accFb = null, cur = 0;
      const upload = source => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, source);
      };
      const finish = (tex, scale) => {
        gl.useProgram(pack);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1f(uScale, scale);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
        gl.viewport(0, 0, W / 4, H * 1.5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0, 0, W / 4, H * 1.5, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      };
      return {
        W, H, floatOK,
        pack(source) {
          upload(source);
          return finish(srcTex, 1);
        },
        accumulate(source, first) {
          if (!add) {
            add = program(ADD);
            gl.useProgram(add);
            gl.uniform1i(gl.getUniformLocation(add, 'src'), 0);
            gl.uniform1i(gl.getUniformLocation(add, 'acc'), 1);
            uKeep = gl.getUniformLocation(add, 'keep');
            accTex = [texture(gl.RGBA32F, W, H), texture(gl.RGBA32F, W, H)];
            accFb = accTex.map(target);
          }
          upload(source);
          gl.useProgram(add);
          gl.uniform1f(uKeep, first ? 0 : 1);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, accTex[cur]);
          gl.bindFramebuffer(gl.FRAMEBUFFER, accFb[1 - cur]);
          gl.viewport(0, 0, W, H);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindTexture(gl.TEXTURE_2D, null);
          cur = 1 - cur;
        },
        packAccumulated(n) {
          return finish(accTex[cur], 1 / n);
        },
      };
    };
    let packer = null;
    if (info.canvasMode) {
      try {
        packer = makePacker(window.__studioCanvas.width, window.__studioCanvas.height);
      } catch (e) {
        console.warn(`GPU packer unavailable (${e.message}); sending RGBA`);
      }
    }
    info.packer = packer ? 'yuv420' : null;
    info.floatAccum = !!packer?.floatOK;
    const yuvPixels = async it => {
      const c = window.__studioCanvas;
      if (c.width !== packer.W || c.height !== packer.H) throw new Error(`the canvas changed size to ${c.width}x${c.height} during the render`);
      if (!it.subs) {
        await draw(it.t, { frame: it.frame });
        return packer.pack(c);
      }
      for (let k = 0; k < it.subs.length; k++) {
        await draw(it.subs[k], { frame: it.frame, sub: true });
        packer.accumulate(c, k === 0);
      }
      return packer.packAccumulated(it.subs.length);
    };
    const pixels = async (it, fmt) => {
      const d = fmt === 'yuv420' ? await yuvPixels(it) : await rgbaPixels(it);
      return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    };
    let labelBox = null;
    window.__studioCap = {
      info,
      // Canvas mode: draw frames and return them as base64 (yuv420p planes or RGBA), one string each.
      async grab(items, fmt) {
        const out = [];
        for (const it of items) out.push(b64(await pixels(it, fmt)));
        return out;
      },
      async hash(it, fmt) {
        const d = await crypto.subtle.digest('SHA-1', await pixels(it, fmt));
        return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
      },
      // Contact sheet drawn in the page: captions sit under the thumbnails, so nothing covers the frame.
      async sheet({ times, cols, thumbWidth }) {
        const c = window.__studioCanvas, S = window.SHOT;
        const tw = thumbWidth, th = Math.round((tw * c.height) / c.width);
        const cap = Math.round(tw * 0.11), pad = 6, rows = Math.ceil(times.length / cols);
        const sc = document.createElement('canvas');
        sc.width = pad + cols * (tw + pad);
        sc.height = pad + rows * (th + cap + pad);
        const g = sc.getContext('2d', { alpha: false });
        g.fillStyle = '#101012';
        g.fillRect(0, 0, sc.width, sc.height);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.textBaseline = 'middle';
        const family = info.meta?.font ? `"${info.meta.font}", system-ui, sans-serif` : 'system-ui, sans-serif';
        const size = Math.round(cap * 0.38);
        const fit = (text, max) => {
          if (g.measureText(text).width <= max) return text;
          let s = text;
          while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
          return `${s}…`;
        };
        for (let i = 0; i < times.length; i++) {
          const t = times[i];
          const x = pad + (i % cols) * (tw + pad), y = pad + Math.floor(i / cols) * (th + cap + pad);
          await draw(t, { frame: Math.round(t * info.fps) });
          g.drawImage(c, x, y, tw, th);
          const d = S && typeof S.describe === 'function' ? S.describe(t) : null;
          const m = Math.floor(t / 60);
          const head = d ? `${d.time}  ${d.bar}  ${d.section || '-'}  ${d.shots.join('+') || '—'}` : `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
          g.font = `600 ${size}px ${family}`;
          g.fillStyle = '#ffd34d';
          g.fillText(fit(head, tw - 8), x + 4, y + th + cap * 0.28);
          if (d && d.line) {
            g.font = `400 ${size}px ${family}`;
            g.fillStyle = '#e8e8ea';
            g.fillText(fit(d.line, tw - 8), x + 4, y + th + cap * 0.72);
          }
        }
        const data = g.getImageData(0, 0, sc.width, sc.height).data;
        return { width: sc.width, height: sc.height, data: b64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) };
      },
      // Page mode: draw, then let the compositor produce the frame before a screenshot.
      async seek(t, frame, label) {
        await draw(t, { frame });
        if (window.document.getAnimations) for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
        if (label) {
          if (!labelBox) {
            labelBox = document.createElement('div');
            labelBox.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:0.6em 1em;background:rgba(0,0,0,.78);color:#ffd34d;font:600 4vh/1.2 system-ui,sans-serif';
            document.body.appendChild(labelBox);
          }
          const m = Math.floor(t / 60);
          labelBox.textContent = `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
        }
        await raf();
      },
    };
    return info;
  })();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────────────

export function ffmpegBin() {
  return process.env.STUDIO_FFMPEG || 'ffmpeg';
}

function run(bin, args, { input, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true });
    let err = '', out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => {
      err = (err + d).slice(-20000);
      if (!quiet) process.stderr.write(d);
    });
    p.on('error', e => reject(new Error(`${bin}: ${e.message}`)));
    p.on('close', code => (code === 0 ? resolve({ out, err }) : reject(new Error(`${path.basename(bin)} failed (${code}):\n${err.slice(-2000)}`))));
    if (input) p.stdin.end(input);
  });
}

function encoder(codec, { crf, preset, fps, threads }) {
  const color = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  if (codec === 'nvenc') return ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf ?? 16), '-b:v', '0', '-spatial-aq', '1', '-temporal-aq', '1', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps * 2)), ...color];
  if (codec === 'prores') return ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le', ...color];
  return ['-c:v', 'libx264', '-preset', preset || 'slow', '-crf', String(crf ?? 16), '-tune', 'film', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps * 2)), '-threads', String(threads), ...color];
}

/** Subframe times for frame f: a centred shutter window clamped so it never crosses a cut. */
export function subframes(f, fps, n, shutter, cuts, duration) {
  const t = f / fps;
  if (n <= 1) return null;
  let lo = 0, hi = duration - 1e-4;
  // cut times come rounded to 6 decimals: a shot starting at 29.694000000000003 is listed as 29.694, so a subframe
  // clamped to the listed cut itself would still draw the shot before it
  for (const c of cuts) {
    if (c <= t + 1e-9) lo = Math.max(lo, c + 1e-6);
    else {
      hi = Math.min(hi, c - 1e-4);
      break;
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) out.push(Math.min(hi, Math.max(lo, t + (shutter / fps) * ((k + 0.5) / n - 0.5))));
  return out;
}

function contentKey(root, extra) {
  const h = crypto.createHash('sha1');
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (/^(out|qa|audio|node_modules|\.git|\.segments)$/.test(d.name)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else {
        const s = fs.statSync(p);
        h.update(`${path.relative(root, p)}|${s.size}|${Math.round(s.mtimeMs)}\n`);
      }
    }
  };
  walk(root);
  for (const f of fs.existsSync(ENGINE_DIR) ? fs.readdirSync(ENGINE_DIR) : []) {
    const s = fs.statSync(path.join(ENGINE_DIR, f));
    h.update(`engine/${f}|${s.size}|${Math.round(s.mtimeMs)}\n`);
  }
  h.update(JSON.stringify(extra));
  return h.digest('hex').slice(0, 12);
}

const fmtTime = s => {
  if (!Number.isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`;
};

// ─── Session: server + browsers ────────────────────────────────────────────────────────────

async function openSession({ root, page = 'film.html', query = {}, viewport, headful, allowSoftware, pageOpts = {}, log = () => {} }) {
  const server = await startServer({ root, engineDir: ENGINE_DIR });
  const qs = new URLSearchParams({ render: '1', ...Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== false)) });
  const url = `${server.url}${page.replace(/\\/g, '/')}?${qs}`;
  const browsers = [];
  const open = async () => {
    const browser = await launchBrowser({ headful });
    browsers.push(browser);
    const p = await browser.newPage(viewport || { width: 1920, height: 1080 });
    p.onConsole = (type, text) => {
      // Engine warnings ([studio] …) reach the log once, through meta.warnings, not once per worker.
      if (type === 'error' || (type === 'warning' && !text.startsWith('[studio]'))) log(`  page ${type}: ${text}`);
    };
    await p.goto(url);
    let info;
    try {
      info = await p.evaluate(`(${pageAdapter.toString()})(${JSON.stringify(pageOpts)})`, { timeout: 240_000 });
    } catch (e) {
      const more = p.errors.length ? `\n${p.errors.slice(-3).join('\n')}` : '';
      throw new Error(`${e.message}${more}`);
    }
    // Filtering software (ad blockers like AdGuard, antivirus web shields) may insert its own
    // scripts into local pages. Frames come from the canvas, so they are unaffected, but say so.
    info.foreign = await p.evaluate('[...document.scripts].map(s => s.src).filter(s => s && new URL(s, location.href).origin !== location.origin).map(s => new URL(s, location.href).host)').catch(() => []);
    const gpu = await p.gpu();
    if (isSoftwareGL(gpu) && !allowSoftware) {
      throw new Error(`The browser is rendering in software (${gpu}). That is up to 10× slower and WebGL may look different.\nFix the GPU (drivers, remote desktop, VM), try --headful, or pass --allow-software to accept it.`);
    }
    if (!info.canvasMode) await p.send('Emulation.setDeviceMetricsOverride', { width: info.width, height: info.height, deviceScaleFactor: 1, mobile: false });
    return { browser, page: p, info, gpu };
  };
  return {
    server,
    url,
    open,
    async close() {
      await Promise.all(browsers.map(b => b.close()));
      await server.close();
    },
  };
}

// How frames travel: yuv420 (GPU-packed planes), rgba (canvas pixels) or png (page screenshots).
function captureFormat(info, { codec, blur = 1 } = {}) {
  if (!info.canvasMode) return 'png';
  if (codec === 'prores') return 'rgba'; // 4:2:2 10-bit wants full chroma, not 4:2:0
  if (info.packer === 'yuv420' && (blur <= 1 || info.floatAccum)) return 'yuv420';
  return 'rgba';
}

const frameBytes = (fmt, W, H) => (fmt === 'yuv420' ? (W * H * 3) / 2 : W * H * 4);

async function grabFrames(page, items, fmt, W, H) {
  const strings = await page.evaluate(`window.__studioCap.grab(${JSON.stringify(items)}, ${JSON.stringify(fmt)})`);
  const want = frameBytes(fmt, W, H);
  return strings.map(s => {
    const buf = Buffer.from(s, 'base64');
    if (buf.length !== want) throw new Error(`a ${fmt} frame has ${buf.length} bytes, expected ${want} (did the canvas change size?)`);
    return buf;
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────────────────

/** Load the page and report its contract, GPU and sound events (no frames rendered). */
export async function probe({ root, page = 'film.html', query = {}, headful, allowSoftware = true, pageOpts }) {
  const s = await openSession({ root, page, query, headful, allowSoftware, pageOpts });
  try {
    const w = await s.open();
    return { ...w.info, gpu: w.gpu, browser: w.browser.bin };
  } finally {
    await s.close();
  }
}

/**
 * Render a video. Options: root, page, out, from, to, scale, w, h, blur, shutter, workers, codec,
 * crf, preset, audio, headful, allowSoftware, segmentSeconds, keepSegments, label, pageOpts, log.
 */
export async function renderVideo(o) {
  const log = o.log || (m => console.log(m));
  const root = path.resolve(o.root);
  const codec = o.codec || 'x264';
  const blur = Math.max(1, Math.round(o.blur || 1));
  const shutter = o.shutter ?? 0.5;
  const query = { scale: o.scale, w: o.w, h: o.h, label: o.label ? 1 : undefined };
  const session = await openSession({ root, page: o.page, query, headful: o.headful, allowSoftware: o.allowSoftware, pageOpts: o.pageOpts || {}, log });
  const stop = async () => {
    await session.close().catch(() => {});
  };
  const onSig = () => {
    stop().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSig);
  try {
    const first = await session.open();
    const info = first.info;
    if (info.foreign?.length) log(`  note: something on this computer inserts scripts from ${[...new Set(info.foreign)].join(', ')} into the page (frames come from the canvas and are unaffected)`);
    const W = info.width, H = info.height, fps = info.fps;
    if (!(W > 0 && H > 0 && fps > 0)) throw new Error(`page reported an invalid size or fps (${W}×${H} @ ${fps})`);
    const fmt = captureFormat(info, { codec, blur });
    const total = Math.round(info.duration * fps);
    const f0 = Math.max(0, Math.floor((o.from ?? 0) * fps + 1e-6));
    const f1 = Math.min(total, o.to != null ? Math.ceil(o.to * fps - 1e-6) : total);
    if (f1 <= f0) throw new Error(`nothing to render between ${o.from ?? 0} s and ${o.to ?? info.duration} s`);
    const cuts = info.cuts || [];
    const cpu = os.cpus().length;
    let workers = o.workers || Math.max(1, Math.floor(cpu / 2));
    if (codec === 'nvenc') workers = Math.min(workers, 3); // consumer GPUs limit concurrent NVENC sessions
    // Segments: about three per worker so every worker stays busy, each 2–8 s (or as asked).
    const segFrames = o.segmentSeconds ? Math.max(1, Math.round(o.segmentSeconds * fps)) : Math.round(Math.min(8 * fps, Math.max(2 * fps, (f1 - f0) / (workers * 3))));
    const segs = [];
    for (let a = f0; a < f1; a += segFrames) segs.push([a, Math.min(f1, a + segFrames)]);
    workers = Math.max(1, Math.min(workers, segs.length));
    const threads = Math.max(2, Math.floor(cpu / workers));
    const ext = codec === 'prores' ? '.mov' : '.mp4';
    const key = contentKey(root, { W, H, fps, blur, shutter, codec, crf: o.crf, preset: o.preset, f0, f1, segFrames, page: o.page, query, fmt, outHeight: o.outHeight });
    const segDir = path.join(root, 'out', '.segments', key);
    fs.mkdirSync(segDir, { recursive: true });
    const segName = i => `seg_${String(i).padStart(5, '0')}`;
    const done = new Set(segs.map((s, i) => i).filter(i => fs.existsSync(path.join(segDir, `${segName(i)}.done`))));
    log(`  ${info.engine} · ${W}×${H} @ ${fps} fps · frames ${f0}–${f1 - 1} (${f1 - f0}) · ${segs.length} segments × ${workers} workers · ${fmt} → ${codec}${blur > 1 ? ` · blur ${blur}×${shutter}` : ''}`);
    log(`  GPU: ${first.gpu}`);
    if (done.size) log(`  resuming: ${done.size}/${segs.length} segments already rendered`);
    for (const w of info.meta?.warnings || []) log(`  warning: ${w}`);

    const queue = segs.map((s, i) => i).filter(i => !done.has(i));
    let rendered = 0;
    const startTime = Date.now();
    const totalTodo = queue.reduce((a, i) => a + (segs[i][1] - segs[i][0]), 0);
    let lastPrint = 0;
    const progress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPrint < 500) return;
      lastPrint = now;
      const el = (now - startTime) / 1000, rate = rendered / Math.max(el, 1e-3);
      const msg = `  render ${rendered}/${totalTodo} frames · ${rate.toFixed(1)} fps · ETA ${fmtTime((totalTodo - rendered) / Math.max(rate, 1e-3))}`;
      if (process.stdout.isTTY) process.stdout.write(`\r${msg}   `);
      else if (force || Math.floor((rendered / totalTodo) * 10) !== Math.floor(((rendered - 1) / totalTodo) * 10)) log(msg);
    };

    const color = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
    const input =
      fmt === 'yuv420' ? ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', ...color, '-s', `${W}x${H}`, '-framerate', String(fps), '-i', 'pipe:0']
      : fmt === 'rgba' ? ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', 'pipe:0']
      : ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps * blur), '-i', 'pipe:0'];
    const vf = [];
    if (fmt === 'png' && blur > 1) vf.push(`tmix=frames=${blur}`, `select='not(mod(n+1\\,${blur}))'`, `setpts=N/(${fps}*TB)`);
    if (o.outHeight && o.outHeight !== H) vf.push(`scale=-2:${o.outHeight}:flags=lanczos`);
    if (fmt !== 'yuv420') vf.push('scale=out_color_matrix=bt709:out_range=tv');
    const perCall = Math.max(1, Math.min(8, Math.floor(8e6 / frameBytes(fmt, W, H))));

    const runWorker = async w => {
      while (queue.length) {
        const si = queue.shift();
        const [a, b] = segs[si];
        const segPath = path.join(segDir, `${segName(si)}${ext}`);
        const args = ['-hide_banner', '-loglevel', 'error', '-y', ...input, ...(vf.length ? ['-vf', vf.join(',')] : []), '-r', String(fps), ...encoder(codec, { crf: o.crf, preset: o.preset, fps, threads }), '-an', segPath];
        const ff = spawn(ffmpegBin(), args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
        let ffErr = '';
        ff.stderr.on('data', d => (ffErr = (ffErr + d).slice(-4000)));
        const exited = new Promise((resolve, reject) => {
          ff.on('error', e => reject(new Error(`ffmpeg: ${e.message}`)));
          ff.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed on segment ${si} (${code}):\n${ffErr}`))));
        });
        exited.catch(() => {});
        ff.stdin.on('error', () => {});
        const write = async buf => {
          if (!ff.stdin.write(buf)) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), exited]);
        };
        const items = [];
        for (let f = a; f < b; f++) items.push({ t: f / fps, frame: f, subs: blur > 1 ? subframes(f, fps, blur, shutter, cuts, info.duration) : null });
        if (fmt === 'png') {
          for (const it of items) {
            for (const st of it.subs || [it.t]) {
              await w.page.evaluate(`window.__studioCap.seek(${st}, ${it.frame}, ${o.label ? 'true' : 'false'})`);
              await write(await w.page.screenshot({ width: W, height: H }));
            }
            rendered++;
            progress();
          }
        } else {
          // Ask for the next batch before writing this one, so the page draws while ffmpeg encodes.
          const batches = [];
          for (let i = 0; i < items.length; i += perCall) batches.push(items.slice(i, i + perCall));
          let next = grabFrames(w.page, batches[0], fmt, W, H);
          try {
            for (let k = 0; k < batches.length; k++) {
              const frames = await next;
              next = k + 1 < batches.length ? grabFrames(w.page, batches[k + 1], fmt, W, H) : null;
              for (const buf of frames) await write(buf);
              rendered += frames.length;
              progress();
            }
          } finally {
            next?.catch(() => {});
          }
        }
        ff.stdin.end();
        await exited;
        fs.writeFileSync(path.join(segDir, `${segName(si)}.done`), JSON.stringify({ frames: [a, b], at: new Date().toISOString() }));
      }
    };

    const pool = [first];
    if (queue.length > 1) {
      const extra = await Promise.all(Array.from({ length: Math.min(workers, queue.length) - 1 }, () => session.open()));
      for (const w of extra) {
        if (w.gpu !== first.gpu) log(`  note: worker GPU differs: ${w.gpu}`);
        pool.push(w);
      }
    }
    await Promise.all(pool.map(w => runWorker(w)));
    progress(true);
    if (process.stdout.isTTY) process.stdout.write('\n');

    // Join segments (no re-encode), then add audio padded or trimmed to the picture.
    const list = path.join(segDir, 'list.txt');
    fs.writeFileSync(list, segs.map((s, i) => `file '${segName(i)}${ext}'`).join('\n') + '\n');
    const joined = path.join(segDir, `joined${ext}`);
    await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
    const out = path.resolve(o.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const seconds = (f1 - f0) / fps;
    const audio = o.audio && fs.existsSync(o.audio) ? o.audio : null;
    if (audio) {
      const ss = f0 > 0 ? ['-ss', String(f0 / fps)] : [];
      await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', joined, ...ss, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', 'apad', '-c:a', codec === 'prores' ? 'pcm_s24le' : 'aac', ...(codec === 'prores' ? [] : ['-b:a', o.audioBitrate || '320k']), '-ar', '48000', '-t', seconds.toFixed(6), '-movflags', '+faststart', out]);
    } else {
      await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', joined, '-c', 'copy', '-movflags', '+faststart', out]);
    }
    const took = (Date.now() - startTime) / 1000;
    if (!o.keepSegments) {
      fs.rmSync(segDir, { recursive: true, force: true });
      try {
        fs.rmdirSync(path.dirname(segDir)); // out/.segments, when no other render left its segments
      } catch {}
    }
    const result = {
      out: path.relative(root, out).replace(/\\/g, '/'),
      width: W,
      height: H,
      fps,
      frames: f1 - f0,
      from: f0 / fps,
      to: f1 / fps,
      duration: info.duration,
      audio: audio ? path.relative(root, audio).replace(/\\/g, '/') : null,
      codec,
      capture: fmt,
      blur,
      shutter,
      workers: pool.length,
      gpu: first.gpu,
      engine: info.engine,
      cuts,
      shots: info.meta?.shots || [],
      sfx: info.sfx || [],
      song: info.meta?.song || null,
      warnings: info.meta?.warnings || [],
      seconds: +took.toFixed(1),
      renderFps: +(totalTodo / Math.max(took, 1e-3)).toFixed(1),
      finished: new Date().toISOString(),
    };
    log(`  wrote ${result.out} · ${(fs.statSync(out).size / 1e6).toFixed(1)} MB · ${took.toFixed(1)} s (${result.renderFps} fps)`);
    return result;
  } finally {
    process.removeListener('SIGINT', onSig);
    await stop();
  }
}

/** Render single frames to PNG files. times: seconds. Returns written paths. */
export async function renderStills(o) {
  const root = path.resolve(o.root);
  const session = await openSession({ root, page: o.page, query: { scale: o.scale, w: o.w, h: o.h, label: o.label ? 1 : undefined }, headful: o.headful, allowSoftware: o.allowSoftware ?? true, pageOpts: o.pageOpts || {}, log: o.log || console.log });
  try {
    const w = await session.open();
    const { width: W, height: H, fps, duration } = w.info;
    fs.mkdirSync(o.outDir, { recursive: true });
    const written = [];
    for (let i = 0; i < o.times.length; i++) {
      const t = Math.min(Math.max(0, o.times[i]), duration - 1 / fps);
      const frame = Math.round(t * fps);
      const name = o.naming === 'index' ? `${o.prefix || 'still'}_${String(i + 1).padStart(4, '0')}.png` : `${o.prefix || 'still'}_${t.toFixed(3).padStart(8, '0')}.png`;
      const file = path.join(o.outDir, name);
      if (w.info.canvasMode) {
        const [rgba] = await grabFrames(w.page, [{ t, frame, subs: null }], 'rgba', W, H);
        fs.writeFileSync(file, encodePNG(rgba, W, H));
      } else {
        await w.page.evaluate(`window.__studioCap.seek(${t}, ${frame}, ${o.label ? 'true' : 'false'})`);
        fs.writeFileSync(file, await w.page.screenshot({ width: W, height: H }));
      }
      written.push(file);
    }
    return { files: written, info: w.info, gpu: w.gpu };
  } finally {
    await session.close();
  }
}

/**
 * Contact sheet: one thumbnail every `every` seconds, cols × rows per sheet, captioned with time,
 * bar.beat, section, shots and lyric line. Returns sheet paths.
 */
export async function renderSheet(o) {
  const root = path.resolve(o.root);
  const info = o.info || (await probe({ root, page: o.page, query: { w: o.w, h: o.h }, allowSoftware: true, pageOpts: o.pageOpts }));
  const cols = o.cols || 6, rows = o.rows || 5, thumbWidth = o.thumbWidth || 480;
  const times = [];
  for (let t = o.from ?? 0; t < (o.to ?? info.duration) - 1e-6; t += o.every) times.push(+t.toFixed(4));
  fs.mkdirSync(o.outDir, { recursive: true });
  const prefix = o.prefix || 'sheet';
  const isSheet = f => f.startsWith(`${prefix}_`) && /^\d+\.png$/.test(f.slice(prefix.length + 1));
  for (const f of fs.readdirSync(o.outDir)) if (isSheet(f)) fs.rmSync(path.join(o.outDir, f));
  const fullWidth = info.width / (info.meta?.scale || 1);
  if (info.canvasMode) {
    // Draw at twice the thumbnail size and let the page downsample: sharp, and cheaper than full size.
    const scale = Math.min(1, (2 * thumbWidth) / fullWidth);
    const session = await openSession({ root, page: o.page, query: { scale: +scale.toFixed(5), w: o.w, h: o.h }, headful: o.headful, allowSoftware: o.allowSoftware ?? true, pageOpts: o.pageOpts || {}, log: o.log || console.log });
    try {
      const w = await session.open();
      const per = cols * rows;
      for (let k = 0; k * per < times.length; k++) {
        const page = times.slice(k * per, (k + 1) * per);
        const r = await w.page.evaluate(`window.__studioCap.sheet(${JSON.stringify({ times: page, cols: Math.min(cols, page.length), thumbWidth })})`);
        fs.writeFileSync(path.join(o.outDir, `${prefix}_${String(k + 1).padStart(2, '0')}.png`), encodePNG(Buffer.from(r.data, 'base64'), r.width, r.height));
      }
    } finally {
      await session.close();
    }
  } else {
    // Page mode: labelled screenshots, tiled by ffmpeg.
    const tmp = path.join(o.outDir, '.thumbs');
    fs.rmSync(tmp, { recursive: true, force: true });
    await renderStills({ ...o, root, times, scale: +(thumbWidth / fullWidth).toFixed(5), label: true, outDir: tmp, prefix: 'thumb', naming: 'index' });
    const used = Math.min(rows, Math.ceil(times.length / cols));
    await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'thumb_%04d.png'), '-vf', `tile=${Math.min(cols, times.length)}x${used}:padding=6:margin=6:color=0x101012`, '-start_number', '1', path.join(o.outDir, `${prefix}_%02d.png`)]);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const sheets = fs.readdirSync(o.outDir).filter(isSheet).sort().map(f => path.join(o.outDir, f));
  return { sheets, count: times.length, info };
}

/** Determinism check: the same times rendered in a different order, in a fresh browser, must match. */
export async function verify(o) {
  const root = path.resolve(o.root);
  const session = await openSession({ root, page: o.page, query: { scale: o.scale ?? 0.5, w: o.w, h: o.h }, headful: o.headful, allowSoftware: o.allowSoftware ?? true, pageOpts: o.pageOpts || {}, log: o.log || console.log });
  try {
    const a = await session.open();
    const { fps, duration, cuts } = a.info;
    const fmt = captureFormat(a.info, { codec: o.codec });
    const set = new Set([0, Math.max(0, duration - 1 / fps)]);
    for (const c of cuts) for (const d of [-1, 0, 1]) set.add(Math.min(duration - 1 / fps, Math.max(0, c + d / fps)));
    const n = o.samples || 16;
    for (let i = 0; i < n; i++) set.add(Math.floor(((i + 0.5) / n) * duration * fps) / fps);
    const times = [...set].sort((x, y) => x - y).map(t => +t.toFixed(6));
    const hashOf = async (w, t) => {
      const frame = Math.round(t * fps);
      if (fmt !== 'png') return w.page.evaluate(`window.__studioCap.hash(${JSON.stringify({ t, frame, subs: null })}, ${JSON.stringify(fmt)})`);
      await w.page.evaluate(`window.__studioCap.seek(${t}, ${frame}, false)`);
      return crypto.createHash('sha1').update(await w.page.screenshot({ width: w.info.width, height: w.info.height })).digest('hex');
    };
    const first = {};
    for (const t of times) first[t] = await hashOf(a, t);
    const b = await session.open(); // a fresh browser process
    const shuffled = [...times].sort((x, y) => hashNum(x) - hashNum(y));
    const mismatches = [];
    for (const t of shuffled) if ((await hashOf(b, t)) !== first[t]) mismatches.push(t);
    return { times, mismatches, capture: fmt };
  } finally {
    await session.close();
  }
}
const hashNum = x => parseInt(crypto.createHash('md5').update(String(x)).digest('hex').slice(0, 8), 16);
