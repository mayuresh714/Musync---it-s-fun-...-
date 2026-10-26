// Language for the website pages: remembered in this browser, falls back to English word by word.
import { STRINGS, LANGS } from './strings.js';

const KEY = 'musync.lang';
let lang = 'en';
try {
  const saved = localStorage.getItem(KEY);
  const guess = (navigator.language || 'en').slice(0, 2).toLowerCase();
  lang = STRINGS[saved] ? saved : STRINGS[guess] ? guess : 'en';
} catch {}

export { LANGS };
export const getLang = () => lang;
export function setLang(l) {
  if (!STRINGS[l]) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch {}
  document.documentElement.lang = l;
  applyI18n();
  window.dispatchEvent(new CustomEvent('musync:lang', { detail: l }));
}
export function t(key, vars) {
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
// data-i18n sets the text, data-i18n-ph the placeholder, data-i18n-aria the aria-label, data-i18n-alt the alt text
export function applyI18n(root = document) {
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n, n.dataset.vars ? JSON.parse(n.dataset.vars) : undefined);
  for (const n of root.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
  for (const n of root.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
  for (const n of root.querySelectorAll('[data-i18n-alt]')) n.setAttribute('alt', t(n.dataset.i18nAlt));
  for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
}
document.documentElement.lang = lang;
