# Explainer animation brief

> For: 1.5–5 minute explainers: a paper, a classic experiment, maths or an algorithm, history.
> How: replace every [bracket]. An explainer's clock is its **narration or captions**, not a song:
> freeze the script before making pictures.
> Background: [PLAYBOOK §7 (explainers) and §13 (facts)](../../docs/en/PLAYBOOK.md).

```markdown
# Explainer brief

## 1. Role and standard
You are the writer, researcher, animation director and engineer. Standard: [clearer than a textbook, more rigorous than short-form video; every number survives the comment section].
Follow the studio skill; this film's clock is [the narration / the captions].

## 2. Assets
- Topic: [one claim, e.g. the counter-intuitive result of a classic experiment]
- Sources: [links to papers, books, datasets]; nothing without a source appears in the film
- Narration: [none, captions and ambience only / [TTS engine]: stable voice, commercial licence, word timestamps]
- Music: [my own / a licensed track at audio/...]
Ask me when data is missing; don't make it up.

## 3. Direction
- Audience: [a curious 16-year-old]; tone: [plain, curious, never preachy]
- Style: [a style card from styles/]; one idea per picture
- Not: AI copy tells ("it's not X, it's Y", "simply put", stacked dashes), moral uplift without evidence, opening on jargon

## 4. Structure (script anatomy)
1. An everyday pain in the second person: one concrete person and one strange moment (first 2 s)
2. One precise study or experiment: year, names, numbers
3. The counter-intuitive result
4. The complication: when the result changes
5. One line that lands in the viewer's life
6. A closing question everyone can answer in the comments
7. Honesty notes: sources, the scope and assumptions of the simulation, "analogies are illustrations"
- Each part answers the most natural question a viewer has after the previous one
- One sentence, one picture: it must make sense with the sound off
- Captions switch on bar lines; half the line before the accent, the whole line on it

## 5. Production rules
- **Simulate the claim**: write a simulation that re-runs the original rules, save results as data/*.json, and let the animation read the JSON; every number on screen is computed
- FACTS.md: one claim per line, the source URL, a short quote, the shot that shows it
- Narration is generated only after the script is frozen; numbers spelled out in the TTS text, digits in captions; voice about 10 dB above the music
- Times come from the narration or caption timestamps (cues.json), never typed seconds
- A frame is a pure function of t; text stays up at least as long as it takes to read

## 6. Checks and delivery
- Before pictures: the frozen script, FACTS.md, charts of the simulation's results, 5 key stills
- Fact check line by line against FACTS.md; analogies and model assumptions stated on screen or in the description
- studio qa without FAIL; studio-jury ≥ 8
- Deliver: MP4, SRT, the description text (citations and an AI-use statement), CREDITS.md, REPRODUCE.md

## 7. How to start
Ask me at most 4 decisive questions (each with a recommendation), then hand in a first script and FACTS.md; pictures start after I approve the script.
```

## While you write

- The most common criticism of explainers is "shallow and unverifiable". A simulation with
  published JSON is the best answer.
- A result may not hold outside the original setting: label analogies as analogies and state the
  model's assumptions.
- One concept per film; two or three escalating numbers are enough.
- With narration, the narration is the clock: changing one word means re-recording and re-timing,
  so freeze the script first.
