// Accounts inside the studio: a sign in / sign up dialog (so nobody has to leave the page and lose what they picked),
// and the person's saved shows as library entries. The pages in sim/site use the same auth and store.
import { auth, shows } from '../site/auth.js';
import { STRINGS } from '../site/strings.js';
import { el, modal, toast } from './kit.js';
import { icon } from './icons.js';

const E = STRINGS.en;
const errText = (code) => E[`auth.err.${code}`] || E['auth.err.generic'];

export const currentUser = () => auth.user();

// reason: one plain sentence saying why an account is needed right now
export function openAuth({ mode = 'up', reason = '', onDone } = {}) {
  let up = mode === 'up';
  const body = el('div', {});
  const footer = el('div', {});
  const m = modal({ title: up ? E['auth.up.title'] : E['auth.in.title'], sub: reason || (up ? E['auth.up.sub'] : E['auth.in.sub']), body, footer });
  const render = () => {
    body.innerHTML = ''; footer.innerHTML = '';
    m.el.querySelector('h2').textContent = up ? E['auth.up.title'] : E['auth.in.title'];
    const err = el('div', { class: 'est-box', role: 'alert', hidden: true });
    const field = (id, label, type, ac, extra = {}) => el('label', { class: 'field' }, el('span', { text: label }), el('input', { class: 'input', id: `au-${id}`, name: id, type, autocomplete: ac, autocapitalize: 'none', spellcheck: 'false', ...extra }));
    const name = up ? field('name', E['auth.name'], 'text', 'name', { maxlength: '60' }) : null;
    const email = field('email', E['auth.email'], 'email', 'email', { inputmode: 'email' });
    const pw = field('password', E['auth.password'], 'password', up ? 'new-password' : 'current-password');
    const go = el('button', { class: 'btn primary', type: 'submit', text: up ? E['auth.up.btn'] : E['auth.in.btn'] });
    const form = el('form', { novalidate: true, style: { display: 'grid', gap: '12px' } }, err, ...(up ? [name] : []), email, pw,
      up ? el('small', { class: 'muted', text: E['auth.password.hint'] }) : null,
      el('small', { class: 'muted', text: E['auth.device'] }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const v = Object.fromEntries(new FormData(form));
      go.disabled = true;
      try {
        const u = up ? await auth.signUp(v) : await auth.signIn(v);
        m.close();
        toast(`Welcome${up ? '' : ' back'}, ${u.name.split(/\s+/)[0]}.`, { kind: 'ok' });
        onDone?.(u);
      } catch (ex) { err.hidden = false; err.innerHTML = `${icon('alert', 16)}<span></span>`; err.querySelector('span').textContent = errText(ex.code); go.disabled = false; }
    });
    body.append(form);
    footer.append(
      el('button', { class: 'btn ghost', type: 'button', text: up ? `${E['auth.up.switch']} ${E['auth.up.switchLink']}` : `${E['auth.in.switch']} ${E['auth.in.switchLink']}`, onclick: () => { up = !up; render(); } }),
      go);
    go.addEventListener('click', (e) => { e.preventDefault(); form.requestSubmit(); });
    setTimeout(() => (name || email).querySelector('input').focus(), 30);
  };
  render();
}

// the signed-in person's shows as library entries (metadata only; the WAL is read from this browser when played)
export async function userEntries() {
  const u = auth.user();
  if (!u) return [];
  try {
    return (await shows.list(u.id)).map((s) => ({ id: s.id, title: s.title, artist: s.artist || '', bpm: s.bpm, duration: s.duration, styles: s.styles, mood: s.mood, language: s.language, created: s.created, wal: `idb:${s.id}`, local: true, audioSha: s.audioSha, source: 'device' }));
  } catch { return []; }
}
export { auth, shows };
