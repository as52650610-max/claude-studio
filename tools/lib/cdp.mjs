// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe. Zero dependencies.
// Launches local Chrome or Edge (headless by default), opens pages, evaluates, screenshots.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function findBrowser() {
  const env = process.env.STUDIO_BROWSER || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const c = [];
  if (process.platform === 'win32') {
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const la = process.env.LOCALAPPDATA || '';
    c.push(
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(la, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(la, 'Chromium\\Application\\chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    c.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    );
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) {
      const r = spawnSync('which', [name], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) c.push(r.stdout.trim());
    }
  }
  return c.find(p => p && fs.existsSync(p)) || null;
}

export const isSoftwareGL = s => /swiftshader|llvmpipe|softpipe|\bwarp\b|basic render|software/i.test(String(s));

// CDP over Chrome's --remote-debugging-pipe: NUL-terminated JSON on fds 3 (to the browser) and 4 (from it).
// Unlike Node's built-in WebSocket client, a pipe has no message size limit (1080p PNGs can exceed 4 MB).
class Client {
  constructor(writable, readable) {
    this.out = writable;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    let parts = [];
    readable.on('data', chunk => {
      let start = 0;
      for (let i = chunk.indexOf(0); i !== -1; i = chunk.indexOf(0, start)) {
        parts.push(chunk.subarray(start, i));
        const msg = Buffer.concat(parts).toString('utf8');
        parts = [];
        start = i + 1;
        this.#onMessage(msg);
      }
      if (start < chunk.length) parts.push(chunk.subarray(start));
    });
    const onClose = () => {
      if (this.closed) return;
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error(`browser closed during ${p.method}`));
      this.pending.clear();
    };
    readable.on('close', onClose);
    readable.on('error', onClose);
    writable.on('error', onClose);
  }
  #onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.id) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`));
      else p.resolve(msg.result);
      return;
    }
    for (const l of this.listeners) l(msg);
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error(`browser is closed (${method})`));
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.out.write(JSON.stringify(payload) + '\0');
    });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export class Page {
  constructor(client, sessionId) {
    this.client = client;
    this.sessionId = sessionId;
    this.errors = [];
    this.console = [];
    this.onConsole = null;
    client.on(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') this.errors.push(formatException(msg.params.exceptionDetails));
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
        const line = `[${msg.params.type}] ${text}`;
        this.console.push(line);
        if (this.console.length > 200) this.console.shift();
        this.onConsole?.(msg.params.type, text);
      }
    });
  }
  send(method, params) {
    return this.client.send(method, params, this.sessionId);
  }
  waitFor(method, timeout = 60_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
      const off = this.client.on(msg => {
        if (msg.sessionId === this.sessionId && msg.method === method) {
          clearTimeout(timer);
          off();
          resolve(msg.params);
        }
      });
    });
  }
  async goto(url, timeout = 60_000) {
    // Wait for the load event of this navigation (matched by loaderId), not a stale about:blank one.
    await this.send('Page.setLifecycleEventsEnabled', { enabled: true });
    const seen = [];
    let wake = null;
    const off = this.client.on(msg => {
      if (msg.sessionId === this.sessionId && msg.method === 'Page.lifecycleEvent' && msg.params.name === 'load') {
        seen.push(msg.params.loaderId);
        wake?.();
      }
    });
    try {
      const r = await this.send('Page.navigate', { url });
      if (r.errorText) throw new Error(`cannot open ${url}: ${r.errorText}`);
      const t0 = Date.now();
      while (!seen.includes(r.loaderId)) {
        if (Date.now() - t0 > timeout) throw new Error(`timed out loading ${url}`);
        await new Promise(res => {
          wake = res;
          setTimeout(res, 100);
        });
      }
    } finally {
      off();
    }
  }
  async evaluate(expression, { timeout = 120_000, awaitPromise = true } = {}) {
    let timer;
    const t = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`page did not answer within ${Math.round(timeout / 1000)} s${this.errors.length ? `; page errors:\n${this.errors.slice(-3).join('\n')}` : ''}`)), timeout)));
    try {
      const r = await Promise.race([this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true }), t]);
      if (r.exceptionDetails) throw new Error(formatException(r.exceptionDetails));
      return r.result.value;
    } finally {
      clearTimeout(timer);
    }
  }
  async screenshot({ width, height, format = 'png' } = {}) {
    const params = { format, optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true };
    if (width && height) params.clip = { x: 0, y: 0, width, height, scale: 1 };
    const r = await this.send('Page.captureScreenshot', params);
    return Buffer.from(r.data, 'base64');
  }
  gpu() {
    return this.evaluate(`(() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'no WebGL'; const e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return 'error: ' + e.message; } })()`);
  }
}

export function formatException(d) {
  if (!d) return 'unknown page error';
  const ex = d.exception;
  let msg = (ex && (ex.description || (ex.value !== undefined ? String(ex.value) : ''))) || d.text || 'page error';
  if (d.url && !msg.includes(d.url)) msg += `\n    at ${d.url}:${(d.lineNumber ?? 0) + 1}:${(d.columnNumber ?? 0) + 1}`;
  return msg;
}

// Chrome occasionally hangs at startup when several instances start at the same moment (about 1 in
// 20 with 8 at once on Windows, with a pipe or a port alike). Spacing the spawns 300 ms apart
// avoided it in 64 of 64 trials; a launch that still does not answer is killed and retried.
let spawnGate = Promise.resolve();
const SPAWN_GAP = 300;

export async function launchBrowser({ attempts = 3, timeout = 15_000, ...opts } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const turn = spawnGate;
    let release;
    spawnGate = new Promise(r => (release = r));
    await turn;
    setTimeout(release, SPAWN_GAP);
    try {
      return await launchOnce({ ...opts, timeout });
    } catch (e) {
      last = e;
      if (e.fatal) throw e;
    }
  }
  throw last;
}

async function launchOnce({ headful = false, args = [], timeout, browser }) {
  const bin = browser || findBrowser();
  if (!bin) throw Object.assign(new Error('No Chrome or Edge found. Install one, or set STUDIO_BROWSER=/path/to/chrome.'), { fatal: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-browser-'));
  const angle = process.platform === 'win32' ? '--use-angle=d3d11' : process.platform === 'darwin' ? '--use-angle=metal' : null;
  const flags = [
    headful ? null : '--headless=new',
    `--user-data-dir=${dir}`,
    '--remote-debugging-pipe',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--mute-audio',
    '--hide-scrollbars',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=Translate,BackForwardCache,CalculateNativeWinOcclusion,MediaRouter',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    angle,
    headful ? '--window-size=1280,800' : null,
    ...args,
    'about:blank',
  ].filter(Boolean);
  const proc = spawn(bin, flags, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  proc.stderr.on('data', d => (stderr = (stderr + d).slice(-4000)));
  const client = new Client(proc.stdio[3], proc.stdio[4]);
  const exited = new Promise(r => proc.once('exit', code => r(code)));
  let timer;
  try {
    await Promise.race([
      client.send('Browser.getVersion'),
      exited.then(code => {
        throw new Error(`browser exited (${code}): ${stderr.slice(-800)}`);
      }),
      new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`browser did not answer within ${timeout / 1000} s ${stderr.slice(-800)}`.trim())), timeout))),
    ]);
    clearTimeout(timer);
  } catch (e) {
    clearTimeout(timer);
    proc.kill();
    setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 1000);
    throw e;
  }
  let closed = false;
  return {
    bin,
    client,
    proc,
    async newPage({ width = 1280, height = 720 } = {}) {
      const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
      const page = new Page(client, sessionId);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } }).catch(() => {});
      page.targetId = targetId;
      return page;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await Promise.race([client.send('Browser.close').catch(() => {}), exited, new Promise(r => setTimeout(r, 3000))]);
      } catch {}
      if (proc.exitCode === null) proc.kill();
      for (let i = 0; i < 20; i++) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    },
  };
}
