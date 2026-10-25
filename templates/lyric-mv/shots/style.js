// The film's visual contract. Every shot takes its colours, type and motion from here, so a style
// change is one edit, and parallel agents building different shots still make one film.

export const palette = {
  ink: '#0d0d10', // background
  paper: '#f2efe8', // lyrics and titles
  dim: 'rgba(242, 239, 232, 0.32)', // lyrics not yet sung
  accent: '#ff6a3d', // the one accent: use it rarely so it means something
};

// Each section kind gets two light colours and an energy (0–1) that scales motion and brightness.
// The analyser names sections intro / verse / pre / chorus / bridge / break / outro.
export const moods = {
  intro: { a: '#1d2b4f', b: '#121219', energy: 0.3 },
  verse: { a: '#24365f', b: '#3b2142', energy: 0.5 },
  pre: { a: '#3b2c62', b: '#62304a', energy: 0.7 },
  chorus: { a: '#ff6a3d', b: '#3b5bdb', energy: 1 },
  bridge: { a: '#0f4c5c', b: '#22305a', energy: 0.6 },
  break: { a: '#16161c', b: '#0d0d10', energy: 0.2 },
  outro: { a: '#1d2b4f', b: '#121219', energy: 0.3 },
};
export const moodOf = section => moods[section?.kind || section?.name] || moods.verse;

// Motion grammar: entrances decelerate, exits accelerate, nothing moves without a reason.
export const motion = {
  lead: 0.3, // lyrics appear this early (never later than the voice)
  fade: 0.35, // and stay this long after the line ends
  titleOut: 0.6,
};
