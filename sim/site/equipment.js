import { mountLayout } from './layout.js';
import { applyI18n } from './i18n.js';
import { art, colour } from './lights-art.js';
import { FAMILIES, METERS, dots } from './lights-data.js';

mountLayout({ active: 'equipment' });

// each family is one card; the whole card opens its own page, where it can be tried on a song
document.getElementById('fams').innerHTML = FAMILIES.map((fam) => `
  <a class="fam" href="/light?type=${fam.id}" aria-labelledby="h-${fam.id}" style="--c:${colour(fam.id)}">
    <div class="fam-art">${art(fam.id)}</div>
    <div class="fam-body">
      <h3 id="h-${fam.id}" data-i18n="lights.${fam.id}.n"></h3>
      <p data-i18n="lights.${fam.id}.d"></p>
      <div class="meters">${METERS.slice(0, 3).map((m, i) => `<div class="meter"><span data-i18n="lights.m.${m}"></span><span class="dots" role="img" aria-label="${fam.meters[i]} / 5">${dots(fam.meters[i])}</span></div>`).join('')}</div>
      <span class="go"><span data-i18n="light.open"></span> →</span>
    </div>
  </a>`).join('');
applyI18n();
