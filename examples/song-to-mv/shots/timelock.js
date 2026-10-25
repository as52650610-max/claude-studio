// 02 對拍 TIME LOCK. The lens pulls back to the whole song; the parts land one a beat under the
// beats, the stop and the impact are marked in red, and the analysis is graded against the answer
// key the generator wrote (data/song.truth.json). A song of your own has no answer key: there, the
// check is listening to qa/click_preview.wav, and the grading line simply does not appear.
import { lens } from './timeline.js';
import { CHAPTERS, INK, MOVE, PAPER, PARTS, RED, chapterTitle, foot, grid, rise, type } from './page.js';

/** Match each true beat to the nearest measured one (within 70 ms): how many, and how far off. */
function grade(measured, truth) {
  const errs = [];
  for (const b of truth) {
    let best = Infinity;
    for (const m of measured) best = Math.min(best, Math.abs(m - b));
    if (best <= 0.07) errs.push(best * 1000);
  }
  errs.sort((a, b) => a - b);
  return { found: errs.length, of: truth.length, median: errs[errs.length >> 1] ?? 0, max: errs[errs.length - 1] ?? 0 };
}

export async function timeLock({ song, width: W, height: H, loadJSON }) {
  const G = grid(W, H), T = (...a) => song.T(...a), ch = CHAPTERS[1], at = lens(song, G);
  const truth = await loadJSON('data/song.truth.json').catch(() => null);
  const score = truth ? grade(song.beats, truth.beats) : null;
  const stop = song.stops[0], impact = song.events('impact')[0];
  const lands = [T(3, 1), T(3, 2), T(3, 3), T(3, 4), T(4, 1)];
  const marks = { stop: T(4, 2), impact: T(4, 3), score: T(4, 4) };
  const block = { y: 600, h: 48 };

  return {
    id: 'timelock',
    start: T(ch.bars[0]),
    end: T(ch.bars[1]),
    layer: 2,
    sfx: [
      ...lands.map((t, i) => ({ t, sound: 'tick', params: { pitch: i === 3 ? 7 : 0 }, why: `the ${PARTS[i].en.toLowerCase()} block lands`, gain: -16 })),
      { t: marks.stop, sound: 'pop', params: { pitch: -3 }, why: 'the stop is marked in red', role: 'click', gain: -12 },
      ...(score ? [{ t: marks.score, sound: 'typing', why: 'the grading line types out', role: 'typing', gain: -20 }] : []),
    ],
    draw(ctx, { t }) {
      chapterTitle(ctx, G, t, T(ch.bars[0]), ch);
      const v = at(t);
      // the parts, one a beat; the chorus is the red one
      PARTS.forEach((p, i) => {
        const x0 = v.x(T(p.bars[0])), x1 = v.x(T(p.bars[1])), box = [x0 + 1, block.y, x1 - x0 - 2, block.h];
        rise(ctx, t, lands[i], box, () => {
          ctx.fillStyle = p.en === 'CHORUS' ? RED : INK;
          ctx.fillRect(...box);
          const w = type(ctx, p.zh, x0 + 12, block.y + 31, 20, 700, { fill: PAPER });
          type(ctx, p.en, x0 + 12 + w + 8, block.y + 31, 13, 700, { fill: PAPER, spacing: 0.12 });
        }, MOVE);
      });
      // the stop and the impact, where the analyser found them
      if (stop && t >= marks.stop) {
        const x0 = v.x(stop.start), x1 = v.x(stop.end), top = v.base - v.amp - 24;
        ctx.fillStyle = RED;
        ctx.fillRect(x0, top, x1 - x0, v.base - top);
        type(ctx, `停頓 STOP　${stop.start.toFixed(2)}–${stop.end.toFixed(2)} s`, x0 - 12, top + 14, 16, 700, { fill: RED, align: 'right' });
      }
      if (impact && t >= marks.impact) {
        const x = v.x(impact.t), top = v.base - v.amp - 24;
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.moveTo(x, top + 22);
        ctx.lineTo(x + 12, top);
        ctx.lineTo(x + 24, top + 22);
        ctx.closePath();
        ctx.fill();
        type(ctx, `重擊 IMPACT　${impact.t.toFixed(2)} s`, x + 36, top + 14, 16, 700, { fill: RED });
      }
      // the grading, only for a song that came with an answer key
      if (score) {
        rise(ctx, t, marks.score, [G.x(0), G.y(5), G.w(12), G.h(2)], () => {
          type(ctx, '對答案　GRADED AGAINST THE GENERATOR', G.x(0), G.y(5) + 24, 18, 700);
          const y = foot(G.y(6) + G.rh, G.rh);
          const w = type(ctx, `${score.found} / ${score.of}`, G.x(0) - 4, y, G.rh, 300);
          type(ctx, `拍找到了　中位誤差 ${score.median.toFixed(1)} ms　最大 ${score.max.toFixed(1)} ms`, G.x(0) + w + 24, y, 32, 700);
        }, MOVE);
      }
    },
  };
}
