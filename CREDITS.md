# Credits

> 中文摘要：本專案的程式碼與文字都是為本專案從頭寫的。下面列出我們借用了結構、做法或公開數字的開源專案
> （授權允許的才改寫並署名）、引用統計的 CC BY 4.0 資料集、演算法與規範，以及隨附的字型授權。
> 只參考想法的專案（AGPL、非商業、未附授權）列在 [docs/18-sources.md](docs/18-sources.md)，沒有複製任何程式或文字。
> 你是作者、希望更正或移除？請開 issue。

claude-studio is MIT-licensed ([LICENSE](LICENSE)). Its code and text were written for this
project. No code was copied from other repositories. Where a project's licence allows it, we adapted
a structure, a rule or published numbers, and credit it here. Projects we only learned ideas from
(AGPL, non-commercial or unlicensed code) are listed with their licences in
[docs/18-sources.md](docs/18-sources.md); nothing of theirs is reproduced.

## Adapted with credit (MIT)

| project | licence | what we adapted | where |
|---|---|---|---|
| [francozanardi/papermotion](https://github.com/francozanardi/papermotion) | MIT | "a template, not a library"; the evidence ladder for checking motion; published sound-design numbers that the sound recipes start from (implemented from scratch) | `tools/py/sfx.py`, docs 08, 09, 11 |
| [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) | MIT | addressing time by lyric content instead of seconds; karaoke rules | `engine/studio.js` (`at.lyric`, `karaoke`), docs 04, 05 |
| [Nyankomintsu/world-execute-me-lyric-mv](https://github.com/Nyankomintsu/world-execute-me-lyric-mv) | MIT (code) | publishing timing without lyric text; a flash budget per section; colour as state | `tools/py/lyrics.py` (`strip`, `fill`, `check-repo`), `tools/py/qa.py`, docs 05, 07, 11 |
| [EGSECDA/vocaloid-style-mv-pipeline](https://github.com/EGSECDA/vocaloid-style-mv-pipeline) | MIT | the render contract, encoding settings, easing presets, colour roles, vertical re-layout | `engine/studio.js` (`ease`), `tools/render.mjs`, docs 07, 08, 10 |
| [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | MIT | reporting tempo and phase ambiguity instead of choosing silently; LRC import rules | `tools/py/analyze_song.py`, `tools/py/lyrics.py`, docs 04, 05 |
| [petergpt/painted-rickroll](https://github.com/petergpt/painted-rickroll) | MIT | choreography as a function of the beat count | docs 04, 08 |
| [latent-spaces/brag](https://github.com/latent-spaces/brag) | MIT | sound rules; plugin layout | `skills/`, docs 09 |
| [Kianzzz/xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) | MIT | three options plus previews before building; the technique-by-look table | `templates/common/TREATMENT.md`, docs 03, 07 |
| [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | MIT (code and docs) | the eleven-part structure of a style file; the director's rules ("the first idea in a style is its cliché", "not a remake") | `styles/*/STYLE.md`, docs 03, 07 |
| [Vincentwei1021/mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) | MIT | the jury's score anchors; loudness targets | `agents/studio-jury.md`, docs 09, 11 |

The page contract (`window.SHOT`) is compatible with [LBEILC/Multiplane](https://github.com/LBEILC/Multiplane)
(Apache-2.0) so that either renderer can draw the other's films; no Multiplane code is included.

## Data (CC BY 4.0)

Play counts, favourites and case notes in `docs/15-cases.md` and `docs/17-ecosystem.md` draw on
these curated lists, summarised and re-checked in October 2026:

- [athemeroy/awesome-claude-5-5-videos](https://github.com/athemeroy/awesome-claude-5-5-videos), CC BY 4.0
- [Li-Evan/awesome-opus-5.5-video-prompts](https://github.com/Li-Evan/awesome-opus-5.5-video-prompts), CC BY 4.0
- [apimodels/claude-opus-5-5-video-prompts](https://github.com/apimodels/claude-opus-5-5-video-prompts), CC BY 4.0
- [BeatAPI/awesome-opus-5-5-videos](https://github.com/BeatAPI/awesome-opus-5-5-videos), CC BY 4.0 (docs)

Changes: entries were selected, translated, summarised and combined with our own reading of the
works; numbers are snapshots and may have changed.

Prompts and quotes from creators are linked and paraphrased, with quotations kept short. Their
works and words belong to them.

## Algorithms and standards

- Seeded random numbers: mulberry32 (Tommy Ettinger, public domain).
- Perceptual colour mixing: Oklab (Björn Ottosson, 2020).
- Loudness and true peak: ITU-R BS.1770-4 and EBU R128.
- Photosensitive flashes: an approximation of WCAG 2.x success criterion 2.3.1 (general and red
  flash thresholds). Not a certified test.
- Beat tracking: dynamic programming after D. P. W. Ellis, "Beat Tracking by Dynamic Programming"
  (2007); onsets by log-mel spectral flux with a maximum filter (SuperFlux, Böck and Widmer, 2013);
  sections by checkerboard novelty on a self-similarity matrix (J. Foote, 2000).
- Plucked strings: Karplus–Strong (1983).

## Fonts

`studio new` and `studio fonts` subset an OFL-licensed font found on your machine (Noto Sans TC or
Noto Serif TC, SIL Open Font License 1.1) into each project and write the licence beside it
(`tools/licenses/OFL-1.1.txt`). The examples in this repository ship such subsets with `OFL.txt`.
Noto is a trademark of Google LLC.

## Not affiliated

Claude and Opus are names of Anthropic's models. This is a community project, not affiliated with
or endorsed by Anthropic.
