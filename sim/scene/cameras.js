// Camera shots. Venue-specific numbers come from venue.info; shot shapes follow standard drone
// moves (orbit, reveal = rise and tilt, fly-over, top-down, pull-back) and ground positions
// (FOH, crowd eye level, pit, stage POV). Director mode cuts between them on the downbeat,
// leaning on the music: reveals on builds, fly-overs and top-down on drops, calm orbits in verses.
import * as THREE from 'three';

export const MODES = [
  ['director', 'Director (auto)'],
  ['orbit', 'Drone: orbit'],
  ['crane', 'Crane (close)'],
  ['reveal', 'Drone: reveal'],
  ['fly', 'Drone: fly-over'],
  ['top', 'Drone: top-down'],
  ['foh', 'Front of house'],
  ['crowd', 'In the crowd'],
  ['pit', 'Front barrier'],
  ['stage', 'From the stage'],
  ['walk', 'Walk (WASD + drag)'],
  ['free', 'Free (orbit)'],
];

const V = (a) => new THREE.Vector3(...a);
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function catmull(points, u) {
  const n = points.length - 1;
  const x = clamp01(u) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const t = x - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n, i + 2)];
  const out = new THREE.Vector3();
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3);
  }
  return out;
}

function pathLength(points) {
  let L = 0, prev = catmull(points, 0);
  for (let i = 1; i <= 60; i++) { const p = catmull(points, i / 60); L += p.distanceTo(prev); prev = p; }
  return L;
}

function shake(t, amp, freq = 1) {
  return new THREE.Vector3(
    Math.sin(t * 1.3 * freq) + 0.6 * Math.sin(t * 3.1 * freq + 1),
    Math.sin(t * 1.7 * freq + 2) + 0.5 * Math.sin(t * 4.3 * freq),
    Math.sin(t * 1.1 * freq + 4) + 0.6 * Math.sin(t * 2.7 * freq + 3),
  ).multiplyScalar(amp);
}

export class CameraRig {
  constructor(camera, controls, dom, { onMode, onShot, cut } = {}) {
    this.camera = camera; this.controls = controls; this.dom = dom; this.onMode = onMode; this.onShot = onShot; this.cutHooks = cut;
    this.transitioning = false; this.pendingShot = null; this.dragLock = false;
    this.mode = 'free'; this.shot = 'free'; this.u = 0; this.info = null; this.kind = 'concert';
    this.dur = 0; this.last = null; this.seq = 0; this.eyeIdx = 0;
    this.keys = new Set(); this.walk = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
    this.fov = 55;
    this.pos = new THREE.Vector3(); this.aim = new THREE.Vector3();
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener('pointerup', () => { down = null; });
    dom.addEventListener('pointermove', (e) => {
      if (!down || e.buttons === 0) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (this.mode === 'walk') { this.walk.yaw -= (e.movementX || 0) * 0.004; this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.pitch - (e.movementY || 0) * 0.004)); }
      else if (this.mode !== 'free' && !this.dragLock && Math.hypot(dx, dy) > 6) this.setMode('free', true);
    });
    dom.addEventListener('wheel', (e) => { if (this.mode === 'walk') { this.fov = Math.max(30, Math.min(90, this.fov + e.deltaY * 0.03)); } }, { passive: true });
    window.addEventListener('keydown', (e) => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  setVenue(info, kind) {
    this.info = info; this.kind = kind;
    this.walk.pos.set(...info.walkStart);
    this.walk.yaw = Math.atan2(info.stage[0] - info.walkStart[0], info.stage[2] - info.walkStart[2]) + Math.PI;
    this.walk.pitch = 0.05;
    this.restart(this.mode === 'director' ? this.pick() : this.mode);
  }

  // Swap shots behind a quick dip to black; free and walk are immediate because the user is steering.
  async transition(shot) {
    if (!this.cutHooks || !this.info) { this.restart(shot); return; }
    if (this.transitioning) { this.pendingShot = shot; return; }
    this.transitioning = true;
    await this.cutHooks.down();
    this.restart(this.mode === 'director' ? shot : this.mode === 'free' || this.mode === 'walk' ? this.mode : shot);
    this.cutHooks.up();
    this.transitioning = false;
    if (this.pendingShot) { const n = this.pendingShot; this.pendingShot = null; if (this.mode !== 'director') this.transition(this.mode); else if (n) this.transition(n); }
  }

  setMode(mode, fromUser = false) {
    this.mode = mode;
    if (mode === 'free') {
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.controls.target.copy(this.camera.position).addScaledVector(dir, 12);
      this.controls.enabled = true;
    } else this.controls.enabled = false;
    if (mode === 'walk') {
      this.walk.pos.copy(this.camera.position).setY(1.65);
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.walk.yaw = Math.atan2(dir.x, dir.z); this.walk.pitch = 0.05;
      if (this.info && (this.camera.position.y > 6 || !this.inBounds(this.walk.pos))) this.walk.pos.set(...this.info.walkStart);
    }
    const target = mode === 'director' ? this.pick() : mode;
    if (mode === 'free' || mode === 'walk') this.restart(target); else this.transition(target);
    if (fromUser && this.onMode) this.onMode(mode);
  }

  inBounds(p) { const b = this.info.bounds; return p.x >= b.x[0] && p.x <= b.x[1] && p.z >= b.z[0] && p.z <= b.z[1]; }

  restart(shot) {
    this.shot = shot; this.u = 0;
    this.onShot?.(this.mode, shot);
    const I = this.info;
    this.dur = { crane: 17, reveal: 16, orbit: 24, fly: I ? Math.max(8, pathLength(I.fly.map(V)) / ({ concert: 14, garba: 9, club: 2.4 }[this.kind] || 8)) : 12, top: 12, crowd: 11, pit: 9, foh: 11, stage: 9 }[shot] ?? 10;
    if (shot === 'crowd') this.eyeIdx = (this.eyeIdx + 1) % (I?.eye.length || 1);
    if (shot === 'crane') this.craneIdx = ((this.craneIdx ?? -1) + 1) % (I?.crane?.length || 1);
  }

  pick() {
    const ctx = this.ctx || {};
    const k = ctx.kind || 'verse';
    const table = {
      build: ['reveal', 'reveal', 'orbit', 'foh'],
      drop: ['fly', 'top', 'pit', 'crowd', 'fly'],
      chorus: ['orbit', 'crowd', 'foh', 'pit', 'stage'],
      verse: ['orbit', 'foh', 'crowd', 'stage'],
      intro: ['reveal', 'orbit', 'foh'],
      outro: ['orbit', 'top', 'foh'],
      break: ['crowd', 'stage', 'orbit'],
    };
    let list = table[k] || table.verse;
    // the crane works close to the stage and the lights, so it takes the place of the distant drone shots
    if (this.info?.crane) list = list.map((s, i) => ((s === 'orbit' || s === 'fly' || (s === 'top' && this.kind === 'concert') || (s === 'reveal' && i % 2)) && (this.kind === 'concert' || (this.seq + i) % 2) ? 'crane' : s));
    const opts = list.filter((s) => s !== this.last);
    this.seq++;
    const s = opts[(this.seq * 7 + Math.floor((ctx.t || 0) / 9)) % opts.length];
    this.last = s;
    return s;
  }

  // returns { pos, aim, fov } for the current shot at time this.u
  frameFor(shot, u) {
    const I = this.info;
    const P = new THREE.Vector3(), A = new THREE.Vector3();
    let fov = 55;
    switch (shot) {
      case 'foh': {
        const k = ease(clamp01(u / this.dur));
        P.copy(V(I.foh)).add(shake(u, 0.012, 0.45)); P.z -= k * 3; A.copy(V(I.fohAim)); fov = 50 - 5 * k; break;
      }
      case 'crowd': {
        const e = V(I.eye[this.eyeIdx % I.eye.length]);
        P.copy(e).add(shake(u, 0.009, 0.7)); P.x += Math.sin(u * 0.2) * 0.4;
        A.copy(V(I.stage)); A.x += Math.sin(u * 0.3) * 3; fov = 62; break;
      }
      case 'pit': { P.copy(V(I.pit.pos)).add(shake(u, 0.012, 0.7)); P.x -= u * 0.12; A.copy(V(I.pit.aim)); A.y += Math.sin(u * 0.5) * 1.2; fov = 66; break; }
      case 'stage': { P.copy(V(I.stagePov.pos)).add(shake(u, 0.008, 0.5)); A.copy(V(I.stagePov.aim)); A.x += Math.sin(u * 0.35) * 6; fov = 58; break; }
      case 'orbit': {
        const O = I.orbit, c = V(O.centre);
        const w = THREE.MathUtils.clamp(5 / O.radius, 0.08, 0.2);
        const arc = O.arc;
        const ang = arc ? Math.sin(u * w * 0.5) * arc : 0.5 + u * w;
        const alt = O.alt[0] + (O.alt[1] - O.alt[0]) * (0.5 + 0.5 * Math.sin(u * 0.15));
        P.set(c.x + Math.sin(ang) * O.radius, alt, c.z + Math.cos(ang) * O.radius).add(shake(u, 0.03, 0.22));
        A.copy(V(O.aim)); fov = 52; break;
      }
      case 'reveal': {
        const R = I.reveal, k = ease(clamp01(u / this.dur));
        P.lerpVectors(V(R.from), V(R.to), k).add(shake(u, 0.03, 0.22));
        A.lerpVectors(V(R.aim0), V(R.aim1), k); fov = 48 + 14 * k; break;
      }
      case 'fly': {
        const pts = I.fly.map(V), k = clamp01(u / this.dur);
        P.copy(catmull(pts, k)).add(shake(u, 0.04, 0.3));
        A.copy(catmull(pts, Math.min(1, k + 0.14)));
        A.y = Math.max(1.5, A.y - 5 * (1 - k * 0.6)); // look down-range and slightly down
        if (k > 0.8) A.lerp(V(I.stage), (k - 0.8) / 0.2);
        fov = 68; break;
      }
      case 'crane': {
        const C = I.crane[(this.craneIdx ?? 0) % I.crane.length], k = ease(clamp01(u / this.dur));
        P.copy(catmull(C.pts.map(V), k)).add(shake(u, 0.025, 0.35));
        A.lerpVectors(V(C.aim0), V(C.aim1), k).add(shake(u + 5, 0.05, 0.2));
        fov = C.fov[0] + (C.fov[1] - C.fov[0]) * k; break;
      }
      case 'top': {
        const T = I.top, k = ease(clamp01(u / this.dur));
        P.set(T.centre[0] + 0.01, T.alt * (1.25 - 0.25 * k), T.centre[2] + 4 * (1 - k));
        A.set(T.centre[0], 0, T.centre[2]);
        fov = T.fov ?? 60; break;
      }
      default: P.copy(this.camera.position); A.copy(this.aim);
    }
    return { pos: P, aim: A, fov };
  }

  update(dt, ctx) {
    this.ctx = ctx;
    if (!this.info) return;
    const cam = this.camera;
    if (this.mode === 'free') { this.controls.update(); return; }

    if (this.mode === 'walk') {
      const w = this.walk, k = this.keys;
      const fwd = new THREE.Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw)), right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const sp = (k.has('ShiftLeft') ? 3.6 : 1.7) * dt;
      const next = w.pos.clone();
      if (k.has('KeyW') || k.has('ArrowUp')) next.addScaledVector(fwd, sp);
      if (k.has('KeyS') || k.has('ArrowDown')) next.addScaledVector(fwd, -sp);
      if (k.has('KeyD') || k.has('ArrowRight')) next.addScaledVector(right, -sp);
      if (k.has('KeyA') || k.has('ArrowLeft')) next.addScaledVector(right, sp);
      if (this.inBounds(next)) w.pos.copy(next);
      this.u += dt;
      const moving = k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD');
      cam.position.set(w.pos.x, 1.65 + (moving ? Math.sin(this.u * 9) * 0.025 : Math.sin(this.u * 1.2) * 0.008), w.pos.z);
      this.aim.set(cam.position.x + Math.sin(w.yaw) * Math.cos(w.pitch), cam.position.y + Math.sin(w.pitch), cam.position.z + Math.cos(w.yaw) * Math.cos(w.pitch));
      cam.lookAt(this.aim);
      this.setFov(this.fov, dt);
      return;
    }

    this.u += dt;
    if (this.mode === 'director' && this.u > this.dur && !this.transitioning) this.transition(this.pick());
    else if (this.mode !== 'director' && this.u > this.dur) { if (this.shot === 'reveal' || this.shot === 'fly' || this.shot === 'top' || this.shot === 'crane') this.u = 0; else this.u = this.u % 1e6; }
    const f = this.frameFor(this.shot, this.u);
    cam.position.copy(f.pos);
    cam.up.set(0, 1, 0);
    if (this.shot === 'top') cam.up.set(Math.sin(this.u * 0.08), 0, -Math.cos(this.u * 0.08));
    cam.lookAt(f.aim);
    this.aim.copy(f.aim);
    this.setFov(f.fov, dt);
  }

  // Every shot is designed for a landscape screen. On a tall (phone) screen the same vertical angle would crop the sides
  // away, so widen it to keep most of the horizontal view: the stage, the crowd and the surroundings stay in frame.
  setFov(f, dt = 1 / 60) {
    const aspect = this.camera.aspect || 1.78;
    if (aspect < 1.6) {
      const k = Math.pow(1.6 / aspect, 0.8);
      f = Math.min(98, (2 * Math.atan(Math.tan((f * Math.PI) / 360) * k) * 180) / Math.PI);
    }
    if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov += (f - this.camera.fov) * (1 - Math.exp(-dt * 4)); this.camera.updateProjectionMatrix(); }
  }
}
