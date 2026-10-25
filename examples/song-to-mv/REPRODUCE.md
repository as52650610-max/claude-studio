# REPRODUCE

> G7 重現文件。照這份做，另一個代理（或你）能從零做出同一支片；用這個資料夾重做只要兩行指令。
> 畫面是時間的純函數：輸入一樣、引擎一樣，每一格就一樣（`studio verify` 檢查的就是這件事）。

## 用這個資料夾重做（Rebuild from this folder）

歌不進版控，同一個 seed 會生成同一首歌、同一份真值。在 repo 根目錄：

```bash
node tools/studio.mjs music examples/song-to-mv/audio/song.wav --plan-file examples/song-to-mv/music.json --seed 7 --truth examples/song-to-mv/data/song.truth.json --stems examples/song-to-mv/audio/stems
```

```bash
node tools/studio.mjs deliver examples/song-to-mv
```

應該得到：1050 格；`qa/report.md` 0 FAIL、1 WARN（0:28.03，刻意的，見 [REVIEW_LOG](REVIEW_LOG.md)）；12/12 個切點在拍上；
混音 −14.0 LUFS、−1.6 dBTP，AAC 編碼後 −14.1 LUFS、−1.55 dBTP。`data/songmap.json` 和 `data/lyrics.json` 已經在 repo 裡，不用重新分析。

## 規格（Spec）

| | |
|---|---|
| 片長 | 0:35.00，1050 格 |
| 畫面 | 1920×1080、16:9、30 fps |
| 歌 | [`music.json`](music.json)：120 BPM、G 大調、4/4；前奏 2、主歌 4、導歌 2（漸強，最後一拍停頓）、副歌 6（重擊開場）、尾奏 2 小節；seed 7。第一拍 0.495 s，音樂停在 32.495 s 的小節線，尾音到 35 s |
| 歌詞 | 原創五句、45 個字（每句中間一個全形空格）、英文翻譯；MIT |
| 交付 | x264 CRF 16、yuv420p、BT.709；AAC 320k、48 kHz；混音目標 −14 LUFS、上限 −1.5 dBTP；封面取 31.9 s（六個結尾同時在畫面上） |
| 環境 | Node 24.15、Python 3.14（numpy、scipy、Pillow）、ffmpeg 8.1.1、Chrome（ANGLE / D3D11）；RTX 3090 Ti 上算圖 34.9 秒（6 個 worker、30.1 fps） |

## 技術路線（Technique）

- **全部是程式**：claude-studio 引擎的 Canvas 2D。沒有生成圖片、沒有影片素材、沒有手繪。
- **時間只有兩個來源**：分析出來的拍格 `song.T(小節, 拍, 十六分音符)`，和每個字量到的起音。程式裡沒有寫死的秒數（`studio lint` 會抓）。
- **畫面上的每個數字都從資料算**：`song.bpm`、`song.beatsPerBar`、`song.downbeats[0]`、拍數、字數、和 `data/song.truth.json` 對答案的誤差。
- **副歌的六種風格就是風格卡的示範程式本身**：[`shots/embed.js`](shots/embed.js) 把每個示範畫在自己的離屏畫布上，示範時間由這首歌的拍子換算。
  [`shots/styles/`](shots/styles/) 是原檔的複本，只改了引擎的匯入路徑，`npm test` 確保一致。
- **音效是乾聲**：`sfx.py` 的 click、tick、pop、typing、whoosh、bell。每個寫在鏡頭的 `sfx` 裡（`why`、`role`、`sync`），`studio mix` 依地標放好並壓低音樂。

## 色彩（Palette）

瑞士卡（[`styles/swiss-kinetic`](../../styles/swiss-kinetic/)）的紙、墨和一個紅：

| 名稱 | 值 | 用途 |
|---|---|---|
| 紙 `PAPER` | `#F4F1EA` | 背景（`studio.json` 的 `background` 也是它） |
| 墨 `INK` | `#111111` | 字、梳子、已經聽到的；格線是墨的 10% |
| 淡墨 `TINT` | `rgba(17, 17, 17, 0.2)` | 已經知道、但還沒聽到或還沒唱到的 |
| 紅 `RED` | `#E4322B` | 只表示「現在」：播放頭、正在響的音、正在唱的字、下一個鏡頭；另外是副歌段落 |

視窗裡是各張卡自己的色彩，見各卡的 `STYLE.md`。

## 字型（Fonts）

- **Noto Sans TC**（可變字重 100–900，SIL OFL 1.1）：數字 300、內文 500、標籤 700、標題與主角 900。
- **Noto Serif TC**（200–900）：只給水墨卡的直排字與印章用。
- `studio.json` 的 `fonts[].from` 指向原始字型檔（Google Fonts 或系統字型資料夾的 `NotoSansTC-VF.ttf`、`NotoSerifTC-VF.ttf`）。
  `studio fonts` 把它們子集化成這支片畫到的 291 個字（約 0.55 MB、0.64 MB），授權 `fonts/OFL.txt` 放在旁邊。換一台機器找不到原檔時，保留現有的子集。
- 字級：章名的列高 94 px（`G.rh`）；量測值 160 px、副歌編號 200 px、第 2 句歌詞 96 px、卡拉 OK 行 64 px；頁首 18 px 與 14 px。

## 網格與動態（Grid and motion）

- 瑞士卡的 12 欄網格（`shots/styles/swiss.js` 的 `grid`）：欄 `G.x(c) = 96 + 146c`、列 `G.y(r) = 80 + 118r`；欄寬 122、列高 94、間距 24。
- **只有一種動作**：`rise()`。內容從自己格子的底部升起（expoOut），0.22 秒（`MOVE`）內停住，起點在拍上。
- **只有三種轉場**：升起、鏡頭移動（同一張資料圖換尺度）、視窗打開與收回。其他都是硬切，切在小節線上。
- **沒有質感**：紙紋、顆粒、掃描線屬於各張卡，只出現在視窗裡。

## 結構（Structure）

6 章；分鏡表 16 段；程式裡 20 個鏡頭；12 個切點；24 個音效。

| 章 | 小節 | 時間 | 鏡頭 | 結束的切點 |
|---|---|---|---|---|
| 預備 | — | 0:00.00–0:00.49 | `open`（[`end.js`](shots/end.js)） | `T(1)` |
| 01 聽 | 1–2 | 0:00.49–0:04.50 | `timeline`、`listen` | `T(3)` |
| 02 對拍 | 3–4 | 0:04.50–0:08.50 | `timeline`、`timelock` | `T(5)` |
| 03 歌詞 | 5–6 | 0:08.50–0:12.50 | `timeline`、`lyrics` | `T(7)` |
| 04 分鏡 | 7–8 | 0:12.50–0:16.50 | `storyboard` | `T(9)` |
| 05 風格 | 9–14 | 0:16.50–0:28.50 | `look1`–`look6`，一小節一個 | `T(10)`–`T(15)` |
| 06 交片 | 15–16 | 0:28.50–0:32.50 | `deliver` | `T(17)` |
| 片尾 | — | 0:32.50–0:35.00 | `end` | — |

疊在上面、不算切點的（`cut: false`）：`paper`（紙與網格，整片）、`header`（頁首，`T(1)`–`T(17)`）、四個卡拉 OK 行（第 1、3、4、5 句，各在自己那一句）。
[`film.html`](film.html) 只有一行：`film({ shots: [paper, titlePage, timeline, listen, timeLock, lyricChapter, looks, lyricLine, header] })`。

## 每一章怎麼做（How each chapter was made）

### 片名頁（`open`、`end`：[`end.js`](shots/end.js)）

- 瑞士卡的版面 A：兩列大字（高 `G.h(2)`），英文站在同一條基線上，右上角一格紅色旗標。
- `open`：預備拍的半秒（0 到 `T(1)`）直接畫完成的頁面（`page(ctx, Infinity)`）。第一格因此不是一片紙色，播放器和動態牆有東西可以顯示。
- `end`：從 `T(17)`（音樂停下的那條小節線）起一行一行重新升起；鐘聲 G5（MIDI 79，曲子的主音）。

### 紙、網格與頁首（[`page.js`](shots/page.js)）

- 24 條欄線從 `T(1)` 起依序畫下，每條差 0.02 秒。
- 頁首：片名，以及從 `song.position(t)`、`song.beatAt(t)` 算出的「小節 05 / 16　拍 17 / 64」。
- `PARTS`（段落）和 `CHAPTERS`（章）用小節寫；換一首歌只要改這兩張表。

### 01 聽（[`timeline.js`](shots/timeline.js)、[`listen.js`](shots/listen.js)）

- 梳子：`song.env('onset')` 每秒取 60 個值，每 6 px 一根、4 px 寬；高度是那一段的最大值除以全曲最大值。
- 只畫已經聽到的部分（`t` 之前是墨），紅色播放頭在 `t`。拍子一拍一格落下，強拍較長。
- 量測值一拍一個升起，各配一聲 click：`T(2,1)` 速度（`song.bpm.toFixed(2)`）、`T(2,2)` 拍號、`T(2,3)` 第一拍（`song.downbeats[0]`）。

### 02 對拍（[`timelock.js`](shots/timelock.js)）

- 同一張圖，鏡頭（`lens()`）在 `T(3)` 用 0.22 秒拉遠成整首歌；其餘的拍子在 0.4 秒內由左到右落下，還沒聽到的是淡墨。
- 五個段落一拍一個（`T(3,1)`–`T(4,1)`，各一聲 tick），副歌是紅的；`T(4,2)` 停頓標紅（pop）、`T(4,3)` 重擊的三角形、`T(4,4)` 對答案那一行（typing）。
- 對答案：每個真實的拍找 70 ms 內最近的量測拍，數出找到幾個、中位誤差、最大誤差。沒有真值檔的歌（你自己的歌）這一行不會出現。

### 03 歌詞（[`lyric.js`](shots/lyric.js)）

- 鏡頭在 `T(5)` 推進到第 5–6 小節。第 2 句的九個字**排在鏡頭停住之後的位置**（`lens(song, G)(T(6))`），整排隨章節升起：
  先用淡墨站在自己的音條上，唱到（`c.start`）才用墨落下；音條響的時候是紅的，下面標著起音的秒數。
- 第 1、3、4、5 句是卡拉 OK 行（`lyricLine`）：第 7 列、64 px；淡墨等待，唱到的字是紅的，唱過是墨；英文翻譯靠右。

### 04 分鏡（[`looks.js`](shots/looks.js) 的 `storyboard`）

- 六格（4 欄寬、16:9）一拍一格升起（`T(7,1)`–`T(8,2)`，各一聲 click，音高逐格升）；每格是那張卡的海報幀（卡的 `posterAt`）。
- 小鼓滾奏時（`T(8,3)`、`T(8,3,3)`）第一格外框閃紅 0.12 秒；停頓（`song.stops[0].start`）一到，其他五格消失，只剩第一格和紅框。

### 05 風格（[`looks.js`](shots/looks.js) 的 `look1`–`look6`、[`embed.js`](shots/embed.js)）

- 每小節一個鏡頭，切在小節線上。`look1` 在重擊 `T(9)` 從第一格打開成 10 欄寬的視窗（0.22 秒）；whoosh 用 `sync: 'peak'`，最高點對在重擊上。
- 示範時間：`τ = demo.song.timeOfBeat(4 × (bar − 1) + song.beatAt(t) − song.beatAt(T(9 + k)))`。副歌這一小節的第幾拍，就是示範第 `bar` 小節的第幾拍
  （`LOOKS` 的 `bar`：Riso 2、像素 3、剪紙 2、藍圖 2、水墨 2、瑞士 2）。
- `embed()` 用 8 秒、120 BPM 的節拍器歌建立示範的鏡頭，畫進它自己的離屏畫布（Riso 的疊印以整張畫布的解析度合成，不能和這支片共用畫布）；同一個 τ 和尺寸只畫一次。
- 超取樣：視窗在輸出上不到 540 列時，先放大畫再高品質縮小（CRT 的 180 條掃描線每條至少要 3 列）。
- 右欄：章名、200 px 的編號、卡名、「副歌第 k 小節　示範第 n 小節」、紅色的 `styles/<卡>`，在小節線上換。

### 06 交片（[`looks.js`](shots/looks.js) 的 `deliver`）

- `T(15)` 視窗收回瑞士卡自己的格子（whoosh），其他五格依十六分音符升起（`T(15,1,2+i)`）。
- 第 15 小節每張卡停在結尾前一格（τ = 6 − 1/30 s）；第 16 小節六張卡的結尾（示範第 4 小節）同時播。
- 右欄五個數字一拍一個（`T(15,3)`–`T(16,3)`，各一聲 tick）：119.98 BPM、64 拍、45 字、6 種、0 張生成圖片。前三個從資料數出來。
- `T(16,4)` 交片指令升起；指令裡的 −14 LUFS 讀自 `studio.json`，減號是 U+2212。

## 聲音（Sound）

| 時間 | 音效 | 個數 | 為什麼 |
|---|---|---|---|
| `T(2,1)`–`T(2,3)` | click | 3 | 量測值落下 |
| `T(3,1)`–`T(4,1)` | tick | 5 | 段落落下 |
| `T(4,2)` | pop | 1 | 停頓標紅 |
| `T(4,4)` | typing | 1 | 對答案那一行 |
| `T(7,1)`–`T(8,2)` | click | 6 | 分鏡格落下 |
| `T(9)`（最高點） | whoosh | 1 | 第一格打開成視窗 |
| `T(15)`（最高點） | whoosh | 1 | 視窗收回 |
| `T(15,3)`–`T(16,3)` | tick | 5 | 數字落下 |
| `T(17)` | bell（G5） | 1 | 最後一頁 |

共 24 個。停頓（16.00–16.50 s）的前 0.32 秒全靜；副歌六小節不加音效，重擊交給音樂。
`studio mix`：目標 −14 LUFS、上限 −1.5 dBTP、音樂 0 dB；結果 −14.0 LUFS、−1.6 dBTP、LRA 4.1 LU，壓低音樂 14 次。

## 歌詞時間（Lyric timing）

- 寫詞時一字一音：五句共 45 個字，對上 `music.json` 生成的 45 個人聲音符。
- `studio analyze --stems` 在人聲分軌找到 53 個起音：45 個強度 0.33–1.0，另外 8 個都不到 0.1（前一個音的尾巴）。規則：**強度低於 0.2 的起音不算一個字**。
- 每個字從它的起音開始，到下一個字開始為止；一句的最後一個字唱半秒（120 BPM 的一拍）。下面這段 Python 寫出 `studio lyrics import` 讀的 JSON，
  和這支片實際匯入的檔案逐字相同：

```python
# lyrics_from_onsets.py: one character per vocal onset of strength 0.2 or more, in order; a character
# ends where the next one starts, the last of a line half a second later (a beat at 120 BPM).
import json, sys
songmap, out = sys.argv[1], sys.argv[2]
LINES = [
    ('數清每一拍　對準心跳', 'Count every beat, lock onto the pulse'),
    ('每個字　都落在音符上', 'Every word lands on a note'),
    ('同樣一首歌　六種模樣', 'One song, six different looks'),
    ('每一格畫面　都是時間', 'Every frame is made of time'),
    ('聽得見的　全都看得見', 'All you can hear, you can see'),
]
sm = json.load(open(songmap, encoding='utf-8'))
onsets = iter(t for t, strength in sm['events']['vocal'] if strength >= 0.2)
lines = []
for text, en in LINES:
    starts = [None if c == '　' else next(onsets) for c in text]
    chars = []
    for i, c in enumerate(text):
        after = next((s for s in starts[i + 1:] if s is not None), None)
        start = starts[i] if starts[i] is not None else after
        end = start if c == '　' else (after if after is not None else start + 0.5)
        chars.append({'c': c, 'start': round(start, 4), 'end': round(end, 4)})
    lines.append({'start': chars[0]['start'], 'end': chars[-1]['end'], 'text': text, 'translation': en, 'chars': chars})
assert next(onsets, None) is None, 'more onsets than characters: listen, then tap the lyrics by hand'
json.dump({'lines': lines}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
```

```bash
python -I -X utf8 lyrics_from_onsets.py examples/song-to-mv/data/songmap.json song-to-mv.lyrics.json
```

```bash
node tools/studio.mjs lyrics import examples/song-to-mv song-to-mv.lyrics.json
```

匯入後在 `data/lyrics.json` 寫上 `source`，加上 `"publishable": true`（只有自己寫的歌詞可以加）。起音數和字數對不上時不要硬配：用 `studio tap` 手打。

## 遇過的坑（Pitfalls met）

| 坑 | 怎麼解決 |
|---|---|
| 分析把 16 小節併成 3 段（短於 4 小節的段落會被合併） | 段落名稱用 `music.json` 的小節（`page.js` 的 `PARTS`），時間仍然來自量到的拍子 |
| 人聲分軌多出 8 個弱起音 | 強度低於 0.2 不算一個字 |
| 水墨卡的直排字與印章要 Noto Serif TC，`checkGlyphs` 直接報錯 | 加進 `studio.json`，`studio fonts` 重新子集化 |
| Riso 和水墨的示範第 1 小節在視窗裡太空 | 改用示範第 2 小節 |
| 第一格是一整片紙色（品管 WARN） | 預備拍的半秒放片名頁 |
| 0:08.50 鏡頭推進時，九個字跟著移動的鏡頭擠成一團 | 字排在鏡頭停住的位置，資料圖推進去對齊它們 |
| 品管說亮度在「同一個鏡頭內」跳動 | 副歌拆成每小節一個鏡頭，切點在小節線 |
| `studio plan`：片名頁和 01 聽在同一層重疊 | 01 聽與資料圖從 `T(1)` 開始 |
| 200 px 的編號上緣被升起動畫的裁切框切掉約 20 px | 裁切框從第 2 列開始：裁切框要包住整個字，包括超出格子的部分 |
| 交片頁指令裡的 −14 是 ASCII 連字號 | 改用 U+2212，數值讀自 `studio.json` |
| 最後一個切點被算成離拍 15 格、鐘聲差 500 ms | 拍子清單在最後一拍就結束了；工具的拍格在兩端照 `song.T` 的算法延伸（已修進 `audio_io.beat_offset`） |
| 嵌入：Riso 的疊印蓋掉整頁；CRT 在小格子裡出摩爾紋 | 每個示範用自己的離屏畫布；不到 540 列就超取樣 |

接受、沒有修的：0:28.03 的亮度 WARN（瑞士卡自己的結尾，紅條淹滿視窗）；最響之前只有一段真正的靜音；停頓最後 0.18 秒的 whoosh。理由見 [REVIEW_LOG](REVIEW_LOG.md)。

## 從零開始：交給 Claude 的提示（From nothing: the prompts）

裝好 mv-studio 外掛、在這個 repo 裡開 Claude Code，一關一段。這是做這支片時的實際順序：

**G0 簡報**

> 用 studio skill 在 projects/song-to-mv 做一支新片，全自動模式。一句話：一支會說明自己的 MV——一首歌怎麼變成一支 MV。
> 六章，一個步驟配一段歌：聽、對拍、歌詞、分鏡、風格、交片；副歌把 styles/ 的六張風格卡一小節一張放出來。
> 規格：35 秒、1920×1080、30 fps。音樂用 studio music 生成：120 BPM、G 大調，前奏 2、主歌 4、導歌 2（停頓）、副歌 6（重擊）、尾奏 2 小節，seed 7，寫出真值和分軌。
> 歌詞你寫：五句，中文一字一音，附英文翻譯，MIT。字型 Noto Sans TC。不用任何生成圖片。
> 長期規則：時間只來自 songmap 和每個字的起音；畫面上的數字都從資料算；副歌的風格就是風格卡的示範程式本身。

**G1 時間鎖定**

> 分析這首歌（含分軌），和生成器的真值對答案。人聲起音強度低於 0.2 的不算一個字；一字一個起音，匯入歌詞。

**G2 企劃**

> 給我三個結構候選（穩健、新視覺語言、大膽結構），選一個並說理由。風格用瑞士卡的紙、墨、一個紅和 12 欄網格；紅色只表示「現在」。出 5 張風格幀。

**G3–G5 分鏡與製作**

> 寫分鏡表，卡點寫小節與拍。先做最難的副歌：把六張卡的示範嵌進視窗，示範的拍子跟著這首歌走。每章做完出靜態圖自己看，再做下一章。

**G6 審查**

> 交片後自己審：聯絡表、轉場條、qa 報告。找出最糟的問題，一類一類修，寫進 REVIEW_LOG。然後請 studio-jury 獨立評分。

**G7 交付**

> 寫 CREDITS.md 和 REPRODUCE.md，列出沒有驗證的事，請我戴耳機、用手機喇叭各完整看一次。

（「新片不要讀範例資料夾」是給新作品的規則；要重做這一支，才把這份文件交給代理。）

## 驗證你的重做（Check your rebuild）

- `npm test`：範例的文件、字型授權、風格卡複本是否一致。
- `node tools/studio.mjs verify examples/song-to-mv`：54 格在新的瀏覽器裡打亂順序重畫，應該完全一致。
- `node tools/studio.mjs plan examples/song-to-mv`：20 個鏡頭、12 個切點都在拍上、0 FAIL、0 WARN。
- 數字對不上時先比 `out/DELIVERY.md` 最後的 sha1：歌、songmap、歌詞、cues、`studio.json` 有一個不同，畫面就可能不同。

這份文件沒有記錄 token 用量：這支片是在建這套工具的同一段對話裡做的，分不出來。
