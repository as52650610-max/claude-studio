# Prompts for revisions, review, handoff and reproduction

> For: every round after the first. These prompts are short, but each sentence limits the scope or
> asks for evidence.
> Background: [PLAYBOOK §12 and §16](../../docs/en/PLAYBOOK.md).

## Second round: raise the whole film

```markdown
This is good, but not yet at the level I want. Review separately:
(1) is the picture striking enough; (2) the type, its motion and its words; (3) the narrative rhythm; (4) is there one line that carries the viewer through the whole film?
List how you plan to change it before you start.
```

## Find the gap

```markdown
Re-read BRIEF.md and TREATMENT.md, then look at the contact sheets (studio sheet --every 0.5).
List every gap between what I described and what you made, ranked by impact, then make v2.
```

## Change only these things (a lean fix round)

```markdown
Almost everything is good; don't touch it. This round changes only three things:
1. `0:42.1` [what you see]; I wanted [the effect].
2. [...]
3. [...]
Rules: touch only the files involved; no refactors; no alternative designs; no subagents.
If an effect still fails after 2–3 tries, simplify it and note it in PROGRESS.md.
Render stills only for the shots you changed (first frame after the cut, the main event, the last frame); compare the rest by numbers.
```

## Correct the cause

```markdown
It isn't [the cause you assumed], it's [the real cause]. Revert the change you just made first, then fix [the real cause].
```

## Independent jury

```markdown
Ask studio-jury to review projects/[name]/out/[file].mp4.
Give it only the project folder and the video path; don't explain your intentions. Put its scores and fixes into a new round in REVIEW_LOG.md.
```

## Self-review

```markdown
Review it yourself when you're done: render the contact sheets, the transition strips and the studio qa report, find the three worst problems and fix them before you hand it to me.
```

## Freeze

```markdown
This version is good. Save it as a baseline (git tag [v1-approved]); every experiment from now on happens on a branch.
```

## Turn the look into a style card

```markdown
I'm happy with this style. Write it up as styles/[name]/STYLE.md:
only what never changes (essence, materials and rendering, colour logic, type, motion texture, camera grammar, sound palette, native moves, pitfalls of the medium, reusable code, room for variation),
not this film's story, BPM or timings.
```

## Reproduction notes

```markdown
If you had to rebuild this film from nothing, what prompts and steps would you write? Put them in REPRODUCE.md, detailed enough for another agent to make it:
spec, technique, colours, fonts, brushwork, output settings, narrative structure, how each chapter was built, the pitfalls you met, the commands in order.
```

## Pick up in a new conversation

```markdown
Read PROGRESS.md and the long-term rules in BRIEF.md first; don't redo finished steps.
Tell me the state and the next step as you understand them, then continue. Update PROGRESS.md before you stop.
```

## Feedback patterns

| situation | say |
|---|---|
| point at a problem | "From `1:23.4` to `1:25.0`, [what you see]. I wanted [the effect]." |
| give a way to check | "Count the columns in the reference, then count yours." |
| change one thing | "This word lights too early; it should light when it is sung. Change only this, keep everything else." |
| give quantities | "40 px higher", "slow it to 0.7×", not "a bit higher", "a bit slower" |
| say what you don't want | "No black studio logo at the start." Not wanting is a requirement |
| can't see the difference | "Make a comparison page: baseline left, new version right, at the same time." |
