# claude-studio engine · API reference

> 中文摘要：引擎的核心規則只有一條——**每一格畫面只由時間 t 決定**。`film.html` 呼叫 `film({ shots })`，
> 每個鏡頭有 `start`、`end`、`draw(ctx, s)`；時間一律從歌曲（小節、拍、歌詞、cue）取得，不寫死秒數。
> 下面是所有函式的完整說明（英文，與程式碼同名）。概念與流程請看 [docs/](../docs/README.md)。

`engine/studio.js` is one ES module with no dependencies. A film page imports it, describes shots as
functions of time, and the engine publishes `window.SHOT`, which `tools/render.mjs` renders frame by
frame (in any order, in parallel, in fresh browsers) and `engine/player.js` previews in real time.

Every project keeps its own copy of the engine (`studio new` copies it in), so a film renders the
same a year later. `node tools/studio.mjs engine <project>` compares the copy with the studio's;
`--update` copies the new one in.

```html
<!doctype html>
<html lang="zh-Hant">
<meta charset="utf-8">
<title>film</title>
<script type="module">
  import { film, drawText, ease, span } from './engine/studio.js';

  film({
    shots: [
      ({ song, at }) => ({
        id: 'S01',
        start: 0,
        end: at.bar(5),                       // four bars of the real song
        draw(ctx, s) {
          ctx.fillStyle = '#0d0d10';
          ctx.fillRect(0, 0, s.width, s.height);
          const a = ease.out(span(s.t, at.bar(2), at.bar(2) + 0.6));
          drawText(ctx, '你好', s.width / 2, s.height / 2, { size: 140, weight: 700, align: 'center', alpha: a });
        },
      }),
    ],
  });
</script>
</html>
```

Contents: [the contract](#the-contract) · [film()](#film) · [shots](#shots) · [the shot state `s`](#the-shot-state-s) ·
[time: song, at, lyrics](#time-song-at-lyrics) · [motion](#motion) · [randomness](#randomness-and-noise) ·
[colour](#colour) · [text and fonts](#text-and-fonts) · [texture and camera](#texture-and-camera) ·
[frame sequences](#frame-sequences) · [render mode and preview](#render-mode-and-preview) ·
[window.SHOT](#windowshot-for-renderers) · [rules](#rules)

## The contract

1. **A frame is a pure function of t.** `draw(ctx, s)` may read `s.t` and anything derived from it,
   never a clock, a timer, `Math.random()`, a network response or state left over from the previous
   frame. The renderer draws frames out of order, in several browsers at once, and `studio verify`
   checks that the same frame drawn twice gives the same pixels.
2. **Times come from the music.** Bars, beats, lyric lines and cues (`song.T`, `at.lyric`, `at.cue`)
   follow the analysed song. A hard-coded `12.4` breaks the moment the song, the edit or the offset
   changes; `studio lint` flags them.
3. **Everything draws with project fonts.** Fonts listed in `studio.json` load before the first frame,
   and a character the font cannot draw is an error, not a silent fallback to a system font.

## film()

```js
film({ shots, background, post, setup, sfx, fonts, cuts, config, width, height, fps, duration, capture, frameCacheMB })
```

| option | meaning |
|---|---|
| `shots` | an array of entries; each is a shot, an array of shots, or a function `(api) => shot \| shot[]` (may be `async`), called after the song, lyrics, cues and fonts load |
| `background` | fill drawn before the shots of every frame (default `studio.json` `background`, else `#000`) |
| `post(ctx, p)` | drawn after the shots: `p = { t, frame, width, height, film, song, lyrics, shots }` (`shots` = the active ones). Grain and vignette go here |
| `setup(api)` | `async` hook before the shots are built: load images, precompute paths |
| `sfx` | film-level sound cues `[{ t, sound, why, … }]`, or `(api) => [...]` (see [shots](#shots) for the fields) |
| `fonts` | extra fonts, same form as `studio.json` `fonts` |
| `cuts` | extra cut times (seconds) for motion blur and QA, besides shot starts |
| `config` | path of the settings file (default `studio.json`) |
| `width`, `height`, `fps`, `duration` | override `studio.json` |
| `capture` | `'canvas'` (default: the renderer reads the canvas on the GPU) or `'page'` (screenshots the whole page, for DOM, CSS or SVG layers) |
| `frameCacheMB` | memory for decoded [frame-sequence](#frame-sequences) images, in MB (default `studio.json` `frameCacheMB`, else 256) |

The `api` handed to shot functions and `setup`:

| field | |
|---|---|
| `film` | the film object (`window.studio`): `mode` (`'render'` / `'preview'`), `params` (URL), `studio` (the parsed studio.json), `song`, `lyrics`, `at`, `cues`, `fonts`, `width`, `height`, `fps`, `scale`, `duration`, `offset`, `lyricOffset`, `defaultFamily`, `resolve(path)` |
| `song`, `lyrics`, `at`, `cues` | see [time](#time-song-at-lyrics) |
| `fonts` | the font book: `families` (Map), `missing(family, text)` → characters it cannot draw, `assert(family, text)` throws |
| `width`, `height`, `fps`, `params` | film size in film units (not scaled), frame rate, `URLSearchParams` |
| `loadImage(path)` | `Promise<HTMLImageElement>`, decoded before it resolves; paths are relative to the film |
| `loadFrames(dir)` | `Promise<FrameSeq>`: a clip brought in with `studio frames` (numbered images with a `frames.json`); see [frame sequences](#frame-sequences) |
| `loadJSON(path)`, `loadText(path)` | project files |

### studio.json fields the engine reads

| field | default | |
|---|---|---|
| `width`, `height`, `fps` | 1920, 1080, 30 | film size and rate |
| `duration` | the songmap's | seconds of film; set it for an excerpt |
| `offset` | 0 | film time = song time + offset. `-62.5` starts the film 62.5 s into the song |
| `lyricOffset` | 0 | extra shift for lyrics only |
| `songmap`, `lyrics`, `cues` | `data/songmap.json`, `data/lyrics.json`, `data/cues.json` | each optional |
| `bpm`, `beatsPerBar`, `firstBeat` | 120, 4, 0 | a metronome grid when there is no songmap |
| `fonts` | none | `[{ family, src, weight, style, stretch }]`; `src` inside the project (tools also read `from`, `index`) |
| `lyricFont` | the first font | every lyric line (and translation) is checked against it before frame 0; `false` skips the check |
| `background` | `#000` | |
| `previewScale` | 1 | the preview draws at this fraction of the size (renders always draw at 1) |
| `frameCacheMB` | 256 | memory for decoded frame-sequence images (one 1920×1080 frame takes about 8 MB) |

Tools read more of the file (`audio`, `mix`, `render`, `posterAt`, `title`, `artist`, …); see
[docs/03](../docs/03-workflow.md).

## Shots

```js
{ id: 'S03', start: at.lyric('就在這裡'), end: at.afterLine('就在這裡'), layer: 0, cut: true, draw(ctx, s) {}, sfx: [] }
```

| field | |
|---|---|
| `id` | unique; defaults to `S01`, `S02`, … in list order. Use the storyboard's numbers |
| `start`, `end` | seconds of film time, `end > start`. The shot draws for `start ≤ t < end` |
| `layer` | draw order (low first, default 0); shots on one layer draw in list order |
| `cut` | `false` for overlays (lyrics, titles, grain): their start is not a cut, so motion blur and QA do not treat it as one |
| `draw(ctx, s)` | draws the frame. `ctx` is in film units (the engine scales for previews) and is saved and restored around every shot |
| `sfx` | sounds this shot asks for: `[{ t, sound, why, gain, sync, role }]`. `t` is film time; `sound` a recipe (`studio sfx list`) or a file; `why` is required by `studio plan`; `sync` `onset` / `peak` / `end` says which landmark of the sound lands on `t`; `role` sets the ducking (`studio mix`) |

The engine checks every shot (a `draw` function, finite times, unique ids) and warns, in
`SHOT.meta.warnings` and the render log, about any span of frames no shot covers; QA fails on those.

## The shot state `s`

| field | |
|---|---|
| `t` | film time of the frame (seconds) |
| `local`, `dur`, `u` | seconds into the shot, the shot's length, and `local / dur` clamped to 0–1 |
| `start`, `end`, `id`, `shot` | the shot's own fields |
| `frame`, `fps` | frame index and rate (motion-blur subframes share their frame's index) |
| `width`, `height` | film size in film units |
| `film`, `song`, `lyrics`, `at` | as in `api` |
| `in(d)` | 0 → 1 over the first `d` seconds of the shot |
| `out(d)` | 0 → 1 over the last `d` seconds of the shot |

```js
const a = ease.out(s.in(0.4)) * (1 - ease.in(s.out(0.3)));   // fade in, fade out
```

## Time: song, at, lyrics

All times are **film time**: the engine has already applied `offset` (and `lyricOffset` for lyrics).
Bars and beats are 1-based, as a musician counts. In an excerpt the bar numbers stay the song's.

### song

| | |
|---|---|
| `song.T(bar, beat = 1, sixteenth = 1)` | the time of a musical position, following the measured beats. `song.T(9)` = bar 9; `song.T(9, 3)` its third beat; `song.T(9.5)` half way through bar 9 |
| `song.beatAt(t)`, `song.timeOfBeat(p)` | fractional beat index (0-based) ↔ time |
| `song.barAt(t)` | fractional bar number, 1-based |
| `song.position(t)` | `{ bar, beat, sixteenth }` for display |
| `song.nextBeat(t)`, `prevBeat(t)`, `nearestBeat(t)` | beat times around t |
| `song.nextDownbeat(t)`, `prevDownbeat(t)` | bar starts around t |
| `song.section(t)` | the section at t: `{ name, label, kind, start, end, bars, energy, loudness, index }`, or `null` |
| `song.sections`, `song.beats`, `song.downbeats` | arrays (film time) |
| `song.bpm`, `song.beatsPerBar`, `song.period`, `song.duration`, `song.synthetic` | `synthetic` is `true` for the metronome grid |
| `song.env(name, t)` | an analysed envelope, 0–1: `'rms'` (alias `'overall'`), `'low'`, `'mid'`, `'high'`, `'onset'` |
| `song.hit(kind, t, halfLife = 0.12)` | 1 at the latest event of a kind, halving every `halfLife` s: `'kick'`, `'snare'`, `'hat'`, `'vocal'`, `'beat'`, `'downbeat'`, `'impact'` (whatever `studio analyze` found) |
| `song.events(kind)` | `[{ t, strength }]` |
| `song.isStop(t)`, `song.stops` | inside a stop (the band drops out); the stops as `[{ start, end }]` |

```js
const kick = Math.max(song.hit('kick', s.t, 0.16), 0.6 * song.hit('beat', s.t, 0.12));
const r = 40 * (1 + 0.3 * kick);
```

### at: addressing moments

| | |
|---|---|
| `at.T(...)` | `song.T` |
| `at.bar(n)`, `at.beat(p)` | start of bar n; time of beat index p |
| `at.lyric(query, { nth = 1, snap = 'beat' })` | when a lyric line starts. `query` is text inside the line (spaces and punctuation ignored) or a 1-based line number. `snap`: `'beat'` the beat at or just before the sung start (default: cuts land on the music), `'downbeat'`, `'half'`, `'none'` (the exact sung start) |
| `at.afterLine(query, { nth })` | the first downbeat at or after the line ends |
| `at.line(query, { nth })` | the line object |
| `at.word(query, word, { nth, occurrence = 1 })` | when a word inside a line is sung (per-character times, estimated if not measured) |
| `at.cue(name)` | a human-checked time from `data/cues.json` (`{ "cues": [{ "name": "drop", "t": 62.48 }] }`, song time) |

`at.lyric` throws with the list of lines when the text is not found, so a renamed lyric fails loudly
instead of moving a cut.

### lyrics

| | |
|---|---|
| `lyrics.lines` | `[{ i, start, end, text, translation, chars: [{ c, start, end, est }], key, …any extra fields }]`; `est: true` marks estimated character times |
| `lyrics.hasText` | false for timing-only files (`studio lyrics strip`) |
| `lyrics.lineAt(t, { lead = 0, hold = 0 })` | the line at t; `lead` shows it early, `hold` keeps it after its end |
| `lyrics.find(query, { nth })` | as `at.line` |
| `lyrics.progress(line, t)` | characters sung so far, fractional (2.4 = two done, the third 40%) |

Helpers: `makeLyrics(data, { offset })`, `estimateChars(text, start, end)` (spreads a line's time by
`charWeight`: CJK 1, other letters 0.25, spaces 0.1, punctuation 0), `graphemes(text)`.

## Motion

| | |
|---|---|
| `span(t, a, b)` | progress 0 → 1 of t through [a, b], clamped |
| `ease.out`, `ease.in`, `ease.inOut` | house curves: entrances decelerate (`cubic-bezier(0.16, 1, 0.3, 1)`), exits accelerate (`0.7, 0, 0.84, 0`), short moves `0.87, 0, 0.13, 1`. `ease.inOut` peaks at 7.7× its average speed, so stretched over seconds it holds, whips and holds: long camera moves take `ease.sineInOut` (1.57×) or `x => smoothstep(0, 1, x)` (1.5×) |
| `ease.linear`, `quad*`, `cubic*`, `quart*`, `expo*`, `sine*` (`In`, `Out`, `InOut`) | the usual family |
| `ease.backOut`, `ease.back(s)` | overshoot pop (s 1.4–1.7 reads as deliberate) |
| `ease.impact` | 90% of the way in 85% of the time, then a hard snap: hits on a beat |
| `ease.steps(n, fn)` | hold each value: a hand-made, on-twos feel |
| `bezier(x1, y1, x2, y2)` | any CSS cubic-bezier as a function |
| `spring(t, { freq = 14, damp = 0.75 })` | closed-form spring step 0 → 1 at `t` seconds after the step (no state). Presets: buttons 22–26 / 0.8, cards and camera 14–16 / 0.72, big type and logos 9–11 / 0.9, characters 16–20 / 0.45 |
| `springTrack(t, [[t0, v0], [t1, v1], …], opts)` | retargeting spring through keys; values may be arrays |
| `track(t, [[t0, v0, ease?], …], defaultEase = ease.inOut)` | keyframes; values may be arrays. The default suits short moves: give camera keys seconds apart `ease.sineInOut` |
| `pulse(t, t0, halfLife = 0.12)` | 0 before t0, 1 at t0, then halving |
| `stepTime(t, fps = 12)` | quantise time: animate on twos (12) or threes (8) |
| `clamp`, `lerp`, `invLerp`, `remap(x, a, b, c, d, clamped = true)`, `fract`, `mod`, `smoothstep`, `smootherstep`, `TAU` | math |

```js
const y = lerp(H * 1.2, H * 0.5, spring(s.t - at.lyric('副歌'), { freq: 11, damp: 0.9 }));
```

## Randomness and noise

| | |
|---|---|
| `hash(...args)` | deterministic hash of any values → [0, 1): `hash('star', i)` |
| `rng(seed)` | seeded generator (mulberry32): `const r = rng('dust'); r(); r.range(a, b); r.int(a, b); r.pick(list); r.sign()` |
| `noise1(x, seed)`, `noise2(x, y, seed)` | smooth gradient noise in about [-1, 1] |
| `fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed })` | fractal noise |

Build particle systems from `rng(seed)` once (in the shot function, outside `draw`) or from
`hash(i, …)` inside it; never let one frame's state feed the next.

## Colour

`color.parse(c)` → `[r, g, b, a]` (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, arrays) ·
`color.css(rgba)` · `color.mix(a, b, t)` (in OKLab: no grey middle) · `color.alpha(c, a)` (multiplies
alpha) · `color.luminance(c)` (WCAG relative luminance, for contrast checks).

## Text and fonts

Fonts come from `studio.json` `fonts` and live in the project (`studio fonts` subsets them to the
characters the film draws, with the licence beside them). The helpers below check every string
against the font's character map and **throw on a missing glyph**, naming the character and its code
point. A generic family (`sans-serif`, `system-ui`, a comma list) is allowed with one warning, since it
renders differently on every machine.

| | |
|---|---|
| `fontString({ size = 64, family, weight = 400, style })` | a CSS font string; `family` defaults to the first project font |
| `drawText(ctx, text, x, y, opts)` | returns the width. `opts`: `size`, `family`, `weight`, `style`, `fill` (`'#fff'`, `null` for stroke only), `stroke`, `strokeWidth`, `align`, `baseline`, `spacing` (em), `alpha` |
| `wrapText(ctx, text, maxWidth)` | lines that fit (CJK per character, Latin per word, no closing punctuation at a line start, no opening punctuation at an end). Set `ctx.font` first |
| `fitText(ctx, text, maxWidth, { family, weight, style, maxSize = 200, minSize = 8, spacing })` | the largest size that fits |
| `textSprite(text, opts)` | the text drawn once into its own canvas, at `opts.size`; returns `{ canvas, size, width(s), draw(ctx, x, y, s, { align }) }` with the alphabetic baseline at `y`. Use it for display type over about 250 px or type that changes size: on the GPU, very large glyphs can differ by a level or two between runs depending on what was drawn before, and `studio verify` fails. Make sprites when the shot is built, not in `draw()` |
| `verticalText(ctx, text, x, y, opts)` | top to bottom from the centre of the first character; dashes, brackets, ellipses and Latin rotate, 、。 sit upper right. `opts`: `size`, `family`, `weight`, `fill`, `spacing = 0.05`, `alpha`, `rotateLatin = true`. Returns the height |
| `karaoke(ctx, line, t, opts)` | a lyric line with the sung part swept in `fill` over `base`. The fill never runs ahead of the voice; the dim line appears `lead` s early (≤ 0.4) and fades over `fadeOut`. `opts`: `x`, `y`, `size = 96`, `family`, `weight = 700`, `align = 'center'`, `base`, `fill`, `lead = 0.3`, `fadeOut = 0.25`, `spacing`, `stroke`, `strokeWidth`. Returns `{ x, width, progress }` or `null` when the line is not on screen |
| `graphemes(text)`, `charWeight(ch)` | user-perceived characters; karaoke weights |
| `parseCmap(buffer)` | the character map of a TTF / OTF / TTC (first face) |

```js
const line = lyrics.lineAt(s.t, { lead: 0.3, hold: 0.2 });
karaoke(ctx, line, s.t, { x: s.width / 2, y: s.height * 0.86, size: fitText(ctx, line?.text || '', s.width * 0.86, { maxSize: 84, weight: 700 }), stroke: '#000a', strokeWidth: 8 });
```

## Texture and camera

| | |
|---|---|
| `grain(ctx, frame, { amount = 0.06, size = 1, seed, mode = 'overlay' })` | film grain seeded by frame index (blur subframes share it). Grain costs encoder bits: see [docs/10](../docs/10-render.md) |
| `vignette(ctx, { amount = 0.35, inner = 0.5, color = '#000' })` | darker edges |
| `camera(ctx, { x, y, zoom, rot }, draw, { depth = 1 })` | draw inside a 2D camera around the frame centre; `depth` scales the move for parallax (far 0.02–0.06, subject 1, foreground 1.2–1.5) |
| `toScreen(cam, px, py, { depth })` | where a world point lands on screen |
| `shake(t, { amp = 3, freq = 1.2, rot = 0.002, seed })` | seeded handheld drift → `{ x, y, rot }` (calm 2–4 px, panic 8–13 px) |

```js
camera(ctx, { ...shake(s.t, { amp: 3 }), zoom: lerp(1, 1.06, s.u) }, ctx => drawCity(ctx, s), { depth: 0.05 });
```

## Frame sequences

Pictures the engine does not draw (a Blender render, a generated clip, footage filmed on green
screen) come in as numbered images. `studio frames <project> <clip> [--key auto] [--name N]` writes
`frames/<name>/000001.png …` and `frames/<name>/frames.json` (`fps`, `count`, `width`, `height`,
`pattern`, `first`, `alpha`, the source, and the key and matte measurements). A shot loads the
folder once and draws the clip frame for its own time:

```js
// shots/dancer.js: the clip was made as long as the shot (its frame count is in out/timing.md)
export const dancer = async ({ at, loadFrames }) => {
  const clip = await loadFrames('frames/dancer');
  const start = at.lyric('就在這裡'), end = at.afterLine('就在這裡');
  return {
    id: 'S07', start, end,
    draw(ctx, s) {
      ctx.fillStyle = '#16161c';                                     // the world is drawn in code
      ctx.fillRect(0, 0, s.width, s.height);
      clip.draw(ctx, s.local, ...clip.fit(s.width, s.height, 'contain', 0.5, 1)); // standing on the bottom edge
    },
  };
};
```

| | |
|---|---|
| `clip.draw(ctx, time, x, y, w, h, { loop, rate, alpha })` | draws the frame showing `time` seconds into the clip, at the clip's own size unless `w`, `h` are given; returns the image, or `null` while it loads (preview) |
| `clip.fit(width, height, mode = 'contain', ax = 0.5, ay = 0.5)` | `[x, y, w, h]` placing the clip in a width × height box: `'contain'`, `'cover'` or `'fill'`; `ax`, `ay` place the leftover space (0 left or top, 1 right or bottom) |
| `clip.index(time, { loop = false, rate = 1 })` | the 0-based frame showing `time`: `floor(time × fps × rate)`, held on the first and last frame outside the clip, or wrapped with `loop` |
| `clip.image(i)` | frame `i` as an `ImageBitmap` (alpha premultiplied, colours as stored), or `null` while it loads: for masks, displacement or a WebGL texture |
| `clip.fps`, `count`, `width`, `height`, `duration`, `meta` | from `frames.json`; `duration = count / fps` seconds; `meta` is the whole file |
| `frameIndex(time, fps, count, { loop, rate })` | the same arithmetic for any numbered set |

- **Still a pure function of t.** Pass the shot's time (`s.local`, or `s.t` minus a time from the
  song), never a counter. A clip keeps its own rate: a 24 fps clip in a 30 fps film shows each clip
  frame for one or two film frames, as pulldown does, so it needs no conversion first.
- **Render:** `SHOT.renderAsync(t)` draws the frame, waits for the clip images it asked for and
  draws it again (at most 8 passes), so frames render in any order and in parallel, and
  `studio verify` still compares identical pixels. A missing or undecodable image is an error
  naming the file and the frame number, never a silently empty layer; a renderer that only calls
  `SHOT.render(t)` gets an error for an image that has not loaded yet, not a frame without its
  layer.
- **Preview:** a frame not yet decoded shows the nearest decoded one (up to 12 frames away) and the
  picture redraws when it arrives; the next 8 frames load ahead.
- **Memory:** decoded frames are kept up to `frameCacheMB` (256 MB, about 30 frames at 1920×1080),
  the least recently drawn dropped first, never one the current picture uses. Bring clips in at
  the size they appear (`studio frames` fits them inside the film by default) and raise
  `frameCacheMB` for long passages of large frames.

## Render mode and preview

Opened with `?render=1` (the renderer does this), the page draws frame 0 and waits. In render mode
the engine also:

- seeds `Math.random` per frame (`rng('frame:<n>')`), so stray calls are at least repeatable;
- drives `Date.now()` and `performance.now()` from t;
- turns off CSS animations and transitions.

Opened without it, `engine/player.js` mounts the preview: Space play/pause · ←/→ ±1 s (Shift ±5 s) ·
`,` `.` one frame · `[` `]` one bar · D debug overlay (title-safe box, platform UI zones, thirds,
bar.beat, section, line, a beat flash) · L loop the current shot · M mute · Home/End · ?. It plays
`audio/mix.wav` when there is one (film time), else the song from `t − offset`.

URL parameters: `?t=83.5` start time · `?debug=1` · `?lat=0.03` audio latency (s) · `?w=1080&h=1920`
another size · `?scale=0.5` · `?label=1` a burned-in label (time, bar.beat, section, shots, lyric) ·
`?audio=song` ignore the mix.

## window.SHOT (for renderers)

```js
window.SHOT = { engine, width, height, fps, duration, ready, render(t, info), renderAsync(t, info), cuts, meta, canvas, sfx, capture, describe(t) }
```

- `ready`: a promise; after it resolves `width`/`height` are the canvas size (film size × scale).
- `render(t, { frame })`: draws t; returns the active shots.
- `renderAsync(t, { frame })`: the same, after the [frame-sequence](#frame-sequences) images the
  frame uses have loaded; resolves to the active shots. `tools/render.mjs` uses it when the page
  has it (engine 0.2 and later) and `render` otherwise.
- `cuts`: sorted cut times (shot starts with `cut !== false`, plus `config.cuts`).
- `meta`: `{ title, scale, song: { bpm, beatsPerBar, sections: [{ name, label, start, end }] }, shots: [{ id, start, end, cut, layer }], frames: [{ dir, fps, count, width, height }], font, warnings }`.
- `sfx`: every sound cue, sorted, each with `from` (the shot id or `'film'`).
- `describe(t)`: `{ time, bar, section, shots, line }` for labels and contact sheets.

`tools/render.mjs` also renders pages that expose `window.renderFrame(t)`, `window.render(t)` with
`DUR`, `window.seek(t)` or `window.renderAt(t)`, so other engines can use the same pipeline.

## Rules

`studio lint` flags what breaks the contract; `// lint-ignore` at the end of a line accepts it.

| don't | do |
|---|---|
| `start: 12.4` | `start: at.lyric('就在這裡')`, `song.T(17)`, `at.cue('drop')` |
| `Math.random()` | `rng('stars')`, `hash(i, 'x')` |
| `Date.now()`, `performance.now()`, `setTimeout`, `requestAnimationFrame` in a shot | `s.t`, `s.local`, `s.u` |
| state kept between frames (`this.x += v`) | a closed form of t (`spring`, `track`, `noise1`) |
| `fetch('https://…')`, web fonts, CDN images | files in the project; `api.loadImage('img/a.png')` in `setup`, `api.loadFrames('frames/clip')` for a clip |
| a big photo from `loadImage` drawn at many sizes (Chrome can keep a smaller decode made for an earlier frame, so a frame depends on render order) | copy it once into a full-size canvas in `setup` and draw from the canvas ([pitfalls](../docs/16-pitfalls.md)) |
| CSS animations | draw it on the canvas, or `capture: 'page'` with times set from t |
