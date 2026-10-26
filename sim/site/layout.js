// Header and footer shared by every website page: navigation, the language menu and the account menu. The menus are
// the same component, so nothing on the site looks like a browser default.
import { t, applyI18n, setLang, getLang, LANGS } from './i18n.js';
import { auth } from './auth.js';

const MARK = '<svg class="mark" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffb454" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 20.5 3.8 4.5M12 20.5V3M12 20.5l8.2-16"/><path d="M7.4 12.6c3 -1.4 6.2 -1.4 9.2 0" opacity=".55"/><circle cx="12" cy="20.5" r="1.9" fill="#ffb454" stroke="none"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>';
const TICK = '<svg class="tick" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const SHORT = { en: 'EN', hi: 'हि', mr: 'मरा', gu: 'ગુ' };
const here = () => location.pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
const next = () => encodeURIComponent(here() + location.search);

let openMenu = null;
function closeMenus() { if (openMenu) { openMenu.menu.hidden = true; openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } }
// a button that opens a floating menu; arrow keys move, Escape closes and returns focus
function wireMenu(btn, menu) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    closeMenus();
    if (open) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); openMenu = { btn, menu }; menu.querySelector('[aria-checked="true"], a, button')?.focus(); }
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('a, button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeMenus(); btn.focus(); }
  });
}
document.addEventListener('click', (e) => { if (openMenu && !openMenu.menu.contains(e.target)) closeMenus(); });

export function mountLayout({ active = '', overHero = false } = {}) {
  document.body.classList.toggle('over-hero', overHero);
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  if (header) header.innerHTML = `
    <div class="bar container">
      <a class="brand" href="/" aria-label="Musync">${MARK}<span>Musync</span></a>
      <nav class="links" id="navLinks" aria-label="Main">
        <a href="/#how" data-i18n="nav.how"></a>
        <a href="/equipment" data-i18n="nav.lights" class="${active === 'equipment' ? 'on' : ''}"></a>
        <a href="/studio" data-i18n="nav.try"></a>
      </nav>
      <div class="tools">
        <div class="menu-wrap" id="langWrap">
          <button class="pill-btn lang" id="langBtn" aria-haspopup="menu" aria-expanded="false" data-i18n-aria="nav.language">${GLOBE}<span class="name"></span>${CHEV}</button>
          <div class="menu" id="langMenu" role="menu" hidden>${Object.entries(LANGS).map(([k, v]) => `<button role="menuitemradio" aria-checked="false" data-lang="${k}">${v}${TICK}</button>`).join('')}</div>
        </div>
        <div id="authArea" class="auth-area"></div>
        <button class="burger" id="burger" aria-expanded="false" aria-controls="navLinks" data-i18n-aria="nav.menu"><i></i><i></i><i></i></button>
      </div>
    </div>`;
  if (footer) footer.innerHTML = `
    <div class="container foot">
      <div class="foot-brand"><a class="brand" href="/">${MARK}<span>Musync</span></a><p data-i18n="foot.about"></p></div>
      <nav class="foot-col" aria-label="Musync"><b data-i18n="foot.product"></b>
        <a href="/#how" data-i18n="nav.how"></a><a href="/equipment" data-i18n="nav.lights"></a><a href="/studio" data-i18n="nav.try"></a><a href="/account" data-i18n="nav.shows"></a></nav>
      <nav class="foot-col" aria-label="Legal"><b data-i18n="foot.legal"></b>
        <a href="/legal#privacy" data-i18n="foot.privacy"></a><a href="/legal#terms" data-i18n="foot.terms"></a><a href="/legal#copyright" data-i18n="foot.copyright"></a>
        <a href="https://github.com/mayuresh714/Musync---it-s-fun-...-" rel="noopener" data-i18n="foot.source"></a></nav>
    </div>
    <div class="container foot-end"><small data-i18n="foot.rights"></small></div>`;

  // language menu
  const langBtn = document.getElementById('langBtn'), langMenu = document.getElementById('langMenu');
  const paintLang = () => {
    langBtn.querySelector('.name').textContent = LANGS[getLang()];
    for (const b of langMenu.querySelectorAll('[data-lang]')) b.setAttribute('aria-checked', String(b.dataset.lang === getLang()));
  };
  wireMenu(langBtn, langMenu);
  langMenu.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) { setLang(b.dataset.lang); closeMenus(); langBtn.focus(); } });

  const burger = document.getElementById('burger');
  burger?.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  });
  document.getElementById('navLinks')?.addEventListener('click', (e) => { if (e.target.closest('a')) { burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); } });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { burger?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); } });

  // transparent over a hero picture, solid once the page scrolls
  const solid = () => header?.classList.toggle('solid', window.scrollY > 24 || document.body.classList.contains('nav-open'));
  window.addEventListener('scroll', solid, { passive: true }); solid();

  renderAuth();
  auth.onChange(renderAuth);
  paintLang(); applyI18n();
  window.addEventListener('musync:lang', () => { paintLang(); renderAuth(); applyI18n(); });
  auth.verify().then((s) => { if (!s && auth.user()) renderAuth(); });
}

function renderAuth() {
  const host = document.getElementById('authArea');
  if (!host) return;
  const u = auth.user();
  if (!u) {
    host.innerHTML = `<a class="btn ghost sm" href="/signin?next=${next()}" data-i18n="nav.signin"></a><a class="btn primary sm" href="/signup?next=${next()}" data-i18n="nav.signup"></a>`;
  } else {
    const initial = (u.name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    host.innerHTML = `
      <div class="menu-wrap">
        <button class="pill-btn" id="userBtn" aria-haspopup="menu" aria-expanded="false"><span class="avatar">${initial}</span><span class="who"></span>${CHEV}</button>
        <div class="menu" id="userMenu" role="menu" hidden>
          <div class="menu-head"><b class="um-name"></b><small class="um-mail"></small></div>
          <a role="menuitem" href="/account" data-i18n="nav.shows"></a>
          <a role="menuitem" href="/studio" data-i18n="nav.studio"></a>
          <button role="menuitem" id="signOutBtn" data-i18n="nav.signout"></button>
        </div>
      </div>`;
    host.querySelector('#userBtn').setAttribute('aria-label', u.name);
    host.querySelector('.who').textContent = u.name.split(/\s+/)[0];
    host.querySelector('.um-name').textContent = u.name;
    host.querySelector('.um-mail').textContent = u.email;
    wireMenu(host.querySelector('#userBtn'), host.querySelector('#userMenu'));
    host.querySelector('#signOutBtn').addEventListener('click', () => { auth.signOut(); if (/^\/account/.test(here())) location.href = '/'; });
  }
  applyI18n(host);
}

// pages that need an account call this: returns the user, or sends the visitor to sign in and comes back afterwards
export async function requireUser() {
  const s = await auth.verify();
  if (!s) { location.replace(`/signin?next=${next()}`); return null; }
  return s;
}
export const safeNext = (fallback = '/account') => {
  const n = new URLSearchParams(location.search).get('next') || '';
  return /^\/[a-z0-9\-\/]*(\?[\w=&%.\-]*)?(#[\w-]*)?$/i.test(n) && !n.startsWith('//') ? n : fallback;
};
