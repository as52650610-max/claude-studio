// Local static server for previews and renders. Binds 127.0.0.1 only.
// - Serves a project folder; /engine/* falls back to the studio's engine when the project has none.
// - Range requests (the preview seeks audio), no caching (edits show up immediately).
// - live: Server-Sent Events at /__studio/events tell the preview to reload when files change.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.lrc': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
};
const IGNORE_WATCH = /(^|[\\/])(out|qa|\.segments|node_modules|\.git)([\\/]|$)|~$|\.tmp$|\.swp$/;

export async function startServer({ root, engineDir, live = false, port = 0, quiet = true, routes = {} }) {
  root = path.resolve(root);
  if (engineDir) engineDir = path.resolve(engineDir);
  const clients = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (routes[url.pathname]) return serveFile(req, res, routes[url.pathname]); // studio pages (the lyric tapper)
      if (url.pathname === '/__studio/events') {
        if (!live) return send(res, 404, 'not live');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
      let rel = decodeURIComponent(url.pathname);
      let file = safeJoin(root, rel);
      if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        const idx = ['film.html', 'index.html'].map(n => path.join(file, n)).find(p => fs.existsSync(p));
        if (!idx) return listDir(res, file, rel);
        file = idx;
      }
      if ((!file || !fs.existsSync(file)) && engineDir && rel.startsWith('/engine/')) file = safeJoin(engineDir, rel.slice('/engine/'.length));
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, `not found: ${rel}`);
      serveFile(req, res, file);
    } catch (e) {
      if (!res.headersSent) send(res, 500, String(e && e.message));
      else res.destroy();
    }
  });
  server.keepAliveTimeout = 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actual = server.address().port;
  let watcher = null, timer = null;
  if (live) {
    try {
      watcher = fs.watch(root, { recursive: true }, (ev, name) => {
        if (!name || IGNORE_WATCH.test(name)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!quiet) console.log(`  changed: ${name} → reloading preview`);
          for (const c of clients) c.write('data: reload\n\n');
        }, 180);
      });
    } catch {}
  }
  return {
    port: actual,
    url: `http://127.0.0.1:${actual}/`,
    server,
    async close() {
      if (watcher) watcher.close();
      for (const c of clients) c.end();
      server.closeAllConnections?.();
      await new Promise(r => server.close(() => r()));
    },
  };
}

function safeJoin(root, rel) {
  root = path.resolve(root);
  const p = path.resolve(root, '.' + path.posix.normalize('/' + rel.replace(/\\/g, '/')));
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return p;
}

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function serveFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
    if (range[1] === '') end = stat.size - 1;
    if (start < 0 || start >= stat.size || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function listDir(res, dir, rel) {
  const items = fs.readdirSync(dir, { withFileTypes: true }).map(d => `<li><a href="${encodeURI(path.posix.join(rel, d.name))}${d.isDirectory() ? '/' : ''}">${d.name}${d.isDirectory() ? '/' : ''}</a></li>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${rel}</title><body style="font:14px system-ui;background:#111;color:#ddd"><h3>${rel}</h3><ul>${items.join('')}</ul>`);
}
