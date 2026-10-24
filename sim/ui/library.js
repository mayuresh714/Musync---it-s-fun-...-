// The library sheet: browse, search and play any number of songs, and add new ones in bulk.
// Songs tab: search box + sort + filters over a virtualised list (only the visible rows exist in the DOM).
// Add tab: drop or choose many audio files, watch each go through the director's queue.
// Keyboard: L opens, / or Ctrl+K searches, arrows move, Enter plays, Ctrl+S favourites, Esc backs out.
import { icon } from './icons.js';
import { $, el, bus, fmtTime, popover, menuItem, modal, toast, segIndicator, closePopover } from './kit.js';
import { SORTS, FILTERS, highlight } from '../library.js';

const ROW = 60;
const OCCASIONS = [['', 'Let the director decide'], ['bollywood', 'Bollywood / film'], ['dandiya', 'Dandiya / garba'], ['edm', 'Club / EDM'], ['concert', 'Concert'], ['wedding', 'Wedding / sangeet'], ['romantic', 'Romantic'], ['devotional', 'Devotional']];
const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initial = (t) => (t.match(/[\p{L}\p{N}]/u) || ['♪'])[0].toUpperCase();
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n > 1e7 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function initLibrary({ lib, onb, actions, getState }) {
  const S = { open: false, view: 'songs', q: '', filter: 'all', sort: 'recent', style: null, language: null, active: 0, results: [], first: -1, last: -1 };
  let root = null, dom = {};
  const lastFocus = { el: null };

  // ── open / close ──────────────────────────────────────────────────────
  function open(view = 'songs', opts = {}) {
    if (S.open) { setView(view); if (view === 'songs') dom.search?.focus(); return; }
    closePopover();
    lastFocus.el = document.activeElement;
    S.open = true; S.view = view; S.q = opts.q ?? ''; S.first = S.last = -1;
    build();
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('on'));
    refresh({ toCurrent: true });
    setView(view, { focus: true });
    onb.checkBackend();
    bus.emit('library', { open: true });
  }
  function close() {
    if (!S.open) return;
    S.open = false;
    closePopover();
    root.classList.remove('on');
    const r = root; root = null;
    setTimeout(() => r.remove(), 240);
    lastFocus.el?.focus?.({ preventScroll: true });
    bus.emit('library', { open: false });
  }
  const toggle = () => (S.open ? close() : open());

  // ── shell ─────────────────────────────────────────────────────────────
  function build() {
    dom = {};
    const tabs = el('div', { class: 'seg tabs', role: 'tablist', 'aria-label': 'Library sections' });
    dom.tabSongs = el('button', { role: 'tab', id: 'tab-songs', 'aria-controls': 'pane-songs', html: `${icon('note', 16)}<span>Songs</span><span class="count" data-count></span>`, onclick: () => setView('songs', { focus: true }) });
    dom.tabAdd = el('button', { role: 'tab', id: 'tab-add', 'aria-controls': 'pane-add', html: `${icon('plus', 16)}<span>Add songs</span><span class="count badge" data-badge hidden></span>`, onclick: () => setView('add', { focus: true }) });
    tabs.append(dom.tabSongs, dom.tabAdd);
    tabs.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const to = S.view === 'songs' ? 'add' : 'songs'; setView(to); (to === 'songs' ? dom.tabSongs : dom.tabAdd).focus(); }
    });
    dom.placeTabs = segIndicator(tabs);
    const closeBtn = el('button', { class: 'btn icon ghost', 'aria-label': 'Close library', 'data-tip': 'Close', 'data-kbd': 'Esc', html: icon('close', 18), onclick: close });
    const head = el('header', { class: 'sheet-head' }, tabs, el('span', { class: 'grow' }), closeBtn);

    dom.paneSongs = el('section', { class: 'pane-songs', id: 'pane-songs', role: 'tabpanel', 'aria-labelledby': 'tab-songs' });
    dom.paneAdd = el('section', { class: 'pane-add', id: 'pane-add', role: 'tabpanel', 'aria-labelledby': 'tab-add', hidden: true });
    buildSongs();
    buildAdd();

    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Song library' }, head, dom.paneSongs, dom.paneAdd);
    root = el('div', { class: 'backdrop sheet-back', onpointerdown: (e) => e.target === root && close() }, sheet);
    sheet.addEventListener('keydown', onKey);
    dom.sheet = sheet;
    onb && renderAdd();
  }

  function setView(v, { focus = false } = {}) {
    S.view = v;
    if (!root) return;
    for (const [t, id] of [[dom.tabSongs, 'songs'], [dom.tabAdd, 'add']]) { t.setAttribute('aria-selected', String(id === v)); t.classList.toggle('on', id === v); t.tabIndex = id === v ? 0 : -1; }
    dom.paneSongs.hidden = v !== 'songs';
    dom.paneAdd.hidden = v !== 'add';
    requestAnimationFrame(() => { dom.placeTabs(); if (v === 'songs') renderRows(true); });
    if (focus) requestAnimationFrame(() => (v === 'songs' ? dom.search : dom.pick)?.focus({ preventScroll: true }));
  }

  // ── songs tab ─────────────────────────────────────────────────────────
  function buildSongs() {
    dom.search = el('input', {
      class: 'input', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'songlist', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'Search songs, artists, moods…   try bpm:120-130', 'aria-label': 'Search songs', 'data-autofocus': '',
      oninput: () => { S.q = dom.search.value; S.active = 0; refresh(); },
    });
    const searchBox = el('div', { class: 'search' }, el('span', { html: icon('search', 16) }), dom.search);
    dom.sortBtn = el('button', { class: 'btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Sort songs', onclick: () => openSort() });
    dom.chips = el('div', { class: 'seg chips', role: 'toolbar', 'aria-label': 'Show' });
    for (const [id, label] of FILTERS) dom.chips.append(el('button', { 'data-f': id, 'aria-pressed': String(id === S.filter), html: `${id === 'fav' ? icon('star', 14) : ''}<span>${label}</span>`, onclick: () => { S.filter = id; S.active = 0; refresh(); } }));
    dom.placeChips = segIndicator(dom.chips);
    dom.styleBtn = el('button', { class: 'btn sm', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => openFacet('styles') });
    dom.langBtn = el('button', { class: 'btn sm', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => openFacet('language') });
    dom.reset = el('button', { class: 'btn sm ghost', hidden: true, html: `${icon('close', 14)}<span>Clear filters</span>`, onclick: () => { S.q = ''; S.filter = 'all'; S.style = S.language = null; dom.search.value = ''; S.active = 0; refresh(); dom.search.focus(); } });
    const bar = el('div', { class: 'tools' }, searchBox, dom.sortBtn);
    const facets = el('div', { class: 'tools sub' }, dom.chips, el('span', { class: 'grow' }), dom.styleBtn, dom.langBtn, dom.reset);

    dom.list = el('div', { class: 'slist', id: 'songlist', role: 'listbox', 'aria-label': 'Songs', tabindex: '0', onscroll: () => renderRows(), onclick: onListClick, oncontextmenu: onListContext });
    dom.spacer = el('div', { class: 'sspacer' });
    dom.rows = el('div', { class: 'srows' });
    dom.list.append(dom.spacer, dom.rows);
    dom.empty = el('div', { class: 'empty big', hidden: true });
    dom.foot = el('footer', { class: 'sfoot' },
      el('span', { class: 'sum', 'aria-live': 'polite' }),
      el('span', { class: 'keys' },
        ...[['↑↓', 'move'], ['↵', 'play'], ['Ctrl S', 'favourite'], ['/', 'search'], ['Esc', 'close']].map(([k, t]) => el('span', {}, el('span', { class: 'kbd', text: k }), ' ' + t))));
    dom.sum = dom.foot.querySelector('.sum');
    dom.paneSongs.append(bar, facets, el('div', { class: 'lwrap' }, dom.list, dom.empty), dom.foot);
    new ResizeObserver(() => renderRows(true)).observe(dom.list);
  }

  function refresh({ toCurrent = false } = {}) {
    S.results = lib.search(S);
    if (toCurrent) { const i = S.results.findIndex((e) => e.id === getState().songId); S.active = Math.max(0, i); }
    S.active = Math.min(S.active, Math.max(0, S.results.length - 1));
    if (!root) return;
    for (const b of dom.chips.children) { const on = b.dataset.f === S.filter; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
    dom.placeChips();
    dom.sortBtn.innerHTML = `${icon('sort', 16)}<span>${SORTS[S.sort].label}</span>${icon('chevron', 14)}`;
    const labelOf = (btn, text, val) => { btn.innerHTML = `<span>${val || text}</span>${icon('chevron', 12)}`; btn.classList.toggle('active', !!val); };
    labelOf(dom.styleBtn, 'Style', S.style);
    labelOf(dom.langBtn, 'Language', S.language);
    dom.reset.hidden = !(S.q || S.filter !== 'all' || S.style || S.language);
    const n = lib.entries.length;
    root.querySelector('[data-count]').textContent = n.toLocaleString();
    dom.sum.textContent = n === S.results.length ? `${n.toLocaleString()} song${n === 1 ? '' : 's'}` : `${S.results.length.toLocaleString()} of ${n.toLocaleString()} songs`;
    renderEmpty();
    dom.spacer.style.height = `${S.results.length * ROW}px`;
    S.first = S.last = -1;
    renderRows(true);
    if (toCurrent) scrollTo(S.active, 'center');
  }

  function renderEmpty() {
    const none = !S.results.length;
    dom.empty.hidden = !none;
    dom.list.hidden = none;
    if (!none) return;
    dom.rows.innerHTML = '';
    dom.empty.innerHTML = '';
    if (!lib.entries.length) {
      dom.empty.append(el('span', { html: icon('note', 28) }), el('b', { text: 'Your library is empty' }), el('span', { text: 'Add a few songs and the director will turn each one into a light show.' }),
        el('button', { class: 'btn primary', html: `${icon('plus', 16)}<span>Add songs</span>`, onclick: () => setView('add', { focus: true }) }));
    } else {
      dom.empty.append(el('span', { html: icon('search', 28) }), el('b', { text: S.q ? `Nothing matches “${S.q}”` : S.filter === 'fav' ? 'No favourites yet' : 'No songs here' }),
        el('span', { text: S.filter === 'fav' ? 'Press Ctrl S on a song to keep it here.' : 'Try fewer words, or clear the filters.' }),
        el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Clear search and filters', onclick: () => dom.reset.click() }),
          S.q ? el('button', { class: 'btn primary', html: `${icon('plus', 16)}<span>Add a song</span>`, onclick: () => setView('add', { focus: true }) }) : null));
    }
  }

  function rowHtml(e, i) {
    const cur = e.id === getState().songId, playing = cur && getState().playing, active = i === S.active;
    const h = hue(e.id);
    const chips = [e.styles[0] && `<span class="chip">${e.styles[0]}</span>`, e.bpm && `<span class="chip mono">${e.bpm} BPM</span>`, e.duration && `<span class="chip mono">${fmtTime(e.duration)}</span>`].filter(Boolean).join('');
    const sub = [e.artist, e.language].filter(Boolean).join(' · ');
    return `<div class="srow${cur ? ' cur' : ''}${active ? ' active' : ''}${playing ? ' playing' : ''}" role="option" id="sr-${e.id}" data-i="${i}" data-id="${e.id}" aria-selected="${active}" style="top:${i * ROW}px">
      <span class="sart" style="--a:hsl(${h} 70% 62%);--b:hsl(${(h + 48) % 360} 72% 48%)">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : initial(e.title)}</span>
      <span class="smeta"><b class="ellipsis">${highlight(e.title, S.q)}</b><small class="ellipsis">${sub ? highlight(sub, S.q) : '<span class="faint">Unknown artist</span>'}${e.source === 'ai' ? ` <span class="made">${e.engine === 'code' ? 'Code' : 'AI'}</span>` : ''}</small></span>
      <span class="schips">${chips}</span>
      <button class="sfav btn icon ghost sm" tabindex="-1" data-act="fav" aria-label="${lib.isFav(e.id) ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${lib.isFav(e.id)}">${icon('star', 16)}</button>
      <button class="smore btn icon ghost sm" tabindex="-1" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more', 16)}</button>
    </div>`;
  }

  function renderRows(force = false) {
    if (!root || S.view !== 'songs' || dom.list.hidden) return;
    const h = dom.list.clientHeight || 400;
    const top = dom.list.scrollTop;
    const first = Math.max(0, Math.floor(top / ROW) - 4), last = Math.min(S.results.length - 1, Math.ceil((top + h) / ROW) + 4);
    if (!force && first === S.first && last === S.last) return;
    S.first = first; S.last = last;
    let html = '';
    for (let i = first; i <= last; i++) html += rowHtml(S.results[i], i);
    const hadFocus = dom.rows.contains(document.activeElement);
    dom.rows.innerHTML = html;
    // re-rendering removes the button that was clicked; hand focus back so the keyboard keeps working
    if (hadFocus || document.activeElement === document.body) dom.search.focus({ preventScroll: true });
    const a = S.results[S.active];
    if (a) dom.search.setAttribute('aria-activedescendant', `sr-${a.id}`); else dom.search.removeAttribute('aria-activedescendant');
  }

  function scrollTo(i, where = 'nearest') {
    if (!dom.list) return;
    const h = dom.list.clientHeight, top = dom.list.scrollTop, y = i * ROW;
    if (where === 'center') dom.list.scrollTop = Math.max(0, y - h / 2 + ROW / 2);
    else if (y < top) dom.list.scrollTop = y;
    else if (y + ROW > top + h) dom.list.scrollTop = y + ROW - h;
    renderRows(true);
  }
  function setActive(i, scroll = true) {
    if (!S.results.length) return;
    S.active = Math.max(0, Math.min(S.results.length - 1, i));
    if (scroll) scrollTo(S.active); else renderRows(true);
  }

  function play(i) {
    const e = S.results[i];
    if (!e) return;
    S.active = i;
    actions.playSong(e.id, { queue: S.results.map((x) => x.id) });
    close();
  }
  function onListClick(ev) {
    const row = ev.target.closest('.srow');
    if (!row) return;
    const i = +row.dataset.i, e = S.results[i];
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') { const on = lib.toggleFav(e.id); renderRows(true); if (S.filter === 'fav' && !on) setTimeout(() => refresh(), 0); return; }
    if (act === 'more') { openRowMenu(e, ev.target.closest('[data-act]')); return; }
    play(i);
  }
  function onListContext(ev) {
    const row = ev.target.closest('.srow');
    if (!row) return;
    ev.preventDefault();
    S.active = +row.dataset.i; renderRows(true);
    openRowMenu(S.results[S.active], row.querySelector('.smore'));
  }

  function openRowMenu(e, anchor) {
    const mine = e.source !== 'demo' && e.director;
    const items = [
      menuItem({ icon: 'play', label: 'Play', onClick: () => { pop.close(); play(S.results.indexOf(e)); } }),
      menuItem({ icon: 'star', label: lib.isFav(e.id) ? 'Remove from favourites' : 'Add to favourites', right: el('span', { class: 'kbd', text: 'Ctrl S' }), onClick: () => { pop.close(); lib.toggleFav(e.id); refresh(); } }),
    ];
    if (mine) items.push(el('div', { class: 'menu-sep' }), menuItem({ icon: 'pencil', label: 'Rename…', onClick: () => { pop.close(); renameDialog(e); } }), menuItem({ icon: 'trash', label: 'Delete…', onClick: () => { pop.close(); deleteDialog(e); } }));
    const pop = popover(anchor, el('div', {}, ...items), { width: 250, align: 'end' });
  }

  function renameDialog(e) {
    const title = el('input', { class: 'input', value: e.title, 'data-autofocus': '', 'aria-label': 'Title' });
    const artist = el('input', { class: 'input', value: e.artist, placeholder: 'Artist', 'aria-label': 'Artist' });
    const save = async () => {
      try {
        const r = await fetch(`/api/library/${e.id}`, { method: 'PATCH', body: JSON.stringify({ title: title.value, artist: artist.value }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        dlg.close(); await actions.reloadLibrary(); refresh();
      } catch (err) { toast(`Couldn't rename: ${err.message}`, { kind: 'error' }); }
    };
    [title, artist].forEach((i) => i.addEventListener('keydown', (k) => { if (k.key === 'Enter') save(); }));
    const dlg = modal({ title: 'Rename song', body: el('div', { class: 'stack' }, el('label', { class: 'field' }, el('span', { text: 'Title' }), title), el('label', { class: 'field' }, el('span', { text: 'Artist' }), artist)),
      footer: [el('button', { class: 'btn', text: 'Cancel', onclick: () => dlg.close() }), el('button', { class: 'btn primary', text: 'Save', onclick: save })] });
  }
  function deleteDialog(e) {
    const go = async () => {
      try {
        const r = await fetch(`/api/library/${e.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        dlg.close(); toast(`Deleted “${e.title}”.`, { kind: 'ok', ms: 2400 }); await actions.reloadLibrary(); refresh();
      } catch (err) { toast(`Couldn't delete: ${err.message}`, { kind: 'error' }); }
    };
    const dlg = modal({ title: 'Delete this song?', sub: e.title, body: el('p', { class: 'muted', text: 'The show and the stored audio are removed from this computer. This cannot be undone.' }),
      footer: [el('button', { class: 'btn', text: 'Keep it', 'data-autofocus': '', onclick: () => dlg.close() }), el('button', { class: 'btn danger', text: 'Delete', onclick: go })] });
  }

  function openSort() {
    const content = el('div', {}, el('div', { class: 'menu-title label', text: 'Sort by' }),
      ...Object.entries(SORTS).map(([id, s]) => menuItem({ label: s.label, checked: S.sort === id, onClick: () => { pop.close(); S.sort = id; S.active = 0; refresh(); dom.list.scrollTop = 0; } })));
    const pop = popover(dom.sortBtn, content, { width: 230, align: 'end' });
  }
  function openFacet(kind) {
    const list = lib.facets(kind === 'styles' ? 'styles' : 'language');
    const cur = kind === 'styles' ? S.style : S.language;
    const set = (v) => { if (kind === 'styles') S.style = v; else S.language = v; S.active = 0; refresh(); };
    const content = el('div', { class: 'facet-menu' }, el('div', { class: 'menu-title label', text: kind === 'styles' ? 'Style' : 'Language' }),
      menuItem({ label: 'Any', checked: !cur, onClick: () => { pop.close(); set(null); } }),
      ...list.slice(0, 40).map(([v, n]) => menuItem({ label: v, checked: cur === v, right: el('span', { class: 'muted mono', text: String(n) }), onClick: () => { pop.close(); set(v); } })));
    if (!list.length) content.append(el('div', { class: 'empty' }, el('span', { text: 'Nothing to filter by yet.' })));
    const pop = popover(kind === 'styles' ? dom.styleBtn : dom.langBtn, content, { width: 240, align: 'start' });
  }

  // Escape works wherever focus is (even in the first frame after opening, before focus has moved in).
  function onEsc(e) {
    if (!S.open || e.__handled) return;
    e.__handled = true;
    e.stopPropagation();
    if (S.view === 'songs' && S.q) { S.q = ''; dom.search.value = ''; refresh(); dom.search.focus(); } else close();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') onEsc(e); });

  // ── keyboard (inside the sheet) ───────────────────────────────────────
  function onKey(e) {
    const inSongs = S.view === 'songs';
    if (e.key === 'Escape') { onEsc(e); return; }
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...dom.sheet.querySelectorAll('button:not([tabindex="-1"]), input, select, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !inSongs) { e.preventDefault(); dom.startBtn?.click(); return; }
    if (!inSongs) return;
    const typing = e.target === dom.search;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(S.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(S.active - 1); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive(S.active + 8); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive(S.active - 8); }
    else if ((e.key === 'Home' || e.key === 'End') && !typing) { e.preventDefault(); setActive(e.key === 'Home' ? 0 : 1e9); }
    else if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); play(S.active); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); const r = S.results[S.active]; if (r) { lib.toggleFav(r.id); refresh(); } }
    else if (e.key === '/' && !typing) { e.preventDefault(); dom.search.focus(); dom.search.select(); }
    else if (e.key.length === 1 && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.target === dom.list) { dom.search.focus(); } // type anywhere to search
  }

  // ── add tab ───────────────────────────────────────────────────────────
  function buildAdd() {
    dom.banner = el('div', { class: 'banner', hidden: true });
    dom.file = el('input', { type: 'file', multiple: true, accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac', hidden: true, onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
    dom.pick = el('button', { class: 'dropbig', onclick: () => dom.file.click(),
      html: `${icon('upload', 26)}<b>Drop audio files here, or choose files</b><small>wav · mp3 · m4a · flac · ogg &nbsp;·&nbsp; add as many as you like; the director works through them one at a time (about 90 seconds each)</small>` });
    ['dragenter', 'dragover'].forEach((t) => dom.pick.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); dom.pick.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => dom.pick.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); dom.pick.classList.remove('over'); if (t === 'drop') addFiles([...e.dataTransfer.files]); }));
    dom.link = el('input', { class: 'input', type: 'url', placeholder: 'Paste a YouTube link and press Enter (one video per line works too)', 'aria-label': 'YouTube link',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addLinkNow(); } }, onpaste: () => setTimeout(addLinkNow, 0) });
    const linkRow = el('div', { class: 'linkrow' }, el('span', { class: 'lk-ico', html: icon('link', 16) }), dom.link, el('button', { class: 'btn', text: 'Add link', onclick: addLinkNow }));
    dom.engine = el('div', { class: 'seg engine', role: 'radiogroup', 'aria-label': 'How to make the show' });
    for (const [id, label, sub] of [['ai', 'AI director', 'Claude reads the lyrics and understands the song (about 2 min each)'], ['code', 'Code only', 'Fast and free, follows the sound and repeats (about 10 s each)']]) {
      dom.engine.append(el('button', { role: 'radio', 'data-e': id, 'aria-checked': 'false', 'data-tip': sub, 'data-tip-pos': 'below', html: `${icon(id === 'ai' ? 'sparkle' : 'pulse', 16)}<span>${label}</span>`, onclick: () => setEngine(id) }));
    }
    dom.placeEngine = segIndicator(dom.engine);
    dom.occasion = el('select', { class: 'input', 'aria-label': 'Occasion' }, ...OCCASIONS.map(([v, l]) => el('option', { value: v, text: l })));
    dom.artistAll = el('input', { class: 'input', placeholder: 'Same artist for all (optional)', 'aria-label': 'Artist for all songs' });
    dom.engineNote = el('small', { class: 'engine-note', 'aria-live': 'polite' });
    const engineRow = el('div', { class: 'field' }, el('span', { text: 'Method' }), dom.engine, dom.engineNote);
    const opts = el('div', { class: 'add-opts' }, el('label', { class: 'field' }, el('span', { text: 'Occasion' }), dom.occasion), el('label', { class: 'field' }, el('span', { text: 'Artist' }), dom.artistAll));
    dom.items = el('div', { class: 'aitems', role: 'list', 'aria-label': 'Songs to add' });
    dom.clearBtn = el('button', { class: 'btn ghost', text: 'Clear finished', onclick: () => onb.clearFinished() });
    dom.startBtn = el('button', { class: 'btn primary', onclick: () => onb.start(formNow()), 'data-tip': 'Start making the shows', 'data-kbd': 'Ctrl ↵' });
    dom.addFoot = el('footer', { class: 'afoot' }, el('span', { class: 'sum', 'aria-live': 'polite' }), el('span', { class: 'grow' }), dom.clearBtn, dom.startBtn);
    const other = el('div', { class: 'other' }, el('span', { class: 'label', text: 'Other ways' }),
      el('button', { class: 'btn sm ghost', html: `${icon('file', 14)}<span>Open a WAL file</span>`, onclick: () => { close(); actions.openWal(); } }),
      el('button', { class: 'btn sm ghost', html: `${icon('download', 14)}<span>Download the current show</span>`, onclick: () => actions.downloadWal() }),
      el('button', { class: 'btn sm ghost', html: `${icon('sparkle', 14)}<span>Quick draft one file</span>`, 'data-tip': 'Analyzes in the browser; no lyrics or AI', onclick: () => { close(); actions.pickAudio(); } }));
    const head = (n, t) => el('h3', { class: 'ahead' }, el('i', { text: n }), el('span', { text: t }));
    dom.paneAdd.append(dom.banner, dom.file,
      el('section', { class: 'asec' }, head('1', 'Choose what to add'), dom.pick, el('div', { class: 'or', text: 'or paste a YouTube link' }), linkRow),
      el('section', { class: 'asec' }, head('2', 'How the show is made'), el('div', { class: 'acard' }, engineRow, opts)),
      el('section', { class: 'asec grow-sec' }, head('3', 'Queue'), dom.items),
      other, dom.addFoot);
  }

  let engine = (() => { try { return localStorage.getItem('musync.engine'); } catch { return null; } })();
  const formNow = () => ({ style: dom.occasion.value, artist: dom.artistAll.value, engine: engineNow() });
  const engineNow = () => engine || (onb.state.backend?.claude ? 'ai' : 'code');
  function setEngine(id) { engine = id; try { localStorage.setItem('musync.engine', id); } catch {} renderEngine(); }
  function renderEngine() {
    if (!dom.engine) return;
    if (dom.engineNote) dom.engineNote.textContent = engineNow() === 'ai' ? 'Claude reads the lyrics and understands the song. About 2 minutes each.' : 'Follows the sound and repeats. Fast and free, about 10 seconds each.';
    for (const b of dom.engine.children) { const on = b.dataset.e === engineNow(); b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; }
    requestAnimationFrame(() => dom.placeEngine?.());
  }
  function addLinkNow() {
    const v = dom.link.value.trim();
    if (!v) return;
    const r = onb.addLinks(v);
    if (r.added) dom.link.value = ''; else toast('That is not a YouTube video link, or it is already in the list.', { kind: 'warn' });
  }

  function addFiles(files) {
    const r = onb.add(files);
    if (r.skipped && !r.added) toast('Those files are not audio, or are already in the list.', { kind: 'warn' });
    else if (r.skipped) toast(`Added ${r.added}; skipped ${r.skipped} (not audio, or already listed).`, { kind: 'info' });
  }

  function renderAdd() {
    if (!root) return;
    const st = onb.state, items = st.items;
    const b = st.backend;
    renderEngine();
    const needsAi = engineNow() === 'ai';
    const needsYt = items.some((i) => i.link && ['ready', 'error'].includes(i.status));
    dom.banner.hidden = !!(b && b.ffmpeg && (b.claude || !needsAi) && (b.ytdlp || !needsYt));
    if (!dom.banner.hidden) {
      dom.banner.innerHTML = '';
      const msg = b === undefined ? 'Checking the Musync backend…'
        : b === null ? 'The Musync backend is not running, so songs cannot be turned into shows yet. Start everything with npm run dev.'
        : !b.ffmpeg ? 'ffmpeg is not installed (brew install ffmpeg), so audio cannot be read.'
        : needsAi && !b.claude ? 'The Claude Code CLI was not found. Install it and sign in once by running claude in a terminal, or switch to Code only.'
        : 'yt-dlp is not installed, so links cannot be downloaded. Install it with: brew install yt-dlp';
      dom.banner.append(el('span', { html: icon('alert', 18) }), el('span', { class: 'grow', text: msg }),
        el('button', { class: 'btn sm', text: 'Check again', onclick: () => onb.checkBackend() }),
        el('button', { class: 'btn sm', text: 'Quick draft one file instead', 'data-tip': 'Analyzes in the browser; no lyrics or AI', onclick: () => { close(); actions.pickAudio(); } }));
    }
    dom.items.innerHTML = '';
    for (const it of items) dom.items.append(itemRow(it));
    if (st.remote.length) {
      dom.items.append(el('div', { class: 'label', style: { margin: '14px 4px 6px' }, text: 'Also in progress' }));
      for (const j of st.remote) dom.items.append(itemRow({ key: j.id, name: j.title, size: 0, status: j.status, stage: j.stage, detail: j.detail, position: j.position, jobId: j.id, remote: true }));
    }
    if (!items.length && !st.remote.length) dom.items.append(el('div', { class: 'empty' }, el('span', { text: 'Nothing queued. Songs you add appear here with live progress, and in the library when ready.' })));
    const ready = items.filter((i) => i.status === 'ready' || i.status === 'error').length;
    const active = onb.pending();
    dom.startBtn.disabled = !ready;
    dom.startBtn.innerHTML = ready ? `${icon('sparkle', 16)}<span>Make ${ready} show${ready > 1 ? 's' : ''}</span>` : `<span>${active ? 'Working…' : items.length ? 'All done' : 'Add songs to begin'}</span>`;
    dom.clearBtn.hidden = !items.some((i) => ['done', 'dup'].includes(i.status));
    dom.addFoot.querySelector('.sum').textContent = items.length ? `${items.length} file${items.length > 1 ? 's' : ''} · ${items.filter((i) => i.status === 'done').length} done${active ? ` · ${active} in progress` : ''}` : '';
    const badge = root.querySelector('[data-badge]');
    badge.hidden = !active; badge.textContent = String(active);
    root.querySelector('[data-count]').textContent = lib.entries.length.toLocaleString();
  }

  function itemRow(it) {
    const stages = onb.STAGES;
    const idx = onb.stageIndex(it.stage);
    const pct = it.status === 'done' ? 100 : it.status === 'running' ? Math.max(8, (idx / (stages.length - 1)) * 100) : 0;
    const label = {
      ready: 'Ready', uploading: 'Uploading…', queued: it.position > 1 ? `Waiting · ${it.position - 1} ahead` : 'Next in line', running: it.detail || 'Working…',
      done: it.upgrade ? 'Remade and ready to play (replaced the earlier show)' : 'Ready to play', dup: it.detail || 'Already in your library', error: it.error || 'Failed',
    }[it.status] || it.status;
    const actionsEl = el('span', { class: 'iacts' });
    if (it.status === 'done') actionsEl.append(el('button', { class: 'btn sm', html: `${icon('play', 14)}<span>Play</span>`, onclick: async () => { await actions.reloadLibrary(); actions.playSong(it.jobId, { queue: [it.jobId] }); close(); } }));
    if (it.status === 'dup' && it.dupId && !/being made/.test(it.detail)) {
      actionsEl.append(el('button', { class: 'btn sm', html: `${icon('play', 14)}<span>Play</span>`, onclick: () => { actions.playSong(it.dupId, { queue: [it.dupId] }); close(); } }));
      actionsEl.append(el('button', { class: 'btn sm', html: `${icon(engineNow() === 'ai' ? 'sparkle' : 'pulse', 14)}<span>Make again${engineNow() === 'ai' ? ' with AI' : ' with code'}</span>`, 'data-tip': 'Replaces the existing show when the new one is ready', onclick: () => onb.remake(it, formNow()) }));
    }
    if (it.status === 'error') actionsEl.append(el('button', { class: 'btn sm', text: 'Retry', onclick: () => onb.retry(it, formNow()) }));
    if (['queued', 'running'].includes(it.status)) actionsEl.append(el('button', { class: 'btn sm ghost', text: 'Cancel', onclick: () => onb.cancel(it) }));
    if (['ready', 'error', 'done', 'dup'].includes(it.status) && !it.remote) actionsEl.append(el('button', { class: 'btn icon sm ghost', 'aria-label': `Remove ${it.name}`, html: icon('close', 14), onclick: () => onb.remove(it.key) }));
    return el('div', { class: `aitem ${it.status}`, role: 'listitem' },
      el('span', { class: 'aico', html: icon(it.status === 'done' ? 'check' : it.status === 'error' ? 'alert' : it.link ? 'link' : 'note', 16) }),
      el('span', { class: 'ameta' }, el('b', { class: 'ellipsis', text: it.name }), el('small', { class: 'ellipsis', text: `${label}${it.size ? ' · ' + mb(it.size) : ''}` })),
      actionsEl,
      el('span', { class: 'abar', style: { '--v': pct / 100 }, hidden: !['running', 'done'].includes(it.status) }, el('i')));
  }

  // keep rows fresh when the library, favourites or the current song change
  lib.onChange(() => { if (root) refresh(); });
  onb && (onb.onUpdate = renderAdd);
  bus.on('playing', () => { if (root && S.view === 'songs') renderRows(true); });
  bus.on('wal', () => { if (root && S.view === 'songs') renderRows(true); });

  return { open, close, toggle, isOpen: () => S.open, addFiles, renderAdd, state: S };
}
