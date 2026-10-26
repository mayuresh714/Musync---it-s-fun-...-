// Sign in and sign up share one script: the form on the page decides what happens.
import { mountLayout, safeNext } from './layout.js';
import { auth } from './auth.js';
import { t, applyI18n } from './i18n.js';

const isUp = !!document.getElementById('name');
mountLayout({ active: isUp ? 'signup' : 'signin' });

const form = document.getElementById('form'), err = document.getElementById('err'), btn = document.getElementById('submit');
const pw = document.getElementById('password'), tog = document.getElementById('pwToggle');
const keep = new URLSearchParams(location.search).get('next');
document.getElementById('switch').href = `${isUp ? '/signin' : '/signup'}${keep ? `?next=${encodeURIComponent(keep)}` : ''}`;

// already signed in: nothing to do here
if (auth.user()) location.replace(safeNext('/account'));

tog.addEventListener('click', () => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  tog.dataset.i18n = show ? 'auth.hide' : 'auth.show';
  applyI18n(tog.parentNode);
});
document.getElementById('forgot')?.addEventListener('click', () => { const b = document.getElementById('forgotBox'); b.hidden = !b.hidden; });

let lastErr = null;
const show = (code) => { lastErr = code; err.hidden = !code; if (code) { err.textContent = t(`auth.err.${code}`) === `auth.err.${code}` ? t('auth.err.generic') : t(`auth.err.${code}`); } };
window.addEventListener('musync:lang', () => lastErr && show(lastErr));
const mark = (id, bad) => document.getElementById(id)?.setAttribute('aria-invalid', String(!!bad));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show(null);
  for (const id of ['name', 'email', 'password']) mark(id, false);
  const v = Object.fromEntries(new FormData(form));
  btn.disabled = true;
  const label = btn.textContent;
  btn.innerHTML = '<span class="spin"></span>';
  try {
    if (isUp) await auth.signUp(v); else await auth.signIn(v);
    // a new account lands on its welcome checklist; a returning one goes back to where it came from
    location.href = safeNext(isUp ? '/account?welcome=1' : '/account');
  } catch (ex) {
    const code = ex.code || 'generic';
    show(code);
    if (code === 'email' || code === 'taken') mark('email', true);
    if (code === 'name') mark('name', true);
    if (code === 'weak' || code === 'bad') mark('password', true);
    document.querySelector('[aria-invalid="true"]')?.focus();
    btn.disabled = false; btn.textContent = label;
  }
});
