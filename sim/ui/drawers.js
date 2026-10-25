// Rig builder drawer (left) and Show drawer (right).
import { icon } from './icons.js';
import { $, $$, el, bus, popover, menuItem, segIndicator, setText, setStyleVar } from './kit.js';
import { FIXTURES } from '../../core/fixtures/library.js';
import { LAYERS, PALETTES } from '../../core/wal/vocab.js';
import { benchModes, benchTour } from '../bench.js';

const ROLE_COLOR = { beam: 'var(--role-beam)', spot: 'var(--role-spot)', wash: 'var(--role-wash)', pixel: 'var(--role-pixel)', strobe: 'var(--role-strobe)', laser: 'var(--role-laser)', blinder: 'var(--role-blinder)', tube: 'var(--role-tube)', matrix: 'var(--role-matrix)' };
const ROLE_ORDER = ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'strobe', 'laser', 'blinder'];
const PRESET_ICON = { concert: 'v_stage', club: 'v_club', hall: 'v_club', lawn: 'v_garba', procession: 'v_stage', dandiya: 'v_garba', 'single-sharpy': 'v_single', 'quad-sharpy': 'v_quad', custom: 'v_custom' };
const PRESET_NOTE = { hall: 'Indoor banquet hall with stage, dance floor and round tables', lawn: 'Open-air wedding lawn with a mandap, tables and string lights', procession: 'Street procession: light trolley, generator, idol trolley and a crowd', concert: 'Outdoor festival main stage', club: 'Dance club with truss and DJ booth', dandiya: 'Navratri ground with rings and canopy', 'single-sharpy': 'One beam: the smallest rig', 'quad-sharpy': 'Four beams on the deck', custom: 'Saved in this browser' };

const specLine = (p) => {
  const bits = [];
  if (p.beamAngle) bits.push(`${p.beamAngle}° beam`);
  if (p.pan) bits.push(`${p.pan}° pan`);
  if (p.pixels > 1) bits.push(`${p.pixels} px`);
  if (p.scanAngle) bits.push(`${p.scanAngle}° scan`);
  return bits.join(' · ') || p.role;
};
const mostlyEst = (p) => (p.est || []).some((e) => /all values/i.test(e));

export function initDrawers({ actions, getState }) {
  const ui = $('#ui');

  // ── generic drawer shell ───────────────────────────────────────────────
  function shell(id, side, title, tabs, onSelect) {
    const close = el('button', { class: 'btn icon ghost sm', 'aria-label': `Close ${title}`, html: icon('close', 16), onclick: () => api.close(id.replace(/Drawer$/, '')) });
    const tabBar = tabs ? el('div', { class: 'seg fill tabs', role: 'tablist' }) : null;
    const panes = el('div', { class: 'panes' });
    const node = el('aside', { id, class: `drawer ${side} glass`, 'aria-label': title, inert: true }, el('header', {}, el('h2', { text: title }), close), tabBar, panes);
    const paneMap = {};
    if (tabs) {
      const buttons = {};
      for (const [tid, label, ic] of tabs) {
        const b = el('button', { role: 'tab', 'aria-selected': 'false', html: `${icon(ic, 16)}<span>${label}</span>`, onclick: () => select(tid) });
        buttons[tid] = b; tabBar.append(b);
        paneMap[tid] = el('div', { class: 'pane', role: 'tabpanel' });
        panes.append(paneMap[tid]);
      }
      var place = segIndicator(tabBar);
      var select = (tid) => {
        for (const k of Object.keys(buttons)) { buttons[k].setAttribute('aria-selected', String(k === tid)); buttons[k].classList.toggle('on', k === tid); paneMap[k].classList.toggle('on', k === tid); }
        place(); node.dataset.tab = tid; if (node.isConnected) onSelect?.(tid);
      };
      select(tabs[0][0]);
      node.select = select;
    } else {
      paneMap.main = el('div', { class: 'pane on' });
      panes.append(paneMap.main);
    }
    ui.append(node);
    return { node, panes: paneMap, panesEl: panes };
  }

  const rig = shell('rigDrawer', 'right', 'Lights', [['venue', 'Place', 'v_stage'], ['add', 'Add', 'plus'], ['fixtures', 'In use', 'layers'], ['test', 'Try', 'sparkle']], (tid) => onRigTab(tid));
  const show = shell('showDrawer', 'right', 'Show', null);
  const drawers = { rig: rig.node, show: show.node };
  const api = {
    isOpen: (n) => drawers[n].classList.contains('open'),
    open(n) { document.querySelector('.hint')?.remove(); const d = drawers[n]; d.classList.add('open'); d.inert = false; bus.emit('drawer', { name: n, open: true }); if (n === 'rig') setTimeout(() => $('#libSearch')?.focus?.({ preventScroll: true }), 0) },
    close(n) { if (n === 'rig') endBench(); const d = drawers[n]; d.classList.remove('open'); d.inert = true; bus.emit('drawer', { name: n, open: false }); },
    toggle(n) { api.isOpen(n) ? api.close(n) : api.open(n); },
    tab(name) { rig.node.select?.(name); },
    register(name, node) { drawers[name] = node; },
  };
  // every panel opens on the right under its button, one at a time
  bus.on('drawer', ({ name, open }) => { if (open) for (const o of Object.keys(drawers)) if (o !== name && api.isOpen(o)) api.close(o); });

  // ── rig: Venue tab ─────────────────────────────────────────────────────
  const venuePane = rig.panes.venue;
  function renderVenue() {
    const st = getState();
    venuePane.innerHTML = '';
    venuePane.append(el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Choose a place' })));
    const mine = st.presets.filter((p) => p.ai);
    const row = (p) => {
      const on = p.ai ? st.presetId === 'ai' && p.id === `ai:${st.aiId}` : p.id === st.presetId;
      return el('div', { class: 'opt-wrap' },
        el('button', { class: 'opt', role: 'radio', 'aria-checked': String(on), onclick: () => actions.rig.load(p.id) },
          el('span', { class: 'ico', html: icon(PRESET_ICON[p.id] || (p.ai ? 'sparkle' : 'v_custom'), 22) }),
          el('span', {}, el('b', { text: p.name }), el('small', { text: `${p.count} fixture${p.count === 1 ? '' : 's'} · ${p.ai ? 'Made with Design with AI' : PRESET_NOTE[p.id] || ''}` })),
          el('span', { class: 'tick', html: icon('check', 18) })),
        p.ai ? el('button', { class: 'btn icon ghost sm opt-x', 'aria-label': `Remove ${p.name}`, 'data-tip': 'Remove this design', html: icon('trash', 14), onclick: () => actions.rig.removeAi(p.id.slice(3)) }) : null);
    };
    for (const p of st.presets.filter((q) => !q.ai)) venuePane.append(row(p));
    if (mine.length) { venuePane.append(el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Your designs' }))); for (const p of mine) venuePane.append(row(p)); }
    venuePane.append(el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Share' })),
      el('div', { class: 'row' },
        el('button', { class: 'btn', html: `${icon('download', 16)}<span>Export rig</span>`, onclick: () => actions.rig.exportRig() }),
        el('button', { class: 'btn', html: `${icon('upload', 16)}<span>Import rig</span>`, onclick: () => actions.rig.importRig() })),
      el('div', { class: 'note', style: { marginTop: '14px' }, html: `${icon('info', 16)}<span>The same show plays on every rig. Change a rig here, press play, and the decoder remaps the lights. Your edits are kept in this browser as <b>My rig</b>.</span>` }));
  }

  // ── rig: Add tab ───────────────────────────────────────────────────────
  const addPane = rig.panes.add;
  const search = el('input', { class: 'input', id: 'libSearch', type: 'search', placeholder: 'Search fixtures: sharpy, laser, par…', 'aria-label': 'Search fixtures', oninput: () => renderLib() });
  const libList = el('div', {});
  addPane.append(el('div', { class: 'search' }, el('span', { html: icon('search', 16) }), search), libList);
  function renderLib() {
    const q = search.value.trim().toLowerCase();
    libList.innerHTML = '';
    let any = false;
    for (const role of ROLE_ORDER) {
      const items = Object.entries(FIXTURES).filter(([, p]) => p.role === role && (!q || `${p.name} ${p.maker} ${p.role}`.toLowerCase().includes(q)));
      if (!items.length) continue;
      any = true;
      libList.append(el('div', { class: 'group-title' }, el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }), el('span', { class: 'label', text: role })));
      for (const [model, p] of items) {
        libList.append(el('button', { class: 'lib', 'data-tip': `${p.maker}. Source: ${p.source}`, 'data-tip-pos': 'below', onclick: () => actions.rig.add(model) },
          el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }),
          el('span', {}, el('b', { class: 'ellipsis', text: p.name }), el('small', { class: 'ellipsis', text: specLine(p) })),
          mostlyEst(p) ? el('span', { class: 'chip est', text: 'est.' }) : el('span', { class: 'plus', html: icon('plus', 16) })));
      }
    }
    if (!any) libList.append(el('div', { class: 'empty' }, el('span', { html: icon('search', 22) }), el('b', { text: 'No fixture matches' }), el('span', { text: 'Try “beam”, “laser” or “par”.' })));
  }

  // ── rig: Fixtures tab + inspector ──────────────────────────────────────
  const fxPane = rig.panes.fixtures;
  const fxHead = el('div', { class: 'sect-head' });
  const fxList = el('div', { role: 'listbox', 'aria-label': 'Fixtures in this rig' });
  fxPane.append(fxHead, fxList);
  const inspector = el('div', { class: 'inspector', hidden: true });
  rig.node.append(inspector);

  function renderFixtures() {
    const st = getState();
    const fixtures = st.rig?.fixtures || [];
    fxHead.innerHTML = '';
    fxHead.append(el('span', { class: 'label', text: `${fixtures.length} fixtures` }), el('span', { class: 'chip', text: `${new Set(fixtures.map((f) => f.role || FIXTURES[f.model]?.role)).size} layers` }));
    fxList.innerHTML = '';
    const sorted = [...fixtures].sort((a, b) => ROLE_ORDER.indexOf(a.role || FIXTURES[a.model]?.role) - ROLE_ORDER.indexOf(b.role || FIXTURES[b.model]?.role));
    for (const f of sorted) {
      const p = FIXTURES[f.model], role = f.role || p?.role;
      fxList.append(el('button', { class: 'fx', role: 'option', 'aria-selected': String(f.id === st.selected), 'data-id': f.id, onclick: () => actions.rig.select(f.id) },
        el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }), el('span', { class: 'id', text: f.id }),
        el('span', { class: 'ellipsis muted', text: p?.name || f.model }),
        el('span', { class: 'pos', text: f.pos.map((v) => Math.round(v)).join(', ') })));
    }
    if (!fixtures.length) fxList.append(el('div', { class: 'empty' }, el('b', { text: 'This rig is empty' }), el('span', { text: 'Add fixtures from the Add tab.' })));
  }

  function renderInspector() {
    const st = getState();
    const f = st.rig?.fixtures.find((x) => x.id === st.selected);
    inspector.hidden = !f;
    if (!f) return;
    const p = FIXTURES[f.model], role = f.role || p.role;
    inspector.innerHTML = '';
    const axis = (i, name) => el('label', { class: 'axis' }, el('b', { text: name }), el('input', { class: 'input', type: 'number', step: '0.1', value: String(f.pos[i]), 'aria-label': `${name} position in metres`,
      onchange: (e) => { const pos = [...f.pos]; pos[i] = +e.target.value; actions.rig.patch(f.id, { pos }); } }));
    const mountSeg = el('div', { class: 'seg fill' },
      ...['floor', 'hung'].map((m) => el('button', { class: (f.mount || 'floor') === m ? 'on' : '', 'aria-pressed': String((f.mount || 'floor') === m), text: m === 'floor' ? 'Standing' : 'Hung on truss', onclick: () => actions.rig.patch(f.id, { mount: m }) })));
    const roleBtn = el('button', { class: 'btn', style: { justifyContent: 'space-between', width: '100%' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => {
      const content = el('div', {}, el('div', { class: 'menu-title label', text: 'Play as layer' }),
        ...Object.keys(LAYERS).map((r) => menuItem({ label: r + (r === p.role ? ' (default)' : ''), checked: r === role, onClick: () => { pop.close(); actions.rig.patch(f.id, { role: r === p.role ? null : r }); } })));
      const pop = popover(roleBtn, content, { width: 240 });
    } }, el('span', { class: 'row', style: { alignItems: 'center', flex: 'none' } }, el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }), el('span', { text: role })), el('span', { html: icon('chevron', 14), class: 'muted' }));
    const specs = Object.entries(p.specs || {}).slice(0, 6).map(([k, v]) => [k, Array.isArray(v) ? v.join('–') : String(v)]);
    inspector.append(
      el('h3', {}, el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }), el('span', { class: 'mono', text: f.id }), el('span', { class: 'muted ellipsis', text: p.name }),
        el('span', { style: { marginLeft: 'auto', display: 'flex', gap: '4px' } },
          el('button', { class: 'btn icon sm', 'aria-label': 'Duplicate', 'data-tip': 'Duplicate', html: icon('copy', 15), onclick: () => actions.rig.duplicate() }),
          el('button', { class: 'btn icon sm', 'aria-label': 'Mirror left/right', 'data-tip': 'Mirror left/right', html: icon('mirror', 15), onclick: () => actions.rig.mirror() }),
          el('button', { class: 'btn icon sm danger', 'aria-label': 'Delete', 'data-tip': 'Delete', 'data-kbd': 'Del', html: icon('trash', 15), onclick: () => actions.rig.remove() }))),
      el('div', { class: 'field' }, el('span', { text: 'Position in metres (drag the gizmo in the scene, or type)' }), el('div', { class: 'three' }, axis(0, 'X'), axis(1, 'Y'), axis(2, 'Z'))),
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('span', { text: 'Mount' }), mountSeg), el('div', { class: 'field' }, el('span', { text: 'Layer' }), roleBtn)),
      el('details', { class: 'more' }, el('summary', {}, el('span', { text: 'Specs' }), el('span', { html: icon('chevron', 14) })), el('div', { class: 'specs' }, ...specs.flatMap(([k, v]) => [el('span', { text: k }), el('b', { class: 'ellipsis', text: v })]))),
      p.est?.length ? el('div', { class: 'est-box', html: `${icon('alert', 15)}<span><b>Not from a datasheet:</b> ${p.est.slice(0, 2).join('; ')}${p.est.length > 2 ? ` and ${p.est.length - 2} more` : ''}.</span>` }) : null);
    segIndicator(mountSeg);
  }

  // ── rig: Test tab (one fixture alone, every mode one click away) ──────
  const testPane = rig.panes.test;
  let bs = { on: false, model: 'claypaky-sharpy', pick: {}, palette: 'festival' }, aspect = null, tour = null, tourStep = 0;
  const modelSel = el('select', { class: 'input', 'aria-label': 'Fixture to test', onchange: (e) => { stopTour(); aspect = null; actions.bench.start(e.target.value); } });
  for (const role of ROLE_ORDER) {
    const items = Object.entries(FIXTURES).filter(([, p]) => p.role === role);
    if (items.length) modelSel.append(el('optgroup', { label: role[0].toUpperCase() + role.slice(1) }, ...items.map(([m, p]) => el('option', { value: m, text: p.name.replace(/ \(generic\)/, '') }))));
  }
  const aspectSeg = el('div', { class: 'seg fill', role: 'tablist' });
  const modeGrid = el('div', { class: 'modes' });
  const palRow = el('div', { class: 'pals' });
  const nowEl = el('div', { class: 'bench-now' });
  const tourBtn = el('button', { class: 'btn', onclick: () => (tour ? stopTour() : startTour()) });
  testPane.append(el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Fixture' })), modelSel,
    el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Mode' })), aspectSeg, modeGrid, palRow, nowEl,
    el('div', { class: 'row', style: { marginTop: '14px' } }, tourBtn, el('button', { class: 'btn ghost', text: 'Back to show', onclick: () => { api.tab('venue'); } })),
    el('div', { class: 'note', style: { marginTop: '14px' }, html: `${icon('info', 16)}<span>One fixture on an empty stage, playing to the song's beat. Pick a mode to see how it behaves alone. Nothing is saved.</span>` }));

  function renderBench() {
    const aspects = benchModes(bs.model);
    if (!aspects.find((a) => a.id === aspect)) aspect = aspects[0]?.id;
    modelSel.value = bs.model;
    aspectSeg.innerHTML = '';
    for (const a of aspects) aspectSeg.append(el('button', { role: 'tab', class: a.id === aspect ? 'on' : '', 'aria-selected': String(a.id === aspect), text: a.label, onclick: () => { stopTour(); aspect = a.id; renderBench(); } }));
    segIndicator(aspectSeg);
    const cur = aspects.find((a) => a.id === aspect);
    modeGrid.innerHTML = '';
    for (const m of cur?.modes || []) {
      const on = bs.pick[aspect] === m.id || (!bs.pick[aspect] && (aspect === 'move' ? m.look === 'still' : aspect === 'color' ? m.look === 'static' : m === cur.modes[0]));
      modeGrid.append(el('button', { class: 'mchip', 'aria-pressed': String(on), 'data-tip': m.note || '', onclick: () => { stopTour(); actions.bench.pick(aspect, m.id); } }, m.label));
    }
    palRow.innerHTML = '';
    palRow.hidden = aspect !== 'color';
    for (const [name, cols] of Object.entries(PALETTES)) palRow.append(el('button', { class: 'pal', 'aria-pressed': String(name === bs.palette), 'aria-label': name, 'data-tip': name, onclick: () => actions.bench.palette(name) }, ...cols.slice(0, 4).map((c) => el('i', { style: { background: c } }))));
    const picked = Object.entries(bs.pick).map(([k, id]) => aspects.find((a) => a.id === k)?.modes.find((m) => m.id === id)?.label ? `${aspects.find((a) => a.id === k).label}: ${aspects.find((a) => a.id === k).modes.find((m) => m.id === id).label}` : '').filter(Boolean);
    nowEl.textContent = tour ? `Touring: ${picked.join(' · ')}` : picked.length ? `Playing ${picked.join(' · ')}` : 'Playing the default: steady white';
    tourBtn.textContent = tour ? 'Stop tour' : 'Tour all modes';
  }
  function startTour() {
    const steps = benchTour(bs.model);
    tourStep = 0;
    const next = () => { const s = steps[tourStep++ % steps.length]; aspect = s.aspect; actions.bench.pick(s.aspect, s.id, { only: true }); };
    next();
    tour = setInterval(next, 3500);
    renderBench();
  }
  function stopTour() { if (tour) { clearInterval(tour); tour = null; renderBench(); } }
  function endBench() { stopTour(); if (bs.on) actions.bench.stop(); }
  function onRigTab(tid) {
    if (tid === 'test') { if (!bs.on) actions.bench.start(bs.model); }
    else endBench();
  }
  bus.on('bench', (s) => {
    const wasOn = bs.on; bs = s;
    if (s.on) renderBench();
    else if (wasOn && rig.node.dataset.tab === 'test') rig.node.select('venue');
  });
  renderBench();

  // ── Show drawer ────────────────────────────────────────────────────────
  const sp = show.panes.main;
  const npTitle = el('h3', { text: 'No show loaded' }), npSub = el('div', { class: 'sub', text: '' }), npChips = el('div', { class: 'chips' });
  const secEl = el('b', { class: 'ellipsis' }), secMeta = el('span', { class: 'muted mono' });
  const meterFill = el('i');
  const sectionCard = el('div', { class: 'card', style: { marginTop: '12px', display: 'grid', gap: '8px' } },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, secEl, secMeta), el('div', { class: 'meter' }, meterFill));
  const layerHost = el('div', {});
  const reportHost = el('div', { class: 'stack' });
  sp.append(el('div', { class: 'np' }, npTitle, npSub, npChips, sectionCard),
    el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'Layers right now' })), layerHost,
    el('div', { class: 'sect-head' }, el('span', { class: 'label', text: 'On this rig' })), reportHost);
  const layerRows = {};

  function renderLayerRows(present) {
    layerHost.innerHTML = '';
    for (const k of Object.keys(layerRows)) delete layerRows[k];
    for (const role of ROLE_ORDER.filter((r) => present.includes(r))) {
      const state = el('span', { class: 'ls ellipsis' }), sw = el('span', { class: 'sw' });
      layerHost.append(el('div', { class: 'lrow' }, el('span', { class: 'dotc', style: { '--c': ROLE_COLOR[role] } }), el('span', { class: 'ln', text: role }), state, sw));
      layerRows[role] = { state, sw, key: '', pal: '' };
    }
  }

  bus.on('wal', ({ wal }) => {
    setText(npTitle, wal.meta.title);
    setText(npSub, wal.meta.artist || 'Unknown artist');
    npChips.innerHTML = '';
    for (const c of [`${wal.meta.bpm} BPM`, wal.meta.key, `${wal.sections.length} sections`, ...(wal.meta.styles || [])].filter(Boolean)) npChips.append(el('span', { class: 'chip', text: c }));
  });
  bus.on('decoder', (report) => {
    renderLayerRows(report?.present || []);
    reportHost.innerHTML = '';
    if (!report) return;
    const lines = [];
    lines.push(`<b>${report.present.length}</b> of 7 layers have fixtures: ${report.present.join(', ')}.`);
    for (const [a, b] of Object.entries(report.fallbacks)) lines.push(`<b>${a}</b> cues play on <b>${b}</b> fixtures.`);
    if (report.dropped.length) lines.push(`No fixtures for <b>${report.dropped.join(', ')}</b>, so those cues are skipped.`);
    for (const l of lines) reportHost.append(el('div', { class: 'note', html: `${icon('info', 16)}<span>${l}</span>` }));
  });

  bus.on('rig', () => { renderVenue(); renderFixtures(); renderInspector(); });
  bus.on('presets', () => renderVenue());
  bus.on('selection', (id) => {
    renderFixtures(); renderInspector();
    if (id) { api.open('rig'); api.tab('fixtures'); $(`.fx[data-id="${CSS.escape(id)}"]`, fxList)?.scrollIntoView({ block: 'nearest' }); }
  });
  bus.on('fixture-moved', () => renderInspector());
  renderLib();

  return {
    ...api,
    // called ~6x/s while the show drawer is open
    tick(s) {
      if (!api.isOpen('show')) return;
      setStyleVar(meterFill, '--v', String(s.sectionEnergy ?? 0));
      if (s.section) { setText(secEl, s.section.label || s.section.kind); setText(secMeta, `bar ${s.bar}`); } else { setText(secEl, '—'); setText(secMeta, ''); }
      for (const [role, row] of Object.entries(layerRows)) {
        const d = s.layers?.[role];
        const text = d ? ['move', 'dim', 'color'].filter((k) => d[k]).map((k) => d[k].look).join(' · ') : '—';
        if (text !== row.key) { row.key = text; row.state.textContent = text; }
        const pal = (s.palettes?.[d?.color?.palette] || []).join(',');
        if (pal !== row.pal) { row.pal = pal; row.sw.innerHTML = pal ? pal.split(',').map((c) => `<i style="--c:${c}"></i>`).join('') : ''; }
      }
    },
  };
}
