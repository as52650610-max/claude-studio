# 18 參考資料

這份知識庫整理自 Claude Opus 5.5 發布（2026-09-22）到 2026-10-24 之間的公開資料。播放、收藏、星數都是 10 月中下旬的快照，之後一定會變。內容都經過改寫；想看原話請點原始連結。

## 怎麼挑、怎麼讀

- **Bilibili**：依播放數排序，再用**收藏率**（收藏 ÷ 播放）判斷品質。每支看說明欄、置頂留言與熱門留言；教學影片讀完整逐字稿。
- **跳過的內容**：搬運與標題誇大、沒有實際流程的影片；中轉 API 的推廣（只採用其中的製作流程，不採用購買管道的建議）。
- **對照組**：播放很高、但不是 Opus 程式路線的作品（影片模型的迷因混剪、AI 音樂比賽），只拿來說明差別。
- **「一句話生成」的標題**：以作者自己在說明欄、留言、教學裡的說法為準。多數其實事先準備好素材，也修改了很多輪。
- **GitHub**：讀 README、文件與主要程式碼；**沒有執行**任何下載的程式；授權逐一核對授權檔。
- **X**：透過公開資料集讀作者本人在串文裡的說明（見[資料集](#案例與提示詞資料集)）。

「用在」欄是引用它的章節編號；「背景」表示讀過、影響了整體判斷，但沒有被單獨引用。

## 官方

| 來源 | 內容 | 用在 |
|---|---|---|
| [Introducing Claude Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5)（Anthropic，2026-09-22；2026-10-24 讀取） | 價格、effort 等級、預設 medium、思考不能關閉、快速模式 | 02、14 |
| [Claude API 價格](https://platform.claude.com/docs/en/about-claude/pricing)（經 Claude Code 內建的 claude-api 參考，2026-10-06 快取） | 各模型輸入、輸出、快取讀寫的價格 | 02、14 |
| [Claude Code 外掛](https://code.claude.com/docs/en/plugins)、[建立外掛市集](https://code.claude.com/docs/en/plugins/create-marketplace)（2026-10-24 讀取） | 外掛結構、`marketplace.json`、安裝指令 | README、外掛 |

「ultracode」不在官方公告裡，是第三方的說法，本知識庫都標為非官方（見 [02](02-setup.md)）。

## Bilibili：教學與流程

| 影片 | 作者 | 內容 | 播放／收藏 | 用在 |
|---|---|---|---|---|
| [BV1ALnw6YEM7](https://www.bilibili.com/video/BV1ALnw6YEM7) | Git源宝 | 為什麼老是刷到 AI 動畫科普：五段式提示的拆解 | 82.6 萬／4.8 萬 | 06、12 |
| [BV1j8aS6UEty](https://www.bilibili.com/video/BV1j8aS6UEty) | 来真的（阿珍，LeaderAI） | 39 分鐘保姆級教學：環境、提示、省 token | 9.4 萬／8,500 | 02、03、12、14、16 |
| [BV1vRHa63EYg](https://www.bilibili.com/video/BV1vRHa63EYg) | 雨季未来Rainorb | 讓 Opus 自己說明它怎麼做影片 | 8.3 萬 | 背景 |
| [BV1uBpg6qEYM](https://www.bilibili.com/video/BV1uBpg6qEYM) | 汤姆CC的AI工具箱 | Vibe 知識怎麼做：同一個提示、播放差十倍的四個原因 | 5.6 萬／5,072 | 01、03、04、06、07、08、15 |
| [BV1isH76vEri](https://www.bilibili.com/video/BV1isH76vEri) | 阿珍（LeaderAI） | 進階：爆款拆解、聲音複製、音色設計 | 4.3 萬／4,920 | 09、12 |
| [BV1dcaW6rEbs](https://www.bilibili.com/video/BV1dcaW6rEbs) | 爱学习的乔同学 | 用 Remotion 做影片的技術解讀 | 3.2 萬 | 背景 |
| [BV1TYHa64Eax](https://www.bilibili.com/video/BV1TYHa64Eax) | 奇奇妙妙的类人生物 | 做《Bad Apple》的失敗經驗：交接文件、重裝系統 | 3.0 萬 | 02、12、16 |
| [BV1wvJB6aEp5](https://www.bilibili.com/video/BV1wvJB6aEp5) | 言说新事 | Remotion 教學：從安裝技能到實作；成本由精確度決定 | 2.5 萬／3,402 | 01、02、12、14、16 |
| [BV181pt6REWv](https://www.bilibili.com/video/BV181pt6REWv) | 阿珍（LeaderAI） | 110 分鐘直播：全流程教學 | 2.4 萬／1,943 | 02 |
| [BV19gp16kEAc](https://www.bilibili.com/video/BV19gp16kEAc) | 卡尔的AI沃茨 | 程式動畫的零基礎教學 | 2.2 萬／2,600 | 07、08、12 |
| [BV1Thhd6EErA](https://www.bilibili.com/video/BV1Thhd6EErA) | 回到Axton | 影片模型做不到的程式動畫 | 1.8 萬 | 01、16 |
| [BV1YCHW62ECA](https://www.bilibili.com/video/BV1YCHW62ECA) | 雨季未来 | 分析 661 支 Vibe 知識影片：風格趨同、迷因 BGM、可讀時間 | 1.8 萬 | 16 |
| [BV1LTaU6yEF2](https://www.bilibili.com/video/BV1LTaU6yEF2) | ArbiFX | 把程式影片轉成 After Effects 工程 | 1.6 萬／1,892 | 背景 |
| [BV1EAHt6hEci](https://www.bilibili.com/video/BV1EAHt6hEci) | T8star-Aix | 製作流程公開：獨立評審 | 1.6 萬 | 11、16 |
| [BV1ZJpg6UE21](https://www.bilibili.com/video/BV1ZJpg6UE21) | riverisbuilding | 自動剪輯的工具鏈 | 1.5 萬／1,574 | 背景 |
| [BV14vaa6HEHm](https://www.bilibili.com/video/BV14vaa6HEHm) | 路北路陈 | 38 則訊息復刻介面：回饋的五種方法、凍結基線、token 帳本 | 1.4 萬／1,132 | 03、11、14、16 |
| [BV1g8Jy6FEpD](https://www.bilibili.com/video/BV1g8Jy6FEpD) | 路北路陈 | 開源渲染器 Multiplane 的實測 | 1.4 萬／1,936 | 01、10、16、17 |
| [BV1wuWA6MEF8](https://www.bilibili.com/video/BV1wuWA6MEF8) | 废才俱乐部Club | Opus 當導演，兩小時跑完 AI 短劇流程 | 1.3 萬／1,020 | 06、07、14、15、16、17 |
| [BV1Z2aD6REnq](https://www.bilibili.com/video/BV1Z2aD6REnq) | Ba1ya白鸦 | 用 HyperFrames 做片頭 | 1.2 萬／1,664 | 背景 |
| [BV1v6HZ62Eig](https://www.bilibili.com/video/BV1v6HZ62Eig) | 穆阿蒂布 | 杜比視界重製版的 25 分鐘解說與開源 | 1.2 萬 | 14、17 |
| [BV1efHC6METN](https://www.bilibili.com/video/BV1efHC6METN) | 路北路陈 | 設計科普系列是怎麼做的：兩個模型的分工、工作流程 | 1.1 萬 | 02、06 |
| [BV1LWas61EVb](https://www.bilibili.com/video/BV1LWas61EVb) | Nate Herk（中文配音） | YouTube 影片 7jHXoPGnA4c 的轉載：免費技能 | 1.0 萬 | 12 |
| [BV1VwaH6PEnU](https://www.bilibili.com/video/BV1VwaH6PEnU) | 仪绘士BY | Three.js 建模＋Blender 打光＋Remotion 包裝 | 9,848／1,005 | 07 |
| [BV1ygaL6YEy1](https://www.bilibili.com/video/BV1ygaL6YEy1) | SeASnAkEss | world.execute(me) MV 製作教學：雲端版的限制、匯出原始檔 | 3,859 | 02、12、16 |
| [BV1BgaE6cEha](https://www.bilibili.com/video/BV1BgaE6cEha) | amy师婧 | 產品發表片拆解：先寫 timing.json 節拍器 | 3,500／285 | 04 |
| [BV1mUnV6zEEW](https://www.bilibili.com/video/BV1mUnV6zEEW) | 十元钱钱 | AI 歌曲 MV 教學：「AI 沒有聽音樂，它在算數學」 | 3,200 | 01、04、12、16 |
| [BV1kmHi6aEE7](https://www.bilibili.com/video/BV1kmHi6aEE7) | Tao | 復刻手繪口播的五步驟：試、改、拆、接、做 | 1,200 | 07、16 |
| [BV1FEpW6ZExu](https://www.bilibili.com/video/BV1FEpW6ZExu) | Lala罐头 | 廣告片的五段提示公式 | 1,200 | 03、12 |
| [BV1xFnt6zE3K](https://www.bilibili.com/video/BV1xFnt6zE3K) | plotome | 46 分鐘動畫的完整製作流程（32 分鐘） | — | 幾乎每一章 |
| [BV1ngae6jEg5](https://www.bilibili.com/video/BV1ngae6jEg5) | 设计师言炎 | 歌詞 MV 的六個步驟：先對時間、列出不確定處 | — | 02、05、06、11、16 |
| [BV1kLn36WEN6](https://www.bilibili.com/video/BV1kLn36WEN6) | 悬剑听泉 | 流程與提示分享；15 種風格的評審量表 | — | 01、03、11、12、13、16、17 |

## Bilibili：歌詞 MV 與 PV

| 影片 | 作者 | 內容 | 播放／收藏 | 用在 |
|---|---|---|---|---|
| [BV16MJY6yEKq](https://www.bilibili.com/video/BV16MJY6yEKq) | BlackDawn | 《千本櫻》MV：Remotion＋Blender MCP＋ComfyUI | 75.9 萬／6.9 萬 | 01、14、15 |
| [BV186pc65E68](https://www.bilibili.com/video/BV186pc65E68) | 真寻Mahiro（GitHub：Nyankomintsu） | world.execute(me) 4K60，13,017 幀，87 鏡 | 59.2 萬／3.2 萬 | 01、10、11、14、15 |
| [BV12Zhm6oE6m](https://www.bilibili.com/video/BV12Zhm6oE6m) | sadssxa | 群論之美宣傳片：撕掉一角仍能掃描的 QR code | 46.0 萬／1.8 萬 | 01 |
| [BV1SgaY64EG5](https://www.bilibili.com/video/BV1SgaY64EG5) | 穆阿蒂布 | world.execute(me)：13,015 幀、歌詞對應真實數學現象 | 39.0 萬／2.2 萬 | 01、06、11、14、15 |
| [BV18ta86EEHb](https://www.bilibili.com/video/BV18ta86EEHb) | 白雪仅当雪白 | 轉載 mexicat 的 P(doom) MV（註明來源） | 37.3 萬 | 13、15 |
| [BV1vbaf6gE8Q](https://www.bilibili.com/video/BV1vbaf6gE8Q)、[BV1PUHf6cEG6](https://www.bilibili.com/video/BV1PUHf6cEG6)、[BV1jjaa6eEBG](https://www.bilibili.com/video/BV1jjaa6eEBG) | 可爱归归 | Undertale 系列（MTT、Asgore、Sans） | 32.0 萬、22.8 萬、13.9 萬 | 03、07、10、14、15、16 |
| [BV1m2aB6TEXC](https://www.bilibili.com/video/BV1m2aB6TEXC) | 时代亻先驱者 | 《達拉崩吧》PV | 23.5 萬 | 01、06、16 |
| [BV1EDhW6LEYU](https://www.bilibili.com/video/BV1EDhW6LEYU) | pixel像素直播间 | 轉載 PDoomVideo（註明來源） | 15.4 萬 | 13 |
| [BV1jWa46WE2x](https://www.bilibili.com/video/BV1jWa46WE2x) | fttawa | 《バカみたいに》PV：單一提示、約兩小時 | 10.3 萬 | 14、16 |
| [BV11unF6fEmq](https://www.bilibili.com/video/BV11unF6fEmq) | — | 《三千年夜》愛麗絲 MV：Remotion、12,776 幀 | 4.1 萬／5,701 | 02、03、05、07、14、15 |
| [BV1RHhU63ESq](https://www.bilibili.com/video/BV1RHhU63ESq) | SeASnAkEss | world.execute(me) MV（原始碼開源） | 3.6 萬 | 02、12、16 |
| [BV1idp46FEEo](https://www.bilibili.com/video/BV1idp46FEEo) | v1Ta44 | 《熱異常》PV：圖像生成元件＋程式繪製（開源） | 3.2 萬 | 04、05、07、13、16 |
| [BV1zcHr6uEyd](https://www.bilibili.com/video/BV1zcHr6uEyd) | 殇璃凉意 | Faker 生涯 MV：逐字對齊、子幀動態模糊、文字遮擋檢查 | 2.4 萬 | 05、08、10 |
| [BV1FmHe6RE13](https://www.bilibili.com/video/BV1FmHe6RE13) | 近步抱告_ | ヨルシカ《アルジャーノン》：說明欄是 Claude 的導演闡述 | 2.4 萬 | 15 |
| [BV1zDaa6gE37](https://www.bilibili.com/video/BV1zDaa6gE37) | — | Limbus Company × Mili《Hero》紙偶劇場：Python 畫每一幀 | 2.3 萬／2,001 | 背景 |
| [BV1kkaa61ELP](https://www.bilibili.com/video/BV1kkaa61ELP) | — | 大肥鱼 MV：token 多花在 Spine 骨架 | 2.2 萬／1,000 | 07 |
| [BV1vthX6XEwm](https://www.bilibili.com/video/BV1vthX6XEwm) | 南辰燏炚 | world.execute(me)：說明欄附「怎麼看這支片」 | 2.0 萬 | 01、09、11、16 |
| [BV1SQHW63E3d](https://www.bilibili.com/video/BV1SQHW63E3d) | — | 《皇牌空戰 8》全 3D 空戰 MV，沒有影片模型 | 1.6 萬 | 背景 |
| [BV1fSpK6kEjS](https://www.bilibili.com/video/BV1fSpK6kEjS) | — | 《melt》漫畫風 PV：Opus 設計所有圖像提示 | 1.5 萬 | 16 |
| [BV1whHx6eE1W](https://www.bilibili.com/video/BV1whHx6eE1W) | 木香花樹 | ヨルシカ PV：52 小時、約 $180 | 1.4 萬／857 | 14 |
| [BV1jn4y1Z7hu](https://www.bilibili.com/video/BV1jn4y1Z7hu) | — | 《人是貓》：Node.js＋Canvas 逐幀、完整的原曲署名 | 8,785 | 13 |
| [BV1s7JX6gEXp](https://www.bilibili.com/video/BV1s7JX6gEXp) | 开车必备导航 | world.execute(me)：光敏警告、AI 情感的提醒 | 6,900／439 | 13 |
| [BV1j6pu6jEfh](https://www.bilibili.com/video/BV1j6pu6jEfh) | 竹纸- | 《空の箱》GBC 動態字體：一張填不滿的答案卷 | 約 5,200／978 | 13、15 |
| [BV18oaW6PEEv](https://www.bilibili.com/video/BV18oaW6PEEv) | 绁安 | world.execute(me)：逐句拆歌、0 張 AI 圖 | 3,600／269 | 背景 |
| [BV1Rtpy63Egc](https://www.bilibili.com/video/BV1Rtpy63Egc) | — | 《落雪》：只讓 Opus 當導演的實驗，美感拆不開 | 3,600 | 背景 |
| [BV1P7aJ6LEJ1](https://www.bilibili.com/video/BV1P7aJ6LEJ1)、[BV1y7aJ65ETc](https://www.bilibili.com/video/BV1y7aJ65ETc) | NikusonP | 術力口 PV《殘光》《アビスライト》：Opus 驅動 Blender（EGSECDA 管線） | — | 見 EGSECDA |
| [BV1CQaV6oEAe](https://www.bilibili.com/video/BV1CQaV6oEAe) | （GitHub：2606156052） | P(doom) 動畫版：影片模型底片＋轉描 | — | 17 |

## Bilibili：知識科普

| 影片 | 作者 | 內容 | 播放／收藏 | 用在 |
|---|---|---|---|---|
| [BV12DHQ61EhT](https://www.bilibili.com/video/BV12DHQ61EhT)、[BV1Fbpt6qEPq](https://www.bilibili.com/video/BV1Fbpt6qEPq)、[BV1WkJk6VEqA](https://www.bilibili.com/video/BV1WkJk6VEqA)、[BV1X8a16wEGh](https://www.bilibili.com/video/BV1X8a16wEGh) | 比特新语 | 《銀牌的眼淚》《光遺傳學》《剃刀》《以牙還牙》：腳本結構、觀眾批評 | 420 萬／11.1 萬；363 萬／21.5 萬；241 萬／14.5 萬；123 萬／6.7 萬 | 01、06、13、15、16 |
| [BV1eTHZ6gENk](https://www.bilibili.com/video/BV1eTHZ6gENk) | plotome | 46 分鐘 FIRE 財務自由動畫 | 67.6 萬／1.4 萬 | 幾乎每一章 |
| [BV18CWF6jEkm](https://www.bilibili.com/video/BV18CWF6jEkm)、[BV1aVJB62EXm](https://www.bilibili.com/video/BV1aVJB62EXm) | 算法之外_ | 考試最後一分鐘改答案、辛普森悖論：「模擬那個主張」 | 53.9 萬；43.6 萬 | 01、06、13、15 |
| [BV1qSJQ6bEKX](https://www.bilibili.com/video/BV1qSJQ6bEKX)、[BV1TwnF6eEB2](https://www.bilibili.com/video/BV1TwnF6eEB2) | 人心有局 | 實用心理學：收藏率 15–17% | 43.6 萬／7.5 萬；26.4 萬／4.0 萬 | 背景 |
| [BV1GFnP6HEWA](https://www.bilibili.com/video/BV1GFnP6HEWA) | 第零帧001 | 聲調變旋律；邀觀眾留言參與 | 25.7 萬／1.0 萬 | 背景 |
| [BV1bFpc6rESA](https://www.bilibili.com/video/BV1bFpc6rESA) | CaCATions | 《殺戮尖塔 2》卡牌特效：合成音效「塑膠感」，改用遊戲原音 | 21.7 萬 | 01、09、16 |
| [BV1uYao6fEUF](https://www.bilibili.com/video/BV1uYao6fEUF) | qayqaq | 《熵》介紹 | 21.6 萬／1.4 萬 | 01、07、15、16 |
| [BV1jyaA6QEoH](https://www.bilibili.com/video/BV1jyaA6QEoH)、[BV1TBaa6JEFS](https://www.bilibili.com/video/BV1TBaa6JEFS) | 一起Vibe | 原子彈（每鏡一個著色器）、混合路線短片 | 19.6 萬；18.3 萬 | 12、14 |
| [BV1GXav6iEWh](https://www.bilibili.com/video/BV1GXav6iEWh) | 电子智人 | 《信息論》 | 16.3 萬／1.3 萬 | 07、16 |
| [BV1hWar6SEVP](https://www.bilibili.com/video/BV1hWar6SEVP) | 路北路陈 | 為什麼瑞士風格 70 年都不過時：最完整的角色分工與片尾字幕 | 14.2 萬／1.1 萬 | 07、13、15 |
| [BV183aG6KEvA](https://www.bilibili.com/video/BV183aG6KEvA) | 在公司楼下捡钱 | AI 被提問時腦子裡在想什麼（81.6 秒） | 11.2 萬 | 07、15 |
| [BV1QyJa6cEke](https://www.bilibili.com/video/BV1QyJa6cEke) | 一学习儿 | 測驗效應（52 秒） | 10.6 萬／1.8 萬 | 背景 |
| [BV1R2a26uEAt](https://www.bilibili.com/video/BV1R2a26uEAt) | tswawa9595 | Apple 50 年：非官方同人聲明、模型署名 | 10.5 萬 | 01、06、12、13、16 |
| [BV1ZpJt6fEdw](https://www.bilibili.com/video/BV1ZpJt6fEdw) | 喜欢有解 | 系列化的題目、片尾彩蛋與提問 | 5.7 萬／8,700 | 背景 |
| [BV1VxhD6jE5V](https://www.bilibili.com/video/BV1VxhD6jE5V) | 风之谷AI | 星艦：Blender＋Mantaflow＋Remotion；先問四個決定性問題 | 2.7 萬 | 03、06、12、13、14 |
| [BV1CAH16WEW3](https://www.bilibili.com/video/BV1CAH16WEW3) | iamroody | AI 為什麼會幻覺：畫面裡的紅筆查核 | 1.8 萬 | 09 |
| [BV1typc6rEaX](https://www.bilibili.com/video/BV1typc6rEaX) | 泡椒肥汤圆 | iPhone 骨牌：排程好的「假物理」讓每一下都落在鼓點 | 2,800／234 | 04 |

## Bilibili：混合路線與對照組

| 影片 | 作者 | 為什麼列在這裡 | 播放／收藏 | 用在 |
|---|---|---|---|---|
| [BV14sHj62EzS](https://www.bilibili.com/video/BV14sHj62EzS) | 冰尖の霜语 | 《婚物語》：影片模型路線，Opus 相關作品裡播放最高 | 449.8 萬／11.4 萬 | 01、15 |
| （系列） | 王与也行 等 | 「黃仁勳世界巡演」等 AI MV 比賽作品：影片模型＋AI 音樂的迷因混剪，不是程式路線 | 最高約 600 萬 | 01 |
| [BV1ySaf69EAp](https://www.bilibili.com/video/BV1ySaf69EAp) | — | 許多 Opus 科普共用的 BGM 本身（不是 Claude 影片） | 33.7 萬／5.1 萬 | 09、16 |
| [BV1nWHk6VEg1](https://www.bilibili.com/video/BV1nWHk6VEg1) | — | 迷因 BGM 變成循環歌單：證明同一首音樂被大量共用 | 61.8 萬 | 09 |
| [BV1Gpau6wEHE](https://www.bilibili.com/video/BV1Gpau6wEHE) | — | 花之塔 ED：影片模型＋AE＋剪映，不是 Opus 流程 | 24.4 萬 | 背景 |
| [BV1a3av6eExq](https://www.bilibili.com/video/BV1a3av6eExq) | — | 轉載 X 上 anabology 的作品（見下方 X） | — | 01、07 |

## X、YouTube 與部落格

X 的內容來自公開資料集裡的串文備份（[X-RayLuan](https://github.com/X-RayLuan/awesome-opus-5-5-video-prompts) 的對話備份、[Li-Evan](https://github.com/Li-Evan/awesome-opus-5.5-video-prompts) 與 [billyhetech](https://github.com/billyhetech/awesome-opus5-5-videos) 的資料）。觀看數是資料集擷取時的數字。

| 作者 | 作品 | 規模 | 學到什麼 | 用在 |
|---|---|---|---|---|
| [plotome 的部落格](https://ploto.me/posts/how-i-made-a-long-video-with-ai/) | 用 AI 做長影片 | — | 六道審查關卡、素材庫與風險表、成本 | 幾乎每一章 |
| donaldjewkes | Claude Pop 重製版 | 約 280–400 萬 | 口述五分鐘的長簡報、跑 12 小時；參考素材的力量 | 01、07、12、15 |
| anabology | 沿用 Claude Pop 簡報＋Midjourney＋情緒板 | 約 2,000 萬 | 差別來自參考素材 | 01、07 |
| RyanSael | 光學實驗室（互動頁面） | 約 300 萬 | 1 小時 26 分、$25.66；讓它先掃描自己的檔案 | 14 |
| shneural | 作品集短片（Blender＋自製 128 BPM 音樂） | 約 170 萬 | 一個提示、$81 | 14 |
| other__reality | P(doom)（PDoomVideo） | 約 190 萬 | 主執行緒派 7 個子代理平行寫各場景 | 17 |
| eudaemonea | 《Functional Emotions》MV | 約 44–110 萬 | effort medium；「不要看之前的嘗試」 | 背景 |
| rexan_wong | 「一句話影片」的逆向工程 | 約 43 萬、收藏 3.2% | 參考影片、三版分鏡、先靜態再動態 | 07、12 |
| kevin_t_ngo | 程式寫的音樂 | 約 61 萬 | CC0 取樣鋼琴 | 09 |
| scheemunai | 90 年代卡通 | 約 10 萬 | 「90s」被理解成 1990 年代：歧義的教訓 | 12、14 |
| aj_dev_smith | 流行龐克單曲 | 約 16 萬 | 逐母音合成歌聲並用語音辨識檢查；把波形輸出成圖來看 | 09 |
| DotCSV | 像素風神經網路訓練 | 約 57 萬 | Opus 主動訓練一個真的 MNIST 網路：模擬那個主張 | 06 |
| songkeys | 摺紙人類史 | 約 3.6 萬 | 無文字的全球化敘事；先回草稿場景再渲染 | 14 |
| sbalhatlani | 8.5 分鐘阿拉伯語動畫試播集 | 約 4.7 萬 | 圖像＋程式引擎比全用影片模型便宜得多 | 14 |
| mablesjoseph | 45 秒繪畫短片 | 約 1.1 萬 | 公開完整成本；請 Claude 事後分析 token | 14 |
| Aadidev0 | Clawd 的時代之旅 | — | 每句歌詞一個 4 秒場景；預覽表自我修正 | 10 |
| LCSlates | 馬賽克短片 | 約 8 萬 | 理想的自評報告格式 | 11 |
| Tz_2022 | 通行密鑰解說 | 約 4 萬 | 誠實的交接說明：「我聽不到聲音」 | 09、11 |
| Voxyz_ai | 黑洞實驗室 | 約 8 萬 | 整晚三輪三代理的 P0／P1／P2 審查 | 11、14 |
| dhruvalgolakiya | — | 約 4.5 萬 | 抽樣看畫面會漏細節，需要逐幀自動檢查 | 16 |
| mattshumer | 紐約遊戲 | 約 20 萬 | 「聲音像靜電」：音訊是最常被批評的弱點 | 09、16 |
| abxxai | Seedance 公路旅行 | 約 24 萬 | 說清楚誰拿攝影機、坐在哪、怎麼動 | 08 |
| pradeepXkapoor | 「Pip」動畫短片提示 | — | 角色聖經、鎖定外觀、每鏡至少三輪評分 | 03、07、11 |
| Lucas_IA_ | 廣告技能 | — | 旁白先行、逐字時間當時鐘 | 04、06 |
| leo_xiaolei | 復刻參考影片的語言 | — | 禁用清單、暖白色錨點 | 07 |
| twoclipping | 單一形狀 UI 變形範本 | 約 93 萬、收藏 2.1% | 範本的收藏率是單支作品的數倍 | 07、08、10、12、15、16 |
| makevoid | 流行龐克動畫 MV（85 秒、不到 $30）、紙藝重製版 | 紙藝版約 11 萬 | 綠幕精靈、以人聲分軌驅動嘴型 | 03、06、07、16、17 |
| WinterArc | 奧斯特里茨戰役 | 約 40–64 萬 | 旁白驅動時間軸；建置 90 分、渲染 4 小時、$40 | 04、07、14、17 |
| doubleunplussed | AI 圈內梗 MV | 約 2.5 萬 | 不要照字面畫歌詞 | 06 |
| dotey | 12 分鐘 Transformer 解說 | 約 17 萬 | Remotion＋KaTeX | 08 |
| YouTube 7jHXoPGnA4c | Nate Herk | — | 免費技能介紹（B 站有中文配音） | 12 |

## GitHub 程式庫

本專案的程式與文字都是自己寫的。下表的「方式」：**改寫並署名**＝授權允許（MIT、ISC、Apache-2.0、CC BY 4.0），借用了結構或做法並在 `CREDITS.md` 署名；**只參考想法**＝授權不允許或沒有授權，只學觀念、用自己的話寫；**連結**＝只介紹。

### 渲染器、技能與管線

| 程式庫 | 授權 | 方式 | 用在 |
|---|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 | 只參考想法（時間與轉場規則） | 08、10、16、17 |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | 未附授權檔 | 只參考想法 | 16、17 |
| [LBEILC/Multiplane](https://github.com/LBEILC/Multiplane) | Apache-2.0 | 頁面契約相容；動態模糊與剪接點的觀念 | 01、02、10、16、17 |
| [francozanardi/papermotion](https://github.com/francozanardi/papermotion) | MIT | 改寫並署名：「範本不是函式庫」、音效配方 | 01、08、09、11、16、17 |
| [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp) | MIT | 連結 | 01、17 |
| [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) | MIT | 改寫並署名：依歌詞內容定址、卡拉 OK 規則 | 03、04、05、07、08、10、13、15、16、17 |
| [Nyankomintsu/world-execute-me-lyric-mv](https://github.com/Nyankomintsu/world-execute-me-lyric-mv) | 程式 MIT；剪影 CC BY-NC-SA 4.0 | 改寫並署名：只放時間不放歌詞、光敏預算 | 03–07、10–13、16、17 |
| [EGSECDA/vocaloid-style-mv-pipeline](https://github.com/EGSECDA/vocaloid-style-mv-pipeline) | MIT | 改寫並署名：渲染契約、編碼參數、緩動表 | 04–08、10、11、16、17 |
| [lintsinghua/paint-mv-skills](https://github.com/lintsinghua/paint-mv-skills) | MIT | 改寫並署名：節拍歧義報告、LRC 規則 | 03、04、05、06、08、11、16、17 |
| [petergpt/painted-rickroll](https://github.com/petergpt/painted-rickroll) | MIT | 改寫並署名：以拍數為函式的編舞 | 04、07、08、17 |
| [2606156052/Pdoom-video-anime-version](https://github.com/2606156052/Pdoom-video-anime-version) | ISC | 連結 | 17 |
| [makevoid/motion-graphics-music-video-skill](https://github.com/makevoid/motion-graphics-music-video-skill) | MIT（宣告於 plugin.json，沒有授權全文檔） | 只參考想法 | 03、06、07、16、17 |
| [seasnakes/world.execute-me-wallpaper](https://github.com/seasnakes/world.execute-me-wallpaper) | MIT | 連結 | 17 |
| [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | MIT | 連結 | 17 |
| [latent-spaces/brag](https://github.com/latent-spaces/brag) | MIT | 改寫並署名：聲音規則、外掛結構 | 01、04、05、08、09、10、16、17 |
| [Kianzzz/xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) | MIT | 改寫並署名：三方案＋預覽的流程、技術選擇表 | 03、04、07–12、17 |
| [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | 程式與文件 MIT；示範片 CC BY 4.0 | 改寫並署名：風格檔的 11 段結構、導演規則 | 03–11、13、16、17 |
| [Vincentwei1021/mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) | MIT | 改寫並署名：評審量表的錨點、音訊規則 | 05、08–12、16、17 |
| JohnHeibel/PDoomVideo | 未附授權 | 只參考想法 | 02、13、17 |
| guiguisocute/bad-time-mv | 未附授權 | 只參考想法 | 06、08、10、15、17 |
| v1Ta44/netsu-ijou-pv | CC BY-NC 4.0 | 只參考想法 | 04、07、13、16、17 |
| WinterArc21/Battle-of-Austerlitz-Film | 未附授權 | 只參考想法 | 04、07、17 |
| FrostNovaOrg/world-execute-web | AGPL-3.0 | 只參考想法 | 17 |
| op7418/guizang-product-video-skill | AGPL-3.0（另有商用授權說明） | 只參考想法 | 08、09、11、16、17 |
| AnctyEnly453/abstract-algebra-promo | 未附授權 | 只參考想法 | 01 |
| yym8224961/world.execute-me-ascii | 未附授權 | 只參考想法 | 背景 |
| feitangyuan/onetake | PolyForm Noncommercial | 只參考想法 | 03、06、08、11、17 |
| hypit-ai/hypit | 修改過的 Apache-2.0（附條件） | 只參考想法 | 03、05、06、08、09、11、14 |
| opus-pro/opus-video-studio | 範本 MIT；技能與文件未附授權 | 只參考想法 | 03、07、08、17 |
| LBEILC/RhineLabUI-Workflow | 未附授權 | 只參考想法 | 背景 |
| Oxoxxidane/Code2AE_skill | 未附授權 | 只參考想法 | 背景 |
| [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | AGPL-3.0 | 連結（未細讀） | 17 |

### 案例與提示詞資料集

| 程式庫 | 授權 | 內容 | 用在 |
|---|---|---|---|
| [athemeroy/awesome-claude-5-5-videos](https://github.com/athemeroy/awesome-claude-5-5-videos) | CC BY 4.0 | 168 個精選案例與互動數據 | 17 |
| [Li-Evan/awesome-opus-5.5-video-prompts](https://github.com/Li-Evan/awesome-opus-5.5-video-prompts) | CC BY 4.0 | 334 筆，含觀看、收藏、提示類型、時間與成本 | 15、17 |
| [billyhetech/awesome-opus5-5-videos](https://github.com/billyhetech/awesome-opus5-5-videos) | MIT | 2,542 筆，含觀看數快照 | 17 |
| [yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | MIT | 703 筆，含技術標籤 | 17 |
| [X-RayLuan/awesome-opus-5-5-video-prompts](https://github.com/X-RayLuan/awesome-opus-5-5-video-prompts) | MIT（另附 RIGHTS.md） | X 串文的對話備份 | 本章 X 一節 |
| [zhuyansen/awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) | CC0 | 影片技能目錄與星數 | 17 |
| [apimodels/claude-opus-5-5-video-prompts](https://github.com/apimodels/claude-opus-5-5-video-prompts) | CC BY 4.0 | 提示與案例 | 01、16 |
| [BeatAPI/awesome-opus-5-5-videos](https://github.com/BeatAPI/awesome-opus-5-5-videos) | 文件 CC BY 4.0；程式 MIT | 案例與署名規則 | 背景 |
| [TripoGrowthLab/awesome-opus-5-5-prompts](https://github.com/TripoGrowthLab/awesome-opus-5-5-prompts) | MIT（另附 RIGHTS.md） | 提示；權利聲明的寫法 | 背景 |
| [wutuobangai/happy-ai-opus55-video-prompts](https://github.com/wutuobangai/happy-ai-opus55-video-prompts) | 依來源分別授權 | 提示；分來源的授權表 | 背景 |
| [chuspeeism/awesome-opus-5-5-videos](https://github.com/chuspeeism/awesome-opus-5-5-videos) | MIT | 案例 | 背景 |
| xianyu110/awesome-claude-opus-5.5、zhuyansen/awesome-opus-5.5-video、joeseesun/opus-video-prompts、haiy/opus55-video-guide-zh、mewmind-chen/video-production-tools-cases、opusvideo/awesome-claude-video | 未附授權 | 案例與提示；只參考想法 | 背景 |

## 規範、資料與工具

| 來源 | 內容 | 用在 |
|---|---|---|
| [Mili 官方版權指引](https://projectmili.com/copyright-guidelines) | 個人、非商業的二創規範；標示 AI 生成 | 09、13、15 |
| [Piapro 創作者指南](https://piapro.net/intl/en_for_creators.html)（Crypton） | 初音未來等角色的使用規範與 Piapro Character License | 13 |
| [Artificial Analysis TTS 排行榜](https://artificialanalysis.ai/text-to-speech/leaderboard) | 依盲測評分與價格比較 TTS | 17 |
| [VCSL](https://github.com/sgossner/VCSL) | CC0 取樣音色庫 | 09、17 |
| ffmpeg、Demucs、faster-whisper | 編碼與混音、人聲分離、語音辨識 | 04、05、09、10 |
| [ffmpeg 濾鏡文件](https://ffmpeg.org/ffmpeg-filters.html)（`chromakey`、`despill`、`alphamerge`、`premultiply`）與 [`vf_chromakey.c`](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_chromakey.c)（LGPL，只讀） | 去背的距離怎麼算（3×3 平均的 CbCr 距離、門檻與柔邊的線性漸變）、`yuv` 選項、溢色抑制、預乘 alpha；`studio frames` 依此量測，沒有複製程式 | 10 |
| [ComfyUI 伺服器路由](https://docs.comfy.org/development/comfyui-server/comms_routes)（[Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI)，GPL-3.0） | `/system_stats`、`/prompt`、`/history`；只讀 API 說明，沒有複製程式 | 02、10、17 |
| [Blender 命令列參數](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) | `-b`、`--python`、`-a`、`--version` | 02、10 |
| Walter Murch，《In the Blink of an Eye》（Silman-James Press，第二版，2001） | 剪接時權衡的六件事：情緒、故事、節奏、視線（eye-trace）、畫面的二維平面、動作的三維空間；本專案只轉述視線一項，沒有引用原文 | 08、11、16 |

## 想補充或更正

數字會過時，連結會失效，也可能有誤植。請開 issue 附上連結；如果你是作者、希望移除或修改引用，也請開 issue，我們會優先處理。
