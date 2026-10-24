// Environment building blocks: textures, sky, skyline, trees, bulb strings, merged static geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceUniforms, MAX_LIGHTS, surfaceMaterial, cyl } from './stage.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- procedural ground textures (sRGB; tiled by world position) ----

function noise2(seed) {
  const r = rng(seed);
  const N = 64;
  const g = Float32Array.from({ length: N * N }, () => r());
  const at = (x, y) => g[((y & (N - 1)) * N) + (x & (N - 1))];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}

// kind: grass | dirt | trampled | floor | tarmac. Colours are typical dry-field values, not photos.
export function groundTexture(kind, size = 512) {
  const palettes = {
    grass: [[78, 82, 52], [58, 64, 40], 0.5],
    dirt: [[110, 92, 70], [84, 68, 50], 0.55],
    trampled: [[74, 60, 44], [52, 42, 32], 0.6],
    floor: [[34, 34, 40], [20, 20, 26], 0.25],
    tarmac: [[52, 52, 54], [36, 36, 38], 0.4],
  };
  const [a, b, grain] = palettes[kind] || palettes.dirt;
  const n1 = noise2(11), n2 = noise2(23), n3 = noise2(37);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(5);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // tileable: sample noise on a torus by blending offset copies
    const blot = 0.5 * n1(x / 40, y / 40) + 0.3 * n2(x / 13, y / 13) + 0.2 * n3(x / 5, y / 5);
    const sp = (r() - 0.5) * grain;
    const k = Math.max(0, Math.min(1, blot + sp));
    const i = (y * size + x) * 4;
    img.data[i] = a[0] * k + b[0] * (1 - k);
    img.data[i + 1] = a[1] * k + b[1] * (1 - k);
    img.data[i + 2] = a[2] * k + b[2] * (1 - k);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Rangoli: concentric petal rings in coloured powder, drawn on a dirt base; used as a ground decal.
export function rangoliTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#6a5640'; g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const rings = [[0.48, '#e8590c', 16], [0.4, '#f7f0e0', 12], [0.33, '#c2185b', 16], [0.26, '#f2a900', 12], [0.19, '#0b8f5a', 8], [0.12, '#d32f2f', 8], [0.06, '#f7f0e0', 1]];
  for (const [rad, col, petals] of rings) {
    g.fillStyle = col;
    if (petals === 1) { g.beginPath(); g.arc(cx, cy, rad * size * 0.5, 0, Math.PI * 2); g.fill(); continue; }
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.beginPath(); g.ellipse(rad * size * 0.5, 0, size * 0.085, size * 0.032, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- merged static geometry, one draw call per material ----

export class Batch {
  constructor() { this.map = new Map(); }
  add(mat, geo) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let e = this.map.get(mat);
    if (!e) this.map.set(mat, (e = []));
    e.push(geo);
  }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(mat, g);
    return g;
  }
  cyl(mat, a, b, r, seg = 8) { this.add(mat, cyl(a, b, r, seg)); }
  tube(mat, rTop, rBot, h, x, y, z, seg = 12) { const g = new THREE.CylinderGeometry(rTop, rBot, h, seg); g.translate(x, y + h / 2, z); this.add(mat, g); }
  build(group, colliderMats = []) {
    const colliders = [];
    for (const [mat, geos] of this.map) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      group.add(m);
      if (colliderMats.includes(mat)) colliders.push(m);
    }
    return colliders;
  }
}

// ---- sky: gradient, city glow band, stars ----

export function skyDome({ top = [0.004, 0.008, 0.03], horizon = [0.03, 0.035, 0.07], glow = [0.5, 0.28, 0.12], glowAmount = 0.5, stars = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Vector3(...top) }, uHor: { value: new THREE.Vector3(...horizon) }, uGlow: { value: new THREE.Vector3(...glow) }, uGlowAmt: { value: glowAmount }, uStars: { value: stars } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * vec4(p.xyz + cameraPosition, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform float uGlowAmt; uniform float uStars;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHor, uTop, pow(h, 0.45));
        float az = atan(d.x, d.z);
        float band = 0.6 + 0.4 * sin(az * 3.0 + 1.0) * sin(az * 7.0);   // uneven city glow
        col += uGlow * uGlowAmt * band * exp(-h * 9.0);
        if (d.y > 0.02) {
          vec2 g = vec2(az * 140.0, d.y * 280.0);
          vec2 id = floor(g); float s = h21(id);
          float tw = 0.7 + 0.3 * sin(h21(id + 3.0) * 40.0);
          col += uStars * step(0.9975, s) * smoothstep(0.02, 0.3, d.y) * tw * 0.35 * max(0.0, 1.0 - length(fract(g) - 0.5) * 2.4);
        }
        if (d.y < 0.0) col = uHor * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ---- apartment blocks / city edge: lit windows from a world-space grid ----

export function skyline({ count = 60, rMin = 90, rMax = 150, hMin = 14, hMax = 55, seed = 3, arc = [0, Math.PI * 2], lit = 0.38 }) {
  const r = rng(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFogCol: surfaceUniforms.uFogCol, uFogDen: surfaceUniforms.uFogDen, uLit: { value: lit }, uSurr: surfaceUniforms.uSurr },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying float vSeed;
      void main(){ mat4 M = modelMatrix * instanceMatrix; vec4 w = M * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(M) * normal);
        vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; varying vec3 vN; varying float vSeed; uniform vec3 uFogCol; uniform float uFogDen; uniform float uLit; uniform float uSurr;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        vec2 uv = abs(n.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
        vec2 cell = vec2(3.1, 3.3); vec2 id = floor(uv / cell); vec2 f = fract(uv / cell);
        float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78) * step(n.y, 0.5);
        float on = step(1.0 - uLit, h21(id + vSeed * 91.0));
        vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.75, 0.88, 1.0), h21(id * 1.7 + 4.0) * 0.4);
        vec3 col = vec3(0.012, 0.013, 0.018) + win * on * warm * (0.22 + 0.3 * h21(id + 7.0)) * (0.25 + 0.75 * uSurr);
        float d = length(cameraPosition - vW);
        float fg = 1.0 - exp(-uFogDen * 0.22 * d);
        gl_FragColor = vec4(mix(col, uFogCol, fg), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = arc[0] + r() * (arc[1] - arc[0]), rad = rMin + r() * (rMax - rMin);
    const w = 14 + r() * 22, d = 12 + r() * 14, h = hMin + r() * (hMax - hMin);
    m4.compose(new THREE.Vector3(Math.sin(a) * rad, 0, Math.cos(a) * rad), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 3), new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i, m4);
  }
  mesh.frustumCulled = false;
  return mesh;
}

// ---- trees: dark canopies on trunks (silhouettes at night) ----

export function treeBelt({ count = 120, rMin = 40, rMax = 70, center = [0, 0], seed = 9, arc = [0, Math.PI * 2], hMin = 6, hMax = 13, keep = null }) {
  const r = rng(seed);
  const trunk = new THREE.CylinderGeometry(0.25, 0.4, 3, 6); trunk.translate(0, 1.5, 0);
  const blobs = [new THREE.IcosahedronGeometry(2.6, 1), new THREE.IcosahedronGeometry(2.0, 1), new THREE.IcosahedronGeometry(1.8, 1)];
  blobs[0].translate(0, 5.2, 0); blobs[1].translate(1.4, 4.2, 0.6); blobs[2].translate(-1.2, 4.5, -0.8);
  const geo = mergeGeometries([trunk, ...blobs].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));
  const mat = surfaceMaterial(0x1d2a1c);
  const list = [];
  for (let i = 0; i < count * 3 && list.length < count; i++) {
    const a = arc[0] + r() * (arc[1] - arc[0]), rad = rMin + r() * (rMax - rMin);
    const x = center[0] + Math.sin(a) * rad, z = center[1] + Math.cos(a) * rad;
    if (keep && !keep(x, z)) continue;
    list.push([x, z, hMin + r() * (hMax - hMin), r()]);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  list.forEach(([x, z, h, v], i) => {
    const s = h / 9;
    m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v * 6), new THREE.Vector3(s, s * (0.9 + v * 0.3), s));
    mesh.setMatrixAt(i, m4);
    col.setRGB(0.7 + v * 0.5, 0.8 + v * 0.4, 0.6 + v * 0.3);
    mesh.setColorAt(i, col);
  });
  mesh.frustumCulled = false;
  return mesh;
}

// ---- strings of bulbs hung between two points (catenary-ish sag) ----

export function bulbString(a, b, { sag = 0.6, spacing = 0.6 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const n = Math.max(2, Math.round(A.distanceTo(B) / spacing));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = A.clone().lerp(B, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

// bulbs: array of [x,y,z]; color: HDR rgb so bloom picks them up
export function bulbMesh(points, color = [5, 3.6, 1.8], r = 0.07) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color) }), points.length);
  const m4 = new THREE.Matrix4();
  points.forEach((p, i) => { m4.makeTranslation(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]); mesh.setMatrixAt(i, m4); });
  mesh.frustumCulled = false;
  return mesh;
}

export { MAX_LIGHTS };
