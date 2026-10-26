import { mountLayout } from './layout.js';
import { auth } from './auth.js';
import { applyI18n } from './i18n.js';
import { icon, colour } from './lights-art.js';

mountLayout({ active: 'home' });

// the lights teaser: nine small icons, each a link to its card on the lights page
const FAMILIES = ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'strobe', 'blinder', 'laser'];
const chips = document.getElementById('gearChips');
chips.innerHTML = FAMILIES.map((id) => `<a class="chip" href="/equipment#${id}">${icon(id, 40)}<span data-i18n="lights.${id}.n"></span></a>`).join('');
applyI18n(chips);

// signed-in visitors go to their shows instead of being asked to sign up again
function who() {
  const u = auth.user();
  for (const id of ['heroSignup', 'ctaSignup']) {
    const a = document.getElementById(id); if (!a) continue;
    a.href = u ? '/account' : '/signup';
    a.dataset.i18n = u ? 'hero.cta3' : 'hero.cta2';
  }
  applyI18n();
}
who(); auth.onChange(who);

// the hero film is a bonus: show it only when it really loads, otherwise the drawn stage stays
const v = document.getElementById('heroVideo');
if (v) {
  v.addEventListener('canplay', () => { v.hidden = false; v.play().catch(() => {}); }, { once: true });
  v.addEventListener('error', () => v.remove(), true);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) v.removeAttribute('autoplay');
  v.load();
}
void colour;
