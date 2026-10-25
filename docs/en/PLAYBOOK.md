# Claude Studio Playbook (English)

A condensed English edition of the Traditional Chinese knowledge base in [`docs/`](../README.md). It covers how to make animations and music videos with Claude Opus 5.5: from a song or an idea to a film you can publish.

The material comes from the first month after Opus 5.5 shipped (2026-09-22 to 2026-10-24): the most-played and most-favourited Bilibili works, what their makers said in descriptions and replies, the source and documents of 48 open repositories (licences checked one by one), and Anthropic's own documentation. Play counts are mid-to-late October snapshots. Every source is listed in [18-sources.md](../18-sources.md). This project is not affiliated with Anthropic.

---

## 1. What this route is

Opus 5.5 is not a video model. It makes video by **writing a program that draws pictures**:

1. A program maps time `t` to one picture (Canvas, WebGL, SVG or DOM in a browser; Python in Blender).
2. A headless browser (or Blender) draws every frame in order.
3. ffmpeg encodes the frames and muxes the music.

So every frame can be recomputed, inspected and changed on its own. That gives four properties video models do not have:

| Property | In practice |
|---|---|
| Precise | A lyric lights up on the sung syllable; a drum hit lands on the frame where motion stops |
| Editable | "This word lights too early" changes one segment and nothing else |
| Reproducible | The same `t` always gives the same picture; preview equals final |
| Cumulative | Code, components, camera moves and parameters carry into the next film |

**Strong at:** lyric videos, kinetic typography, explainers and data visualisation (the simulation *is* the picture), product and UI films, styles that can be described in code (pixel, geometric, print, watercolour, paper puppets), procedural 3D.

**Weaker at:** live-action performance, realistic faces and hands, delicate organic motion. Use a hybrid route there: image or video models make the assets; code owns position, structure, motion and text.

**Honest note:** the most-viewed "AI MVs" on Bilibili (millions of plays) are mostly video-model meme mashups with AI music, not this route. Code wins on precision, design, editability and reuse, not on virality. For reach, topic and in-jokes still come first.

## 2. Ten principles

Each one comes from comparing high-play works, their makers' own notes, viewer criticism and open-source practice.

1. **One concept, one through-line.** The most-played Opus MV (BlackDawn's *Senbonzakura*, 759k plays) drew the top comment "too much stuff, no centre". The best-favourited works state a one-line conceit: "a chat window is her whole world"; "you are the white cursor"; "the singing 'I' is a paper mouse cut from progress reports". Write the conceit, a motif, a bookend and a *restraint budget* (what each section leaves out).
2. **Storyboards need logic; transitions are designed.** A 390k-play *world.execute(me)* was criticised as "great frames, no storyboard logic, all hard cuts: a portfolio reel". Every shot gets an **Out** column: what this shot leaves behind and how the next one picks it up. Use only 2–3 transition grammars per film.
3. **Time is measured, not guessed.** "The AI isn't listening to the music, it's doing maths." Compute beats with a tool, confirm with a click track by ear, align the official lyrics and proofread. When tempo might be half or double, or the downbeat is unclear, the tool must **report the ambiguity**, not pick silently.
4. **A specific style beats the default style.** Viewers now recognise "default Opus": glow everywhere, an FM "ding" intro, the same BGM, Monument-Valley geometry. One creator reused the same long brief behind a famous MV remake and added only Midjourney access and a moodboard: about 20M views and a completely different film. References, not wording, made the difference. Every film gets a style card with hex colours, fonts, layout, motion rules and a ban list. The idea comes first and references make it specific: agents reuse what they have seen (§4, G2).
5. **Iterate on evidence.** One 13,017-frame film rendered over 160,000 frames of video and ~8,900 stills just for checking. Go stills → 10–15 s sample → full film; read contact sheets labelled with time and lyric; sample densely around transitions; let an independent reviewer score until every axis passes; change one or two things per round.
6. **The second half of a long film degrades.** Build in chapters with fresh contexts (or parallel subagents sharing one style bible) and review the end as strictly as the opening.
7. **Sound is the weakest link.** Nearly every high-play work is criticised most for audio. Decide the music direction at style freeze, hang SFX on events aligned to measured landmarks, duck music by role, master to −14 LUFS and ≤ −1 dBTP, and when nobody has listened, say so.
8. **Honesty and rights are part of quality.** A channel that grew to ~500k followers in two weeks reportedly lost ~100k after it emerged the work was AI-made and unlabelled. Label AI use from day one, credit everything, warn about flashes with a time range, follow fan-work rules, and for explainers *simulate the claim*.
9. **Cost follows code complexity and iteration, not length.** A 2.5-minute explainer can cost less than a 15-second, code-heavy logo film. Public token ledgers show 95–98% cache reads.
10. **Make it reproducible and reusable.** Project files are memory (BRIEF, TREATMENT, STORYBOARD, PROGRESS, REVIEW_LOG). After a success, write `REPRODUCE.md` and a style template. New films should not read the examples folder: agents reuse characters and gags they have seen.

## 3. Routes

| Route | Technology | Good for | Watch out |
|---|---|---|---|
| R1 Code 2D (default) | One HTML file: Canvas 2D, SVG, DOM, pure `render(t)` | Lyric MV, kinetic type, explainers, UI | This repo's engine is built for it |
| R2 Code 3D | three.js, WebGL2, GLSL | Particles, maths surfaces, stylised 3D | Web 3D often disappoints; test the hardest shot first |
| R3 Blender | Python scripts or Blender MCP, `blender -b` headless | Clay, realistic 3D, fluids | First test: ask it to change one light and confirm the render changed |
| R4 Painterly | p5.js + brushes, mask reveals | Watercolour, oil, hand-drawn | Reveal complex pictures with masks, don't trace stroke by stroke |
| R5 Hybrid | Image/video models make assets; code places, moves and letters them | Character acting, realistic texture | Cost gate; never use generated frames raw |
| R6 Frameworks | Remotion, HyperFrames, Multiplane, Manim | Teams already using them | Remotion needs a company licence for some companies |

When unsure, start with R1: one HTML file, one `render(t)`.

Routes combine: most of a film can be drawn by the engine while a few shots are layers made elsewhere; timing, lettering, sound and QA stay the same (§11, Pictures from other tools).

## 4. The workflow: eight gates

```
G0 Brief → G1 Timing lock → G2 Treatment & style freeze → G3 Storyboard → G4 Sample → G5 Build → G6 Review → G7 Deliver
```

The agent can play almost every role as long as a human holds the gates; whatever passes a gate is frozen. The steps and pass conditions of every gate are in the [studio skill](../../skills/studio/SKILL.md); why each gate exists is in [03-workflow.md](../03-workflow.md).

- **G0 asks once.** Everything only you can answer goes in one message, each question with a default, including whether the film will be published. A private practice film may use any song; the rights questions apply only to a film that will be published (§13).
- **G2 invents first.** Before opening `styles/`, the case studies or anyone else's film, the agent writes ideas of its own from the brief and the material alone; references then make one idea specific rather than supply one, because agents reuse what they have seen. `TREATMENT.md` holds three genuinely different structures (A safe, B a new visual language that is never an existing style card, C a bold structure), the choice and why, and real rendered style frames.
- **Collaboration mode** (default) stops at G0, G1, G2, G3, G4 and G7. **Autonomous mode** asks once at G0 and runs to G7, but still writes every file and stops for paid generation, rights questions or a budget about to run out.
- **Done means watched:** play the final MP4 end to end with sound. You press publish.

## 5. Music and timing

`data/songmap.json` fields: `bpm`/`tempo` (with confidence, candidates, ambiguity), `beats`, `downbeats`, `beatsPerBar`, `phase`, `drift` (ms per 32 beats), `sections` (with energy and A/B/A′ labels), `stops`, `impacts`, `events` (kick, snare, hat, vocal onsets with strength), 60 fps `envelopes` (overall, low, mid, high, onset), `warnings` (each says what to do next) and `notes` (what the analyser changed so its measurements agree, such as a section boundary moved onto the bar after a stop).

The analyser (`tools/py/analyze_song.py`) needs only numpy, scipy and ffmpeg: log-band spectral flux → tempo candidates with a 120 BPM prior → dynamic-programming beat tracking snapped to onsets → downbeat phase scoring (kick on 1 and 3, snare on 2 and 4, harmonic change at bar starts) → sections from bar-level self-similarity, aligned with its own stops and big hits (a boundary one bar away moves onto them, a stop with no boundary within a bar starts a section, anything else is a SECTION MISMATCH; bars given with `--sections` stay as given, and `notes` say where the analysis on its own would put them) → events (a kick must leave 40–90 Hz behind or it is a leaking snare; on a vocal stem an onset more than 20 dB under the previous 2 s peak is a reverb tail, and strength under 0.12 is flicker) → drift warnings over 45 ms per 32 beats. It is tested against synthetic songs with known beats from `tools/py/music.py`, including a 3/4 song with a stop and stems where boundaries, kicks and vocal onsets are scored against the truth: validate a tool on ground truth before trusting it.

**Sync craft**
- The **voice is the main event**; drums only anticipate and echo. Never react to every hi-hat.
- Cut on the beat frame or one frame early; lyric appears 0.1–0.2 s before it is sung; a stroke-writing animation finishes as the syllable starts; chorus key visual on the downbeat; section changes on the musical burst, which often precedes the first lyric by about a beat.
- **Build and burst:** 2–3 s before a strong beat show only half a sentence and let the picture contract; on the beat frame complete the line, explode the picture and hit the low end, all on one frame.
- Cut density follows energy: chorus shots 0.9–2 s, verses 2.5–5 s.
- Hand-drawn layers on twos or threes; camera, light and particles stay smooth. **Brightness is a ratchet**: within a shot it only rises; it drops only at cuts.
- Choreography as a function of beat count; scheduled "fake physics" so every collision lands on a drum hit.
- Tolerances: major reveals may move up to ±0.15 s towards an accent, small entrances ±0.10 s; lock only 1–3 accents in a 15–25 s piece; never at the cost of readability.

**Never hard-code seconds.** Address time through the engine:

```js
song.T(33, 1)                       // bar 33, beat 1
at.lyric('right here')              // last beat before this line starts
at.lyric('right here', { nth: 2 })  // the second occurrence
at.afterLine('right here')          // nearest downbeat after the line ends
at.cue('glass-break')               // a human-corrected time in cues.json
```

Past the last beat `song.T` counts on with the last beat periods, so in a 16-bar song `song.T(17)` is the bar line where the music stops: a natural place for the end card. QA and the mix report measure "frames off the beat" against the same grid.

`cues.json` sources are `measured`, `analysis`, `ear` or `initial`; global `offset` and `lyricOffset` shift everything; `?lat=0.03` corrects preview latency on your machine only.

No song yet? Write the timing contract first (BPM, bars, stops, what happens on each beat) and bind music and picture to it. With narration, **the narration is the clock**: freeze the script before recording.

## 6. Lyrics

- **Official text only.** Speech recognition may time the words but never supplies them.
- **Never commit full lyrics or audio to a public repo.** Commit `lyrics.timing.json` (times, sections, keyword flags, no text); users `lyrics fill` their own text; `qa --check-lyrics` blocks commits containing runs of 4+ lyric characters or audio files.
- Three routes: **import LRC** (blank-time lines end the previous line; duplicate timestamps keep the first line and warn; missing ends = min(next start − 0.1 s, start + max(2 s, 2 × sweep time)); warnings for overlaps, lines under 0.6 s, too-wide lines, a first line within 1 s; enhanced `<mm:ss.xx>` word stamps supported), **tap by hand** in `tools/lyric-tapper.html` (offline; line or character mode; slow playback; export JSON or LRC), or **auto-align** (Demucs and faster-whisper are optional). Auto-align pitfalls: never enable VAD; watch for swallowed, repeated, zero-length or impossibly fast words; prefer a good LRC.
- Do not spread a line's time evenly over its characters. With only line times the engine estimates character weights (CJK 1, Latin letter 0.25, space 0.1, punctuation 0) and marks them `est`.
- **Character times from the vocal stem** (Chinese is mostly one character per note): `analyze --stems` writes vocal onsets with a strength, after dropping reverb or echo tails and flicker inside held notes (§5). In [examples/song-to-mv](../../examples/song-to-mv/) the 45 characters get exactly 45 onsets. Give each character the next onset, end it where the next one starts, and `lyrics import` the JSON (measured times are not marked `est`). When the counts don't match, tap that line by hand instead of forcing it.
- After aligning: `lyrics check` (reading time, overlaps, width, first line, glyphs missing from the font) and `lyrics snap` (moves line starts to nearby vocal onsets or half beats within a threshold and lists every move). A human checks the ten least certain times by ear.
- Typography: lyrics are events in the picture, not subtitles. Time unit = character, reading unit = phrase; group by meaning; measure real widths for mixed scripts; never synthesise bold or italics for CJK; vertical text rotates long marks, dashes, ellipses, tildes, brackets and quotes. Display a line at least as long as it is sung; a dim preview may lead by up to 0.4 s, but the fill must never run ahead of the voice. Bundle OFL fonts in the project and let the engine fail loudly on a missing glyph.

## 7. Story and storyboard

**Finding a conceit:** turn the whole film into one metaphor; tell the story in the medium's own grammar (a battle UI that deletes MERCY, then the buttons themselves); map lyrics to real phenomena (boot = PCB traces, chorus = real GPT-2 attention heads); use the language the audience already speaks; one line through time; big history into one turn. Capture the spirit of the song rather than illustrating every word, and get the mood right.

**Restraint and climax:** 3–5 motifs with one meaning each, at most 3 per shot; outside the climax at most one full-frame effect plus one ornament per shot; texture always on as glue; escalate section by section; at least three full pauses of 2+ bars; transitions happen inside the scene; end on an idea, not a fade. Climax: destruction and brightness peak on different frames; each keyword larger than the last; the complete image appears only on the final frame, which is **designed and approved as a still first** and held 1.2 s or more. Don't rush the ending.

**Short-form story:** one protagonist, one goal, one turn; a hook in the first 3 seconds; a bookend; the emotional peak uses a move only this medium can do; "one gag readable at thumbnail size beats three that aren't". Escalating callbacks: the hook introduces a prop, verses misuse it, it transforms on the drop, the ending pays it off.

**Lyrics to pictures:** for every line write emotion, text action, camera, and its link to the lines around it; give literal lines a screenshot-worthy picture; abstract lines get motif variations; one verb per shot; mark the keyword; write Out.

**Deconstructing a reference** (learn grammar, never copy frames): sample every ~10 s with subtitles, then densely where frame differences are largest, then where bullet comments are densest; name the techniques (guide object, nested zoom-out, cut cadence, pauses); measure stillness, cut points and easing; separate observation ("this edge moves down") from interpretation ("the card moves down" — or is it the camera?).

**Explainers** (the widest-reaching Opus genre): second-person everyday pain → one precise study with year, names and numbers → the counter-intuitive result → the complication → a line that lands on the viewer's life → dedication → honesty notes. What separates a 10× hit: a first-frame hook with a visual anchor, captions switching on bar lines with build-and-burst, a question everyone can answer in the comments, seamless transitions. **Simulate the claim:** the agent writes the simulation, saves results as JSON, the animation reads the JSON so every number on screen is real, and the description cites the paper and says it was re-run. Label analogies as analogies and state model assumptions. Ban AI copy tells ("it's not X, it's Y", stacked dashes).

## 8. Style

- Name the style and give references; adjectives alone collapse to the default look. References pull a film toward themselves too, so they come after the agent's own first ideas (§4, G2): the user's references and sources outside AI video first, other AI films only to check for repeats. Translate taste into spec: "techy" → dark background, white text, one cyan accent with a hex; "cinematic" → shot sizes, lens, light direction; "impact" → first frame shows the result, subject scales fast then stops, SFX on the stop; "premium" → whitespace, one accent, one typeface, exact tracking.
- **Style cards:** name, essence, fonts, swatches with roles and area, layout, allowed graphics, texture, **motion rules**, easily confused styles, ban list. Numbers from one creator's public cards, a starting point once a film has chosen that look: Swiss (12-column grid, two weights, black/off-white plus red `#DA291C`, flat), cassette futurism (`#74FF9A`, `#FFB23E`, monospace pixel type, step every 12 frames, no smooth easing), De Stijl (`#D0302A` `#EBC226` `#1D3F8C` `#F4F1EA`, horizontal and vertical moves only), NASA-punk (`#ECE5D6` hardware, `#4C5A68` `#7A7F4E` `#D2A85E` `#A8432F` stripes, accent `#D63A2C`), Bauhaus (`#E2412C` `#F2C230` `#2F57B0` on `#F1ECE1`).
- **This repository's six cards** ([styles/](../../styles/README.md)), each with an 8-second demo drawn in code: Swiss Kinetic, Ink and Paper, Riso Print, Paper Cutout, Pixel CRT, Blueprint. They are options, not a menu: all six are established traditions, and used as they are they make a demo of that tradition, so option B is never one of them and a film that uses one says what it adds (its own motif, material, camera or sound). What building them measured, useful for any look: file size comes almost entirely from texture that changes every frame (Riso's grain 14.6 MB vs Swiss 0.53 MB for the same 8 s at 1080p), so change texture at the medium's rate, and a pan by itself is cheap; draw type over about 250 px with `textSprite` or `studio verify` fails on GPU glyph differences; for Chinese pixel type, the smaller the text the lighter the weight (400 at 18 px, 500–700 for a 34 px title); scanlines need at least 3 output rows each or they alias into moiré (480p fails, 720p is clean); audit pixel art by rendering with the CRT off (`?crt=0`) and checking every cell is one palette colour. One film can hold several cards: [examples/song-to-mv](../../examples/song-to-mv/) plays all six in its chorus, one a bar, each demo on its own offscreen canvas and on the song's beats, with the fonts a demo uses added to the film's `studio.json`.
- `styles/<id>/STYLE.md` records only what never changes (11 sections: essence, materials and rendering, colour logic, type, motion texture, camera grammar, sound palette, native moves, medium pitfalls, engine pieces, room for variation). No story, BPM or timings.
- Colour: one accent per frame; role ladder ink → shadow → mid → accent (≤ 8% area) → hot → glow → highlight; palettes change only at cuts or motivated sweeps; **colour is state**: it changes only when something happens, and each colour keeps one meaning. One parameter (e.g. `heat` 0→1) can drive the whole grade.
- Tools by look: Canvas 2D for layered flat illustration; HTML/CSS/SVG for UI and type; rough.js for sketchy lines; p5.brush for ink and watercolour (test frame time first); WebGL shaders for per-pixel texture; three.js for 3D objects; Blender for clay, realism and fluids; Manim for derivations; a tiny integer-scaled canvas for pixel art (quantise poses to the pixel grid every frame).
- Characters: turnaround, 3–4 expressions, 2–3 key poses, swatches; describe the reference back in writing, sample its palette with code, define an identity lock, compare side by side. Plan acting beat by beat (look → reach → grab → lift → hand over → release) or characters freeze like stickers.
- Hybrid assets: video models animate **one character on green screen** (`#00B140`, locked camera, no floor, props or shadows) while code draws the world; a style-bible paragraph pasted verbatim into every image prompt; code draws all lettering; every word in a generation prompt may appear on screen; no tone words in prompts (grade in compositing); first/last-frame control for on-screen text; never use generated frames raw; keep generator watermarks and AI labels. `studio frames --key auto` keys the green screen with ffmpeg and measures the screen and the matte (§11).
- Readability: shrink to 360 px wide and check; subject at least a third of the frame; grain, vignette and low frame rates belong to a chosen look, not a universal "quality" filter.

## 9. Motion and transitions

- Every motion explains something. Direct the *change* (before, what changed, what stays), keep object identity, derive motion from relationships, one principal action at a time, no idle wobble (pause anywhere: something meaningful should be moving), and give big actions a 0.3–0.75 s comma to land.
- Curves carry weight: distance × duration × easing = perceived mass. Entrances decelerate (expo-out `cubic-bezier(.16,1,.3,1)`), exits accelerate (expo-in `cubic-bezier(.7,0,.84,0)`); a single entrance ≤ 0.8 s, exits ~75% of entrances, staggers ≤ 0.5 s in total; no bounce or elastic by default. `ease.inOut` (`0.87, 0, 0.13, 1`) is for short moves: its midpoint runs at 7.7× the average speed and the middle 20% of the time covers 69% of the distance, so a camera move of several seconds holds, whips and holds. Long camera moves take `ease.sineInOut` (1.57×) or smoothstep (1.5×), passed to `track()` explicitly because its default is `ease.inOut`.
- Closed-form springs `spring(t, {freq, damp})` need no state. Presets (ω, ζ): buttons 22–26, 0.75–0.85; cards and camera 14–16, 0.70–0.75; big type and logos 9–11, 0.85–1.0; mascots 16–20, 0.40–0.50. Retargeting sums step responses.
- Blur clears as things decelerate; resting text is always sharp; blur the moving layer, not the frame. Motion blur averages subframes and **never crosses a declared cut**.
- **Transition vector law:** same axis and direction on both sides, matched speed; cut while both sides move; on Z, push-in means both sides grow and pull-out means both shrink; one dominant direction per film; never two opposite transitions in a row; the best transition carries a concrete object across the cut. Each boundary names what survives into the next beat. **Eye trace** (Walter Murch): after a hard cut the eye is still on the last subject, so put the next subject there or lead the eye with a movement; compare the last frame before and the first frame after each cut on the `qa` transition strip.
- Proven seamless transitions: shape relay, push into a detail, guide object, nested zoom-out, 3D-to-2D registration, mouth closes to black, iris into an eye, bubble fills and pops, whip pan with speed lines, a stamp on a drum hit, match cut on a shared circle. Use 2–3 per film.
- When the camera moves to a new scale, lay that scale's content out **where the camera stops**, not on the moving camera: words laid out on a zooming lens start in one heap. Let them wait in place and let the camera zoom in under them. A mask that "rises" text must contain the whole glyph: big numerals stand taller than their grid cell.
- Camera: at least four distinct moves plus real shot-size changes; one world-to-screen function for everything that follows a subject; hand-drawn layers may step but camera and light are smooth. Parallax depths 0.02–0.06 (far) to 1.2–1.5 (blurred foreground); seeded handheld 2–4 px calm, 8–13 px panic; beat zoom 0.8–3%.
- Kinetic type by purpose: introduce, change one word (mask-roll only the changing word), select a concept, turn an idea into action, resolve. Group Chinese by meaning and keep numbers with units.
- Checking motion: test the most important move first, one variable at a time; simplify actions first, curves and edit second, decoration last; frame-step the fastest action; any line jumping more than 12 px in one frame is a pop.

## 10. Sound

- Music: a private practice film may use any song; a published film needs the rights in §13. Code-synthesised music is rights-clean but drifts into the FM cliché unless you name a genre and instruments.
- Every added sound needs a reason; SFX belong to events; at least two real silences before a climax; the first sound after a silence matters most; sound can lead or trail a cut.
- **Landmark sync:** `sfx_start + landmark_offset = shot_start + action_time`. Landmarks: onset for clicks and impacts, peak for whooshes and hits, **end** for risers and reverse cymbals. `tools/py/sfx.py` ships every sound with its landmark and `mix.py` subtracts it.
- Debounce frequent SFX (≥ 0.09 s); trigger on crossing (prev < T ≤ current); voice a staggered row only on its first, last and strongest element.
- **Ducking by role**, deepest wins when overlapping (not summed): clicks 3–3.5 dB, typing 2.5 dB, transitions 4 dB, completions 5–6 dB, brand end 5 dB. Narration sits about 10 dB above music.
- Loudness: −14 LUFS integrated, true peak ≤ −1 dBTP measured after AAC encoding, two-pass `loudnorm`; the biggest story moment is the loudest; keep stereo mono-compatible (correlation ≥ 0.3).
- **Without ears:** loudness report, waveform image, spectrogram, an SFX table with frame offsets to actions and beats (report, don't silently move), and a cross-correlation check of the final audio against the source. Ask an audio-capable model to listen, and write an honest handoff: what was checked, what nobody has heard, where it might sound stiff. The last step is always a human with headphones.
- Narration: choose the TTS explicitly (the default free voice sounds robotic); stable timbre, commercial licence, word timestamps; freeze the script first; write numbers as words for TTS and as digits in captions; voice clones need consent.

## 11. Rendering and delivery

**Determinism:** no `Math.random()` (use seeded `rng`/`hash`), no `Date.now()`, no timers or rAF-driven animation, no CSS transitions or keyframes, no state carried between frames (closed forms, fixed-step from 0 to t, or pre-baked), every font, image and data file loaded before `ready` from the project folder, and per-frame grain seeded by frame index. `studio lint` scans for violations with file and line; `studio verify` renders the same times twice, in a different order, in a fresh browser, and compares pixels.

Also: size canvases at the true output resolution; WebGL with `preserveDrawingBuffer: true` and `gl.finish()` before capture; an opaque stage background (transparent sums flash white); no `will-change` on scaling text; a temporal-dead-zone error leaves `ready` false forever.

**Page contract** (compatible with Multiplane):

```js
window.SHOT = {
  width: 1920, height: 1080, fps: 60,
  duration: 222.4,          // seconds
  ready: Promise,           // resolves when fonts, images and data are loaded
  render(t) { ... },        // synchronous, pure
  renderAsync(t) { ... },   // the same, after the frame-sequence images this frame uses load
  cuts: [12.5, 30.1],       // hard cuts: motion blur never crosses them
  meta: { title, song }
};
```

The renderer also accepts `window.renderFrame(t)` + `window.ready`, `window.render(t)` + `window.DUR` + `window.READY`, `window.seek(t)` and `window.renderAt(t)`. A renderer that only calls `render(t)` gets an error for a frame-sequence image that has not loaded, never a frame missing its layer.

**Preview** with `node tools/studio.mjs serve projects/my-mv`, on the audio clock; press `?` for the keys and URL parameters (`?t=83.5` starts at a time, `?w=1080&h=1920` previews another size; all of them are in the [command table](../../skills/studio/references/commands.md)).

**Render**

```
node tools/studio.mjs render projects/my-mv                          # full film
node tools/studio.mjs render projects/my-mv --from 30 --to 45 --preview
node tools/studio.mjs render projects/my-mv --blur 8 --shutter 0.5   # motion blur
node tools/studio.mjs stills projects/my-mv --at 0,12.5,48.2
node tools/studio.mjs sheet  projects/my-mv --every 1.5
```

`tools/render.mjs` has no npm dependencies: it drives local Chrome or Edge over the DevTools Protocol, splits the film into contiguous segments across workers, pipes frames into ffmpeg, concatenates without re-encoding and resumes finished segments. It prints the actual GPU renderer and **stops on software rendering** (SwiftShader, WARP, llvmpipe) unless you pass `--allow-software`; try `--headful` if headless gets no GPU.

**Encoding:** x264 master `-preset slow -crf 16 -tune film`; NVENC master `-preset p7 -tune hq -rc vbr -cq 16 -b:v 0 -spatial-aq 1 -temporal-aq 1`; share `-crf 19`; preview (`render --preview`) half resolution, `-preset veryfast -crf 23`, with a timecode burned in so reviewers can say which second. Always convert to **BT.709** (`scale=out_color_matrix=bt709:out_range=tv` plus colour tags), keyframes every 2 × fps, AAC 320k at 48 kHz, `apad` + `-t` instead of `-shortest`, and `+faststart`.

**Delivery:** `node tools/studio.mjs deliver <project>` subsets fonts, checks lyrics, mixes, renders, runs QA, exports subtitles and a poster (the frame at `posterAt`), and writes `out/DELIVERY.md`: the files, a before-you-publish checklist, what was **not** verified (listening, meaning) and the hashes and versions needed to reproduce. The first frame is what players and feeds show: never black and never one flat colour. Songs often have half a second of count-in before beat one; put the title page there and cut to the film on the first downbeat.

**Vertical cuts are re-layouts, not crops:** lay out against `film.width`/`film.height`, frame automatically around registered focus points, or recomposite (blurred ambience, a central band, lyrics re-set for 9:16). Keep the bottom ~20% and the right-hand button column clear.

**Pictures from other tools.** Decide per shot at G2: the engine (default), a layer from another tool, or the whole film elsewhere; put the riskiest outside shot in the G4 sample. Nothing is wrapped (no `studio blender`, no `studio comfy`): each tool is used through its own command line, MCP server, API or window, where its own errors are visible, and the agent asks before starting, installing or paying for anything.

- `studio frames <dir> <clip>` turns a video or numbered images (Blender's output) into a frame sequence that a shot draws by time with `api.loadFrames()` (engine README, Frame sequences); a video keeps its own rate. `SHOT.renderAsync(t)` waits for the images each frame uses, so frames still render in any order and `verify` holds. Flags and outputs are in the [command table](../../skills/studio/references/commands.md).
- `--key` keys a green or blue screen with ffmpeg's `chromakey` and `despill`; this repo only measures: the screen colour and its spread before, the matte after, and `qa/frames_<name>.png` shows source, keyed frame and matte, so look at it. On a synthetic green screen the self-test measures an IoU of 0.974 and a mean alpha error of 0.005; filmed footage is harder. Fix the footage before the numbers; hair, smoke and glass need real transparency (Blender: Film → Transparent).
- `studio timing <dir>` writes sections, bars, beats, lines, cues and shots in film seconds and frame numbers counted by the project's engine: the length of a generated clip, Blender markers (script in [10-render.md](../10-render.md#時間表studio-timing)), a Remotion composition at the same `fps`.
- A whole film made elsewhere comes back for `studio mix <dir> --video F` (cues in `data/sfx.json`, `t` in seconds of that video; length and rate from the video), an ffmpeg mux of `audio/mix.wav` (as long as the video, so no `-shortest`), and `studio qa <dir> --video F`, which detects cuts from the pictures when there is no render manifest.

## 12. Review

**Evidence ladder**, cheapest first: numbers (`qa`), stills, contact sheets, transition strips (10 fps around every cut), frame strips around the fastest motion, a low-quality preview, the final MP4 with sound. Sampling only proves what is at the sampled times. In [examples/song-to-mv](../../examples/song-to-mv/REVIEW_LOG.md) a one-second contact sheet looked clean; the transition strips caught two frames where lyric characters piled up during a camera move, and full-resolution stills caught a numeral clipped at the top, too small to see on the sheet.

**`studio qa`** checks: flashes (≤ 3 large-area luminance reversals per second, red flashes counted separately: an approximation of WCAG 2.3.1), unintended black or white frames, brightness drops inside a shot, loudness and true peak, audio offset against the source, how far cuts and SFX sit from beats, storyboard coverage and Outs, lyric reading time and repository hygiene, spec, contact sheets labelled with time and lyric, waveform and spectrogram. Use a professional photosensitivity analyser for broadcast or commercial release. QA decides "inside a shot" from the shot boundaries: when one shot holds several looks (a chorus that changes style every bar), split it into a shot per look with cuts on the bar lines, and record deliberate exceptions (a red flood) as accepted in REVIEW_LOG.

**Photosensitivity:** ≤ 3 large flashes per second (cuts count; so do high-contrast patterns sweeping a point); around 130 BPM eighth-note flashing is too fast; no saturated red full-frame flashes; strobing elements < 10% of the frame, fast stripes or spirals < 25%; luminance jumps between fast cuts < 50%; **one owner for full-frame white flashes**; measure per section while building. Warn with time ranges in the title, description and opening.

**Independent jury:** never let the maker grade itself. `agents/studio-jury.md` scores seven axes (concept & narrative, audio-visual sync, motion craft, composition & typography, style & finish, sound, technical) against anchors from 5 (student work) through 6 (template), 7 (solid professional), 8 (high-end agency), 9 (award shortlist) to 10 (best in the world). "Most first versions deserve 5–7." The default bar is **≥ 8 on every axis** (7.5 for practice pieces). What the jury looks at, its report and its fatal flaws are in that file.

**Giving feedback** (five methods from a 38-message UI recreation): state the standard, not the method; describe what you see and correct a wrong diagnosis immediately; draw it and cite frame numbers; freeze a direction and tag a baseline; build a comparison page when you can't see a difference and roll back when it's worse. Also say what you don't want, and give quantities instead of "a bit higher".

**Honest delivery report:** what was made, how it was verified, what was not verified (especially sound), known rough spots, how to extend it.

## 13. Rights (not legal advice)

Only for a film that will be published. A private practice film may use any song, kept in `projects/` and out of version control.

- Songs: yours or commissioned is safest; read and follow published fan-work guidelines (e.g. Mili's official copyright guidelines: personal, non-commercial, label AI content); character licences such as the Piapro Character License; no unlicensed commercial songs; check AI-music terms (Content ID claims are possible); licensed libraries only when they allow sync; a public-domain composition does not make a recording public domain.
- Never use official PV/MV footage, artists' clips, untraceable meme music or anything you cannot license.
- Characters: follow the original's rules; CC BY-NC-SA assets make the parts that use them share-alike and non-commercial. A recognisable person drawn as line art is still a likeness. Voice clones need consent. Use fictional brands unless you own the rights.
- Fonts under open licences (SIL OFL), bundled and credited. Open code is not automatically free for commercial use (Remotion, GSAP and others have terms). MIT/Apache/ISC code may be adapted with notices; AGPL, non-commercial and unlicensed code is ideas-only.
- Keep generator watermarks; label AI-generated content from the start (mainland China's labelling rules took effect in September 2025; platforms have AI-content fields).
- Facts in explainers each need a source; numbers on screen should come from real computation, with scope and assumptions stated.
- Repost only with permission and attribution.
- Use the description templates in [13-rights.md](../13-rights.md) and the project's `CREDITS.md`, and press publish yourself.

## 14. Cost and time

Official API prices per million tokens (October 2026): **Opus 5.5** input $4, output $20, cache read $0.20, cache write $5 (5 min) / $8 (1 h). Sonnet 5.5 $2 / $10; Haiku 5.5 $0.10 / $0.50; Fable 5.1 $10 / $50. Opus 5.5 has a 1M context and 128K output; effort levels are low, medium (default), high, xhigh and max; thinking cannot be switched off. "ultracode" is a community label, not an official effort level.

Public ledgers are dominated by cache reads (95–98%). Estimate: `cost ≈ cache_read × 0.20 + cache_write × 5 (or 8) + output × 20 + uncached_input × 4` (per MTok). A 3:37 4K60 MV with 87 shots: ~1.01B tokens ≈ $508 at list price (about 4 cents a frame). A 46-minute explainer: ~3.89B tokens ≈ $2,000 at list price, ~90 h of agent time and ~20 h of the author's.

| Kind | Length | Time | Order of magnitude |
|---|---|---|---|
| Short explainer, kinetic type | 15–30 s | 1–2 h | tens of millions of tokens |
| Knowledge short | 1.5–3 min | 2–5 h | 50–200M tokens |
| Full lyric MV (polished) | 3–4 min | 10–50 h | 0.2–1.5B tokens |
| Long-form | 45 min | ~90 h agent time | ~4B tokens |

What drives cost: precision (not length), code complexity, abandoned directions (one creator burned 1.55B tokens mostly on discarded ideas), review renders, context length, parallel subagents and effort. Save by deciding direction early (three options, style frames, a sample), exploring at medium or high and producing at xhigh, previewing at low resolution without blur, re-rendering only changed segments, running lean fix rounds, and building your own motion library. Publishing your token, cache and time numbers earns trust.

## 15. Common failures

The symptom → cause → fix tables, with sources, are in [16-pitfalls.md](../16-pitfalls.md) (Traditional Chinese); most of the fixes are stated in §5–§12 above.

## 16. Prompts

There are no magic words. What works: **assets** (song, official lyrics, references, prior work), a **stated quality bar** ("award-level, high-end commercial" moves the target from about 6 to 8–9), **gates** (plan and stills before motion), and a **ban list**. This repo's seven-part director brief: role and standard; assets; direction; structure; production rules; checks and delivery; how to start. Templates live in [`prompts/en/`](../../prompts/en/) (lyric MV, kinetic type, explainer, character short, launch film, hybrid MV, pixel loop, revisions).

Short phrases that recur in well-favourited work: "ask me the 4 decisive questions before you start"; "show me five key frames before the full film"; "make the key object of the previous step the start of the next"; "tell the story in pictures, not text cards"; "review it yourself and fix the problems before giving it to me"; "don't use existing skills or look at earlier videos".

Prompt traps: handoff documents written by a weaker model constrain Opus; vague words get read literally ("90s cartoon" became a 1990s cartoon); a too-simple prompt lets the second half slide into slides; a cluttered folder steers the agent.

## 17. Ecosystem (October 2026 snapshot)

Star counts change; always read each project's current licence. "Ideas only" means the licence does not allow (or does not say it allows) copying code or text into an MIT project.

| Kind | Projects |
|---|---|
| Generation | [ComfyUI](https://github.com/Comfy-Org/ComfyUI) (GPL-3.0; node-based image and video generation on a local GPU with an [HTTP API](https://docs.comfy.org/development/comfyui-server/comms_routes); `doctor` sees a running server, nothing here starts or wraps it; model licences vary, some non-commercial) |
| Renderers and frameworks | [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0, HTML → video for agents), [Remotion](https://www.remotion.dev/) (React; company licence for some), [Multiplane](https://github.com/LBEILC/Multiplane) (Apache-2.0; renders `window.SHOT` pages with adaptive motion blur and verification: this repo's page contract is compatible), [papermotion](https://github.com/francozanardi/papermotion) (MIT; "a template, not a library"), Manim, Blender with [blender-mcp](https://github.com/ahujasid/blender-mcp) (set `DISABLE_TELEMETRY=true`) |
| MV pipelines | [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (lyric-addressed timeline), [Nyankomintsu](https://github.com/Nyankomintsu/world-execute-me-lyric-mv) (timing without lyrics, flash budget, visual regression), [EGSECDA](https://github.com/EGSECDA/vocaloid-style-mv-pipeline) (render contract, BT.709, vertical re-layout), [paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) (ambiguity reports, LRC rules), [painted-rickroll](https://github.com/petergpt/painted-rickroll) (choreography as a function of beat count), [Pdoom anime](https://github.com/2606156052/Pdoom-video-anime-version) (ISC), [makevoid](https://github.com/makevoid/motion-graphics-music-video-skill) (paid-generation discipline; ideas only here); ideas only: PDoomVideo, bad-time-mv, netsu-ijou-pv, Battle-of-Austerlitz, world-execute-web (AGPL), guizang (AGPL) |
| Style libraries | [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (59 styles), [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15), this repo's `styles/` |
| Skills | [brag](https://github.com/latent-spaces/brag), [xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video); ideas only: onetake (PolyForm NC), hypit (conditional Apache), opus-video-studio skills, OpenMontage (AGPL) |
| Case lists | [athemeroy](https://github.com/athemeroy/awesome-claude-5-5-videos) (CC BY 4.0, 168 curated), [Li-Evan](https://github.com/Li-Evan/awesome-opus-5.5-video-prompts) (CC BY 4.0, 334 with prompts, time and cost), [yihui-dev](https://github.com/yihui-dev/awesome-opus5-5-videos) (703), [billyhetech](https://github.com/billyhetech/awesome-opus5-5-videos) (2,542), [awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) (CC0) |
| Audio and lyrics | ffmpeg (required), Demucs and faster-whisper (optional; never VAD), CC0 sample instruments such as VCSL, Kenney SFX |
| Narration | edge-tts (free, robotic), Kokoro, Gemini TTS, MiniMax, ElevenLabs, CosyVoice, Qwen3-TTS; compare on the Artificial Analysis TTS leaderboard |

**Why this repo exists:** music-video tooling is the thinnest part of the ecosystem. Nothing else is MIT-licensed, Chinese-first and complete from beat and lyric tools through QA to a one-command plugin. Claude Studio aims to fill that gap with trustworthy timing, reproducible pictures, checkable quality, CJK typography, and honest rights handling.

## 18. Sources and corrections

Every work, repository and document behind this playbook is listed with links, play and favourite counts, and how this repo uses it (adapted with credit, ideas only, or link only) in [18-sources.md](../18-sources.md). Code adapted from MIT, ISC and Apache-2.0 projects is credited in [`CREDITS.md`](../../CREDITS.md). Other people's prompts are linked and summarised, never reproduced in full.

If you made one of these works and want a correction, a different credit or removal, open an issue and it will be handled promptly.

---

The Traditional Chinese chapters go deeper on every section: [01 overview](../01-overview.md) · [02 setup](../02-setup.md) · [03 workflow](../03-workflow.md) · [04 music and timing](../04-music-timing.md) · [05 lyrics](../05-lyrics.md) · [06 storyboard](../06-storyboard.md) · [07 style](../07-style.md) · [08 motion](../08-motion.md) · [09 sound](../09-sound.md) · [10 render](../10-render.md) · [11 review](../11-review.md) · [12 prompts](../12-prompts.md) · [13 rights](../13-rights.md) · [14 cost](../14-cost.md) · [15 cases](../15-cases.md) · [16 pitfalls](../16-pitfalls.md) · [17 ecosystem](../17-ecosystem.md) · [18 sources](../18-sources.md)
