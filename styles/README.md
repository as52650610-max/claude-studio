# 風格卡 · Style cards

每張風格卡只寫不變的東西：本質、材料、色彩、字型、動態、鏡頭、聲音、原生招式、陷阱、引擎和變化空間。故事、BPM 和時間點每次從你的題目重新導演（見 [docs/07](../docs/07-style.md#風格卡)）。每張卡都附一支 8 秒、120 BPM 的示範，用同一個引擎畫成，沒有任何生成素材：可以直接打開來看、算圖、拆開來用。

Each card records only what never changes: essence, materials, colour, type, motion, camera, sound,
native moves, pitfalls, engine pieces and room for variation. The story, the tempo and the timings
are directed afresh from your brief ([PLAYBOOK §8](../docs/en/PLAYBOOK.md#8-style)). Every card comes with
an 8-second demo at 120 BPM, drawn in code with this repo's engine and nothing generated: open it,
render it, take it apart.

| [![瑞士動態排版：米白紙上的黑色粗體大字「節拍 就是 網格」，「網格」是紅色，旁邊是 THE BEAT IS THE GRID，右上角是數字 16 和一格紅色](../docs/media/style-swiss-kinetic.png)](swiss-kinetic/STYLE.md) | [![水墨紙本：宣紙上一筆山脊、淡淡的墨暈和苔點，下方幾道水紋，右上兩行直書「山在 水在」和一方紅印](../docs/media/style-ink-and-paper.png)](ink-and-paper/STYLE.md) |
|---|---|
| **[瑞士動態排版 · Swiss Kinetic](swiss-kinetic/STYLE.md)** | **[水墨紙本 · Ink and Paper](ink-and-paper/STYLE.md)** |
| [![Riso 印刷：藍色大字「印出來的聲音」，「聲音」底下一條黃色；右邊是粉紅網點的圓和一圈環形文字，下方一排黃色的聲波](../docs/media/style-riso-print.png)](riso-print/STYLE.md) | [![剪紙：牛皮紙上的色紙山、太陽、波浪和紙船，吊牌寫著「紙上的旅行」](../docs/media/style-paper-cutout.png)](paper-cutout/STYLE.md) |
| **[Riso 印刷 · Riso Print](riso-print/STYLE.md)** | **[剪紙 · Paper Cutout](paper-cutout/STYLE.md)** |
| [![像素 CRT：彎曲的映像管裡，戴耳機的黑貓在屋頂看夜景，標題「像素之夜」](../docs/media/style-pixel-crt.png)](pixel-crt/STYLE.md) | [![藍圖：藍圖紙上的構造圓、正弦波、橘色尺寸、剖面線、細部圖和標題欄](../docs/media/style-blueprint.png)](blueprint/STYLE.md) |
| **[像素 CRT · Pixel CRT](pixel-crt/STYLE.md)** | **[藍圖 · Blueprint](blueprint/STYLE.md)** |

| 風格 · Style | 一句話 · In one line | 適合 · Good for | 媒材的格率 · Medium rate | 8 秒示範 · Demo |
|---|---|---|---|---|
| [瑞士動態排版](swiss-kinetic/STYLE.md) | 12 欄網格、兩種字重、一個紅；每個動作落在拍點上，四分之一秒內結束。A 12-column grid, two weights, one red; every move lands on a beat and is over in a quarter of a second. | 歌詞 MV、發表片、資訊多的片 · lyric videos, launch films | 30 fps | 0.53 MB |
| [水墨紙本](ink-and-paper/STYLE.md) | 暖黑的墨在宣紙上，一筆落在拍點，墨暈之後才滲開，一方紅印收尾。Warm black ink on rice paper; a stroke on the beat, washes soaking out after it, one red seal. | 抒情、慢歌、古風 · ballads, quiet songs | 30 fps | 1.7 MB |
| [Riso 印刷](riso-print/STYLE.md) | 三種螢光特色墨各印一層，疊出第三色；每一張的對位都不一樣。Three spot inks, each its own layer, overlapping into a third colour; no two prints register alike. | 獨立樂團、zine、海報感 · indie bands, zines, posters | 12 fps | 14.6 MB |
| [剪紙](paper-cutout/STYLE.md) | 手剪的色紙疊在牛皮紙上，影子說高度，每秒被手放 12 次。Hand-cut coloured paper on kraft; shadows give height; moved by hand twelve times a second. | 童趣、旅行、說故事 · storybook, travel, narrative | 12 fps | 5.6 MB |
| [像素 CRT](pixel-crt/STYLE.md) | 320 × 180、16 色的像素畫，放進一台會開機、會故障、會關機的映像管電視。16-colour pixel art at 320 × 180, on a CRT that switches on, glitches and switches off. | chiptune、遊戲感、懷舊 · chiptune, game-like, nostalgia | 12 fps（電視 30） | 3.8 MB |
| [藍圖](blueprint/STYLE.md) | 藍圖紙上的工程製圖：兩種線寬、淡的構造線、只給量測值的橘色，照製圖的順序一筆一筆畫。A technical drawing on blueprint paper, drawn in a drafter's order; orange only for measured values. | 科普、極簡電子、拆解一個概念 · explainers, minimal electronic, taking an idea apart | 30 fps | 1.4 MB |

檔案大小是 1080p、x264 CRF 16 的算圖結果。差別幾乎都來自「每一格都換的紋理」：Riso 的油墨顆粒每秒換 12 次，所以最大；藍圖和瑞士排版畫好就不動，所以最小。平移本身不貴（見[藍圖 §6](blueprint/STYLE.md#6-鏡頭語法-camera)）。

Sizes are 1080p renders at x264 CRF 16. Nearly all of the difference is texture that changes every
frame: Riso's ink grain changes twelve times a second, so it is the largest; Blueprint and Swiss
stop moving once drawn, so they are the smallest. A pan by itself is cheap (see Blueprint §6).

## 怎麼用 · How to use them

看示範（預覽伺服器）· watch a demo:

```bash
node tools/studio.mjs serve styles/blueprint/demo
```

算出影片 · render it:

```bash
node tools/studio.mjs render styles/blueprint/demo
```

- **卡片是選項，不是菜單：** 六張都是已經有名字的傳統。沒有指定卡時，代理在 G2 先寫自己的點子，之後才打開這裡；B 方案一定不是現成的卡，用了卡就要寫出那支片在卡上加了什麼（[docs/03](../docs/03-workflow.md#先自己想再看參考)）。
- **An option, not a menu:** all six are established traditions. Unless you name one, the agent
  writes its own ideas at G2 before it opens this folder; option B is never an existing card, and a
  film that uses one says what it adds ([PLAYBOOK §4](../docs/en/PLAYBOOK.md#4-the-workflow-eight-gates)).
- **在你的片裡用：** 在導演簡報的「風格」寫上卡片的路徑（例如 `styles/blueprint/STYLE.md`），並說明哪些招式要用在哪一段（[docs/12](../docs/12-prompts.md)）。卡片第 10 節列出示範檔匯出的函式，可以直接複製到你的 `shots/`。
- **Use one in your film:** name the card in your brief's style line (for example
  `styles/blueprint/STYLE.md`) and say which native moves go where. Section 10 of each card lists
  the functions its demo exports; copy them into your own `shots/`.
- **六張一起：** [examples/song-to-mv](../examples/song-to-mv/) 把六支示範原樣嵌進同一首歌的副歌，一小節一張，示範的拍點跟著那首歌走；方法（拍對拍的時間換算、各自的畫布、超取樣、字型）寫在它的 README。
- **All six at once:** [examples/song-to-mv](../examples/song-to-mv/) embeds the six demos, unchanged,
  in one song's chorus, one a bar, each running on that song's beats; its README explains how.
- **做你自己的卡：** 做出一支滿意的片之後，用 [prompts/zh-TW/revisions.md](../prompts/zh-TW/revisions.md#把風格整理成風格卡) 的「把風格整理成風格卡」提示，照同樣的 11 段寫下來；陷阱那一段只寫真的發生過、量過的事。
- **Make your own:** once a film looks right, ask for it to be written up in the same 11 sections
  (the prompt is in [prompts/en/revisions.md](../prompts/en/revisions.md#turn-the-look-into-a-style-card)). Put only things that really went wrong, and were measured, in the
  pitfalls section.

---

卡片的 11 段結構改寫自 [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT），見 [CREDITS](../CREDITS.md)。示範、色盤、點陣字和文字都是本專案自己的（MIT）；字型是 Noto Sans TC，水墨卡是 Noto Serif TC（都是 SIL OFL 1.1），授權全文在每個示範的 `demo/fonts/OFL.txt`。

The 11-section structure is adapted from lemo-opuscar (MIT); see CREDITS. The demos, palettes,
bitmap font and text are this project's own (MIT). The fonts are Noto Sans TC, and Noto Serif TC
for Ink and Paper (both SIL OFL 1.1), with the licence in each demo's `demo/fonts/OFL.txt`.
