# studio command reference

`studio` = `node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs"` (or `node tools/studio.mjs` inside the
repository). Every command that takes `<dir>` reads `<dir>/studio.json`. Run `studio` with no
arguments for the short list.

Needs: Node 22+, Chrome or Edge, ffmpeg (full build), Python 3.10+ with numpy, scipy and Pillow.
Overrides: `STUDIO_BROWSER`, `STUDIO_FFMPEG`, `STUDIO_PYTHON`; for the optional tools `doctor`
looks for, `STUDIO_BLENDER` (blender.exe) and `STUDIO_COMFYUI` (its address, or its folder).

## Setup

| command | does | writes |
|---|---|---|
| `doctor` | checks Node, the browser and its GPU (stops on software GL), ffmpeg encoders (libx264, h264_nvenc, prores_ks), Python packages, an OFL CJK font, git; flags ad blockers that inject scripts into local pages. Optional rows (`·` when absent, never a problem): Demucs, faster-whisper, Blender (version and path), a running ComfyUI (asks `/system_stats` on 127.0.0.1:8188 and :8000; never starts it), npx | nothing |
| `new <dir> [--template lyric-mv\|short\|blank] [--title T] [--artist A] [--width W --height H --fps F]` | copies a template and the engine into a new or empty folder; finds an OFL CJK font on the machine and subsets it into `fonts/` | the project |
| `engine <dir> [--update]` | compares the project's pinned engine with the toolkit's; `--update` copies the new files in (frames may change: take stills before and after, then `verify`) | `engine/` |
| `music <out.wav> [--plan pop\|short\|drive\|full\|chill] [--plan-file P.json] [--bpm N] [--key A] [--mode minor] [--seed N] [--lead-in 0.5] [--drift 0.02] [--truth F] [--stems DIR]` | procedural practice music with ground truth: beats, bars, sections, stops and impacts are known exactly. Rights-clean, but it is practice music, not a score | the WAV, `<out>.truth.json`, stems |

## Time lock (G1)

| command | does | writes |
|---|---|---|
| `analyze <dir> [audio] [--stems DIR] [--bpm N] [--beats-per-bar N] [--first-downbeat S] [--sections 1,5,13]` | beats, downbeats, tempo with candidates and ambiguity, drift, sections with energy and A/B/A′ labels (aligned with its own stops and big hits: moves listed under `notes`, mismatches warned), stops, impacts, kick/snare/hat/vocal events (a kick must leave sub-bass; reverb tails dropped from a vocal stem), envelopes. `--sections` gives the bars where sections start (bar 1 = the first downbeat): used as given, recorded in `notes` with where the analysis on its own puts them. Hints are not saved; pass them on every re-run. Uses `audio/stems/` when present (vocals, drums, bass, other) | `data/songmap.json`, `qa/click_preview.wav` (high click = bar start, bell = section start) |
| `excerpt <dir> [--section chorus] [--nth N\|last] [--bar N] [--bars N] [--lead-bars N] [--max 30]` | picks a section (the strongest by default), cuts on whole bars, whole 4-bar phrases when it must shorten | `studio.json` `offset`, `duration`, `mix.fadeIn/fadeOut` |
| `tap <dir> [--text FILE] [--port N]` | serves the lyric tapper with the song, lyrics or text, and songmap loaded: calibrate once, hold Space while each line is sung, 0.5×–1× playback, nudge starts and ends, export LRC | the user downloads `<song>.tapped.lrc` |
| `lyrics import <dir> FILE [--dupes drop\|translation] [--two-line join\|translation] [--offset S]` | LRC (enhanced word stamps too), SRT, VTT or JSON → song-time lines with estimated or measured character times; warns about overlaps, short lines, wide lines, an early first line | `data/lyrics.json` (+ `.bak`) |
| `lyrics check <dir>` | reading time, overlaps, width, missing glyphs in the lyric font, timing against the songmap; excerpt-aware (only lines inside the film) | report |
| `lyrics snap <dir> [--to auto\|vocal\|half] [--max-vocal 0.15] [--max-grid 0.06] [--dry-run] [--undo]` | moves line starts to nearby vocal onsets or half beats within the thresholds and lists every move | `data/lyrics.json` |
| `lyrics listen <dir> [-n 10] [--audio FILE]` | short excerpts around the least certain starts with a tick on the start, for a human ear | `qa/listen/*.wav` |
| `lyrics strip <dir>` · `lyrics fill <dir> lyrics.txt [--translation T]` | timing without text, for public repositories · the user's own text back onto the timing | `data/lyrics.timing.json` · `data/lyrics.json` |
| `lyrics export <dir> [--format srt\|vtt\|lrc] [--lead S] [--no-translation] [--words]` | subtitles in film time (offsets applied) | `out/<name>.srt` … |
| `lyrics check-repo <root> [--lyrics FILE] [--allow GLOB]` | finds lyric fragments (runs of 4+ characters) and audio in files git would publish | report, exit 1 on findings |
| `fonts <dir>` | subsets each `studio.json` font with a `from` to the characters the film draws (shots, lyrics, titles), keeps glyph widths, writes the licence beside it | `fonts/*.subset.ttf`, `fonts/OFL.txt` |

## Look

| command | does | writes |
|---|---|---|
| `serve <dir> [--port N]` | live preview on the audio clock; reloads on save. Space play/pause · ←/→ ±1 s (Shift ±5) · `,` `.` one frame · `[` `]` one bar · D debug overlay · L loop the shot · M mute · ? help. URL: `?t=83.5`, `?debug=1`, `?lat=0.03`, `?w=1080&h=1920`, `?scale=0.5`, `?label=1`, `?audio=song` | nothing |
| `stills <dir> --at 1.5,8,12.25 [--label] [--scale 0.5]` | full-resolution PNG frames at those times (render mode, same pixels as the video) | `qa/stills/` |
| `sheet <dir> [--every 1.5] [--from A] [--to B] [--cols 6] [--rows 5]` | contact sheets labelled with time, bar.beat, section and lyric | `qa/sheet_NN.png` |
| `plan <dir>` | storyboard and shot checks from the page: coverage without gaps, overlaps, shot-length variety, cuts on beats, missing Outs, sounds without a `why` | `qa/plan.md`, `qa/plan.json` |
| `lint <dir>` | hard-coded shot times, `Math.random`, clocks, timers, network assets, CSS animation; `// lint-ignore` accepts a line | exit 1 on findings |
| `verify <dir> [--samples 16]` | renders cut frames (±1), start, end and samples twice, in shuffled order, in a fresh browser, and compares pixels | exit 1 on any difference |

## Other tools (Blender, generated video, filmed footage)

Each tool is used through its own interface (command line, MCP server, API, window); these two
commands hand it the film's times and bring its pictures back.

| command | does | writes |
|---|---|---|
| `frames <dir> <clip> [--name N] [--fps F] [--from S] [--to S] [--size fit\|cover\|source\|WxH] [--crop W:H:X:Y] [--format png\|jpg] [--key auto\|green\|blue\|#rrggbb] [--similarity S] [--blend B] [--despill 0.5] [--matrix bt709\|bt601\|bt2020] [--force]` | a video, a folder of numbered images (Blender's output), one of them, or a pattern such as `render_%04d.png` → numbered frames for `api.loadFrames()`. Fits inside the film frame and never upscales (`--size`); a video keeps its own rate, images play at the film's unless `--fps`; PNG when there is transparency, JPEG (quality 2, 4:4:4) otherwise; stops on gaps in the numbering, on EXR and on HDR. `--key` removes a green or blue screen with ffmpeg's `chromakey` and `despill`: it measures the screen colour on the frame edges and its spread (which sets the threshold), then the matte (screen left at the edges, holes, specks, soft edge, spill) and warns with what to do | `frames/<name>/000001.png …`, `frames/<name>/frames.json`, `qa/frames_<name>.png` (source / keyed over a checkerboard / matte) |
| `timing <dir> [--fps N] [--format json,csv,md] [--out FILE] [--no-text] [--no-shots]` | sections, bars, beats, lyric lines, cues, stops, impacts and shots in film seconds (offsets applied) and frame numbers, counted by the project's own engine: an instant is its nearest frame, a range runs from `startFrame` to `endFrame` (the first frame after it). `--fps` counts frames at another tool's rate; `--no-text` leaves the lyric text out; `--no-shots` skips loading the film page | `out/timing.json`, `.csv`, `.md` (or `--out FILE`, format from the extension) |

## Sound

| command | does | writes |
|---|---|---|
| `sfx list` | recipes with their landmark (onset / peak / end) and duck role: impact, boom, whoosh, riser, reverse, pop, click, tick, beep, bell, musicbox, pluck, pad, step, typing, shimmer | — |
| `sfx make KIND --out F.wav [--seed N] [--dur S] [--pitch ST] [--note MIDI] [--bright 0-1]` | one synthesised sound with a sidecar giving its landmark | WAV + `.json` |
| `sfx pack DIR [--variations 3]` · `sfx info FILE [--sync onset\|peak\|end]` | every recipe in variations · measures a sound file's landmarks (merges into its sidecar) | WAVs, sidecars |
| `mix <dir> [--target -14] [--out F] [--video FILE \| --no-page]` | every `sfx` cue of the film (plus `data/sfx.json`; with `--video`, a film made in another tool, or `--no-page`, `data/sfx.json` alone, timed by that video or by `studio.json` `duration`) placed by landmark (`sfx_start + landmark = t`), debounced, ducking by role (deepest wins), each sound's distance from the nearest beat reported (never moved), the song shifted by `offset` with `mix.fadeIn/fadeOut`, two-pass loudness to −14 LUFS with a −1.5 dBTP WAV ceiling | `audio/mix.wav`, `mix_sfx.wav`, `mix_music.wav`, `qa/mix_report.md` |

Duck roles: click 3.25 dB, typing 2.5, transition 4, notify 5.5, brand 5, voice 8 (held), silence
(the music drops out for an impact).

## Finish

| command | does | writes |
|---|---|---|
| `render <dir> [--preview] [--from S] [--to S] [--codec x264\|nvenc\|prores] [--crf N] [--preset P] [--blur N] [--shutter 0.5] [--workers N] [--scale F] [--audio FILE] [--no-audio] [--out FILE] [--label] [--allow-software] [--headful]` | headless Chrome/Edge over DevTools, parallel segments, frames piped into ffmpeg, BT.709 tags, resumable; uses `audio/mix.wav` when present. `--preview` = half size, fast preset, labels. `--blur 8 --shutter 0.5` = motion blur that never crosses a cut | `out/<name>.mp4` (+ `.json` manifest) |
| `qa <dir> [--video FILE] [--check-lyrics]` | any video, including one made in another tool (without a render manifest the cuts are detected from the pictures): spec, flashes (WCAG 2.3.1 approximation, red counted apart), black and white frames, brightness drops inside shots, loudness and true peak after encoding, audio offset against the mix, cut and sound distance from beats (past the last beat the grid counts on as `song.T` does), shot variety, storyboard, lyrics, repository hygiene | `qa/report.md` + `.json`, `video_sheet_NN.png`, `strips_NN.png`, `luma.png`, `wave.png`, `spec.png` |
| `deliver <dir>` | fonts → lyrics check → mix → render → QA → subtitles → poster → delivery notes with the before-you-publish checklist and the hashes needed to reproduce | `out/<name>.mp4`, `out/<name>.srt`, `out/<name>_poster.png`, `out/DELIVERY.md` |

## studio.json fields the tools read

`name`, `title`, `artist`, `credits`, `width`, `height`, `fps`, `duration`, `audio`, `songmap`,
`lyrics`, `cues`, `offset` (film time = song time + offset), `lyricOffset`, `fonts`
(`[{ family, src, from, weight, index }]`), `lyricFont`, `lyricSize`, `translationSize`,
`background`, `previewScale`, `posterAt`, `mix` (`target`, `ceiling`, `music` gain dB, `fadeIn`,
`fadeOut`), `render` (`codec`, `crf`, `preset`, `blur`, `shutter`). The engine's own fields are in
`engine/README.md`.
