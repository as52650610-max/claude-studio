# QA report

`out/hello-beat.mp4` · 1920x1080 @ 30 fps · 0:27.00 · h264 yuv420p · 2.5 Mb/s · 8.5 MB · audio aac 48000 Hz 2 ch

**0 fail · 0 warn · 2 info · 7 pass**

| | area | finding |
|---|---|---|
| ℹ️ INFO | sound | loudest moment 0:19.25; 1 real silence before it (a silence before the climax makes it land; consider at least two) |
| ℹ️ INFO | timing | 1 of 1 cuts (manifest) within ±1 frame of a beat |
| ✅ PASS | flash | at most 0 general and 1 red flashes in any second |
| ✅ PASS | frames | no black or white frames |
| ✅ PASS | loudness | -14.1 LUFS integrated (ffmpeg -14.1) |
| ✅ PASS | loudness | true peak -1.54 dBTP after encoding |
| ✅ PASS | sync | audio offset +0 ms against audio/mix.wav |
| ✅ PASS | storyboard | 8 planned shots cover the film; every shot has an Out |
| ✅ PASS | publish | no lyric fragments or audio in the files that would be published |

## Cuts against beats

| cut | frames from the nearest beat |
|---|---|
| 0:12.50 | -0.2 |

## Pictures

- contact sheets: `video_sheet_01.png`
- transition strips: `strips_01.png`
- `luma.png` (brightness, flashes, black frames), `wave.png` and `spec.png` (final audio)

Flash detection approximates WCAG 2.3.1 general and red flash thresholds. It is not a certified photosensitivity test.
These are measurements. A person still has to watch the whole film with sound.
