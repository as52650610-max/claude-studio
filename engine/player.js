// claude-studio preview player. MIT License.
// Loaded by studio.js when the page is opened without ?render=1. It never changes what a
// frame looks like: it only chooses which t to draw, plays the audio, and draws overlays.
//
// Keys: Space play/pause · ←/→ ±1 s (Shift ±5 s) · , . one frame · [ ] one bar · D debug
//       Home/End · L loop the current shot · M mute · ? help
// URL:  ?t=83.5 start time · ?debug=1 · ?lat=0.03 audio latency · ?w=1080&h=1920 · ?scale=0.5
//       ?audio=song (play the song, not audio/mix.wav)

const CSS = `
:root{color-scheme:dark}
html,body{margin:0;height:100%;background:#0b0b0d;color:#e8e8ea;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
.sp-root{position:fixed;inset:0;display:grid;grid-template-rows:1fr auto}
.sp-stage{position:relative;display:grid;place-items:center;min-height:0;overflow:hidden}
.sp-stage canvas{display:block;box-shadow:0 0 0 1px #222,0 12px 48px #0008}
.sp-overlay{position:absolute;pointer-events:none}
.sp-bar{display:grid;grid-template-columns:auto auto 1fr auto;gap:12px;align-items:center;padding:8px 12px;background:#141417;border-top:1px solid #26262b}
.sp-btn{background:#232329;color:#e8e8ea;border:1px solid #33333a;border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer}
.sp-btn:hover{background:#2c2c33}
.sp-btn.on{background:#3a3220;border-color:#a8822e;color:#ffd77a}
.sp-time{font:12px/1.2 ui-monospace,Consolas,monospace;white-space:pre;min-width:250px}
.sp-tl{width:100%;height:44px;cursor:pointer;display:block}
.sp-msg{position:absolute;left:16px;top:16px;max-width:min(720px,calc(100% - 32px));padding:12px 14px;border-radius:8px;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;display:none}
.sp-err{background:#2a0d0d;border:1px solid #ff6b6b;color:#ffd7d7}
.sp-help{background:#16161b;border:1px solid #33333a;color:#cfcfd4}
.sp-toast{position:absolute;right:16px;top:16px;padding:6px 10px;border-radius:6px;background:#1d2a1d;border:1px solid #3d6b3d;color:#cfe8cf;font-size:12px;opacity:0;transition:opacity .3s}
`;

const HELP = `Space  play / pause          ← →  ±1 s   (Shift ±5 s)
, .    one frame back / fwd     [ ]  previous / next bar
D      debug overlay            L    loop the current shot
Home   start      End  end      M    mute
?      this help

URL: ?t=83.5  ?debug=1  ?lat=0.03  ?w=1080&h=1920  ?scale=0.5  ?audio=song`;

const fmt = t => {
  const s = Math.max(0, t), m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

export function mountPlayer(f) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el('div', 'sp-root');
  const stage = el('div', 'sp-stage');
  const overlay = el('canvas', 'sp-overlay');
  const err = el('div', 'sp-msg sp-err');
  const help = el('div', 'sp-msg sp-help');
  const toast = el('div', 'sp-toast');
  help.textContent = HELP + (f.SHOT.meta.warnings?.length ? `\n\nWarnings:\n${f.SHOT.meta.warnings.join('\n')}` : '');
  stage.append(f.canvas, overlay, err, help, toast);
  const bar = el('div', 'sp-bar');
  const playBtn = button('▶', 'Play / pause (Space)');
  const debugBtn = button('D', 'Debug overlay (D)');
  const time = el('div', 'sp-time');
  const tl = el('canvas', 'sp-tl');
  const helpBtn = button('?', 'Help (?)');
  const left = el('div');
  left.style.cssText = 'display:flex;gap:6px';
  left.append(playBtn, debugBtn, helpBtn);
  bar.append(left, time, tl, el('div'));
  root.append(stage, bar);
  document.body.appendChild(root);

  const p = f.params;
  const fps = f.fps, dur = f.duration;
  let t = clampT(+p.get('t') || 0);
  let playing = false, debug = p.get('debug') === '1', loop = null, muted = false;
  let lastDrawn = -1, dirty = true, lastError = '';
  f.invalidate = () => (dirty = true); // a frame-sequence image arrived: draw the frame again
  const lat = +p.get('lat') || 0;

  // ── Audio clock (Web Audio: sample-accurate, unlike <audio>.currentTime) ──
  // audio/mix.wav (from `studio mix`) is already in film time; the song itself is in song time,
  // so it plays from t − offset. ?audio=song skips a mix that is out of date.
  let ac = null, buffer = null, src = null, gain = null, startedAt = 0, startOffset = 0, wallStart = 0, shift = 0, audioName = '';
  const audioUrl = (async () => {
    const cands = [p.get('audio') !== 'song' && ['audio/mix.wav', 0, 'mix'], f.studio.audio && [f.studio.audio, f.offset || 0, 'song']].filter(Boolean);
    for (const [file, sh, name] of cands) {
      try {
        const r = await fetch(f.resolve(file), { method: 'HEAD', cache: 'no-store' });
        if (r.ok) {
          shift = sh;
          audioName = name;
          return f.resolve(file);
        }
      } catch {}
    }
    return null;
  })();
  let audioState = 'none';
  audioUrl.then(async url => {
    if (!url) return;
    audioState = 'loading';
    dirty = true;
    try {
      const data = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
      ac = new AudioContext({ latencyHint: 'interactive' });
      buffer = await ac.decodeAudioData(data);
      gain = ac.createGain();
      gain.connect(ac.destination);
      audioState = 'ready';
    } catch (e) {
      audioState = 'error';
      console.warn('[studio] audio failed to load:', e);
    }
    dirty = true;
  });

  function now() {
    if (!playing) return t;
    if (src && ac) return startOffset + (ac.currentTime - startedAt) - lat - (ac.outputLatency || ac.baseLatency || 0);
    return startOffset + (performance.now() - wallStart) / 1000;
  }
  function play() {
    if (playing) return;
    if (t >= dur - 1 / fps) t = loop ? loop.start : 0;
    playing = true;
    startOffset = t;
    wallStart = performance.now();
    if (ac && buffer) {
      ac.resume();
      src = ac.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      startedAt = ac.currentTime;
      const pos = t - shift; // position in the file
      if (pos < 0) src.start(startedAt - pos, 0);
      else if (pos < buffer.duration) src.start(0, pos);
    }
    playBtn.textContent = '❚❚';
  }
  function pause() {
    if (!playing) return;
    t = clampT(now());
    playing = false;
    if (src) {
      try { src.stop(); } catch {}
      src.disconnect();
      src = null;
    }
    playBtn.textContent = '▶';
    dirty = true;
  }
  function seek(nt) {
    const was = playing;
    if (was) pause();
    t = clampT(nt);
    dirty = true;
    if (was) play();
  }
  function clampT(x) {
    return Math.min(Math.max(0, x), Math.max(0, dur - 1 / fps));
  }
  const snapFrame = x => Math.round(x * fps) / fps;

  // ── Input ──
  playBtn.onclick = () => (playing ? pause() : play());
  debugBtn.onclick = () => toggleDebug();
  helpBtn.onclick = () => (help.style.display = help.style.display === 'block' ? 'none' : 'block');
  function toggleDebug() {
    debug = !debug;
    debugBtn.classList.toggle('on', debug);
    dirty = true;
  }
  debugBtn.classList.toggle('on', debug);
  addEventListener('keydown', e => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key;
    const cur = playing ? now() : t;
    if (k === ' ') (playing ? pause() : play());
    else if (k === 'ArrowRight') seek(cur + (e.shiftKey ? 5 : 1));
    else if (k === 'ArrowLeft') seek(cur - (e.shiftKey ? 5 : 1));
    else if (k === '.') { pause(); seek(snapFrame(cur) + 1 / fps); }
    else if (k === ',') { pause(); seek(snapFrame(cur) - 1 / fps); }
    else if (k === ']') seek(f.song.nextDownbeat(cur + 1e-3));
    else if (k === '[') seek(f.song.prevDownbeat(cur - 0.05));
    else if (k === 'd' || k === 'D') toggleDebug();
    else if (k === 'Home') seek(0);
    else if (k === 'End') seek(dur);
    else if (k === 'm' || k === 'M') {
      muted = !muted;
      if (gain) gain.gain.value = muted ? 0 : 1;
      flash(muted ? 'muted' : 'sound on');
    } else if (k === 'l' || k === 'L') {
      const active = f.order.filter(s => cur >= s.start && cur < s.end).pop();
      loop = loop ? null : active ? { start: active.start, end: active.end, id: active.id } : null;
      flash(loop ? `loop ${loop.id}` : 'loop off');
    } else if (k === '?') help.style.display = help.style.display === 'block' ? 'none' : 'block';
    else return;
    e.preventDefault();
  });
  let dragging = false;
  const tlSeek = e => {
    const r = tl.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * dur);
  };
  tl.addEventListener('pointerdown', e => {
    dragging = true;
    tl.setPointerCapture(e.pointerId);
    tlSeek(e);
  });
  tl.addEventListener('pointermove', e => dragging && tlSeek(e));
  tl.addEventListener('pointerup', () => (dragging = false));

  // ── Layout ──
  function layout() {
    const r = stage.getBoundingClientRect();
    const k = Math.min((r.width - 32) / f.width, (r.height - 32) / f.height);
    const w = Math.max(1, Math.floor(f.width * k)), h = Math.max(1, Math.floor(f.height * k));
    f.canvas.style.width = `${w}px`;
    f.canvas.style.height = `${h}px`;
    const dpr = devicePixelRatio || 1;
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    overlay.style.left = `${(r.width - w) / 2}px`;
    overlay.style.top = `${(r.height - h) / 2}px`;
    const tr = tl.getBoundingClientRect();
    tl.width = Math.round(tr.width * dpr);
    tl.height = Math.round(tr.height * dpr);
    dirty = true;
  }
  addEventListener('resize', layout);
  layout();

  // ── Live reload from `studio serve` ──
  if (typeof EventSource !== 'undefined') {
    try {
      const es = new EventSource('/__studio/events');
      es.onmessage = ev => {
        if (ev.data !== 'reload') return;
        const u = new URL(location.href);
        u.searchParams.set('t', (playing ? now() : t).toFixed(3));
        if (debug) u.searchParams.set('debug', '1');
        location.replace(u.href);
      };
      es.onerror = () => es.close();
    } catch {}
  }

  // ── Draw loop ──
  function frame() {
    requestAnimationFrame(frame);
    if (playing) {
      t = now();
      if (loop && t >= loop.end) {
        pause();
        seek(loop.start);
        play();
      } else if (t >= dur) {
        pause();
        t = clampT(dur);
      }
    }
    const ft = playing ? t : snapFrame(t);
    if (!dirty && ft === lastDrawn) return;
    dirty = false;
    lastDrawn = ft;
    let active = [];
    try {
      active = f.render(ft);
      if (lastError) {
        lastError = '';
        err.style.display = 'none';
      }
    } catch (e) {
      const msg = e && e.stack ? e.stack : String(e);
      if (msg !== lastError) {
        lastError = msg;
        err.textContent = msg;
        err.style.display = 'block';
        console.error(e);
      }
      if (playing) pause();
    }
    drawOverlay(ft, active);
    drawTimeline(ft);
    const pos = f.song.position(ft);
    const sec = f.song.section(ft);
    time.textContent = `${fmt(ft)} / ${fmt(dur)}  f${Math.round(ft * fps)}  ${pos.bar}.${pos.beat}  ${sec ? sec.label : '·'}  ${active.map(s => s.id).join('+') || '—'}${audioState === 'loading' ? '  (audio…)' : audioState === 'none' ? '  (no audio)' : audioState === 'error' ? '  (audio failed)' : `  ♪ ${audioName}`}`;
  }
  requestAnimationFrame(frame);

  function drawOverlay(ft, active) {
    const g = overlay.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, overlay.width, overlay.height);
    if (!debug) return;
    const W = overlay.width, H = overlay.height, k = W / f.width;
    g.lineWidth = Math.max(1, devicePixelRatio || 1);
    // Safe areas: 90% title safe; platform UI zones.
    g.strokeStyle = 'rgba(255,211,77,0.55)';
    g.setLineDash([6, 6]);
    g.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,90,90,0.12)';
    if (f.height > f.width) {
      g.fillRect(0, H * 0.8, W, H * 0.2);
      g.fillRect(W * 0.86, H * 0.45, W * 0.14, H * 0.35);
    } else g.fillRect(W * 0.25, H - 80 * k, W * 0.5, 80 * k);
    // Thirds.
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    for (const q of [1 / 3, 2 / 3]) {
      g.beginPath();
      g.moveTo(W * q, 0);
      g.lineTo(W * q, H);
      g.moveTo(0, H * q);
      g.lineTo(W, H * q);
      g.stroke();
    }
    const pos = f.song.position(ft), sec = f.song.section(ft), line = f.lyrics.lineAt(ft);
    const rows = [
      `${fmt(ft)}   frame ${Math.round(ft * fps)}   ${pos.bar}.${pos.beat}.${pos.sixteenth}   ${f.song.bpm.toFixed(1)} BPM`,
      `section ${sec ? `${sec.label} ${fmt(sec.start)}–${fmt(sec.end)}` : '—'}   shots ${active.map(s => s.id).join(' + ') || '—'}`,
      line ? `line ${line.i + 1}: ${line.text || '(timing only)'}  ${fmt(line.start)}–${fmt(line.end)}` : 'line —',
    ];
    const dpr = devicePixelRatio || 1;
    g.font = `${12 * dpr}px ui-monospace,Consolas,monospace`;
    const pad = 8 * dpr, lh = 16 * dpr;
    const w = Math.max(...rows.map(r => g.measureText(r).width)) + pad * 2;
    g.fillStyle = 'rgba(0,0,0,0.66)';
    g.fillRect(pad, pad, w, lh * rows.length + pad);
    g.fillStyle = '#ffd34d';
    rows.forEach((r, i) => g.fillText(r, pad * 2, pad + lh * (i + 0.85)));
    // Beat flash in the corner: helps check sync by eye.
    const hb = f.song.hit('beat', ft, 0.08), hd = f.song.hit('downbeat', ft, 0.12);
    g.fillStyle = `rgba(255,211,77,${Math.max(hb * 0.6, hd)})`;
    g.beginPath();
    g.arc(W - 22 * dpr, 22 * dpr, (hd > hb ? 10 : 7) * dpr, 0, Math.PI * 2);
    g.fill();
  }

  function drawTimeline(ft) {
    const g = tl.getContext('2d');
    const W = tl.width, H = tl.height, dpr = devicePixelRatio || 1;
    const x = s => (s / dur) * W;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1b1b20';
    g.fillRect(0, 0, W, H);
    const hues = {};
    let hi = 0;
    for (const s of f.song.sections) {
      const key = String(s.label || '').replace(/[′']/g, '');
      if (!(key in hues)) hues[key] = (hi++ * 67) % 360;
      g.fillStyle = `hsl(${hues[key]} 45% 30% / ${0.35 + 0.5 * (s.energy ?? 0.5)})`;
      g.fillRect(x(s.start), 0, Math.max(1, x(s.end) - x(s.start)), H * 0.38);
      g.fillStyle = '#ddd';
      g.font = `${10 * dpr}px system-ui,sans-serif`;
      if (x(s.end) - x(s.start) > 18 * dpr) g.fillText(s.label, x(s.start) + 3 * dpr, 11 * dpr);
    }
    g.fillStyle = 'rgba(120,180,255,0.55)';
    for (const l of f.lyrics.lines) g.fillRect(x(l.start), H * 0.42, Math.max(1, x(l.end) - x(l.start)), H * 0.14);
    for (const s of f.shots) {
      g.fillStyle = s.cut === false ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.75)';
      g.fillRect(x(s.start), H * 0.6, Math.max(1, dpr), H * 0.4);
    }
    if (loop) {
      g.fillStyle = 'rgba(255,211,77,0.18)';
      g.fillRect(x(loop.start), 0, x(loop.end) - x(loop.start), H);
    }
    g.fillStyle = '#ffd34d';
    g.fillRect(x(ft) - dpr, 0, 2 * dpr, H);
  }

  function flash(msg) {
    toast.textContent = msg;
    toast.style.opacity = 1;
    clearTimeout(flash.h);
    flash.h = setTimeout(() => (toast.style.opacity = 0), 900);
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function button(text, title) {
  const b = el('button', 'sp-btn');
  b.textContent = text;
  b.title = title;
  return b;
}
