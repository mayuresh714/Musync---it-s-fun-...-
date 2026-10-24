// "Design with AI": a chat that turns what someone needs (words, venue photos) into a rig and shows it at once.
// The backend runs Claude once per message; this panel only talks to /api/plan and applies the plan it gets back.
import { icon } from './icons.js';
import { $, el, bus, toast } from './kit.js';

const KEY = 'musync.ai';
const IDEAS = [
  ['Wedding in a banquet hall', 'A wedding reception for about 250 guests in an indoor banquet hall. Warm colours, keep it limited.'],
  ['Garden wedding', 'An open-air garden wedding at night for about 150 guests, with a mandap stage and a small dance floor.'],
  ['DJ night, 200-cap club', 'A 200-capacity club night. DJ booth at the back wall, 5 m ceiling. About 20 fixtures.'],
  ['Outdoor concert', 'An outdoor concert for about 3,000 people on a main stage. Beams, washes and a few strobes.'],
];

const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Array.isArray(v.messages) ? v : null; } catch { return null; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify({ sid: s.sid, messages: s.messages.slice(-30) })); } catch { /* storage may be unavailable */ } };

export function initPlanner({ actions, getState, drawers }) {
  const ui = $('#ui');
  let st = load() || { sid: null, messages: [] };
  let busy = false, files = [], appliedAt = -1;

  const close = el('button', { class: 'btn icon ghost sm', 'aria-label': 'Close Design with AI', html: icon('close', 16), onclick: () => drawers.close('ai') });
  const list = el('div', { class: 'ai-list', role: 'log', 'aria-live': 'polite' });
  const text = el('textarea', { class: 'input ai-text', rows: '1', placeholder: 'Describe your event', 'aria-label': 'Message to the designer', maxlength: '4000',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } e.stopPropagation(); }, onkeyup: (e) => e.stopPropagation() });
  const picker = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true, onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
  const thumbs = el('div', { class: 'ai-thumbs' });
  const attach = el('button', { class: 'btn icon ghost', 'aria-label': 'Attach venue photos', 'data-tip': 'Attach venue photos', html: icon('photo', 22), onclick: () => picker.click() });
  const sendBtn = el('button', { class: 'btn primary icon', 'aria-label': 'Send', html: icon('send', 22), onclick: () => send() });
  const composer = el('div', { class: 'ai-composer' }, thumbs, el('div', { class: 'ai-row' }, attach, text, sendBtn), picker);
  const clear = el('button', { class: 'btn ghost sm', text: 'New design', onclick: () => { if (busy) return; st = { sid: null, messages: [] }; save(st); render(); } });
  const node = el('aside', { id: 'aiDrawer', class: 'drawer right glass', 'aria-label': 'Design with AI', inert: true },
    el('header', {}, el('h2', { text: 'Design with AI' }), el('span', { style: { marginLeft: 'auto' } }, clear), close), list, composer);
  ui.append(node);
  drawers.register('ai', node);

  node.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  node.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
  text.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addFiles(f); } });

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
  }

  const VENUE_NAME = { hall: 'Banquet hall', lawn: 'Wedding lawn', stage: 'Concert stage', club: 'Club', garba: 'Open ground' };
  const ROLE_WORD = { beam: 'moving beams', spot: 'spot lights', wash: 'colour washes', pixel: 'pixel bars', strobe: 'strobes', laser: 'lasers', blinder: 'warm blinders', tube: 'light tubes', matrix: 'LED panels' };
  const plain = (b) => `${b.qty} × ${b.name.replace(/ \(generic\)/, '')}`;
  // quick answers: tapping one sends it as the reply
  const quick = (qs) => el('div', { class: 'ai-asks' }, ...qs.map((q) => el('div', { class: 'ai-ask' },
    el('div', { class: 'q', text: q.ask }),
    q.options?.length ? el('div', { class: 'opts' }, ...q.options.map((o) => el('button', { class: 'mchip', text: o, disabled: busy, onclick: () => send(`${q.ask} ${o}`) }))) : null)));

  const bubble = (m, i) => {
    if (m.role === 'user') return el('div', { class: 'ai-msg me' }, el('div', { class: 'b', text: m.text }), m.photos ? el('div', { class: 'ai-sub', text: `${m.photos} photo${m.photos > 1 ? 's' : ''} attached` }) : null);
    const p = m.plan, isLast = i === st.messages.length - 1;
    const card = el('div', { class: 'ai-msg bot' + (m.error ? ' err' : '') }, el('div', { class: 'b', text: m.text }));
    if (p?.kind === 'ask') { if (isLast && p.questions?.length) card.append(quick(p.questions)); return card; }
    if (p) {
      const rows = p.bom.map(plain);
      const nodes = [
        el('div', { class: 'ai-head' }, el('b', { text: p.name }), el('span', { class: 'ai-meta', text: `${VENUE_NAME[p.venue] || p.venue} · ${p.rig.fixtures.length} lights${p.understanding?.guests ? ` · ${p.understanding.guests} guests` : ''}` })),
        p.highlights?.length ? el('ul', { class: 'ai-list-ul' }, ...p.highlights.map((h) => el('li', { text: h }))) : null,
        el('details', { class: 'more' }, el('summary', {}, el('span', { text: 'Lights used' }), el('span', { html: icon('chevron', 14) })), el('div', { class: 'ai-bom' }, ...rows.map((r) => el('div', { text: r })))),
        p.assumptions?.length ? el('details', { class: 'more' }, el('summary', {}, el('span', { text: 'What I assumed' }), el('span', { html: icon('chevron', 14) })), el('ul', { class: 'ai-list-ul dim' }, ...p.assumptions.map((h) => el('li', { text: h })))) : null,
        p.warnings?.length ? el('div', { class: 'ai-sub warn', text: p.warnings.slice(0, 2).join(' ') }) : null,
        el('div', { class: 'row', style: { marginTop: '6px' } },
          el('button', { class: 'btn sm' + (i === appliedAt ? '' : ' primary'), disabled: i === appliedAt, text: i === appliedAt ? 'Showing now' : 'Show this design', onclick: () => applyAt(i) }),
          el('button', { class: 'btn sm', text: 'Copy list', onclick: () => navigator.clipboard?.writeText(`${p.name}\n${rows.join('\n')}`).then(() => toast('Lights list copied.', { kind: 'ok', ms: 1600 })).catch(() => {}) })),
      ].filter(Boolean);
      card.append(el('div', { class: 'ai-plan' }, ...nodes));
      if (isLast && p.questions?.length) card.append(quick(p.questions));
    }
    return card;
  };

  function render(pending) {
    list.innerHTML = '';
    if (!st.messages.length && !pending) {
      list.append(el('div', { class: 'ai-empty' },
        el('b', { text: 'Tell me about your event' }),
        el('span', { text: 'Describe the occasion and the room, or attach photos of the venue. I will build the lights and show them here, then change them as you ask.' }),
        el('div', { class: 'ai-ideas' }, ...IDEAS.map(([label, prompt]) => el('button', { class: 'mchip', text: label, onclick: () => { text.value = prompt; text.focus(); } })))));
    }
    st.messages.forEach((m, i) => list.append(bubble(m, i)));
    if (pending) list.append(el('div', { class: 'ai-msg bot' }, el('div', { class: 'b ai-pending' }, el('span', { class: 'dots', html: '<i></i><i></i><i></i>' }), el('span', { class: 'pd', text: pending }))));
    clear.hidden = !st.messages.length;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  async function applyAt(i) {
    const m = st.messages[i];
    if (!m?.plan) return;
    if (m.plan.kind === 'ask') return;
    await actions.plan.apply(m.plan);
    appliedAt = i; render();
  }

  async function send(override) {
    const message = (typeof override === 'string' ? override : text.value).trim();
    if (busy || !message) return;
    busy = true; sendBtn.disabled = true; if (typeof override !== 'string') text.value = '';
    const sending = files; files = []; renderThumbs();
    st.messages.push({ role: 'user', text: message, photos: sending.length || undefined });
    render('Sending…');
    try {
      const fd = new FormData();
      fd.set('message', message);
      if (st.sid) fd.set('sid', st.sid);
      // only a design made in this chat is ever sent back for editing, never a built-in preset
      const gs = getState(), rig = gs.presetId === 'ai' ? gs.rig : null;
      if (rig?.fixtures?.length) fd.set('rig', JSON.stringify({ name: rig.name, venue: rig.venue, fixtures: rig.fixtures }));
      for (const f of sending) fd.append('images', f.file, f.file.name);
      const r = await fetch('/api/plan', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `The server answered ${r.status}`);
      st.sid = j.sid;
      let out;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 1200));
        const s = await (await fetch(`/api/plan/${j.id}`)).json();
        if (s.status === 'done') { out = s.result; break; }
        if (s.status === 'error') throw new Error(s.error || 'The designer failed.');
        render(s.detail || 'Working…');
      }
      st.messages.push({ role: 'assistant', text: out.reply, plan: out });
      save(st);
      if (out.kind === 'ask') render(); else await applyAt(st.messages.length - 1);
    } catch (e) {
      st.messages.push({ role: 'assistant', text: e.message, error: true });
      save(st); render();
    } finally { busy = false; sendBtn.disabled = false; sending.forEach((f) => URL.revokeObjectURL(f.url)); render(); }
  }

  bus.on('drawer', ({ name, open }) => { if (name === 'ai' && open) setTimeout(() => text.focus({ preventScroll: true }), 120); });
  render();
  return { send, get busy() { return busy; } };
}
