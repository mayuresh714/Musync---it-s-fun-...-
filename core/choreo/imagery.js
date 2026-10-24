// Imagery: what a line is ABOUT, said in light. A phrase may carry an `image` (fire, water, embrace, gaze...) that the
// director chose from the lyric's meaning; the choreographer then plays that image across every layer instead of a
// generic figure: colour says the feeling, the beams' movement says the gesture, the pixels and walls say the texture.
// Each image returns overlay parts per layer ({ layer, group?, move?, dim?, color? }) for the span of the phrase.
// They only use looks and palettes from the WAL vocabulary, so a rig plays whatever it has of them.
//
// Descriptions are what the director sees when it chooses (vocab.js IMAGES carries the same keys).
const cyc = (palette, on = 'bar') => ({ look: 'cycle', palette, on });
const st = (palette, index = 0) => ({ look: 'static', palette, index });
const dim = (look, o = {}) => ({ look, ...o });

export const IMAGE_MAKERS = {
  // arms closing round someone: beams draw together, everything warm and soft, rings of light contracting
  embrace: ({ L }) => [
    { layer: 'beam', move: { look: 'lotus', speed: 16, size: 0.6 }, dim: dim('breathe', { speed: 8, intensity: 0.5 + 0.4 * L }), color: { look: 'gradient', palette: 'blush' } },
    { layer: 'spot', move: { look: 'still', pose: 'performer' }, dim: dim('follow', { env: 'mid', intensity: 0.7 }), color: st('gold') },
    { layer: 'wash', dim: dim('breathe', { speed: 8, intensity: 0.55 }), color: st('blush') },
    { layer: 'matrix', dim: dim('ripple', { speed: 12, direction: 'in' }), color: { look: 'gradient', palette: 'blush' } },
    { layer: 'tube', dim: dim('breathe', { speed: 8, intensity: 0.7 }), color: { look: 'gradient', palette: 'blush' } },
  ],
  // looking, glances, the eye: sharp points of light that glint with the hi-hats, prisms opening like lashes
  gaze: ({ L }) => [
    { layer: 'beam', move: { look: 'peacock', speed: 8, size: 0.7, prism: true }, dim: dim('pulse', { on: 'high', decay: 0.22, intensity: 0.7 + 0.3 * L }), color: { look: 'sweep', palette: 'gold', speed: 8 } },
    { layer: 'spot', move: { look: 'still', pose: 'cross' }, dim: dim('pulse', { on: 'high', decay: 0.3, intensity: 0.9 }), color: { look: 'static', hex: '#fff1c4' } },
    { layer: 'pixel', dim: dim('sparkle', { density: 0.4, intensity: 0.9 }), color: { look: 'gradient', palette: 'gold' } },
    { layer: 'wash', dim: dim('breathe', { speed: 8, intensity: 0.3 }), color: st('moon', 1) },
  ],
  // flame: flickering warm colour everywhere, heads licking upward
  fire: ({ L }) => [
    { layer: 'beam', move: { look: 'drift', speed: 8, size: 0.7 }, dim: dim('swell', { intensity: 0.7 + 0.3 * L }), color: { look: 'fire' } },
    { layer: 'wash', dim: dim('swell', { intensity: 0.6 + 0.3 * L }), color: { look: 'fire' } },
    { layer: 'tube', dim: dim('meter', { speed: 8 }), color: { look: 'fire' } },
    { layer: 'matrix', dim: dim('plasma', { speed: 12 }), color: { look: 'gradient', palette: 'fire' } },
    { layer: 'pixel', dim: dim('sparkle', { density: 0.5, intensity: 0.8 }), color: { look: 'fire' } },
  ],
  // water: cool colour rolling out in rings, heads flowing in a wave, rain down the tubes
  water: ({ L }) => [
    { layer: 'beam', move: { look: 'ribbon', speed: 12, size: 0.7, phase: 0.4 }, dim: dim('breathe', { speed: 6, intensity: 0.55 + 0.35 * L }), color: { look: 'tide', palette: 'water', speed: 8 } },
    { layer: 'wash', dim: dim('breathe', { speed: 8, intensity: 0.6 }), color: { look: 'tide', palette: 'water', speed: 8 } },
    { layer: 'tube', dim: dim('rain', { speed: 8, density: 0.5 }), color: { look: 'gradient', palette: 'water' } },
    { layer: 'matrix', dim: dim('ripple', { speed: 8 }), color: { look: 'gradient', palette: 'water' } },
    { layer: 'pixel', dim: dim('chase', { speed: 4 }), color: { look: 'gradient', palette: 'water' } },
  ],
  // two opposites facing each other: the left half burns, the right half flows, and they trade blows on the beat
  duel: ({ L }) => [
    { layer: 'beam', move: { look: 'drift', speed: 8, size: 0.7 }, dim: dim('pulse', { on: 'low', decay: 0.4, intensity: 0.7 + 0.3 * L }), color: { look: 'fire' } },
    { layer: 'beam', group: 'right', move: { look: 'ribbon', speed: 8, size: 0.7, phase: 0.4 }, dim: dim('pulse', { on: 'offbeat', decay: 0.4, intensity: 0.7 + 0.3 * L }), color: { look: 'tide', palette: 'water', speed: 8 } },
    { layer: 'wash', dim: dim('alternate', { speed: 2 }), color: { look: 'split', palette: 'duel', split: 'lr' } },
    { layer: 'pixel', dim: dim('alternate', { speed: 1 }), color: { look: 'split', palette: 'duel', split: 'lr' } },
    { layer: 'matrix', dim: dim('checker', { speed: 4 }), color: { look: 'pairs', palette: 'duel', on: 'bar' } },
    { layer: 'tube', dim: dim('thump', { on: 'beat' }), color: { look: 'pairs', palette: 'duel', on: 'bar' } },
    { layer: 'spot', move: { look: 'still', pose: 'cross' }, dim: dim('pulse', { on: 'half', decay: 0.6, intensity: 1 }), color: { look: 'static', hex: '#ffffff' } },
  ],
  // the opposites meeting: both halves close to one point, the colours fuse into steam
  meet: ({ L }) => [
    { layer: 'beam', move: { look: 'lotus', speed: 8, size: 0.7, prism: true }, dim: dim('pulse', { on: 'beat', decay: 0.5, intensity: 0.9 + 0.1 * L }), color: { look: 'gradient', palette: 'steam' } },
    { layer: 'wash', dim: dim('pulse', { on: 'beat', decay: 0.5, intensity: 0.9 }), color: { look: 'gradient', palette: 'steam' } },
    { layer: 'matrix', dim: dim('ripple', { speed: 4, direction: 'in' }), color: { look: 'gradient', palette: 'steam' } },
    { layer: 'tube', dim: dim('meter', { speed: 4 }), color: { look: 'gradient', palette: 'steam' } },
  ],
  // time slipping: do not waste a minute. Quicker, narrower, a racing marquee
  urgency: ({ L, pal }) => [
    { layer: 'beam', move: { look: 'scanline', speed: 4, size: 0.8 }, dim: dim('pulse', { on: 'beat', decay: 0.25, intensity: 0.8 + 0.2 * L }), color: cyc(pal, 'beat') },
    { layer: 'tube', dim: dim('comet', { speed: 2 }), color: cyc(pal, 'beat') },
    { layer: 'matrix', dim: dim('diagonal', { speed: 4 }), color: { look: 'sweep', palette: pal, speed: 4 } },
    { layer: 'pixel', dim: dim('chase', { speed: 2 }), color: cyc(pal, 'beat') },
  ],
  // pride, poise, a held head: upright columns of gold, almost still, a slow breath
  pride: ({ L }) => [
    { layer: 'beam', move: { look: 'still', pose: 'up' }, dim: dim('breathe', { speed: 16, intensity: 0.6 + 0.3 * L }), color: st('gold') },
    { layer: 'spot', move: { look: 'still', pose: 'performer' }, dim: dim('follow', { env: 'mid', intensity: 0.9 }), color: { look: 'static', hex: '#fff1c4' } },
    { layer: 'wash', dim: dim('breathe', { speed: 16, intensity: 0.5 }), color: st('gold', 1) },
    { layer: 'tube', dim: dim('meter', { speed: 16 }), color: { look: 'gradient', palette: 'gold' } },
    { layer: 'matrix', dim: dim('breathe', { speed: 16, intensity: 0.4 }), color: st('gold', 1) },
  ],
  // longing, a plea: slow drifting heads in moonlight and blush, nothing sudden
  longing: ({ L }) => [
    { layer: 'beam', move: { look: 'drift', speed: 16, size: 0.5 }, dim: dim('breathe', { speed: 8, intensity: 0.4 + 0.3 * L }), color: { look: 'gradient', palette: 'moon' } },
    { layer: 'wash', dim: dim('breathe', { speed: 8, intensity: 0.35 }), color: st('blush') },
    { layer: 'tube', dim: dim('rain', { speed: 16, density: 0.3 }), color: { look: 'gradient', palette: 'moon' } },
    { layer: 'matrix', dim: dim('plasma', { speed: 24 }), color: { look: 'gradient', palette: 'moon' } },
  ],
  // teasing, call and answer: a wave passes from head to head, neighbours in two colours that swap
  flirt: ({ L, pal }) => [
    { layer: 'beam', move: { look: 'ribbon', speed: 8, size: 0.7, phase: 0.3 }, dim: dim('pulse', { on: 'beat', every: 2, decay: 0.5, intensity: 0.7 + 0.3 * L }), color: { look: 'pairs', palette: pal, on: 'bar' } },
    { layer: 'wash', dim: dim('swell', { intensity: 0.55 }), color: { look: 'sweep', palette: pal, speed: 8 } },
    { layer: 'matrix', dim: dim('plasma', { speed: 8 }), color: { look: 'gradient', palette: pal } },
    { layer: 'pixel', dim: dim('alternate', { speed: 2 }), color: { look: 'pairs', palette: pal, on: 'bar' } },
  ],
  // held breath: low, narrow, almost nothing
  hush: () => [
    { layer: 'beam', move: { look: 'still', pose: 'cross' }, dim: dim('breathe', { speed: 16, intensity: 0.3 }), color: st('moon') },
    { layer: 'wash', dim: dim('breathe', { speed: 16, intensity: 0.2 }), color: st('moon', 1) },
    { layer: 'tube', dim: dim('breathe', { speed: 16, intensity: 0.25 }), color: st('moon') },
    { layer: 'matrix', dim: dim('off') },
    { layer: 'pixel', dim: dim('breathe', { speed: 16, intensity: 0.2 }), color: st('moon') },
  ],
  // empty words: only the outer ring is lit, faint and glittering, the middle left dark
  hollow: () => [
    { layer: 'beam', move: { look: 'drift', speed: 16, size: 0.5 }, dim: dim('off') },
    { layer: 'beam', group: 'outer', move: { look: 'drift', speed: 16, size: 0.5 }, dim: dim('sparkle', { density: 0.3, intensity: 0.6 }), color: { look: 'gradient', palette: 'moon' } },
    { layer: 'wash', dim: dim('breathe', { speed: 16, intensity: 0.2 }), color: st('moon', 1) },
    { layer: 'pixel', dim: dim('sparkle', { density: 0.3, intensity: 0.5 }), color: { look: 'gradient', palette: 'moon' } },
    { layer: 'matrix', dim: dim('off') },
  ],
  // a flower opening, victory: everything blooms outwards and keeps turning
  bloom: ({ L, pal }) => [
    { layer: 'beam', move: { look: 'lotus', speed: 8, size: 0.9, prism: true }, dim: dim('pulse', { on: 'low', decay: 0.4, intensity: 0.7 + 0.15 * L }), color: { look: 'sweep', palette: pal, speed: 8 } },
    { layer: 'wash', dim: dim('pulse', { on: 'low', decay: 0.4, intensity: 0.55 }), color: { look: 'tide', palette: pal, speed: 4 } },
    { layer: 'matrix', dim: dim('ripple', { speed: 4 }), color: { look: 'sweep', palette: pal, speed: 8 } },
    { layer: 'tube', dim: dim('thump', { on: 'beat' }), color: { look: 'sweep', palette: pal, speed: 8 } },
  ],
  // the drum takes over: heads dance a programmed routine, walls play the spectrum
  rhythm: ({ L, pal }) => [
    { layer: 'beam', move: { look: 'dance', every: 4, seed: 7 }, dim: dim('pulse', { on: 'low', decay: 0.35, intensity: 0.85 + 0.15 * L }), color: cyc(pal, 'bar') },
    { layer: 'matrix', dim: dim('eq'), color: { look: 'gradient', palette: pal } },
    { layer: 'tube', dim: dim('thump', { on: 'beat' }), color: cyc(pal, 'bar') },
    { layer: 'pixel', dim: dim('pulse', { on: 'low', decay: 0.3, intensity: 0.9 }), color: cyc(pal, 'bar') },
  ],
};

// images that must stay quiet: the generic strobes, lasers and blinders of the phrase give way
const QUIET = new Set(['hush', 'hollow', 'longing', 'embrace', 'pride']);
export const IMAGE_NAMES = Object.keys(IMAGE_MAKERS);

// Replace, for the span of one phrase, the generic cues the choreographer already made by the image's parts.
// `cues` holds the phrase's own cues from index c0; the image's cues are added at the phrase start.
export function applyImage(cues, c0, image, ctx, t, u, r3) {
  const make = IMAGE_MAKERS[image];
  if (!make) return false;
  const parts = make(ctx);
  if (QUIET.has(image)) for (const layer of ['laser', 'strobe', 'blinder']) parts.push({ layer, dim: { look: 'off' } });
  for (const o of parts) {
    for (let i = cues.length - 1; i >= c0; i--) {
      const c = cues[i];
      if (c.layer !== o.layer || c.fx) continue;
      if (c.group && o.move) { cues.splice(i, 1); continue; } // a base ensemble gives way to the image's own
      if (c.group) continue;
      for (const k of ['move', 'dim', 'color']) if (o[k] && !o.group) delete c[k];
      if (o.group) { /* a group overlay keeps the base cue under it */ }
      if (!c.move && !c.dim && !c.color) cues.splice(i, 1);
    }
  }
  for (const o of parts) cues.push({ t: r3(t), until: r3(u), ...o });
  return true;
}
