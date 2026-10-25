# audio/

這個資料夾不進版控。重新生成歌與分軌（在 repo 根目錄）：
Not committed. Regenerate the song and its stems from the repository root:

```bash
node tools/studio.mjs music examples/hello-beat/audio/song.wav --plan-file examples/hello-beat/music.json --seed 7 --truth examples/hello-beat/data/song.truth.json --stems examples/hello-beat/audio/stems
```

`studio mix` 會在這裡寫出 `mix.wav`、`mix_sfx.wav`、`mix_music.wav`。
`studio mix` writes `mix.wav`, `mix_sfx.wav` and `mix_music.wav` here.
