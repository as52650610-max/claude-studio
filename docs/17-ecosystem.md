# 17 工具與生態

2026 年 10 月的快照。星數會變，授權請以各專案的最新授權檔為準。「只參考想法」表示授權不允許（或未表明允許）把程式碼或文字複製進 MIT 專案。

## 渲染器與框架

| 工具 | 授權 | 是什麼 | 什麼時候用 |
|---|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes)（HeyGen，約 7 萬星） | Apache-2.0 | 「寫 HTML，渲染影片，為代理而做」；Studio 可直接改字改色並寫回 HTML | 產品發表、介面動態、模板化的系列片 |
| [Remotion](https://www.remotion.dev/) ＋ [官方技能](https://github.com/remotion-dev/skills) | Remotion 授權（部分公司需購買） | React 元件組成影片，`useCurrentFrame()` | 長片、多場景、讀產品程式碼 |
| [Multiplane](https://github.com/LBEILC/Multiplane)（路北路陈） | Apache-2.0 | 把 `window.SHOT` 頁面逐幀渲染；自適應動態模糊、累積景深、渲染前靜態檢查、確定性驗證、可續傳 | 本專案頁面的進階渲染器；需要動態模糊與驗證時 |
| [papermotion](https://github.com/francozanardi/papermotion) | MIT | 「範本不是函式庫」：專案擁有自己的引擎副本；骨架、步態、程序化聲音 | 角色動畫短片 |
| Manim（社群版） | MIT | Python 數學動畫 | 推導、幾何、公式 |
| [Blender](https://www.blender.org/) | GPL（輸出歸你） | 3D 建模、材質、燈光、物理、渲染 | 重度 3D、黏土、流體 |
| [blender-mcp](https://github.com/ahujasid/blender-mcp)（`mcp-for-blender`） | MIT | 讓 Claude 操作 Blender、多角度檢查自己的成果 | 互動建場景；預設會送匿名使用紀錄，設 `DISABLE_TELEMETRY=true` 可關閉 |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | GPL-3.0（輸出歸你；模型另有授權） | 節點式的圖像與影片生成，跑在本機 GPU，有 [HTTP API](https://docs.comfy.org/development/comfyui-server/comms_routes) | 生成角色、質感、背景素材；本專案只偵測它有沒有在跑，不包裝、不替你啟動 |

本專案的引擎與渲染器（`engine/`、`tools/render.mjs`）是 MIT、零依賴，頁面契約與 Multiplane 相容。這些工具做的畫面怎麼接回片子，見 [10](10-render.md)。

## MV 管線與開源作品

| 專案 | 授權 | 學什麼 |
|---|---|---|
| [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) | MIT（歌曲與歌詞不在內） | 依歌詞內容定址的時間軸、自適應動態模糊、全曲對齊流程、每場一檔方便平行 |
| [Nyankomintsu/world-execute-me-lyric-mv](https://github.com/Nyankomintsu/world-execute-me-lyric-mv) | 程式 MIT；剪影 CC BY-NC-SA 4.0 | 只放時間不放歌詞、光敏預算、視覺回歸測試、交接簡報的寫法 |
| [EGSECDA/vocaloid-style-mv-pipeline](https://github.com/EGSECDA/vocaloid-style-mv-pipeline) | MIT | 渲染契約、編碼參數、BT.709、直式重新排版、特效食譜、光敏規則 |
| [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | MIT | 導演／分鏡／動畫／渲染四個技能；節拍工具的歧義報告；LRC 規則；章節子代理 |
| [petergpt/painted-rickroll](https://github.com/petergpt/painted-rickroll) | MIT | WebGL 筆觸渲染、程式寫的配樂、以拍數為函式的編舞、離線「聽」音訊的除錯工具 |
| [2606156052/Pdoom-video-anime-version](https://github.com/2606156052/Pdoom-video-anime-version) | ISC | 影片模型底片＋riso 賽璐珞轉描；注意力裝置；嘴型同步檢查 |
| [makevoid/motion-graphics-music-video-skill](https://github.com/makevoid/motion-graphics-music-video-skill) | MIT | 付費生成＋程式合成；綠幕精靈規則；生產波次；成本控制 |
| [seasnakes/world.execute-me-wallpaper](https://github.com/seasnakes/world.execute-me-wallpaper) | MIT | 互動網頁／桌布版本當第二種成品 |
| JohnHeibel/PDoomVideo | 未附授權 | 只參考想法；許多 MV 從它分支 |
| guiguisocute/bad-time-mv | 未附授權 | 只參考想法：小節定址、編舞驗證器、直式自動取景 |
| v1Ta44/netsu-ijou-pv | CC BY-NC 4.0 | 只參考想法：單一參數調色、角色鎖定、AI 去背、樂譜對齊 |
| WinterArc21/Battle-of-Austerlitz-Film | 未附授權 | 只參考想法：旁白驅動的時間軸、從畫面推導音效 |
| FrostNovaOrg/world-execute-web（穆阿蒂布） | AGPL-3.0 | 只參考想法：304 鏡的 world.execute(me) 網頁版 |
| [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | MIT | p5.brush 水彩起手包、角色素材與表演指南 |
| op7418/guizang-product-video-skill | AGPL-3.0 | 只參考想法：音效特徵點同步公式、依角色壓低音樂、審查用 ffmpeg 指令 |

## 風格庫

| 專案 | 授權 | 內容 |
|---|---|---|
| [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | 程式與文件 MIT；示範片 CC BY 4.0 | 59 種風格，每種一份風格檔與示範片；導演規則、技術規則；外掛市集安裝 |
| [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15)（悬剑听泉） | MIT | 15 種動態設計風格，每種的提示、原始碼、評審量表、程式合成音訊 |
| 路北路陈 設計科普系列 | 影片說明欄 | 每集一張風格卡與「複製給 AI」的描述 |
| 本專案 `styles/` | MIT | 從零寫的風格卡＋示範鏡頭 |

## 技能與提示

| 專案 | 授權 | 內容 |
|---|---|---|
| [latent-spaces/brag](https://github.com/latent-spaces/brag)（約 1.1 萬星） | MIT | 一個指令把專案做成發表短片；創作規則、聲音規則、音樂提示點分析 |
| [Kianzzz/xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) | MIT | 三方案＋預覽 → 確認 → 簡報 → 逐鏡製作 → 自評；技術選擇表 |
| [feitangyuan/onetake](https://github.com/feitangyuan/onetake) | PolyForm Noncommercial | 只參考想法：一鏡到底、延續度量測 |
| [hypit-ai/hypit](https://github.com/hypit-ai/hypit)（約 2.5 萬星） | 附條件的 Apache-2.0 | 只參考想法：複製爆款影片的工作流、專案檔案的分工 |
| [opus-pro/opus-video-studio](https://github.com/opus-pro/opus-video-studio) | 範本 MIT；技能未附授權 | 43 個範本；付費生成的紀律；動態規則 |
| [OpenMontage](https://github.com/calesthio/OpenMontage)（約 7.1 萬星） | AGPL | 大型影片代理工具組 |

## 案例與提示詞清單

| 清單 | 授權 | 內容 |
|---|---|---|
| [athemeroy/awesome-claude-5-5-videos](https://github.com/athemeroy/awesome-claude-5-5-videos) | CC BY 4.0 | 168 個精選案例＋互動數據 |
| [Li-Evan/awesome-opus-5.5-video-prompts](https://github.com/Li-Evan/awesome-opus-5.5-video-prompts) | CC BY 4.0 | 334 筆，含觀看、收藏、提示類型、作者的時間與成本 |
| [yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | MIT | 703 筆，含技術標籤 |
| [billyhetech/awesome-opus5-5-videos](https://github.com/billyhetech/awesome-opus5-5-videos) | MIT | 2,542 筆，含觀看數快照 |
| [zhuyansen/awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) | CC0 | 影片技能目錄，依星數排序 |

## 音訊與歌詞

| 工具 | 用途 | 注意 |
|---|---|---|
| ffmpeg | 解碼、編碼、混音、響度、聯絡表、頻譜圖 | 本專案的必要工具 |
| Demucs | 人聲／鼓／貝斯分離 | 選用；需要 PyTorch |
| faster-whisper | 語音辨識、逐字時間 | 選用；不要開 VAD |
| wav2vec2、MMS 等強制對齊模型 | 逐字對齊 | 模型權重的授權各不相同，商用前確認 |
| librosa | 節拍與頻譜分析 | 本專案的分析器不需要它 |
| CC0 取樣音色（VCSL 等）、Kenney 音效 | 比純合成自然 | 每個音色庫授權不同，使用前確認 |

## 旁白（TTS）

| 服務 | 特點 |
|---|---|
| edge-tts | 免費、線上；「AI 腔」明顯 |
| Kokoro | 離線、英文 |
| Gemini TTS | 便宜；沒有逐字時間戳，要事後對齊 |
| MiniMax speech | 中文表現好；路北路陈、废才俱乐部使用 |
| ElevenLabs | 品質好、有聲音設計 |
| CosyVoice、Qwen3-TTS | 中文；有本機版本 |

比較時可以參考 Artificial Analysis 的 TTS 排行榜（阿珍的建議）。

## 工作台

| 工具 | 用法 |
|---|---|
| Obsidian ＋ Claudian 外掛 | plotome 的做法：在筆記旁邊和 Claude Code 對話；Canvas 當分鏡板；Bases 當問題看板；鎖定已凍結的段落 |
| HyperFrames Studio、Remotion Studio | 直接拖拉調整參數；Remotion Studio 會寫回程式，先 commit |
| 本專案預覽頁 | `studio serve`，鍵盤逐幀檢查、除錯資訊 |

## 本專案的定位

在這份生態裡，**MV 類的開源工具最少**：PDoomVideo 約 2,500 星，其他都在 200 星以下；沒有一個 MIT、以中文為優先、從節拍與歌詞工具到品管與外掛安裝都完整的歌詞 MV 工作室。claude-studio 想補上的就是這個空缺：

- 可信的時間：節拍分析（含歧義報告）、歌詞對齊、點擊預覽
- 可重現的畫面：零依賴引擎與渲染器，契約和 Multiplane 相容
- 接得上別的工具：逐格圖層（`studio frames`，去背交給 ffmpeg、遮罩有量測）、時間表（`studio timing`），不包裝任何工具
- 可檢查的品質：閃爍、響度、同步、可讀時間、聯絡表、獨立評審
- 中文優先：直排、中英混排、字型檢查、繁中知識庫
- 誠實的版權：只放時間不放歌詞、CREDITS 範本、AI 標示
