// Two venues for weddings and private events, added next to the original three (which are untouched):
//   hall: an indoor banquet hall with a stage, a dance floor and round tables
//   lawn: an open-air wedding lawn at night with a mandap stage, a dance floor, tables and string lights
// Coordinates: metres, x right, y up, z towards the guests; the stage is at negative z, the same convention as the other venues.
import * as THREE from 'three';
import { surfaceMaterial, practical, mergeTruss } from './stage.js';
import { Batch, groundTexture, skyDome, skyline, treeBelt, bulbString, bulbMesh } from './env.js';
import { Crowd, standingField } from './people.js';
import { LedScreen } from './screens.js';

const V = (...a) => new THREE.Vector3(...a);
const finish = (kind, group, colliders, extra) => ({ kind, group, colliders, screens: [], practicals: [], ...extra });
const addCrowd = (group, crowd) => { const g = crowd.build(); group.add(g); return g; };
function ledPanel(w, h, pos, ry = 0, res = 320) {
  const s = new LedScreen(w, h, { res });
  s.mesh.position.set(...pos); s.mesh.rotation.y = ry;
  return s;
}

// a round table with a cloth, a glowing centrepiece and chairs round it; returns where each chair is
function roundTable(B, M, x, z, chairs = 6, r = 0.95) {
  B.tube(M.cloth, r, r, 0.74, x, 0, z, 18);
  B.tube(M.cloth, 0.1, 0.1, 0.74, x, 0, z, 6);
  B.tube(M.glow, 0.07, 0.07, 0.16, x, 0.74, z, 8);
  const spots = [];
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + 0.3, cx = x + Math.sin(a) * (r + 0.42), cz = z + Math.cos(a) * (r + 0.42);
    B.box(M.chair, 0.46, 0.08, 0.46, cx, 0.46, cz, a);
    B.box(M.chair, 0.46, 0.5, 0.06, cx + Math.sin(a) * 0.2, 0.74, cz + Math.cos(a) * 0.2, a);
    spots.push([cx, cz, a]);
  }
  return spots;
}

// ============================================================ BANQUET HALL ============================================================
export function hall() {
  const group = new THREE.Group();
  const B = new Batch();
  const M = {
    floor: surfaceMaterial(0x2a211b, { sheen: 0.85 }),
    parquet: surfaceMaterial(0x5a4030, { sheen: 1.0 }),
    carpet: surfaceMaterial(0x6a1420),
    ceiling: surfaceMaterial(0x1c1716, { side: THREE.DoubleSide }),
    wall: surfaceMaterial(0x3b2e2a),
    panel: surfaceMaterial(0x2c211f, { sheen: 0.3 }),
    gold: surfaceMaterial(0xb08a3a, { sheen: 0.8 }),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.4 }),
    black: surfaceMaterial(0x121214, { sheen: 0.3 }),
    cloth: surfaceMaterial(0xe9e2d4, { sheen: 0.1 }),
    chair: surfaceMaterial(0x7a2a2a, { sheen: 0.2 }),
    glow: surfaceMaterial(0x000000, { emissive: 0xffb060 }),
    floral: surfaceMaterial(0x000000, { emissive: 0xff7a3a }),
    floral2: surfaceMaterial(0x000000, { emissive: 0xff4f86 }),
    cove: surfaceMaterial(0x000000, { emissive: 0xffc890 }),
    sofa: surfaceMaterial(0x8a1c28, { sheen: 0.3 }),
    steel: surfaceMaterial(0xc9ccd2, { sheen: 0.9 }),
  };
  const colliders = [], practicals = [], T = [];
  const W = 24, D = 30, H = 5.0, z0 = -9, zc = z0 + D / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), M.floor);
  floor.position.set(0, 0, zc);
  group.add(floor); colliders.push(floor);
  B.box(M.ceiling, W, 0.1, D, 0, H, zc);
  B.box(M.wall, 0.2, H, D, -W / 2, H / 2, zc); B.box(M.wall, 0.2, H, D, W / 2, H / 2, zc);
  B.box(M.wall, W, H, 0.2, 0, H / 2, z0 + D); B.box(M.wall, W, H, 0.2, 0, H / 2, z0);
  // wall panels with gold trim and a glowing cove along the ceiling edge
  for (let z = -6; z < 20; z += 3) for (const s of [-1, 1]) { B.box(M.panel, 0.06, 3.0, 2.4, s * (W / 2 - 0.13), 1.9, z); B.box(M.gold, 0.08, 3.1, 0.05, s * (W / 2 - 0.13), 1.9, z + 1.25); }
  B.box(M.cove, 0.06, 0.06, D - 1, -W / 2 + 0.2, H - 0.25, zc); B.box(M.cove, 0.06, 0.06, D - 1, W / 2 - 0.2, H - 0.25, zc);
  B.box(M.cove, W - 1, 0.06, 0.06, 0, H - 0.25, z0 + D - 0.2);
  // dance floor and a carpet runner from the door to the stage
  B.box(M.parquet, 9.6, 0.03, 13.2, 0, 0.02, 6);
  B.box(M.carpet, 2.0, 0.025, 7.0, 0, 0.018, 17.2);

  // stage with steps, a floral arch, the couple's seats and an LED wall
  B.box(M.black, 11.4, 0.9, 5.0, 0, 0.45, -6.5);
  B.box(M.black, 3.2, 0.45, 0.6, 0, 0.225, -3.7); // steps up to the stage
  for (const s of [-1, 1]) { B.box(M.gold, 0.3, 3.5, 0.3, s * 3.6, 0.9 + 1.75, -5.2); B.box(M.floral, 0.45, 3.0, 0.45, s * 3.6, 0.9 + 1.6, -5.2); }
  B.box(M.gold, 7.8, 0.35, 0.4, 0, 0.9 + 3.55, -5.2); B.box(M.floral2, 7.2, 0.3, 0.5, 0, 0.9 + 3.2, -5.2);
  for (const s of [-1, 1]) B.box(M.sofa, 1.1, 0.9, 0.9, s * 0.9, 0.9 + 0.45, -6.3);
  B.box(M.black, 9.8, 4.2, 0.2, 0, 3.0, z0 + 0.4);
  const wall = ledPanel(9, 3.4, [0, 2.9, z0 + 0.55], 0, 256);

  // tables: two columns each side of the dance floor, with guests at them
  const tables = [];
  for (const x of [-9.6, -6.9, 6.9, 9.6]) for (const z of [0.5, 4.5, 8.5, 12.5, 16.5]) {
    const chairs = roundTable(B, M, x, z, 6);
    tables.push({ x, z, chairs });
    if ((x + z) % 2 < 1) practicals.push(practical([x, 0.95, z], [1.6, 1.0, 0.5], { reach: 0.55 }));
  }
  // buffet along the right wall
  B.box(M.cloth, 1.0, 0.95, 12, 11.1, 0.48, 9.5); B.box(M.glow, 0.06, 0.05, 11.6, 10.58, 0.9, 9.5);
  for (let i = 0; i < 6; i++) B.box(M.steel, 0.5, 0.2, 0.7, 11.1, 1.05, 4.5 + i * 1.9);
  practicals.push(practical([11.0, 1.4, 9.5], [1.8, 1.1, 0.5], { reach: 0.9 }));

  // chandeliers and fairy lights
  const bulbs = [];
  for (const z of [3, 8, 13]) {
    B.cyl(M.metal, [0, H, z], [0, H - 0.7, z], 0.012, 3);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; bulbs.push(V(Math.sin(a) * 0.55, H - 0.9, z + Math.cos(a) * 0.55)); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; bulbs.push(V(Math.sin(a) * 0.3, H - 1.15, z + Math.cos(a) * 0.3)); }
    practicals.push(practical([0, H - 1.0, z], [3.0, 2.2, 1.2], { reach: 0.9 }));
  }
  for (const z of [-1, 5, 11, 17]) bulbs.push(...bulbString([-W / 2 + 0.3, H - 0.25, z], [W / 2 - 0.3, H - 0.25, z], { sag: 0.5, spacing: 0.55 }));
  group.add(bulbMesh(bulbs, [4.2, 3.0, 1.5], 0.05));

  // truss: front of stage, behind the performers, and two bars over the dance floor
  T.push([[-7.5, 4.2, -3.6], [7.5, 4.2, -3.6]]);
  T.push([[-6.4, 3.9, -7.6], [6.4, 3.9, -7.6]]);
  T.push([[-6.0, 4.3, 3.0], [6.0, 4.3, 3.0]]);
  T.push([[-6.0, 4.3, 9.0], [6.0, 4.3, 9.0]]);
  T.push([[-6.0, 4.3, 3.0], [-6.0, 4.3, 9.0]], [[6.0, 4.3, 3.0], [6.0, 4.3, 9.0]]);
  for (const [x, z] of [[-7.5, -3.6], [7.5, -3.6], [-6.4, -7.6], [6.4, -7.6], [-6, 3], [6, 3], [-6, 9], [6, 9], [0, 3], [0, 9]]) B.cyl(M.metal, [x, 4.2, z], [x, H, z], 0.016, 4);
  group.add(new THREE.Mesh(mergeTruss(T, 0.3), M.metal));
  colliders.push(...B.build(group, [M.wall, M.ceiling]));

  // people: guests dancing, guests at the tables, the couple and a DJ on the stage
  const crowd = new Crowd();
  standingField(crowd, { x0: -4.2, x1: 4.2, z0: 0.6, z1: 11.6, spacing: 0.95, density: (z) => (z < 6 ? 0.9 : 0.7), faceTo: [0, 1.5, -6], look: 'casual', mode: 1, seed: 61, fRatio: 0.5 });
  let k = 0;
  for (const t of tables) for (const [cx, cz, a] of t.chairs.filter((_, i) => i % 2 === 0)) crowd.add({ variant: (k % 2) ? 'F' : 'M', mode: 5, x: cx, y: 0, z: cz, yaw: a + Math.PI, look: 'casual', seed: 700 + k++ });
  crowd.add({ variant: 'M', mode: 4, x: 0.9, y: 0.9, z: -5.2, yaw: 0, look: 'perf', seed: 901, role: 1 });
  crowd.add({ variant: 'F', mode: 4, x: -0.9, y: 0.9, z: -5.2, yaw: 0, look: 'perf', seed: 902, role: 1 });
  crowd.add({ variant: 'M', mode: 4, x: 4.4, y: 0.9, z: -7.2, yaw: 0, look: 'club', seed: 903, role: 2 });

  return finish('hall', group, colliders, {
    crowd: addCrowd(group, crowd),
    screens: [wall],
    practicals,
    sky: new THREE.Group(),
    atmos: { fogBase: [0.006, 0.005, 0.004], density: 0.02, tintGain: 0.14, ambient: [0.02, 0.016, 0.012], exposure: 1.0, bloom: 0.65, beamHaze: 1.6 },
    info: {
      est: ['room size 24 x 30 m, ceiling 5 m', 'table and guest counts'],
      stage: [0, 2.0, -6.5], crowdCentre: [0, 0, 6],
      foh: [0, 2.5, 17.6], fohAim: [0, 2.2, -6.5],
      eye: [[3, 1.7, 9], [-3.4, 1.7, 12], [2, 1.7, 3], [0, 1.7, 15]],
      pit: { pos: [2.2, 1.5, -1.6], aim: [0, 3.2, -6.5] },
      stagePov: { pos: [0, 2.1, -6.8], aim: [0, 2.4, 14] },
      orbit: { centre: [0, 0, 6], radius: 7.5, alt: [2.6, 3.6], aim: [0, 2.4, 5], arc: 1.2 },
      reveal: { from: [0, 1.9, 18.5], to: [0, 3.6, 11], aim0: [0, 2.2, -6.5], aim1: [0, 3.0, 0] },
      fly: [[0, 3.4, 18], [0, 3.6, 12], [0, 3.5, 6], [0, 3.2, 0], [0, 3.0, -4.5]],
      top: { centre: [0, 0, 6], alt: 11, fov: 84 },
      crane: [
        { pts: [[-6, 2.0, 0], [-3, 3.0, 3], [2, 3.4, 6], [6, 2.6, 8]], aim0: [-1, 2.8, -6], aim1: [1, 3.0, -6], fov: [62, 52] },
        { pts: [[0, 1.8, 10], [0, 2.8, 8], [0, 3.8, 6]], aim0: [0, 2.4, -6.5], aim1: [0, 3.6, -1], fov: [66, 54] },
        { pts: [[5, 2.4, -2], [3, 3.2, 1], [-1, 3.6, 4], [-4.6, 2.6, 8]], aim0: [0, 3.4, 9], aim1: [0, 3.8, 6], fov: [64, 56] },
      ],
      bounds: { x: [-10.8, 10.8], z: [-3, 19.5] },
      walkStart: [0, 1.65, 16],
    },
  });
}

// ============================================================ WEDDING LAWN ============================================================
export function lawn() {
  const group = new THREE.Group();
  const B = new Batch();
  const M = {
    grass: surfaceMaterial(0xffffff, { map: groundTexture('grass'), mapScale: 1 / 10, sheen: 0.02 }),
    parquet: surfaceMaterial(0x5a4030, { sheen: 1.0 }),
    carpet: surfaceMaterial(0x7a1626),
    deck: surfaceMaterial(0x2c2118, { sheen: 0.4 }),
    gold: surfaceMaterial(0xb08a3a, { sheen: 0.8 }),
    cream: surfaceMaterial(0xe8dcc0),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.4 }),
    pole: surfaceMaterial(0x4a3a2a),
    cloth: surfaceMaterial(0xe9e2d4, { sheen: 0.1 }),
    chair: surfaceMaterial(0xd8c9a0, { sheen: 0.2 }),
    glow: surfaceMaterial(0x000000, { emissive: 0xffb060 }),
    floral: surfaceMaterial(0x000000, { emissive: 0xff7a3a }),
    floral2: surfaceMaterial(0x000000, { emissive: 0xff4f86 }),
    sofa: surfaceMaterial(0x8a1c28, { sheen: 0.3 }),
    tent: surfaceMaterial(0xcfc3a6),
    black: surfaceMaterial(0x121214, { sheen: 0.3 }),
  };
  const colliders = [], practicals = [], T = [];

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), M.grass);
  ground.position.set(0, 0, 8);
  group.add(ground); colliders.push(ground);
  B.box(M.parquet, 10, 0.04, 9, 0, 0.03, 8);       // dance floor
  B.box(M.carpet, 2.2, 0.03, 14, 0, 0.02, 20);     // aisle runner

  // mandap stage: deck, four pillars, a canopy with gold trim, floral strips, seats, LED backdrop
  B.box(M.deck, 11, 0.8, 5.4, 0, 0.4, -5.8);
  for (const [x, z] of [[-3, -7.6], [3, -7.6], [-3, -4.0], [3, -4.0]]) { B.box(M.gold, 0.28, 3.4, 0.28, x, 0.8 + 1.7, z); B.box(M.floral, 0.36, 2.6, 0.36, x, 0.8 + 1.5, z); }
  B.box(M.cream, 7.4, 0.18, 4.4, 0, 0.8 + 3.5, -5.8); B.box(M.gold, 7.6, 0.12, 4.6, 0, 0.8 + 3.36, -5.8);
  B.box(M.floral2, 6.6, 0.22, 0.2, 0, 0.8 + 3.1, -4.0); B.box(M.floral, 6.6, 0.22, 0.2, 0, 0.8 + 3.1, -7.6);
  for (const s of [-1, 1]) B.box(M.sofa, 1.2, 0.9, 0.9, s * 0.9, 0.8 + 0.45, -6.2);
  B.box(M.black, 10.4, 4.0, 0.2, 0, 2.8, -8.9);
  const wall = ledPanel(9.6, 3.6, [0, 2.8, -8.78], 0, 256);

  // ceremony seating on both sides of the aisle, and round tables beyond
  for (let row = 0; row < 8; row++) for (const s of [-1, 1]) for (let i = 0; i < 5; i++) B.box(M.chair, 0.42, 0.85, 0.42, s * (1.5 + i * 0.62), 0.43, 14 + row * 0.9);
  const tables = [];
  for (const x of [-10.5, -13.8, 10.5, 13.8]) for (const z of [-1, 3, 7, 11]) {
    const chairs = roundTable(B, M, x, z, 6); tables.push({ x, z, chairs });
    if ((x + z) % 2 < 1) practicals.push(practical([x, 0.95, z], [1.6, 1.0, 0.5], { reach: 0.55 }));
  }

  // marquee tents at the back, string-light poles all round
  for (const x of [-9, 9]) { B.box(M.tent, 7, 2.6, 4.5, x, 1.3, 27.5); B.box(M.tent, 7.4, 0.2, 5, x, 2.8, 27.5, 0, 0.0); practicals.push(practical([x, 2.2, 25], [2.4, 1.6, 0.8], { reach: 0.7 })); }
  const bulbs = [], poles = [];
  for (const s of [-1, 1]) for (let z = -4; z <= 24; z += 7) { B.tube(M.pole, 0.05, 0.07, 6.2, s * 16, 0, z, 6); poles.push([s * 16, 6.2, z]); }
  for (const z of [-4, 3, 10, 17, 24]) {
    const l = poles.find((p) => p[0] < 0 && p[2] === z), r = poles.find((p) => p[0] > 0 && p[2] === z);
    if (l && r) bulbs.push(...bulbString(l, r, { sag: 1.1, spacing: 0.6 }));
  }
  for (const s of [-1, 1]) { const side = poles.filter((p) => Math.sign(p[0]) === s); for (let i = 0; i + 1 < side.length; i++) bulbs.push(...bulbString(side[i], side[i + 1], { sag: 0.6, spacing: 0.55 })); }
  for (const p of poles) practicals.push(practical(p, [3.2, 2.4, 1.2], { reach: 0.5 }));
  group.add(bulbMesh(bulbs, [4.4, 3.2, 1.6], 0.06));

  // truss for the lights: a front bar and a rear bar over the stage, a bar over the dance floor, on posts
  T.push([[-7.5, 5.2, -3.2], [7.5, 5.2, -3.2]]);
  T.push([[-6.4, 4.6, -8.2], [6.4, 4.6, -8.2]]);
  T.push([[-6, 5.6, 4], [6, 5.6, 4]]);
  T.push([[-6, 5.6, 12], [6, 5.6, 12]]);
  T.push([[-6, 5.6, 4], [-6, 5.6, 12]], [[6, 5.6, 4], [6, 5.6, 12]]);
  for (const [x, z, y] of [[-7.5, -3.2, 5.2], [7.5, -3.2, 5.2], [-6.4, -8.2, 4.6], [6.4, -8.2, 4.6], [-6, 4, 5.6], [6, 4, 5.6], [-6, 12, 5.6], [6, 12, 5.6]]) B.tube(M.metal, 0.07, 0.09, y, x, 0, z, 6);
  group.add(new THREE.Mesh(mergeTruss(T, 0.32), M.metal));
  colliders.push(...B.build(group, [M.deck]));

  group.add(skyDome({ top: [0.004, 0.008, 0.03], horizon: [0.04, 0.035, 0.06], glow: [0.6, 0.35, 0.14], glowAmount: 0.5 }));
  group.add(skyline({ count: 36, rMin: 110, rMax: 170, hMin: 12, hMax: 40, seed: 8, lit: 0.35 }));
  group.add(treeBelt({ count: 80, rMin: 34, rMax: 52, center: [0, 8], seed: 14, hMin: 7, hMax: 12 }));

  const crowd = new Crowd();
  standingField(crowd, { x0: -4.4, x1: 4.4, z0: 4.2, z1: 11.8, spacing: 0.95, density: () => 0.8, faceTo: [0, 1.5, -6], look: 'casual', mode: 1, seed: 71, fRatio: 0.5 });
  let k = 0;
  for (const t of tables) for (const [cx, cz, a] of t.chairs.filter((_, i) => i % 2 === 0)) crowd.add({ variant: (k % 2) ? 'F' : 'M', mode: 5, x: cx, y: 0, z: cz, yaw: a + Math.PI, look: 'casual', seed: 800 + k++ });
  crowd.add({ variant: 'M', mode: 4, x: 0.9, y: 0.8, z: -5.4, yaw: 0, look: 'perf', seed: 911, role: 1 });
  crowd.add({ variant: 'F', mode: 4, x: -0.9, y: 0.8, z: -5.4, yaw: 0, look: 'perf', seed: 912, role: 1 });

  return finish('lawn', group, colliders, {
    crowd: addCrowd(group, crowd),
    screens: [wall],
    practicals,
    sky: new THREE.Group(),
    atmos: { fogBase: [0.008, 0.006, 0.005], density: 0.008, tintGain: 0.1, ambient: [0.014, 0.012, 0.02], exposure: 0.9, bloom: 0.55, beamHaze: 1.4 },
    info: {
      est: ['lawn size', 'table and guest counts', 'string-light layout'],
      stage: [0, 2.4, -6], crowdCentre: [0, 0, 8],
      foh: [0, 3.2, 26], fohAim: [0, 2.6, -6],
      eye: [[3, 1.7, 12], [-4, 1.7, 6], [2, 1.7, 1], [0, 1.7, 18]],
      pit: { pos: [2.5, 1.5, -1.2], aim: [0, 3.2, -6] },
      stagePov: { pos: [0, 2.0, -5.5], aim: [0, 2.2, 14] },
      orbit: { centre: [0, 0, 9], radius: 20, alt: [7, 12], aim: [0, 1.5, 8], arc: 1.5 },
      reveal: { from: [0, 2.6, 32], to: [0, 12, 22], aim0: [0, 2, -6], aim1: [0, 1.5, 6] },
      fly: [[0, 9, 30], [0, 7, 20], [1, 5.5, 12], [0, 5, 4], [0, 5.5, -2]],
      top: { centre: [0, 0, 9], alt: 30 },
      crane: [
        { pts: [[-9, 3, 2], [-4, 4.4, 4], [2, 5.4, 6], [8, 4.2, 5]], aim0: [-1, 2, -6], aim1: [1, 2.4, -6], fov: [58, 48] },
        { pts: [[0, 2.2, 12], [0, 4, 10], [0, 6.4, 8]], aim0: [0, 2.4, -6], aim1: [0, 3, -2], fov: [62, 50] },
        { pts: [[8, 2.2, 18], [7, 2.6, 12], [5.6, 3, 7]], aim0: [0, 3.4, 9], aim1: [0, 3.6, 5], fov: [64, 54] },
      ],
      bounds: { x: [-14, 14], z: [-2, 24] },
      walkStart: [3, 1.65, 18],
    },
  });
}
