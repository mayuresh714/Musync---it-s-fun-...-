// Screen-level effects: boot loader, dip-to-black camera cuts, file drop zone, idle chrome fade.
import { icon, MARK } from './icons.js';
import { $, el, bus } from './kit.js';

export const loader = {
  node: null,
  init() {
    this.node = $('#loader');
    this.node.innerHTML = `<div class="ld"><div class="beams">${MARK}</div><h1>Musync</h1><p id="ldText">Warming up the rig…</p><div class="bar"><i id="ldBar"></i></div></div>`;
  },
  set(text, p) {
    const t = $('#ldText'); if (t) t.textContent = text;
    if (p != null) $('#ldBar')?.style.setProperty('--v', String(p));
  },
  hide() { this.node?.classList.add('done'); setTimeout(() => this.node?.remove(), 900); },
};

// Dip to black for a beat, swap the shot underneath, then lift. Hides the pop of a hard cut and
// of rebuilding a venue.
export const cut = {
  node: null,
  init() { this.node = $('#cut'); },
  down() { const n = this.node; n.classList.remove('lift'); n.classList.add('dark'); return new Promise((r) => setTimeout(r, 140)); },
  up() { const n = this.node; n.classList.add('lift'); n.classList.remove('dark'); },
};

export function initDropzone(onFiles) {
  const dz = $('#dropzone');
  dz.innerHTML = `<div class="box">${icon('upload', 40)}<b>Drop an audio file or a WAL</b><span class="muted">.mp3 .wav .m4a to analyze · .wal.json to play</span></div>`;
  let depth = 0;
  const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!has(e)) return; depth++; dz.classList.add('on'); });
  window.addEventListener('dragleave', (e) => { if (!has(e)) return; if (--depth <= 0) { depth = 0; dz.classList.remove('on'); } });
  window.addEventListener('dragover', (e) => { if (has(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (!has(e)) return; e.preventDefault(); depth = 0; dz.classList.remove('on'); onFiles([...e.dataTransfer.files]); });
}

// Fade the chrome out after a few idle seconds of playback, so the show gets the whole frame.
export function initIdleFade(isPlaying, isBusy) {
  let timer;
  const wake = () => {
    document.body.classList.remove('ui-idle');
    clearTimeout(timer);
    timer = setTimeout(() => { if (isPlaying() && !isBusy()) document.body.classList.add('ui-idle'); }, 3800);
  };
  for (const evt of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(evt, wake, { passive: true });
  bus.on('playing', wake);
  wake();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
