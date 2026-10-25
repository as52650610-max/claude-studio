# CREDITS

## 音樂（Music）

- 曲名：從一首歌到一支 MV（示範曲，120 BPM，G 大調，16 小節，35 秒）
- 來源：`tools/py/music.py` 依 `music.json` 以 seed 7 生成，含人聲旋律 45 個音
- 權利狀態：本專案自有，MIT；可自由使用

## 歌詞（Lyrics）

- 五句原創中文歌詞與英文翻譯，由 Claude（Opus 5.5）為這支片撰寫；本專案自有，MIT
- `data/lyrics.json` 標了 `"publishable": true`，所以歌詞檔進版控
- 每個字的時間是人聲分軌量到的起音（`studio analyze --stems`），不是手打的

## 字型（Fonts）

- Noto Sans TC、Noto Serif TC —— SIL Open Font License 1.1（授權全文見 `fonts/OFL.txt`）。Noto is a trademark of Google LLC.
- 只收錄片中用到的字（`studio fonts` 子集化）；Noto Serif TC 只用在水墨卡

## 風格（Styles）

副歌的六種模樣是本 repo 的六張風格卡（MIT）。`shots/styles/` 是各卡示範鏡頭的原樣複本，只改了引擎的匯入路徑，
由 `tests/examples.test.mjs` 確保一致。

| 複本 | 風格卡 |
|---|---|
| `shots/styles/riso.js` | [`styles/riso-print`](../../styles/riso-print/) |
| `shots/styles/pixel.js` | [`styles/pixel-crt`](../../styles/pixel-crt/) |
| `shots/styles/paper.js` | [`styles/paper-cutout`](../../styles/paper-cutout/) |
| `shots/styles/blueprint.js` | [`styles/blueprint`](../../styles/blueprint/) |
| `shots/styles/ink.js` | [`styles/ink-and-paper`](../../styles/ink-and-paper/) |
| `shots/styles/swiss.js` | [`styles/swiss-kinetic`](../../styles/swiss-kinetic/) |

## 音效（Sound effects）

| 聲音 | 來源 | 授權 |
|---|---|---|
| click、tick、pop、typing、whoosh、bell | `tools/py/sfx.py` 程式生成 | MIT |

## 工具（Tools）

- claude-studio —— MIT License

## AI 使用聲明（AI disclosure）

- 畫面：由 Claude（Opus 5.5）撰寫程式碼產生；沒有使用影像生成模型，片中沒有任何圖片檔
- 聲音：音樂與音效都由本專案的程式生成
- 文字：歌詞、翻譯與畫面文字由 Claude 撰寫
- 人工：全自動模式；最終審片由人完成：使用者看過、聽過並認可（2026-10-24）
