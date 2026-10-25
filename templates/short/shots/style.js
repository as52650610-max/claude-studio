// The short's visual contract: colours, type, motion and the phone-safe box.

export const palette = {
  ink: '#0b0b0f',
  paper: '#ffffff',
  dim: 'rgba(255, 255, 255, 0.22)', // not yet sung
  accent: '#ffd23f', // keywords and the hook
};

export const moods = {
  intro: { a: '#2b2d6e', b: '#121233', energy: 0.4 },
  verse: { a: '#3a2b6e', b: '#16122e', energy: 0.5 },
  pre: { a: '#6e2b5c', b: '#22112a', energy: 0.7 },
  chorus: { a: '#ff5a36', b: '#2a0f3d', energy: 1 },
  bridge: { a: '#11606e', b: '#0d1f2e', energy: 0.6 },
  break: { a: '#2a2a33', b: '#0b0b0f', energy: 0.2 },
  outro: { a: '#2b2d6e', b: '#121233', energy: 0.4 },
};
export const moodOf = section => moods[section?.kind || section?.name] || moods.chorus;

// Phone apps draw their buttons and captions over the video: the top bar, the right-hand
// column (like, comment, share) and the bottom (caption, music, progress). Text stays inside.
export const safe = { left: 0.08, right: 0.84, top: 0.12, bottom: 0.72 };

/** Preview with ?safe=1 to see the safe box and the covered areas (never in renders). */
export function safeGuides(ctx, s) {
  if (s.film.mode !== 'preview' || s.film.params.get('safe') !== '1') return;
  const { width: W, height: H } = s;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 0, 80, 0.18)';
  ctx.fillRect(0, 0, W, H * safe.top);
  ctx.fillRect(0, H * safe.bottom, W, H * (1 - safe.bottom));
  ctx.fillRect(W * safe.right, H * safe.top, W * (1 - safe.right), H * (safe.bottom - safe.top));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 3;
  ctx.strokeRect(W * safe.left, H * safe.top, W * (safe.right - safe.left), H * (safe.bottom - safe.top));
  ctx.restore();
}
