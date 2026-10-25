# 從一首歌到一支 MV · From a song to a music video

旗艦範例：一支會說明自己的 MV。35 秒、六章，每一章是工作流的一步，也是歌的一段——
聽、對拍、歌詞、分鏡、風格、交片；副歌一小節換一張風格卡。音樂、歌詞和每一格畫面都由本 repo 的程式產生，可以自由使用。

The flagship example: a music video that explains itself. 35 seconds in six chapters, each one a
step of the workflow and a part of the song: listen, time lock, lyrics, storyboard, style,
deliver. The chorus plays the six style cards, one a bar. Music, lyrics and every frame come from
this repository and are free to use.

![From a song to a music video: the storyboard, the stop, the impact, then six looks on one song, one a bar](../../docs/media/song-to-mv.gif)

## 它示範什麼 · What it shows

![The six chapters: listen, time lock, lyrics, storyboard, style, deliver](../../docs/media/song-to-mv-chapters.jpg)

| 章 · chapter | 畫面 · picture | 由什麼帶動 · driven by | 程式 · code |
|---|---|---|---|
| 01 聽 · listen<br>0:00.5–0:04.5 | 紅色播放頭把聽到的起音畫成梳子；速度、拍號、第一拍一拍一個落下 · the playhead draws what it hears; tempo, metre and first downbeat land one a beat | `song.env('onset')`、`song.bpm`、`song.downbeats` | [`timeline.js`](shots/timeline.js)、[`listen.js`](shots/listen.js) |
| 02 對拍 · time lock<br>0:04.5–0:08.5 | 同一張圖拉遠成整首歌；五個段落一拍一個；停頓與重擊標紅；和生成器的真值對答案 · the same comb pulls out to the whole song; parts, stop and impact; graded against the truth | `song.beats`、`song.stops`、[`data/song.truth.json`](data/song.truth.json) | [`timelock.js`](shots/timelock.js) |
| 03 歌詞 · lyrics<br>0:08.5–0:12.5 | 九個字站在自己的音上，唱到才落下 · nine characters stand on their notes and land when sung | 每個字量到的起音 · each character's measured onset ([`data/lyrics.json`](data/lyrics.json)) | [`lyric.js`](shots/lyric.js) |
| 04 分鏡 · storyboard<br>0:12.5–0:16.5 | 六格一拍一格；小鼓滾奏時第一格閃紅；停頓時只剩它 · six cells, one a beat; in the stop only the first is left | `song.T(7, beat)`、`song.stops[0]` | [`looks.js`](shots/looks.js) |
| 05 風格 · style<br>0:16.5–0:28.5 | 第一格在重擊打開成視窗；六張風格卡一小節一張，都踩在這首歌的拍子上 · the first cell opens on the impact; six cards, one a bar, on this song's beats | `song.T(9 + k)`、`song.beatAt(t)` | [`looks.js`](shots/looks.js)、[`embed.js`](shots/embed.js) |
| 06 交片 · deliver<br>0:28.5–0:32.5 | 視窗收回；六張卡的結尾同時播；五個數字從資料數出來 · the window folds back; all six endings at once; five numbers counted from the data | `song.bpm`、拍數 beats、字數 characters | [`looks.js`](shots/looks.js) |
| 片名頁 · title page<br>0:00 與 0:32.5–0:35 | 第一格就是最後一頁：預備拍時停著，最後一小節之後重新升起 · the first frame is the last page | `song.T(1)`、`song.T(17)` | [`end.js`](shots/end.js) |
| 歌詞行 · karaoke line | 第 1、3、4、5 句：灰色等待、唱到的字是紅的 · lines 1, 3, 4, 5: grey ahead, red while sung | 每個字的起音 · each character's onset | [`lyric.js`](shots/lyric.js) |

紅色只有一個意思：**現在**——播放頭、正在響的音、正在唱的字、下一個鏡頭。
程式在 [`shots/`](shots/)（約 680 行，不含風格卡的複本），沒有一個寫死的秒數：時間都是 `song.T(小節, 拍, 十六分音符)` 或量到的起音；
畫面上的每個數字（119.98 BPM、64/64、2.1 ms、45 個字）都是從資料算出來的。

Red means one thing: *now*. The code is [`shots/`](shots/) (about 680 lines without the style-card
copies) with no hard-coded second, and every number on screen is computed from the data.

工作流文件都填好了，可以當作範本對照：[BRIEF](BRIEF.md) · [TREATMENT](TREATMENT.md) ·
[STORYBOARD](STORYBOARD.md) · [PROGRESS](PROGRESS.md) · [REVIEW_LOG](REVIEW_LOG.md) · [CREDITS](CREDITS.md) · [REPRODUCE](REPRODUCE.md)。
The workflow documents are filled in, to compare with your own; REPRODUCE is how to rebuild this film, prompts included.

## 同一首歌，六種模樣 · One song, six looks

副歌的六個視窗不是錄好的影片，而是六張[風格卡](../../styles/)的示範程式本身，在這支片裡即時重畫（[`shots/embed.js`](shots/embed.js)）：

- **拍對拍**：每個示範是一支 8 秒、120 BPM 的獨立小片。視窗裡的示範時間由這首歌的拍子換算，副歌第 k 小節的第幾拍就是示範第 n 小節的第幾拍，
  所以示範裡的每個動作都落在這首歌的拍點上：
  `τ = demo.song.timeOfBeat(4 × (n − 1) + song.beatAt(t) − song.beatAt(song.T(9 + k − 1)))`
- **各自的畫布**：每個示範先畫在自己的離屏畫布，再貼進視窗。Riso 卡的疊印用整張畫布的解析度合成，直接畫在頁面上會蓋掉整頁。
- **超取樣**：像素 CRT 的掃描線在小格子裡會變成摩爾紋，所以格子在輸出上不到 540 列時，先放大畫再高品質縮小。
- **字型**：示範用到的字型要加進這支片的 `studio.json`（水墨卡的直排字與印章用 Noto Serif TC），否則 `checkGlyphs` 直接報錯。
- **保持一致**：[`shots/styles/`](shots/styles/) 是原檔複本，只改了引擎的匯入路徑；`tests/examples.test.mjs` 確保它們和 `styles/*/demo/shots/` 一致。

The six windows are the style cards' demo code itself, redrawn live. Each demo's time is mapped
from this song's beats (beat for beat, bar for bar), each paints into its own offscreen canvas
(riso composites at canvas resolution), the CRT supersamples small cells so its scanlines do not
alias, fonts a demo uses join the film's `studio.json`, and a test keeps the copies identical.

## 自己做一次 · Make it yourself

歌不在 repo 裡（`audio/` 不進版控），幾秒就能重新生成；同一個 seed 每次都是同一首歌。在 repo 根目錄：
The song is not in the repository; the same seed regenerates the same song in seconds. From the
repository root:

```bash
node tools/studio.mjs music examples/song-to-mv/audio/song.wav --plan-file examples/song-to-mv/music.json --seed 7 --truth examples/song-to-mv/data/song.truth.json --stems examples/song-to-mv/audio/stems
```

```bash
node tools/studio.mjs serve examples/song-to-mv
```

```bash
node tools/studio.mjs deliver examples/song-to-mv
```

`serve` 開預覽（空白鍵播放，`[` `]` 跳小節，`L` 循環目前的鏡頭）；`deliver` 會子集化字型、檢查歌詞、混音、渲染、品管、
輸出字幕與海報，寫出 `out/song-to-mv.mp4` 與 `DELIVERY.md`。`data/songmap.json` 與 `data/lyrics.json` 已經在 repo 裡；
要重新分析：`node tools/studio.mjs analyze examples/song-to-mv --stems examples/song-to-mv/audio/stems`。

`serve` opens the preview; `deliver` subsets the fonts, checks the lyrics, mixes, renders, checks the
video and writes subtitles, a poster, `out/song-to-mv.mp4` and `DELIVERY.md`. The songmap and the
timed lyrics are committed; the `analyze` line rebuilds the songmap.

## 誠實的發現 · Honest findings

生成器會寫下每一拍、每一下鼓、每一個人聲音符的真實位置（`data/song.truth.json`），所以分析結果可以對答案：

1. **拍子**：64/64 拍找到了，中位誤差 2.1 ms、最大 5.2 ms；16/16 個強拍；停頓量到 16.002–16.495 s（真值 16.0–16.5），重擊 16.495 s。
2. **段落**：16 小節被併成 3 段（短於 4 小節的段落會被合併），所以這支片用 `music.json` 的小節來命名段落，時間仍然來自量到的拍子。
3. **歌詞時間**：人聲分軌找到 53 個起音。45 個是真正的音（強度 0.33–1.0），剛好一字一個；多出的 8 個強度都不到 0.1：
   導歌過門 4 個、長音中間 1 個、尾奏 3 個，都是前一個音的尾巴。規則：**強度低於 0.2 的起音不算一個字**。
   每個字的時間就是它的起音，寫成 JSON 後用 `studio lyrics import` 匯入。
4. **鼓**（分軌）：大鼓 42/45、小鼓 27/40，沒有假的；hi-hat 161/174，多 15 個。這支片只用拍子和起音包絡，所以不受影響。
5. **切點**：12 個切點都在拍上（±1 格）。最後一個切點在音樂停下的那條小節線上——拍子清單在最後一拍就結束了，
   品管與混音報告照引擎 `song.T` 的算法往後數，才不會把它算成「差 15 格」。

The generator writes down where every beat, drum hit and sung note really is, so the analysis can be
graded: 64 of 64 beats (median 2.1 ms, worst 5.2 ms), the stop within 5 ms; 16 bars merged into 3
sections, so parts are named from `music.json`; 53 vocal onsets for 45 notes, the 8 extra all
weaker than 0.1 (tails of the previous note) while every real note is 0.33 or stronger, hence the
rule that an onset under 0.2 is not a character; from stems, 42/45 kicks and 27/40 snares with
none false, 161/174 hats with 15 false. All 12 cuts are on a beat, including the one on the bar
line where the music stops (QA and the mix report count on past the last beat, as `song.T` does).

## 試試看 · Try

- 換風格的順序，或改用示範的另一小節：`shots/looks.js` 的 `LOOKS`（`bar` 是示範的第幾小節，`poster` 是分鏡格裡的那一格）。
  Reorder the looks or play another bar of a demo: `LOOKS` in `shots/looks.js`.
- 做第七張卡：在 `styles/` 加一張卡、在 `LOOKS` 加一行，副歌就要多一小節——把 `music.json` 的 chorus 改成 7 小節再重新生成。
  A seventh card needs a seventh chorus bar: add it to `music.json` and regenerate.
- 換成你自己的歌：放進 `audio/`，`studio analyze --stems`，用 `studio lyrics import` 匯入歌詞，再改 `shots/page.js` 裡 `PARTS` 與 `CHAPTERS` 的小節。
  Your own song: analyse it, import your lyrics, then edit the bars in `PARTS` and `CHAPTERS`.

> 代理聽不到聲音。這支片的音量與峰值是量測值（−14.0 LUFS、−1.6 dBTP），之後由人聽過、認可（2026-10-24）。你的片發布前也一定要有人聽。
> An agent cannot hear: the loudness was measured, then a person listened to the film and approved it
> (2026-10-24). Yours needs the same before it goes out.
