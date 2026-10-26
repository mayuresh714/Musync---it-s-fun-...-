// My shows: the getting-started checklist, the list of saved shows, and account settings.
import { mountLayout, requireUser } from './layout.js';
import { auth, shows } from './auth.js';
import { t, applyI18n } from './i18n.js';

mountLayout({ active: 'account' });
const $ = (id) => document.getElementById(id);
let me = null, list = [];
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const videos = () => { try { return +localStorage.getItem('musync.videos') || 0; } catch { return 0; } };
function toast(msg) { const n = $('toast'); n.textContent = msg; n.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.remove('on'), 2200); }

// small dialogs built on <dialog>: a text box, or a yes/no
function dialog({ title, input, ok, danger, expect }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = `<form method="dialog"><h2></h2>${input !== undefined ? '<input class="input" autocomplete="off" />' : ''}<div class="dlg-row"><button class="btn" value="no" type="button" data-x>✕</button><button class="btn ${danger ? 'danger' : 'primary'}" value="yes"></button></div></form>`;
    d.querySelector('h2').textContent = title;
    d.querySelector('[value=yes]').textContent = ok;
    const field = d.querySelector('input');
    if (field) field.value = input;
    d.querySelector('[data-x]').textContent = '×';
    d.querySelector('[data-x]').setAttribute('aria-label', 'Cancel');
    d.addEventListener('close', () => { const yes = d.returnValue === 'yes' && (!expect || field?.value === expect); resolve(yes ? (field ? field.value.trim() : true) : null); d.remove(); });
    d.querySelector('[data-x]').addEventListener('click', () => d.close('no'));
    document.body.append(d); d.showModal(); field?.select();
  });
}

function startCard() {
  const steps = [true, list.length > 0, videos() > 0];
  const host = $('start');
  if (steps.every(Boolean) && !new URLSearchParams(location.search).has('welcome')) { host.innerHTML = ''; return; }
  const now = steps.indexOf(false);
  host.innerHTML = `<div class="start"><h2 data-i18n="acc.start.t"></h2><ol>${steps.map((d, i) => `<li class="${d ? 'done' : i === now ? 'now' : ''}"><i>${d ? '✓' : i + 1}</i><span data-i18n="acc.start.${i + 1}"></span></li>`).join('')}</ol>
    ${now === -1 ? '<b data-i18n="acc.start.done"></b>' : `<a class="btn primary" href="/studio${now === 1 ? '?add=1' : ''}" data-i18n="${now === 1 ? 'acc.add' : 'acc.open'}"></a>`}</div>`;
  applyI18n(host);
}

function card(s) {
  const h = hue(s.title);
  const el = document.createElement('article');
  el.className = 'show';
  el.innerHTML = `<div class="show-top"><div class="show-art" style="background:linear-gradient(135deg,hsl(${h} 85% 68%),hsl(${(h + 50) % 360} 85% 58%))"></div><div style="min-width:0"><h3></h3><small></small></div></div>
    <div class="show-meta"><span class="tag"></span><span class="tag"></span></div>
    <div class="show-actions"><a class="btn primary sm" data-i18n="acc.open"></a><button class="btn sm" data-a="rename" data-i18n="acc.rename"></button><button class="btn sm" data-a="dl" data-i18n="acc.download"></button><button class="btn sm danger" data-a="del" data-i18n="acc.delete"></button></div>`;
  el.querySelector('.show-art').textContent = (s.title.match(/[\p{L}\p{N}]/u) || ['♪'])[0].toUpperCase();
  el.querySelector('h3').textContent = s.title;
  el.querySelector('small').textContent = s.artist || new Date(s.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const tags = el.querySelectorAll('.tag');
  tags[0].textContent = `${s.bpm} ${t('acc.meta.bpm')}`; tags[1].textContent = mmss(s.duration);
  el.querySelector('a').href = `/studio?show=${encodeURIComponent(s.id)}`;
  el.querySelector('[data-a=rename]').addEventListener('click', async () => {
    const name = await dialog({ title: t('acc.rename.ask'), input: s.title, ok: t('acc.set.save') });
    if (name) { await shows.rename(s.id, name.slice(0, 80)); await load(); toast(t('acc.saved')); }
  });
  el.querySelector('[data-a=del]').addEventListener('click', async () => {
    if (await dialog({ title: t('acc.confirm.delete', { title: s.title }), ok: t('acc.delete'), danger: true })) { await shows.delete(s.id); await load(); toast(t('acc.deleted')); }
  });
  el.querySelector('[data-a=dl]').addEventListener('click', async () => {
    const full = await shows.get(s.id);
    download(`${s.title.replace(/[^\w\- ]+/g, '').trim() || 'show'}.wal.json`, JSON.stringify(full.wal));
  });
  return el;
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function renderShows() {
  const host = $('shows');
  host.innerHTML = '';
  if (!list.length) {
    host.style.display = 'block';
    host.innerHTML = `<div class="empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg><h3 data-i18n="acc.empty.t"></h3><p data-i18n="acc.empty.d"></p><a class="btn primary lg" href="/studio?add=1" data-i18n="acc.add"></a></div>`;
  } else { host.style.display = ''; for (const s of list) host.append(card(s)); }
  applyI18n(host);
}

async function load() { list = await shows.list(me.id); startCard(); renderShows(); }

function renderSettings() {
  const p = $('paneSet');
  p.innerHTML = `
    <div class="panel"><h2 data-i18n="acc.set.profile"></h2>
      <div class="field"><label for="sName" data-i18n="auth.name"></label><input class="input" id="sName" maxlength="60" /></div>
      <div class="field"><label for="sMail" data-i18n="auth.email"></label><input class="input" id="sMail" disabled /></div>
      <button class="btn primary" id="saveName" data-i18n="acc.set.save"></button></div>
    <div class="panel"><h2 data-i18n="acc.set.pw"></h2><div class="form-err" id="pwErr" hidden></div>
      <div class="field"><label for="pOld" data-i18n="acc.set.pw.old"></label><input class="input" id="pOld" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="pNew" data-i18n="acc.set.pw.new"></label><input class="input" id="pNew" type="password" autocomplete="new-password" /><small data-i18n="auth.password.hint"></small></div>
      <button class="btn primary" id="savePw" data-i18n="acc.set.save"></button></div>
    <div class="panel"><h2 data-i18n="acc.set.data"></h2><p data-i18n="acc.set.data.d"></p><button class="btn" id="exportAll" data-i18n="acc.set.export"></button></div>
    <div class="panel danger"><h2 data-i18n="acc.set.danger"></h2><p data-i18n="acc.set.danger.d"></p><button class="btn danger" id="delAcc" data-i18n="acc.set.danger.btn"></button></div>`;
  $('sName').value = me.name; $('sMail').value = me.email;
  $('saveName').addEventListener('click', async () => { try { me = await auth.updateName($('sName').value); $('hello').textContent = t('acc.hello', { name: me.name.split(/\s+/)[0] }); toast(t('acc.saved')); } catch (e) { toast(t(`auth.err.${e.code || 'generic'}`)); } });
  $('savePw').addEventListener('click', async () => {
    const e = $('pwErr'); e.hidden = true;
    try { await auth.changePassword($('pOld').value, $('pNew').value); $('pOld').value = $('pNew').value = ''; toast(t('acc.saved')); }
    catch (x) { e.textContent = t(`auth.err.${x.code || 'generic'}`); e.hidden = false; }
  });
  $('exportAll').addEventListener('click', async () => download('musync-my-data.json', JSON.stringify({ account: { name: me.name, email: me.email }, shows: await shows.exportAll(me.id) })));
  $('delAcc').addEventListener('click', async () => {
    if (await dialog({ title: t('acc.set.danger.ask'), input: '', ok: t('acc.set.danger.btn'), danger: true, expect: 'DELETE' })) { await auth.deleteAccount(); location.href = '/'; }
  });
  applyI18n(p);
}

function tab(name) {
  const s = name === 'set';
  $('tabShows').setAttribute('aria-selected', String(!s)); $('tabSet').setAttribute('aria-selected', String(s));
  $('paneShows').hidden = s; $('paneSet').hidden = !s;
  if (s) renderSettings();
  history.replaceState(null, '', s ? '#settings' : location.pathname + location.search);
}

me = await requireUser();
if (me) {
  $('hello').textContent = t('acc.hello', { name: me.name.split(/\s+/)[0] });
  window.addEventListener('musync:lang', () => { $('hello').textContent = t('acc.hello', { name: me.name.split(/\s+/)[0] }); });
  $('tabShows').addEventListener('click', () => tab('shows'));
  $('tabSet').addEventListener('click', () => tab('set'));
  document.querySelector('.tabs').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const s = $('tabShows').getAttribute('aria-selected') === 'true'; tab(s ? 'set' : 'shows'); (s ? $('tabSet') : $('tabShows')).focus(); } });
  await load();
  if (location.hash === '#settings') tab('set');
  applyI18n();
}
