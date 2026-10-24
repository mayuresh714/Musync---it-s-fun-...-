// Top bar (brand, song menu, camera switcher, view actions) and the transport dock.
import { icon, MARK } from './icons.js';
import { $, el, bus, popover, menuItem, segIndicator, setText, setStyleVar, fmtTime, modal } from './kit.js';
import { Timeline, KIND_COLORS } from './timeline.js';

const VIEWS = [
  { id: 'director', label: 'Auto', sub: 'Changes shots with the music', icon: 'director', kbd: '1' },
  { id: 'crane', label: 'Close crane', short: 'Crane', sub: 'Swings close to the stage and lights', icon: 'crane', kbd: 'J' },
  { id: 'orbit', label: 'Drone: circle', short: 'Drone', sub: 'Flies around the venue', icon: 'orbit', kbd: '2' },
  { id: 'reveal', label: 'Drone: rise', short: 'Drone', sub: 'Rises to show the whole scene', icon: 'reveal', kbd: '3' },
  { id: 'fly', label: 'Drone: fly over', short: 'Drone', sub: 'Skims over the crowd to the stage', icon: 'fly', kbd: '4' },
  { id: 'top', label: 'Drone: from above', short: 'Drone', sub: 'Straight down, slowly turning', icon: 'top', kbd: '5' },
  { id: 'foh', label: 'Sound desk', sub: 'Where the sound engineer stands', icon: 'foh', kbd: '6' },
  { id: 'crowd', label: 'In the crowd', short: 'Crowd', sub: 'Eye level with the audience', icon: 'crowd', kbd: '7' },
  { id: 'pit', label: 'Front row', sub: 'At the barrier, looking up', icon: 'pit', kbd: '8' },
  { id: 'stage', label: 'On stage', sub: 'Where the performer stands', icon: 'stage', kbd: '9' },
  { id: 'walk', label: 'Walk around', short: 'Walk', sub: 'W A S D to move, drag to look', icon: 'walk', kbd: '0' },
  { id: 'free', label: 'Free look', sub: 'Drag to look around', icon: 'free' },
];
export const DRONE_SHOTS = [
  { id: 'orbit', label: 'Orbit', sub: 'Circle the venue', icon: 'orbit', kbd: '2' },
  { id: 'reveal', label: 'Reveal', sub: 'Rise and tilt to show the scale', icon: 'reveal', kbd: '3' },
  { id: 'fly', label: 'Fly-over', sub: 'Skim over the crowd to the stage', icon: 'fly', kbd: '4' },
  { id: 'top', label: 'Top-down', sub: 'Straight down, slowly turning', icon: 'top', kbd: '5' },
];
export const SHOT_NAMES = { director: 'Director', crane: 'Crane', orbit: 'Orbit', reveal: 'Reveal', fly: 'Fly-over', top: 'Top-down', foh: 'Front of house', crowd: 'In the crowd', pit: 'Front barrier', stage: 'From the stage', walk: 'Walk', free: 'Free' };

export function initChrome({ actions, getState }) {
  const ui = $('#ui');
  ui.innerHTML = '';

  // ── top bar: brand and songs on the left; four things on the right ────────────────────────────────────────
  const libBtn = el('button', { class: 'btn ghost lib-open', 'aria-haspopup': 'dialog', 'data-tip': 'Browse, search and add songs', 'data-kbd': 'L', 'data-tip-pos': 'below', html: `${icon('library', 20)}<span class="lbl">Songs</span>`, onclick: () => actions.openLibrary() });
  const left = el('div', { class: 'pill glass tb-left' }, el('div', { class: 'brand', html: `${MARK}<span class="word">Musync</span>` }), el('span', { class: 'vr' }), libBtn);

  // the camera: one button, one menu, plain names
  const viewBtn = el('button', { class: 'btn view-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Camera view', 'data-tip': 'Change the camera view', 'data-kbd': 'C', 'data-tip-pos': 'below', onclick: () => openViewMenu() });
  const setViewBtn = (mode) => {
    const v = VIEWS.find((x) => x.id === mode) || VIEWS[0];
    viewBtn.innerHTML = `${icon(v.icon, 20)}<span class="lbl">${v.short || v.label}</span>${icon('chevron', 14)}`;
  };
  const aiBtn = el('button', { class: 'btn ai-btn', 'aria-pressed': 'false', 'aria-controls': 'aiDrawer', 'data-tip': 'Describe your event or show your venue photos and get a lighting plan', 'data-kbd': 'D', 'data-tip-pos': 'below', html: `${icon('sparkle', 19)}<span class="lbl">Design with AI</span>`, onclick: () => actions.toggleDrawer('ai') });
  const rigBtn = el('button', { class: 'btn ghost', 'aria-pressed': 'false', 'aria-controls': 'rigDrawer', 'data-tip': 'The lights in this venue: change the place, add or test lights', 'data-kbd': 'R', 'data-tip-pos': 'below', html: `${icon('layers', 20)}<span class="lbl">Lights</span>`, onclick: () => actions.toggleDrawer('rig') });
  const moreBtn = el('button', { class: 'btn icon ghost', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More', 'data-tip': 'More options', 'data-tip-pos': 'below', html: icon('more', 22), onclick: () => openMore() });
  // shown only while something is happening
  const recBtn = el('button', { class: 'btn rec-pill rec', hidden: true, 'aria-pressed': 'false', 'aria-label': 'Record', 'data-tip': 'Press to stop and cancel the video export', 'data-tip-pos': 'below', html: `${icon('record', 18)}<span class="rec-time mono"></span>`, onclick: () => actions.toggleRecord() });
  const liveBtn = el('button', { class: 'btn live-pill live-open', hidden: true, 'aria-haspopup': 'dialog', 'data-tip': 'Live mode is on. Click for sensitivity or to stop', 'data-tip-pos': 'below', html: `<i></i><span class="lbl">Live</span>`, onclick: () => actions.openLive() });
  const right = el('div', { class: 'pill glass tb-right' }, recBtn, liveBtn, aiBtn, viewBtn, rigBtn, moreBtn);
  const topbar = el('header', { id: 'topbar' }, left, right);
  setViewBtn('director');

  // ── player: song on the left, controls and progress in the middle, section and volume on the right ──────────
  const playBtn = el('button', { class: 'play', 'aria-pressed': 'false', 'aria-label': 'Play', 'data-tip': 'Play / pause', 'data-kbd': 'Space', onclick: () => actions.toggle() });
  playBtn.innerHTML = `${icon('play', 26, 'i-play')}${icon('pause', 26, 'i-pause')}`;
  const prevBtn = el('button', { class: 'btn icon ghost pv', 'aria-label': 'Previous song', 'data-tip': 'Previous song (restarts if past 3 s)', 'data-kbd': 'B', html: icon('prev', 24), onclick: () => actions.prevSong() });
  const nextBtn = el('button', { class: 'btn icon ghost pv', 'aria-label': 'Next song', 'data-tip': 'Next song', 'data-kbd': 'N', html: icon('next', 24), onclick: () => actions.nextSong() });
  const shufBtn = el('button', { class: 'btn icon ghost pv sm', 'aria-pressed': 'false', 'aria-label': 'Shuffle', 'data-tip': 'Shuffle the current list', 'data-kbd': 'Z', html: icon('shuffle', 20), onclick: () => actions.toggleShuffle() });
  const transport = el('div', { class: 'transport' }, shufBtn, prevBtn, playBtn, nextBtn);
  const songTitle = el('b', { class: 'ellipsis', text: 'No song loaded' }), songSub = el('small', { class: 'ellipsis', text: 'Tap to choose a song' });
  const songBtn = el('button', { class: 'track', 'aria-haspopup': 'dialog', 'aria-label': 'Open the song library', 'data-tip': 'Choose a song', 'data-kbd': 'L', onclick: () => actions.openLibrary() },
    el('span', { class: 'art', html: icon('note', 24) }), el('span', { class: 'meta' }, songTitle, songSub));
  const canvas = el('canvas', { id: 'timelineCanvas' });
  const tip = el('div', { class: 'tl-tip' });
  const liveCanvas = el('canvas', { class: 'live-canvas', 'aria-hidden': 'true' });
  const liveTag = el('span', { class: 'live-tag', html: '<i></i>LIVE' });
  const liveStrip = el('div', { class: 'live-strip' }, liveCanvas, liveTag);
  const tl = el('div', { class: 'tl' }, canvas, tip, liveStrip);
  const curTime = el('span', { class: 'tm mono', text: '0:00' }), durTime = el('span', { class: 'tm mono', text: '0:00' });
  const progress = el('div', { class: 'dk-progress' }, curTime, tl, durTime);
  const beat = el('span', { class: 'beat' });
  const secName = el('span', { id: 'secName', text: '—' }), secDot = el('i');
  const secSub = el('small', { id: 'secSub', text: '' });
  const now = el('div', { class: 'now' }, beat, el('div', { class: 'txt' }, el('b', {}, secDot, secName), secSub));
  const muteBtn = el('button', { class: 'btn icon ghost', 'aria-label': 'Mute', 'data-tip': 'Mute', 'data-kbd': 'M', html: icon('volume', 22), onclick: () => actions.toggleMute() });
  const vol = el('input', { class: 'slider', type: 'range', min: '0', max: '1', step: '0.01', value: '0.8', 'aria-label': 'Volume', oninput: (e) => actions.setVolume(+e.target.value) });
  const dock = el('footer', { id: 'dock', class: 'glass' },
    el('div', { class: 'dk-left' }, songBtn),
    el('div', { class: 'dk-center' }, transport, progress),
    el('div', { class: 'dk-right' }, now, el('div', { class: 'vol' }, muteBtn, vol)));

  const caption = el('div', { class: 'caption', 'aria-live': 'polite' });
  const perfEl = el('div', { class: 'perf mono glass', hidden: true });
  ui.append(topbar, dock, caption, perfEl);

  const timeline = new Timeline(canvas, tip, { onSeek: (t) => actions.seek(t) });

  // ── behaviour ───────────────────────────────────────────────────────────
  function openSettings() {
    const st = getState();
    const q = (id, label, sub) => menuItem({ label, sub, checked: st.quality === id, onClick: () => { pop.close(); actions.setQuality(id); } });
    const content = el('div', {}, el('div', { class: 'menu-title label', text: 'Picture quality' }),
      q('auto', 'Auto', 'Holds a smooth frame rate by adjusting sharpness'),
      q('high', 'High', 'Full sharpness. Needs a fast GPU'),
      q('balanced', 'Balanced', 'Sharp enough, much lighter'),
      q('low', 'Low', 'For slower laptops'),
      el('div', { class: 'menu-sep' }),
      el('div', { class: 'menu-title label', text: 'Playback' }),
      menuItem({ icon: 'next', label: 'Play the next song automatically', sub: 'When a song ends, continue down the list you picked it from', checked: st.autoNext, onClick: () => { pop.close(); actions.setAutoNext(!st.autoNext); } }),
      el('div', { class: 'menu-sep' }),
      menuItem({ icon: 'pulse', label: 'Show frame rate', sub: 'Frames per second and render scale', checked: st.showPerf, right: el('span', { class: 'kbd', text: 'P' }), onClick: () => { pop.close(); actions.togglePerf(); } }));
    const pop = popover(moreBtn, content, { width: 320, align: 'end' });
  }

  // Look: how the rig is drawn, without touching the show. Applies instantly; remembered in this browser.
  function openLook() {
    const L = actions.look.get();
    const row = (label, hint, input, out) => el('label', { class: 'lk' }, el('span', { class: 'lk-head' }, el('b', { text: label }), out), input, el('small', { text: hint }));
    const slider = (key, min, max, step, toV, fromV, fmt, hint, label) => {
      const out = el('span', { class: 'mono', text: fmt(L[key]) });
      const input = el('input', { class: 'slider wide', type: 'range', min, max, step, value: String(fromV(L[key])), 'aria-label': label, 'aria-valuetext': fmt(L[key]),
        oninput: (e) => { const v = toV(+e.target.value); actions.look.set({ [key]: v }); const f = fmt(v); out.textContent = f; e.target.setAttribute('aria-valuetext', f); fill(e.target); } });
      const fill = (n) => n.style.setProperty('--p', `${((+n.value - min) / (max - min)) * 100}%`);
      fill(input);
      input.dataset.key = key;
      return row(label, hint, input, out);
    };
    // thickness is felt on a log scale: 0.5x .. 8x
    const content = el('div', { class: 'look', role: 'group', 'aria-label': 'Look' },
      el('div', { class: 'menu-title label', text: 'Look' }),
      slider('beamWidth', 0, 1, 0.005, (v) => Math.round(0.5 * Math.pow(16, v) * 100) / 100, (b) => Math.log(b / 0.5) / Math.log(16), (v) => `${v.toFixed(1)}×`, 'Thickness of beam and spot shafts in the haze. [ and ] change it from the keyboard.', 'Beam thickness'),
      slider('spill', 0, 1, 0.01, (v) => v, (v) => v, (v) => `${Math.round(v * 100)}%`, 'How much coloured light lands on the floor, crowd and structure. Lower keeps the venue neutral.', 'Colour spill'),
      slider('screen', 0, 1, 0.01, (v) => v, (v) => v, (v) => `${Math.round(v * 100)}%`, 'LED screen brightness. Lower for a calmer picture.', 'LED screens'),
      slider('beamGain', 0.3, 4, 0.05, (v) => v, (v) => v, (v) => `${v.toFixed(1)}×`, 'Brightness of every shaft and where it lands. Raise it if the paths are hard to see.', 'Beam brightness'),
      slider('haze', 0.3, 4, 0.05, (v) => v, (v) => v, (v) => `${v.toFixed(1)}×`, 'Amount of haze in the air. More haze draws the beams more clearly.', 'Haze amount'),
      slider('surr', 0, 1, 0.01, (v) => v, (v) => v, (v) => `${Math.round(v * 100)}%`, 'Brightness of lamps, signs and windows around the venue. Lower for natural darkness.', 'Surroundings'),
      slider('glow', 0, 1.6, 0.01, (v) => v, (v) => v, (v) => `${Math.round(v * 100)}%`, 'Bloom around bright lights.', 'Glow'),
      el('div', { class: 'menu-sep' }),
      (() => { const b = el('button', { class: 'lk-toggle', role: 'switch', 'aria-checked': String(L.effects), onclick: () => { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(on)); actions.look.set({ effects: on }); } }, el('span', {}, el('b', { text: 'Stage effects' }), el('small', { text: 'CO2 jets, cold sparks, confetti, streamers and flame when the show calls for them' })), el('i', { class: 'sw-track' })); return b; })(),
      el('div', { class: 'menu-sep' }),
      el('button', { class: 'btn sm ghost', html: `${icon('close', 14)}<span>Reset to defaults</span>`, onclick: () => { actions.look.reset(); pop.close(); openLook(); } }));
    const pop = popover(moreBtn, content, { width: 340, align: 'end' });
    setTimeout(() => content.querySelector('input')?.focus({ preventScroll: true }), 40);
  }

  // Live mode chooser: where does the music come from?
  const STYLE_CHOICES = [['bollywood', 'Bollywood / film'], ['edm', 'Club / EDM'], ['dandiya', 'Dandiya / garba'], ['concert', 'Concert'], ['wedding', 'Wedding / sangeet'], ['romantic', 'Romantic'], ['devotional', 'Devotional']];
  function openLiveChooser() {
    const style = el('select', { class: 'input', 'aria-label': 'Occasion' }, ...STYLE_CHOICES.map(([v, l]) => el('option', { value: v, text: l })));
    try { style.value = localStorage.getItem('musync.liveStyle') || 'bollywood'; } catch {}
    const go = async (kind) => { try { localStorage.setItem('musync.liveStyle', style.value); } catch {} dlg.close(); await actions.goLive(kind, style.value); };
    const card = (kind, ic, title, text, note) => el('button', { class: 'opt big', onclick: () => go(kind) },
      el('span', { class: 'ico', html: icon(ic, 24) }), el('span', {}, el('b', { text: title }), el('small', { text }), note ? el('small', { class: 'note-s', text: note }) : null), el('span', { class: 'tick', html: icon('next', 16) }));
    const body = el('div', { class: 'stack' },
      card('tab', 'tab', 'Stream a browser tab', 'Play the song on YouTube (or any site) in another tab. Pick that tab and tick “Share tab audio”.', 'Chrome or Edge. The tab keeps playing normally.'),
      card('mic', 'mic', 'Listen with the microphone', 'Play music on your phone or another speaker near this computer; the lights follow what the microphone hears.', 'Works with any source. A quiet room helps.'),
      el('label', { class: 'field' }, el('span', { text: 'Occasion (shapes the style of the show)' }), style),
      el('div', { class: 'note', html: `${icon('info', 16)}<span>The lights react to what has just been heard, so they follow a beat or two behind a change and land drops as they arrive. Nothing is recorded or uploaded.</span>` }));
    const dlg = modal({ title: 'Live mode', sub: 'Light up to music as it plays', body });
  }
  let liveOn = false;
  function openLivePanel() {
    const st = actions.live().tracker.status();
    const sens = el('input', { class: 'slider wide', type: 'range', min: '-1.3', max: '1', step: '0.05', value: '0', 'aria-label': 'Input sensitivity',
      oninput: (e) => { const v = Math.pow(10, -+e.target.value); actions.setSensitivity(v); sens.style.setProperty('--p', `${((+e.target.value + 1.3) / 2.3) * 100}%`); } });
    sens.style.setProperty('--p', `${(1.3 / 2.3) * 100}%`);
    const content = el('div', { class: 'look' },
      el('div', { class: 'menu-title label', text: `Live · ${actions.live().label}` }),
      el('div', { class: 'lk' }, el('span', { class: 'lk-head' }, el('b', { text: 'Input sensitivity' }), el('span', { class: 'mono', text: 'drag right for quiet rooms' })), sens,
        el('small', { text: 'Raise it if the lights barely react (a far-away speaker); lower it if room noise makes them flicker.' })),
      el('div', { class: 'menu-sep' }),
      el('button', { class: 'btn danger', html: `${icon('close', 16)}<span>Stop live mode</span>`, onclick: () => { pop.close(); actions.stopLive(); } }));
    const pop = popover(liveBtn, content, { width: 320, align: 'start' });
    setTimeout(() => sens.focus({ preventScroll: true }), 40);
  }
  actions.openLive = () => (actions.live() ? openLivePanel() : openLiveChooser());

  // the camera menu: every view in plain words
  function openViewMenu() {
    const mode = getState().camera;
    const row = (v) => menuItem({ icon: v.icon, label: v.label, sub: v.sub, checked: mode === v.id, right: v.kbd ? el('span', { class: 'kbd', text: v.kbd }) : null, onClick: () => { pop.close(); actions.setCamera(v.id); } });
    const content = el('div', { class: 'view-menu' }, el('div', { class: 'menu-title label', text: 'Camera view' }), ...VIEWS.map(row));
    const pop = popover(viewBtn, content, { width: 330, align: 'end' });
  }
  // everything that is not needed all the time
  function openMore() {
    const st = getState();
    const later = (fn) => () => { pop.close(); setTimeout(fn, 0); };
    const content = el('div', {},
      menuItem({ icon: 'pulse', label: 'What the lights are doing', sub: 'Live view of every layer', right: el('span', { class: 'kbd', text: 'S' }), onClick: later(() => actions.toggleDrawer('show')) }),
      menuItem({ icon: 'sliders', label: 'Appearance', sub: 'Beam thickness, brightness, screens', right: el('span', { class: 'kbd', text: 'V' }), onClick: later(() => openLook()) }),
      menuItem({ icon: 'haze', label: 'Haze in the air', sub: 'Makes the beams easier to see', checked: st.haze, right: el('span', { class: 'kbd', text: 'H' }), onClick: later(() => actions.toggleHaze()) }),
      el('div', { class: 'menu-sep' }),
      menuItem({ icon: 'record', label: 'Save as a video', sub: 'Smooth 1080p with the song, takes a few minutes', right: el('span', { class: 'kbd', text: 'E' }), onClick: later(() => actions.toggleRecord()) }),
      menuItem({ icon: 'expand', label: 'Full screen', right: el('span', { class: 'kbd', text: 'F' }), onClick: later(() => actions.fullscreen()) }),
      menuItem({ icon: 'live', label: 'Listen live', sub: 'Light up to a browser tab or the microphone', right: el('span', { class: 'kbd', text: 'O' }), onClick: later(() => actions.openLive()) }),
      el('div', { class: 'menu-sep' }),
      menuItem({ icon: 'gear', label: 'Picture quality', sub: 'Auto, high, balanced or low', onClick: later(() => openSettings()) }),
      menuItem({ icon: 'help', label: 'Keyboard shortcuts', right: el('span', { class: 'kbd', text: '?' }), onClick: later(() => actions.help()) }));
    const pop = popover(moreBtn, content, { width: 340, align: 'end' });
  }

  bus.on('record', ({ on, secs, pct, finishing }) => {
    recBtn.hidden = !on;
    recBtn.setAttribute('aria-pressed', String(on));
    recBtn.setAttribute('aria-label', on ? 'Stop recording' : 'Record');
    recBtn.querySelector('.rec-time').textContent = !on ? '' : pct != null ? (finishing ? 'Saving' : `${Math.round(pct * 100)}%`) : fmtTime(secs);
    recBtn.querySelector('svg')?.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon(on ? 'stop' : 'record', 18) }).firstChild);
  });
  bus.on('songs', () => {});
  bus.on('wal', ({ wal, songId, title }) => {
    timeline.setWal(wal);
    duration = wal.meta.duration;
    setText(songTitle, title || wal.meta.title);
    setText(songSub, wal.meta.artist || 'Light show');
    setText(durTime, fmtTime(wal.meta.duration));
  });
  bus.on('camera', ({ mode, shot }) => {
    setViewBtn(mode);
    if (shot) showCaption(mode === 'director' ? `Auto · ${SHOT_NAMES[shot] || shot}` : SHOT_NAMES[mode] || mode);
  });
  bus.on('live', ({ on, label }) => {
    liveOn = !!on;
    liveBtn.hidden = !on;
    liveBtn.setAttribute('aria-pressed', String(!!on));
    playBtn.dataset.tip = on ? 'Stop live mode' : 'Play / pause';
    if (on) setText(songSub, 'Live from your sound');
  });
  bus.on('shuffle', (on) => { shufBtn.setAttribute('aria-pressed', String(on)); shufBtn.dataset.tip = on ? 'Shuffle is on' : 'Shuffle the current list'; });
  bus.on('queue', ({ index, length }) => { prevBtn.disabled = false; nextBtn.disabled = length < 2; });
  bus.on('playing', (p) => { playBtn.setAttribute('aria-pressed', String(p)); playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play'); });
  bus.on('perf', ({ fps, scale, ms, show }) => { perfEl.hidden = !show; if (show) setText(perfEl, `${Math.round(fps)} fps · ${ms.toFixed(1)} ms · ${scale.toFixed(2)}× scale`); });
  bus.on('drawer', ({ name, open }) => { ({ rig: rigBtn, ai: aiBtn }[name])?.setAttribute('aria-pressed', String(open)); });
  bus.on('volume', ({ v, muted }) => {
    vol.value = String(muted ? 0 : v);
    setStyleVar(vol, '--p', `${(muted ? 0 : v) * 100}%`);
    muteBtn.innerHTML = icon(muted || v === 0 ? 'mute' : 'volume', 18);
  });

  let capTimer;
  function showCaption(text) {
    caption.textContent = text;
    caption.classList.add('on');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => caption.classList.remove('on'), 2600);
  }

  actions.openLook = openLook;
  // the live strip: the last 20 seconds of loudness with the beat ticks the tracker found
  function drawLive(L) {
    const c = liveCanvas, w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const R = L.recent, n = R.energy.length;
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, w, h);
    for (const b of R.beats) { g.fillStyle = b.down ? 'rgba(255,180,84,0.55)' : 'rgba(255,255,255,0.14)'; g.fillRect(Math.round(b.x * w), b.down ? 0 : h * 0.55, 1.5, b.down ? h : h * 0.45); }
    const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, 'rgba(106,183,255,0.9)'); grad.addColorStop(1, 'rgba(255,180,84,0.95)');
    g.fillStyle = grad;
    const bw = w / n;
    for (let i = 0; i < n; i++) { const v = Math.max(0.02, R.energy[i]) * (h - 6); g.fillRect(i * bw, (h - v) / 2, Math.max(1, bw - 1), v); }
  }

  let lastBeat = -1, duration = 0;
  return {
    timeline,
    tick(s) {
      if (s.live) { drawLive(s.live); setText(songSub, s.live.locked ? `Live · ${s.live.bpm} BPM` : 'Live · listening…'); setText(curTime, 'LIVE'); setText(durTime, ''); setText(secName, s.live.role); setStyleVar(secDot, '--kc', KIND_COLORS[{ refrain: 'chorus', tagline: 'drop', lift: 'build', silence: 'break' }[s.live.role] || 'verse'] || '#888'); setText(secSub, s.live.silent ? 'silence' : `${Math.round(s.live.energy * 100)}% level`); if (s.playing && s.beatIdx !== lastBeat) { lastBeat = s.beatIdx; beat.animate([{ opacity: 1, transform: 'scale(1.7)' }, { opacity: 0.35, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); } return; }
      setText(curTime, fmtTime(s.t)); setText(durTime, duration ? fmtTime(duration) : '0:00');
      timeline.setTime(s.t);
      if (s.section) {
        setText(secName, s.section.label || s.section.kind);
        setStyleVar(secDot, '--kc', KIND_COLORS[s.section.kind] || '#888');
        secDot.style.background = KIND_COLORS[s.section.kind] || '';
        setText(secSub, `bar ${s.bar} · ${s.bpm} bpm`);
      } else { setText(secName, '—'); setText(secSub, ''); }
      if (s.playing && s.beatIdx !== lastBeat) {
        lastBeat = s.beatIdx;
        beat.animate([{ opacity: 1, transform: 'scale(1.7)' }, { opacity: 0.35, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
      }
    },
  };
}
