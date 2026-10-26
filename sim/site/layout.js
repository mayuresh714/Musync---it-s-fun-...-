// Header and footer shared by every website page, plus the language picker and the signed-in menu.
import { t, applyI18n, setLang, getLang, LANGS } from './i18n.js';
import { auth } from './auth.js';

const MARK = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffb454" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 20.5 3.8 4.5M12 20.5V3M12 20.5l8.2-16"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const here = () => location.pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
const next = () => encodeURIComponent(here() + location.search);

export function mountLayout({ active = '' } = {}) {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  if (header) header.innerHTML = `
    <div class="bar container">
      <a class="brand" href="/" aria-label="Musync">${MARK}<span>Musync</span></a>
      <nav class="links" id="navLinks" aria-label="Main">
        <a href="/#how" data-i18n="nav.how" class="${active === 'how' ? 'on' : ''}"></a>
        <a href="/equipment" data-i18n="nav.lights" class="${active === 'equipment' ? 'on' : ''}"></a>
        <a href="/studio" data-i18n="nav.try" class="${active === 'studio' ? 'on' : ''}"></a>
      </nav>
      <div class="tools">
        <label class="lang"><span class="sr" data-i18n="nav.language"></span>
          <select id="langSel" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
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

  const sel = document.getElementById('langSel');
  if (sel) { sel.value = getLang(); sel.addEventListener('change', () => setLang(sel.value)); }
  const burger = document.getElementById('burger');
  burger?.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  });
  document.getElementById('navLinks')?.addEventListener('click', (e) => { if (e.target.closest('a')) { burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); } });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { burger?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); closeMenu(); } });

  renderAuth();
  auth.onChange(renderAuth);
  applyI18n();
  window.addEventListener('musync:lang', () => { renderAuth(); applyI18n(); });
  auth.verify().then((s) => { if (!s && auth.user()) renderAuth(); });
}

let menuOpen = false;
function closeMenu() { menuOpen = false; document.getElementById('userMenu')?.setAttribute('hidden', ''); document.getElementById('userBtn')?.setAttribute('aria-expanded', 'false'); }

function renderAuth() {
  const host = document.getElementById('authArea');
  if (!host) return;
  const u = auth.user();
  if (!u) {
    host.innerHTML = `<a class="btn ghost sm" href="/signin?next=${next()}" data-i18n="nav.signin"></a><a class="btn primary sm" href="/signup?next=${next()}" data-i18n="nav.signup"></a>`;
  } else {
    const initial = (u.name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    host.innerHTML = `
      <button class="avatar-btn" id="userBtn" aria-haspopup="menu" aria-expanded="false" aria-label="${u.name.replace(/[<>&"]/g, '')}"><span class="avatar">${initial}</span><span class="who"></span>${CHEV}</button>
      <div class="user-menu" id="userMenu" role="menu" hidden>
        <div class="um-head"><b class="um-name"></b><small class="um-mail"></small></div>
        <a role="menuitem" href="/account" data-i18n="nav.shows"></a>
        <a role="menuitem" href="/studio" data-i18n="nav.studio"></a>
        <button role="menuitem" id="signOutBtn" data-i18n="nav.signout"></button>
      </div>`;
    host.querySelector('.who').textContent = u.name.split(/\s+/)[0];
    host.querySelector('.um-name').textContent = u.name;
    host.querySelector('.um-mail').textContent = u.email;
    const btn = host.querySelector('#userBtn'), menu = host.querySelector('#userMenu');
    btn.addEventListener('click', (e) => { e.stopPropagation(); menuOpen = menu.hidden; menu.hidden = !menuOpen; btn.setAttribute('aria-expanded', String(menuOpen)); });
    document.addEventListener('click', (e) => { if (menuOpen && !menu.contains(e.target)) closeMenu(); });
    host.querySelector('#signOutBtn').addEventListener('click', () => { auth.signOut(); if (/^\/(account)/.test(here())) location.href = '/'; });
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
