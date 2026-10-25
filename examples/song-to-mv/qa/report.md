# QA report

`out/song-to-mv.mp4` · 1920x1080 @ 30 fps · 0:35.00 · h264 yuv420p · 2.4 Mb/s · 10.6 MB · audio aac 48000 Hz 2 ch

**0 fail · 1 warn · 2 info · 8 pass**

| | area | finding |
|---|---|---|
| ⚠️ WARN | brightness | 0:28.03: brightness 0.86 → 0.68 inside a shot |
| ℹ️ INFO | sound | loudest moment 0:25.50; 1 real silence before it (a silence before the climax makes it land; consider at least two) |
| ℹ️ INFO | timing | 12 of 12 cuts (manifest) within ±1 frame of a beat |
| ✅ PASS | flash | at most 1 general and 1 red flashes in any second |
| ✅ PASS | frames | no black or white frames |
| ✅ PASS | loudness | -14.1 LUFS integrated (ffmpeg -14.1) |
| ✅ PASS | loudness | true peak -1.55 dBTP after encoding |
| ✅ PASS | sync | audio offset +0 ms against audio/mix.wav |
| ✅ PASS | storyboard | 16 planned shots cover the film; every shot has an Out |
| ✅ PASS | lyrics | 5 lines: reading time, width, glyphs and order OK |
| ✅ PASS | publish | no lyric fragments or audio in the files that would be published |

## Cuts against beats

| cut | frames from the nearest beat |
|---|---|
| 0:00.49 | +0.0 |
| 0:04.50 | +0.0 |
| 0:08.50 | +0.0 |
| 0:12.50 | +0.0 |
| 0:16.50 | +0.0 |
| 0:18.50 | +0.0 |
| 0:20.50 | +0.0 |
| 0:22.50 | +0.0 |
| 0:24.50 | +0.0 |
| 0:26.50 | +0.0 |
| 0:28.50 | +0.0 |
| 0:32.50 | +0.0 |

## Pictures

- contact sheets: `video_sheet_01.png`
- transition strips: `strips_01.png`, `strips_02.png`
- `luma.png` (brightness, flashes, black frames), `wave.png` and `spec.png` (final audio)

Flash detection approximates WCAG 2.3.1 general and red flash thresholds. It is not a certified photosensitivity test.
These are measurements. A person still has to watch the whole film with sound.
