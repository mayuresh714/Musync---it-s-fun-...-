// Test bench: one fixture alone on an empty stage, with every mode it can play one click away.
// Pure functions (no DOM, no three.js) so the same lists drive the panel and the tests.
import { FIXTURES } from '../core/fixtures/library.js';
import { MOVE, DIM, COLOR } from '../core/decoder/looks.js';
import { PALETTES, STROBE_PATTERNS } from '../core/wal/vocab.js';

const GRID = new Set(['pixel', 'tube', 'matrix']);
const pretty = (s) => s.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

// plain-language note under each mode that needs one
const NOTE = {
  still: 'Holds one direction', fan: 'Opens a fan', fan_open: 'Opens out', fan_close: 'Closes in', sweep: 'Slow side to side', wave: 'Rolling wave', circle: 'Draws a circle',
  crossfire: 'Beams cross', ballyhoo: 'Wandering search', tunnel: 'Tunnel of rays', bounce: 'Bounces on the beat', snap: 'Snaps between points', swing: 'Swings like a pendulum',
  pulse_fan: 'Opens on each beat', domino: 'Falls like dominoes', spin: 'Spins', cone: 'Traces a cone', vocal: 'Follows the voice', orbit: 'Orbits the focus', lissajous: 'Figure of eight',
  helix: 'Climbing spiral', lotus: 'Petals open and close', carousel: 'Merry-go-round', curtain: 'Draws a curtain', scissor: 'Scissor cross', ripple: 'Ripples outward', stairs: 'Steps on the beat',
  scanline: 'Scans across', spiral: 'Spirals up', peacock: 'Peacock tail', dance: 'Hops on the beat', drift: 'Slow drift', ribbon: 'Flowing ribbon',
};

const MOVE_PARAMS = { speed: 8, size: 0.5, spread: 0.6, every: 2, pose: 'up' };
const DIM_PARAMS = { intensity: 1, on: 'beat', decay: 0.4, speed: 8, width: 0.4, density: 0.3, env: 'energy' };

// which brightness modes make sense on which kind of fixture
const LIGHT_BASIC = [['on', {}], ['follow', { env: 'energy' }], ['pulse', { on: 'beat' }], ['pulse', { on: 'low', label: 'Pulse on kick' }], ['breathe', {}], ['sparkle', {}], ['swell', {}], ['fade', {}], ['strobe', { rate: 8 }]];
const LIGHT_GRID = ['on', 'follow', 'pulse', 'breathe', 'sparkle', 'chase', 'alternate', 'comet', 'meter', 'ripple', 'checker', 'eq', 'rain', 'plasma', 'diagonal', 'thump', 'garba_circle', 'dandiya_tap'];

const mode = (kind, look, params = {}, label) => ({ id: `${kind}:${label || look}`, look, params, label: label || pretty(look), note: NOTE[look] });

export const isMover = (model) => !!FIXTURES[model]?.pan || FIXTURES[model]?.role === 'laser';

// What can this fixture do? Three aspects at most: Movement, Light (brightness behaviour) and Colour.
export function benchModes(model) {
  const p = FIXTURES[model];
  if (!p) return [];
  const aspects = [];
  if (isMover(model)) aspects.push({ id: 'move', label: p.role === 'laser' ? 'Pattern' : 'Movement', modes: Object.keys(MOVE).filter((k) => !k.startsWith('fan')).map((k) => mode('move', k, { ...MOVE_PARAMS })) });
  let light;
  if (p.role === 'strobe') light = [mode('dim', 'strobe', { rate: 8 }, 'Steady strobe'), ...Object.keys(STROBE_PATTERNS).map((k) => mode('dim', 'strobe_seq', { pattern: k, every: 1 }, pretty(k)))];
  else if (GRID.has(p.role)) light = LIGHT_GRID.filter((k) => DIM[k]).map((k) => mode('dim', k, { ...DIM_PARAMS }));
  else light = LIGHT_BASIC.map(([k, { label, ...o }]) => mode('dim', k, { ...DIM_PARAMS, ...o }, label));
  aspects.push({ id: 'dim', label: 'Light', modes: light });
  if (p.role !== 'blinder' || p.pixels > 1) {
    aspects.push({ id: 'color', label: 'Colour', modes: Object.keys(COLOR).map((k) => mode('color', k, { palette: 'festival', speed: 16, on: 'bar', index: 0 })) });
  }
  return aspects;
}

export const benchPalettes = () => Object.keys(PALETTES);

// the single fixture, placed where that kind of fixture normally lives
export function benchRig(model) {
  const p = FIXTURES[model];
  const base = { id: 'T1', model };
  let f;
  if (isMover(model) && p.role !== 'laser') f = { ...base, pos: [0, 1.2, -2.5], mount: 'floor' };
  else if (p.role === 'laser') f = { ...base, pos: [0, 7, -1], mount: 'hung', aim: [0, 4, 8] };
  else if (p.role === 'tube') f = { ...base, pos: [0, 1.4, 1], mount: 'floor' };
  else if (p.role === 'matrix') f = { ...base, pos: [0, p.width > 4 ? 4.5 : 3, -3], mount: 'floor' };
  else if (model === 'star-cloth') f = { ...base, pos: [0, 5, -3], mount: 'hung' };
  else if (p.role === 'pixel' || p.role === 'strobe' || p.role === 'blinder') f = { ...base, pos: [0, 5.5, -1.5], mount: 'hung', aim: [0, 1.5, 9] };
  else f = { ...base, pos: [0, 6, -2], mount: 'hung', aim: [0, 0, 8] };
  return { name: `Test: ${p.name}`, venue: 'stage', fixtures: [f] };
}

// a show that is one long cue for the fixture's layer, laid over the timing of whatever song is loaded
export function benchWal(baseWal, model, pick = {}, palette = 'festival') {
  const p = FIXTURES[model];
  const dur = baseWal.meta.duration;
  const layer = p.role;
  const cue = { t: 0, until: dur, layer };
  const aspects = Object.fromEntries(benchModes(model).map((a) => [a.id, a]));
  const chosen = (kind, fallback) => {
    const m = aspects[kind]?.modes.find((x) => x.id === pick[kind]);
    return m || fallback;
  };
  if (aspects.move) { const m = chosen('move', aspects.move.modes.find((x) => x.look === 'still')); cue.move = { look: m.look, ...m.params }; }
  const d = chosen('dim', aspects.dim.modes[0]); cue.dim = { look: d.look, ...d.params };
  const c = chosen('color', aspects.color?.modes.find((x) => x.look === 'static'));
  if (c) cue.color = c.look === 'static' && !pick.color ? { look: 'static', hex: '#ffffff' } : { look: c.look, ...c.params, palette };
  else cue.color = { look: 'static', hex: '#ffffff' };
  const section = { id: 's1', start: 0, end: dur, kind: 'chorus', energy: 0.8, group: 'A', label: 'Test', palette };
  const wal = { ...baseWal, meta: { ...baseWal.meta, title: `Test: ${p.name}` }, sections: [section], phrases: [], motifs: {}, cues: [cue], accents: [] };
  wal.palettes = { ...(baseWal.palettes || {}) };
  return wal;
}

// the full tour: every mode of every aspect, one after another
export function benchTour(model) {
  const out = [];
  for (const a of benchModes(model)) for (const m of a.modes) out.push({ aspect: a.id, id: m.id, label: m.label, aspectLabel: a.label });
  return out;
}
