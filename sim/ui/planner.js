// "Design with AI": a chat that turns what someone needs (words, venue photos) into a rig and shows it at once.
// The backend runs Claude once per message; this panel only talks to /api/plan and applies the plan it gets back.
//
// The panel lives in three sizes, like an assistant in a code editor: a side panel (drag its edge to widen it), full
// screen for long conversations and photos, and a slim bar that keeps working while you look at the lights.
// Typing, speech and photos all land in one composer; the draft survives a reload.
import { icon } from './icons.js';
import { $, el, bus, toast } from './kit.js';

const KEY = 'musync.ai', PREFS = 'musync.ai.ui', DRAFT = 'musync.ai.draft';
const IDEAS = [
  ['Wedding in a banquet hall', 'A wedding reception for about 250 guests in an indoor banquet hall. Warm colours, keep it limited.', 'Indoor, 250 guests, warm'],
  ['Garden wedding', 'An open-air garden wedding at night for about 150 guests, with a mandap stage and a small dance floor.', 'Open air, mandap, 150 guests'],
  ['DJ night, 200-cap club', 'A 200-capacity club night. DJ booth at the back wall, 5 m ceiling. About 20 fixtures.', 'DJ booth, about 20 lights'],
  ['Outdoor concert', 'An outdoor concert for about 3,000 people on a main stage. Beams, washes and a few strobes.', 'Main stage, 3,000 people'],
];
const TWEAKS = ['Make it warmer', 'Add more beams', 'Use fewer lights', 'Add strobes for the drops'];
const LANGS = [['en-IN', 'EN', 'English (India)'], ['hi-IN', 'HI', 'Hindi'], ['mr-IN', 'MR', 'Marathi'], ['gu-IN', 'GU', 'Gujarati'], ['pa-IN', 'PA', 'Punjabi']];
const MIN_W = 360, MAX_FRAC = 0.7, DEF_W = 460;

const jget = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const jset = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* storage may be unavailable */ } };
const load = () => { const v = jget(KEY); return v && Array.isArray(v.messages) ? v : null; };
const save = (s) => jset(KEY, { sid: s.sid, messages: s.messages.slice(-30) });
const clock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

export function initPlanner({ actions, getState, drawers }) {
  const ui = $('#ui');
  let st = load() || { sid: null, messages: [] };
  let busy = false, files = [], appliedAt = -1;
  let offline = false; // the hosted demo has no Musync backend, so the AI designer cannot run there
  let scope = null, ctl = null, jobId = null, cancelled = false; // scope: 'new' rig or 'edit' the one on screen
  let prefs = { w: DEF_W, mode: 'side', lang: 'en-IN', ...(jget(PREFS) || {}) };
  if (prefs.mode === 'min') prefs.mode = 'side';
  let since = 0, ticker = null, unread = false, pendingLabel = '';
  const speech = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  const SR = speech();
  let rec = null, listening = false, base = '';

  // ── header ──────────────────────────────────────────────────────────────────
  const status = el('span', { class: 'ai-status', role: 'status' });
  const hbtn = (label, ic, fn, cls = '') => el('button', { class: `btn icon ghost sm ${cls}`, 'aria-label': label, 'data-tip': label, html: icon(ic, 16), onclick: fn });
  const clear = el('button', { class: 'btn ghost sm ai-new', html: `${icon('plus', 14)}<span>New design</span>`, 'aria-label': 'Start a new design', onclick: () => { if (busy) return; st = { sid: null, messages: [] }; appliedAt = -1; scope = null; save(st); render(); text.focus(); } });
  const minBtn = hbtn('Minimise', 'minus', () => setMode('min'), 'ai-min');
  const quietBtn = el('button', { class: 'btn icon ghost sm ai-quiet', 'aria-pressed': 'false', onclick: () => actions.quiet(!getState().quiet) });
  const maxBtn = hbtn('Full screen', 'expand', () => setMode(prefs.mode === 'full' ? 'side' : 'full'), 'ai-max');
  const close = hbtn('Close Design with AI', 'close', () => drawers.close('ai'));
  const badge = el('i', { class: 'ai-dot', hidden: true, 'aria-hidden': 'true' });
  const head = el('header', { class: 'ai-header' },
    el('span', { class: 'ai-mark', html: icon('sparkle', 16) }),
    el('div', { class: 'ai-title' }, el('h2', { text: 'Design with AI' }), status),
    el('div', { class: 'ai-tools' }, clear, quietBtn, minBtn, maxBtn, close), badge);
  head.addEventListener('click', (e) => { if (prefs.mode === 'min' && !e.target.closest('.ai-tools button')) setMode('side'); });

  // ── conversation ────────────────────────────────────────────────────────────
  const list = el('div', { class: 'ai-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const jump = el('button', { class: 'ai-jump', hidden: true, html: `${icon('chevron', 14)}<span>Latest</span>`, onclick: () => toBottom(true) });
  list.addEventListener('scroll', () => { jump.hidden = list.scrollHeight - list.scrollTop - list.clientHeight < 140; });
  const offlineNote = el('div', { class: 'ai-offline', hidden: true, role: 'note', html: `${icon('info', 16)}<span><b>The designer is off in this demo.</b> Design with AI needs the Musync server, which uses your own Claude login. Run Musync on your computer (see the README) to design rigs from words and photos. You can still try every light, place and camera here.</span>` });
  const body = el('div', { class: 'ai-body' }, offlineNote, list, jump);

  // ── composer ────────────────────────────────────────────────────────────────
  const text = el('textarea', { class: 'input ai-text', rows: '1', placeholder: 'Describe your event, or ask for a change', 'aria-label': 'Message to the designer', maxlength: '4000' });
  text.value = jget(DRAFT)?.v || '';
  const heard = el('div', { class: 'ai-heard', hidden: true, 'aria-live': 'polite' });
  const count = el('span', { class: 'ai-count', hidden: true });
  const picker = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true, onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
  const thumbs = el('div', { class: 'ai-thumbs' });
  const attach = el('button', { class: 'btn icon ghost', 'aria-label': 'Attach venue photos', 'data-tip': 'Attach photos of the venue', html: icon('photo', 20), onclick: () => picker.click() });
  const mic = el('button', { class: 'btn icon ghost ai-mic', 'aria-label': 'Speak your message', 'aria-pressed': 'false', 'data-tip': SR ? 'Speak instead of typing' : 'Speech input is not available in this browser', html: icon('mic', 20), disabled: !SR, onclick: () => (listening ? stopMic() : startMic()) });
  const langBtn = el('button', { class: 'btn ghost sm ai-lang', hidden: !SR, onclick: () => { const i = LANGS.findIndex((l) => l[0] === prefs.lang); prefs.lang = LANGS[(i + 1) % LANGS.length][0]; jset(PREFS, prefs); paintLang(); if (listening) { stopMic(); setTimeout(startMic, 250); } } });
  const hint = el('span', { class: 'ai-hint', html: '<kbd>Enter</kbd> to send<span class="nl"> · <kbd>Shift</kbd> + <kbd>Enter</kbd> new line</span>' });
  const sendBtn = el('button', { class: 'btn primary icon ai-send', 'aria-label': 'Send', 'data-tip': 'Send', html: icon('send', 20), onclick: () => (busy ? stop() : send()) });
  const row = el('div', { class: 'ai-row' }, attach, mic, langBtn, hint, count, sendBtn);
  const scopeNew = el('button', { class: 'ai-scope-b', role: 'radio', onclick: () => setScope('new') }, el('span', { html: icon('plus', 14) }), el('span', { text: 'New rig' }));
  const scopeEdit = el('button', { class: 'ai-scope-b', role: 'radio', onclick: () => setScope('edit') }, el('span', { html: icon('pencil', 14) }), el('span', { class: 'ellipsis' }));
  const scopeBar = el('div', { class: 'ai-scope', role: 'radiogroup', 'aria-label': 'What the designer works on' }, scopeNew, scopeEdit);
  const box = el('div', { class: 'ai-box' }, thumbs, text, heard, row);
  const drop = el('div', { class: 'ai-drop', hidden: true, html: `${icon('photo', 28)}<b>Drop photos to attach</b><span>JPEG, PNG, WebP or GIF, up to 4</span>` });
  const composer = el('div', { class: 'ai-composer' }, scopeBar, box, el('div', { class: 'ai-foot', text: 'AI can make mistakes. Check the lights it places.' }), picker);

  const grip = el('div', { class: 'ai-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize the panel', tabindex: '0', 'data-tip': 'Drag to resize, double-click to reset' });
  const node = el('aside', { id: 'aiDrawer', class: 'drawer right glass', 'aria-label': 'Design with AI', inert: true }, grip, head, body, composer, drop);
  ui.append(node);
  drawers.register('ai', node);

  // ── sizes: side, full, min ──────────────────────────────────────────────────
  const maxW = () => Math.max(MIN_W, Math.floor(window.innerWidth * MAX_FRAC));
  const clampW = (w) => Math.max(MIN_W, Math.min(maxW(), Math.round(w)));
  function applySize() { node.style.setProperty('--ai-w', `${clampW(prefs.w)}px`); }
  function setMode(m) {
    prefs.mode = m; jset(PREFS, prefs);
    node.classList.toggle('full', m === 'full'); node.classList.toggle('min', m === 'min');
    const full = m === 'full';
    maxBtn.setAttribute('aria-label', full ? 'Back to side panel' : 'Full screen'); maxBtn.dataset.tip = full ? 'Back to side panel' : 'Full screen';
    maxBtn.innerHTML = icon(full ? 'collapse' : 'expand', 16);
    minBtn.hidden = m === 'min';
    if (m === 'min') { text.blur(); } else { unread = false; paintStatus(); if (drawers.isOpen('ai')) setTimeout(() => text.focus({ preventScroll: true }), 200); toBottom(); }
  }
  grip.addEventListener('pointerdown', (e) => {
    if (prefs.mode !== 'side') return;
    e.preventDefault(); grip.setPointerCapture(e.pointerId); node.classList.add('resizing');
    const move = (ev) => { prefs.w = clampW(window.innerWidth - 12 - ev.clientX); applySize(); };
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); node.classList.remove('resizing'); jset(PREFS, prefs); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { prefs.w = DEF_W; applySize(); jset(PREFS, prefs); });
  grip.addEventListener('keydown', (e) => { const d = { ArrowLeft: 24, ArrowRight: -24 }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); prefs.w = clampW(prefs.w + d); applySize(); jset(PREFS, prefs); } });
  window.addEventListener('resize', applySize);

  // ── the composer ────────────────────────────────────────────────────────────
  const fit = () => { text.style.height = 'auto'; text.style.height = `${Math.min(text.scrollHeight + 2, node.classList.contains('full') ? 280 : 180)}px`; };
  const paintSend = () => {
    const v = text.value.trim().length, tooLong = text.value.length > 3400;
    sendBtn.disabled = !busy && !v;
    sendBtn.classList.toggle('stop', busy); sendBtn.innerHTML = icon(busy ? 'stop' : 'send', 20);
    sendBtn.setAttribute('aria-label', busy ? 'Stop' : 'Send');
    sendBtn.dataset.tip = busy ? 'Stop the designer (Esc)' : v ? 'Send' : 'Write a message first';
    count.hidden = !tooLong; count.textContent = `${text.value.length} / 4000`;
  };
  const saveDraft = () => jset(DRAFT, { v: text.value });
  text.addEventListener('input', () => { fit(); paintSend(); saveDraft(); });
  text.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    else if (e.key === 'Escape') { if (busy) stop(); else if (listening) stopMic(); else if (prefs.mode === 'full') setMode('side'); else text.blur(); }
  });
  text.addEventListener('keyup', (e) => e.stopPropagation());
  node.addEventListener('keydown', (e) => { if (e.key === 'Escape' && prefs.mode === 'full' && e.target !== text) { e.stopPropagation(); setMode('side'); } });
  text.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addFiles(f); } });

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
  node.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; drop.hidden = false; } });
  node.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
  node.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  node.addEventListener('drop', (e) => { dragDepth = 0; drop.hidden = true; if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  function addFiles(fs) {
    for (const f of fs) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { toast(`${f.name} is not a JPEG, PNG, WebP or GIF image.`, { kind: 'warn' }); continue; }
      if (f.size > 8 * 1024 * 1024) { toast(`${f.name} is larger than 8 MB.`, { kind: 'warn' }); continue; }
      if (files.length >= 4) { toast('Up to 4 photos per message.', { kind: 'info' }); break; }
      files.push({ file: f, url: URL.createObjectURL(f) });
    }
    renderThumbs();
  }
  function renderThumbs() {
    thumbs.innerHTML = '';
    thumbs.hidden = !files.length;
    files.forEach((f, i) => thumbs.append(el('span', { class: 'ai-thumb' }, el('img', { src: f.url, alt: f.file.name }),
      el('button', { class: 'x', 'aria-label': `Remove ${f.file.name}`, html: icon('close', 12), onclick: () => { URL.revokeObjectURL(f.url); files.splice(i, 1); renderThumbs(); } }))));
    attach.dataset.tip = files.length ? `${files.length} of 4 photos attached` : 'Attach photos of the venue';
  }

  // ── speech to text (the browser's own recogniser; nothing is recorded or stored by Musync) ──
  const paintLang = () => { const l = LANGS.find((x) => x[0] === prefs.lang) || LANGS[0]; langBtn.textContent = l[1]; langBtn.dataset.tip = `Speaking ${l[2]}. Click to change the language.`; langBtn.setAttribute('aria-label', `Speech language: ${l[2]}. Click to change.`); };
  function setListening(on) {
    listening = on; mic.setAttribute('aria-pressed', String(on)); mic.classList.toggle('live', on); box.classList.toggle('listening', on);
    mic.setAttribute('aria-label', on ? 'Stop listening' : 'Speak your message'); mic.dataset.tip = on ? 'Stop listening' : 'Speak instead of typing';
    heard.hidden = !on; if (!on) heard.textContent = ''; else heard.textContent = 'Listening… speak now';
  }
  function startMic() {
    if (!SR || busy) return;
    try {
      rec = new (speech())(); rec.lang = prefs.lang; rec.continuous = true; rec.interimResults = true;
      base = text.value;
      rec.onresult = (e) => {
        let fin = '', interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
        if (fin) { base = `${base}${base && !/\s$/.test(base) ? ' ' : ''}${fin.trim()}`; text.value = base.slice(0, 4000); fit(); paintSend(); saveDraft(); }
        heard.textContent = interim ? `${interim}…` : 'Listening… speak now';
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('The microphone is blocked. Allow it for this site in the address bar, then try again.', { kind: 'warn', ms: 5000 });
        else if (e.error === 'network') toast('Speech recognition needs an internet connection.', { kind: 'warn' });
        else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Speech input stopped. You can keep typing.', { kind: 'info' });
      };
      rec.onend = () => { setListening(false); text.focus({ preventScroll: true }); };
      rec.start(); setListening(true);
    } catch { setListening(false); toast('The microphone could not start.', { kind: 'warn' }); }
  }
  function stopMic() { try { rec?.stop(); } catch { /* already stopped */ } setListening(false); }

  // what the next message works on: a brand-new rig, or a change to the rig on screen (never both at once)
  const onScreen = () => { const g = getState(); return g.presetId === 'bench' || !g.rig?.fixtures?.length ? null : g; };
  const scopeNow = () => { const g = onScreen(); if (!g) return 'new'; return scope || (g.presetId === 'ai' ? 'edit' : 'new'); };
  function setScope(s) { if (busy) return; scope = s; paintScope(); text.focus({ preventScroll: true }); }
  function paintScope() {
    const g = onScreen(), s = scopeNow();
    const name = g ? (g.rig.name || 'this rig').replace(/ \(edited\)$/, '') : '';
    scopeEdit.lastChild.textContent = g ? `Change “${name}”` : 'Change the rig on screen';
    scopeEdit.disabled = !g || busy; scopeNew.disabled = busy;
    scopeEdit.dataset.tip = g ? (g.presetId === 'ai' ? 'Edit this design. The designer keeps every light you did not mention.' : 'Start from this rig. It is never overwritten: the result is saved as a new setup.') : 'There is no rig on screen to change';
    scopeNew.dataset.tip = 'Start from an empty venue. Your other rigs are not touched.';
    for (const [b, on] of [[scopeNew, s === 'new'], [scopeEdit, s === 'edit']]) { b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); }
    if (!offline) text.placeholder = s === 'edit' ? 'What should change? e.g. add two more beams over the dance floor' : 'Describe your event: the occasion, the place, how many people';
  }
  function paintQuiet() {
    const q = !!getState().quiet || !getState().playing;
    quietBtn.setAttribute('aria-pressed', String(q)); quietBtn.innerHTML = icon(q ? 'play' : 'pause', 16);
    quietBtn.setAttribute('aria-label', q ? 'Resume the show' : 'Pause the show while I design'); quietBtn.dataset.tip = q ? 'Resume the show' : 'Pause the show while I design';
  }
  bus.on('presets', () => paintScope()); bus.on('quiet', paintQuiet); bus.on('playing', paintQuiet);

  // ── messages ────────────────────────────────────────────────────────────────
  const VENUE_NAME = { hall: 'Banquet hall', lawn: 'Wedding lawn', procession: 'Street procession', stage: 'Concert stage', club: 'Club', garba: 'Open ground' };
  const plain = (b) => `${b.qty} × ${b.name.replace(/ \(generic\)/, '')}`;
  const quick = (qs) => el('div', { class: 'ai-asks' }, ...qs.map((q) => el('div', { class: 'ai-ask' },
    el('div', { class: 'q', text: q.ask }),
    q.options?.length ? el('div', { class: 'opts' }, ...q.options.map((o) => el('button', { class: 'mchip', text: o, disabled: busy, onclick: () => send(`${q.ask} ${o}`) }))) : null)));
  const copyBtn = (get) => el('button', { class: 'btn icon ghost sm ai-copy', 'aria-label': 'Copy message', 'data-tip': 'Copy', html: icon('copy', 14), onclick: () => navigator.clipboard?.writeText(get()).then(() => toast('Copied.', { kind: 'ok', ms: 1200 })).catch(() => {}) });
  const meta = (m) => el('div', { class: 'ai-when', text: clock(m.at) });

  const bubble = (m, i) => {
    if (m.role === 'user') return el('div', { class: 'ai-msg me' }, el('div', { class: 'b', text: m.text }),
      el('div', { class: 'ai-under' }, m.photos ? el('span', { class: 'ai-sub', text: `${m.photos} photo${m.photos > 1 ? 's' : ''} attached` }) : null, meta(m), copyBtn(() => m.text)));
    const p = m.plan, isLast = i === st.messages.length - 1;
    const card = el('div', { class: 'ai-msg bot' + (m.error ? ' err' : '') + (m.stopped ? ' stopped' : '') }, el('span', { class: 'ai-av', html: icon(m.error ? 'alert' : m.stopped ? 'stop' : 'sparkle', 14) }), el('div', { class: 'ai-main' }, el('div', { class: 'b', text: m.text })));
    const main = card.querySelector('.ai-main');
    if (m.error) {
      const lastUser = [...st.messages.slice(0, i)].reverse().find((x) => x.role === 'user');
      if (lastUser && isLast) main.append(el('div', { class: 'row' }, el('button', { class: 'btn sm', html: `${icon('retry', 14)}<span>Try again</span>`, onclick: () => { st.messages.splice(i, 1); save(st); send(lastUser.text, { again: true }); } })));
      return card;
    }
    if (p?.kind === 'ask') { if (isLast && p.questions?.length) main.append(quick(p.questions)); main.append(el('div', { class: 'ai-under' }, meta(m), copyBtn(() => m.text))); return card; }
    if (p) {
      const rows = p.bom.map(plain), now = i === appliedAt;
      const nodes = [
        el('div', { class: 'ai-head' }, el('b', { text: p.name }), el('span', { class: 'ai-meta', text: `${VENUE_NAME[p.venue] || p.venue} · ${p.rig.fixtures.length} lights${p.understanding?.guests ? ` · ${p.understanding.guests} guests` : ''}` })),
        p.highlights?.length ? el('ul', { class: 'ai-list-ul' }, ...p.highlights.map((h) => el('li', { text: h }))) : null,
        el('details', { class: 'more' }, el('summary', {}, el('span', { text: 'Lights used' }), el('span', { html: icon('chevron', 14) })),
          el('div', { class: 'ai-bom' }, ...p.bom.map((b) => el('span', { class: 'ai-chip' }, el('i', { style: { background: `var(--role-${b.role}, var(--faint))` } }), el('span', { text: plain(b) }))))),
        p.assumptions?.length ? el('details', { class: 'more' }, el('summary', {}, el('span', { text: 'What I assumed' }), el('span', { html: icon('chevron', 14) })), el('ul', { class: 'ai-list-ul dim' }, ...p.assumptions.map((h) => el('li', { text: h })))) :
        p.warnings?.length ? el('div', { class: 'ai-sub warn', text: p.warnings.slice(0, 2).join(' ') }) : null,
        el('div', { class: 'row', style: { marginTop: '6px' } },
          el('button', { class: 'btn sm' + (now ? ' shown' : ' primary'), disabled: now, html: now ? `${icon('check', 14)}<span>Showing now</span>` : '<span>Show this design</span>', onclick: () => applyAt(i, { replace: false }) }),
          el('button', { class: 'btn sm', text: 'Copy list', onclick: () => navigator.clipboard?.writeText(`${p.name}\n${rows.join('\n')}`).then(() => toast('Lights list copied.', { kind: 'ok', ms: 1600 })).catch(() => {}) })),
      ].filter(Boolean);
      main.append(el('div', { class: 'ai-plan' }, ...nodes));
      if (isLast && p.questions?.length) main.append(quick(p.questions));
      else if (isLast && !busy) main.append(el('div', { class: 'ai-tweaks', 'aria-label': 'Quick changes' }, ...TWEAKS.map((t) => el('button', { class: 'mchip', text: t, onclick: () => send(t) }))));
      main.append(el('div', { class: 'ai-under' }, meta(m), copyBtn(() => `${m.text}\n\n${p.name}\n${rows.join('\n')}`)));
    }
    return card;
  };

  const empty = () => el('div', { class: 'ai-empty' },
    el('span', { class: 'ai-hero', html: icon('sparkle', 22) }),
    el('b', { text: 'What are we lighting?' }),
    el('span', { class: 'lead', text: 'Describe the occasion and the room, or attach photos of the venue. I will build the lights, show them here, and change them as you ask.' }),
    el('div', { class: 'ai-ideas' }, ...IDEAS.map(([label, prompt, sub]) => el('button', { class: 'mchip idea', onclick: () => { text.value = prompt; fit(); paintSend(); saveDraft(); text.focus(); } }, el('b', { text: label }), el('small', { text: sub })))));

  function toBottom(smooth) { requestAnimationFrame(() => { list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }); }
  function paintStatus() {
    const applied = appliedAt >= 0 ? st.messages[appliedAt]?.plan?.name : '';
    status.textContent = busy ? `${pendingLabel || 'Working…'} · ${Math.max(0, Math.round((Date.now() - since) / 1000))} s` : unread ? 'New reply' : applied ? `Showing ${applied}` : st.messages.length ? 'Ready for your next change' : 'Describe your event to start';
    paintScope(); node.classList.toggle('busy', busy); badge.hidden = !(unread && prefs.mode === 'min');
  }

  function render(pending) {
    const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    list.innerHTML = '';
    if (!st.messages.length && !pending) list.append(empty());
    st.messages.forEach((m, i) => list.append(bubble(m, i)));
    if (pending) list.append(el('div', { class: 'ai-msg bot' }, el('span', { class: 'ai-av busy', html: icon('sparkle', 14) }), el('div', { class: 'ai-main' }, el('div', { class: 'b ai-pending' }, el('span', { class: 'dots', html: '<i></i><i></i><i></i>' }), el('span', { class: 'pd', text: pending })))));
    clear.hidden = !st.messages.length;
    node.classList.toggle('has', st.messages.length > 0);
    paintStatus(); paintSend();
    if (!st.messages.length && !pending) list.scrollTop = 0; else if (nearEnd || pending) toBottom();
  }

  // apply a design: the first time it is made it is a new setup, or an update of the design being changed; later
  // clicks on an older card put that version back into its own saved setup
  async function applyAt(i, { replace = false } = {}) {
    const m = st.messages[i];
    if (!m?.plan || m.plan.kind === 'ask') return;
    await actions.plan.apply(m.plan, m.aiId ? { id: m.aiId } : { replace });
    m.aiId = getState().aiId; save(st);
    appliedAt = i; scope = 'edit'; render();
  }

  function stop() {
    if (!busy || cancelled) return;
    cancelled = true;
    try { ctl?.abort(); } catch { /* already finished */ }
    if (jobId) fetch(`/api/plan/${jobId}`, { method: 'DELETE' }).catch(() => {});
  }

  async function send(override, { again = false } = {}) {
    const message = (typeof override === 'string' ? override : text.value).trim();
    if (busy || !message || offline) return;
    if (listening) stopMic();
    busy = true; cancelled = false; jobId = null; ctl = new AbortController(); since = Date.now(); pendingLabel = 'Sending';
    if (typeof override !== 'string') { text.value = ''; fit(); saveDraft(); }
    clearInterval(ticker); ticker = setInterval(paintStatus, 1000);
    const sending = files; files = []; renderThumbs();
    if (!again || !st.messages.length || st.messages[st.messages.length - 1].text !== message) st.messages.push({ role: 'user', text: message, photos: sending.length || undefined, at: Date.now() });
    // what this message works on is fixed now, so changing the rig on screen while it runs cannot change the answer
    const g = onScreen(), edit = scopeNow() === 'edit' && !!g, replace = edit && g.presetId === 'ai';
    render('Sending…');
    try {
      const fd = new FormData();
      fd.set('message', message);
      if (st.sid) fd.set('sid', st.sid);
      // only the rig the person chose to change is sent; a new rig starts from an empty venue
      if (edit && g.rig?.fixtures?.length) fd.set('rig', JSON.stringify({ name: g.rig.name, venue: g.rig.venue, fixtures: g.rig.fixtures }));
      for (const f of sending) fd.append('images', f.file, f.file.name);
      const r = await fetch('/api/plan', { method: 'POST', body: fd, signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `The server answered ${r.status}`);
      st.sid = j.sid; jobId = j.id;
      if (cancelled) stop();
      let out;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 1200));
        if (cancelled) throw Object.assign(new Error('stopped'), { stopped: true });
        const s = await (await fetch(`/api/plan/${j.id}`, { signal: ctl.signal })).json();
        if (s.status === 'cancelled') throw Object.assign(new Error('stopped'), { stopped: true });
        if (s.status === 'done') { out = s.result; break; }
        if (s.status === 'error') throw new Error(s.error || 'The designer failed.');
        pendingLabel = s.detail || 'Working…'; render(pendingLabel);
      }
      st.messages.push({ role: 'assistant', text: out.reply, plan: out, at: Date.now() });
      save(st);
      if (out.kind === 'ask') render(); else await applyAt(st.messages.length - 1, { replace });
      if (prefs.mode === 'min' || !drawers.isOpen('ai')) unread = true;
    } catch (e) {
      if (cancelled || e.stopped || e.name === 'AbortError') {
        // stopped on purpose: nothing was applied, the message goes back into the box to edit or send again
        st.messages.push({ role: 'assistant', text: 'Stopped. Nothing was changed.', stopped: true, at: Date.now() });
        if (!text.value.trim() && typeof override !== 'string') { text.value = message; fit(); saveDraft(); }
      } else st.messages.push({ role: 'assistant', text: e.message, error: true, at: Date.now() });
      save(st); render();
    } finally { busy = false; cancelled = false; ctl = null; jobId = null; clearInterval(ticker); sending.forEach((f) => URL.revokeObjectURL(f.url)); render(); }
  }

  // is there a backend? (once, quietly; the hosted demo has none)
  fetch('/api/health', { signal: AbortSignal.timeout(2500) }).then((r) => r.ok && r.json()).then((j) => { offline = !j?.ok; }).catch(() => { offline = true; }).finally(() => {
    offlineNote.hidden = !offline;
    if (offline) { text.placeholder = 'The designer needs the Musync server (not available in this demo)'; text.disabled = true; attach.disabled = true; mic.disabled = true; sendBtn.disabled = true; scopeBar.hidden = true; }
  });
  bus.on('drawer', ({ name, open }) => {
    if (name !== 'ai') return;
    if (open) { unread = false; paintStatus(); if (prefs.mode !== 'min') setTimeout(() => text.focus({ preventScroll: true }), 120); toBottom(); } else if (listening) stopMic();
  });
  window.addEventListener('beforeunload', () => saveDraft());
  applySize(); paintLang(); fit(); setMode(prefs.mode); renderThumbs(); render(); paintQuiet();
  return { send, get busy() { return busy; } };
}
