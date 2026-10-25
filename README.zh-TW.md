<div align="center">

# Claude Studio

**用 Claude Opus 5.5 做 MV 與動畫的完整工作流：從一首歌，到一支可以發布的影片。**

[English](README.md) · [快速開始](#快速開始) · [知識庫](docs/README.md) · [範例](#範例) · [風格卡](styles/README.md) · [提示詞](prompts/README.md)

</div>

![從一首歌到一支 MV：分鏡格在重擊時打開成視窗，接著同一首歌放出六種風格，一小節一種](docs/media/song-to-mv.gif)

<p align="center"><sub><a href="examples/song-to-mv/">從一首歌到一支 MV</a>：35 秒、六章，每一格畫面都是程式畫的。音樂、歌詞和畫面全部來自這個 repo。</sub></p>

Opus 5.5 不是影片模型。它做影片的方式是**寫一支畫出每一格畫面的程式**。所以片子是精準的（字在唱到的那個音亮起）、
可以局部修改的（改一個字，其他東西都不動）、可以重現的（同一個時間點永遠是同一個畫面），而且會累積（程式、風格、檢查方法都能帶到下一支片）。

Claude Studio 把這條路需要的東西整理在一起，依據是 Opus 5.5 發布後一個月內做得最好的作品：

| | |
|---|---|
| **知識庫** | 18 章繁體中文（[目錄](docs/README.md)）＋英文精簡版 [Playbook](docs/en/PLAYBOOK.md)：流程、節拍與歌詞時間、分鏡、風格、動態、聲音、渲染、審查、提示詞、版權、成本、案例、常見失敗、出處 |
| **Claude Code 外掛** | `mv-studio`：[`studio` 技能](skills/studio/SKILL.md)帶著一支片走過八道關卡；[`studio-jury` 代理](agents/studio-jury.md)在沒有製作脈絡的情況下獨立評審 |
| **引擎與工具** | [決定性的畫布引擎](engine/README.md)（每一格只由時間決定，所有時間都來自歌曲）和一支指令列：節拍與段落分析、歌詞時間、字型子集化、即時預覽、聯絡表、程式檢查、決定性驗證、音效與混音到 −14 LUFS、GPU 平行渲染、品管、一行交片。不需要任何 npm 套件 |
| **六張風格卡** | [瑞士動態排版、水墨紙本、Riso 印刷、剪紙、像素 CRT、藍圖](styles/README.md)：只寫不變的規則，每張附一支程式畫的 8 秒示範 |
| **範本與提示詞** | 三種[專案範本](templates/)（歌詞 MV、短片、空白）、八個中英文[提示詞範本](prompts/README.md) |
| **兩支完成的片** | [每一份工作流文件都填好](#範例)，附品管報告與重做方法 |

## 快速開始

需要 **Node 22 以上**、**Python 3.10 以上**（numpy、scipy、Pillow）、**ffmpeg**、**Chrome 或 Edge**。不用 npm install。取得 repo 並檢查環境：

```bash
git clone https://github.com/as52650610-max/claude-studio.git
cd claude-studio
node tools/studio.mjs doctor
```

歌不進版控。先重新生成旗艦範例的歌（同一個 seed 永遠是同一首歌），再用即時預覽打開：

```bash
node tools/studio.mjs music examples/song-to-mv/audio/song.wav --plan-file examples/song-to-mv/music.json --seed 7 --truth examples/song-to-mv/data/song.truth.json --stems examples/song-to-mv/audio/stems
```

```bash
node tools/studio.mjs serve examples/song-to-mv
```

打開它印出的網址。空白鍵播放；←/→ 移動一秒，`,` `.` 移動一格，`[` `]` 跳一小節；`D` 顯示安全框、小節與拍、目前的鏡頭和每一拍的閃光；
`L` 循環目前的鏡頭。要混音、算圖、品管並打包成片：

```bash
node tools/studio.mjs deliver examples/song-to-mv
```

### 用 Claude Code 做你自己的片

從你的 clone 載入外掛：

```bash
claude --plugin-dir .
```

或在 Claude Code 裡加入外掛市集再安裝：`/plugin marketplace add as52650610-max/claude-studio`（在 clone 裡也可以用 `./`），然後 `/plugin install mv-studio@claude-studio`。接著說你要做什麼：

```text
/mv-studio:studio 幫我的歌做一支歌詞 MV（song.wav，歌詞在 lyrics.txt）。每一關都停下來給我看。
```

技能只會在開始時問一次問題，之後一關一關做：量節拍並請你聽點擊音軌確認、提出三個結構候選、用小節與拍寫分鏡、
先做最難的 10–15 秒、算圖、自己審查，交片前再交給獨立評審。需要人來決定的事留給你：片子要說什麼、時間對不對（用耳朵）、按下發布。

## 一支片怎麼做出來

八道關卡。每一關都留下檔案，新的對話可以從上一次停下的地方接著做。

| 關卡 | 產出 | 誰決定 |
|---|---|---|
| G0 簡報 | `BRIEF.md`：目標、觀眾、平台、片長、比例、素材、預算，以及會不會公開（要公開才問權利） | 你（只問一次） |
| G1 時間鎖定 | `songmap.json`＋點擊預覽音軌（用耳朵確認）；歌詞對齊並校對 | 你的耳朵 |
| G2 企劃 | `TREATMENT.md`：先寫自己的點子，再從三個結構候選選一個；風格幀；凍結風格 | 你選 |
| G3 分鏡 | `STORYBOARD.md`：每個鏡頭的卡點寫小節與拍，還有 **Out**（下一個鏡頭怎麼接）；關鍵靜態圖 | 你核准 |
| G4 樣片 | 最難的 10–15 秒，含聲音 | 你核准 |
| G5 製作 | 分章節製作；`studio lint` 乾淨；`studio verify` 一致 | 代理 |
| G6 審查 | 自動品管、獨立評審、你的筆記；修正分 P0–P2，一輪只修一類 | 代理＋你 |
| G7 交付 | `studio deliver`：MP4、封面、字幕、`DELIVERY.md`、品管報告；再加上 `CREDITS.md`、`REPRODUCE.md` | 你最後按下發布 |

每一關的步驟在 [studio 技能](skills/studio/SKILL.md)；為什麼存在、來自哪些案例：[03 製作流程與關卡](docs/03-workflow.md)。

## 引擎

一支片是一個列出鏡頭的頁面。鏡頭是歌曲的函式：它從不寫秒數，所以歌、速度或剪輯改了，畫面還是跟著音樂走。

```js
// shots/chorus.js
export function chorus({ song }) {
  return {
    id: 'chorus',
    start: song.T(9),   // 第 9 小節，來自分析出來的拍子
    end: song.T(15),
    sfx: [{ t: song.T(9), sound: 'whoosh', sync: 'peak', why: 'the window opens on the impact', role: 'transition' }],
    draw(ctx, { t }) {
      const r = 120 * (1 + 0.2 * song.hit('kick', t, 0.09)); // 每個分析出來的大鼓脹一下
      ctx.fillStyle = '#E4322B';
      ctx.beginPath();
      ctx.arc(960, 540, r, 0, 2 * Math.PI);
      ctx.fill();
    },
  };
}
```

`studio lint` 會抓出時鐘、沒有種子的亂數、網路網址和寫死的時間；`studio verify` 在新的瀏覽器裡打亂順序把同樣的幀畫兩次，逐像素比對。
完整 API（歌曲、歌詞、cue、緩動、彈簧、文字、顆粒、音效）在 [engine/README.md](engine/README.md)；所有指令在
[references/commands.md](skills/studio/references/commands.md)。

**其他工具做的畫面**：一鏡也可以放別的工具做的畫面，例如 Blender 渲染、ComfyUI 生成的片段、綠幕實拍。`studio frames` 把它們接回來，`studio timing` 把片子的時間交給那個工具。這些工具都不包裝，用它們自己的介面（[10](docs/10-render.md#其他工具做的畫面)）。

## 範例

### [從一首歌到一支 MV](examples/song-to-mv/)

![六章：聽、對拍、歌詞、分鏡、風格、交片](docs/media/song-to-mv-chapters.jpg)

一支會說明自己的 MV。每一章是工作流的一步，也是歌的一段，畫面用的就是那一步產生的資料：梳子是分析器聽到的起音包絡，
對答案那一行拿分析出的拍子和生成器的真值比（64/64，中位誤差 2.1 ms），45 個字每一個都在自己量到的人聲起音亮起。
副歌把六張風格卡的示範即時嵌進來，一小節一張，踩在這首歌的拍子上。鏡頭程式約 680 行，沒有寫死的秒數，沒有生成圖片。
[重做方法](examples/song-to-mv/REPRODUCE.md)（含交給 Claude 的提示）。

### [hello, beat](examples/hello-beat/)

![hello, beat：點在導歌蓄力、停頓時屏息，然後爆開成紅色](docs/media/hello-beat.gif)

最小但完整的一支片：一個點跟著一首歌動，畫面自己說明每個動作被什麼帶動。27 秒、4 個鏡頭、3 個音效、一個程式檔。
把 `music.json` 的速度改掉、重新生成，不用改程式，整支片就跟著新的速度走。

兩個範例都有一支片該有的所有文件，而且都填好了：`BRIEF`、`TREATMENT`、`STORYBOARD`、`PROGRESS`、`REVIEW_LOG`、`CREDITS`、`REPRODUCE`，可以拿來和你自己的對照。

## 風格卡

| [![瑞士動態排版](docs/media/style-swiss-kinetic.png)](styles/swiss-kinetic/STYLE.md) | [![水墨紙本](docs/media/style-ink-and-paper.png)](styles/ink-and-paper/STYLE.md) | [![Riso 印刷](docs/media/style-riso-print.png)](styles/riso-print/STYLE.md) |
|---|---|---|
| **[瑞士動態排版](styles/swiss-kinetic/STYLE.md)**：12 欄網格、兩種字重、一個紅 | **[水墨紙本](styles/ink-and-paper/STYLE.md)**：一筆落在拍點，墨暈之後才滲開 | **[Riso 印刷](styles/riso-print/STYLE.md)**：三種特色墨，每一張的對位都不一樣 |
| [![剪紙](docs/media/style-paper-cutout.png)](styles/paper-cutout/STYLE.md) | [![像素 CRT](docs/media/style-pixel-crt.png)](styles/pixel-crt/STYLE.md) | [![藍圖](docs/media/style-blueprint.png)](styles/blueprint/STYLE.md) |
| **[剪紙](styles/paper-cutout/STYLE.md)**：手剪的色紙，每秒被手放 12 次 | **[像素 CRT](styles/pixel-crt/STYLE.md)**：320 × 180、16 色，在會開機、會關機的映像管裡 | **[藍圖](styles/blueprint/STYLE.md)**：構造線、尺寸標註和標題欄 |

風格卡只寫不變的東西：材料、色彩、字型、動態、鏡頭、聲音、原生招式、陷阱。故事與時間點每次從你的題目重新導演，因為一種風格最先想到的點子，就是它的陳腔濫調。卡片是選項，不是菜單：G2 時代理先寫自己的點子，之後才打開風格卡；B 方案一定不是現成的卡。

## 研究發現了什麼

知識庫整理自 2026 年 9 月 22 日 Opus 5.5 發布到 10 月 24 日之間的公開資料：依播放數與收藏數挑出的 89 支 Bilibili 影片（收藏率是品質最可靠的訊號）、
作者在說明欄、留言與貼文裡的說法、48 個開源專案的原始碼與文件（逐一確認授權），以及 Anthropic 的官方文件。
內容農場、只收集提示詞的帳號、「留言拿工作流」這類誘餌都沒有採用。所有出處在 [docs/18-sources.md](docs/18-sources.md)。幾個發現：

- **一個概念撐起一支片。** 播放數最高的 Opus MV 被批評「東西太多、沒有中心」；收藏率最高的作品都能用一句話說完。
- **分鏡要有邏輯，轉場要設計。** 畫面再漂亮，全部硬切就像作品集。所以這裡每個鏡頭都有 Out。
- **時間是量出來的，不是猜的。** 用工具找拍子、用耳朵聽點擊音軌、用官方歌詞對齊並校對。速度可能是一半或兩倍時，工具要說出來。
- **參考素材勝過形容詞。** 有人沿用一份著名重製版的長簡報，只多給了一張情緒板和圖像模型，結果是風格完全不同、約 2,000 萬觀看的一支片。觀眾已經認得「預設 Opus 風」。
- **依證據迭代。** 一支 13,017 格的片，光是檢查就算了超過 16 萬格。從靜態圖到短樣片再到全片，最後讓沒有脈絡的人來評分。
- **聲音是最弱的一環**，因為代理聽不到。每個音效都要有理由和地標，響度要量，而且一定要有人聽過。

十條原則、六條技術路線（純程式 2D、3D、Blender、繪畫風、搭配生成素材的混合路線、現成框架）和 17 個案例拆解，在[知識庫](docs/README.md)與[英文 Playbook](docs/en/PLAYBOOK.md)。

## Repo 裡有什麼

| 資料夾 | 內容 |
|---|---|
| [`docs/`](docs/README.md) | 知識庫：18 章（繁中）、[英文 Playbook](docs/en/PLAYBOOK.md)、圖片 |
| [`skills/studio/`](skills/studio/SKILL.md) | `studio` 技能：關卡、規則、指令、製作細節 |
| [`agents/`](agents/studio-jury.md) | `studio-jury` 獨立評審 |
| [`engine/`](engine/README.md) | `studio.js`（引擎）與 `player.js`（即時預覽） |
| [`tools/`](tools/studio.mjs) | `studio` 指令列、渲染器，以及 Python 的分析、歌詞、音效、混音、逐格圖層與品管工具 |
| [`styles/`](styles/README.md) | 六張風格卡與示範 |
| [`templates/`](templates/) | `studio new` 用的專案範本 |
| [`prompts/`](prompts/README.md) | 提示詞範本（繁中、英文） |
| [`examples/`](examples/) | `song-to-mv` 與 `hello-beat` |
| [`tests/`](tests/) | `npm test`：引擎、指令列、範例，以及 Python 自我測試 |

## 誠實的限制

- **代理聽不到聲音。** 響度、峰值、同步和離拍多少由工具量測；兩支範例片之後由人聽過、認可。你的片也一樣：發布前請戴耳機、再用手機喇叭各聽一次。
- 獨立評審還沒有跑過這兩支範例。
- 閃爍偵測是 WCAG 2.3.1 的近似，不是經過認證的光敏測試。
- `studio music` 生成的是有真值的練習曲，用來測試時間，不是配樂。
- 在 Windows 11、Chrome、RTX 3090 Ti 上開發與測試。工具也會在 macOS 與 Linux 上找瀏覽器，但還沒有在那裡跑過。
- 引擎的介面可能還會改；每個專案都保留自己的引擎副本，完成的片會一直算出一樣的畫面。

## 參與

歡迎用 issue 回報問題、提出想法或更正。用它做了作品？開一個[作品分享 issue](../../issues/new?template=showcase.yml)，附上做法。
如果你是本專案致謝的作者、希望更正或移除，也有對應的範本。在這個 repo 工作的代理請讀 [AGENTS.md](AGENTS.md)；送 pull request 前請跑 `npm test`。

## 授權與致謝

[MIT](LICENSE)。程式與文字都是為本專案寫的；依授權改寫了結構或做法的專案、CC BY 4.0 的資料、演算法與字型都列在 [CREDITS.md](CREDITS.md)。
範例裡的字型是 Noto Sans TC 與 Noto Serif TC 的子集（SIL Open Font License），授權檔放在旁邊。

這個 repo 的研究、文字與程式都是用 Claude Code 裡的 Claude Opus 5.5 完成的。Claude 與 Opus 屬於 Anthropic；這是社群專案，與 Anthropic 無關，也不代表 Anthropic。

如果 Claude Studio 幫你做出了作品，給一顆星能讓更多人找到它。
