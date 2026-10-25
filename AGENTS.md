# AGENTS.md

Instructions for coding agents working in this repository (Claude Code reads this file when there
is no CLAUDE.md; other agents read it too). The user-facing guide is [README.md](README.md).

claude-studio is a toolkit and a knowledge base for making music videos and animations with
Claude: a gated workflow, beat and lyric timing, a deterministic canvas engine, a renderer, a mixer,
QA and an independent jury. The knowledge base is Traditional Chinese (`docs/`), condensed in
English in `docs/en/PLAYBOOK.md`.

## Making a film here

- Follow the `studio` skill: [skills/studio/SKILL.md](skills/studio/SKILL.md). When this folder is
  loaded as a plugin it is `/mv-studio:studio`, and the jury is the `mv-studio:studio-jury` agent.
  To load it from a clone: `claude --plugin-dir .`, or in Claude Code
  `/plugin marketplace add ./` then `/plugin install mv-studio@claude-studio`.
- The command line is `node tools/studio.mjs <command> <project>` (no npm install needed).
- Films live in `projects/<name>/`. Git ignores that folder: it holds songs, lyrics and renders the
  user may not have the right to publish. Never move a film's audio or full lyrics into tracked
  folders.
- Don't read `examples/` or other projects for a new film unless the user asks: agents copy
  characters, gags and layouts they have seen.
- Never publish, upload or push anything without the user's explicit yes.

## Changing the toolkit

| task | command |
|---|---|
| all tests (Node unit tests + Python self-tests) | `npm test` |
| one group | `node tests/run.mjs <filter>` (e.g. `engine`, `cli`, `python`) |
| environment check | `node tools/studio.mjs doctor` |
| render check on the examples | `node tools/studio.mjs verify examples/hello-beat` and `examples/song-to-mv` |
| a style card's demo shot changed | copy it to `examples/song-to-mv/shots/styles/` (only the engine import path changes); `npm test` compares them |
| lyric and audio hygiene before a commit | `node tools/studio.mjs lyrics check-repo .` |

Rules:

1. **No npm dependencies.** Node 22+ ES modules; Python 3.10+ with numpy, scipy and Pillow only;
   ffmpeg through its command line; Chrome or Edge over the DevTools protocol. Heavy tools
   (Demucs, faster-whisper, Blender, ComfyUI) stay optional and are detected, never required;
   Blender, ComfyUI and Remotion are used through their own interfaces, not wrapped.
2. **The engine contract is sacred.** A frame is a pure function of t. Keep
   `tests/engine.test.mjs` passing and `studio verify` identical on the examples. Bump `VERSION` in
   `engine/studio.js` when behaviour changes, and document every public name in
   `engine/README.md` with the same name as the code. Projects pin their own engine copy: fix the
   toolkit's engine, then `studio engine <project> --update`, never the other way round.
3. **Tools measure and report; they don't guess.** Ambiguity is reported (AMBIGUOUS TEMPO, PHASE,
   DRIFT, SECTION MISMATCH), every number carries its unit, and every warning says what to do next.
4. **Validate on ground truth.** Analysis code gets a self-test in `tools/py/selftest.py` built on a
   song from `tools/py/music.py`, whose beats, sections and events are known exactly.
5. **One owner per fact.** Each fact lives in one file and the others link to it: a film's steps and
   pass conditions in `skills/studio/SKILL.md`; flags, outputs and defaults in `--help` and
   `skills/studio/references/commands.md`; reasons, cases and craft numbers in the `docs/` chapter
   (its English summary in the PLAYBOOK); the engine API in `engine/README.md`; project file formats
   in `templates/common/`; prompts in `prompts/`; the jury's rubric in `agents/studio-jury.md`;
   symptoms in `docs/16-pitfalls.md`; rights (for published films) in `docs/13-rights.md`; prices in
   `docs/14-cost.md`; sources in `docs/18-sources.md`. When behaviour changes, update the owner.
   Docs say what is true now, not which version changed it.
6. **Licences.** Never copy code or text from AGPL, non-commercial or unlicensed projects (see
   `docs/18-sources.md`); learn the idea and write your own. Adaptations from MIT, ISC or Apache-2.0
   projects get a line in `CREDITS.md` (Apache also keeps its NOTICE). No third-party songs,
   lyrics, footage or images in the repository; fonts only with a licence that allows it, with the
   licence beside them. Other people's prompts are linked and paraphrased, not reproduced.
7. **Determinism and privacy.** Nothing fetches from the network at render time; no telemetry.
8. **Writing.** Plain, specific words. Chinese text is Traditional Chinese (Taiwan usage). Code
   comments are English and match the density of the surrounding code.

## Layout

| path | what |
|---|---|
| `engine/` | `studio.js` (the engine, one ES module) and `player.js` (the live preview); API in `engine/README.md` |
| `tools/studio.mjs` | the command line; `tools/render.mjs` renderer; `tools/lib/` DevTools client, server, PNG |
| `tools/py/` | analysis, lyrics, fonts, sound effects, mixing, frame import (`frames.py`), QA, practice music, self-tests |
| `tools/lyric-tapper.html` | offline page for tapping lyric times |
| `templates/` | `common/` (the documents every project gets), then `lyric-mv`, `short` or `blank` over it (`studio new`) |
| `skills/studio/` | the plugin's skill and its references; `agents/studio-jury.md` the jury |
| `.claude-plugin/` | plugin and marketplace manifests |
| `styles/` | style cards (`STYLE.md`) with a rendered demo each |
| `prompts/` | director briefs in `zh-TW/` and `en/` |
| `examples/` | small films with their own music, lyrics and fonts, all redistributable |
| `docs/` | the knowledge base (18 chapters, zh-TW) and `docs/en/PLAYBOOK.md` |
| `tests/` | `node tests/run.mjs` |
