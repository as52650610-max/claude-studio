#!/usr/bin/env node
// claude-studio command line. MIT License. Zero npm dependencies.
//
//   node tools/studio.mjs <command> [project] [options]      (or: npm run studio -- <command> …)
//
// Run without arguments for the list of commands. Python tools live in tools/py and need
// Python ≥ 3.10 with numpy, scipy and Pillow; video and audio go through ffmpeg.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findBrowser, isSoftwareGL } from './lib/cdp.mjs';
import { startServer } from './lib/server.mjs';
import { ENGINE_DIR, ffmpegBin, probe, renderSheet, renderStills, renderVideo, verify } from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PY = path.join(HERE, 'py');

const HELP = `claude-studio — music videos and animations with Claude

  setup
    doctor                         check Node, browser, GPU, ffmpeg, Python and fonts
    new <dir> [--template T]       new project from templates/ (lyric-mv, short, blank)
    music <out.wav> [--plan P | --plan-file F.json] [--seed N] [--truth F] [--stems DIR]
                                   procedural practice music with ground truth (plans: pop, short, drive, full, chill)
    engine <dir> [--update]        compare the project's engine copy with this studio's; --update copies it in

  time lock (G1)
    analyze <dir> [audio] [--stems DIR] [--bpm N] [--beats-per-bar N] [--first-downbeat S]
            [--sections 1,5,13]
                                   beats, bars, sections, stops, impacts, events → data/songmap.json
                                   and qa/click_preview.wav (listen to it before you go on);
                                   --sections: the bars where sections start, as heard (used as given)
    excerpt <dir> [--section chorus] [--nth N|last] [--bar N] [--bars N] [--lead-bars N] [--max 30]
                                   a short on whole bars: sets "offset", "duration", the fade-out
    tap <dir> [--text FILE]        lyric tapper in the browser: hold Space while each line is sung → LRC
    lyrics <import|check|snap|listen|strip|fill|export|check-repo> <dir> …
    fonts <dir>                    subset the project's fonts to the characters it draws

  look
    serve <dir> [--port N]         live preview: reloads on save; Space, ←/→, , . frames, [ ] bars, D, L, ?
    stills <dir> --at 1.5,8,12.25 [--label]
    sheet <dir> [--every 1.5]      contact sheets labelled with time, bar.beat, section, lyric
    plan <dir>                     coverage, overlaps, shot lengths, cuts on beats, storyboard (G3)
    lint <dir>                     hard-coded times, randomness, clocks, network URLs in the film
    verify <dir>                   the same frame twice, in any order, in a fresh browser = same pixels

  other tools (Blender, generated video, filmed footage)
    frames <dir> <clip> [--name N] [--fps F] [--from S] [--to S] [--size fit|cover|source|WxH]
           [--crop W:H:X:Y] [--key auto|green|blue|#rrggbb] [--similarity S] [--blend B] [--despill M]
                                   a video or numbered images → frames/N for api.loadFrames(); --key removes
                                   a green or blue screen (ffmpeg chromakey) and measures the matte
    timing <dir> [--fps N] [--format json,csv,md] [--out FILE] [--no-text] [--no-shots]
                                   sections, bars, beats, lyric lines, cues and shots in film seconds and
                                   frames → out/timing.*, for a tool that has to land on the same frames

  sound
    sfx <list|make|pack|info> …    sound effects with landmarks (onset / peak / end)
    mix <dir> [--video FILE | --no-page]
                                   the film's sfx cues + data/sfx.json + the song → audio/mix.wav, −14 LUFS,
                                   report; --video times a film made in another tool by its video

  finish
    render <dir> [--preview] [--from S] [--to S] [--codec x264|nvenc|prores] [--crf N]
                 [--blur N] [--shutter 0.5] [--workers N] [--audio FILE] [--out FILE] [--label]
    qa <dir> [--video FILE] [--check-lyrics]
    deliver <dir>                  fonts → lyrics check → mix → render → qa → subtitles → poster → DELIVERY.md

Every command that takes <dir> reads <dir>/studio.json. Docs: docs/README.md (中文), docs/en/PLAYBOOK.md.`;

// ─── Small helpers ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opt[k] = argv[++i];
      else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

const die = msg => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function project(dir) {
  if (!dir) die('which project? e.g. node tools/studio.mjs <command> projects/my-mv');
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) die(`no such folder: ${root}`);
  const cfg = readJSON(path.join(root, 'studio.json'), null);
  if (!cfg) die(`${root} has no studio.json — make a project with: node tools/studio.mjs new ${dir}`);
  const name = cfg.name || path.basename(root);
  return { root, cfg, name, rel: p => path.join(root, p) };
}

let PYTHON = null;
function python() {
  if (PYTHON) return PYTHON;
  const tries = process.env.STUDIO_PYTHON ? [[process.env.STUDIO_PYTHON]] : process.platform === 'win32' ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
  for (const [bin, ...pre] of tries) {
    const r = spawnSync(bin, [...pre, '-c', 'import sys; print(sys.version_info >= (3, 10))'], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.trim() === 'True') return (PYTHON = [bin, ...pre]);
  }
  die('Python 3.10+ not found. Install it (with numpy, scipy, pillow) or set STUDIO_PYTHON.');
}

function py(script, args, { quiet = false } = {}) {
  const [bin, ...pre] = python();
  return new Promise(resolve => {
    const p = spawn(bin, [...pre, '-X', 'utf8', path.join(PY, script), ...args], { stdio: quiet ? 'ignore' : 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    p.on('close', code => resolve(code ?? 1));
  });
}

async function pyOrDie(script, args) {
  const code = await py(script, args);
  if (code !== 0) process.exit(code);
}

const fmtTime = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const page = opt => opt.page || 'film.html';
const show = (root, p) => path.relative(root, p).replace(/\\/g, '/');
const localStamp = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const log = m => console.log(m);

function copyDir(src, dst, { skip = () => false } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const d of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(d.name)) continue;
    const s = path.join(src, d.name), t = path.join(dst, d.name);
    if (d.isDirectory()) copyDir(s, t, { skip });
    else fs.copyFileSync(s, t);
  }
}

const ENGINE_VERSION = (fs.readFileSync(path.join(ENGINE_DIR, 'studio.js'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1] || '?';

/** An OFL-licensed Traditional Chinese font on this machine: { file, family, weight, index }. */
function findCJKFont() {
  const home = os.homedir();
  const dirs =
    process.platform === 'win32' ? ['C:/Windows/Fonts', path.join(process.env.LOCALAPPDATA || home, 'Microsoft/Windows/Fonts')]
    : process.platform === 'darwin' ? ['/Library/Fonts', path.join(home, 'Library/Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.local/share/fonts'), path.join(home, '.fonts')];
  // Variable Noto Sans TC first (every weight), then static faces and the CJK collections.
  const wanted = [
    [/^NotoSansTC(-VF|\[wght\]|-VariableFont_wght)\.(ttf|otf)$/i, '100 900'],
    [/^NotoSansCJKtc-VF\.(otf|ttf)$/i, '100 900'],
    [/^NotoSansCJK-VF\.(otf\.)?ttc$/i, '100 900'],
    [/^NotoSansTC-Regular\.(ttf|otf)$/i, '400'],
    [/^NotoSansCJK(tc)?-Regular\.(ttc|otf)$/i, '400'],
  ];
  const files = [];
  const walk = (d, depth) => {
    let list = [];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (e.isDirectory() && depth < 4) walk(path.join(d, e.name), depth + 1);
      else if (e.isFile()) files.push(path.join(d, e.name));
    }
  };
  for (const d of dirs) walk(d, 0);
  for (const [rx, weight] of wanted) {
    const file = files.find(f => rx.test(path.basename(f)));
    if (!file) continue;
    if (!/\.ttc$/i.test(file)) return { file, family: 'Noto Sans TC', weight, index: 0 };
    // A collection: pick the Traditional Chinese face.
    const [bin, ...pre] = python();
    const code = ['import sys', 'sys.path.insert(0, sys.argv[1])', 'import fonts', 'for i in range(20):', '    try:', '        print(i, fonts.Font(sys.argv[2], i).family)', '    except Exception:', '        break'].join('\n');
    const r = spawnSync(bin, [...pre, '-X', 'utf8', '-c', code, PY, file], { encoding: 'utf8', windowsHide: true });
    const face = (r.stdout || '').split('\n').map(l => l.match(/^(\d+) (.*)$/)).find(m => m && /CJK TC|TC$/.test(m[2].trim()) && !/Mono/.test(m[2]));
    if (face) return { file, family: face[2].trim(), weight, index: +face[1] };
  }
  return null;
}

/** Blender, for 3D shots rendered outside the engine: STUDIO_BLENDER, the usual install folders, PATH. */
function findBlender() {
  const cands = process.env.STUDIO_BLENDER ? [process.env.STUDIO_BLENDER] : [];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const root = path.join(base, 'Blender Foundation');
      try {
        for (const d of fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) cands.push(path.join(root, d, 'blender.exe'));
      } catch {}
    }
  } else if (process.platform === 'darwin') cands.push('/Applications/Blender.app/Contents/MacOS/Blender');
  cands.push('blender');
  for (const bin of cands) {
    if (bin !== 'blender' && !fs.existsSync(bin)) continue;
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    const m = (r.stdout || '').match(/^Blender \d+\.\d+[^\r\n]*/m);
    if (r.status === 0 && m) return { bin, version: m[0].trim() };
  }
  return null;
}

/** A running ComfyUI (portable: port 8188, desktop app: 8000), asked for its version and GPU. Never started. */
async function findComfy() {
  const env = process.env.STUDIO_COMFYUI || '';
  const urls = /^https?:\/\//.test(env) ? [env] : ['http://127.0.0.1:8188', 'http://127.0.0.1:8000'];
  for (const url of urls) {
    try {
      const res = await fetch(new URL('/system_stats', url), { signal: AbortSignal.timeout(1500) });
      if (!res.ok) continue;
      const j = await res.json();
      const dev = j.devices?.[0];
      const gpu = dev ? `${String(dev.name || '').replace(/^cuda:\d+\s*/, '').split(' : ')[0]}${dev.vram_total ? ` ${Math.round(dev.vram_total / 2 ** 30)} GB` : ''}` : '';
      return { url, detail: [j.system?.comfyui_version && `ComfyUI ${j.system.comfyui_version}`, gpu].filter(Boolean).join(' · ') };
    } catch {}
  }
  return env && !/^https?:\/\//.test(env) && fs.existsSync(env) ? { installed: env } : null;
}

// ─── Commands ──────────────────────────────────────────────────────────────────────────────

const commands = {
  async doctor() {
    const rows = [];
    const ok = (name, good, detail, fix = '') => rows.push({ name, good, detail, fix });
    const nodeMajor = +process.versions.node.split('.')[0];
    ok('Node.js', nodeMajor >= 22, `v${process.versions.node}`, 'install Node 22 or newer');
    const browser = findBrowser();
    ok('Chrome / Edge', !!browser, browser || 'not found', 'install Chrome or Edge, or set STUDIO_BROWSER');
    const ff = spawnSync(ffmpegBin(), ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true });
    const ffv = spawnSync(ffmpegBin(), ['-version'], { encoding: 'utf8', windowsHide: true });
    const version = (ffv.stdout || '').split('\n')[0].replace('ffmpeg version ', '').split(' ')[0];
    ok('ffmpeg', ff.status === 0, ff.status === 0 ? version : 'not found', 'install ffmpeg (full build) or set STUDIO_FFMPEG');
    if (ff.status === 0) {
      const enc = ff.stdout;
      ok('  libx264', /libx264/.test(enc), /libx264/.test(enc) ? 'H.264 (default)' : 'missing', 'use a full ffmpeg build');
      ok('  h264_nvenc', /h264_nvenc/.test(enc), /h264_nvenc/.test(enc) ? 'NVIDIA encoder (--codec nvenc)' : 'not available (optional)', '');
      ok('  prores_ks', /prores_ks/.test(enc), /prores_ks/.test(enc) ? 'ProRes 422 HQ (--codec prores)' : 'not available (optional)', '');
    }
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-doctor-'));
    try {
      const [bin, ...pre] = python();
      const r = spawnSync(bin, [...pre, '-c', 'import sys, numpy, scipy, PIL; print(sys.version.split()[0], numpy.__version__, scipy.__version__, PIL.__version__)'], { encoding: 'utf8', windowsHide: true });
      const [pv, nv, sv, pil] = (r.stdout || '').trim().split(' ');
      ok('Python', r.status === 0, r.status === 0 ? `${pv} · numpy ${nv} · scipy ${sv} · Pillow ${pil}` : (r.stderr || '').trim().split('\n').pop(), 'pip install numpy scipy pillow');
      for (const [mod, what] of [['demucs', 'stem separation (optional; or use UVR and --stems)'], ['faster_whisper', 'lyric auto-alignment (optional)']]) {
        const m = spawnSync(bin, [...pre, '-c', `import ${mod}`], { encoding: 'utf8', windowsHide: true });
        ok(`  ${mod}`, m.status === 0, m.status === 0 ? 'installed' : `not installed — ${what}`, '');
      }
    } catch {}
    if (browser) {
      fs.writeFileSync(path.join(probeDir, 'studio.json'), JSON.stringify({ width: 320, height: 180, fps: 30, duration: 1 }));
      fs.writeFileSync(path.join(probeDir, 'film.html'), `<!doctype html><meta charset="utf-8"><script type="module">import { film } from './engine/studio.js'; film({ shots: [{ id: 'S01', start: 0, end: 1, draw(ctx, s) { ctx.fillStyle = '#3366ff'; ctx.fillRect(0, 0, s.width * s.u, s.height); } }] });</script>`);
      try {
        const info = await probe({ root: probeDir });
        ok('GPU in the browser', !isSoftwareGL(info.gpu), info.gpu, 'software rendering is slow: check drivers, avoid remote desktop/VMs, or try --headful');
        ok('render contract', info.width === 320 && info.packer === 'yuv420', `${info.engine} · ${info.width}x${info.height} · packer ${info.packer || 'none'}`, '');
        if (info.foreign?.length) ok('  page filter', false, `scripts from ${[...new Set(info.foreign)].join(', ')} are inserted into local pages (frames are unaffected)`, 'exclude 127.0.0.1 or the browser from the ad blocker / web shield');
      } catch (e) {
        ok('browser launch', false, e.message.split('\n')[0], 'see the error; set STUDIO_BROWSER to another Chrome/Edge');
      }
    }
    fs.rmSync(probeDir, { recursive: true, force: true });
    // Tools for pictures the engine does not draw: optional, detected, never required (docs/10-render.md).
    const blender = findBlender();
    ok('  Blender', !!blender, blender ? `${blender.version} · ${blender.bin}` : 'not found (optional: 3D shots; set STUDIO_BLENDER to blender.exe)', '');
    const comfy = await findComfy();
    ok('  ComfyUI', !!comfy?.url, comfy?.url ? `running at ${comfy.url}${comfy.detail ? ` · ${comfy.detail}` : ''}` : comfy?.installed ? `at ${comfy.installed}, not running (start it yourself when a shot needs it)` : 'no server at 127.0.0.1:8188 or :8000 (optional: generated pictures; start it yourself, or set STUDIO_COMFYUI to its address)', '');
    const npx = spawnSync('npx --version', { encoding: 'utf8', windowsHide: true, shell: true, timeout: 30_000 });
    ok('  npx', npx.status === 0, npx.status === 0 ? `${npx.stdout.trim()} (Remotion and other npm tools run in their own folder, after you agree to install)` : 'not found (optional: Remotion)', '');
    const cjk = findCJKFont();
    ok('CJK font (OFL)', !!cjk, cjk ? `${cjk.family} · ${cjk.file}` : 'none found', 'download Noto Sans TC (SIL OFL) from fonts.google.com; studio new subsets it into each project');
    const git = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
    ok('git', git.status === 0, git.status === 0 ? git.stdout.trim() : 'not found (optional, for baselines)', '');
    console.log('');
    for (const r of rows) console.log(`  ${r.good ? '✓' : r.name.startsWith('  ') ? '·' : '✗'} ${r.name.padEnd(22)} ${r.detail}${!r.good && r.fix ? `\n      → ${r.fix}` : ''}`);
    const bad = rows.filter(r => !r.good && !r.name.startsWith('  ') && !['git'].includes(r.name));
    console.log(bad.length ? `\n  ${bad.length} problem(s) to fix first.\n` : '\n  Ready.\n');
    process.exitCode = bad.length ? 1 : 0;
  },

  async new({ pos, opt }) {
    const dir = pos[0];
    if (!dir) die('usage: studio new projects/<name> [--template lyric-mv|short|blank] [--title "歌名"] [--artist "…"]');
    const root = path.resolve(dir);
    if (fs.existsSync(root) && fs.readdirSync(root).length) die(`${root} exists and is not empty`);
    const tpl = opt.template || 'lyric-mv';
    const src = path.join(ROOT, 'templates', tpl);
    const kinds = fs.readdirSync(path.join(ROOT, 'templates')).filter(n => n !== 'common');
    if (tpl === 'common' || !fs.existsSync(src)) die(`no template "${tpl}" (have: ${kinds.join(', ')})`);
    copyDir(path.join(ROOT, 'templates', 'common'), root);  // the documents every template shares
    copyDir(src, root);
    copyDir(ENGINE_DIR, path.join(root, 'engine'), { skip: n => n === 'README.md' });
    const cfgPath = path.join(root, 'studio.json');
    const cfg = readJSON(cfgPath, {});
    cfg.name = path.basename(root);
    for (const k of ['width', 'height', 'fps']) if (opt[k]) cfg[k] = +opt[k];
    for (const k of ['title', 'artist']) if (typeof opt[k] === 'string') cfg[k] = opt[k];
    for (const d of ['audio', 'data', 'qa', 'out', 'fonts']) fs.mkdirSync(path.join(root, d), { recursive: true });
    // Fonts: subset an OFL CJK font found on this machine, so the film draws the same everywhere.
    let fontNote = '';
    if ((cfg.fonts || []).length) {
      const found = findCJKFont();
      if (found) {
        Object.assign(cfg.fonts[0], { from: found.file.replace(/\\/g, '/'), weight: found.weight }, found.index ? { index: found.index } : {});
        fontNote = `font: ${found.family} from ${found.file}`;
      } else {
        delete cfg.fonts;
        cfg.lyricFont = false;
        fontNote = 'font: no OFL CJK font found — the film uses the system font for now.\n    Download Noto Sans TC (SIL OFL) from https://fonts.google.com/noto/specimen/Noto+Sans+TC, then add to studio.json\n    "fonts": [{ "family": "Noto Sans TC", "src": "fonts/NotoSansTC.subset.ttf", "from": "<the .ttf you downloaded>", "weight": "100 900" }],\n    set "lyricFont": "Noto Sans TC" and run: node tools/studio.mjs fonts ' + dir;
      }
    }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    if (cfg.fonts?.[0]?.from) await pyOrDie('fonts.py', ['project', root]);
    log(`\n  new project: ${dir} (template ${tpl}, engine ${ENGINE_VERSION} copied in)`);
    if (fontNote) log(`  ${fontNote}`);
    log('\n  next:');
    log(`    1. put your song in ${dir}/audio/ and check "audio" in studio.json`);
    log(`    2. node tools/studio.mjs analyze ${dir}          (then listen to qa/click_preview.wav)`);
    log(`    3. node tools/studio.mjs lyrics import ${dir} song.lrc`);
    log(`    4. node tools/studio.mjs serve ${dir}            (preview)`);
    log(`    5. fill in BRIEF.md, then ask Claude: "用 studio skill 做這支 MV"\n`);
  },

  async engine({ pos, opt }) {
    // Each project keeps its own copy of the engine, so an old film renders the same next year.
    const P = project(pos[0]);
    const dir = P.rel('engine');
    const version = f => (fs.existsSync(f) ? (fs.readFileSync(f, 'utf8').match(/VERSION = '([^']+)'/) || [])[1] || '?' : null);
    const files = fs.readdirSync(ENGINE_DIR).filter(n => n.endsWith('.js'));
    const differs = files.filter(n => !fs.existsSync(path.join(dir, n)) || !fs.readFileSync(path.join(ENGINE_DIR, n)).equals(fs.readFileSync(path.join(dir, n))));
    log(`\n  project engine ${version(path.join(dir, 'studio.js')) || 'none'} · studio engine ${ENGINE_VERSION} · ${differs.length ? `different: ${differs.join(', ')}` : 'identical'}`);
    if (!differs.length) return log('');
    if (!opt.update) return log("  studio engine <dir> --update copies the studio's engine in (shots stay as they are).\n  Frames may change: take stills before and after, then run studio verify.\n");
    fs.mkdirSync(dir, { recursive: true });
    for (const n of differs) fs.copyFileSync(path.join(ENGINE_DIR, n), path.join(dir, n));
    log(`  updated ${differs.join(', ')}. Next: studio stills (compare), studio verify, and a note in PROGRESS.md.\n`);
  },

  async music({ pos, raw }) {
    if (!pos[0]) die('usage: studio music out.wav [--plan pop|short|drive|full|chill | --plan-file plan.json] [--bpm N] [--key A] [--seed N] [--truth F] [--stems DIR]');
    await pyOrDie('music.py', raw);
  },

  async analyze({ pos, opt }) {
    const P = project(pos[0]);
    const audio = pos[1] || (P.cfg.audio && P.rel(P.cfg.audio));
    if (!audio || !fs.existsSync(audio)) die('no song: set "audio" in studio.json (e.g. "audio/song.wav") or pass it: studio analyze <dir> song.wav');
    const args = [audio, '--out', P.rel(P.cfg.songmap || 'data/songmap.json'), '--click', P.rel('qa/click_preview.wav')];
    for (const k of ['bpm', 'beats-per-bar', 'first-downbeat', 'sections']) if (opt[k] !== undefined) args.push(`--${k}`, String(opt[k]));
    const stems = opt.stems || (fs.existsSync(P.rel('audio/stems')) ? P.rel('audio/stems') : null);
    if (stems) args.push('--stems', path.resolve(stems));
    fs.mkdirSync(P.rel('qa'), { recursive: true });
    await pyOrDie('analyze_song.py', args);
    log('\n  G1 time lock: listen to qa/click_preview.wav from start to end (headphones). High click = bar start, bell = section start.');
    log('  Wrong tempo/bars? Re-run with --bpm, --beats-per-bar or --first-downbeat. Then fix cues in data/cues.json.');
    log('  A bell in the wrong bar? Re-run with the bars where sections start, e.g. --sections 1,5,13,17 (bar 1 = the first high click).\n');
  },

  async excerpt({ pos, opt }) {
    // Cut a short from the song on whole bars: sets "offset" and "duration" in studio.json.
    const P = project(pos[0]);
    const sm = readJSON(P.rel(P.cfg.songmap || 'data/songmap.json'), null);
    if (!sm || !(sm.downbeats || []).length) die('no songmap with downbeats: run studio analyze first');
    const downs = sm.downbeats;
    const barLen = (downs[downs.length - 1] - downs[0]) / Math.max(1, downs.length - 1);
    const max = +(opt.max || 30);
    const near = t => downs.reduce((b, d, i) => (Math.abs(d - t) < Math.abs(downs[b] - t) ? i : b), 0);
    let first, bars, what;
    if (opt.bar) {
      first = Math.max(0, Math.min(downs.length - 1, Math.round(+opt.bar) - 1));
      what = `bar ${first + 1}`;
    } else {
      const want = typeof opt.section === 'string' ? opt.section : 'chorus';
      const secs = (sm.sections || []).filter(s => [s.kind, s.name, s.label].includes(want));
      if (!secs.length) die(`no "${want}" section in the songmap (have: ${[...new Set((sm.sections || []).map(s => s.kind || s.label))].join(', ')}); or pass --bar N`);
      // Default: the strongest of them (on a tie, the later one); --nth 2 or --nth last to choose.
      const sec = opt.nth === undefined ? secs.reduce((a, b) => ((b.energy ?? 0) >= (a.energy ?? 0) ? b : a)) : opt.nth === 'last' ? secs[secs.length - 1] : secs[+opt.nth - 1];
      if (!sec) die(`there are ${secs.length} "${want}" sections; --nth 1…${secs.length} or last`);
      first = near(sec.start);
      bars = Math.max(1, near(sec.end) - first);
      what = `${sec.name || sec.kind} ${sec.label} at ${fmtTime(sec.start)}`;
    }
    const lead = Math.min(first, Math.max(0, Math.round(+opt['lead-bars'] || 0))); // a run-up into the section
    first -= lead;
    if (bars) bars += lead;
    const fit = Math.max(1, Math.floor((max + 0.05) / barLen));
    if (opt.bars) bars = +opt.bars;
    else if (!bars || bars > fit) bars = fit >= 4 ? fit - (fit % 4) : fit; // whole phrases when it has to be cut
    const t0 = downs[first];
    const songEnd = sm.duration || downs[downs.length - 1] + barLen;
    const t1 = Math.min(songEnd, downs[first + bars] ?? t0 + bars * barLen);
    P.cfg.offset = -+t0.toFixed(3);
    P.cfg.duration = +(t1 - t0).toFixed(3);
    P.cfg.mix = { ...(P.cfg.mix || {}), fadeIn: 0, fadeOut: t1 < songEnd - 0.5 ? P.cfg.mix?.fadeOut || 0.8 : 0 };
    fs.writeFileSync(P.rel('studio.json'), JSON.stringify(P.cfg, null, 2) + '\n');
    log(`\n  excerpt: ${what} → bars ${first + 1}–${first + bars} (${bars} bars, ${(t1 - t0).toFixed(2)} s)`);
    log(`  studio.json: "offset": ${P.cfg.offset}, "duration": ${P.cfg.duration}, "mix": fadeOut ${P.cfg.mix.fadeOut}`);
    if (t1 - t0 > max + 0.05) log(`  ! longer than --max ${max} s`);
    log('  next: studio stills / serve to check the first frame, then studio mix\n');
  },

  async tap({ pos, opt }) {
    // The lyric tapper with this project's song, lyrics (or text) and songmap loaded.
    const P = project(pos[0]);
    const rel = p => (p && fs.existsSync(P.rel(p)) ? p.replace(/\\/g, '/') : null);
    const audio = rel(P.cfg.audio);
    if (!audio) die('no song: set "audio" in studio.json (e.g. "audio/song.wav")');
    const lyrics = rel(P.cfg.lyrics || 'data/lyrics.json');
    const text = typeof opt.text === 'string' ? path.relative(P.root, path.resolve(opt.text)).replace(/\\/g, '/') : rel('data/lyrics.txt');
    if (text && text.startsWith('..')) die('--text must be a file inside the project (e.g. data/lyrics.txt)');
    const songmap = rel(P.cfg.songmap || 'data/songmap.json');
    const s = await startServer({ root: P.root, port: +opt.port || 0, routes: { '/__studio/tapper': path.join(HERE, 'lyric-tapper.html') } });
    const q = new URLSearchParams(Object.entries({ audio, lyrics: opt.text ? null : lyrics, text, songmap }).filter(([, v]) => v));
    log(`\n  lyric tapper: ${s.url}__studio/tapper?${q}`);
    log(`  song ${audio}${lyrics && !opt.text ? ` · lyrics ${lyrics}` : text ? ` · text ${text}` : ' · no lyrics yet: paste them in the page'}${songmap ? ` · songmap ${songmap}` : ''}`);
    log('  Open it in Chrome or Edge, calibrate once, hold Space while each line is sung, download the LRC, then:');
    log(`    node tools/studio.mjs lyrics import ${pos[0]} <downloaded>.tapped.lrc\n  (Ctrl+C to stop)\n`);
    await new Promise(() => {});
  },

  async lyrics({ pos, raw }) {
    if (!pos[0]) die('usage: studio lyrics <import|check|snap|listen|strip|fill|export|check-repo> <dir> …');
    process.exitCode = await py('lyrics.py', raw);
  },

  async fonts({ pos }) {
    const P = project(pos[0]);
    if (!(P.cfg.fonts || []).length) die('studio.json has no "fonts". Add e.g. {"family": "Noto Sans TC", "src": "fonts/NotoSansTC.subset.ttf", "from": "C:/Windows/Fonts/NotoSansTC-VF.ttf", "weight": "100 900"}');
    await pyOrDie('fonts.py', ['project', P.root]);
  },

  async sfx({ raw }) {
    process.exitCode = await py('sfx.py', raw.length ? raw : ['list']);
  },

  async frames({ pos, raw }) {
    if (raw.includes('--help') || raw.includes('-h')) return void (process.exitCode = await py('frames.py', ['--help']));
    if (pos.length < 2) die('usage: studio frames <dir> <video | image folder | render_%04d.png> [--key auto] [--name N] … (studio frames --help)');
    process.exitCode = await py('frames.py', raw);
  },

  async timing({ pos, opt }) {
    const P = project(pos[0]);
    const T = await buildTiming(P, opt);
    const want = opt.out ? [path.extname(String(opt.out)).slice(1).toLowerCase()] : String(opt.format || 'json,csv,md').split(',').map(s => s.trim().toLowerCase());
    const writers = { json: x => `${JSON.stringify(x, null, 1)}\n`, csv: timingCSV, md: timingMarkdown };
    for (const f of want) if (!writers[f]) die(`${opt.out ? `--out ${opt.out}` : `--format ${f}`}: the sheet is written as .json, .csv or .md`);
    fs.mkdirSync(P.rel('out'), { recursive: true });
    for (const f of want) {
      const file = opt.out ? path.resolve(String(opt.out)) : P.rel(`out/timing.${f}`);
      fs.writeFileSync(file, writers[f](T));
      log(`  ${show(P.root, file)}`);
    }
    log(`  ${T.sections.length} sections, ${T.bars.length} bars, ${T.beats.length} beats, ${T.lines.length} lyric lines, ${T.cues.length} cues${T.shots ? `, ${T.shots.length} shots` : ''} · ${T.fps} fps, ${fmtTime(T.duration)} = ${T.frames} frames (film time)`);
    for (const n of T.notes) log(`  note: ${n}`);
  },

  async serve({ pos, opt }) {
    const P = project(pos[0]);
    const s = await startServer({ root: P.root, engineDir: ENGINE_DIR, live: true, port: +opt.port || 0, quiet: false });
    log(`\n  preview: ${s.url}${page(opt)}\n  (reloads when files change; Ctrl+C to stop)\n`);
    log('  keys: Space play/pause · ←/→ ±1 s (Shift ±5) · , . one frame · [ ] one bar · D debug overlay · L loop the shot · M mute · ? help');
    await new Promise(() => {});
  },

  async stills({ pos, opt }) {
    const P = project(pos[0]);
    if (!opt.at) die('usage: studio stills <dir> --at 1.5,8,12.25 [--label] [--scale 0.5]');
    const times = String(opt.at).split(',').map(Number).filter(Number.isFinite);
    const r = await renderStills({ root: P.root, page: page(opt), times, outDir: P.rel('qa/stills'), prefix: 'still', label: !!opt.label, scale: opt.scale ? +opt.scale : undefined, log });
    for (const f of r.files) log(`  ${show(P.root, f)}`);
  },

  async sheet({ pos, opt }) {
    const P = project(pos[0]);
    const r = await renderSheet({ root: P.root, page: page(opt), every: +(opt.every || 1.5), from: opt.from ? +opt.from : undefined, to: opt.to ? +opt.to : undefined, cols: +(opt.cols || 6), rows: +(opt.rows || 5), outDir: P.rel('qa'), prefix: 'sheet', log });
    log(`  ${r.count} frames on ${r.sheets.length} sheet(s): ${r.sheets.map(s => show(P.root, s)).join(', ')}`);
  },

  async verify({ pos, opt }) {
    const P = project(pos[0]);
    const r = await verify({ root: P.root, page: page(opt), samples: +(opt.samples || 16), log });
    if (r.mismatches.length) {
      log(`  ✗ ${r.mismatches.length} of ${r.times.length} frames differ when rendered again: ${r.mismatches.slice(0, 8).map(fmtTime).join(', ')}`);
      log('    The film is not a pure function of time: look for Math.random without a seed, Date.now, state carried between frames, or async loading.');
      process.exitCode = 1;
    } else log(`  ✓ ${r.times.length} frames (cuts ±1 frame, start, end, samples) identical in a fresh browser, in shuffled order (${r.capture})`);
  },

  async plan({ pos, opt }) {
    const P = project(pos[0]);
    const info = await probe({ root: P.root, page: page(opt) });
    fs.mkdirSync(P.rel('qa'), { recursive: true });
    const { canvas, ...rest } = info;
    fs.writeFileSync(P.rel('qa/probe.json'), JSON.stringify(rest, null, 1));
    process.exitCode = await py('qa.py', [P.root, '--plan', P.rel('qa/probe.json')]);
  },

  async lint({ pos }) {
    const P = project(pos[0]);
    const rules = [
      [/\b(start|end)\s*:\s*(?!0\s*[,}])-?\d+(\.\d+)?\s*[,}]/, 'hard-coded shot time: derive it from the song (at.T(bar), at.lyric(…), at.cue(…))'],
      [/Math\.random\s*\(/, 'Math.random: fine at render (seeded per frame), but use rng(seed) for anything that must stay put between frames'],
      [/\b(Date\.now|new Date\s*\(|performance\.now)\s*\(?/, 'wall clock: a frame must depend only on t'],
      [/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, 'timers: the renderer seeks; animate from t instead'],
      [/https?:\/\/(?!127\.0\.0\.1|localhost)[^\s'"`)]+\.(woff2?|ttf|otf|png|jpe?g|webp|gif|mp3|wav|m4a|json|js)/i, 'network asset: put it in the project folder (renders must not depend on the internet)'],
      [/@keyframes|transition\s*:/, 'CSS animation: it runs on the wall clock and is disabled at render'],
    ];
    let n = 0;
    const walk = dir => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (/^(engine|out|qa|audio|node_modules|\.git|fonts)$/.test(d.name)) continue;
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else if (/\.(m?js|html|css)$/.test(d.name)) {
          fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            if (/lint-ignore/.test(line)) return;
            for (const [rx, why] of rules) {
              if (rx.test(line)) {
                n++;
                log(`  ${show(P.root, p)}:${i + 1}  ${why}\n      ${line.trim().slice(0, 110)}`);
              }
            }
          });
        }
      }
    };
    walk(P.root);
    log(n ? `\n  ${n} finding(s). Add "// lint-ignore" to a line you mean.` : '  clean');
    process.exitCode = n ? 1 : 0;
  },

  async mix({ pos, opt }) {
    const P = project(pos[0]);
    const cues = await collectCues(P, opt);
    log(`  ${cues.said}`);
    const args = [P.root, '--cues', P.rel('qa/sfx_cues.json')];
    if (opt.out) args.push('--out', opt.out);
    if (opt.target) args.push('--target', String(opt.target));
    await pyOrDie('mix.py', args);
  },

  async render({ pos, opt }) {
    const P = project(pos[0]);
    const preview = !!opt.preview;
    const out = opt.out ? path.resolve(opt.out) : P.rel(`out/${P.name}${preview ? '_preview' : ''}${opt.codec === 'prores' ? '.mov' : '.mp4'}`);
    let audio = opt.audio ? path.resolve(opt.audio) : null;
    if (!audio && !opt['no-audio']) {
      if (fs.existsSync(P.rel('audio/mix.wav'))) audio = P.rel('audio/mix.wav');
      else if (P.cfg.audio && fs.existsSync(P.rel(P.cfg.audio))) {
        audio = P.rel(P.cfg.audio);
        if (+P.cfg.offset) log(`  note: no audio/mix.wav, using the song; studio.json offset ${P.cfg.offset} s is not applied to it (run "studio mix")`);
      }
    }
    const result = await renderVideo({
      root: P.root,
      page: page(opt),
      out,
      from: opt.from !== undefined ? +opt.from : undefined,
      to: opt.to !== undefined ? +opt.to : undefined,
      scale: opt.scale ? +opt.scale : preview ? 0.5 : undefined,
      codec: opt.codec || P.cfg.render?.codec || 'x264',
      crf: opt.crf !== undefined ? +opt.crf : preview ? 23 : P.cfg.render?.crf,
      preset: opt.preset || (preview ? 'veryfast' : P.cfg.render?.preset),
      blur: +(opt.blur || P.cfg.render?.blur || 1),
      shutter: opt.shutter !== undefined ? +opt.shutter : P.cfg.render?.shutter,
      workers: opt.workers ? +opt.workers : undefined,
      audio,
      label: !!opt.label || (preview && opt.label !== 'false'),
      allowSoftware: !!opt['allow-software'],
      headful: !!opt.headful,
      log,
    });
    const manifest = out.replace(/\.(mp4|mov)$/i, '.json');
    fs.writeFileSync(manifest, JSON.stringify(result, null, 1));
    log(`  manifest: ${show(P.root, manifest)}`);
    return result;
  },

  async qa({ pos, opt }) {
    const P = project(pos[0]);
    const args = [P.root];
    if (opt.video) args.push('--video', path.resolve(opt.video));
    if (opt['check-lyrics']) args.push('--check-lyrics');
    process.exitCode = await py('qa.py', args);
  },

  async deliver({ pos, opt }) {
    const P = project(pos[0]);
    const step = t => log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
    if ((P.cfg.fonts || []).some(f => f.from)) {
      step('fonts');
      await pyOrDie('fonts.py', ['project', P.root]);
    }
    if (fs.existsSync(P.rel(P.cfg.lyrics || 'data/lyrics.json'))) {
      step('lyrics');
      const code = await py('lyrics.py', ['check', P.root]);
      if (code) die('lyrics check found errors: fix them before delivering');
    }
    step('mix');
    await collectCues(P, opt);
    await pyOrDie('mix.py', [P.root, '--cues', P.rel('qa/sfx_cues.json')]);
    step('render');
    const result = await commands.render({ pos, opt: { ...opt, preview: false, audio: P.rel('audio/mix.wav') } });
    step('qa');
    const qaCode = await py('qa.py', [P.root, '--video', path.join(P.root, result.out), '--check-lyrics']);
    const subs = [];
    if (fs.existsSync(P.rel(P.cfg.lyrics || 'data/lyrics.json'))) {
      step('subtitles');
      if ((await py('lyrics.py', ['export', P.root, '--format', 'srt'])) === 0) subs.push(`out/${P.name}.srt`);
    }
    step('poster');
    const still = await renderStills({ root: P.root, page: page(opt), times: [+(P.cfg.posterAt || 0)], outDir: P.rel('out'), prefix: `${P.name}_poster`, naming: 'index', log: () => {} });
    const posterFile = `out/${P.name}_poster.png`;
    fs.renameSync(still.files[0], P.rel(posterFile));
    console.log(`  frame at ${P.cfg.posterAt || 0} s → ${posterFile}${P.cfg.posterAt ? '' : ' (set "posterAt" in studio.json to pick a better frame)'}`);
    const report = readJSON(P.rel('qa/report.json'), {});
    const mixr = readJSON(P.rel('qa/mix_report.json'), {});
    const c = report.counts || {};
    const sha = f => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12) : 'missing');
    const ffv = (spawnSync(ffmpegBin(), ['-version'], { encoding: 'utf8', windowsHide: true }).stdout || '').split('\n')[0].replace('ffmpeg version ', '').split(' ')[0];
    const pyv = (spawnSync(python()[0], [...python().slice(1), '-c', 'import sys; print(sys.version.split()[0])'], { encoding: 'utf8', windowsHide: true }).stdout || '').trim();
    const inputs = [P.cfg.audio, P.cfg.songmap || 'data/songmap.json', P.cfg.lyrics || 'data/lyrics.json', P.cfg.cues || 'data/cues.json', 'studio.json'].filter(f => f && fs.existsSync(P.rel(f)));
    const own = P.rel('engine/studio.js');
    const engineNote = fs.existsSync(own)
      ? `engine ${(fs.readFileSync(own, 'utf8').match(/VERSION = '([^']+)'/) || [])[1] || '?'} (the project's \`engine/\` copy)`
      : `engine ${ENGINE_VERSION} (the toolkit's; the project has no \`engine/\` copy)`;
    const lines = [
      `# Delivery — ${P.cfg.title || P.name}`,
      '',
      `Generated ${localStamp()} by claude-studio.`,
      '',
      '## Files',
      '',
      `- video: \`${result.out}\` — ${result.width}×${result.height} @ ${result.fps} fps, ${fmtTime(result.duration)}, ${result.codec}`,
      `- poster (frame at ${P.cfg.posterAt || 0} s): \`${posterFile}\``,
      ...subs.map(s => `- subtitles: \`${s}\``),
      `- mix: \`audio/mix.wav\` (${mixr.integrated} LUFS, true peak ${mixr.truePeak} dBTP); buses \`audio/mix_sfx.wav\`, \`audio/mix_music.wav\``,
      `- QA: \`qa/report.md\` (${c.FAIL || 0} fail, ${c.WARN || 0} warn), mix report \`qa/mix_report.md\``,
      '',
      '## Before you publish',
      '',
      `- [${c.FAIL ? ' ' : 'x'}] QA has no failures${c.FAIL ? ` — **${c.FAIL} to fix** (qa/report.md)` : ''}`,
      '- [ ] a person watched the whole film with sound, on headphones and on a phone speaker (the tools cannot hear)',
      '- [ ] the independent jury (agents/studio-jury.md) scored every axis ≥ 8, or you accepted the gaps',
      '- [ ] CREDITS.md lists the music, lyrics, fonts and every asset, with licences',
      '- [ ] the description says what AI did and links the source; add a photosensitivity warning if QA reports flashing',
      '- [ ] the platform\'s rules for AI content and for the music are met (docs/13-rights.md)',
      '',
      '## What was not verified',
      '',
      '- Listening. Loudness, peaks, sync and beat offsets were measured; nobody heard this render.',
      '- Meaning. QA checks numbers and pictures, not whether the film is good. That is the jury\'s and your call.',
      '',
      '## Reproduce',
      '',
      'Frames are a pure function of time, so the same inputs and engine give the same film:',
      '',
      ...inputs.map(f => `- \`${f}\` sha1 \`${sha(P.rel(f))}\``),
      `- ${engineNote}, Node ${process.versions.node}, ffmpeg ${ffv}, Python ${pyv}`,
      `- GPU: ${result.gpu}`,
      `- rendered in ${result.seconds} s (${result.renderFps} fps, ${result.workers} workers, ${result.capture} → ${result.codec})`,
      '',
      '```',
      `node tools/studio.mjs deliver ${path.relative(ROOT, P.root).replace(/\\/g, '/') || '.'}`,
      '```',
      '',
    ];
    fs.writeFileSync(P.rel('out/DELIVERY.md'), lines.join('\n'));
    log(`\n  out/DELIVERY.md written. QA: ${c.FAIL || 0} fail, ${c.WARN || 0} warn.`);
    process.exitCode = qaCode;
  },
};

/**
 * The film's musical times in film seconds and frames, counted by the engine's own functions (the
 * project's engine copy when it has one), so another tool lands where the film does.
 */
async function buildTiming(P, opt) {
  const own = P.rel('engine/studio.js');
  const E = await import(pathToFileURL(fs.existsSync(own) ? own : path.join(ENGINE_DIR, 'studio.js')).href);
  const cfg = P.cfg, notes = [];
  const fps = +(opt.fps || cfg.fps || 30);
  const offset = +(cfg.offset || 0), lyricOffset = +(cfg.lyricOffset || 0);
  const songmap = readJSON(P.rel(cfg.songmap || 'data/songmap.json'), null);
  const lyricData = readJSON(P.rel(cfg.lyrics || 'data/lyrics.json'), null);
  const cueData = readJSON(P.rel(cfg.cues || 'data/cues.json'), null);
  const songDuration = cfg.duration || songmap?.duration;
  let duration = songDuration, shots = null;
  if (!opt['no-shots'] && fs.existsSync(P.rel(page(opt)))) {
    try {
      const info = await probe({ root: P.root, page: page(opt) });
      shots = info.meta?.shots || [];
      duration = info.duration;
    } catch (e) {
      notes.push(`shots left out: the film did not load (${e.message.split('\n')[0]})`);
    }
  }
  if (!duration) die('no duration: set "duration" in studio.json or analyse a song (studio analyze)');
  if (!songmap) notes.push(`no data/songmap.json: beats and bars are a ${cfg.bpm || 120} BPM metronome grid`);
  const song = E.makeSong(songmap || E.syntheticSongmap({ bpm: cfg.bpm || 120, beatsPerBar: cfg.beatsPerBar || 4, firstBeat: cfg.firstBeat || 0, duration: songDuration || 60 }), { offset, duration: songDuration });
  const lyrics = E.makeLyrics(lyricData, { offset: offset + lyricOffset });
  const s3 = t => +t.toFixed(3);
  const nearest = t => Math.round(t * fps); // the frame that shows an instant
  const first = t => Math.ceil(t * fps - 1e-6); // the first frame at or after t (a shot's first frame)
  const inFilm = t => t >= -1e-9 && t < duration - 1e-9;
  const pos = t => song.position(t);
  const range = (a, b) => {
    const start = Math.max(0, a), end = Math.min(duration, b);
    return { start: s3(start), end: s3(end), startFrame: first(start), endFrame: first(end), frames: first(end) - first(start) };
  };
  const sheet = {
    film: P.name,
    title: cfg.title || '',
    fps,
    duration: s3(duration),
    frames: first(duration),
    offset,
    lyricOffset,
    bpm: +song.bpm.toFixed(3),
    beatsPerBar: song.beatsPerBar,
    units: 'film time: seconds from the first frame. "frame" is the frame nearest an instant (0-based); a range runs from its first frame ("startFrame") to the first frame after it ("endFrame").',
    engine: E.VERSION,
    sections: song.sections.filter(s => s.end > 0 && s.start < duration).map(s => ({ name: s.name || '', label: s.label || '', kind: s.kind || '', energy: s.energy ?? null, ...range(s.start, s.end), bar: pos(Math.max(0, s.start)).bar })),
    bars: song.downbeats.filter(inFilm).map(t => ({ bar: pos(t).bar, t: s3(t), frame: nearest(t) })),
    beats: song.beats.filter(inFilm).map(t => ({ bar: pos(t).bar, beat: pos(t).beat, t: s3(t), frame: nearest(t) })),
    lines: lyrics.lines.filter(l => l.end > 0 && l.start < duration).map(l => ({
      line: l.i + 1,
      ...(opt['no-text'] ? {} : { text: l.text, ...(l.translation ? { translation: l.translation } : {}) }),
      ...range(l.start, l.end),
      bar: pos(Math.max(0, l.start)).bar,
      beat: pos(Math.max(0, l.start)).beat,
    })),
    cues: (cueData?.cues || []).map(c => ({ name: c.name, t: c.t + offset })).filter(c => inFilm(c.t)).map(c => ({ name: c.name, t: s3(c.t), frame: nearest(c.t), bar: pos(c.t).bar, beat: pos(c.t).beat })),
    stops: song.stops.filter(s => s.end > 0 && s.start < duration).map(s => range(s.start, s.end)),
    impacts: song.events('impact').filter(e => inFilm(e.t)).map(e => ({ t: s3(e.t), frame: nearest(e.t), strength: +e.strength.toFixed(2) })),
    shots: shots && shots.map(s => ({ id: s.id, ...range(s.start, s.end), cut: s.cut, layer: s.layer })),
    notes,
  };
  if (opt.fps && +opt.fps !== +(cfg.fps || 30)) notes.push(`frames counted at ${fps} fps for another tool; the film runs at ${cfg.fps || 30} fps`);
  return sheet;
}

function timingCSV(T) {
  const q = v => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [];
  const add = (kind, name, start, end, startFrame, endFrame, bar, beat, text) => rows.push({ kind, name, start, end, startFrame, endFrame, bar, beat, text });
  for (const s of T.sections) add('section', s.name || s.label, s.start, s.end, s.startFrame, s.endFrame, s.bar, 1, [s.label !== s.name ? s.label : '', s.energy !== null ? `energy ${s.energy}` : ''].filter(Boolean).join(' · '));
  for (const s of T.shots || []) add('shot', s.id, s.start, s.end, s.startFrame, s.endFrame, '', '', s.cut ? '' : 'no cut');
  for (const l of T.lines) add('line', `line ${l.line}`, l.start, l.end, l.startFrame, l.endFrame, l.bar, l.beat, l.text ?? '');
  for (const c of T.cues) add('cue', c.name, c.t, '', c.frame, '', c.bar, c.beat, '');
  for (const s of T.stops) add('stop', 'stop', s.start, s.end, s.startFrame, s.endFrame, '', '', '');
  for (const e of T.impacts) add('impact', 'impact', e.t, '', e.frame, '', '', '', `strength ${e.strength}`);
  for (const b of T.beats) add(b.beat === 1 ? 'bar' : 'beat', `${b.bar}.${b.beat}`, b.t, '', b.frame, '', b.bar, b.beat, '');
  const order = ['section', 'shot', 'bar', 'beat', 'cue', 'impact', 'stop', 'line'];
  rows.sort((a, b) => a.start - b.start || order.indexOf(a.kind) - order.indexOf(b.kind));
  const head = 'kind,name,start,end,start_frame,end_frame,bar,beat,text';
  return [head, ...rows.map(r => [r.kind, r.name, r.start, r.end, r.startFrame, r.endFrame, r.bar, r.beat, r.text].map(q).join(','))].join('\n') + '\n';
}

function timingMarkdown(T) {
  const t = s => fmtTime(s);
  const cell = s => String(s ?? '').replace(/\|/g, '\\|');
  const L = [`# Timing — ${T.title || T.film}`, '', `${t(T.duration)} at ${T.fps} fps (${T.frames} frames), ${T.bpm} BPM in ${T.beatsPerBar}. ${T.units}`, ''];
  if (T.offset || T.lyricOffset) L.push(`studio.json offset ${T.offset} s, lyricOffset ${T.lyricOffset} s are applied: these are film times, not song times.`, '');
  for (const n of T.notes) L.push(`- ${n}`);
  if (T.notes.length) L.push('');
  if (T.sections.length) {
    L.push('## Sections', '', '| section | from bar | start | end | seconds | first frame | frames |', '|---|---|---|---|---|---|---|');
    for (const s of T.sections) L.push(`| ${cell([s.name, s.label !== s.name ? s.label : ''].filter(Boolean).join(' '))} | ${s.bar} | ${t(s.start)} | ${t(s.end)} | ${(s.end - s.start).toFixed(2)} | ${s.startFrame} | ${s.frames} |`);
    L.push('');
  }
  if (T.shots?.length) {
    L.push('## Shots', '', '| shot | start | end | seconds | first frame | frames |', '|---|---|---|---|---|---|');
    for (const s of T.shots) L.push(`| ${s.id} | ${t(s.start)} | ${t(s.end)} | ${(s.end - s.start).toFixed(2)} | ${s.startFrame} | ${s.frames} |`);
    L.push('');
  }
  if (T.lines.length) {
    L.push('## Lyric lines', '', '| line | bar.beat | start | end | first frame | frames | text |', '|---|---|---|---|---|---|---|');
    for (const l of T.lines) L.push(`| ${l.line} | ${l.bar}.${l.beat} | ${t(l.start)} | ${t(l.end)} | ${l.startFrame} | ${l.frames} | ${cell(l.text ?? '')} |`);
    L.push('');
  }
  if (T.cues.length) {
    L.push('## Cues', '', '| cue | time | frame | bar.beat |', '|---|---|---|---|');
    for (const c of T.cues) L.push(`| ${cell(c.name)} | ${t(c.t)} | ${c.frame} | ${c.bar}.${c.beat} |`);
    L.push('');
  }
  if (T.bars.length) {
    L.push('## Bars (downbeats)', '', '| bar | time | frame | bar | time | frame | bar | time | frame | bar | time | frame |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (let i = 0; i < T.bars.length; i += 4) L.push(`| ${T.bars.slice(i, i + 4).map(b => `${b.bar} | ${t(b.t)} | ${b.frame}`).join(' | ')} |`);
    L.push('', 'Every beat is in timing.csv and timing.json.', '');
  }
  return L.join('\n');
}

/** Duration and frame rate of a finished video, measured by ffprobe. */
function videoTiming(file) {
  const ff = ffmpegBin();
  const bin = process.env.STUDIO_FFMPEG ? path.join(path.dirname(ff), `ffprobe${path.extname(ff)}`) : 'ffprobe';
  const r = spawnSync(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate,duration:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) die(`cannot read ${file}: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()}`);
  const j = JSON.parse(r.stdout || '{}'), s = j.streams?.[0] || {};
  const rate = q => {
    const [a, b] = String(q || '0/0').split('/').map(Number);
    return b ? a / b : 0;
  };
  const fps = rate(s.avg_frame_rate) || rate(s.r_frame_rate), duration = +(s.duration || j.format?.duration || 0);
  if (!fps || !duration) die(`${file} has no video stream with a frame rate and a duration`);
  return { duration, fps };
}

/**
 * The film's sound cues, duration and cuts → qa/sfx_cues.json. From the film page when there is one;
 * with --video (a film made in another tool) or --no-page, from data/sfx.json alone, timed by the
 * video or by studio.json.
 */
async function collectCues(P, opt) {
  const data = readJSON(P.rel('data/sfx.json'), null);
  const extra = data ? (Array.isArray(data) ? data : data.sfx || []).map(s => ({ ...s, from: s.from || 'data/sfx.json' })) : [];
  let info, timedBy;
  if (opt.video) {
    info = { ...videoTiming(path.resolve(String(opt.video))), cuts: [], sfx: [] };
    timedBy = show(P.root, path.resolve(String(opt.video)));
  } else if (!opt['no-page'] && fs.existsSync(P.rel(page(opt)))) {
    info = await probe({ root: P.root, page: page(opt) });
  } else {
    const songmap = readJSON(P.rel(P.cfg.songmap || 'data/songmap.json'), null);
    info = { duration: P.cfg.duration || songmap?.duration || null, fps: P.cfg.fps || 30, cuts: [], sfx: [] };
    timedBy = info.duration ? 'studio.json' : 'the song (no "duration" in studio.json)';
  }
  const cues = { duration: info.duration, fps: info.fps, cuts: info.cuts || [], sfx: [...(info.sfx || []), ...extra].sort((a, b) => a.t - b.t) };
  fs.mkdirSync(P.rel('qa'), { recursive: true });
  fs.writeFileSync(P.rel('qa/sfx_cues.json'), JSON.stringify(cues, null, 1));
  const own = (info.sfx || []).length;
  return { ...cues, said: timedBy ? `${extra.length} sound cue(s) from data/sfx.json (no film page; timed by ${timedBy})` : `${cues.sfx.length} sound cue(s): ${own} from the film, ${extra.length} from data/sfx.json` };
}

// ─── Main ──────────────────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(HELP);
} else if (!commands[cmd]) {
  die(`unknown command "${cmd}". Run without arguments for the list.`);
} else {
  try {
    await commands[cmd]({ ...parseArgs(rest), raw: rest });
  } catch (e) {
    console.error(`\n  ${cmd} failed: ${e.message}\n`);
    process.exitCode = 1;
  }
}
