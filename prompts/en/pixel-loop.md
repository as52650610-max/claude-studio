# Pixel loop brief

> For: seamless pixel-art loops (avatars, wallpapers, stream idle screens, a looping visual for a
> song).
> How: replace every [bracket]. Pixel art is about **constraints**: logical resolution, palette,
> integer coordinates, quantised poses.
> Background: [PLAYBOOK §8](../../docs/en/PLAYBOOK.md), style card [styles/pixel-crt](../../styles/pixel-crt/STYLE.md).

```markdown
# Pixel loop brief

## 1. Role and standard
You are the pixel artist and animation engineer. Standard: [like a classic game cutscene: every pixel has a reason and the loop seam is invisible].
Follow the studio skill (a short: G2 and G3 may be one step).

## 2. Assets
- Subject: [one scene and one action, e.g. a cat dozing by a window on a rainy night]
- Music: [none / audio/[file], rights: [...]; the loop is a whole number of bars]
- References: refs/[...] (learn the palette and silhouettes; never trace)

## 3. Direction
- Palette: a fixed [24] colours; every pixel comes from it (hex listed in TREATMENT.md)
- Not: gradients, anti-aliasing, blurred shadows, rotation, half-pixel positions, non-integer scaling

## 4. Structure
- Logical resolution [160×90], scaled by an integer to [1920×1080] (×12), smoothing off
- Loop length [4] s ([2] bars with music); the last frame flows into the first
- One main action plus 2–3 background cycles (rain, a lamp, a tail), each period a divisor of the loop

## 5. Production rules
- Draw on the small canvas, then scale by an integer; ctx.imageSmoothingEnabled = false; integer coordinates
- Pose parameters change smoothly but are quantised to the pixel grid every frame; at 30 fps it reads like an 8–12 fps sprite
- Squash and stretch only in whole pixels
- All motion is periodic in t over the loop length: f(t) = f(t + loop)
- Chinese pixel text: draw it on the small canvas and threshold alpha at 0.5; at least 18 logical px; the smaller the text, the lighter the weight (400 at 18 px, 500–700 for a 34 px title)
- A frame is a pure function of t; randomness only through rng(seed) or hash

## 6. Checks and delivery
- Seam check: render the last frame and the first side by side; studio verify passes
- Zoom into 4 stills: every pixel on the grid and from the palette (with a CRT or scanline effect, render one with the effect off to check)
- Versions shown small (phones, GIFs): at least 3 output rows per scanline, or they alias into moiré
- Deliver: MP4 (the loop three times), [a GIF or WebP loop], a poster

## 7. How to start
Ask me at most 3 questions (each with a recommendation), then show me the palette and one still; animate after I agree.
```

## While you write

- "Looks pixelated" on a big canvas is not pixel art: always draw small and scale up.
- Generated pixel images must be re-aligned to a real pixel grid and remapped to your palette.
- Every sub-cycle's period must divide the loop length, or the seam jumps.
