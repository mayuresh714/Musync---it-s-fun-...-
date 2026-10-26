// Timeline: sections (by kind), energy curve, accents, bar ticks, playhead.
// The static layer is rendered once into an offscreen canvas (on load/resize); each frame only
// blits it and draws the playhead and hover line, so scrubbing and playback stay cheap and steady.
import { fmtTime } from './kit.js';

export const KIND_COLORS = {
  intro: '#4a6fa5', aalap: '#5a5fae', verse: '#3b8577', prechorus: '#a38a3f', chorus: '#9a5ab5', build: '#c9803a',
  drop: '#d04a58', break: '#3f7896', bridge: '#6a6aa8', solo: '#a3a345', interlude: '#4a8080', outro: '#44588a',
};
const ACCENT = { drop: '#ff6b7a', hit: '#ffffff', silence: '#98a0b4', riser: '#ffcb6b', cue: '#6ab7ff' };

export class Timeline {
  constructor(canvas, tipEl, { onSeek, onHover, slim = false } = {}) {
    this.slim = slim; this.dragging = false;
    this.canvas = canvas;
    this.tip = tipEl;
    this.ctx = canvas.getContext('2d');
    this.cache = document.createElement('canvas');
    this.wal = null;
    this.t = 0;
    this.hover = null;
    this.onSeek = onSeek;
    this.size = [0, 0];
    this.dirty = true;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', 'Song position');
        const pos = (e) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.draw(); canvas.setPointerCapture(e.pointerId); this.seekFrac(pos(e)); });
    canvas.addEventListener('pointermove', (e) => { this.setHover(pos(e)); if (this.dragging) this.seekFrac(pos(e)); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; this.draw(); });
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    canvas.addEventListener('keydown', (e) => {
      if (!this.wal) return;
      const step = e.shiftKey ? 15 : 5;
      if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onSeek?.(Math.min(this.wal.meta.duration, this.t + step)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onSeek?.(Math.max(0, this.t - step)); }
    });
    new ResizeObserver(() => { this.dirty = true; this.draw(); }).observe(canvas);
  }

  seekFrac(f) { if (this.wal) this.onSeek?.(f * this.wal.meta.duration); }

  setHover(f) {
    this.hover = f;
    if (f == null || !this.wal) { this.tip.classList.remove('on'); return; }
    const t = f * this.wal.meta.duration;
    const sec = this.wal.sections.find((s) => t >= s.start && t < s.end);
    this.tip.innerHTML = `<b>${fmtTime(t)}</b>${sec ? (sec.label || sec.kind) : ''}`;
    this.tip.style.left = `${Math.max(40, Math.min(this.canvas.clientWidth - 40, f * this.canvas.clientWidth))}px`;
    this.tip.classList.add('on');
    this.draw();
  }

  setWal(wal) { this.wal = wal; this.dirty = true; this.draw(); }
  setTime(t) {
    if (t === this.t) return;
    this.t = t;
    this.canvas.setAttribute('aria-valuenow', String(Math.round(t)));
    this.canvas.setAttribute('aria-valuemax', String(Math.round(this.wal?.meta.duration || 0)));
    this.canvas.setAttribute('aria-valuetext', fmtTime(t));
    this.draw();
  }

  renderStatic(W, H, dpr) {
    const c = this.cache;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const wal = this.wal;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(g, 0, 0, W, H, 12); g.fill();
    if (!wal) return;
    const dur = wal.meta.duration, x = (t) => (t / dur) * W;
    g.save();
    roundRect(g, 0, 0, W, H, 12); g.clip();
    const secH = 20;
    for (const s of wal.sections) {
      const x0 = x(s.start), w = Math.max(2, x(s.end) - x0);
      const col = KIND_COLORS[s.kind] || '#555';
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, hexA(col, 0.95)); grad.addColorStop(1, hexA(col, 0.14));
      g.fillStyle = grad;
      g.fillRect(x0 + 1, 0, w - 1, H);
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.font = '600 10.5px Inter, system-ui, sans-serif';
      g.textBaseline = 'middle';
      const label = (s.label || s.kind).toUpperCase();
      if (w > 14 + label.length * 6.4) g.fillText(label, x0 + 8, secH / 2 + 1);
    }
    // energy curve
    const env = wal.envelopes;
    const base = H - 6, top = secH + 6, h = base - top;
    if (env?.energy) {
      const path = (arr) => {
        g.beginPath(); g.moveTo(0, base);
        const step = Math.max(1, Math.floor(arr.length / W));
        for (let i = 0; i < arr.length; i += step) g.lineTo((i / env.rate / dur) * W, base - (arr[i] / 100) * h);
        g.lineTo(W, base);
      };
      path(env.energy); g.fillStyle = 'rgba(8,10,16,0.55)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke();
      if (env.low) { path(env.low); g.strokeStyle = 'rgba(255,180,84,0.8)'; g.lineWidth = 1; g.stroke(); }
    }
    // accents
    for (const a of wal.accents || []) {
      g.fillStyle = ACCENT[a.type] || '#fff';
      if (a.dur && a.type !== 'hit') { g.globalAlpha = a.type === 'riser' ? 0.2 : 0.3; g.fillRect(x(a.t), top, Math.max(2, x(a.t + a.dur) - x(a.t)), h); g.globalAlpha = 1; }
      if (a.type === 'drop') g.fillRect(x(a.t) - 0.5, secH, 1.5, H - secH);
      else g.fillRect(x(a.t) - 0.5, H - 8, 1.5, 6);
    }
    g.fillStyle = 'rgba(255,255,255,0.14)';
    for (const d of wal.timing.downbeats || []) g.fillRect(x(d), H - 3, 1, 3);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, W - 1, H - 1, 12); g.stroke();
  }

  // The player's progress line: one thin bar along the top of the bar, played part in amber, sections as quiet segments.
  drawSlim() {
    const c = this.canvas, g = this.ctx, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const dur = this.wal?.meta.duration || 0;
    const big = this.hover != null || this.dragging || document.activeElement === c;
    const bh = big ? 6 : 3, y = Math.round((H - bh) / 2);
    const px = dur ? (this.t / dur) * W : 0, hx = this.hover != null ? this.hover * W : 0;
    const segs = dur ? this.wal.sections.map((s) => [(s.start / dur) * W, (s.end / dur) * W]) : [[0, W]];
    for (const [x0, x1] of segs) {
      const a = x0 + 1, b = Math.max(a + 2, x1 - 1);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(a, y, b - a, bh);
      if (hx > a) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(a, y, Math.min(b, hx) - a, bh); }
      if (px > a) { g.fillStyle = '#ffb454'; g.fillRect(a, y, Math.min(b, px) - a, bh); }
    }
    if (big && dur) { g.save(); g.shadowColor = 'rgba(255,180,84,0.8)'; g.shadowBlur = 8; g.fillStyle = '#ffd08a'; g.beginPath(); g.arc(Math.max(6, Math.min(W - 6, px)), H / 2, 6.5, 0, Math.PI * 2); g.fill(); g.restore(); }
  }

  draw() {
    if (this.slim) return this.drawSlim();
    const c = this.canvas, g = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); this.dirty = true; }
    if (this.dirty) { this.renderStatic(W, H, dpr); this.dirty = false; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.cache, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dur = this.wal?.meta.duration;
    if (!dur) return;
    const px = (this.t / dur) * W;
    // played region tint
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, 0, px, H);
    if (this.hover != null) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(this.hover * W - 0.5, 0, 1, H); }
    g.save();
    g.shadowColor = 'rgba(255,180,84,0.9)'; g.shadowBlur = 10;
    g.fillStyle = '#ffb454'; g.fillRect(px - 1, 0, 2, H);
    g.beginPath(); g.arc(px, H - 1, 4.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
