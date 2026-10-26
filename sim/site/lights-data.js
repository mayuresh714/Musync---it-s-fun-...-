// What the collection pages show: the nine families, their ratings, and a few plain facts per model from its datasheet.
import { FIXTURES } from '../../core/fixtures/library.js';

// 1 (low) to 5 (high), judged for a stage show: how far it reaches, how sharp its edge is, how many colours,
// how much it moves, how big the hit is
export const FAMILIES = [
  { id: 'beam', meters: [5, 5, 3, 5, 4], models: ['claypaky-sharpy', 'generic-7r-beam', 'claypaky-mythos2'] },
  { id: 'spot', meters: [4, 4, 5, 5, 4], models: ['robe-megapointe', 'claypaky-mythos2'] },
  { id: 'wash', meters: [3, 1, 5, 3, 3], models: ['robe-ledbeam-150', 'robe-spiider', 'led-par-54x3'] },
  { id: 'pixel', meters: [2, 3, 5, 1, 3], models: ['pixel-bar-16', 'star-cloth'] },
  { id: 'tube', meters: [2, 3, 5, 1, 3], models: ['led-tube-2m'] },
  { id: 'matrix', meters: [2, 4, 5, 1, 4], models: ['led-matrix-panel', 'led-matrix-wall'] },
  { id: 'strobe', meters: [3, 3, 1, 1, 5], models: ['hybrid-strobe-bar', 'martin-atomic-3000'] },
  { id: 'blinder', meters: [3, 1, 2, 1, 5], models: ['sunstrip-10', 'blinder-4lite'] },
  { id: 'laser', meters: [5, 5, 4, 4, 5], models: ['laser-rgb-3w'] },
];
export const METERS = ['reach', 'sharp', 'colour', 'move', 'impact'];

export function facts(f) {
  const s = f.specs || {}, out = [];
  if (s.lamp) out.push(s.lamp);
  if (s.leds) out.push(s.leds);
  if (s.pixels) out.push(`${s.pixels} lamps`);
  if (s.cells) out.push(`${s.cells} cells`);
  if (s.segments) out.push(`${s.segments} segments`);
  if (s.lamps) out.push(s.lamps);
  if (s.grid) out.push(`${s.grid} grid`);
  if (s.power) out.push(s.power);
  if (s.beamAngle) out.push(`${s.beamAngle}° beam`);
  if (Array.isArray(s.zoom)) out.push(`zoom ${s.zoom[0]}–${s.zoom[1]}°`);
  if (s.pan) out.push(`pan ${s.pan}° · tilt ${s.tilt}°`);
  if (s.width && s.height) out.push(`${s.width} × ${s.height} m`); else if (s.length) out.push(`${s.length} m`);
  if (s.colors) out.push(`${s.colors} colours`);
  if (s.colorMixing) out.push(s.colorMixing);
  return out.slice(0, 4).join(' · ');
}
export const model = (id) => FIXTURES[id];
export const dots = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
