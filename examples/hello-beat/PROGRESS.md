# PROGRESS

> 每個新對話先讀這份、再讀 BRIEF.md 的長期規則。

## 現在（Now）

- 關卡：G7 完成，還沒發布（使用者先測試）
- 下一步：獨立評審（studio-jury）；發布由使用者決定

## 關卡（Gates）

- [x] G0 簡報：BRIEF.md
- [x] G1 時間鎖定：與生成器的真值比對（節拍誤差 ≤ 5.3 ms；停頓、重擊各 1 個，誤差 ≤ 5 ms）。**沒有人聽過** `qa/click_preview.wav`
- [x] G2 企劃：TREATMENT.md 選 B
- [x] G3 分鏡：STORYBOARD.md；關鍵靜態圖
- [x] G4 樣片：全片只有 27 秒，直接做全片
- [x] G5 製作：`studio lint` 乾淨；`studio verify` 21 幀一致
- [x] G6 審查：`studio qa` 0 FAIL；獨立評審（studio-jury）沒有跑，見 REVIEW_LOG.md
- [x] G7 交付：`studio deliver`、CREDITS.md、REPRODUCE.md；使用者看過、聽過最終 MP4，認可（2026-10-24）

## 紀錄（Log）

| 日期 | 完成了什麼 | 偏離了什麼、為什麼 | 還沒做什麼 |
|---|---|---|---|
| 2026-10-24 | 生成音樂、分析、全片、混音、品管 | 分析把 12 小節併成 3 段（太短的段落會被合併），段落名稱改用 `music.json` 的小節；鼓的事件改用分軌分析（整首混音會把小鼓聽成大鼓） | 人耳試聽 |
| 2026-10-24 | 寫 REPRODUCE.md：重做的指令、做法、遇過的坑、交給 Claude 的提示 | — | 人耳試聽；獨立評審 |
| 2026-10-24 | 使用者看過、聽過最終 MP4，認可 | — | 獨立評審；發布（使用者決定） |
