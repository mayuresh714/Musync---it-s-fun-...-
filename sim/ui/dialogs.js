// Analyze flow (quick on-device draft, or the Claude director) and keyboard shortcut sheet.
import { icon } from './icons.js';
import { el, modal, setStyleVar, setText, segIndicator } from './kit.js';
import { STYLES } from '../../core/wal/vocab.js';

const STEPS = [['decode', 'Reading the audio'], ['features', 'Measuring frequencies and energy'], ['rhythm', 'Finding tempo, beats and bars'], ['structure', 'Mapping sections: verse, hook, drop'], ['accents', 'Spotting drops, hits and silences']];
const AI_STEPS = [['decode', 'Reading the audio'], ['analyze', 'Measuring tempo, beats, energy and bands'], ['lyrics', 'Finding the lyrics'], ['research', 'Researching the song, its genre and its culture'], ['video', 'Watching the video: dancers, steps and mood'], ['bible', 'The director reads the song and its words'], ['design', 'Composing the opening, the climb and the signature steps'], ['cues', 'Writing the cue sheet, layer by layer'], ['validate', 'Checking the show against the format']];
const STYLE_LABEL = { edm: 'EDM / club', bollywood: 'Bollywood', dandiya: 'Dandiya / garba', concert: 'Concert', devotional: 'Devotional', wedding: 'Wedding / sangeet', romantic: 'Romantic' };
const guessTitle = (name) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

function stepList(defs) {
  const rows = {};
  const root = el('div', { class: 'steps' }, ...defs.map(([id, label]) => (rows[id] = el('div', { class: 'step' }, el('i'), el('span', { text: label })))));
  const bar = el('div', { class: 'bar', style: { marginTop: '8px' } }, el('i'));
  let idx = -1;
  const advance = (to) => {
    for (let i = 0; i < defs.length; i++) { const r = rows[defs[i][0]]; r.classList.toggle('done', i < to); r.classList.toggle('on', i === to); r.firstChild.innerHTML = i < to ? icon('check', 11) : ''; }
    setStyleVar(bar, '--v', String(Math.max(0.04, to / defs.length)));
    idx = to;
  };
  return { root, bar, advance, at: (id) => defs.findIndex(([d]) => d === id), get idx() { return idx; } };
}

export function openAnalyze({ audioName, hasAudio, pickAudio, run, play, download, ai }) {
  let style = 'bollywood', aiStyle = '', mode = 'quick', health = null;
  const form = { title: '', artist: '', lyrics: '', notes: '' };
  const body = el('div', {});
  const footer = el('div', {});
  let cancel = null;
  const m = modal({ title: 'Make a light show', sub: 'Pick how: an AI director, or a quick draft on your device.', body, footer, onClose: () => cancel?.() });

  function viewPick() {
    body.innerHTML = ''; footer.innerHTML = '';
    body.append(el('button', { class: 'drop-inline', style: { width: '100%' }, 'data-autofocus': true, html: `${icon('upload', 28)}<b>Choose an audio file</b><span>or drop one anywhere on this page</span>`, onclick: () => { m.close(); pickAudio(); } }));
  }

  const styleGrid = (current, onPick, auto) => {
    const entries = [...(auto ? [['', 'Let the director decide']] : []), ...Object.keys(STYLES).map((k) => [k, STYLE_LABEL[k] || k])];
    return el('div', { class: 'stylegrid', role: 'radiogroup' }, ...entries.map(([k, label]) => {
      const b = el('button', { class: 'opt', role: 'radio', 'aria-checked': String(k === current), 'data-tip': k ? STYLES[k] : 'Claude picks from the song itself', 'data-tip-pos': 'below',
        onclick: () => { onPick(k); for (const o of b.parentNode.children) o.setAttribute('aria-checked', String(o === b)); } },
        el('b', { text: label }), el('span', { class: 'tick', html: icon('check', 16) }));
      return b;
    }));
  };

  function viewIdle() {
    body.innerHTML = ''; footer.innerHTML = '';
    const seg = el('div', { class: 'seg fill', role: 'tablist', style: { marginBottom: '16px' } },
      ...[['ai', 'AI director', 'sparkle'], ['quick', 'Quick draft', 'pulse']].map(([id, label, ic]) =>
        el('button', { role: 'tab', class: mode === id ? 'on' : '', 'aria-selected': String(mode === id), style: { flex: 1 }, html: `${icon(ic, 15)}<span>${label}</span>`, onclick: () => { mode = id; viewIdle(); } })));
    body.append(
      el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' } },
        el('span', { class: 'ico', html: icon('note', 18), style: { color: 'var(--accent)' } }), el('div', { style: { minWidth: 0 } }, el('b', { class: 'ellipsis', style: { display: 'block' }, text: audioName }), el('small', { class: 'muted', text: 'Ready' }))),
      ...(ai ? [seg] : []));
    if (ai) requestAnimationFrame(segIndicator(seg));
    if (mode === 'ai' && ai) viewAiForm(); else viewQuickForm();
  }

  function viewQuickForm() {
    body.append(
      el('div', { class: 'label', style: { marginBottom: '8px' }, text: 'What kind of music is it?' }),
      styleGrid(style, (k) => (style = k), false),
      el('div', { class: 'note', style: { marginTop: '12px' }, html: `${icon('info', 16)}<span>Runs on your device in a few seconds and follows the beat and the loud/quiet shape of the song. It can't know the words or the mood.</span>` }));
    footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }), el('button', { class: 'btn primary', html: `${icon('sparkle', 16)}<span>Make the show</span>`, 'data-autofocus': true, onclick: start }));
  }

  function viewAiForm() {
    if (!health?.claude || !health?.ffmpeg) {
      const why = !health ? 'The Musync backend isn\'t running. Start it with <b>npm run dev</b> (it starts together with this page).'
        : !health.claude ? 'The Claude Code CLI wasn\'t found. Install Claude Code and sign in once by running <b>claude</b> in a terminal.' : 'ffmpeg is missing. Install it with <b>brew install ffmpeg</b>.';
      body.append(el('div', { class: 'est-box', html: `${icon('alert', 16)}<span>${why}</span>` }));
      footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }), el('button', { class: 'btn', text: 'Check again', onclick: async () => { health = await ai.check(); viewIdle(); } }), el('button', { class: 'btn primary', text: 'Use quick draft', onclick: () => { mode = 'quick'; viewIdle(); } }));
      return;
    }
    const input = (key, label, ph, tag = 'input') => el('label', { class: 'field' }, el('span', { text: label }),
      el(tag, { class: 'input', value: form[key], placeholder: ph, rows: tag === 'textarea' ? 5 : null, oninput: (e) => (form[key] = e.target.value), style: tag === 'textarea' ? { resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' } : null }));
    const t = input('title', 'Song title', guessTitle(audioName || '') || 'optional');
    const l = input('lyrics', 'Lyrics (optional)', 'Leave empty to look them up automatically. Paste them here for songs the lookup misses.', 'textarea');
    for (const [node, key] of [[t, 'title'], [l, 'lyrics']]) { const c = node.querySelector('.input'); if (key === 'lyrics') c.textContent = form.lyrics; else c.value = form[key]; }
    body.append(
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' } }, t, input('artist', 'Artist', 'optional')),
      el('div', { class: 'label', style: { margin: '4px 0 8px' }, text: 'Occasion (optional)' }),
      styleGrid(aiStyle, (k) => (aiStyle = k), true),
      el('details', { class: 'more', style: { marginTop: '12px' } }, el('summary', {}, el('span', { text: 'Lyrics and notes for the director' }), el('span', { html: icon('chevron', 14) })),
        el('div', { style: { display: 'grid', gap: '10px', marginTop: '10px' } }, l, input('notes', 'Notes', 'e.g. sangeet entry, keep it warm, big moment at the hook'))),
      el('div', { class: 'note', style: { marginTop: '12px' }, html: `${icon('info', 16)}<span>Claude reads the song's measurements and its lyrics, works out the story and mood, and writes the cues. It can't hear audio, so it places lines from the energy of each bar. Takes about 2 to 4 minutes and uses your Claude subscription. Your audio stays on this computer; Claude only receives measurements and lyric text.</span>` }));
    footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }), el('button', { class: 'btn primary', html: `${icon('sparkle', 16)}<span>Direct the show with Claude</span>`, 'data-autofocus': true, onclick: startAi }));
  }

  async function start() {
    body.innerHTML = ''; footer.innerHTML = '';
    const steps = stepList(STEPS);
    body.append(steps.root, steps.bar);
    steps.advance(0);
    footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }));
    try {
      const result = await run({ style, onStage: (stage) => { const i = STEPS.findIndex(([id]) => id === stage); if (i >= 0 && i > steps.idx) steps.advance(i); if (stage === 'done') steps.advance(STEPS.length); } });
      viewDone(result.wal, {});
    } catch (e) { viewError(e, start); }
  }

  async function startAi() {
    body.innerHTML = ''; footer.innerHTML = '';
    const steps = stepList(AI_STEPS);
    const detail = el('div', { class: 'muted', style: { fontSize: '12px', minHeight: '18px', marginTop: '10px', fontVariantNumeric: 'tabular-nums' } });
    const story = el('div', { style: { marginTop: '14px', display: 'grid', gap: '10px' } });
    body.append(steps.root, steps.bar, detail, story);
    steps.advance(0);
    let aborted = false;
    const cancelBtn = el('button', { class: 'btn', text: 'Cancel', onclick: () => { aborted = true; cancel?.(); m.close(); } });
    footer.append(cancelBtn);
    const t0 = Date.now();
    const tick = setInterval(() => { if (!aborted) setText(detail.querySelector('.t') || detail, detail.dataset.msg ? `${detail.dataset.msg} · ${Math.round((Date.now() - t0) / 1000)}s` : ''); }, 1000);
    const say = (msg) => { detail.dataset.msg = msg; setText(detail, `${msg} · ${Math.round((Date.now() - t0) / 1000)}s`); };
    try {
      const result = await ai.run({ ...form, style: aiStyle }, (ev) => {
        if (ev.stage === 'queued') return say('Waiting for the director');
        const i = AI_STEPS.findIndex(([id]) => id === ev.stage);
        if (i >= 0 && i > steps.idx) steps.advance(i);
        if (ev.detail && !ev.done) say(ev.detail);
        if (ev.stage === 'bible' && ev.chars) say(`The director is writing the bible${ev.progress?.sections ? ` · ${ev.progress.sections} sections so far` : ''}`);
        if (ev.stage === 'cues' && ev.chars) say(`Writing cues${ev.progress?.cues ? ` · ${ev.progress.cues} so far` : ''}`);
        if (ev.stage === 'analyze' && ev.done) say(`${Math.round(ev.data.bpm)} BPM${ev.data.rawBpm && Math.abs(ev.data.rawBpm - ev.data.bpm) > 5 ? ` (the tracker said ${Math.round(ev.data.rawBpm)}; corrected)` : ''}`);
        if (ev.stage === 'lyrics' && ev.done) say(ev.data.source ? `Lyrics found: ${ev.data.track} · ${ev.data.lines} lines` : 'No lyrics found; the director will work from the music');
        if (ev.stage === 'bible' && ev.done) showStory(story, ev.data);
      }, (cancelFn) => (cancel = cancelFn));
      clearInterval(tick);
      steps.advance(AI_STEPS.length);
      viewDone(result.wal, result.report);
    } catch (e) { clearInterval(tick); if (!aborted) viewError(e, startAi); }
    cancel = null;
  }

  function showStory(host, d) {
    const u = d.understanding || {};
    host.innerHTML = '';
    host.append(
      el('div', { class: 'card', style: { display: 'grid', gap: '8px' } },
        el('div', { class: 'label', text: 'What the director heard' }),
        el('div', { style: { fontSize: '13px', lineHeight: 1.5 }, text: u.story || '' }),
        el('div', { class: 'muted', style: { fontSize: '12px' }, text: [u.language, u.mood, u.occasion].filter(Boolean).join(' · ') }),
        el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, ...[...new Set(d.sections.map((s) => s.palette))].flatMap((p) => (d.palettes[p] || []).slice(0, 4).map((c) => el('i', { style: { width: '18px', height: '18px', borderRadius: '5px', background: c, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)' }, 'data-tip': p }))))));
  }

  function viewError(e, retry) {
    body.innerHTML = ''; footer.innerHTML = '';
    body.append(el('div', { class: 'est-box', html: `${icon('alert', 16)}<span></span>` }));
    body.querySelector('span').textContent = e.message;
    footer.append(el('button', { class: 'btn', text: 'Close', onclick: () => m.close() }), el('button', { class: 'btn primary', text: 'Try again', onclick: viewIdle }));
  }

  function viewDone(wal, report) {
    cancel = null;
    body.innerHTML = ''; footer.innerHTML = '';
    const drops = wal.sections.filter((s) => s.kind === 'drop').length;
    const isAi = !!report.understanding;
    body.append(
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: String(Math.round(wal.meta.bpm)) }), el('small', { text: 'BPM' })),
        el('div', { class: 'stat' }, el('b', { text: String(wal.sections.length) }), el('small', { text: 'sections' })),
        el('div', { class: 'stat' }, el('b', { text: String(wal.cues.length) }), el('small', { text: isAi ? 'cues' : drops === 1 ? 'drop' : 'drops' }))));
    if (isAi) {
      body.append(
        el('div', { class: 'card', style: { marginTop: '12px', display: 'grid', gap: '6px' } }, el('div', { class: 'label', text: 'The lighting story' }), el('div', { style: { fontSize: '13px', lineHeight: 1.5 }, text: (wal.meta.notes || '').split('\n\nLighting notes:')[1]?.trim() || report.understanding.visualIdentity || '' })),
        ...(report.warnings?.length ? [el('details', { class: 'more', style: { marginTop: '10px' } }, el('summary', {}, el('span', { text: `${report.warnings.length} note${report.warnings.length > 1 ? 's' : ''}` }), el('span', { html: icon('chevron', 14) })),
          el('div', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.5, marginTop: '6px' } }, ...report.warnings.slice(0, 8).map((w) => el('div', { text: `• ${w}` }))))] : []),
        el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '10px' }, text: `Done in ${Math.round(report.timings.totalMs / 1000)}s` }));
    } else {
      body.append(el('div', { class: 'note', style: { marginTop: '12px' }, html: `${icon('info', 16)}<span>This is an automatic first draft in the <b>${STYLE_LABEL[style]}</b> style with ${wal.cues.length} cues. For lyrics, mood and meaning, use the <b>AI director</b>.</span>` }));
    }
    footer.append(el('button', { class: 'btn', html: `${icon('download', 16)}<span>Download WAL</span>`, onclick: download }),
      el('button', { class: 'btn primary', 'data-autofocus': true, html: `${icon('play', 16)}<span>Play the show</span>`, onclick: () => { m.close(); play(); } }));
    footer.querySelector('[data-autofocus]')?.focus();
  }

  if (!hasAudio) { viewPick(); return; }
  if (ai) {
    viewIdle();
    ai.check().then((h) => { health = h; mode = h?.claude && h?.ffmpeg ? 'ai' : 'quick'; if (!body.querySelector('.steps')) viewIdle(); });
  } else viewIdle();
}

const KEYS = [
  ['Song library', ['L']], ['Search songs', ['/']], ['Add songs', ['A']], ['Next / previous song', ['N', 'B']], ['Shuffle', ['Z']],
  ['Look panel', ['V']], ['Beam thinner / thicker', ['[', ']']],
  ['Play / pause', ['Space']], ['Skip 5 s', ['←', '→']], ['Skip 15 s', ['⇧', '← →']], ['Mute', ['M']],
  ['Director camera', ['1']], ['Crane (close to the stage)', ['J']], ['Record the show as a video', ['E']], ['Drone orbit / reveal', ['2', '3']], ['Drone fly-over / top', ['4', '5']], ['FOH / crowd', ['6', '7']],
  ['Pit / stage', ['8', '9']], ['Walk the floor', ['0']], ['Next camera', ['C']], ['Haze on / off', ['H']],
  ['Design with AI', ['D']], ['Rig builder', ['R']], ['Show panel', ['S']], ['Hide interface', ['U']], ['Fullscreen', ['F']], ['Frame rate readout', ['P']],
];
export function openHelp() {
  const grid = el('div', { class: 'help-grid' }, ...KEYS.map(([label, keys]) => el('div', { class: 'r' }, el('span', { text: label }), el('span', { class: 'keys' }, ...keys.map((k) => el('span', { class: 'kbd', text: k }))))));
  modal({ title: 'Keyboard shortcuts', sub: 'In Walk mode: W A S D to move, Shift to move faster, drag to look, wheel to zoom.', body: grid });
}
