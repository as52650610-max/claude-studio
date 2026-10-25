# Kinetic typography short (15–30 s)

> For: a chorus or a few lines turned into a 15–30 s typographic short (Shorts, Reels, Douyin,
> vertical Bilibili).
> How: replace every [bracket]. The classic failure is "every word moves": fix the type system and
> the purpose of each line first, then animate.
> Background: [PLAYBOOK §6 and §9](../../docs/en/PLAYBOOK.md).

```markdown
# Kinetic typography brief

## 1. Role and standard
You are the type designer and editor. Standard: [type worth saving a screenshot of, like a top brand film's title cards, not subtitles].
Follow the studio skill; this is a short, so G2 and G3 may be one step, but every file is written.

## 2. Assets
- Song: audio/[file], rights: [...]
- Lyrics: [path to the official text]
- Excerpt: [the first chorus / bars 33–48]; cut on whole bars with studio excerpt, at most [30] s
- Font: [Noto Sans TC variable / Noto Serif TC] (OFL), one family only

## 3. Direction
- Mood: [...]; colour: [background hex, text hex, one accent hex]
- The words are the picture, not subtitles: the time unit is the character, the reading unit the phrase
- Not: every word bouncing, every line entering the same way, centred text on a gradient, neon glow, faked bold or italic

## 4. Structure
- Spec: 9:16 1080×1920, 30 fps; keep the bottom 20% and the right-hand button column clear
- For each line write its purpose first: introduce / change one word (mask-roll only the word that changes) / pick out a concept / turn an idea into action / resolve
- The first 3 seconds are the hook: frame 0 already has type, never black
- 2–3 s before the chorus show half the line and let the picture contract; on the beat frame complete the line, open the picture, drop the low end
- Hold the last line at least 1.2 s and compose it as a poster

## 5. Production rules
- Every time from at.lyric, at.word or song.T; no seconds in code
- Words fill as they are sung; a dim preview leads by at most 0.4 s; a word stays as long as it is sung
- Break Chinese by meaning; keep numbers with their units; no closing punctuation at a line start
- One accent colour per frame; entrances decelerate, exits accelerate, a single entrance ≤ 0.8 s
- At most three large-area brightness flips in any second

## 6. Checks and delivery
- Before animating: a beat chart (which bar and beat each line lands on) and 4 key stills (frame 0, the chorus downbeat, the densest line, the last frame)
- Shrink to 360 px wide once: still readable
- studio qa without FAIL; deliver the MP4, the poster (frame 0) and an SRT

## 7. How to start
Ask me at most 3 questions (each with a recommendation), then cut the excerpt, align the lyrics, and show me the beat chart and the 4 stills; animate after I agree.
```

## While you write

- Most of a short's design is decided in the stills. If the four key stills don't convince you,
  don't animate yet.
- Lock only 1–3 accents in 15–25 s; other entrances may lean ±0.1 s towards an accent, but
  readability wins.
- Vertical is not a crop of horizontal: lay out from `film.width` and `film.height` and size type
  from the frame width.
