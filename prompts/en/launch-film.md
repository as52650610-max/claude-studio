# Launch film / portfolio short brief

> For: a 20–60 s product launch, app introduction, portfolio reel or event opener.
> How: replace every [bracket]. Quality here comes from **real material** and **one continuous
> path**, not from effects.
> Background: [PLAYBOOK §8 and §9](../../docs/en/PLAYBOOK.md).

```markdown
# Launch film brief

## 1. Role and standard
You are the brand-film director, motion designer and engineer. Standard: [like a top tech company's keynote film: precise, restrained, every second about the product].
Follow the studio skill.

## 2. Assets
- Product: [name and one line]; real interface: refs/[screenshots or design files] (rebuild or use them; never invent an interface)
- Logo: refs/[logo.svg]; brand colours: [hex]; font: [a font whose licence allows embedding]
- Three selling points: [1] [2] [3] (one per frame)
- Music: audio/[file], rights: [...]
Ask me for anything missing; don't use real third-party brands.

## 3. Direction
- Tone: [calm, exact]; guide lines and motifs grow from what the logo means
- Images must work: cut out, annotated, highlighted, clicked into new states, exploded views, wireframe to solid; never just displayed
- Not: cross-dissolves, blur fades, 3D flips, bounce easing, frames held longer than 1 s, generic SaaS illustration, AI gradients, stock-photo feel

## 4. Structure
- Length: [30 s]; [16:9 1920×1080]; [60] fps
- Frame 0 shows the result (the product at its best); the subject scales up fast and stops, and the sound lands on the stop
- [One continuous take: the camera travels one path through every selling point / three acts: problem → product → result]
- The key object of each step becomes the start of the next; two transitions for the whole film
- Ending: the logo and one line, held at least 1.2 s

## 5. Production rules
- Sync: times from the songmap and cues.json; each selling point appears on a downbeat
- Motion: expo-out entrances, expo-in exits; a single entrance ≤ 0.8 s; staggers ≤ 0.5 s in total
- All text drawn by code; numbers stay with their units
- Every sound has a reason (why) and ducks the music by role; −14 LUFS
- A frame is a pure function of t

## 6. Checks and delivery
- Before building: a beat chart, a sketch of the camera path, 5 key stills (opening, three selling points, ending)
- Shrink to 360 px wide: the selling points still read
- studio qa without FAIL; studio-jury ≥ 8
- Deliver: the 16:9 master, [a re-laid-out 9:16], the poster, CREDITS.md

## 7. How to start
Ask me at most 3 questions (each with a recommendation), then show me three different structures and key stills.
```

## While you write

- Without a logo the agent invents unrelated brand elements; with one, its guide lines and motifs
  grow out of what the logo means.
- Translate "impact" into a spec: frame 0 is the result, the subject scales fast then stops, the
  sound lands on the stop.
- Translate "premium" into a spec: whitespace, one accent colour, one typeface, exact tracking.
