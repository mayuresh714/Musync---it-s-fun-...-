// One family of light: what it does, how it rates, every model in the collection, and a way to try it on a song.
import { mountLayout } from './layout.js';
import { applyI18n, t } from './i18n.js';
import { art, colour } from './lights-art.js';
import { FAMILIES, METERS, dots, facts, model } from './lights-data.js';

mountLayout({ active: 'equipment' });
const id = new URLSearchParams(location.search).get('type');
const i = FAMILIES.findIndex((f) => f.id === id);
const root = document.getElementById('lightRoot');
if (i < 0) { location.replace('/equipment'); } else {
  const fam = FAMILIES[i], nxt = FAMILIES[(i + 1) % FAMILIES.length], c = colour(fam.id);
  document.title = `${fam.id[0].toUpperCase() + fam.id.slice(1)} light · Musync`;
  root.innerHTML = `
    <a class="crumb" href="/equipment">← <span data-i18n="light.all"></span></a>
    <section class="light-hero" style="--c:${c};--glow:${c}66">
      <div class="art">${art(fam.id)}</div>
      <div>
        <h1 data-i18n="lights.${fam.id}.n"></h1>
        <p class="lead" data-i18n="lights.${fam.id}.d"></p>
        <p class="show-line"><b data-i18n="lights.show"></b>: <span data-i18n="lights.${fam.id}.s"></span></p>
        <div class="meters" style="--c:${c}">${METERS.map((m, k) => `<div class="meter"><span data-i18n="lights.m.${m}"></span><span class="dots" role="img" aria-label="${fam.meters[k]} / 5">${dots(fam.meters[k])}</span></div>`).join('')}</div>
        <a class="btn primary lg" href="/studio?lab=${fam.models[0]}" data-i18n="light.try"></a>
      </div>
    </section>
    <section class="models-sec">
      <h2 data-i18n="lights.models"></h2>
      ${fam.models.map((m) => { const f = model(m); return f ? `<div class="model"><div><b>${f.name}</b><small>${facts(f)}</small></div><a class="btn" href="/studio?lab=${m}" data-i18n="light.tryOne"></a></div>` : ''; }).join('')}
      <div class="how-test"><div><h3 data-i18n="light.how"></h3><p data-i18n="light.how.d"></p></div><a class="btn primary" href="/studio?lab=${fam.models[0]}" data-i18n="light.try"></a></div>
    </section>
    <div class="next-light"><a class="btn ghost" href="/equipment" data-i18n="light.all"></a><a class="btn" href="/light?type=${nxt.id}"><span data-i18n="light.next"></span>: <span data-i18n="lights.${nxt.id}.n"></span> →</a></div>`;
  applyI18n(root);
}
void t;
