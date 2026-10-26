import { mountLayout } from './layout.js';
import { applyI18n, t } from './i18n.js';
import { FIXTURES } from '../../core/fixtures/library.js';
import { art, colour } from './lights-art.js';

mountLayout({ active: 'equipment' });

// 1 (low) to 5 (high), judged for a stage show: how far it reaches, how sharp its edge is, how many colours,
// how much it moves, how big the hit is
const FAMILIES = [
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
const METERS = ['reach', 'sharp', 'colour', 'move', 'impact'];

// a few plain facts per model, from its datasheet fields
function facts(f) {
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

const dots = (n, c) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

function render() {
  document.getElementById('fams').innerHTML = FAMILIES.map((fam) => `
    <article class="fam" id="${fam.id}" aria-labelledby="h-${fam.id}">
      <div class="fam-art">${art(fam.id)}</div>
      <div class="fam-body">
        <h3 id="h-${fam.id}" data-i18n="lights.${fam.id}.n"></h3>
        <p class="job" data-i18n="lights.${fam.id}.d"></p>
        <p class="show-line"><b data-i18n="lights.show"></b>: <span data-i18n="lights.${fam.id}.s"></span></p>
        <div class="meters" style="--c:${colour(fam.id)}">${METERS.map((m, i) => `<div class="meter"><span data-i18n="lights.m.${m}"></span><span class="dots" role="img" aria-label="${fam.meters[i]} / 5">${dots(fam.meters[i])}</span></div>`).join('')}</div>
        <div class="models"><b data-i18n="lights.models"></b><ul>${fam.models.map((id) => { const f = FIXTURES[id]; return f ? `<li>${f.name}<small>${facts(f)}</small></li>` : ''; }).join('')}</ul></div>
      </div>
    </article>`).join('');
  applyI18n();
}
render();
void t;
// each card's own colour for its meter dots
for (const fam of FAMILIES) document.querySelector(`#${fam.id} .meters`)?.style.setProperty('--c', colour(fam.id));
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
