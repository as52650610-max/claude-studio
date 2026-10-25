# 10 渲染與交付

## 核心規則：畫面是時間的純函式

所有高品質作品的引擎都遵守同一條規則：**給定時間 t，畫面只有一種答案**。真寻、mexicat、Multiplane、Faker MV、bad-time-mv 都是這樣做的。好處：

- 任何一幀都能單獨渲染、單獨檢查（`?t=83.5`）。
- 預覽等於成品。
- 可以平行渲染：好幾個瀏覽器各算一段，接起來不會有接縫。
- 動態模糊可以在任意子時間取樣。

### 決定性規則

| 不要 | 改用 |
|---|---|
| `Math.random()` | 有種子的 `rng(seed)`、`hash(i)` |
| `Date.now()`、`performance.now()` | 參數 `t` |
| `setTimeout`、`requestAnimationFrame` 驅動動畫 | 在 `render(t)` 裡直接算 |
| CSS transition、animation、`@keyframes`、Web Animations API | 每一幀由 `t` 算出樣式 |
| 跨幀累積的狀態（上一幀的位置＋速度） | 解析解；或從 0 固定步長算到 t；或預先模擬再烘焙 |
| 渲染時才載入字型、圖片、網路資源 | 全部在 `ready` 之前載入完成，放在專案資料夾裡；逐格圖層的圖片由 `renderAsync` 在每一幀擷取前載入（[見下方](#逐格圖層studio-frames)） |
| 每個子幀都不同的閃爍 | 用幀編號（不是子幀時間）當種子，模糊時才不會糊成灰 |

（綜合 xilo、Multiplane、Nyankomintsu、mexicat 的規則。）

本專案的 `node tools/studio.mjs lint projects/my-mv` 會靜態掃描這些寫法，並附上檔名與行號。`node tools/studio.mjs verify projects/my-mv` 會用不同順序、在新開的瀏覽器裡渲染同一批時間點兩次，比對像素是否一致。

### 其他常見陷阱

- **Canvas 依縮放倍率設定尺寸**：輸出 4K 時畫布要真的是 3840×2160，不然只是放大，會糊（Multiplane）。
- **WebGL**：`getContext('webgl2', { preserveDrawingBuffer: true })`，擷取前呼叫 `gl.finish()`；先確認一幀上著色器真的有作用（xilo）。
- **舞台要有不透明的背景色**，否則透明度加總小於 1 的地方在無頭瀏覽器裡會閃白（HyperFrames）。
- **縮放中的文字不要加 `will-change`**，會糊。
- `const` 的暫時性死區錯誤會讓 `ready` 永遠是 false，渲染器只會一直等（lemo-opuscar 的水彩陷阱）。

## 頁面契約

本專案的引擎會在頁面上公開：

```js
window.SHOT = {
  width: 1920, height: 1080, fps: 60,
  duration: 222.4,          // 秒
  ready: Promise,           // 字型、圖片、資料全部載入後 resolve
  render(t) { ... },        // 同步、純函式
  renderAsync(t) { ... },   // 同上，但先等這一幀用到的逐格圖層圖片載入
  cuts: [12.5, 30.1, ...],  // 硬切的時間點：動態模糊不會跨過它們
  meta: { title, song, ... }
};
```

這個契約和 Multiplane（Apache-2.0，路北路陈）相容，所以同一個頁面也可以交給 Multiplane 渲染（它有自適應動態模糊、累積景深、驗證工具）。本專案的渲染器也接受其他常見的寫法：`window.renderFrame(t)` ＋ `window.ready`（EGSECDA）、`window.render(t)` ＋ `window.DUR` ＋ `window.READY`（lemo-opuscar）、`window.seek(t)`（twoclipping）、`window.renderAt(t)`（mg-styles-15）。

只呼叫 `render(t)` 的渲染器遇到還沒載入的逐格圖層圖片會報錯，不會默默少畫一層；用了逐格圖層的頁面請用本專案的渲染器。

## 預覽

直接在瀏覽器打開 `film.html`（透過 `node tools/studio.mjs serve projects/my-mv`，因為瀏覽器不允許 `file://` 載入模組）。按 `?` 看快速鍵與網址參數（`?t=83.5` 從指定時間開始、`?w=1080&h=1920` 用直式尺寸預覽；全部列在[指令表](../skills/studio/references/commands.md)的 `serve`）。

可爱归归的心得：代理工作時你可以在螢幕上即時看到每個改動、跟它討論創意，「不同於影片模型的反覆抽卡，很愉快且完全有控制感」。

## 渲染器

```
node tools/studio.mjs render projects/my-mv                 # 全片
node tools/studio.mjs render projects/my-mv --from 30 --to 45 --preview   # 一段、低畫質快速預覽
node tools/studio.mjs stills projects/my-mv --at 0,12.5,48.2
node tools/studio.mjs sheet  projects/my-mv --every 1.5    # 聯絡表，每格標時間與歌詞
```

`tools/render.mjs` 沒有任何 npm 依賴：Node 內建的 WebSocket 直接透過 Chrome DevTools Protocol 控制本機的 Chrome 或 Edge。流程：

1. 啟動本機靜態伺服器（只聽 127.0.0.1）。
2. 開 N 個無頭瀏覽器，每個負責一段**連續的幀範圍**。
3. 等 `ready`，然後逐幀呼叫 `render(t)` 並擷取畫面。
4. 畫面直接用管線送進 ffmpeg 編碼成分段檔。
5. 所有分段接起來（不重新編碼），再接上音訊。

中斷後重跑會**跳過已完成的分段**。

### GPU

- 啟動時會印出瀏覽器實際使用的繪圖器（例如 `ANGLE (NVIDIA ..., Direct3D11)`）。
- Windows 預設使用 `--use-angle=d3d11`。
- **偵測到軟體渲染（SwiftShader、WARP、llvmpipe）時直接停止並說明原因**，除非加 `--allow-software`。軟體渲染可能慢上十倍，而且 WebGL 效果可能不同（EGSECDA 的做法）。
- 無頭模式拿不到 GPU 時，可以試 `--headful`（bad-time-mv）。

### 速度參考

| 作品 | 規格 | 速度 |
|---|---|---|
| EGSECDA（RTX 3080、Edge、D3D11） | 1080p | 3 個工作程序約每秒 31 幀；擷取 PNG 是瓶頸 |
| Faker MV | 1080p60，11,704 幀，每幀 16 個子樣本 | 4 個瀏覽器、20 段，全片約 20 分鐘 |
| Aadidev0 水彩短片 | 1080p24，3,936 幀 | 約 46 秒 |
| plotome 46 分鐘片（Blender） | 574 段 | 兩台電腦約 6 小時 |

一般規則：工作程序數量從 CPU 核心數的一半開始試；GPU 很忙時（例如同時在跑別的渲染）時間會成倍增加。

## 動態模糊

```
node tools/studio.mjs render projects/my-mv --blur 8 --shutter 0.5
```

- 每一幀在快門時間內取多個子幀（`--blur 8` 表示 8 個子幀，`--shutter 0.5` 表示 180° 快門），交給 ffmpeg 平均。
- **子幀不會跨過 `cuts`**：剪接點附近的子幀會被夾在剪接點的同一側，硬切保持乾淨。
- 子幀數越多越慢（8 個子幀約慢 8 倍）。建議：草稿不開，定稿 8，甩鏡很多的片 16。
- 自適應取樣、線性光混合等進階需求，可以改用 Multiplane 渲染同一個頁面。

## 編碼參數

| 輸出 | 參數 |
|---|---|
| 主檔（x264） | `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -tune film` |
| 主檔（NVENC） | `-c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq 16 -b:v 0 -spatial-aq 1 -temporal-aq 1` |
| 分享檔 | `-c:v libx264 -preset slow -crf 19`，AAC 256k |
| 預覽檔（`render --preview`） | 半解析度（`--scale 0.5`）、`-preset veryfast -crf 23`，底下燒上時間碼，方便回報「第幾秒」 |
| 中間檔 | ProRes 422 HQ（要再剪輯時） |

一定要加的：

- **BT.709 色彩**：ffmpeg 的縮放預設是 BT.601，顏色會偏。轉換時加 `scale=out_color_matrix=bt709:out_range=tv`，並標記 `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`（EGSECDA）。
- **關鍵幀間隔**：`-g` 設為 2 倍幀率，方便平台處理與拖曳。
- **音訊**：AAC 320k、48 kHz。音訊比影片短時用 `apad` 補靜音、再用 `-t` 裁到影片長度；**不要用 `-shortest`**，它會把片尾卡切掉。
- `-movflags +faststart`：網頁上可以邊下載邊播。
- 有大量顆粒與抖動線條時，主檔位元率會高很多（顆粒吃位元）；分享檔可以把顆粒加在 ffmpeg 而不是頁面裡。

## 直式版：重新排版，不是裁切

把 16:9 硬裁成 9:16 會切掉主體與歌詞。三種做法：

1. **一開始就用版面函式**（xilo）：鏡頭依 `film.width`、`film.height` 排版，同一份程式輸出兩種比例。預覽用 `?w=1080&h=1920` 檢查。
2. **焦點自動取景**（bad-time-mv）：把重要物件登記為焦點，每幀計算直式畫面要多寬、往哪裡移才能包住所有焦點，略微領先運動方向，遇到硬切就跳過平滑。
3. **重新合成**（EGSECDA）：16:9 不含歌詞渲染一次 → 1080×1920 畫面上放模糊放大的氛圍底 → 中央放 6:5 的裁切帶（圖形鏡頭放完整構圖）→ **歌詞依直式重新排版** → 上下加標題、歌手、進度細線。

直式版要避開平台介面：底部約 20% 和右側按鈕區不放重要內容。

## 交付清單

`node tools/studio.mjs deliver <專案>` 一次做完：子集化字型 → 檢查歌詞 → 混音 → 渲染 → 品管 → 字幕 → 封面 → `DELIVERY.md`。

| 檔案 | 必要 | 說明 |
|---|---|---|
| `out/<名稱>.mp4` | ✔ | 主檔：x264 CRF 16（`studio.json` 的 `render.crf` 可改），BT.709、AAC |
| `out/<名稱>_poster.png` | ✔ | 封面，`studio.json` 的 `posterAt` 選哪一幀。**第 0 幀也不能是黑畫面**，社群動態會顯示第一幀（brag 甚至把封面直接做成第 0 幀）。一整片底色也不行：歌的第一拍前常有半秒預備拍，放片名頁，第一拍再切進正片（品管會警告單色的第一幀） |
| `out/<名稱>.srt` | | 歌詞字幕（有歌詞時 `deliver` 會輸出；`lyrics export` 也能輸出 VTT、LRC） |
| `out/DELIVERY.md` | ✔ | 檔案清單、發布前的檢查清單、**沒有驗證的事**（聽感、好不好看）、重現資訊（輸入檔的 sha1、引擎與工具版本、GPU） |
| `qa/report.md` | ✔ | 品管數字與圖 |
| `CREDITS.md` | ✔ | 見 [13](13-rights.md) |
| `out/<名稱>_preview.mp4` | | 半解析度預覽（`studio render --preview`） |
| 分享檔、直式版 | | 需要時另外輸出：分享檔用上面「編碼參數」的設定重新壓，直式版見上一節 |

交付前最後一步：**實際播放輸出的檔案**（不是預覽頁），從頭到尾，有聲音。檢查第一幀、轉場、畫面最密的一幀、最後一幀（haiy）。

## 其他工具做的畫面

引擎畫不好的東西（真的 3D、流體、角色表演、實拍）交給擅長的工具做，再接回片子。每一鏡由誰畫在 G2 決定（三個方案的「技術路線」，再寫進分鏡的「畫面」欄），最冒險的那一鏡在 G4 樣片就測。

| 做法 | 什麼時候 | 片子保留什麼 |
|---|---|---|
| 引擎畫（預設） | 歌詞 MV、動態字體、科普、介面動態 | 全部 |
| **逐格圖層**：別的工具畫一層，引擎疊上去 | 一個 3D 物件、一個生成的角色、一段綠幕實拍 | 時間、文字、圖層以外的世界、聲音、品管、`verify` |
| **整支片在別的工具做** | 你熟悉 Remotion、Blender 或 HyperFrames，或整支片都是 3D | 時間鎖定、混音、品管 |

本專案**不包裝**這些工具，沒有 `studio blender`、`studio comfy`。每個工具用它自己的介面（命令列、MCP、API、視窗），它自己的錯誤訊息才看得到；包一層只會把錯誤藏起來，工具一改版就壞。本專案只做兩端：把時間交出去（`studio timing`），把畫面接回來並量結果（`studio frames`）。

### 逐格圖層：`studio frames`

```
node tools/studio.mjs frames projects/my-mv renders/robot/                       # Blender 的輸出資料夾
node tools/studio.mjs frames projects/my-mv clips/dancer.mp4 --key auto --name dancer
```

- 來源可以是影片或編號圖片（Blender 的輸出資料夾）。影片保持原本的幀率，引擎依時間選幀：24 fps 的素材放進 30 fps 的片子不必先轉。旗標、輸出與預設值見[指令表](../skills/studio/references/commands.md)的 `frames`。
- 影片的色彩矩陣從檔案標記讀；沒有標記時依畫面高度判斷（720 行以上當 BT.709）並在報告裡說明，顏色不對就加 `--matrix`。

鏡頭裡（完整 API 見 [engine/README.md](../engine/README.md#frame-sequences)）：

```js
const clip = await api.loadFrames('frames/dancer');
// 在 draw(ctx, s) 裡：放在畫面裡、腳貼著下緣
clip.draw(ctx, s.local, ...clip.fit(s.width, s.height, 'contain', 0.5, 1));
```

畫面仍然只由 t 決定。渲染器呼叫 `SHOT.renderAsync(t)`：先畫一次，等這一幀用到的圖片載入，再畫一次，所以亂序渲染、平行渲染和 `verify` 都照常成立。圖片缺檔或壞掉會直接報錯，指名哪個檔、第幾幀，不會默默少一層。預覽時還沒解碼的幀先顯示最近的一張，到了再重畫。

### 去背：交給 ffmpeg，我們量結果

`--key auto|green|blue|#rrggbb` 用 ffmpeg 的 `chromakey` 去背，再用 `despill` 壓掉邊緣的溢色。去背演算法不是本專案寫的；本專案做的是**量**：

- **去背前**：在六張樣本幀的畫面邊緣量背景色。量的是 chromakey 實際運算的色彩空間（同樣縮放後的 Y'CbCr，依來源標記的矩陣），所以不會因為 BT.601 和 BT.709 的換算而偏掉。再依背景顏色的分散程度定門檻（`similarity`）和柔邊寬度（`blend`）；主體顏色離背景太近時會警告。
- **去背後**：畫面邊緣還剩多少背景、主體裡有沒有被挖空的洞、背景上的雜點、半透明的比例、邊緣的溢色。超過門檻的每一項都會說該怎麼辦。
- `qa/frames_<名稱>.png`：三排並列，原圖／去背後放在棋盤格上／遮罩。**用之前打開來看。**
- 透明的圖縮放前先預乘 alpha，邊緣不會出現黑邊。

本專案的自我測試用一段合成的綠幕片（不均勻的光、感光雜訊、4:2:0 色度取樣的 H.264）對照真正的遮罩：量到的背景色和真值差不到 1 個色階、IoU 0.974、平均 alpha 誤差 0.005。真實拍攝的素材一定比這難，所以報告和對照圖一定要看。

素材的準備比參數重要：

- 綠幕打光均勻、主體離背景遠一點（減少反光溢色）、主體不要穿綠色或藍色、鏡頭鎖定。生成影片用 `#00B140` 純色背景，不要地板與陰影（見 [07](07-style.md)）。
- 去背結果不好時，先改素材（補光、換背景色、生成時要求純色背景），再調 `--similarity`、`--blend`。
- 頭髮、煙、玻璃、動態模糊這類半透明的東西，色鍵本來就做不好：讓工具直接輸出透明（Blender 的 Film → Transparent、RGBA 的 PNG；生成工具的去背節點），再用 `studio frames` 接回來，不加 `--key`。

### 時間表：`studio timing`

```
node tools/studio.mjs timing projects/my-mv                                   # out/timing.json、.csv、.md
node tools/studio.mjs timing projects/my-mv --fps 24 --no-text --out renders/timing.json
```

段落、小節、拍、每一行歌詞、`cues`、停頓、重擊和鏡頭，全部用**片子的時間**（已經套用 `offset`、`lyricOffset`）列出秒數與幀號。一個時間點是最接近的那一幀（`frame`）；一段範圍從它的第一幀（`startFrame`）到下一段的第一幀（`endFrame`），`frames` 是張數。數字是用引擎自己的函式算的（專案有自己的引擎副本就用副本），所以別的工具會落在和片子同一幀。

- **生成影片要多長**：`timing.md` 的鏡頭表有每一鏡的秒數與幀數，生成前就照這個長度要，不要生成完再硬裁。
- **Blender**：在 Blender 的 Python 裡讀 `timing.json`，設定這一鏡的長度，把小節做成時間軸標記，動畫對著標記做：

  ```python
  import bpy, json
  T = json.load(open(bpy.path.abspath('//timing.json'), encoding='utf-8'))
  scene = bpy.context.scene
  assert abs(scene.render.fps / scene.render.fps_base - T['fps']) < 1e-6, 'run studio timing --fps <the scene fps>'
  shot = next(s for s in T['shots'] if s['id'] == 'S07')   # the whole film: first, n = 0, T['frames']
  first, n = shot['startFrame'], shot['frames']
  scene.frame_end = scene.frame_start + n - 1
  for b in T['bars']:
      if first <= b['frame'] < first + n:
          scene.timeline_markers.new(f"bar {b['bar']}", frame=scene.frame_start + b['frame'] - first)
  ```

  用片子的幀率渲染最準：場景的第 k 幀剛好落在片子的第 `startFrame + k` 幀，鏡頭裡用 `clip.draw(ctx, s.local, …)` 播放即可。場景的幀率不同時（`timing --fps`），誤差在一個圖層幀以內，接回時要加 `--fps <場景幀率>`（圖片序列預設用片子的幀率）。正式渲染用無頭模式（`blender -b scene.blend --python render.py`，或 `-a` 渲染整段動畫），輸出 PNG 序列，再用 `studio frames` 接回。
- **Remotion**：把 `timing.json` 放進專案、`import` 進來，用 `useCurrentFrame()` 和 `startFrame` 比較；`<Composition>` 的 `fps` 要和 `--fps` 一樣。
- **ComfyUI**：用它自己的介面或 HTTP API（`/prompt` 送出工作流程、`/history` 取結果）。輸出的圖片序列或影片用 `studio frames` 接回。模型各有授權，有些只限非商業使用，寫進 `CREDITS.md`。

### 整支片在別的工具做

時間照樣從本專案出去，聲音和品管照樣回到本專案：

```
node tools/studio.mjs timing projects/my-mv --fps 30                  # 交出時間
node tools/studio.mjs mix projects/my-mv --video renders/film.mp4     # 音效寫在 data/sfx.json；片長與幀率取自影片
ffmpeg -i renders/film.mp4 -i projects/my-mv/audio/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart renders/final.mp4
node tools/studio.mjs qa projects/my-mv --video renders/final.mp4     # 沒有渲染清單時，剪接點從畫面偵測
```

`mix --video` 做出的 `audio/mix.wav` 和影片一樣長，所以接回去時不需要 `-shortest`（見上面「編碼參數」）。

| 工具 | 做法 | 適合 |
|---|---|---|
| Multiplane | 同一個 `window.SHOT` 頁面，`multiplane render` | 需要自適應動態模糊、景深、確定性驗證 |
| HyperFrames | HTML＋GSAP 時間軸，Studio 介面可直接改字改色 | 產品發表、介面動態、模板化 |
| Remotion | React 元件，`useCurrentFrame()` | 長片、多場景、要讀產品程式碼（注意公司授權） |
| Blender | `blender -b scene.blend --python render.py`，動畫對著時間表的標記做 | 重度 3D |
| Manim | Python 數學動畫 | 推導、幾何 |

所有路線的共同點：最後都是一串幀＋ffmpeg，所以本專案的品管工具（`qa`）對任何路線的輸出都能用。
