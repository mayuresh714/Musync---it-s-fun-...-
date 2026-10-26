import { mountLayout } from './layout.js';
import { auth } from './auth.js';
import { applyI18n } from './i18n.js';
import { icon, art } from './lights-art.js';

mountLayout({ active: 'home', overHero: true });

// the lights band: a live picture of one light, and a chip for each family
const FAMILIES = ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'strobe', 'blinder', 'laser'];
document.getElementById('gearStage').innerHTML = art('beam');
const chips = document.getElementById('gearChips');
chips.innerHTML = FAMILIES.map((id) => `<a class="chip" href="/light?type=${id}">${icon(id, 22)}<span data-i18n="lights.${id}.n"></span></a>`).join('');
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

// the hero film fades in over the still picture once it can play
const v = document.getElementById('heroVideo');
if (v && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  v.addEventListener('canplay', () => { v.classList.add('on'); v.play().catch(() => {}); }, { once: true });
  v.addEventListener('error', () => v.remove(), true);
  v.load();
} else v?.remove();
