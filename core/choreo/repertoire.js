// The repertoire: every figure, pattern and colour move the choreographer can use, with the situation each one
// suits. Nothing here is a fixed routine. The choreographer scores the entries against the song (genre, how loud
// the phrase is, whether the instruments around it are rhythmic, melodic or airy) and against what it has already
// used, then picks, so two songs of different character come out with different shows, and one song never repeats
// a figure back to back.
//
// Entry shape: { id, tier: [lo, hi] (phrase loudness range), w: { style: weight, '*': default }, tags: { rhythmic,
// melodic, airy } (what in the music it answers), feel: 'flow' | 'hit' (beams only), make(x) -> spec }.
// x = { L, sd (a seed for this phrase), style, calm }.

const E = (id, tier, w, tags, make, feel = 'flow') => ({ id, tier, w, tags, make, feel });
const mv = (look, o = {}) => ({ move: { look, ...o } });
const duo = (a, b, split = ['odd', 'even']) => ({ parts: [{ group: split[0], ...a }, { group: split[1], ...b }] });
const rev = (o) => ({ ...o, tilt: -1 });

// ── BEAMS and the other movers: the unit moves as one shape ────────────────────────────────────────────
export const BEAM = [
  // quiet
  E('drift', [0, 0.55], { devotional: 1, romantic: 1, classical: 1, sufi: 0.6, bollywood: 0.55, pop: 0.45, folk: 0.35, '*': 0.3 }, { melodic: 1 }, (x) => mv('drift', { speed: 12, spread: 0.55, size: 0.4, seed: x.sd })),
  E('vocal', [0, 0.6], { devotional: 0.8, romantic: 0.9, classical: 0.9, bollywood: 0.7, sufi: 0.6, '*': 0.3 }, { melodic: 1 }, (x) => mv('vocal', { spread: 0.55, size: 0.6 })),
  E('lotus-slow', [0, 0.6], { devotional: 1, sufi: 0.8, romantic: 0.7, wedding: 0.6, bollywood: 0.5, dandiya: 0.7, classical: 0.6, '*': 0.25 }, { melodic: 0.7, airy: 0.3 }, () => mv('lotus', { speed: 16, size: 0.5 })),
  E('ribbon-slow', [0, 0.6], { romantic: 0.8, pop: 0.7, classical: 0.8, concert: 0.5, bollywood: 0.5, sufi: 0.4, '*': 0.3 }, { melodic: 1 }, () => mv('ribbon', { speed: 12, spread: 0.6, size: 0.4, phase: 0.6 })),
  E('curtain-slow', [0, 0.6], { rock: 0.5, concert: 0.7, classical: 0.5, devotional: 0.5, edm: 0.4, hiphop: 0.4, '*': 0.3 }, { melodic: 0.6, airy: 0.4 }, () => mv('curtain', { speed: 16, spread: 0.55, size: 0.4, phase: 0.3 })),
  E('peacock-calm', [0, 0.65], { bollywood: 0.8, wedding: 0.8, dandiya: 0.9, devotional: 0.7, folk: 0.6, '*': 0.25 }, { melodic: 0.5, airy: 0.5 }, () => mv('peacock', { spread: 0.75, size: 0.5, speed: 16 })),
  E('orbit-slow', [0, 0.6], { pop: 0.7, concert: 0.6, romantic: 0.6, classical: 0.5, sufi: 0.6, '*': 0.3 }, { airy: 0.7, melodic: 0.3 }, () => mv('orbit', { speed: 16, size: 0.35, spread: 0.2 })),
  E('scanline-slow', [0, 0.55], { edm: 0.6, pop: 0.5, hiphop: 0.5, rock: 0.4, '*': 0.25 }, { airy: 0.6, rhythmic: 0.4 }, () => mv('scanline', { speed: 8, spread: 0.6, size: 0.45, phase: 0.3 })),
  E('wave', [0, 0.6], { bollywood: 0.4, folk: 0.4, wedding: 0.4, '*': 0.2 }, { melodic: 0.6, rhythmic: 0.4 }, () => mv('wave', { speed: 16, spread: 0.55 })),
  E('fan-open', [0, 0.5], { devotional: 0.5, classical: 0.5, romantic: 0.5, '*': 0.15 }, { melodic: 1 }, () => mv('fan', { spread: 0.5 })),
  // mid
  E('swing', [0.3, 0.75], { concert: 0.8, rock: 0.8, bollywood: 0.6, pop: 0.5, folk: 0.4, '*': 0.3 }, { rhythmic: 0.5, melodic: 0.5 }, () => mv('swing', { speed: 4, spread: 0.6 }), 'hit'),
  E('domino', [0.3, 0.8], { edm: 0.5, hiphop: 0.6, pop: 0.6, wedding: 0.5, '*': 0.3 }, { rhythmic: 1 }, () => mv('domino', { speed: 8, spread: 0.7 }), 'hit'),
  E('ripple', [0.3, 0.85], { pop: 0.8, edm: 0.7, bollywood: 0.6, concert: 0.6, dandiya: 0.6, wedding: 0.6, '*': 0.4 }, { rhythmic: 0.6, airy: 0.4 }, (x) => mv('ripple', { speed: x.L > 0.7 ? 4 : 8, spread: 0.6, size: 0.6 })),
  E('scissor', [0.35, 0.9], { rock: 0.9, concert: 0.9, edm: 0.7, hiphop: 0.6, bollywood: 0.5, '*': 0.35 }, { rhythmic: 0.7, melodic: 0.3 }, (x) => mv('scissor', { speed: x.L > 0.7 ? 4 : 8, spread: 0.75, size: 0.5 }), 'hit'),
  E('stairs', [0.35, 0.9], { hiphop: 0.9, edm: 0.7, pop: 0.7, folk: 0.5, wedding: 0.6, '*': 0.3 }, { rhythmic: 1 }, (x) => mv('stairs', { every: x.L > 0.7 ? 1 : 2, spread: 0.8, size: 0.7 }), 'hit'),
  E('helix', [0.4, 0.95], { edm: 0.9, sufi: 0.9, dandiya: 0.8, wedding: 0.7, folk: 0.6, pop: 0.5, '*': 0.35 }, { rhythmic: 0.5, airy: 0.5 }, (x) => mv('helix', { speed: x.L > 0.7 ? 8 : 16, size: 0.5, spread: 0.5 })),
  E('lissajous', [0.35, 0.9], { concert: 0.8, pop: 0.8, edm: 0.6, sufi: 0.5, romantic: 0.5, rock: 0.4, '*': 0.35 }, { airy: 0.6, melodic: 0.4 }, (x) => mv('lissajous', { speed: x.L > 0.7 ? 8 : 16, size: 0.55, spread: 0.25, phase: 0.35 })),
  E('carousel', [0.35, 1], { dandiya: 1, sufi: 0.9, edm: 0.8, folk: 0.7, wedding: 0.7, concert: 0.5, '*': 0.3 }, { rhythmic: 0.4, airy: 0.6 }, (x) => mv('carousel', { speed: x.L > 0.75 ? 8 : 16, size: 0.45, phase: 0.3 })),
  E('dance', [0.4, 0.9], { bollywood: 0.9, wedding: 0.9, folk: 0.9, hiphop: 0.8, pop: 0.6, dandiya: 0.5, '*': 0.35 }, { rhythmic: 1 }, (x) => mv('dance', { every: x.L > 0.7 ? 2 : 4, spread: 0.8, seed: x.sd }), 'hit'),
  E('lotus', [0.5, 1], { dandiya: 0.9, bollywood: 0.8, wedding: 0.8, sufi: 0.9, devotional: 0.5, pop: 0.5, '*': 0.3 }, { melodic: 0.5, airy: 0.5 }, (x) => mv('lotus', { speed: x.L > 0.75 ? 8 : 16, size: 0.7 })),
  E('spin', [0.45, 0.95], { sufi: 0.9, edm: 0.7, rock: 0.5, folk: 0.6, '*': 0.3 }, { rhythmic: 0.4, airy: 0.6 }, () => mv('spin', { speed: 16, spread: 0.6, size: 0.45 })),
  E('pulse-fan', [0.5, 0.95], { bollywood: 0.9, wedding: 0.7, pop: 0.8, concert: 0.6, '*': 0.3 }, { rhythmic: 0.8 }, () => mv('pulse_fan', { spread: 0.85, size: 0.5 }), 'hit'),
  E('bounce', [0.5, 0.95], { hiphop: 0.9, rock: 0.8, folk: 0.8, bollywood: 0.6, dandiya: 0.5, wedding: 0.7, '*': 0.3 }, { rhythmic: 1 }, () => mv('bounce', { spread: 0.7, size: 0.55 }), 'hit'),
  E('cone', [0.55, 1], { edm: 0.6, rock: 0.5, sufi: 0.6, '*': 0.3 }, { rhythmic: 0.5, airy: 0.5 }, () => mv('cone', { speed: 8, size: 0.5 })),
  E('orbit', [0.45, 1], { concert: 0.9, pop: 0.8, edm: 0.7, rock: 0.6, dandiya: 0.7, '*': 0.35 }, { airy: 0.8, melodic: 0.2 }, (x) => mv('orbit', { speed: x.L > 0.75 ? 8 : 16, size: 0.55, spread: 0.2 })),
  // peak
  E('crossfire', [0.7, 1], { rock: 0.9, edm: 0.8, concert: 0.8, hiphop: 0.6, '*': 0.35 }, { rhythmic: 0.8 }, () => mv('crossfire', { speed: 4, spread: 0.85 }), 'hit'),
  E('ballyhoo', [0.8, 1], { edm: 0.9, rock: 0.7, hiphop: 0.6, '*': 0.25 }, { rhythmic: 0.7 }, () => mv('ballyhoo', { speed: 4, spread: 0.9 }), 'hit'),
  E('peacock', [0.65, 1], { bollywood: 0.9, wedding: 0.9, dandiya: 0.9, folk: 0.7, pop: 0.4, '*': 0.3 }, { rhythmic: 0.5, melodic: 0.5 }, () => mv('peacock', { spread: 0.95, size: 0.8, speed: 8 }), 'hit'),
  E('carousel-fast', [0.8, 1], { dandiya: 1, edm: 0.8, sufi: 0.8, folk: 0.8, wedding: 0.7, '*': 0.25 }, { rhythmic: 0.6, airy: 0.4 }, () => mv('carousel', { speed: 4, size: 0.4, phase: 0.2 })),
  E('dance-fast', [0.8, 1], { bollywood: 0.9, wedding: 0.9, folk: 0.9, hiphop: 0.9, edm: 0.6, '*': 0.3 }, { rhythmic: 1 }, (x) => mv('dance', { every: 1, spread: 0.9, seed: x.sd }), 'hit'),
  // two ensembles in one layer, each its own shape
  E('duo-carousel', [0.55, 1], { dandiya: 0.9, sufi: 0.8, edm: 0.8, wedding: 0.6, folk: 0.5, '*': 0.3 }, { airy: 0.7, rhythmic: 0.3 }, (x) => duo(mv('carousel', { speed: x.L > 0.8 ? 8 : 16, size: 0.4 }), rev(mv('carousel', { speed: x.L > 0.8 ? 8 : 16, size: 0.55 })))),
  E('duo-lotus-carousel', [0.5, 1], { dandiya: 0.9, bollywood: 0.7, sufi: 0.8, wedding: 0.7, pop: 0.4, '*': 0.3 }, { melodic: 0.5, airy: 0.5 }, () => duo(mv('lotus', { speed: 16, size: 0.7 }), mv('carousel', { speed: 16, size: 0.35 }), ['inner', 'outer'])),
  E('duo-scissor-ripple', [0.45, 1], { rock: 0.7, concert: 0.9, edm: 0.8, pop: 0.7, hiphop: 0.6, '*': 0.3 }, { rhythmic: 0.7, airy: 0.3 }, () => duo(mv('scissor', { speed: 8, spread: 0.8, size: 0.5 }), mv('ripple', { speed: 8, spread: 0.6, size: 0.6 }), ['front', 'back'])),
  E('duo-orbit-mirror', [0.4, 0.95], { concert: 0.8, pop: 0.8, romantic: 0.6, sufi: 0.7, edm: 0.6, '*': 0.3 }, { airy: 0.9 }, (x) => duo(mv('orbit', { speed: x.L > 0.7 ? 8 : 16, size: 0.5, spread: 0.2 }), rev(mv('orbit', { speed: x.L > 0.7 ? 8 : 16, size: 0.5, spread: 0.2 })), ['left', 'right'])),
  E('duo-helix-liss', [0.5, 1], { edm: 0.9, pop: 0.7, concert: 0.7, sufi: 0.6, '*': 0.3 }, { airy: 0.6, rhythmic: 0.4 }, () => duo(mv('helix', { speed: 16, size: 0.5, spread: 0.5 }), mv('lissajous', { speed: 16, size: 0.6, spread: 0.2, phase: 0.4 }), ['inner', 'outer'])),
  E('duo-dance-bounce', [0.55, 1], { hiphop: 0.9, folk: 0.9, bollywood: 0.8, wedding: 0.8, rock: 0.5, '*': 0.3 }, { rhythmic: 1 }, (x) => duo(mv('dance', { every: 2, spread: 0.85, seed: x.sd }), mv('bounce', { spread: 0.7, size: 0.55 }), ['left', 'right']), 'hit'),
  E('duo-peacock-wave', [0.45, 1], { bollywood: 0.9, wedding: 0.9, dandiya: 0.8, folk: 0.7, '*': 0.25 }, { melodic: 0.6, rhythmic: 0.4 }, () => duo(mv('peacock', { spread: 0.9, size: 0.7, speed: 8 }), mv('ribbon', { speed: 8, spread: 0.6, size: 0.5, phase: 0.5 }), ['inner', 'outer'])),
];

// the last line of a stanza that climbs into the refrain: the figure builds, so each is a rising move
export const LIFT = [
  E('spiral', [0, 1], { edm: 0.9, sufi: 0.9, pop: 0.7, concert: 0.6, '*': 0.4 }, { airy: 0.8, melodic: 0.2 }, (x) => mv('spiral', { speed: Math.max(1.5, Math.min(4, x.bars)), size: 0.55, spread: 0.2 })),
  E('fan-open', [0, 1], { bollywood: 0.8, devotional: 0.9, romantic: 0.9, classical: 0.9, wedding: 0.7, '*': 0.5 }, { melodic: 1 }, () => mv('fan_open', { spread: 0.9 })),
  E('stairs-up', [0, 1], { hiphop: 0.9, edm: 0.8, folk: 0.8, pop: 0.7, '*': 0.4 }, { rhythmic: 1 }, () => mv('stairs', { every: 1, spread: 0.8, size: 0.8 })),
  E('ripple-in', [0, 1], { pop: 0.8, dandiya: 0.8, bollywood: 0.7, concert: 0.7, '*': 0.4 }, { airy: 0.6, rhythmic: 0.4 }, () => mv('ripple', { speed: 4, spread: 0.6, size: 0.8, tilt: -1 })),
  E('scan-up', [0, 1], { rock: 0.8, concert: 0.8, edm: 0.8, '*': 0.4 }, { rhythmic: 0.5, airy: 0.5 }, () => mv('scanline', { speed: 4, spread: 0.7, size: 0.7, phase: 0.4 })),
  E('peacock-open', [0, 1], { bollywood: 0.9, wedding: 0.9, dandiya: 0.9, folk: 0.8, '*': 0.3 }, { melodic: 0.5, rhythmic: 0.5 }, () => mv('peacock', { spread: 0.9, size: 0.7, speed: 8 })),
  E('orbit-tight', [0, 1], { concert: 0.8, sufi: 0.8, pop: 0.7, romantic: 0.7, '*': 0.4 }, { airy: 1 }, () => mv('orbit', { speed: 4, size: 0.25, spread: 0 })),
  E('curtain-draw', [0, 1], { rock: 0.7, concert: 0.7, classical: 0.6, devotional: 0.6, '*': 0.35 }, { melodic: 0.7, airy: 0.3 }, () => mv('curtain', { speed: 8, spread: 0.8, size: 0.6, phase: 0.2 })),
  E('lotus-open', [0, 1], { devotional: 0.9, sufi: 0.9, dandiya: 0.9, wedding: 0.8, bollywood: 0.7, '*': 0.4 }, { melodic: 0.6, airy: 0.4 }, () => mv('lotus', { speed: 8, size: 0.8 })),
];

// ── SPOTS: follow the voice; at the peaks they roam the crowd ──────────────────────────────────────────
export const SPOT = [
  E('perform', [0, 0.7], { '*': 1 }, { melodic: 1 }, () => mv('still', { pose: 'performer' })),
  E('perform2', [0.7, 1], { '*': 0.25 }, { melodic: 1 }, () => mv('still', { pose: 'performer' })),
  E('circle', [0.5, 1], { bollywood: 0.7, wedding: 0.7, pop: 0.7, edm: 0.5, '*': 0.4 }, { airy: 0.7, rhythmic: 0.3 }, () => mv('circle', { speed: 8, size: 0.4 })),
  E('roam', [0.55, 1], { concert: 0.9, rock: 0.8, pop: 0.8, edm: 0.8, hiphop: 0.7, '*': 0.4 }, { airy: 0.6, rhythmic: 0.4 }, () => mv('lissajous', { speed: 16, size: 0.35, spread: 0, phase: 0.2 })),
  E('scan', [0.5, 1], { edm: 0.8, hiphop: 0.7, concert: 0.6, '*': 0.3 }, { rhythmic: 0.6, airy: 0.4 }, () => mv('scanline', { speed: 8, spread: 0.7, size: 0.5, phase: 0.4 })),
  E('orbit', [0.6, 1], { sufi: 0.7, dandiya: 0.7, pop: 0.6, '*': 0.3 }, { airy: 1 }, () => mv('orbit', { speed: 8, size: 0.4, spread: 0 })),
];

// ── DIM looks per layer type ───────────────────────────────────────────────────────────────────────────
// beams: how the intensity breathes while they move
export const BEAM_DIM = [
  E('follow', [0, 0.7], { '*': 1 }, { melodic: 1 }, (x) => ({ look: 'follow', env: 'mid', intensity: 0.55 + 0.4 * x.L }), 'flow'),
  E('breathe', [0, 0.6], { devotional: 1, classical: 1, romantic: 1, sufi: 0.6, '*': 0.3 }, { melodic: 1 }, (x) => ({ look: 'breathe', speed: 8, intensity: 0.5 + 0.4 * x.L }), 'flow'),
  E('half', [0.3, 0.8], { '*': 0.8 }, { melodic: 0.5, rhythmic: 0.5 }, (x) => ({ look: 'pulse', on: 'half', decay: 0.8, intensity: 0.65 + 0.3 * x.L }), 'flow'),
  E('bar-chase', [0.4, 0.9], { '*': 0.4, dandiya: 0.7, edm: 0.6 }, { rhythmic: 0.4, airy: 0.6 }, (x) => ({ look: 'chase', on: 'beat', width: 0.5, direction: 'bounce' }), 'flow'),
  E('comet', [0.4, 1], { '*': 0.4, edm: 0.6, pop: 0.6, sufi: 0.5 }, { airy: 0.7, melodic: 0.3 }, (x) => ({ look: 'comet', speed: 8, width: 0.5, direction: 'bounce', intensity: 0.9 }), 'flow'),
  E('beat', [0.45, 1], { '*': 1 }, { rhythmic: 1 }, (x) => ({ look: 'pulse', on: 'beat', decay: 0.45, intensity: 0.7 + 0.3 * x.L }), 'hit'),
  E('kick', [0.4, 1], { '*': 1.1, hiphop: 1, edm: 0.9, folk: 0.9, rock: 0.8 }, { rhythmic: 1 }, (x) => ({ look: 'pulse', on: 'low', decay: 0.4, intensity: 0.75 + 0.25 * x.L }), 'hit'),
  E('beat-chase', [0.5, 1], { '*': 0.4, hiphop: 0.7, edm: 0.7 }, { rhythmic: 0.8 }, (x) => ({ look: 'chase', on: 'beat', width: 0.35, direction: 'forward' }), 'hit'),
];

// pixel bars, rings and anything that is just "lights in a row"
export const PIXEL = [
  E('bounce-chase', [0, 0.7], { '*': 1 }, { rhythmic: 0.6, melodic: 0.4 }, (x) => ({ dim: { look: 'chase', on: 'beat', width: 0.28, direction: 'bounce' } })),
  E('sparkle', [0, 0.55], { '*': 0.8, devotional: 1, romantic: 1, classical: 1 }, { airy: 1 }, (x) => ({ dim: { look: 'sparkle', density: 0.3, intensity: 0.6 } })),
  E('comet', [0.1, 0.9], { '*': 0.7, pop: 0.9, edm: 0.8, sufi: 0.6 }, { melodic: 0.5, airy: 0.5 }, () => ({ dim: { look: 'comet', speed: 8, width: 0.35, direction: 'forward' } })),
  E('comet-bounce', [0.2, 1], { '*': 0.6, concert: 0.8, rock: 0.7, hiphop: 0.6 }, { rhythmic: 0.5, melodic: 0.5 }, () => ({ dim: { look: 'comet', speed: 4, width: 0.3, direction: 'bounce' } })),
  E('thump', [0.2, 1], { '*': 0.7, edm: 0.9, hiphop: 0.9, folk: 0.8, bollywood: 0.7 }, { rhythmic: 1 }, () => ({ dim: { look: 'thump', on: 'low', decay: 0.35, speed: 0.4 } })),
  E('ripple', [0.3, 1], { '*': 0.6, pop: 0.8, dandiya: 0.7, edm: 0.7 }, { airy: 0.5, rhythmic: 0.5 }, () => ({ dim: { look: 'ripple', speed: 4, width: 0.3, direction: 'out' } })),
  E('checker', [0.45, 1], { '*': 0.5, edm: 0.8, hiphop: 0.7, pop: 0.7, wedding: 0.6 }, { rhythmic: 0.8 }, () => ({ dim: { look: 'checker', every: 1 } })),
  E('mid-chase', [0.4, 0.9], { '*': 0.7 }, { melodic: 0.7, rhythmic: 0.3 }, () => ({ dim: { look: 'chase', on: 'mid', width: 0.25, direction: 'forward' } })),
  E('eighth-out', [0.55, 1], { '*': 0.8 }, { rhythmic: 1 }, () => ({ dim: { look: 'chase', on: '8th', width: 0.2, direction: 'out' } })),
  E('diagonal', [0.3, 1], { '*': 0.5, edm: 0.7, pop: 0.7, folk: 0.6 }, { airy: 0.6, rhythmic: 0.4 }, () => ({ dim: { look: 'diagonal', speed: 8, width: 0.4 } })),
  E('meter', [0.2, 1], { '*': 0.5, concert: 0.8, rock: 0.7, edm: 0.8, classical: 0.4 }, { melodic: 0.4, rhythmic: 0.6 }, () => ({ dim: { look: 'meter', env: 'energy', direction: 'out' } })),
  E('fire-flicker', [0.1, 0.7], { '*': 0.1, devotional: 0.7, sufi: 0.6, dandiya: 0.5, romantic: 0.3 }, { melodic: 0.5, airy: 0.5 }, () => ({ dim: { look: 'follow', env: 'energy', intensity: 0.7 }, color: { look: 'fire', speed: 8 } })),
];

export const TUBE = [
  E('meter', [0, 1], { '*': 1 }, { melodic: 0.5, rhythmic: 0.5 }, (x) => ({ look: 'meter', env: x.L > 0.6 ? 'low' : 'energy', intensity: 0.95 })),
  E('rain', [0.1, 0.8], { '*': 0.8, devotional: 0.5, romantic: 0.9, classical: 0.6, pop: 0.9 }, { airy: 1 }, () => ({ look: 'rain', speed: 4, density: 0.6, direction: 'forward' })),
  E('rise', [0.2, 1], { '*': 0.6, edm: 0.8, hiphop: 0.7 }, { rhythmic: 0.6, airy: 0.4 }, () => ({ look: 'rain', speed: 8, density: 0.7, direction: 'reverse' })),
  E('ripple', [0.25, 1], { '*': 0.7, pop: 0.8, concert: 0.7, dandiya: 0.7 }, { airy: 0.5, rhythmic: 0.5 }, () => ({ look: 'ripple', speed: 4, width: 0.35, direction: 'out' })),
  E('thump', [0.3, 1], { '*': 0.7, edm: 0.9, hiphop: 0.9, folk: 0.8, rock: 0.8 }, { rhythmic: 1 }, () => ({ look: 'thump', on: 'low', decay: 0.4, speed: 0.5 })),
  E('comet', [0.1, 0.9], { '*': 0.6, sufi: 0.7, bollywood: 0.7 }, { melodic: 0.6, airy: 0.4 }, () => ({ look: 'comet', speed: 8, width: 0.3, direction: 'bounce' })),
  E('eq', [0.4, 1], { '*': 0.7, edm: 0.9, concert: 0.8, rock: 0.7, pop: 0.7 }, { rhythmic: 0.7, melodic: 0.3 }, () => ({ look: 'eq', density: 0.7 })),
  E('breathe', [0, 0.45], { '*': 0.3, devotional: 1, classical: 1, romantic: 0.9 }, { melodic: 1 }, () => ({ look: 'breathe', speed: 8, intensity: 0.7 })),
];

export const MATRIX = [
  E('plasma', [0, 0.75], { '*': 0.9, devotional: 0.8, romantic: 0.9, classical: 0.7, sufi: 0.8, pop: 0.7 }, { melodic: 0.7, airy: 0.3 }, () => ({ look: 'plasma', speed: 16, intensity: 0.9 })),
  E('eq', [0.3, 1], { '*': 0.8, edm: 0.9, concert: 0.9, rock: 0.8, hiphop: 0.8, pop: 0.7 }, { rhythmic: 0.7, melodic: 0.3 }, () => ({ look: 'eq', density: 0.7 })),
  E('ripple', [0.25, 1], { '*': 0.8, pop: 0.8, dandiya: 0.9, bollywood: 0.8, wedding: 0.8 }, { airy: 0.5, rhythmic: 0.5 }, () => ({ look: 'ripple', speed: 4, width: 0.3, direction: 'out' })),
  E('ripple-in', [0.3, 1], { '*': 0.5, sufi: 0.8, dandiya: 0.7, edm: 0.7 }, { airy: 0.7 }, () => ({ look: 'ripple', speed: 4, width: 0.3, direction: 'in' })),
  E('diagonal', [0.2, 1], { '*': 0.7, edm: 0.8, pop: 0.8, folk: 0.7, wedding: 0.7 }, { rhythmic: 0.5, airy: 0.5 }, () => ({ look: 'diagonal', speed: 8, width: 0.4 })),
  E('rain', [0.1, 0.85], { '*': 0.6, romantic: 0.9, pop: 0.8, hiphop: 0.7, edm: 0.7 }, { airy: 1 }, () => ({ look: 'rain', speed: 4, density: 0.55 })),
  E('checker', [0.5, 1], { '*': 0.6, edm: 0.9, hiphop: 0.8, folk: 0.7, wedding: 0.8 }, { rhythmic: 1 }, () => ({ look: 'checker', every: 1 })),
  E('thump', [0.4, 1], { '*': 0.7, hiphop: 0.9, edm: 0.9, folk: 0.8, rock: 0.8 }, { rhythmic: 1 }, () => ({ look: 'thump', on: 'low', decay: 0.4, speed: 0.6 })),
  E('meter', [0.2, 1], { '*': 0.4, concert: 0.7, rock: 0.7 }, { rhythmic: 0.5, melodic: 0.5 }, () => ({ look: 'meter', env: 'energy' })),
];

// wash: the colour bed. Mostly steady, but it breathes, ripples or travels so it is never a flat pulse.
export const WASH = [
  E('bar', [0, 0.7], { '*': 1 }, { melodic: 0.6, rhythmic: 0.4 }, (x) => ({ dim: { look: 'pulse', on: 'bar', decay: 1.5, intensity: 0.5 + 0.3 * x.L } })),
  E('breathe', [0, 0.6], { '*': 0.5, devotional: 1, romantic: 1, classical: 1, sufi: 0.7 }, { melodic: 1 }, (x) => ({ dim: { look: 'breathe', speed: 8, intensity: 0.55 + 0.3 * x.L } })),
  E('follow', [0, 0.8], { '*': 0.6 }, { melodic: 0.8 }, (x) => ({ dim: { look: 'follow', env: 'energy', intensity: 0.6 + 0.3 * x.L } })),
  E('ripple', [0.25, 1], { '*': 0.7, pop: 0.8, concert: 0.8, dandiya: 0.7, edm: 0.7 }, { airy: 0.6, rhythmic: 0.4 }, (x) => ({ dim: { look: 'ripple', speed: 8, width: 0.35, direction: 'out', intensity: 0.85 } })),
  E('thump', [0.4, 1], { '*': 0.7, hiphop: 0.9, edm: 0.9, folk: 0.8, rock: 0.8 }, { rhythmic: 1 }, (x) => ({ dim: { look: 'thump', on: 'low', decay: 0.4, speed: 0.4, intensity: 0.95 } })),
  E('comet', [0.2, 0.85], { '*': 0.5, sufi: 0.8, bollywood: 0.7, pop: 0.6 }, { melodic: 0.5, airy: 0.5 }, () => ({ dim: { look: 'comet', speed: 16, width: 0.55, direction: 'bounce' } })),
  E('beat', [0.55, 1], { '*': 0.9 }, { rhythmic: 1 }, (x) => ({ dim: { look: 'pulse', on: 'beat', decay: 0.45, intensity: 0.8 + 0.15 * x.L } })),
  E('out-chase', [0.4, 1], { '*': 0.4, dandiya: 0.8, bollywood: 0.6 }, { rhythmic: 0.6 }, () => ({ dim: { look: 'chase', on: 'half', width: 0.4, direction: 'out' } })),
  E('garba', [0.2, 1], { dandiya: 1.3, folk: 0.35, '*': 0 }, { rhythmic: 0.5, airy: 0.5 }, () => ({ dim: { look: 'garba_circle', speed: 16, width: 0.35, direction: 'forward' } })),
];

// ── COLOUR ─────────────────────────────────────────────────────────────────────────────────────────────
// x also carries { idx, n (palette size), pal }
export const COLOR = [
  E('static', [0, 0.6], { '*': 1 }, { melodic: 1 }, (x) => ({ look: 'static', palette: x.pal, index: x.idx })),
  E('gradient', [0, 0.7], { '*': 0.8 }, { melodic: 0.7, airy: 0.3 }, (x) => ({ look: 'gradient', palette: x.pal })),
  E('sweep', [0.1, 0.8], { '*': 0.7, pop: 0.9, romantic: 0.8, sufi: 0.8 }, { airy: 0.7, melodic: 0.3 }, (x) => ({ look: 'sweep', palette: x.pal, speed: x.L > 0.6 ? 8 : 16 })),
  E('split', [0.3, 0.9], { '*': 0.6, rock: 0.7, concert: 0.7 }, { rhythmic: 0.5, melodic: 0.5 }, (x) => ({ look: 'split', palette: x.pal, split: 'lr' })),
  E('pairs', [0.4, 1], { '*': 0.6, edm: 0.8, hiphop: 0.7, wedding: 0.8, folk: 0.7 }, { rhythmic: 0.8 }, (x) => ({ look: 'pairs', palette: x.pal, on: x.L > 0.7 ? 'beat' : 'bar', every: 1 })),
  E('cycle-bar', [0.35, 1], { '*': 0.9 }, { rhythmic: 0.5, melodic: 0.5 }, (x) => ({ look: 'cycle', palette: x.pal, on: 'bar' })),
  E('cycle-beat', [0.7, 1], { '*': 0.7, edm: 0.9, hiphop: 0.8 }, { rhythmic: 1 }, (x) => ({ look: 'cycle', palette: x.pal, on: 'beat' })),
  E('tide', [0.3, 1], { '*': 0.5, dandiya: 0.9, pop: 0.7, sufi: 0.7, wedding: 0.7 }, { airy: 0.7, rhythmic: 0.3 }, (x) => ({ look: 'tide', palette: x.pal, speed: 8 })),
];

// ── LASERS: spectacle, so only the figures that read as light shows ────────────────────────────────────
export const LASER = [
  E('fan', [0.6, 1], { '*': 0.7 }, { rhythmic: 0.5, melodic: 0.5 }, () => mv('fan', { spread: 0.8 })),
  E('tunnel', [0.7, 1], { edm: 0.9, '*': 0.5, hiphop: 0.6, rock: 0.5 }, { rhythmic: 0.6 }, () => mv('tunnel', { speed: 4 })),
  E('cone', [0.6, 1], { sufi: 0.9, dandiya: 0.8, edm: 0.8, '*': 0.5 }, { airy: 0.7 }, () => mv('lotus', { speed: 8, size: 0.7 })),
  E('sheet', [0.6, 1], { concert: 0.9, edm: 0.8, rock: 0.8, pop: 0.8, '*': 0.5 }, { rhythmic: 0.6, airy: 0.4 }, () => mv('carousel', { speed: 8, size: 0.4 })),
  E('scissors', [0.65, 1], { rock: 0.9, concert: 0.8, edm: 0.8, hiphop: 0.6, '*': 0.4 }, { rhythmic: 0.8 }, () => mv('scissor', { speed: 4, spread: 0.9 })),
  E('wave', [0.5, 1], { pop: 0.9, romantic: 0.6, bollywood: 0.8, wedding: 0.7, '*': 0.4 }, { melodic: 0.7 }, () => mv('ribbon', { speed: 8, spread: 0.7, size: 0.5, phase: 0.5 })),
  E('burst', [0.7, 1], { bollywood: 0.7, wedding: 0.8, dandiya: 0.8, folk: 0.7, '*': 0.4 }, { rhythmic: 0.7 }, () => mv('peacock', { spread: 0.95, size: 0.8, speed: 8 })),
  E('spiral', [0.6, 1], { sufi: 0.7, edm: 0.7, '*': 0.4 }, { airy: 0.8 }, () => mv('spiral', { speed: 3, size: 0.6, spread: 0.2 })),
];

export const STROBE_PICK = [
  E('chase', [0.5, 1], { '*': 0.6 }, { rhythmic: 0.4, airy: 0.6 }, () => 'chase'),
  E('split', [0.5, 1], { '*': 0.6, rock: 0.8, concert: 0.8 }, { rhythmic: 0.6 }, () => 'split'),
  E('double', [0.6, 1], { '*': 0.8 }, { rhythmic: 1 }, () => 'double'),
  E('gallop', [0.7, 1], { '*': 0.8, folk: 0.9, bollywood: 0.9, hiphop: 0.7 }, { rhythmic: 1 }, () => 'gallop'),
  E('triple', [0.7, 1], { '*': 0.5, edm: 0.9, hiphop: 0.8 }, { rhythmic: 1 }, () => 'triple'),
  E('heartbeat', [0.5, 0.9], { '*': 0.5, hiphop: 0.8, rock: 0.6 }, { rhythmic: 0.6, melodic: 0.4 }, () => 'heartbeat'),
  E('random', [0.6, 1], { '*': 0.4, edm: 0.8 }, { airy: 1 }, () => 'random'),
  E('single', [0.4, 0.8], { '*': 0.5 }, { rhythmic: 0.5, melodic: 0.5 }, () => 'single'),
];
