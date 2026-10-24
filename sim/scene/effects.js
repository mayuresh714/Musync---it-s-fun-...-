// Stage effects the decoder only names: CO2 jets, confetti cannons, flame projectors.
// Small CPU particle systems; each draws as a single Points object and costs nothing while idle.
import * as THREE from 'three';
import { DECK } from './venues.js';

const MAX = { co2: 700, confetti: 900, flame: 260, spark: 1100 };

function system(kind, scene) {
  const n = MAX[kind];
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  const vel = new Float32Array(n * 3), life = new Float32Array(n), age = new Float32Array(n).fill(9), seed = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const round = kind !== 'confetti';
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 700 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); ${round ? 'vA *= smoothstep(2.5, 14.0, -mv.z);' : ''} gl_PointSize=aSize*uScale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p)*2.0; ${round ? 'float a=smoothstep(1.0,0.0,r);' : 'float a=step(abs(p.x),0.5)*step(abs(p.y),0.5);'} if(a*vA<0.01) discard; gl_FragColor=vec4(vC,a*vA); }`,
    transparent: true, depthWrite: false, blending: round ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.visible = false;
  scene.add(pts);
  let next = 0, live = 0;
  return {
    pts, material: m,
    emit(p, v, lifeS, rgb, sz, seedv = Math.random()) {
      const i = next; next = (next + 1) % n;
      pos.set(p, i * 3); vel.set(v, i * 3); life[i] = lifeS; age[i] = 0; seed[i] = seedv; col.set(rgb, i * 3); size[i] = sz; alpha[i] = 1; live++;
    },
    step(dt, forceFn) {
      let any = false;
      for (let i = 0; i < n; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        any = true;
        age[i] += dt;
        const k = age[i] / life[i];
        forceFn(i, dt, k, { pos, vel, size, alpha, seed, col });
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      pts.visible = any;
      if (any) for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[a].needsUpdate = true;
    },
  };
}

export class StageEffects {
  constructor(scene) {
    this.sys = { co2: system('co2', scene), confetti: system('confetti', scene), flame: system('flame', scene), spark: system('spark', scene) };
    this.fired = new Set();
    this.last = 0;
    this.enabled = true;
    this.kind = 'concert';
    this.pal = [[1, 0.5, 0.2]];
  }

  setVenue(kind) { this.kind = kind; }

  // jets stand along the front edge of whatever stage there is
  anchors() {
    const club = this.kind === 'club' || this.kind === 'hall';
    const xs = club ? [-2.2, -0.8, 0.8, 2.2] : [-9, -5.5, -2, 2, 5.5, 9];
    return { xs, y: club ? 1.2 : DECK + 0.05, z: club ? -1.2 : -0.6 };
  }

  update(dt, active, { t, tint = [1, 1, 1], level = 0, pal }) {
    if (t < this.last - 0.3) this.fired.clear(); // seeked backwards
    this.last = t;
    if (pal?.length) this.pal = pal;
    const ps = this.sys;
    const lit = [0.55 + tint[0] * 0.5 * level, 0.55 + tint[1] * 0.5 * level, 0.6 + tint[2] * 0.5 * level];
    if (this.enabled) for (const e of active) {
      const id = `${e.type}@${e.t.toFixed(2)}`;
      if (e.age > 0.25 && !this.fired.has(id)) { this.fired.add(id); continue; } // arrived mid-effect: don't replay
      if (this.fired.has(id)) continue;
      this.fired.add(id);
      this.fire(e, lit);
    }
    const sd = Math.min(dt, 0.05);
    ps.co2.step(sd, (i, d, k, B) => {
      B.vel[i * 3] *= 1 - d * 0.9; B.vel[i * 3 + 1] *= 1 - d * 1.6; B.vel[i * 3 + 2] *= 1 - d * 0.9;
      B.size[i] = 0.5 + k * 2.2; B.alpha[i] = Math.min(1, k * 8) * (1 - k) * 0.22;
    });
    ps.flame.step(sd, (i, d, k, B) => {
      B.vel[i * 3 + 1] *= 1 - d * 1.2; B.vel[i * 3] += Math.sin(t * 9 + B.seed[i] * 30) * d * 3;
      B.size[i] = 0.5 + 0.9 * (1 - k); B.alpha[i] = (1 - k) * 0.7;
      B.col[i * 3] = 1; B.col[i * 3 + 1] = 0.75 - 0.5 * k; B.col[i * 3 + 2] = 0.2 * (1 - k);
    });
    ps.spark.step(sd, (i, d, k, B) => {
      B.vel[i * 3 + 1] -= 9.5 * d; B.vel[i * 3] *= 1 - d * 0.5; B.vel[i * 3 + 2] *= 1 - d * 0.5;
      B.size[i] = 0.09 * (1 - 0.6 * k); B.alpha[i] = Math.min(1, (1 - k) * 2.2);
      B.col[i * 3] = 1; B.col[i * 3 + 1] = 0.82 - 0.35 * k; B.col[i * 3 + 2] = 0.45 - 0.35 * k;
    });
    ps.confetti.step(sd, (i, d, k, B) => {
      B.vel[i * 3 + 1] -= 6.5 * d; // gravity, then air drag so it flutters instead of falling like rain
      const drag = 1 - d * (k > 0.15 ? 2.6 : 0.4);
      B.vel[i * 3] = B.vel[i * 3] * drag + Math.sin(t * 3 + B.seed[i] * 40) * d * 2.2;
      B.vel[i * 3 + 2] = B.vel[i * 3 + 2] * drag + Math.cos(t * 2.3 + B.seed[i] * 40) * d * 2.2;
      if (B.vel[i * 3 + 1] < -1.4) B.vel[i * 3 + 1] = -1.4;
      B.alpha[i] = k > 0.85 ? (1 - k) / 0.15 : 1;
      B.size[i] = 0.12 * (0.6 + 0.4 * Math.abs(Math.sin(t * 6 + B.seed[i] * 50)));
    });
    for (const s of Object.values(ps)) s.material.uniforms.uScale.value = 700;
  }

  fire(e, lit) {
    const { xs, y, z } = this.anchors();
    const R = Math.random;
    if (e.type === 'co2') {
      for (const x of xs) for (let k = 0; k < 90; k++) {
        const sp = 9 + R() * 8;
        this.sys.co2.emit([x + (R() - 0.5) * 0.2, y, z], [(R() - 0.5) * 1.6 + x * 0.05, sp, (R() - 0.2) * 2.2 + 0.8], 1.3 + R() * 0.9, lit, 0.5, R());
      }
    } else if (e.type === 'flame') {
      for (const x of xs.filter((_, i) => i % 2 === 0)) for (let k = 0; k < 60; k++)
        this.sys.flame.emit([x + (R() - 0.5) * 0.2, y, z - 0.6], [(R() - 0.5) * 1.2, 8 + R() * 7, (R() - 0.5) * 1], 0.5 + R() * 0.5, [1, 0.7, 0.2], 0.7, R());
    } else if (e.type === 'spark') {
      // cold-spark fountains: a gold curtain that climbs about four metres and rains back
      const run = Math.min(1, e.age / Math.max(0.3, e.dur));
      for (const x of xs.filter((_, i) => i % 2 === 1 || xs.length < 5)) for (let k = 0; k < 70; k++)
        this.sys.spark.emit([x + (R() - 0.5) * 0.15, y, z - 0.3], [(R() - 0.5) * 2.2, 7 + R() * 5, (R() - 0.4) * 2.4], 0.9 + R() * 0.8, [1, 0.85, 0.5], 0.09, R());
    } else if (e.type === 'streamers') {
      const cannons = this.kind === 'club' || this.kind === 'hall' ? [-2.5, 2.5] : [-10, -3.5, 3.5, 10];
      for (const cx of cannons) for (let k = 0; k < 80; k++) {
        const c = this.pal[Math.floor(R() * this.pal.length)] || [1, 1, 1];
        this.sys.confetti.emit([cx + (R() - 0.5) * 0.4, y + 0.3, z + 0.6], [(R() - 0.5) * 5 + cx * 0.15, 13 + R() * 6, 7 + R() * 9], 4.5 + R() * 2, c.map((v) => 0.45 + v * 0.55), 0.14, R());
      }
    } else if (e.type === 'confetti') {
      const cannons = this.kind === 'club' || this.kind === 'hall' ? [-2, 2] : [-8, 0, 8];
      for (const cx of cannons) for (let k = 0; k < 170; k++) {
        const c = this.pal[Math.floor(R() * this.pal.length)] || [1, 1, 1];
        const mixw = R() < 0.25;
        this.sys.confetti.emit([cx + (R() - 0.5), y + 0.2, z + 0.5], [(R() - 0.5) * 9, 11 + R() * 9, 2 + R() * 9], 5 + R() * 3, mixw ? [1, 0.95, 0.85] : c.map((v) => 0.35 + v * 0.65), 0.1, R());
      }
    }
  }
}
