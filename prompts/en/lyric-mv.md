# Lyric MV director's brief

> For: a whole song, or a 1–2 minute lyric music video.
> How: copy the brief, replace every [bracket], delete lines you don't need, and paste it into
> Claude Code started in the project folder.
> Why it is written this way: [PLAYBOOK §4 and §16](../../docs/en/PLAYBOOK.md).

```markdown
# Lyric MV director's brief

## 1. Role and standard
You are the director, motion designer, engineer and sound designer of this music video.
Standard: [an award-level independent music video]. A clean result that looks like a template is a failure.
Follow the studio skill's gates (G0–G7) and write every gate's files.

## 2. Assets
- Song: audio/[file]. Rights: [my own work / the author allows non-commercial fan works, rules at [link]]
- Lyrics: [path]. This is the official text; it wins over anything speech recognition hears.
- Translation: [yes / no; who translated it]
- References: refs/[…]. Learn its [rhythm / colour / transitions]; don't take its [...].
- My own material: [character art, logo, fonts]
If something is missing, ask me. Don't fetch copyrighted images, footage or lyrics from the web.

## 3. Direction
- Mood: [e.g. stifled and repetitive, with a little hope at the end]
- Concept direction (you may overturn it, with reasons): [...]
- Style: [a style card from styles/, or reference images]
- Not: centred big text on a gradient with everything fading in, glow everywhere, neon cyberpunk, particle nebulas, an FM "ding" intro, [...]
- Don't illustrate the lyrics word by word; catch the spirit of the song.

## 4. Structure
- Length: [the whole song, 3:42 / a 30 s chorus]; [16:9 1920×1080]; [30] fps
- TREATMENT.md states: a one-line conceit, a motif (and how it changes per section), the bookend, the energy curve, a restraint budget per section
- First give me three genuinely different structures (safe / a new visual language / a bold structure); pick one and say why
- A hook in the first second; show me the climax's final frame as a still first; don't rush the ending
- Two or three transitions for the whole film; every storyboard row has an Out (the hand-off)

## 5. Production rules
- Every time comes from data/songmap.json, data/lyrics.json and data/cues.json; no seconds typed into shot code
- The voice is the main event; drums only anticipate and echo; never react to hi-hats
- A lyric stays up at least as long as it is sung, never lights before the voice, never covers a face or the subject
- A frame is a pure function of t: no Math.random, Date or CSS animation; studio lint and studio verify pass
- At most three large-area brightness flips in any second; one owner for full-frame white
- Long films in chapters that share one style rulebook and components (shots/style.js)

## 6. Checks and delivery
- After each chapter: render a contact sheet labelled with time and lyric, and actually look at it before going on
- The whole film: studio qa without FAIL; studio-jury ≥ 8 on all seven axes
- Deliver: everything studio deliver makes, CREDITS.md, REPRODUCE.md
- You can't hear: say exactly what you checked and where I need to listen

## 7. How to start
First ask me everything I need to decide in one message (at most 5 questions, each with your recommendation).
Then lock the timing and give me the click preview to confirm; then three structures and style frames.
Mode: [collaboration: stop at every gate / autonomous: after the questions go straight through to review; stop only for payments, rights or a budget about to run out]
Budget cap: [30% of this week's quota]
```

## While you write

- **Put the standard at the top.** "Make it look nice" aims at about a 6; a concrete bar moves the
  target to 8–9.
- **Assets beat adjectives.** A moodboard and two reference videos do more than ten words like
  "premium", "epic" or "cinematic". Say what to learn from each reference and what not to.
- **"Don't" is a requirement too**, but a long ban list is scar tissue: know what each line prevents.
- **Autonomous doesn't mean no files.** BRIEF, TREATMENT, STORYBOARD and PROGRESS still get written,
  or the next conversation can't pick up the work.
- Want a vertical cut? Add "also make a 9:16 version, re-laid out, not cropped".
