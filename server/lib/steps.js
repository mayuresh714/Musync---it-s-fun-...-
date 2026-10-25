// The dancers' steps as light motifs. The video reader lists each signature step and every time it happens; here each
// step becomes ONE recipe of light (a figure for the heads, a rhythm for the grid) that is played at every occurrence,
// so a step that returns is answered by the same light each time. Cues go through cleanCues like any model output.
import { cleanCues } from './merge.js';

// first matching word of the step's name or description picks the recipe
const RECIPES = [
  [/spin|twirl|whirl|rotat|circle|round|ghoom|dodhiyu/, { move: { look: 'carousel', speed: 4 }, dim: { look: 'pulse', on: 'beat', decay: 0.5, intensity: 1 }, pixel: { look: 'chase', on: 'beat' } }],
  [/clap|taali|tap|dandiya|stick|strike/, { move: { look: 'snap' }, dim: { look: 'pulse', on: 'beat', decay: 0.2, intensity: 1 }, pixel: { look: 'dandiya_tap', decay: 0.15 } }],
  [/stamp|jump|hop|leap|bounce|kick/, { move: { look: 'bounce', speed: 2 }, dim: { look: 'pulse', on: 'low', decay: 0.3, intensity: 1 }, pixel: { look: 'pulse', on: 'low', decay: 0.25 } }],
  [/arm|hand|wave|sweep|raise|reach|lift|mudra|open/, { move: { look: 'fan_open', speed: 4 }, dim: { look: 'swell', intensity: 1 }, pixel: { look: 'comet' } }],
  [/walk|stride|march|line|forward|stair|chase|follow/, { move: { look: 'stairs', speed: 4 }, dim: { look: 'chase', intensity: 1 }, pixel: { look: 'chase', on: 'beat' } }],
  [/hip|shoulder|shake|sway|swing|twist|flirt|shimmy|bhangra/, { move: { look: 'swing', speed: 2 }, dim: { look: 'pulse', on: 'half', decay: 0.45, intensity: 1 }, pixel: { look: 'pulse', on: 'half' } }],
  [/freeze|pose|hold|stop|still|pause/, { move: { look: 'still' }, dim: { look: 'swell', intensity: 1 }, pixel: { look: 'swell' }, fx: 'flash' }],
];
const FALLBACK = { move: { look: 'lotus', speed: 8 }, dim: { look: 'pulse', on: 'beat', decay: 0.4, intensity: 1 }, pixel: { look: 'pulse', on: 'beat', decay: 0.3 } };
export const recipeFor = (step) => (RECIPES.find(([re]) => re.test(`${step.name} ${step.what}`.toLowerCase())) || [null, FALLBACK])[1];

// brief: the cleaned video brief; phrases: the song's phrases (steps never break a silence); a: the analysis
export function stepCues(brief, a, phrases, validPalettes, warn = () => {}) {
  if (!brief?.steps?.length) return [];
  const spb = 60 / a.bpm, hold = Math.max(1.2, 2 * spb);
  const nearest = (t) => a.beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), a.beats[0] ?? t);
  const silent = (t) => (phrases || []).some((p) => p.role === 'silence' && t >= p.t && t < p.until);
  const sceneAt = (t) => brief.scenes.find((s) => t >= s.start && t < s.end);
  const hits = [];
  brief.steps.forEach((s, i) => s.at.forEach((t) => hits.push({ t: nearest(t), step: s, i })));
  hits.sort((x, y) => x.t - y.t);
  const raw = [];
  let last = -9;
  for (const h of hits) {
    if (h.t - last < hold * 1.4 || h.t + hold > a.duration || silent(h.t)) continue;
    last = h.t;
    const r = recipeFor(h.step), hex = sceneAt(h.t)?.colors?.[0];
    const col = hex ? { look: 'static', hex } : undefined;
    const t = Math.round(h.t * 1000) / 1000, until = Math.round((h.t + hold) * 1000) / 1000;
    const note = `step: ${h.step.name}`;
    raw.push({ t, until, layer: 'beam', move: r.move, dim: r.dim, ...(col ? { color: col } : {}), note });
    raw.push({ t, until, layer: 'pixel', dim: r.pixel, ...(col ? { color: col } : {}), note });
    if (r.fx) raw.push({ t, layer: 'all', fx: r.fx, dur: 0.25 });
    if (raw.length > 120) break;
  }
  return cleanCues(raw, { a, validPalettes, warn });
}
