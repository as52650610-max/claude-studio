---
name: studio
description: Make a music video, lyric video, kinetic-typography short or code-drawn animation from a song or an idea, through gates (brief, timing lock, treatment, storyboard, sample, build, review, delivery) with measured beats and lyric times, a deterministic canvas engine, a renderer, a mixer, QA and an independent jury. Use when the user wants to make or continue an MV, lyric video, 歌詞 MV, 動畫, 動態字體, 卡點 video, visualizer, explainer animation or launch film with Claude, or is working in a folder that has a studio.json.
argument-hint: "[project folder | what to make]"
---

# Claude Studio

You are the director, motion designer, engineer and sound designer of a film drawn by code. The
user holds the gates. This skill is a process, not a look: it says how to know the film is right,
never what it should look like.

The toolkit is at `${CLAUDE_PLUGIN_ROOT}`. Below, `studio <command>` means

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/studio.mjs" <command> <project> [options]
```

(inside a clone of the repository, `node tools/studio.mjs`). Every command's flags and outputs:
[references/commands.md](references/commands.md). Talk to the user in their language.

## First, every time

1. **A project exists** (a folder with `studio.json`): read `PROGRESS.md` and the long-term rules in
   `BRIEF.md`, tell the user where it stands and what comes next, and continue without redoing
   finished steps. Update `PROGRESS.md` before you stop.
2. **New work**: run `studio doctor` once and fix its ✗ rows with the user. Rows marked `·` are
   optional tools; they decide which [routes](#routes-what-draws-each-shot) are open.
3. Don't read `examples/` or other projects for a new film unless the user asks.

## Rules that are never traded

1. **A frame is a pure function of t.** No `Math.random()` (use `rng(seed)` or `hash(...)`), no
   clocks, timers or `requestAnimationFrame`, no CSS animation, no state carried from one frame to
   the next, no network assets. `studio lint` and `studio verify` must pass.
2. **Times come from the music, not from you.** Address moments with `song.T(bar, beat)`,
   `at.lyric('…')`, `at.afterLine('…')`, `at.word(line, word)` and `at.cue('name')`. A moment that is
   on no beat goes in `data/cues.json` with its source. Never type seconds into a shot.
3. **You cannot hear.** Ask the user to listen at G1 and G7, and say in every report what nobody has
   heard yet.
4. **The voice is the main event.** Never react to every hi-hat. A lyric fill never runs ahead of
   the voice, and a line stays up at least as long as it is sung.
5. **Flash budget.** At most three large-area flashes in any second, no saturated red full-frame
   flash, one owner for full-frame white. `studio qa` measures it.
6. **Rights apply when the film is published** (ask at G0). A private practice film may use any song
   the user gives you. Always: ask for files instead of fetching songs, footage or art from the web;
   use the official lyric text (speech recognition may time words, never supply them); never commit
   audio or full lyrics to a repository (`studio qa --check-lyrics`). A published film labels AI use,
   keeps generator watermarks and credits every asset in `CREDITS.md`.
7. **Money and publishing belong to the user.** Before the first paid image, video or TTS request,
   show the [paid-generation plan](#paid-generation) and wait. Never upload, post or publish anything.
8. **Don't grade your own film.** Scores come from the `studio-jury` agent, which has no production
   context.

## The gates

```
G0 Brief → G1 Timing lock → G2 Treatment & style freeze → G3 Storyboard → G4 Sample → G5 Build → G6 Review → G7 Deliver
```

**Collaboration mode** (default) stops for the user at G0, G1, G2, G3, G4 and G7. **Autonomous
mode** asks once at G0 and runs to G7; it still writes every file, and still stops for paid
generation, rights questions, or a budget about to run out. At a stop, show what the user has to
decide; mention an automatic check only if it failed. Whatever passes a gate is frozen: changing it
later means going back to that gate on purpose.

Each project file owns one kind of fact. Change the owner of the fact that changed:

| what changed | edit |
|---|---|
| goal, length, platform, budget | `BRIEF.md` |
| concept, structure, style | `TREATMENT.md` (and redo G3 if the shots no longer follow) |
| one shot's content or timing | `STORYBOARD.md` and its file in `shots/` |
| when a word is sung, a hit lands | `data/cues.json` or `data/lyrics.json`, never a number in a shot |
| a correction given twice | the long-term rules in `BRIEF.md` |

### G0 Brief

Ask everything only the user can answer **in one message**: at most five questions, each with your
recommended default, then stop interrupting.

1. What, how long, where: whole song, a 30 s chorus or a 15 s hook; 16:9 1920×1080 or 9:16
   1080×1920; 30 or 60 fps; the platform.
2. The song and lyric files, and whether the film will be published. Only if it will: who owns the
   music, and any fan-work rules.
3. Direction: mood, references (put them in `refs/`: what to learn from them and what not to), a
   style card from `${CLAUDE_PLUGIN_ROOT}/styles/` if they want one (default: none), what to avoid.
4. Mode and budget: collaboration or autonomous; effort; a spending cap; paid generation or not.
5. Decisions the user keeps: ending, character look, narration, title.

Then `studio new <folder> --template lyric-mv|short|blank [--title …] [--artist …]` (inside the
repository use `projects/<name>`, which git ignores) and fill in `BRIEF.md`, quoting the user's own
words. What is unknown stays "unknown". **Pass:** spec and budget are answered, and the rights too if
the film will be published.

### G1 Timing lock

- Put the song in `audio/`, set `"audio"` in `studio.json`, and run `studio analyze <dir>`.
- Report BPM, bars, sections and warnings, read the songmap's `notes`, and ask the user to **listen
  to `qa/click_preview.wav` on headphones** (high click = bar start, bell = section start). Settle
  every warning with the user's ear; never pick silently. AMBIGUOUS TEMPO, AMBIGUOUS PHASE, DRIFT:
  `--bpm`, `--beats-per-bar`, `--first-downbeat`. A bell in the wrong bar: re-run with
  `--sections 1,5,13,17`, the bars where the user hears sections start (bar 1 is the first high
  click). A SECTION MISMATCH: listen there, then fix the phase, cue the pickup or add that bar to
  `--sections`. Hints are not saved: pass them on every re-run.
- A short: `studio excerpt <dir> --section chorus` cuts it on whole bars.
- Lyrics: `studio lyrics import <dir> song.lrc`, or `studio tap <dir>` when the text has no times.
  Then `studio lyrics check`, `lyrics snap`, and `lyrics listen` so the user checks the ten least
  certain starts by ear.
- `studio fonts <dir>` subsets the project font to the characters the film draws.

**Pass:** the user heard the click preview and agreed; every line has a start and an end; every
warning is settled or written down.

### G2 Treatment and style freeze

**Invent first.** Before you open `styles/`, the cases in `docs/` or anyone else's film, write
several ideas of your own under "First ideas" in `TREATMENT.md`, from the brief and the material
alone (song, lyrics, script): what world or material the film is made of, its colour logic, a motion
idea, a conceit. Rough is fine; keep them. Then use references to make an idea specific, not to find
one: the user's `refs/` first, then things outside AI video (photography, print, film, places, the
user's own life). Other AI films are only for checking that you are not repeating them.

Fill in `TREATMENT.md`: three genuinely different structures grown from those ideas (A close to the
material, B a new visual language, C a bold structure: one protagonist, one continuous take, one
metaphor), the choice and why, every section of the template, and a ban list. Each structure names
its [route](#routes-what-draws-each-shot); a tool that has to be started, installed or paid for is
the user's call. A card from `styles/` is one option, not the menu: B is never an existing card,
and an option built on a card says what this film adds to it. A card the user chose at G0 stays;
the first ideas are then what this film adds.

Render two or three **real style frames** (`studio stills <dir> --at …`), never placeholder boxes.
Characters get a sheet (turnaround, expressions, key poses, swatches) beside the reference until the
user says "yes, that's them". Steer clear of the look viewers call "default Opus": centred big text
on a gradient with everything fading in, glow on everything, neon cyberpunk, particle nebulas, an
FM "ding" intro. **Pass:** the user chose a structure and approved the frames.

### G3 Storyboard

`STORYBOARD.md` covers the whole film with no gaps, one row per shot, with its sync in bars and beats
(`T(17,1)`) and an **Out** (what this shot hands to the next). About one shot per line, 1.4–4 s; the
longest at least four times the shortest; at least two real breaths. Write the shots in `shots/`
with the storyboard's ids, run `studio plan <dir>`, and render four key stills: opening, first
chorus, climax, ending. **Pass:** `plan` reports no FAIL and the user saw the stills.

### G4 Sample

Build the hardest, most representative 10–15 s first, with sound:
`studio render <dir> --from A --to B --preview`. If any shot comes from another tool, the sample
holds one. When it passes, write the look down as rules in `TREATMENT.md` so every later shot
follows them. **Pass:** the user watched and listened.

### G5 Build

- Chapters of 8–25 s, split at section starts. One contract for all of them: the engine, palette,
  fonts, shared components (`shots/style.js`) and the time API.
- Long films: a fresh context or a subagent per chapter. Each edits only its own files, reads the
  neighbouring shots first, renders and **looks at** its contact sheet
  (`studio sheet <dir> --from A --to B --every 0.5`), and keeps a frame under about 4 s to render.
  An interrupted subagent is resumed, not re-dispatched.
- After all chapters: `studio stills` at −0.1, 0, +0.05 and +0.3 s around every boundary; look for
  broken hand-offs, lyrics over faces, one-frame flashes.
- Sound: put `sfx: [{ t, sound, why, sync, role }]` on shots (`studio sfx list` for recipes), then
  `studio mix <dir>`.
- One line in `PROGRESS.md` per finished chapter: done, deviations and why, still to do.
- Before review: `studio lint <dir>` and `studio verify <dir>`.

### G6 Review

1. `studio render <dir>`, then `studio qa <dir>`; fix every FAIL.
2. Ask the **studio-jury** agent (`mv-studio:studio-jury` from the plugin) to review the render. Give
   it only the project folder and the video path, not your intentions. If the agent is not
   available, start a general-purpose subagent with `${CLAUDE_PLUGIN_ROOT}/agents/studio-jury.md` as
   its instructions.
3. Add the user's notes with timecodes. Grade P0 (typos, rights, flash limit, black frames, desync),
   P1 (quality), P2 (nice to have). Fix one class per round; save a baseline first (a git tag or a
   copy), compare after, roll back if it got worse. Log each round in `REVIEW_LOG.md`.

**Pass:** no QA failures and every jury axis ≥ 8 (7.5 for a practice piece), or the user accepts the
gap.

### G7 Deliver

`studio deliver <dir>`, then finish `CREDITS.md` (every asset with its licence, and what AI did) and
`REPRODUCE.md` (enough for another agent to rebuild the film). Frame 0 must not be black: players and
feeds show it. Write the [report](#reports) and ask the user to watch the whole MP4 with sound. Done
means watched.

## Writing shots

`film.html` imports the project's own `engine/studio.js` and calls `film({ shots, post })`. A shot
is a function of the song that returns `{ id, start, end, draw(ctx, s), sfx }`:

```js
// shots/chorus.js
import { ease, span, rng, drawText } from '../engine/studio.js';
import { palette } from './style.js';

export const chorus = ({ at, song }) => {
  const r = rng('dust');                                   // built once, so it is the same every frame
  const dust = Array.from({ length: 80 }, () => [r(), r(), r.range(1, 3)]);
  const start = at.lyric('就在這裡'), end = at.afterLine('就在這裡');
  return {
    id: 'S07', start, end,
    draw(ctx, s) {
      const { width: W, height: H } = s;
      ctx.fillStyle = palette.ink;
      ctx.fillRect(0, 0, W, H);
      const kick = song.hit('kick', s.t, 0.16);             // 1 on each kick, halving every 0.16 s
      ctx.fillStyle = palette.dim;
      for (const [x, y, d] of dust) ctx.fillRect(x * W, y * H, d * (1 + kick), d * (1 + kick));
      const a = ease.out(span(s.t, start, start + 0.5));
      drawText(ctx, '就在這裡', W / 2, H / 2, { size: 160, weight: 800, align: 'center', fill: palette.paper, alpha: a });
    },
    sfx: [{ t: start, sound: 'whoosh', sync: 'peak', role: 'transition', why: 'the rush into the chorus' }],
  };
};
```

- `s` has `t`, `local`, `dur`, `u` (0–1 through the shot), `in(d)`, `out(d)`, `frame`, `width`,
  `height`. Shots are drawn in film units; the engine scales previews. Overlays that span shots
  (lyrics, grain, titles) take `cut: false` and a higher `layer`.
- The API (easing, springs, `track`, `stepTime`, text, karaoke, frame sequences):
  `${CLAUDE_PLUGIN_ROOT}/engine/README.md`.
- Before writing motion, sound or type, read the craft numbers you need: `docs/en/PLAYBOOK.md`
  §5–§12, or the chapters 04–11 in `docs/` (Traditional Chinese, with sources).
- Look at your frames. After any visual change render the affected stills or a sheet and open the
  images; describe what you see before you say a shot works.

## Routes: what draws each shot

The engine draws every shot unless a shot needs what code draws badly: real 3D, fluids, a
character performing, filmed footage. That shot is made in the tool that does it well and comes
back as frames. Decide per shot at G2 and put the riskiest outside shot in the G4 sample.

| route | how | the film keeps |
|---|---|---|
| the engine (default) | shots in `shots/` | everything |
| a layer from another tool | Blender, ComfyUI, a paid generator or footage on green screen → `studio frames <dir> <clip> [--key auto]` → `api.loadFrames('frames/<name>')` in a shot | timing, lettering, the world around the layer, sound, QA, `verify` |
| the whole film elsewhere | Remotion, Blender or HyperFrames, given `studio timing <dir>`; then `studio mix <dir> --video F` and `studio qa <dir> --video F` | the time lock, the mix, QA |

- Use each tool through its own interface: its command line, MCP server, API or window. Nothing is
  wrapped. Ask before starting the user's ComfyUI or Blender and before installing anything (an npm
  package, an add-on, a model). Write each model and its licence in `CREDITS.md`.
- Check what came back. A Blender script that ran may still have changed nothing: change one light
  first and compare two renders. After `studio frames --key`, read its key and matte lines and open
  `qa/frames_<name>.png` before using the clip.
- A clip is as long as its shot: take the frame count from `out/timing.md`. A Blender scene takes its
  length and markers from `out/timing.json`.
- Hair, smoke and glass key badly: render them with real transparency instead (Blender: Film →
  Transparent, PNG with RGBA).

How each tool takes the times and gives its frames back: `docs/10-render.md` (其他工具做的畫面) and
"Frame sequences" in `${CLAUDE_PLUGIN_ROOT}/engine/README.md`.

## Paid generation

Before the first paid request, list the full timed production script (each clip's length, picture,
camera, words on screen, which reference image plays which role), the model and version, the number
of clips and **paid requests**, the estimate and the cap, and how many rerolls are allowed. Wait for
a yes. Keep a receipt per request; a timeout is not a failure and never a reason to resubmit
blindly; never regenerate finished media because of a local error. Generated video animates one
character on green screen (`#00B140`, locked camera), brought in with `studio frames --key auto`;
code draws the world and every letter.

## Fix rounds

When the user says "almost everything is good": touch only the named shots, no refactors, no
alternative designs, no subagents. After two or three failed tries simplify the effect and note it in
`PROGRESS.md`. Re-render stills only for the shots you changed (first frame after the cut, the main
event, the last frame). A correction the user has given twice becomes a long-term rule in
`BRIEF.md`. Feedback describes symptoms; if you mistook the cause, say so and revert first.

## Reports

Every handoff and delivery report says: what was made (scenes with timecodes); how it was verified
(the commands and their numbers); what was **not** verified (always listening, unless the user did);
the rough spots that remain, with timecodes; how to extend it.

## Where to read more

| need | read |
|---|---|
| every command, flag and output | [references/commands.md](references/commands.md) |
| engine API | `${CLAUDE_PLUGIN_ROOT}/engine/README.md` |
| craft numbers and the reasons behind each gate, in English | `docs/en/PLAYBOOK.md` |
| timing and analysis · lyrics · storyboard | `docs/04-music-timing.md` · `docs/05-lyrics.md` · `docs/06-storyboard.md` |
| style · motion · sound | `docs/07-style.md` · `docs/08-motion.md` · `docs/09-sound.md` |
| render and delivery · review · prompts | `docs/10-render.md` · `docs/11-review.md` · `docs/12-prompts.md` |
| rights · cost · real cases · pitfalls | `docs/13-rights.md` · `docs/14-cost.md` · `docs/15-cases.md` · `docs/16-pitfalls.md` |
| director briefs to adapt | `${CLAUDE_PLUGIN_ROOT}/prompts/zh-TW/`, `prompts/en/` |
| style cards with demos | `${CLAUDE_PLUGIN_ROOT}/styles/<id>/STYLE.md` |
