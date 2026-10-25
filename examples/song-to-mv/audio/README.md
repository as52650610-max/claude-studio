# audio/

這個資料夾不進版控。重新生成歌與分軌（在 repo 根目錄）：
Not committed. Regenerate the song and its stems from the repository root:

```bash
node tools/studio.mjs music examples/song-to-mv/audio/song.wav --plan-file examples/song-to-mv/music.json --seed 7 --truth examples/song-to-mv/data/song.truth.json --stems examples/song-to-mv/audio/stems
```

同一個 seed 每次生成的歌都一樣，所以 repo 裡的 `data/songmap.json`、`data/lyrics.json` 與 `data/song.truth.json` 仍然對得上。
`studio mix` 會在這裡寫出 `mix.wav`、`mix_sfx.wav`、`mix_music.wav`。

The same seed makes the same song every time, so the committed `data/songmap.json`,
`data/lyrics.json` and `data/song.truth.json` still match it. `studio mix` writes `mix.wav`,
`mix_sfx.wav` and `mix_music.wav` here.
