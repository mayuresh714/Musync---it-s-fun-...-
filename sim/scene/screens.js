// LED screen content. A real wall plays video; here it plays generative visuals that follow
// the music and the section palette. Rules learned the hard way: never dead-black pixels, and
// never hard-cut between looks (a new look is held at least MIN_HOLD seconds, then cross-faded).
import * as THREE from 'three';

const MIN_HOLD = 5;
const FADE = 0.8;
const MODE_BY_KIND = { intro: 'rings', aalap: 'plasma', verse: 'plasma', prechorus: 'bars', chorus: 'sunburst', build: 'bars', drop: 'sunburst', break: 'plasma', bridge: 'rings', solo: 'rings', interlude: 'plasma', outro: 'title' };

const fr = (x) => ((x % 1) + 1) % 1; // beat position is negative before the first beat
const rgb = (c, k = 1) => `rgb(${Math.min(255, Math.round(c[0] * 255 * k))},${Math.min(255, Math.round(c[1] * 255 * k))},${Math.min(255, Math.round(c[2] * 255 * k))})`;

const DRAW = {
  plasma(ctx, w, h, s) {
    const lw = 64, lh = Math.max(8, Math.round((64 * h) / w));
    const img = ctx.createImageData(lw, lh);
    const t = s.t * 0.35, k = 0.4 + 0.9 * s.energy;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const u = x / lw, v = y / lh;
      const val = 0.5 + 0.25 * Math.sin(u * 7 + t * 2) + 0.25 * Math.sin(v * 6 - t * 1.6) + 0.2 * Math.sin((u + v) * 5 + t) + 0.15 * Math.sin(Math.hypot(u - 0.5, v - 0.5) * 12 - s.bp * 0.5);
      const n = s.pal.length, pi = (((val * (n - 0.001) + t * 0.3) % n) + n) % n; // val dips below 0, so wrap both ways
      const c0 = s.pal[Math.floor(pi)], c1 = s.pal[(Math.floor(pi) + 1) % s.pal.length], f = pi - Math.floor(pi);
      const br = 0.18 + 0.7 * k * Math.max(0, Math.min(1, val));
      const i = (y * lw + x) * 4;
      img.data[i] = 255 * br * (c0[0] * (1 - f) + c1[0] * f);
      img.data[i + 1] = 255 * br * (c0[1] * (1 - f) + c1[1] * f);
      img.data[i + 2] = 255 * br * (c0[2] * (1 - f) + c1[2] * f);
      img.data[i + 3] = 255;
    }
    const tmp = DRAW._tmp || (DRAW._tmp = document.createElement('canvas'));
    tmp.width = lw; tmp.height = lh;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, w, h);
  },
  bars(ctx, w, h, s) {
    ctx.fillStyle = rgb(s.pal[0], 0.14);
    ctx.fillRect(0, 0, w, h);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const band = i < n * 0.3 ? s.low : i < n * 0.7 ? s.mid : s.high;
      const jitter = 0.5 + 0.5 * Math.sin(i * 1.7 + s.t * 5 + s.bp);
      const bh = h * Math.min(0.98, 0.1 + 0.8 * band * (0.45 + 0.55 * jitter));
      ctx.fillStyle = rgb(s.pal[i % s.pal.length], 0.7);
      ctx.fillRect((i * w) / n + 2, h - bh, w / n - 4, bh);
    }
  },
  rings(ctx, w, h, s) {
    ctx.fillStyle = rgb(s.pal[0], 0.16);
    ctx.fillRect(0, 0, w, h);
    const f = fr(s.bp);
    for (let i = 0; i < 7; i++) {
      const r = ((i + f) / 7) * Math.hypot(w, h) * 0.55;
      ctx.strokeStyle = rgb(s.pal[i % s.pal.length], 0.9 - i * 0.08);
      ctx.lineWidth = h * 0.05 * (0.6 + s.energy);
      ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  sunburst(ctx, w, h, s) {
    ctx.fillStyle = rgb(s.pal[1 % s.pal.length], 0.2);
    ctx.fillRect(0, 0, w, h);
    const n = 16, rot = s.t * 0.25;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rgb(s.pal[i % s.pal.length], i % 2 ? 0.4 : 0.7);
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.arc(w / 2, h / 2, Math.hypot(w, h), a0, a1); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * (0.35 + 0.05 * (1 - fr(s.bp))));
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  },
  title(ctx, w, h, s) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, rgb(s.pal[0], 0.5)); g.addColorStop(1, rgb(s.pal[1 % s.pal.length], 0.5));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${Math.round(h * 0.16)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.title || '', w / 2, h * 0.46, w * 0.9);
    ctx.font = `400 ${Math.round(h * 0.08)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(s.artist || '', w / 2, h * 0.64, w * 0.9);
  },
};

export class LedScreen {
  constructor(w, h, { res = 320 } = {}) {
    this.size = [w, h];
    this.res = [res, Math.round((res * h) / w)];
    const mk = () => { const c = document.createElement('canvas'); c.width = this.res[0]; c.height = this.res[1]; return c; };
    this.canvas = mk(); this.cur = mk(); this.prev = mk();
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, color: new THREE.Color(0.5, 0.5, 0.5) });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mode = 'plasma'; this.prevMode = null; this.modeSince = -99; this.fadeStart = -99;
    this.frame = 0;
    this.lastSong = null;
  }

  // 0..1 from the Look panel; 0.5 reads like a video wall seen from the crowd rather than a lamp
  setLevel(l) { this.material.color.setScalar(0.08 + 1.2 * l * l); }

  update(s) {
    if (this.frame++ % 2) return; // 30 fps content is plenty for a wall
    const want = MODE_BY_KIND[s.kind] || 'plasma';
    if (want !== this.mode && Math.abs(s.t - this.modeSince) > MIN_HOLD) {
      this.prevMode = this.mode; this.mode = want; this.modeSince = s.t; this.fadeStart = s.t;
    } else if (s.t < this.modeSince - 0.1) this.modeSince = s.t - MIN_HOLD; // seeked backwards
    const [w, h] = this.res;
    DRAW[this.mode](this.cur.getContext('2d'), w, h, s);
    const ctx = this.ctx;
    const fade = this.prevMode ? Math.max(0, Math.min(1, (s.t - this.fadeStart) / FADE)) : 1;
    if (fade < 1) {
      DRAW[this.prevMode](this.prev.getContext('2d'), w, h, s);
      ctx.globalAlpha = 1; ctx.drawImage(this.prev, 0, 0);
      ctx.globalAlpha = fade; ctx.drawImage(this.cur, 0, 0);
      ctx.globalAlpha = 1;
    } else { ctx.globalAlpha = 1; ctx.drawImage(this.cur, 0, 0); this.prevMode = null; }
    this.texture.needsUpdate = true;
  }
}
