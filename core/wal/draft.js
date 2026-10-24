// draftWal(analysis, opts) -> WAL v1
// A rule-based lighting designer: gives every section explicit cues per layer so
// the file plays well on any rig. The /wal skill then edits this with judgement.
// Design rules: calm verses (movement every 2+ beats, one routine), big looks only
// on real peaks, repeats of the same group get the same look, no strobe in
// devotional/romantic material.
import { WAL_VERSION, PALETTES } from './vocab.js';
import { autoPhrases, choreograph, CHOREO_VERSION } from '../choreo/choreograph.js';

const STYLE_PALETTES = {
  dandiya:    { intro: 'sacred', aalap: 'sacred', verse: 'marigold', chorus: 'festival', drop: 'festival', build: 'fire', break: 'sacred', outro: 'sacred', default: 'marigold' },
  edm:        { intro: 'ocean', verse: 'royal', build: 'ice', drop: 'neon', chorus: 'neon', break: 'ocean', outro: 'ocean', default: 'royal' },
  bollywood:  { intro: 'royal', verse: 'royal', chorus: 'festival', drop: 'fire', build: 'fire', break: 'romance', outro: 'royal', default: 'royal' },
  concert:    { intro: 'ocean', verse: 'ocean', chorus: 'fire', drop: 'fire', solo: 'white', build: 'ice', break: 'ocean', default: 'ocean' },
  devotional: { default: 'sacred' },
  wedding:    { verse: 'marigold', chorus: 'festival', drop: 'festival', break: 'romance', default: 'marigold' },
  romantic:   { chorus: 'royal', default: 'romance' },
  rock:       { intro: 'white', verse: 'ocean', chorus: 'fire', drop: 'fire', solo: 'white', build: 'ice', break: 'ocean', default: 'fire' },
  hiphop:     { intro: 'royal', verse: 'royal', chorus: 'neon', drop: 'neon', build: 'ice', break: 'royal', default: 'royal' },
  sufi:       { intro: 'sacred', verse: 'sacred', chorus: 'fire', drop: 'fire', build: 'marigold', break: 'sacred', default: 'sacred' },
  classical:  { default: 'sacred', chorus: 'marigold' },
  folk:       { verse: 'marigold', chorus: 'festival', drop: 'festival', break: 'marigold', default: 'festival' },
  pop:        { intro: 'romance', verse: 'royal', chorus: 'festival', drop: 'neon', build: 'ice', break: 'romance', default: 'royal' },
};

const CALM_STYLES = new Set(['devotional', 'romantic', 'classical']);

function pick(arr, key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return arr[Math.abs(h) % arr.length];
}

// Per-layer intent for one section (or half-section).
function recipe(sec, style, variant, palette) {
  const e = sec.energy;
  const calm = CALM_STYLES.has(style);
  const dandiya = style === 'dandiya';
  const L = {};
  const col = (look, extra = {}) => ({ look, palette, ...extra });

  switch (sec.kind) {
    case 'intro':
    case 'aalap':
      L.beam = { move: { look: 'still', pose: 'up' }, dim: { look: 'breathe', speed: 16, intensity: 0.45 }, color: col('static', { index: 0 }) };
      L.spot = { move: { look: 'still', pose: 'performer' }, dim: { look: 'swell', intensity: 0.6 }, color: col('static', { index: 2 }) };
      L.wash = { dim: { look: 'follow', env: 'energy', intensity: 0.55 }, color: col('gradient') };
      L.pixel = { dim: { look: 'sparkle', density: 0.25, intensity: 0.5 }, color: col('static', { index: 0 }) };
      L.laser = { dim: { look: 'off' } };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
      break;

    case 'verse':
    case 'interlude':
    case 'bridge':
      L.beam = {
        move: variant ? { look: 'wave', speed: 16, spread: 0.5 } : { look: 'sweep', speed: 16, spread: 0.45 },
        dim: { look: 'on', intensity: calm ? 0.45 : 0.65 },
        color: col('cycle', { on: 'phrase' }),
      };
      L.spot = { move: { look: 'still', pose: 'performer' }, dim: { look: 'on', intensity: 0.7 }, color: col('static', { index: 1 }) };
      L.wash = { dim: { look: 'pulse', on: 'bar', decay: 1.6, intensity: 0.65 }, color: col('split', { split: 'lr' }) };
      L.pixel = dandiya
        ? { dim: { look: 'dandiya_tap', decay: 0.18, intensity: 0.7 }, color: col('split', { split: 'lr' }) }
        : { dim: { look: 'chase', on: 'beat', width: 0.3, direction: 'bounce' }, color: col('gradient') };
      L.laser = { dim: { look: 'off' } };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
      break;

    case 'prechorus':
    case 'build':
      L.beam = { move: { look: 'fan_open', spread: 0.9 }, dim: { look: 'swell', intensity: 0.9 }, color: col('static', { index: 0 }) };
      L.spot = { move: { look: 'circle', speed: 8, size: 0.4 }, dim: { look: 'swell', intensity: 0.8 }, color: col('static', { index: 1 }) };
      L.wash = { dim: { look: 'pulse', on: 'beat', decay: 0.35, intensity: 0.8 }, color: col('static', { index: 0 }) };
      L.pixel = { dim: { look: 'chase', on: '8th', width: 0.2, direction: 'out' }, color: col('static', { index: 1 }) };
      L.laser = e > 0.5 && !calm ? { move: { look: 'tunnel', speed: 8 }, dim: { look: 'swell', intensity: 0.6 }, color: col('static', { index: 0 }) } : { dim: { look: 'off' } };
      L.strobe = calm ? { dim: { look: 'off' } } : { dim: { look: 'strobe', rate: 12, ramp: true, intensity: 0.7 } };
      L.blinder = { dim: { look: 'swell', intensity: 0.5 } };
      break;

    case 'chorus':
      L.beam = {
        move: dandiya ? { look: 'circle', speed: 8, size: 0.5 } : variant ? { look: 'fan', spread: 0.8, pose: 'up' } : { look: 'wave', speed: 8, spread: 0.7 },
        dim: { look: 'pulse', on: 'half', decay: 0.6, intensity: 0.9 },
        color: col('cycle', { on: 'bar', every: 2 }),
      };
      L.spot = { move: { look: 'sweep', speed: 8, spread: 0.6, tilt: -0.3 }, dim: { look: 'on', intensity: 0.85 }, color: col('cycle', { on: 'phrase' }) };
      L.wash = dandiya
        ? { dim: { look: 'garba_circle', speed: 16, width: 0.35, direction: 'forward' }, color: col('gradient') }
        : { dim: { look: 'pulse', on: 'beat', decay: 0.45, intensity: 0.85 }, color: col('cycle', { on: 'bar' }) };
      L.pixel = dandiya
        ? { dim: { look: 'dandiya_tap', decay: 0.15, intensity: 1 }, color: col('split', { split: 'lr' }) }
        : { dim: { look: 'chase', on: 'beat', width: 0.25, direction: 'forward' }, color: col('gradient') };
      L.laser = calm ? { dim: { look: 'off' } } : { move: { look: 'sweep', speed: 16, spread: 0.6 }, dim: { look: 'on', intensity: 0.6 }, color: col('static', { index: 1 }) };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
      break;

    case 'drop':
      L.beam = {
        move: variant ? { look: 'ballyhoo', speed: 4, spread: 0.9 } : { look: 'crossfire', speed: 4, spread: 0.85 },
        dim: { look: 'pulse', on: 'beat', decay: 0.4, intensity: 1 },
        color: col('cycle', { on: 'bar' }),
      };
      L.spot = { move: { look: 'circle', speed: 4, size: 0.6 }, dim: { look: 'pulse', on: 'beat', decay: 0.4, intensity: 1 }, color: col('cycle', { on: 'bar' }) };
      L.wash = { dim: { look: 'pulse', on: 'low', decay: 0.3, intensity: 1 }, color: col('cycle', { on: 'bar' }) };
      L.pixel = dandiya
        ? { dim: { look: 'dandiya_tap', decay: 0.12, intensity: 1 }, color: col('split', { split: 'oddeven' }) }
        : { dim: { look: 'chase', on: '8th', width: 0.15, direction: 'bounce' }, color: col('cycle', { on: 'beat' }) };
      L.laser = calm ? { dim: { look: 'off' } } : { move: { look: 'fan', spread: 1 }, dim: { look: 'pulse', on: 'beat', decay: 0.3, intensity: 0.9 }, color: col('cycle', { on: 'phrase' }) };
      L.strobe = calm ? { dim: { look: 'off' } } : { dim: { look: 'pulse', on: 'bar', every: 2, decay: 0.08, intensity: 1 } };
      L.blinder = { dim: { look: 'pulse', on: 'phrase', decay: 0.6, intensity: 0.9 } };
      break;

    case 'solo':
      L.beam = { move: { look: 'still', pose: 'cross' }, dim: { look: 'on', intensity: 0.4 }, color: col('static', { index: 0 }) };
      L.spot = { move: { look: 'still', pose: 'performer' }, dim: { look: 'on', intensity: 1 }, color: { look: 'static', hex: '#ffffff' } };
      L.wash = { dim: { look: 'follow', env: 'mid', intensity: 0.5 }, color: col('static', { index: 0 }) };
      L.pixel = { dim: { look: 'follow', env: 'high', intensity: 0.5 }, color: col('static', { index: 1 }) };
      L.laser = { dim: { look: 'off' } };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
      break;

    case 'break':
      L.beam = { move: { look: 'still', pose: 'up' }, dim: { look: 'breathe', speed: 8, intensity: 0.35 }, color: col('static', { index: 0 }) };
      L.spot = { move: { look: 'still', pose: 'performer' }, dim: { look: 'on', intensity: 0.5 }, color: col('static', { index: 2 }) };
      L.wash = { dim: { look: 'follow', env: 'mid', intensity: 0.5 }, color: col('gradient') };
      L.pixel = { dim: { look: 'sparkle', density: 0.3, intensity: 0.6 }, color: col('static', { index: 1 }) };
      L.laser = !calm && e > 0.35 ? { move: { look: 'tunnel', speed: 16 }, dim: { look: 'on', intensity: 0.3 }, color: col('static', { index: 0 }) } : { dim: { look: 'off' } };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
      break;

    case 'outro':
    default:
      L.beam = { move: { look: 'fan_close', spread: 0.7 }, dim: { look: 'fade', intensity: 0.6 }, color: col('static', { index: 0 }) };
      L.spot = { move: { look: 'still', pose: 'performer' }, dim: { look: 'fade', intensity: 0.7 }, color: col('static', { index: 2 }) };
      L.wash = { dim: { look: 'fade', intensity: 0.6 }, color: col('gradient') };
      L.pixel = { dim: { look: 'fade', intensity: 0.5 }, color: col('static', { index: 0 }) };
      L.laser = { dim: { look: 'off' } };
      L.strobe = { dim: { look: 'off' } };
      L.blinder = { dim: { look: 'off' } };
  }

  // In low-energy material, calm everything down further.
  if (e < 0.4 && L.beam?.dim?.intensity) L.beam.dim.intensity = Math.min(L.beam.dim.intensity, 0.4);
  return L;
}

export function draftWal(analysis, opts = {}) {
  const styles = opts.styles?.length ? opts.styles : ['bollywood'];
  const style = styles[0];
  const pals = STYLE_PALETTES[style] || STYLE_PALETTES.bollywood;
  const beatSec = 60 / analysis.bpm;
  const barSec = beatSec * (analysis.meter || 4);

  // opts.sections lets a director (the Claude agent) replace the analyzer's segmentation and
  // carry labels, moods and lyric paraphrases through to the WAL.
  const sections = (opts.sections || analysis.sections).map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    kind: s.kind,
    energy: s.energy,
    group: s.group,
    ...(s.label ? { label: s.label } : {}),
    ...(s.mood ? { mood: s.mood } : {}),
    ...(s.lyric ? { lyric: s.lyric } : {}),
    ...(s.idea ? { idea: s.idea } : {}),
    ...(s.move?.length ? { move: s.move } : {}),
    palette: s.palette || pals[s.kind] || pals.default,
  }));

  const cues = [];
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (const s of sections) {
    // long sections get a second variant halfway (on a 4-bar boundary) for variety
    const bars = (s.end - s.start) / barSec;
    const variant = pick([0, 1], s.group || s.id);
    const halves = bars >= 16 && ['verse', 'chorus', 'drop', 'interlude'].includes(s.kind)
      ? [[s.start, r3(s.start + Math.round(bars / 8) * 4 * barSec)], [null, s.end]]
      : [[s.start, s.end]];
    if (halves.length === 2) halves[1][0] = halves[0][1];
    halves.forEach(([a, z], hi) => {
      const L = recipe(s, style, hi === 0 ? variant : 1 - variant, s.palette);
      for (const [layer, intent] of Object.entries(L)) cues.push({ t: r3(a), until: r3(z), layer, ...intent });
    });
    // builds: strobe tightens in the final two bars
    if (s.kind === 'build' && !CALM_STYLES.has(style) && s.end - s.start > 3 * barSec) {
      cues.push({ t: r3(s.end - 2 * barSec), until: s.end, layer: 'pixel', dim: { look: 'strobe', rate: 16, ramp: true, intensity: 0.8 }, color: { look: 'static', hex: '#ffffff' } });
    }
  }

  // Lyric architecture: the director's phrases, or ones derived from sections and repeated groups.
  // Choreography then plays every layer against them; section recipes stay underneath as a safety net.
  const allPalettes = { ...PALETTES, ...(opts.palettes || {}) };
  const phrases = (opts.phrases?.length ? opts.phrases : autoPhrases(sections, analysis, analysis.accents)).map((p) => ({ ...p }));
  if (opts.choreography !== false) cues.push(...choreograph({ sections, phrases, analysis, palettes: allPalettes, style, styles, title: opts.title || '' }));

  const accents = analysis.accents.map((a) => ({ ...a }));
  if (CALM_STYLES.has(style)) for (const a of accents) if (a.type === 'drop' || a.type === 'hit') a.fx = 'flash';

  const used = new Set(sections.map((s) => s.palette));
  return {
    wal: WAL_VERSION,
    meta: {
      title: opts.title || 'Untitled',
      ...(opts.artist ? { artist: opts.artist } : {}),
      duration: analysis.duration,
      bpm: analysis.bpm,
      meter: analysis.meter,
      key: analysis.key,
      styles,
      ...(opts.mood ? { mood: opts.mood } : {}),
      ...(opts.language ? { language: opts.language } : {}),
      ...(opts.notes ? { notes: opts.notes } : {}),
      ...(opts.audio ? { audio: opts.audio } : {}),
      generator: opts.generator || `${analysis.analyzer} + musync-draft/0.1`,
      choreo: CHOREO_VERSION,
      created: new Date().toISOString(),
    },
    timing: { beats: analysis.beats, downbeats: analysis.downbeats },
    palettes: Object.fromEntries([...used].map((p) => [p, allPalettes[p]])),
    sections,
    ...(opts.motifs && Object.keys(opts.motifs).length ? { motifs: opts.motifs } : {}),
    phrases,
    cues: cues.sort((a, b) => a.t - b.t),
    accents,
    onsets: analysis.onsets,
    envelopes: analysis.envelopes,
  };
}
