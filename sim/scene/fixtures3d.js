// Fixture visuals driven by decoder state.
// Physical behaviour modelled here (not in the decoder, which only states intent):
//   - pan/tilt slew limited by each profile's motor speeds
//   - tungsten blinders rise/fall slowly; discharge/LED fixtures respond instantly
//   - beam shafts scatter in haze: brightness ~ flux / beam radius, so narrow beams
//     read as hard shafts and wide washes as soft glow
import * as THREE from 'three';
import { panTiltToAim } from '../../core/decoder/decoder.js';
import { writeSurfaceLights } from './stage.js';

const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const tmpColor = new THREE.Color();
const tmpV = new THREE.Vector3();
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Relative light output used for rendering (est; ratios of typical published lumen figures).
const OUTPUT = { beam: 1.0, spot: 1.5, wash: 0.55, par: 0.32, strobe: 5, blinder: 3, pixel: 0.08, laser: 1 };
const LENS = { beam: 0.055, spot: 0.08, wash: 0.13, par: 0.11, strobe: 0.2, blinder: 0.25, pixel: 0.04 };

const beamMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Vector3() }, uR0: { value: 0.05 }, uR1: { value: 0.5 }, uLen: { value: 10 }, uHaze: { value: 1 }, uGain: { value: 1 }, uFall: { value: 0.016 }, uMinAng: { value: 0.0042 } },
  vertexShader: /* glsl */ `
    uniform float uR0; uniform float uR1; uniform float uLen; uniform float uMinAng;
    varying float vAlong; varying float vR; varying float vK; varying vec3 vW; varying vec3 vN;
    void main() {
      float a = position.y;
      float r = mix(uR0, uR1, a);
      // a real shaft is a few centimetres wide: from a drone it would be a hairline. Never draw it thinner than a few pixels,
      // and give back some brightness as it widens so the light is spread, not lost.
      float dist = length(cameraPosition - (modelMatrix * vec4(0.0, a * uLen, 0.0, 1.0)).xyz);
      float rv = max(r, dist * uMinAng);
      vK = sqrt(r / rv);
      vec3 p = vec3(position.x * rv, a * uLen, position.z * rv);
      vec4 w = modelMatrix * vec4(p, 1.0);
      vW = w.xyz; vAlong = a; vR = r;
      vN = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uHaze; uniform float uLen; uniform float uGain; uniform float uFall;
    varying float vAlong; varying float vR; varying float vK; varying vec3 vW; varying vec3 vN;
    void main() {
      vec3 V = normalize(cameraPosition - vW);
      float facing = abs(dot(normalize(vN), V));
      float profile = pow(facing, 1.6) + 0.9 * pow(facing, 7.0) + 1.1 * pow(facing, 30.0); // soft edge, hot core and a sharp bright spine: a focused shaft that stays a clear line
      float d = vAlong * uLen;
      float atten = exp(-d * uFall);
      float tail = 1.0 - smoothstep(0.96, 1.0, vAlong); // holds its strength to the very end: the path does not fade out
      float density = uHaze * mix(atten, 1.0, 0.35) * pow(1.0 / max(vR, 0.05), 0.8) * 0.7 * mix(1.0, 1.0 / max(vK, 0.35), 0.6);
      // a shaft passing right by the lens is not a wall of white: fade it out as the camera gets within a few metres
      float nearFade = smoothstep(1.0, 11.0, length(cameraPosition - vW));
      gl_FragColor = vec4(uColor * density * profile * tail * 0.035 * uGain * nearFade, 1.0);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

const beamGeometry = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 28, 24, true);
  g.translate(0, 0.5, 0);
  return g;
})();

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.55, metalness: 0.4 });
const bodyMatHi = new THREE.MeshStandardMaterial({ color: 0x6a3a10, roughness: 0.5, metalness: 0.3, emissive: 0x3a1a00 });

function visualKind(profile) {
  if (profile.role === 'laser') return 'laser';
  if (profile.pixels > 1) return profile.width ? 'cloth' : 'bar';
  if (profile.pan) return 'mover';
  if (profile.role === 'strobe') return 'strobe';
  if (profile.role === 'blinder') return 'blinder';
  return 'par';
}

// Default fixed aim for fixtures without pan/tilt.
function defaultAim(f) {
  if (f.aim) return new THREE.Vector3(...f.aim).sub(new THREE.Vector3(...f.pos)).normalize();
  const [x, y, z] = f.pos;
  if (f.profile.pixels > 1) {
    const out = new THREE.Vector3(x, 0, z - 16);
    // ring/garbi bars face outward from their centre; stage bars face the audience
    return Math.abs(z - 16) < 4 && Math.hypot(x, z - 16) < 4 ? out.normalize().add(new THREE.Vector3(0, 0.2, 0)).normalize() : new THREE.Vector3(0, 0.35, 1).normalize();
  }
  if (f.role === 'blinder') return new THREE.Vector3(x * -0.02, -0.25, 1).normalize();
  if (f.mount === 'hung') {
    // point down and toward the centre of the action
    const target = z > 2 ? new THREE.Vector3(x * 0.4, 0, z * 0.7 + 4) : new THREE.Vector3(x * 0.7, 1.2, -3.5);
    return target.sub(new THREE.Vector3(x, y, z)).normalize();
  }
  return new THREE.Vector3(0, 1, 0.35).normalize();
}

export class RigView {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.items = new Map();
    this.raycaster = new THREE.Raycaster();
    this.haze = 1;
    // user-adjustable look: beam thickness (x real optics) and how much coloured light spills on the surroundings
    this.look = { beamWidth: 1, spill: 1, beamGain: 1.6 };
    this.tint = [0, 0, 0];
    this.level = 0;
    this.selected = null;
  }

  setColliders(c) { this.colliders = c; }

  clear() {
    for (const it of this.items.values()) for (const o of [it.group, it.beam, it.spot, ...(it.rays || [])]) if (o) this.root.remove(o);
    this.items.clear();
  }

  setRig(fixtures) {
    this.clear();
    for (const f of fixtures) this.items.set(f.id, this.build(f));
  }

  pickables() { return [...this.items.values()].flatMap((it) => it.pick); }

  select(id) {
    for (const it of this.items.values()) for (const m of it.pick) m.material = it.id === id ? bodyMatHi : bodyMat;
    this.selected = id;
  }

  build(f) {
    const kind = visualKind(f.profile);
    const role = f.role;
    const group = new THREE.Group();
    group.position.set(...f.pos);
    group.userData.fixtureId = f.id;
    this.root.add(group);
    const it = { id: f.id, f, kind, role, group, pick: [], pan: 0, tilt: 0, dimSmooth: 0 };
    const mesh = (geo, mat = bodyMat, parent = group) => { const m = new THREE.Mesh(geo, mat); parent.add(m); m.userData.fixtureId = f.id; return m; };

    if (kind === 'mover') {
      const mountRoot = new THREE.Group();
      if (f.mount === 'hung') mountRoot.rotation.z = Math.PI;
      group.add(mountRoot);
      const base = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.34), bodyMat, mountRoot);
      base.position.y = 0.08;
      const yoke = new THREE.Group();
      yoke.position.y = 0.16;
      mountRoot.add(yoke);
      for (const s of [-1, 1]) { const arm = mesh(new THREE.BoxGeometry(0.05, 0.4, 0.13), bodyMat, yoke); arm.position.set(s * 0.21, 0.2, 0); }
      const head = new THREE.Group();
      head.position.y = 0.32;
      yoke.add(head);
      const wide = role === 'wash';
      const hr = wide ? 0.17 : 0.13;
      const body = mesh(new THREE.CylinderGeometry(hr, hr * 0.85, wide ? 0.26 : 0.38, 20), bodyMat, head);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(LENS[role] || 0.06, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      lens.rotation.x = -Math.PI / 2;
      lens.position.y = (wide ? 0.13 : 0.19) + 0.002;
      head.add(lens);
      it.pick.push(base, body);
      Object.assign(it, { mountRoot, yoke, head, lens, lensY: lens.position.y });
      this.addBeam(it);
    } else if (kind === 'bar' || kind === 'cloth') {
      const n = f.profile.pixels;
      const aim = defaultAim(f);
      if (kind === 'bar') {
        const len = f.profile.length || 1;
        const holder = new THREE.Group();
        holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
        if (f.profile.vertical) holder.rotateZ(Math.PI / 2); // a tube stands on end: its length runs up, not along
        group.add(holder);
        const tube = f.role === 'tube';
        const thick = tube ? 0.1 : 0.07;
        const housing = mesh(new THREE.BoxGeometry(len, thick, thick), bodyMat, holder);
        const cells = new THREE.InstancedMesh(new THREE.BoxGeometry((len / n) * (tube ? 0.92 : 0.8), tube ? 0.075 : 0.045, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
        const m4 = new THREE.Matrix4();
        for (let k = 0; k < n; k++) { m4.makeTranslation(((k + 0.5) / n - 0.5) * len, 0, thick / 2 + 0.002); cells.setMatrixAt(k, m4); cells.setColorAt(k, new THREE.Color(0, 0, 0)); }
        holder.add(cells);
        it.pick.push(housing);
        Object.assign(it, { cells, aim });
      } else if (f.profile.grid) {
        // an LED matrix: a dark panel with a square of light per pixel
        const { width, height } = f.profile;
        const cols = Math.round(Math.sqrt((n * width) / height)), rows = Math.ceil(n / cols);
        if (f.rotY) group.rotation.y = f.rotY * D2R;
        const panel = mesh(new THREE.BoxGeometry(width + 0.1, height + 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.8 }));
        panel.position.z = -0.06;
        const cw = (width / cols) * 0.84, ch = (height / rows) * 0.84;
        const cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
        const m4 = new THREE.Matrix4();
        for (let k = 0; k < n; k++) {
          const cx = ((k % cols) + 0.5) / cols - 0.5, cy = (Math.floor(k / cols) + 0.5) / rows - 0.5;
          m4.makeTranslation(cx * width, cy * height, 0.002); cells.setMatrixAt(k, m4); cells.setColorAt(k, new THREE.Color(0, 0, 0));
        }
        group.add(cells);
        it.pick.push(panel);
        Object.assign(it, { cells, aim: new THREE.Vector3(Math.sin((f.rotY || 0) * D2R), 0, Math.cos((f.rotY || 0) * D2R)), grid: true });
      } else {
        const { width, height } = f.profile;
        const cloth = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 }));
        const cols = Math.round(Math.sqrt((n * width) / height)), rows = Math.ceil(n / cols);
        const pos = new Float32Array(n * 3);
        const rnd = (k) => { const s = Math.sin(k * 91.7) * 4375.85; return s - Math.floor(s); };
        for (let k = 0; k < n; k++) {
          pos[k * 3] = ((k % cols) / Math.max(1, cols - 1) - 0.5) * width + (rnd(k) - 0.5) * 0.25;
          pos[k * 3 + 1] = (Math.floor(k / cols) / Math.max(1, rows - 1) - 0.5) * height + (rnd(k + 9) - 0.5) * 0.25;
          pos[k * 3 + 2] = 0.01;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        group.add(pts);
        it.pick.push(cloth);
        Object.assign(it, { pts, aim: new THREE.Vector3(0, 0, 1) });
      }
    } else if (kind === 'laser') {
      const body = mesh(new THREE.BoxGeometry(0.3, 0.14, 0.32));
      it.pick.push(body);
      // each ray is a thin bright shaft in the haze plus a hot dot where it lands: that is what a laser looks like
      const N = 16;
      const rays = [];
      for (let i = 0; i < N; i++) {
        const mat = beamMaterial();
        const cone = new THREE.Mesh(beamGeometry, mat);
        cone.frustumCulled = false; cone.visible = false;
        const dot = makeSpot();
        this.root.add(cone, dot);
        cone.userData.dot = dot;
        rays.push(cone);
      }
      Object.assign(it, { rays, N, aim: new THREE.Vector3(0, 0.3, 1).normalize() });
    } else {
      // fixed-aim fixtures: par, strobe, blinder
      const aim = defaultAim(f);
      const holder = new THREE.Group();
      holder.quaternion.setFromUnitVectors(UP, aim);
      group.add(holder);
      let lensR = LENS[role] || 0.1, lensY = 0.13;
      if (kind === 'par') it.pick.push(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.26, 18), bodyMat, holder));
      if (kind === 'strobe') { it.pick.push(mesh(new THREE.BoxGeometry(0.62, 0.18, 0.24), bodyMat, holder)); lensY = 0.091; }
      if (kind === 'blinder') { it.pick.push(mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), bodyMat, holder)); lensY = 0.081; }
      const lensGeo = kind === 'strobe' ? new THREE.PlaneGeometry(0.5, 0.16) : kind === 'blinder' ? null : new THREE.CircleGeometry(lensR, 24);
      let lens;
      if (lensGeo) {
        lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0 }));
        lens.rotation.x = -Math.PI / 2;
        lens.position.y = lensY;
        holder.add(lens);
      } else {
        lens = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0 });
        for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
          const c = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), mat);
          c.rotation.x = -Math.PI / 2; c.position.set(x, lensY, z);
          lens.add(c);
        }
        lens.material = mat;
        holder.add(lens);
      }
      Object.assign(it, { holder, lens, aim, lensY });
      if (kind === 'par') this.addBeam(it);
    }
    return it;
  }

  addBeam(it) {
    const mat = beamMaterial();
    const cone = new THREE.Mesh(beamGeometry, mat);
    cone.frustumCulled = false;
    this.root.add(cone);
    it.beam = cone;
    it.spot = makeSpot();
    this.root.add(it.spot);
    // the lamp seen head-on: a hot star with flare spikes, which is what a moving head looks like from the crowd
    it.glow = makeGlow();
    this.root.add(it.glow);
  }

  // states: decoder output; dt: seconds since last update
  update(states, dt) {
    const lights = [];
    const fill = new THREE.Vector3();
    const tmp = new THREE.Vector3(), origin = new THREE.Vector3(), dir = new THREE.Vector3();
    this.prismLeft = this.look.prism === false ? 0 : 14;

    for (const it of this.items.values()) {
      const st = states[it.id];
      if (!st) continue;
      const p = it.f.profile;
      // dimmer response
      let dim = st.dim;
      if (p.tungsten) { const k = dim > it.dimSmooth ? 1 - Math.exp(-dt / 0.09) : 1 - Math.exp(-dt / 0.25); it.dimSmooth += (dim - it.dimSmooth) * k; dim = it.dimSmooth; }
      const out = OUTPUT[it.kind === 'par' ? 'par' : it.role] ?? 0.5;

      if (it.kind === 'mover') {
        if (st.pan != null) {
          it.pan = slew(it.pan, st.pan, (p.panSpeed || 250) * dt, dt);
          it.tilt = slew(it.tilt, st.tilt, (p.tiltSpeed || 200) * dt, dt);
        }
        it.yoke.rotation.y = it.pan * D2R;
        it.head.rotation.x = it.tilt * D2R;
        const a = panTiltToAim(it.pan, it.tilt, it.f.mount);
        dir.set(a.x, a.y, a.z);
        it.lens.getWorldPosition(origin);
        this.setBeam(it, origin, dir, st.rgb, dim, p.beamAngle, out, st.prism);
        it.lens.material.color.setRGB(...st.rgb.map((v) => v * dim * 6));
        lights.push(lightOf(origin, dir, p.beamAngle, st.rgb, dim * out * (it.role === 'beam' ? 0.9 : 1.6)));
      } else if (it.kind === 'par' || it.kind === 'strobe' || it.kind === 'blinder') {
        dir.copy(it.aim);
        it.lens.getWorldPosition(origin);
        const gain = it.kind === 'strobe' ? 14 : it.kind === 'blinder' ? 9 : 5;
        it.lens.material.color.setRGB(...st.rgb.map((v) => v * dim * gain));
        if (it.beam) this.setBeam(it, origin, dir, st.rgb, dim, p.beamAngle, out);
        lights.push(lightOf(origin, dir, p.beamAngle, st.rgb, dim * out * (it.kind === 'par' ? 2.2 : 0.35)));
        if (it.kind !== 'par') fill.addScaledVector(tmp.set(...st.rgb), dim * out * 0.02);
      } else if (it.kind === 'bar') {
        const avg = [0, 0, 0];
        st.pixels.forEach((c, k) => {
          it.cells.setColorAt(k, new THREE.Color(c[0] * 5, c[1] * 5, c[2] * 5));
          avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2];
        });
        it.cells.instanceColor.needsUpdate = true;
        const n = st.pixels.length || 1;
        it.group.getWorldPosition(origin);
        lights.push(lightOf(origin, it.aim, 70, avg.map((v) => v / n), 0.6));
      } else if (it.kind === 'cloth' && it.grid) {
        const avg = [0, 0, 0];
        st.pixels.forEach((c, k) => { it.cells.setColorAt(k, tmpColor.setRGB(c[0] * 2.6, c[1] * 2.6, c[2] * 2.6)); avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; });
        it.cells.instanceColor.needsUpdate = true;
        const n = st.pixels.length || 1;
        it.group.getWorldPosition(origin);
        lights.push(lightOf(origin, it.aim, 110, avg.map((v) => v / n), 1.1));
      } else if (it.kind === 'cloth') {
        const col = it.pts.geometry.attributes.color;
        st.pixels.forEach((c, k) => col.setXYZ(k, c[0] * 3, c[1] * 3, c[2] * 3));
        col.needsUpdate = true;
      } else if (it.kind === 'laser') {
        this.updateLaser(it, st, dim);
      }
    }

    // Spill: coloured pools on the floor, crowd and structure are softened towards neutral so a saturated
    // beam does not repaint the whole venue. Beam shafts in the air are unaffected.
    const sp = this.look.spill, kS = 0.45 + 0.55 * sp, sS = 0.12 + 0.88 * sp;
    for (const L of lights) { const g = (L.col[0] + L.col[1] + L.col[2]) / 3; L.col = L.col.map((v) => (g * (1 - sS) + v * sS) * kS); }
    fill.multiplyScalar(kS);
    // keep the strongest pools for the surface shader and tint the haze with what is in the air
    lights.sort((a, b) => b.w - a.w);
    writeSurfaceLights(lights, fill);
    const tint = [0, 0, 0];
    let wsum = 0;
    for (const L of lights.slice(0, 40)) {
      const m = Math.max(...L.col, 1e-6);
      for (let k = 0; k < 3; k++) tint[k] += (L.col[k] / m) * L.w;
      wsum += L.w;
    }
    const tm = wsum > 0 ? tint.map((v) => v / wsum) : [0, 0, 0];
    const tg = (tm[0] + tm[1] + tm[2]) / 3;
    this.tint = tm.map((v) => tg * (1 - sS) + v * sS);
    this.level = Math.min(1, wsum / 3);
  }

  setBeam(it, origin, dir, rgb, dim, angle, out, prism) {
    const cone = it.beam;
    cone.visible = dim > 0.004;
    if (it.spot) it.spot.visible = false;
    if (it.glow) {
      const g = it.glow;
      g.visible = dim > 0.02;
      if (g.visible) {
        g.position.copy(origin).addScaledVector(dir, 0.12);
        const k = it.role === 'wash' || it.kind === 'par' ? 0.7 : 1;
        const dc = this.camera ? origin.distanceTo(this.camera.position) : 30;
        g.scale.setScalar(Math.min((0.55 + dim * 1.3) * k * (it.role === 'beam' ? 1.15 : 1), dc * 0.2));
        g.material.color.setRGB(Math.min(1.6, rgb[0] * dim * 1.5 + 0.1 * dim), Math.min(1.6, rgb[1] * dim * 1.5 + 0.1 * dim), Math.min(1.6, rgb[2] * dim * 1.5 + 0.1 * dim));
      }
    }
    if (!cone.visible) { if (it.prismCones) for (const c of it.prismCones) c.visible = false; return; }
    const bw = it.role === 'beam' || it.role === 'spot' ? this.look.beamWidth : 1 + (this.look.beamWidth - 1) * 0.35;
    angle *= bw;
    const lens = (LENS[it.kind === 'par' ? 'par' : it.role] || 0.06) * Math.pow(bw, 0.7);
    // a fatter shaft spreads the same light over more haze, so lift it back or thickness would just mean dimmer
    const lift = Math.pow(bw, 0.55);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 70;
    const hit = this.raycaster.intersectObjects(this.colliders, false)[0];
    const len = hit ? Math.max(0.2, hit.distance) : 70;
    cone.position.copy(origin);
    cone.quaternion.setFromUnitVectors(UP, dir);
    const u = cone.material.uniforms;
    u.uLen.value = len;
    u.uR0.value = lens;
    u.uR1.value = lens + len * Math.tan((angle / 2) * D2R);
    // looking straight down a shaft from nearby stacks every wall of the cone on top of the others: ease it off, as
    // a camera's iris would, so standing in front of the rig reads as dazzle and not as a white screen
    const glare = this.glareFor(origin, dir);
    u.uColor.value.set(rgb[0] * dim * out * lift * glare, rgb[1] * dim * out * lift * glare, rgb[2] * dim * out * lift * glare);
    u.uHaze.value = this.haze * (this.venueHaze || 1);
    u.uGain.value = this.look.beamGain;
    if (prism && this.prismLeft > 0) { this.prismLeft--; this.prismRays(it, origin, dir, rgb, dim, angle, len, lens, out * lift, prism); u.uColor.value.multiplyScalar(0.55); }
    else if (it.prismCones) for (const c of it.prismCones) c.visible = false;
    // where the shaft lands: a lit disc on the floor / crowd / structure, sized by the beam and coloured by it
    if (hit && it.spot && hit.face) {
      const sp = it.spot;
      const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (nrm.dot(dir) > 0) nrm.negate();
      sp.position.copy(hit.point).addScaledVector(nrm, 0.04);
      sp.quaternion.setFromUnitVectors(FRONT, nrm);
      const r = Math.min(3.2, Math.max(0.3, u.uR1.value));
      sp.scale.setScalar(r * 2.2);
      const k = Math.min(1.5, dim * out * 1.4 * this.look.beamGain);
      sp.material.color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k);
      sp.visible = true;
    }
  }

  // 1 when the camera sees a shaft from the side, falling to 0.12 when it looks straight down the barrel from nearby
  glareFor(origin, dir) {
    if (!this.camera) return 1;
    const dc = origin.distanceTo(this.camera.position);
    const along = tmpV.copy(this.camera.position).sub(origin).dot(dir) / Math.max(dc, 1e-3);
    return 1 - 0.88 * smoothstep(0.72, 0.985, along) * (1 - smoothstep(12, 90, dc));
  }

  // The prism: a ring of 8 rays around the centre beam, turning with the music. Same length as the centre beam
  // (they land in the same part of the room), each a thin shaft, so one head throws a crown of light.
  prismRays(it, origin, dir, rgb, dim, angle, len, lens, gain, prism) {
    if (!it.prismCones) {
      it.prismCones = Array.from({ length: 8 }, () => { const c = new THREE.Mesh(beamGeometry, beamMaterial()); c.frustumCulled = false; this.root.add(c); return c; });
    }
    const ref = Math.abs(dir.y) > 0.95 ? PRISM_X : UP;
    const right = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    const half = (5.2 + angle * 0.5) * D2R, d = new THREE.Vector3();
    const n = prism.rays || 8;
    it.prismCones.forEach((c, k) => {
      c.visible = k < n;
      if (k >= n) return;
      const a = (k / n) * Math.PI * 2 + prism.spin * 0.45;
      d.copy(dir).multiplyScalar(Math.cos(half)).addScaledVector(right, Math.cos(a) * Math.sin(half)).addScaledVector(up2, Math.sin(a) * Math.sin(half));
      c.position.copy(origin);
      c.quaternion.setFromUnitVectors(UP, d);
      const u = c.material.uniforms;
      u.uLen.value = len; u.uR0.value = lens * 0.6; u.uR1.value = lens * 0.6 + len * Math.tan((angle / 2) * D2R) * 0.85;
      u.uColor.value.set(rgb[0] * dim * gain * 0.62, rgb[1] * dim * gain * 0.62, rgb[2] * dim * gain * 0.62);
      u.uHaze.value = this.haze * (this.venueHaze || 1); u.uGain.value = this.look.beamGain;
    });
  }

  updateLaser(it, st, dim) {
    const origin = new THREE.Vector3(...it.f.pos);
    const aim = st.aim ? new THREE.Vector3(st.aim.x, st.aim.y, st.aim.z) : it.aim;
    const L = st.laser || { pattern: 'beam', beams: 1, spread: 0.5, phase: 0 };
    const scan = (it.f.profile.scanAngle || 60) * D2R;
    const right = new THREE.Vector3().crossVectors(aim, UP).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(right, aim).normalize();
    const rgb = laserColor(st.rgb);
    const d = new THREE.Vector3();
    const on = dim > 0.01;
    // a laser has one fixed output: spread over many rays, each is fainter (a lone ray is the brightest thing in the room)
    const nRays = L.pattern === 'tunnel' ? it.N : Math.max(1, L.beams);
    const perRay = Math.min(1, 3.5 / nRays) ** 0.9;
    for (let i = 0; i < it.N; i++) {
      const cone = it.rays[i], dot = cone.userData.dot;
      const active = on && i < (L.pattern === 'tunnel' ? it.N : L.beams);
      cone.visible = active; dot.visible = false;
      if (!active) continue;
      if (L.pattern === 'fan') {
        // a sheet: the rays fan across `spread` and the whole fan sweeps slowly, as a scanner does
        const ang = (L.beams > 1 ? i / (L.beams - 1) - 0.5 : 0) * L.spread * scan + Math.sin(L.phase * Math.PI * 0.5) * 0.12;
        d.copy(aim).applyAxisAngle(up, ang);
        d.applyAxisAngle(right, Math.sin(L.phase * Math.PI * 0.25 + i * 0.1) * 0.05);
      } else if (L.pattern === 'tunnel') {
        const a = (i / it.N) * Math.PI * 2 + L.phase * 0.8;
        d.copy(aim).addScaledVector(right, Math.cos(a) * 0.12).addScaledVector(up, Math.sin(a) * 0.12).normalize();
      } else if (L.pattern === 'cone') {
        // rays on the surface of a turning cone that opens and closes
        const half = 0.1 + L.spread * 0.3 * (0.6 + 0.4 * Math.sin(L.phase * 0.5));
        const a = (i / L.beams) * Math.PI * 2 + L.phase * 0.9;
        d.copy(aim).multiplyScalar(Math.cos(half)).addScaledVector(right, Math.cos(a) * Math.sin(half)).addScaledVector(up, Math.sin(a) * Math.sin(half));
      } else if (L.pattern === 'sheet') {
        // a flat curtain of rays that rolls round the aim axis
        const ang = (L.beams > 1 ? i / (L.beams - 1) - 0.5 : 0) * L.spread * scan * 1.3;
        const roll = L.phase * 0.35;
        const axis = right.clone().applyAxisAngle(aim, roll);
        d.copy(aim).applyAxisAngle(axis.clone().cross(aim).normalize(), ang);
      } else if (L.pattern === 'wave') {
        const x = L.beams > 1 ? i / (L.beams - 1) - 0.5 : 0;
        d.copy(aim).applyAxisAngle(up, x * L.spread * scan * 1.2);
        d.applyAxisAngle(right, Math.sin(L.phase * 0.9 + x * 7) * 0.22);
      } else if (L.pattern === 'burst') {
        // a starburst: rays at golden-angle spacing, the whole star slowly turning and breathing
        const a = i * 2.39996 + L.phase * 0.5, r = Math.sqrt((i + 0.5) / L.beams) * (0.2 + L.spread * 0.45) * (0.75 + 0.25 * Math.sin(L.phase * 1.3));
        d.copy(aim).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      } else d.copy(aim);
      this.raycaster.set(origin, d);
      this.raycaster.far = 80;
      const hit = this.raycaster.intersectObjects(this.colliders, false)[0];
      const len = hit ? hit.distance : 80;
      cone.position.copy(origin);
      cone.quaternion.setFromUnitVectors(UP, d);
      const u = cone.material.uniforms;
      u.uLen.value = len; u.uR0.value = 0.02; u.uR1.value = 0.02 + len * 0.0006; u.uFall.value = 0.012;
      const k = dim * 1.6 * perRay * this.glareFor(origin, d);
      u.uColor.value.set(rgb[0] * k, rgb[1] * k, rgb[2] * k);
      u.uHaze.value = 0.25 + 0.75 * this.haze;
      u.uGain.value = 2.2;
      if (hit && hit.face) {
        const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (nrm.dot(d) > 0) nrm.negate();
        dot.position.copy(hit.point).addScaledVector(nrm, 0.03);
        dot.quaternion.setFromUnitVectors(FRONT, nrm);
        dot.scale.setScalar(0.45);
        dot.material.color.setRGB(rgb[0] * dim * 1.3, rgb[1] * dim * 1.3, rgb[2] * dim * 1.3);
        dot.visible = true;
      }
    }
  }
}

// A laser line is one pure colour (red, green, blue or a mix of two): saturate whatever the palette asked for.
function laserColor(rgb) {
  const mx = Math.max(...rgb, 1e-6), mn = Math.min(...rgb);
  const k = mx - mn < 0.08 ? [1, 1, 1] : rgb.map((v) => Math.pow((v - mn) / (mx - mn), 1.4));
  return k;
}

const FRONT = new THREE.Vector3(0, 0, 1);
const PRISM_X = new THREE.Vector3(1, 0, 0);
let spotTexture = null;
// a soft round disc lying on a surface where a beam or a laser lands
function makeSpot() {
  if (!spotTexture) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    spotTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: spotTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false; m.frustumCulled = false;
  return m;
}

let glowTexture = null;
// a hot core with long flare spikes: the head of a moving light seen from the audience
function makeGlow() {
  if (!glowTexture) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6; i++) { // spikes
      g.save(); g.translate(128, 128); g.rotate((i / 6) * Math.PI + 0.26);
      const sp = g.createLinearGradient(-128, 0, 128, 0);
      sp.addColorStop(0, 'rgba(255,255,255,0)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sp; g.fillRect(-128, -1.2, 256, 2.4); g.restore();
    }
    glowTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
  m.visible = false; m.frustumCulled = false;
  return m;
}

// critically-damped-ish approach with a hard speed limit (deg per frame)
function slew(cur, target, maxStep, dt) {
  const want = (target - cur) * Math.min(1, dt * 14);
  return cur + Math.max(-maxStep, Math.min(maxStep, want));
}

function lightOf(pos, dir, angle, rgb, w) {
  const half = Math.max(1.5, angle / 2) * D2R;
  return {
    pos: pos.clone(), dir: dir.clone(),
    cosOuter: Math.cos(half * 1.15), cosInner: Math.cos(half * 0.55),
    // illuminance ~ output / beam cross-section: narrow beams make small hot spots
    col: rgb.map((v) => (v * w * 0.5) / (Math.tan(half) ** 2 + 0.006)),
    w: w * Math.max(...rgb),
  };
}
