# Character short brief

> For: a 30 s – 2 min short or music video with one character who acts (cut-out rigs, flat
> illustration, pixel characters).
> How: replace every [bracket]. Character animation is the code route's known weak spot: spend the
> time on the **character design** and the **rig**, not on effects.
> Background: [PLAYBOOK §7 and §8](../../docs/en/PLAYBOOK.md).

```markdown
# Character short brief

## 1. Role and standard
You are the character designer, animator, director and engineer. Standard: [a character you remember after one appearance; acting that reads, not a sticker sliding around].
Follow the studio skill; no shot is built before the character is approved.

## 2. Assets
- Character reference: refs/[art] (rights: [I drew it / commissioned / the owner allows fan works, rules at [link]])
- Song or score: audio/[file], rights: [...]; or [no music, ambience only]
- The story in one line: [one protagonist, one goal, one turn]

## 3. Direction
- Personality: [...]; signature move: [...]
- Style: [a style card from styles/, e.g. paper-cutout]
- Not: a character that looks different in every shot, idle wobble, moves without anticipation, effects drowning the acting

## 4. Structure
- A hook in the first 3 seconds; a bookend; the emotional peak uses a move only this medium can make
- One gag that reads at thumbnail size beats three that don't
- An escalating prop: introduced at the start, misused in the middle, transformed at the climax, paid off at the end
- Length: [45 s]; [16:9 1920×1080]; [30] fps

## 5. Production rules
- **Character bible** (docs/character_bible.md): describe the reference back in words; sample its palette with code; one identity rule that survives any restyle (e.g. a mole under the right eye, a red scarf)
- **Model sheet**: front, side, back; 3–4 expressions; 2–3 key poses; swatches; beside the reference until I say "yes, that's them"
- **Rig**: root → base → torso → neck → head; swappable hands; a procedural face (lids, pupils, highlights, a 3–4 frame blink); secondary motion by springs computed from 0 to t
- **Plan acting beat by beat**: look → reach → grab → lift → hand over → release; anticipation, action, follow-through; never switch poses inside an if
- The character on twos (stepTime at 12 fps); camera and light smooth on every frame
- Times from the song or cues.json; a frame is a pure function of t

## 6. Checks and delivery
- At least three self-review rounds per shot: render frame strips and look for jumping hands, feet and faces (more than 12 px in one frame is a pop)
- Compare with the model sheet side by side: is the character still on model?
- studio qa without FAIL; studio-jury ≥ 8
- Deliver: MP4, poster, the character bible and model sheet, CREDITS.md, REPRODUCE.md

## 7. How to start
Ask me at most 4 questions (each with a recommendation). The first deliverable is the model sheet, not animation.
```

## While you write

- After approval, changing the character means changing one drawing; changing it later means
  redoing every shot. That is why the model sheet needs your own yes.
- Raise an arm by abduction first, then flexion; the other order crosses the arms into an X. Don't
  outline where an arm overlaps the torso, or the puppet's seams show.
- A held object really sits between the palms; a rolling thing turns by distance ÷ radius.
- Generating the character with a video model? Use [hybrid-mv.md](hybrid-mv.md): the model animates
  one character on green screen, code draws the world.
