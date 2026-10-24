// Controller: owns the scene, rig, show and audio; exposes an actions API to the interface
// (sim/ui/*) and publishes changes on the event bus. No DOM construction happens here.
import { benchRig, benchWal } from './bench.js';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createStage, setPracticals, setHaze, surfaceUniforms, setSurroundings } from './scene/stage.js';
import { buildVenue, DECK } from './scene/venues.js';
import { CameraRig } from './scene/cameras.js';
import { createRecorder } from './ui/record.js';
import { hexToRgb } from '../core/decoder/looks.js';
import { RigView } from './scene/fixtures3d.js';
import { StageEffects } from './scene/effects.js';
import { createDecoder, buildElements } from '../core/decoder/decoder.js';
import { FIXTURES } from '../core/fixtures/library.js';
import { validateWal } from '../core/wal/validate.js';
import { $, bus, el, initTooltips, initFocusHygiene, toast, closePopover } from './ui/kit.js';
import { icon } from './ui/icons.js';
import { loader, cut, initDropzone, initIdleFade, toggleFullscreen } from './ui/fx.js';
import { initChrome } from './ui/chrome.js';
import { initDrawers } from './ui/drawers.js';
import { initPlanner } from './ui/planner.js';
import { openAnalyze, openHelp } from './ui/dialogs.js';
import { createLibrary } from './library.js';
import { createOnboarder } from './onboard.js';
import { initLibrary } from './ui/library.js';
import { startLive, LIVE_ERRORS } from './live/session.js';

const RIG_PRESETS = [
  ['concert', 'Concert stage'],
  ['dandiya', 'Dandiya / Garba ground'],
  ['club', 'Club'],
  ['hall', 'Banquet hall'],
  ['lawn', 'Wedding lawn'],
  ['quad-sharpy', '4 × Sharpy'],
  ['single-sharpy', 'Single Sharpy'],
];
const CUSTOM_KEY = 'musync.customRig';
const VOL_KEY = 'musync.volume';
const QUALITY_KEY = 'musync.quality';
const LOOK_KEY = 'musync.look';
const LOOK_DEFAULT = { beamWidth: 2, spill: 0.3, screen: 0.5, glow: 1, effects: true, surr: 0.35, haze: 1.8, beamGain: 1.6 };
const VENUE_OF = { stage: 'concert', club: 'club', garba: 'garba', hall: 'hall', lawn: 'lawn' };
const CAMERA_CYCLE = ['director', 'crane', 'orbit', 'reveal', 'fly', 'top', 'foh', 'crowd', 'pit', 'stage', 'walk', 'free'];
const KEY_CAMERA = { Digit1: 'director', Digit2: 'orbit', Digit3: 'reveal', Digit4: 'fly', Digit5: 'top', Digit6: 'foh', Digit7: 'crowd', Digit8: 'pit', Digit9: 'stage', Digit0: 'walk' };

const lib = createLibrary();

const app = {
  queue: { ids: [], shuffle: false, autoNext: true, history: [] },
  wal: null, rig: null, presetId: 'concert', presets: [], decoder: null,
  audio: new Audio(), audioBuffer: null, audioName: null,
  songs: [], songId: null, walCache: new Map(),
  clock: 0, energy: 0.5, playing: false, venue: null, selected: null,
  haze: true, volume: 0.8, muted: false, camera: 'director', frames: 0,
  quality: 'auto', showPerf: false,
  look: { ...LOOK_DEFAULT },
};
app.audio.preload = 'auto';
try { const q = localStorage.getItem(QUALITY_KEY); if (['auto', 'high', 'balanced', 'low'].includes(q)) app.quality = q; } catch {}
try { app.queue.autoNext = localStorage.getItem('musync.autoNext') !== '0'; app.queue.shuffle = localStorage.getItem('musync.shuffle') === '1'; } catch {}
try { Object.assign(app.look, JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch {}
try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v)) app.volume = Math.max(0, Math.min(1, v)); } catch {}

loader.init();
initTooltips();
initFocusHygiene();
cut.init();
loader.set('Setting up the renderer…', 0.1);
setTimeout(() => {}, 0);

// ── scene ────────────────────────────────────────────────────────────────
const stage = createStage($('#viewport'));
const rigView = new RigView(stage.scene, []);
// ── recording ────────────────────────────────────────────────────────────
let recAutoStop = false;
const recorder = createRecorder({
  canvas: stage.renderer.domElement, audio: app.audio,
  onState: (st) => bus.emit('record', st),
  onSaved: ({ file, secs }) => toast(`Saved ${file} (${Math.round(secs)} s). It is in your downloads folder.`, { kind: 'ok', ms: 7000 }),
  onError: (e) => toast(e.message || 'Recording failed.', { kind: 'error', ms: 6000 }),
});
// Export: render the whole show one fixed time-step at a time and let the backend join the frames with the song.
// The result is smooth and sharp whatever the speed of this machine; it takes longer than the song to make.
let exporting = null;
async function exportVideo({ fps = 30, width = 1920, from = 0, to = Infinity } = {}) {
  const post = (path, body) => fetch(`/api/export${path}`, { method: 'POST', body, headers: body && typeof body === 'string' ? { 'content-type': 'application/json' } : undefined });
  const canvas = stage.renderer.domElement, dur = app.wal.meta.duration, total = Math.round((Math.min(to, dur) - from) * fps), pr0 = stage.renderer.getPixelRatio();
  const audio = app.audio.src && !app.audio.src.startsWith('blob:') ? new URL(app.audio.src, location.href).href : null;
  const name = `Musync - ${(app.wal.meta.title || 'show').replace(/[^\w\- ]+/g, '').trim().slice(0, 50)} - ${app.rig?.name || 'rig'} - ${app.camera}`;
  const r = await post('', JSON.stringify({ fps, width, name, audio, from }));
  const info = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(info.error || 'The export could not start.');
  const ex = exporting = { id: info.id, cancel: false };
  const wasPlaying = app.playing;
  pause();
  app.hold = true; last = performance.now(); app.playing = true; app.audio.pause();
  stage.setPixelRatio(Math.max(1, Math.min(2.5, width / Math.max(1, canvas.parentElement.clientWidth))));
  const step = () => frame(last + 1000 / fps);
  const blob = () => new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
  let sending = Promise.resolve(), failed = null;
  const t0 = performance.now();
  try {
    bus.emit('record', { on: true, secs: 0, pct: 0 });
    for (let i = 0; i < 2 * fps; i++) { app.clock = from; step(); } // settle smoke, camera and fixtures at the top of the song
    app.clock = from;
    for (let i = 0; i < total && !ex.cancel && !failed; i++) {
      step();
      const b = await blob();
      const prev = sending;
      sending = prev.then(async () => { const rr = await post(`/${ex.id}/frame`, b); if (!rr.ok) failed = (await rr.json().catch(() => ({}))).error || 'The export failed.'; });
      if (i % fps === 0) { await sending; bus.emit('record', { on: true, secs: (performance.now() - t0) / 1000, pct: i / total }); }
    }
    await sending;
    if (failed) throw new Error(failed);
    if (ex.cancel) { await post(`/${ex.id}/cancel`); return null; }
    bus.emit('record', { on: true, secs: (performance.now() - t0) / 1000, pct: 1, finishing: true });
    const fin = await post(`/${ex.id}/finish`);
    const done = await fin.json().catch(() => ({}));
    if (!fin.ok) throw new Error(done.error || 'The export could not be finished.');
    return done;
  } catch (e) { post(`/${ex.id}/cancel`).catch(() => {}); throw e; }
  finally {
    exporting = null; app.hold = false; last = performance.now(); app.playing = false; seek(0);
    stage.setPixelRatio(pr0);
    bus.emit('record', { on: false, secs: 0 });
    if (wasPlaying) play();
  }
}
async function toggleRecord(live = false) {
  if (exporting) { exporting.cancel = true; return; }
  if (recorder.active) { recAutoStop = false; recorder.stop(); return; }
  if (!app.wal) { toast('Open a song first.', { kind: 'info' }); return; }
  if (!live && !app.live) {
    try {
      toast('Exporting the whole show frame by frame. Keep this tab in front. Press E again to cancel.', { kind: 'info', ms: 6000 });
      const done = await exportVideo();
      if (done) toast(`Saved ${done.file.split('/').pop()} (${Math.round(done.bytes / 1048576)} MB) in your Downloads folder.`, { kind: 'ok', ms: 9000 });
      else toast('Export cancelled.', { kind: 'info' });
      return;
    } catch (e) { toast(`${e.message} Recording live instead.`, { kind: 'warn', ms: 6000 }); }
  }
  const fresh = !app.playing;
  const fileName = `Musync - ${(app.wal.meta.title || 'show').replace(/[^\w\- ]+/g, '').trim().slice(0, 50)} - ${app.rig?.name || 'rig'} - ${app.camera}`;
  if (fresh && !app.live) { seek(0); play(); }
  recAutoStop = fresh && !app.live;
  if (!recorder.start({ fileName })) recAutoStop = false;
}
const effects = new StageEffects(stage.scene);
queueMicrotask(() => { if (app.quality !== 'auto') setQuality(app.quality); else stage.setPixelRatio(drs.scale); });
stage.scene.add(new THREE.HemisphereLight(0x8090b0, 0x101010, 0.25)); // faint work light so fixture bodies read

const gizmo = new TransformControls(stage.camera, stage.renderer.domElement);
gizmo.setSize(0.7);
stage.scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
gizmo.addEventListener('dragging-changed', (e) => {
  stage.controls.enabled = !e.value && camRig.mode === 'free';
  camRig.dragLock = e.value;
  if (!e.value && app.selected) {
    const f = app.rig.fixtures.find((x) => x.id === app.selected);
    const p = gizmo.object.position;
    f.pos = [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100);
    markEdited();
    rigChanged(false);
    bus.emit('fixture-moved', f.id);
  }
});

rigView.camera = stage.camera;
const camRig = new CameraRig(stage.camera, stage.controls, stage.renderer.domElement, {
  onMode: (mode) => { app.camera = mode; bus.emit('camera', { mode }); },
  onShot: (mode, shot) => { app.camera = mode; bus.emit('camera', { mode, shot: mode === 'director' ? shot : null }); },
  cut: { down: () => cut.down(), up: () => cut.up() },
});

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function disposeGroup(g) {
  g.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) { mm.map?.dispose?.(); mm.uniforms?.uMap?.value?.dispose?.(); mm.dispose?.(); }
  });
}

function buildVenueNow(rigVenue) {
  const kind = VENUE_OF[rigVenue] || rigVenue || 'concert';
  const dandiya = kind === 'garba' && !!app.wal?.meta.styles?.includes('dandiya');
  if (app.venue?.kind === kind && app.venue.dandiya === dandiya) return false;
  if (app.venue) { stage.scene.remove(app.venue.group); disposeGroup(app.venue.group); }
  const v = buildVenue(kind, { dandiya });
  stage.scene.add(v.group);
  rigView.setColliders(v.colliders);
  setPracticals(v.practicals);
  surfaceUniforms.uAmbientCol.value.set(...v.atmos.ambient);
  stage.renderer.toneMappingExposure = v.atmos.exposure;
  app.venue = v;
  effects.setVenue(kind === 'garba' ? 'garba' : kind);
  applyLook();
  camRig.setVenue(v.info, kind);
  return true;
}

// Rebuilding a venue takes a moment; do it behind a dip to black so the picture never stutters.
async function ensureVenue(rigVenue, { silent = false } = {}) {
  const kind = VENUE_OF[rigVenue] || rigVenue || 'concert';
  const dandiya = kind === 'garba' && !!app.wal?.meta.styles?.includes('dandiya');
  if (app.venue?.kind === kind && app.venue.dandiya === dandiya) return;
  if (!silent && app.venue) { await cut.down(); await nextFrame(); }
  buildVenueNow(rigVenue);
  if (!silent) { await nextFrame(); cut.up(); }
}

// ── look (what the viewer can tune without touching the show) ───────────
function applyLook() {
  const L = app.look;
  rigView.look.beamWidth = L.beamWidth;
  rigView.look.spill = L.spill;
  rigView.look.beamGain = L.beamGain;
  effects.enabled = L.effects;
  setSurroundings(L.surr);
  if (app.venue) {
    const k = 0.3 + 0.7 * L.surr; // darker, more natural surroundings let the beams read
    surfaceUniforms.uAmbientCol.value.set(...app.venue.atmos.ambient.map((v) => v * k));
    stage.bloom.strength = app.venue.atmos.bloom * L.glow;
    for (const scr of app.venue.screens) scr.setLevel(L.screen);
  }
}
function setLook(patch, { persist = true } = {}) {
  const r = (k, lo, hi) => { if (patch[k] != null) app.look[k] = Math.max(lo, Math.min(hi, +patch[k])); };
  r('beamWidth', 0.5, 8); r('spill', 0, 1); r('screen', 0, 1); r('glow', 0, 1.6); r('surr', 0, 1); r('haze', 0.3, 4); r('beamGain', 0.3, 4);
  if (patch.effects != null) app.look.effects = !!patch.effects;
  applyLook();
  if (persist) try { localStorage.setItem(LOOK_KEY, JSON.stringify(app.look)); } catch {}
  bus.emit('look', { ...app.look });
}

// ── rig ──────────────────────────────────────────────────────────────────
function savedRig() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)); } catch { return null; } }
function markEdited() {
  if (app.presetId !== 'custom') { app.presetId = 'custom'; if (app.rig.name && !/\(edited\)$/.test(app.rig.name)) app.rig.name += ' (edited)'; }
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(app.rig)); } catch {}
  bus.emit('presets');
}

function rigChanged(rebuildVisuals = true) {
  const { fixtures } = buildElements(app.rig);
  if (rebuildVisuals) rigView.setRig(fixtures);
  else for (const f of fixtures) { const it = rigView.items.get(f.id); if (it) { it.f = f; it.group.position.set(...f.pos); } }
  if (rebuildVisuals && app.selected) {
    if (rigView.items.has(app.selected)) { rigView.select(app.selected); gizmo.attach(rigView.items.get(app.selected).group); }
    else { app.selected = null; gizmo.detach(); }
  }
  rebuildDecoder();
  bus.emit('rig', { rig: app.rig });
}

async function loadRigPreset(id) {
  const rig = id === 'custom' ? savedRig() : await (await fetch(`rigs/${id}.json`)).json();
  if (!rig) return loadRigPreset('concert');
  app.rig = rig; app.presetId = id; app.selected = null;
  gizmo.detach(); rigView.select(null);
  await ensureVenue(rig.venue || 'stage', { silent: !app.venue });
  rigChanged();
  bus.emit('selection', null);
}

// An AI design (already checked by the backend) becomes the rig on screen. Nothing is saved over "My rig".
async function applyPlan(plan) {
  if (bench.on) await benchStop();
  app.rig = JSON.parse(JSON.stringify(plan.rig)); app.presetId = 'ai'; app.selected = null;
  gizmo.detach(); rigView.select(null);
  await ensureVenue(app.rig.venue || 'stage', { silent: !app.venue });
  rigChanged();
  if (plan.camera) actions.setCamera(plan.camera);
  if (!app.playing) play();
  bus.emit('selection', null);
  bus.emit('presets');
}

// ── test bench: one fixture alone, every mode a click away. Nothing here is saved; leaving restores the rig and show. ──
const bench = { on: false, model: null, pick: {}, palette: 'festival', saved: null, base: null };
const benchState = () => ({ on: bench.on, model: bench.model, pick: { ...bench.pick }, palette: bench.palette });
function benchShow() {
  app.wal = benchWal(bench.base, bench.model, bench.pick, bench.palette);
  rebuildDecoder();
}
async function benchStart(model, { keep = false } = {}) {
  if (!bench.on) {
    bench.saved = { rig: app.rig, presetId: app.presetId, wal: app.wal, camera: app.camera, selected: app.selected };
    bench.base = app.wal; bench.on = true;
    actions.setCamera('foh');
  }
  if (!keep) bench.pick = {};
  bench.model = model;
  app.rig = benchRig(model); app.presetId = 'bench'; app.selected = null;
  gizmo.detach(); rigView.select(null);
  await ensureVenue('stage', { silent: true });
  rigChanged();
  benchShow();
  if (!app.playing) play();
  bus.emit('bench', benchState());
}
function benchPick(aspect, id, { only = false } = {}) { if (!bench.on) return; if (only) bench.pick = {}; bench.pick[aspect] = id; benchShow(); bus.emit('bench', benchState()); }
function benchPalette(name) { if (!bench.on) return; bench.palette = name; benchShow(); bus.emit('bench', benchState()); }
async function benchStop() {
  if (!bench.on) return;
  const s = bench.saved; bench.on = false; bench.saved = null;
  app.rig = s.rig; app.presetId = s.presetId; app.selected = null;
  gizmo.detach(); rigView.select(null);
  await ensureVenue(s.rig.venue || 'stage', { silent: true });
  rigChanged();
  app.wal = s.wal; rebuildDecoder();
  actions.setCamera(s.camera);
  bus.emit('bench', benchState());
  bus.emit('presets');
}

function newId(prefix) { let n = 1; while (app.rig.fixtures.some((f) => f.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; }

function addFixture(model) {
  const p = FIXTURES[model];
  const prefix = { beam: 'B', spot: 'S', wash: 'W', pixel: 'PX', strobe: 'ST', blinder: 'BL', laser: 'L', tube: 'TB', matrix: 'MX' }[p.role] || 'F';
  const club = (app.rig.venue || 'stage') === 'club';
  // new fixtures stand on the deck (club: hang from the ceiling truss); the gizmo moves them into place
  const f = club ? { id: newId(prefix), model, pos: [0, 4, 0], mount: 'hung' } : { id: newId(prefix), model, pos: [0, DECK, -2], mount: 'floor' };
  app.rig.fixtures.push(f);
  markEdited();
  app.selected = f.id;
  rigChanged();
  selectFixture(f.id);
  toast(`Added ${p.name} as ${f.id}. Drag the gizmo, or type a position.`, { kind: 'ok' });
}

function selectFixture(id) {
  app.selected = id;
  rigView.select(id);
  const it = id && rigView.items.get(id);
  if (it) gizmo.attach(it.group); else gizmo.detach();
  bus.emit('selection', id);
}

function patchFixture(id, patch) {
  const f = app.rig.fixtures.find((x) => x.id === id);
  if (!f) return;
  for (const [k, v] of Object.entries(patch)) { if (v == null) delete f[k]; else f[k] = v; }
  markEdited();
  rigChanged();
  bus.emit('selection', id);
}

function deleteSelected() {
  if (!app.selected) return;
  const id = app.selected;
  app.rig.fixtures = app.rig.fixtures.filter((f) => f.id !== id);
  app.selected = null; gizmo.detach(); markEdited(); rigChanged(); bus.emit('selection', null);
  toast(`Removed ${id}.`, { kind: 'info', ms: 2200 });
}
function cloneSelected(mirror) {
  const f = app.rig.fixtures.find((x) => x.id === app.selected);
  if (!f) return;
  const c = structuredClone(f);
  c.id = newId(f.id.replace(/\d+$/, ''));
  if (mirror) c.pos[0] = -c.pos[0]; else c.pos[0] = +(c.pos[0] + 1).toFixed(2);
  app.rig.fixtures.push(c);
  markEdited(); rigChanged(); selectFixture(c.id);
}

function exportRig() {
  download(JSON.stringify(app.rig, null, 1), `${(app.rig.name || 'rig').replace(/[^\w-]+/g, '_')}.rig.json`);
  toast('Rig exported.', { kind: 'ok', ms: 2200 });
}
async function importRigFile(file) {
  try {
    const rig = JSON.parse(await file.text());
    buildElements(rig); // throws on unknown models
    app.rig = rig; app.presetId = 'custom'; app.selected = null;
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(rig)); } catch {}
    await ensureVenue(rig.venue || 'stage');
    rigChanged(); bus.emit('presets'); bus.emit('selection', null);
    toast(`Imported ${rig.name || 'rig'} (${rig.fixtures.length} fixtures).`, { kind: 'ok' });
  } catch (err) { toast(`That rig couldn't be imported: ${err.message}`, { kind: 'error', ms: 6000 }); }
}

function download(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// click-to-select in the scene
const ray = new THREE.Raycaster();
let downAt = null;
stage.renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
stage.renderer.domElement.addEventListener('pointerup', (e) => {
  if (gizmo.dragging || e.button !== 0 || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  const r = stage.renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera);
  const hit = ray.intersectObjects(rigView.pickables(), false)[0];
  if (hit) selectFixture(hit.object.userData.fixtureId);
});

// ── show (WAL) + audio ───────────────────────────────────────────────────
function rebuildDecoder() {
  if (!app.wal || !app.rig) { app.decoder = null; bus.emit('decoder', null); return; }
  try { app.decoder = createDecoder(app.wal, app.rig); }
  catch (e) { app.decoder = null; toast(`The decoder couldn't read this rig: ${e.message}`, { kind: 'error', ms: 6000 }); }
  bus.emit('decoder', app.decoder?.report || null);
}

async function setWal(wal, { songId = null, quiet = false } = {}) {
  const v = validateWal(wal);
  if (!v.ok) { toast(`That WAL isn't valid: ${v.errors.slice(0, 2).join('; ')}`, { kind: 'error', ms: 8000 }); return false; }
  if (bench.on) await benchStop(); // a new song ends the test and puts the real rig back
  app.wal = wal; app.songId = songId;
  document.title = `${wal.meta.title} · Musync`;
  rebuildDecoder();
  bus.emit('wal', { wal, songId, title: lib.byId.get(songId)?.title });
  if (app.venue?.kind === 'garba') await ensureVenue('garba'); // dandiya songs bring sticks
  if (!quiet && v.warnings.length) toast(`Loaded with ${v.warnings.length} note${v.warnings.length > 1 ? 's' : ''}: ${v.warnings[0]}`, { kind: 'warn' });
  seek(0);
  return true;
}

const songUrl = (p) => (p.startsWith('/') || p.startsWith('http') ? p : `songs/${p}`);

// The library holds metadata only; a song's WAL is fetched when it is played (a thousand shows never load at once).
let indexToken = 0;
async function loadSongIndex() {
  const token = ++indexToken; // overlapping reloads: only the newest answer may win
  let idx = [];
  try { idx = await (await fetch('songs/index.json')).json(); } catch {}
  // shows made by the AI director on this machine (the backend may not be running)
  try { const made = await (await fetch('/api/library', { signal: AbortSignal.timeout(2000) })).json(); if (Array.isArray(made)) idx = [...made, ...idx]; } catch {}
  if (token !== indexToken) return lib.entries;
  app.songs = idx;
  lib.setEntries(idx);
  bus.emit('songs');
  return lib.entries;
}

const walLru = app.walCache;
async function fetchWal(e) {
  if (walLru.has(e.id)) { const w = walLru.get(e.id); walLru.delete(e.id); walLru.set(e.id, w); return w; }
  const res = await fetch(songUrl(e.wal));
  if (!res.ok) throw new Error(`the show file could not be loaded (${res.status})`);
  const w = await res.json();
  walLru.set(e.id, w);
  while (walLru.size > 12) walLru.delete(walLru.keys().next().value);
  return w;
}

let loadToken = 0;
async function loadSong(id) {
  const e = lib.byId.get(id);
  if (!e) return false;
  if (app.live) stopLive(false);
  const token = ++loadToken; // a newer request (fast clicking Next) wins
  let wal;
  try { wal = await fetchWal(e); } catch (err) {
    // the song was re-made while this page was open (its old id is gone): refresh the list and open the new one
    if (/\(404\)/.test(err.message) && !loadSong.retried) {
      loadSong.retried = true;
      try { await reloadLibrary(); const now = lib.entries.find((x) => x.title === e.title && x.id !== id); if (now) return await loadSong(now.id); } finally { loadSong.retried = false; }
    }
    toast(`Couldn't open “${e.title}”: ${err.message}`, { kind: 'error' }); return false; }
  if (token !== loadToken) return false;
  pause();
  if (e.audio) { app.audio.src = songUrl(e.audio); app.audioName = e.title || e.audio; app.audioBuffer = null; }
  else { app.audio.removeAttribute('src'); toast('This song has no bundled audio. Open the audio file to hear it.', { kind: 'info' }); }
  applyVolume();
  const ok = await setWal(wal, { songId: id });
  if (ok) { lib.markPlayed(id); emitQueue(); prefetchNext(); }
  return ok;
}

// ── queue: Next / Previous follow the list the song was picked from ──
const queueIds = () => (app.queue.ids.length ? app.queue.ids : lib.search({ sort: 'recent' }).map((e) => e.id));
function emitQueue() { const ids = queueIds(); bus.emit('queue', { index: ids.indexOf(app.songId), length: ids.length }); bus.emit('shuffle', app.queue.shuffle); }
function pickNext(dir, auto) {
  const ids = queueIds().filter((x) => lib.byId.has(x));
  if (!ids.length) return null;
  const i = ids.indexOf(app.songId);
  if (app.queue.shuffle && ids.length > 1) {
    const recent = new Set(app.queue.history.slice(-Math.min(5, ids.length - 1)));
    const pool = ids.filter((x) => x !== app.songId && !recent.has(x));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const n = i + dir;
  if (n >= 0 && n < ids.length) return ids[n];
  return auto ? null : ids[(n + ids.length) % ids.length];
}
function prefetchNext() { const id = pickNext(1, true); const e = id && lib.byId.get(id); if (e && !app.queue.shuffle) fetchWal(e).catch(() => {}); }

async function playSong(id, { queue } = {}) {
  if (queue) app.queue.ids = queue;
  else if (!queueIds().includes(id)) app.queue.ids = [];
  if (app.songId && app.songId !== id) app.queue.history.push(app.songId);
  if (await loadSong(id)) play();
}
async function nextSong(auto = false) {
  const id = pickNext(1, auto);
  if (!id) { if (auto) toast('That was the last song in the list.', { kind: 'info', ms: 2400 }); return; }
  await playSong(id);
}
async function prevSong() {
  if (app.clock > 3 || !app.songId) { seek(0); return; }
  if (app.queue.shuffle && app.queue.history.length) { const id = app.queue.history.pop(); if (await loadSong(id)) play(); return; }
  const id = pickNext(-1, false);
  if (id && id !== app.songId) { if (await loadSong(id)) play(); } else seek(0);
}
function songEnded() {
  if (!app.playing) return;
  pause();
  if (recorder.active && recAutoStop) { recAutoStop = false; setTimeout(() => recorder.stop(), 600); }
  if (app.queue.autoNext) nextSong(true);
}

const reloadLibrary = async () => { await loadSongIndex(); emitQueue(); };

async function handleFiles(files) {
  const audio = files.filter((f) => f.type?.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name));
  if (audio.length > 1) { // a batch is an onboarding job, not something to play right now
    libUI.open('add'); libUI.addFiles(audio);
    files = files.filter((f) => !audio.includes(f));
  }
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) {
      try {
        const data = JSON.parse(await file.text());
        if (data.wal) { pause(); await setWal(data); toast(`Loaded the show “${data.meta?.title || file.name}”.`, { kind: 'ok' }); }
        else if (data.fixtures) await importRigFile(file);
        else toast('That JSON isn’t a WAL or a rig.', { kind: 'warn' });
      } catch (err) { toast(`Couldn't read ${file.name}: ${err.message}`, { kind: 'error' }); }
    } else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) {
      await loadAudioFile(file);
    } else toast(`${file.name} isn’t an audio file or a WAL.`, { kind: 'warn' });
  }
}

const sha256 = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function loadAudioFile(file) {
  pause();
  app.audioBuffer = await file.arrayBuffer();
  app.audioName = file.name;
  app.audio.src = URL.createObjectURL(file);
  applyVolume();
  const want = app.wal?.meta.audio?.sha256;
  if (want && crypto.subtle && (await sha256(app.audioBuffer)) === want) { toast(`${file.name} matches this show, so it will play in time.`, { kind: 'ok' }); return; }
  analyze();
}

// The Claude director lives in the Musync backend (server/index.mjs).
const director = {
  async check() {
    try { const r = await fetch('/api/health', { signal: AbortSignal.timeout(2500) }); return r.ok ? await r.json() : null; } catch { return null; }
  },
  async run(form, onEvent, setCancel) {
    const fd = new FormData();
    fd.append('file', new Blob([app.audioBuffer]), app.audioName);
    for (const [k, v] of Object.entries(form)) if (v && String(v).trim()) fd.append(k, v);
    const res = await fetch('/api/jobs', { method: 'POST', body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `The backend refused the upload (${res.status}).`);
    const es = new EventSource(`/api/jobs/${j.id}/events`);
    setCancel(() => { es.close(); fetch(`/api/jobs/${j.id}/cancel`, { method: 'POST' }).catch(() => {}); });
    const report = await new Promise((resolve, reject) => {
      let finished = false;
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.stage === 'error') { finished = true; es.close(); reject(new Error(ev.error)); }
        else if (ev.stage === 'end') { es.close(); if (!finished) reject(new Error('The backend closed the connection before the show was finished.')); }
        else { onEvent(ev); if (ev.stage === 'done' && ev.done) { finished = true; es.close(); resolve(ev.data); } }
      };
      es.onerror = () => { if (es.readyState === EventSource.CLOSED && !finished) reject(new Error('Lost the connection to the backend.')); };
    });
    const wal = await (await fetch(`/api/jobs/${j.id}/wal`)).json();
    await setWal(wal, { quiet: true });
    reloadLibrary();
    return { wal, report };
  },
};

function analyze() {
  if (!app.audioBuffer) { actions.pickAudio(); return; }
  openAnalyze({
    ai: director,
    audioName: app.audioName, hasAudio: true,
    pickAudio: () => actions.pickAudio(),
    play: () => { seek(0); play(); },
    download: () => actions.downloadWal(),
    run: async ({ style, onStage }) => {
      onStage('decode');
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(app.audioBuffer.slice(0));
      ctx.close();
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
      const worker = new Worker(new URL('./analyze-worker.js', import.meta.url), { type: 'module' });
      const title = app.audioName.replace(/\.[^.]+$/, '');
      const hash = crypto.subtle ? await sha256(app.audioBuffer) : undefined;
      const result = await new Promise((resolve, reject) => {
        worker.onmessage = (m) => {
          if (m.data.type === 'progress') onStage(m.data.stage);
          if (m.data.type === 'done') resolve(m.data);
          if (m.data.type === 'error') reject(new Error(m.data.message));
        };
        worker.onerror = (e) => reject(new Error(e.message || 'The analysis worker crashed.'));
        worker.postMessage({ samples: mono, sr: buf.sampleRate, opts: { title, styles: [style], audio: { file: app.audioName, sha256: hash, duration: buf.duration } } }, [mono.buffer]);
      });
      worker.terminate();
      onStage('done');
      await setWal(result.wal, { quiet: true });
      return result;
    },
  });
}

// ── live mode: listen to a browser tab or the microphone and play what is heard ──
let liveBuiltAt = 0, livePan = new Map();
function liveRebuild(force = false) {
  const L = app.live;
  if (!L) return;
  const t = L.now();
  if (!force && t - liveBuiltAt < 0.45) return;
  liveBuiltAt = t;
  const wal = L.tracker.wal(t);
  app.wal = wal;
  app.decoder = createDecoder(wal, app.rig, { prevPan: livePan });
}
async function goLive(kind, style = 'bollywood') {
  if (app.live) stopLive(false);
  pause();
  let session;
  try { session = await startLive(kind, { style, sensitivity: app.liveSensitivity ?? 1, onEnded: () => { if (app.live) stopLive(true); } }); }
  catch (e) {
    const msg = LIVE_ERRORS[e.name] || e.message || 'Live mode could not start.';
    toast(msg, { kind: 'error', ms: 7000 });
    return false;
  }
  app.live = session; app.songId = null; app.audio.removeAttribute('src');
  livePan = new Map();
  app.clock = 0; app.playing = true;
  liveRebuild(true);
  document.body.classList.add('live');
  document.title = `Live · ${session.label} · Musync`;
  bus.emit('wal', { wal: app.wal, songId: null, title: `Live · ${session.label}` });
  bus.emit('playing', true);
  bus.emit('live', { on: true, kind, label: session.label });
  toast(kind === 'tab' ? 'Listening to the tab. The lights follow it live.' : 'Listening through the microphone. Play your music near this computer.', { kind: 'ok', ms: 3500 });
  return true;
}
function stopLive(notify = true) {
  const L = app.live;
  if (!L) return;
  app.live = null;
  L.stop();
  document.body.classList.remove('live');
  app.playing = false; app.clock = 0;
  bus.emit('playing', false);
  bus.emit('live', { on: false });
  const id = lib.lastId() || lib.entries[0]?.id;
  if (id) loadSong(id);
  if (notify) toast('Live mode stopped.', { kind: 'info', ms: 2200 });
}

// ── transport ────────────────────────────────────────────────────────────
function applyVolume() { app.audio.volume = app.muted ? 0 : app.volume; bus.emit('volume', { v: app.volume, muted: app.muted }); }
function play() {
  if (!app.wal) { toast('Open a song first.', { kind: 'info' }); return; }
  if (app.clock >= app.wal.meta.duration - 0.2) seek(0);
  app.playing = true;
  document.querySelector('.hint')?.remove();
  if (app.audio.src) { app.audio.currentTime = app.clock; app.audio.play().catch(() => toast('The browser blocked audio. Press play again.', { kind: 'warn' })); }
  bus.emit('playing', true);
}
function pause() { app.playing = false; app.audio.pause(); bus.emit('playing', false); }
function seek(t) {
  if (app.live) return;
  app.clock = Math.max(0, Math.min(app.wal?.meta.duration ?? t, t));
  if (app.audio.src) app.audio.currentTime = app.clock;
}
app.audio.onended = () => songEnded();

// ── adaptive resolution ──────────────────────────────────────────────────
// Frames dropping is what makes motion feel shaky, so trade sharpness for smoothness instead:
// measure fps over one-second windows, step the render scale down fast and back up slowly.
const dprMax = Math.min(window.devicePixelRatio || 1, 2);
const drs = { scale: Math.min(1.25, dprMax), min: 0.5, max: dprMax, ceil: dprMax, frames: 0, since: performance.now(), low: 0, high: 0, fps: 60, sum: 0, sumsq: 0, prev: 0 };
const FIXED = { high: dprMax, balanced: 1, low: 0.7 };
function applyScale(pr) { drs.scale = pr; stage.setPixelRatio(pr); }
function setQuality(mode) {
  app.quality = mode;
  try { localStorage.setItem(QUALITY_KEY, mode); } catch {}
  if (mode !== 'auto') applyScale(Math.min(FIXED[mode], dprMax)); else { drs.ceil = dprMax; drs.low = drs.high = 0; }
}
function drsTick(now) {
  drs.frames++;
  if (drs.prev) { const d = now - drs.prev; drs.sum += d; drs.sumsq += d * d; }
  drs.prev = now;
  const span = now - drs.since;
  if (span < 1000) return;
  drs.fps = (drs.frames * 1000) / span;
  // A display or power-saver that caps refresh (e.g. a steady 30 Hz) delivers frames at perfectly even intervals.
  // A GPU that cannot keep up does not: its frame times wobble. Only the second case calls for fewer pixels.
  const mean = drs.sum / Math.max(1, drs.frames - 1), sd = Math.sqrt(Math.max(0, drs.sumsq / Math.max(1, drs.frames - 1) - mean * mean));
  const capped = sd < 2 && (Math.abs(mean - 33.3) < 3 || Math.abs(mean - 41.7) < 3 || Math.abs(mean - 50) < 3);
  drs.frames = 0; drs.since = now; drs.sum = 0; drs.sumsq = 0;
  if (app.quality === 'auto' && !document.hidden && !capped) {
    if (drs.fps < 46) { drs.low++; drs.high = 0; } else if (drs.fps > 57) { drs.high++; drs.low = 0; } else { drs.low = drs.high = 0; }
    if (drs.low >= 2 && drs.scale > drs.min) { drs.ceil = Math.max(drs.min, drs.scale * 0.97); applyScale(Math.max(drs.min, +(drs.scale * 0.85).toFixed(3))); drs.low = 0; }
    else if (drs.high >= 5 && drs.scale < Math.min(drs.max, drs.ceil)) { applyScale(Math.min(drs.max, drs.ceil, +(drs.scale * 1.08).toFixed(3))); drs.high = 0; drs.ceil = Math.min(drs.max, drs.ceil * 1.03); }
  }
  bus.emit('perf', { fps: drs.fps, scale: drs.scale, ms: perf.cpuMs + perf.renderMs, show: app.showPerf });
}

// ── actions for the interface ────────────────────────────────────────────
const actions = {
  play, pause, toggle: () => (app.live ? stopLive(true) : app.playing ? pause() : play()), seek,
  goLive, stopLive, live: () => app.live,
  setSensitivity(k) { app.liveSensitivity = k; app.live?.setSensitivity?.(k); },
  seekBy: (d) => seek(app.clock + d),
  setCamera: (mode) => { app.camera = mode; camRig.setMode(mode); bus.emit('camera', { mode }); },
  toggleHaze() { app.haze = !app.haze; rigView.haze = app.haze ? 1 : 0.06; bus.emit('haze', app.haze); },
  fullscreen: toggleFullscreen,
  toggleDrawer: (n) => drawers.toggle(n),
  toggleRecord,
  help: openHelp,
  loadSong, playSong, nextSong: () => nextSong(false), prevSong, analyze, reloadLibrary,
  openLibrary: (view) => libUI.open(view || 'songs'),
  toggleShuffle() { app.queue.shuffle = !app.queue.shuffle; try { localStorage.setItem('musync.shuffle', app.queue.shuffle ? '1' : '0'); } catch {} bus.emit('shuffle', app.queue.shuffle); toast(app.queue.shuffle ? 'Shuffle on' : 'Shuffle off', { kind: 'info', ms: 1200 }); },
  setAutoNext(on) { app.queue.autoNext = on; try { localStorage.setItem('musync.autoNext', on ? '1' : '0'); } catch {} },
  openWal: () => $('#walFile').click(),
  pickAudio: () => $('#audioFile').click(),
  pickWal: () => $('#walFile').click(),
  downloadWal() { if (!app.wal) return toast('No show is loaded.', { kind: 'info' }); download(JSON.stringify(app.wal, null, 1), `${(app.wal.meta.title || 'song').replace(/[^\w-]+/g, '_')}.wal.json`); },
  look: { get: () => ({ ...app.look }), set: setLook, reset: () => setLook({ ...LOOK_DEFAULT }), defaults: LOOK_DEFAULT },
  setQuality,
  togglePerf() { app.showPerf = !app.showPerf; bus.emit('perf', { fps: drs.fps, scale: drs.scale, ms: perf.cpuMs + perf.renderMs, show: app.showPerf }); },
  setVolume(v) { app.volume = v; app.muted = false; try { localStorage.setItem(VOL_KEY, String(v)); } catch {} applyVolume(); },
  toggleMute() { app.muted = !app.muted; applyVolume(); },
  plan: { apply: applyPlan },
  bench: { start: benchStart, pick: benchPick, palette: benchPalette, stop: benchStop, state: benchState },
  rig: { load: loadRigPreset, exportRig, importRig: () => $('#rigFile').click(), add: addFixture, select: selectFixture, remove: deleteSelected, duplicate: () => cloneSelected(false), mirror: () => cloneSelected(true), patch: patchFixture },
};

const getState = () => ({
  songs: app.songs, songId: app.songId, playing: app.playing, autoNext: app.queue.autoNext, shuffle: app.queue.shuffle, hasAudio: !!app.audioBuffer, audioName: app.audioName,
  camera: app.camera, haze: app.haze, quality: app.quality, showPerf: app.showPerf, rig: app.rig, selected: app.selected, presetId: app.presetId,
  presets: [...app.presets, ...(savedRig() ? [{ id: 'custom', name: 'My rig', count: savedRig().fixtures.length }] : [])],
});

const chrome = initChrome({ actions, getState });
const drawers = initDrawers({ actions, getState });
initPlanner({ actions, getState, drawers });
const onb = createOnboarder({ onChange: () => libUI.renderAdd(), onSongsChanged: async (n, items = []) => { for (const it of items) if (it.replaces && lib.isFav(it.replaces) && it.jobId && !lib.isFav(it.jobId)) lib.toggleFav(it.jobId); await reloadLibrary(); toast(`${n} new show${n > 1 ? 's' : ''} ready in your library.`, { kind: 'ok' }); } });
const libUI = initLibrary({ lib, onb, actions, getState });

// hidden file inputs
const fileInput = (id, accept, handler) => {
  const i = el('input', { type: 'file', id, accept, hidden: true, onchange: async (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) await handler(f); } });
  document.body.append(i);
};
fileInput('audioFile', 'audio/*', (f) => loadAudioFile(f[0]));
fileInput('walFile', '.json,application/json', handleFiles);
fileInput('rigFile', '.json,application/json', (f) => importRigFile(f[0]));
initDropzone(handleFiles);
initIdleFade(() => app.playing, () => drawers.isOpen('rig') || drawers.isOpen('show') || !!document.querySelector('.popover, .backdrop'));

// ── keyboard ─────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); libUI.open('songs'); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName);
  if (typing || document.querySelector('.backdrop.on')) return;
  const onControl = !!t.closest?.('button, [role="tab"], [role="option"], [role="slider"]');
  const walking = camRig.mode === 'walk' && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
  if (e.code === 'Space') { e.preventDefault(); actions.toggle(); return; } // Space is always play/pause; Enter activates a focused button
  if (e.code === 'ArrowRight' && !onControl) { actions.seekBy(e.shiftKey ? 15 : 5); return; }
  if (e.code === 'ArrowLeft' && !onControl) { actions.seekBy(e.shiftKey ? -15 : -5); return; }
  if (KEY_CAMERA[e.code]) { actions.setCamera(KEY_CAMERA[e.code]); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelected(); return; }
  if (e.code === 'Escape') { if (app.selected) selectFixture(null); else if (document.body.classList.contains('cinema')) document.body.classList.remove('cinema'); else for (const n of ['rig', 'show']) drawers.close(n); return; }
  if (e.key === '?') { openHelp(); return; }
  if (e.key === '/' && !typing) { e.preventDefault(); libUI.open('songs'); return; }
  if (e.key === '[' || e.key === ']') { const w = app.look.beamWidth * (e.key === ']' ? 1.18 : 1 / 1.18); setLook({ beamWidth: Math.round(w * 100) / 100 }); toast(`Beam thickness ${app.look.beamWidth.toFixed(1)}×`, { kind: 'info', ms: 1200 }); return; }
  if (e.code === 'KeyE' && e.shiftKey && !e.ctrlKey && !e.metaKey && !onControl) { toggleRecord(true); return; }
  if (walking || e.shiftKey) return;
  switch (e.code) {
    case 'KeyC': { const i = CAMERA_CYCLE.indexOf(app.camera); actions.setCamera(CAMERA_CYCLE[(i + 1) % CAMERA_CYCLE.length]); break; }
    case 'KeyJ': actions.setCamera('crane'); break;
    case 'KeyE': toggleRecord(e.shiftKey); break;
    case 'KeyH': actions.toggleHaze(); break;
    case 'KeyF': toggleFullscreen(); break;
    case 'KeyM': actions.toggleMute(); break;
    case 'KeyD': drawers.toggle('ai'); break;
    case 'KeyR': drawers.toggle('rig'); break;
    case 'KeyS': drawers.toggle('show'); break;
    case 'KeyU': document.body.classList.toggle('cinema'); break;
    case 'KeyV': actions.openLook?.(); break;
    case 'KeyL': e.preventDefault(); libUI.toggle(); break; // preventDefault: the letter must not land in the search box that opens
    case 'KeyA': e.preventDefault(); libUI.open('add'); break;
    case 'KeyO': actions.openLive?.(); break;
    case 'KeyN': nextSong(false); break;
    case 'KeyB': prevSong(); break;
    case 'KeyZ': actions.toggleShuffle(); break;
    case 'KeyP': actions.togglePerf(); break;
  }
});

// ── frame loop ───────────────────────────────────────────────────────────
let last = performance.now(), slowAt = 0;
const idle = {};
const perf = { frameMs: 16.7, cpuMs: 0, renderMs: 0, last: 0 };
function loop(now) {
  const t0 = performance.now();
  try { if (!app.hold) frame(now); } catch (e) { app.lastError = `${e.message}\n${e.stack}`; console.error(e); }
  perf.cpuMs += (performance.now() - t0 - perf.cpuMs) * 0.1;
  if (perf.last) perf.frameMs += (now - perf.last - perf.frameMs) * 0.1;
  perf.last = now;
  drsTick(now);
  requestAnimationFrame(loop);
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.live) { app.clock = app.live.now(); if (app.live.tick()) liveRebuild(true); else liveRebuild(); }
  else if (app.playing) {
    if (app.audio.src && !app.audio.paused) app.clock = app.audio.currentTime;
    else app.clock += dt;
    if (app.wal && app.clock >= app.wal.meta.duration) songEnded();
  }
  app.frames++;
  const t = app.clock;
  const states = app.decoder ? app.decoder.frame(t) : idle;
  rigView.update(states, dt);
  const sec = app.decoder?.sectionAt(t);
  const tb = app.decoder?.timebase;
  const target = tb ? tb.envelope('energy', t) * 0.55 + (sec?.energy ?? 0.5) * 0.45 : 0.5;
  app.energy += (target - app.energy) * Math.min(1, dt * 5);
  const silence = !!app.wal?.accents?.some((a) => a.type === 'silence' && t >= a.t && t < a.t + (a.dur ?? 0.3));
  const palHex = app.wal?.palettes?.[sec?.palette] || ['#ff7a00', '#ff1f5a', '#ffd23f', '#00c2a8'];
  const slow = ['verse', 'break', 'intro', 'outro', 'aalap', 'bridge', 'interlude'].includes(sec?.kind);
  const bp = tb ? tb.beatPos(t) : t * 2;
  if (app.venue) {
    app.venue.update({
      t, bp, energy: app.energy, bpm: app.wal?.meta.bpm || 120, silence,
      phones: false, // nobody holds lights up: the beams are the only light that matters
      kind: sec?.kind || 'verse', pal: palHex.map(hexToRgb),
      title: app.wal?.meta.title, artist: app.wal?.meta.artist,
      low: tb ? tb.envelope('low', t) : 0.5, mid: tb ? tb.envelope('mid', t) : 0.5, high: tb ? tb.envelope('high', t) : 0.5,
    });
    const A = app.venue.atmos;
    rigView.venueHaze = A.beamHaze || 1;
    setHaze({ base: A.fogBase, density: A.density * app.look.haze * (rigView.haze > 0.5 ? 1 : 0.15), tint: rigView.tint, amount: A.tintGain * rigView.level * (rigView.haze > 0.5 ? 1 : 0.2) });
  }
  effects.update(dt, app.decoder?.effects(t) || [], { t, tint: rigView.tint, level: rigView.level, pal: palHex.map(hexToRgb) });
  camRig.update(dt, { kind: sec?.kind, t });
  const r0 = performance.now();
  stage.composer.render();
  perf.renderMs += (performance.now() - r0 - perf.renderMs) * 0.1;

  const meter = app.wal?.meta.meter || 4, beatInt = Math.floor(Math.max(0, bp));
  const bar = `${Math.floor(Math.max(0, bp) / meter) + 1}.${(beatInt % meter) + 1}`;
  chrome.tick({ t, section: sec, bar, bpm: Math.round(app.wal?.meta.bpm || 0), beatIdx: beatInt, playing: app.playing, live: app.live ? { ...app.live.tracker.status(), recent: app.live.tracker.recent(20, 100), label: app.live.label } : null });
  if (now - slowAt > 160) {
    slowAt = now;
    drawers.tick({ section: sec, sectionEnergy: sec?.energy, bar, layers: app.decoder?.describe(t), palettes: app.wal?.palettes });
  }
}

// test hooks
window.__musync = {
  loadSong, recorder, exportVideo, perf, app, stage, rigView, effects, lib, onb, libUI, createDecoder, seek, goLive, stopLive, play, pause, setWal, loadRigPreset, camRig, actions, drawers,
  setView: (m) => actions.setCamera(m),
  shot: (m, u) => { camRig.setMode(m); setTimeout(() => (camRig.u = u), 220); },
  frameAt: (t) => { app.clock = t; },
  // deterministic capture: hold the live loop, then advance the show a fixed time per frame so stills and clips
  // are identical on every run whatever the machine's speed (scripts/capture.mjs drives these)
  capture: {
    hold(on) { app.hold = !!on; last = performance.now(); if (on) { app.playing = true; app.audio.pause(); } },
    step(sec, fps = 30) { const n = Math.max(1, Math.round(sec * fps)); for (let i = 0; i < n; i++) frame(last + 1000 / fps); return app.clock; },
    seek,
  },
};

// ── boot ─────────────────────────────────────────────────────────────────
loader.set('Loading rigs…', 0.25);
app.presets = (await Promise.all(RIG_PRESETS.map(async ([id, name]) => {
  try { const r = await (await fetch(`rigs/${id}.json`)).json(); return { id, name, count: r.fixtures.length }; } catch { return null; }
}))).filter(Boolean);
loader.set('Building the venue and placing the crowd…', 0.5);
await nextFrame();
await loadRigPreset('concert');
loader.set('Loading songs…', 0.75);
const idx = await loadSongIndex();
bus.emit('presets');
bus.emit('haze', true);
applyVolume();
if (idx.length) await loadSong(lib.lastId() || idx[0].id);
loader.set('Starting the show…', 0.95);
requestAnimationFrame(loop);
actions.setCamera('director');
await new Promise((r) => { const w = () => (app.frames > 6 ? r() : requestAnimationFrame(w)); w(); });
loader.set('Ready', 1);
loader.hide();
{
  const touch = matchMedia('(pointer: coarse)').matches;
  const hint = el('div', { class: 'hint glass' }, ...(touch
    ? [el('span', { html: icon('play', 14) }), el('span', { text: 'Tap play to start the show' })]
    : [el('span', { class: 'kbd', text: 'Space' }), el('span', { text: 'starts the show.' }), el('span', { class: 'kbd', text: '?' }), el('span', { text: 'lists every shortcut.' })]));
  $('#ui').append(hint);
  setTimeout(() => hint.remove(), 12000);
  let seen = false; try { seen = localStorage.getItem('musync.welcomed') === '1'; } catch {}
  if (!seen) {
    const done = () => { try { localStorage.setItem('musync.welcomed', '1'); } catch {} card.remove(); };
    const card = el('aside', { class: 'welcome glass', role: 'complementary', 'aria-label': 'Getting started' },
      el('div', {}, el('b', { text: 'Welcome to Musync' }), el('p', { class: 'muted', text: 'Browse the library, or add your own songs and let the director turn each one into a light show.' })),
      el('div', { class: 'row' },
        el('button', { class: 'btn', html: `${icon('library', 16)}<span>Browse songs</span>`, onclick: () => { done(); libUI.open('songs'); } }),
        el('button', { class: 'btn primary', html: `${icon('plus', 16)}<span>Add songs</span>`, onclick: () => { done(); libUI.open('add'); } })),
      el('button', { class: 'btn icon ghost sm', 'aria-label': 'Dismiss', html: icon('close', 14), onclick: done }));
    $('#ui').append(card);
  }
}
