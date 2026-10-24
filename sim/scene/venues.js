// Venues: a concert main stage in an outdoor field, a Navratri garba ground, and a club.
//
// Layout references (text sources, see docs/REFERENCES.md): festival rigs use ground-support towers
// carrying a roof and truss grid with flown line arrays either side and subs at the deck edge;
// IMAG screens beside the stage and delay towers 50-70 m out; FOH centred facing the stage
// (Sound on Sound, Soulsound, ProSoundWeb, Festival Insights). Garba grounds use concentric
// dance rings around a lamp/garbi with a stage at one end, light towers, string-light canopies and
// marigold decoration (Hire4Event, Shrih, Outlook Traveller). Club: ~22 ft ceiling, truss over the
// booth, LED backdrop, dance-floor density of roughly 3 sq ft per guest (ADJ, venue guides).
// Dimensions not stated by a source are estimates and marked `est` in info.est.
import * as THREE from 'three';
import { surfaceMaterial, practical, mergeTruss, trussGeometry } from './stage.js';
import { Batch, groundTexture, rangoliTexture, skyDome, skyline, treeBelt, bulbString, bulbMesh, rng } from './env.js';
import { Crowd, standingField, danceRings } from './people.js';
import { LedScreen } from './screens.js';
import { hall, lawn } from './venues2.js';

export const DECK = 1.2;

const V = (...a) => new THREE.Vector3(...a);

function finish(kind, group, colliders, extra) {
  return { kind, group, colliders, screens: [], practicals: [], ...extra };
}

function ledPanel(w, h, pos, ry = 0, res = 320) {
  const s = new LedScreen(w, h, { res });
  s.mesh.position.set(...pos);
  s.mesh.rotation.y = ry;
  return s;
}

function addCrowd(group, crowd) {
  const g = crowd.build();
  group.add(g);
  return g;
}

// ============================================================ CONCERT ============================================================

function concert() {
  const group = new THREE.Group();
  const B = new Batch();
  const M = {
    ground: surfaceMaterial(0xffffff, { map: groundTexture('grass'), mapScale: 1 / 16, sheen: 0.02 }),
    trampled: surfaceMaterial(0xffffff, { map: groundTexture('trampled'), mapScale: 1 / 10 }),
    deck: surfaceMaterial(0x3a3a3f, { sheen: 0.35 }),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.35 }),
    black: surfaceMaterial(0x1c1c20, { sheen: 0.15 }),
    cloth: surfaceMaterial(0x17171b, { side: THREE.DoubleSide }),
    pa: surfaceMaterial(0x25262b, { sheen: 0.35 }),
    barrier: surfaceMaterial(0x9a9da2, { sheen: 0.5 }),
    fence: surfaceMaterial(0x1f2326, { side: THREE.DoubleSide }),
    tent: surfaceMaterial(0xdcd6c8, { side: THREE.DoubleSide }),
    wood: surfaceMaterial(0x6b4a2e),
    gold: surfaceMaterial(0xd9a400, { sheen: 0.6 }),
    ledEdge: surfaceMaterial(0x000000, { emissive: 0x1d6fff }),
  };
  const colliders = [];
  const practicals = [];
  const stageTruss = [];

  // ground: field, trampled crowd area
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), M.ground);
  ground.position.set(0, 0, 60);
  group.add(ground); colliders.push(ground);
  const mud = new THREE.Mesh(new THREE.PlaneGeometry(64, 90).rotateX(-Math.PI / 2), M.trampled);
  mud.position.set(0, 0.015, 48);
  group.add(mud); colliders.push(mud);

  // stage deck with a black fascia and front LED edge strip
  B.box(M.deck, 22, DECK, 12, 0, DECK / 2, -5.5);
  B.box(M.black, 22.2, 0.05, 0.05, 0, DECK + 0.02, 0.52);
  // roof: ground-support towers, perimeter and cross trusses, sloped fabric roof
  const towers = [[-11.6, 0.4], [11.6, 0.4], [-11.6, -10.9], [11.6, -10.9]];
  for (const [x, z] of towers) stageTruss.push([[x, 0, z], [x, 11.5, z]]);
  const roofY = 11.5;
  stageTruss.push([[-11.6, roofY, 0.4], [11.6, roofY, 0.4]], [[-11.6, roofY, -10.9], [11.6, roofY, -10.9]], [[-11.6, roofY, 0.4], [-11.6, roofY, -10.9]], [[11.6, roofY, 0.4], [11.6, roofY, -10.9]], [[-11.6, roofY, -5.2], [11.6, roofY, -5.2]]);
  // flown lighting trusses (y 8.25), hung from the roof grid on chains
  for (const z of [-0.6, -2.5, -4, -7]) {
    stageTruss.push([[-9.5, 8.25, z], [9.5, 8.25, z]]);
    for (const x of [-9.5, 9.5]) B.cyl(M.metal, [x, 8.25, z], [x, roofY, z], 0.015, 4);
  }
  stageTruss.push([[-9.5, 8.25, -0.6], [-9.5, 8.25, -7]], [[9.5, 8.25, -0.6], [9.5, 8.25, -7]]);
  stageTruss.push([[-3, 6.65, -8.2], [3, 6.65, -8.2]]); // carries the star cloth
  stageTruss.push([[6.5, 6.3, -0.4], [9, 6.3, -0.4]], [[-9, 6.3, -0.4], [-6.5, 6.3, -0.4]]);
  for (const x of [6.5, 9, -6.5, -9]) B.cyl(M.metal, [x, 6.3, -0.4], [x, 8.25, -0.4], 0.015, 4);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(26, 0.14, 12.8), M.cloth);
  roof.position.set(0, roofY + 0.2, -5.2); roof.rotation.x = 0.04;
  group.add(roof);
  B.box(M.cloth, 26, 1.1, 0.1, 0, roofY - 0.45, 0.5); // front valance
  // rear LED wall carried by a truss frame standing on the deck
  stageTruss.push([[-7.9, DECK, -10.95], [-7.9, 8.4, -10.95]], [[7.9, DECK, -10.95], [7.9, 8.4, -10.95]], [[-7.9, 8.4, -10.95], [7.9, 8.4, -10.95]]);
  const back = ledPanel(15, 6.4, [0, DECK + 0.2 + 3.2, -10.7]);
  // side IMAG screens, each on its own truss frame
  const imagL = ledPanel(6.4, 3.6, [-18.6, 6.6, -1.4], 0.2), imagR = ledPanel(6.4, 3.6, [18.6, 6.6, -1.4], -0.2);
  for (const s of [-1, 1]) {
    for (const dx of [-3.4, 3.4]) stageTruss.push([[s * 18.6 + dx, 0, -1.9], [s * 18.6 + dx, 8.9, -1.9]]);
    stageTruss.push([[s * 18.6 - 3.4, 8.9, -1.9], [s * 18.6 + 3.4, 8.9, -1.9]], [[s * 18.6 - 3.4, 4.7, -1.9], [s * 18.6 + 3.4, 4.7, -1.9]]);
  }
  // flown PA: line arrays curve outwards from the top, rigged under the roof
  for (const s of [-1, 1]) {
    const x = s * 12.7, z = 1.2;
    B.cyl(M.metal, [x, roofY, z], [x, 10.5, z], 0.03, 5);
    for (let i = 0; i < 14; i++) {
      const y = 10.2 - i * 0.37, tilt = -0.02 - i * 0.026;
      B.box(M.pa, 0.72, 0.34, 0.55, x, y, z, 0, tilt);
      B.box(M.black, 0.62, 0.22, 0.02, x, y, z + 0.28, 0, tilt);
    }
    // sub stacks: cardioid arrays in front of the deck
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) B.box(M.pa, 1.2, 0.62, 0.9, s * (3.4 + i * 1.25), 0.31 + k * 0.62, 1.15);
    // outfill hangs and monitor wedges
    for (let i = 0; i < 6; i++) B.box(M.pa, 0.7, 0.32, 0.5, s * 20.8, 9.0 - i * 0.34, -0.4, 0, -0.03 * i);
  }
  for (let i = 0; i < 6; i++) B.box(M.pa, 0.7, 0.35, 0.45, -2.5 + i * 1.0, DECK + 0.18, -0.2, 0, 0.7); // monitor wedges
  // crowd barrier with posts, security line
  B.box(M.barrier, 30, 1.1, 0.06, 0, 0.6, 2.9);
  for (let x = -15; x <= 15; x += 2.5) B.box(M.barrier, 0.07, 1.15, 0.5, x, 0.6, 2.9);
  // FOH: raised platform, canopy, desks with glowing screens, operators
  B.box(M.deck, 9, 1.0, 5.5, 0, 0.5, 27);
  for (const [x, z] of [[-4.3, 24.4], [4.3, 24.4], [-4.3, 29.6], [4.3, 29.6]]) B.cyl(M.metal, [x, 1, z], [x, 4.2, z], 0.06, 5);
  const foh = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 6.2), M.cloth);
  foh.position.set(0, 4.3, 27); group.add(foh);
  B.box(M.black, 3.2, 0.9, 1.2, -1.6, 1.45, 26.2); B.box(M.black, 2.4, 0.9, 1.2, 2.6, 1.45, 26.2);
  const fohGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.9, 1.6) }));
  fohGlow.position.set(-1.6, 2.0, 25.55); fohGlow.rotation.x = -0.35; group.add(fohGlow);
  practicals.push(practical([0, 3.7, 26.5], [0.9, 1.0, 1.2], { reach: 0.8 }));
  // delay towers with PA and a second set of IMAG
  for (const s of [-1, 1]) {
    stageTruss.push([[s * 17, 0, 47], [s * 17, 8.2, 47]]);
    for (let i = 0; i < 8; i++) B.box(M.pa, 0.72, 0.34, 0.55, s * 17, 7.9 - i * 0.37, 47.6, 0, -0.03 * i);
    B.box(M.black, 1.0, 1.0, 1.0, s * 17, 0.5, 47);
  }
  // perimeter: shade-cloth fence with banners, light masts
  B.box(M.fence, 74, 2.2, 0.1, 0, 1.1, 96); B.box(M.fence, 0.1, 2.2, 100, -37, 1.1, 46); B.box(M.fence, 0.1, 2.2, 100, 37, 1.1, 46);
  B.box(M.fence, 22, 2.2, 0.1, -26, 1.1, -3.5); B.box(M.fence, 22, 2.2, 0.1, 26, 1.1, -3.5);
  const rf = rng(77);
  const banners = [];
  for (let x = -34; x <= 34; x += 6) { B.box(surfaceMaterial([0xc8102e, 0x1c5bd8, 0xf2a900, 0x0b8f5a][Math.floor(rf() * 4)], { side: THREE.DoubleSide }), 3.6, 1.2, 0.04, x, 1.5, 95.9); }
  for (const [x, z] of [[-32, 25], [32, 25], [-32, 65], [32, 65]]) { B.cyl(M.metal, [x, 0, z], [x, 11, z], 0.1, 6); B.box(M.black, 1.6, 0.4, 0.8, x, 11.1, z); }
  // food and bar tents inside the fence
  const tentLights = [];
  for (const s of [-1, 1]) for (const z of [18, 34, 52, 70]) {
    const x = s * 31;
    B.box(M.tent, 6, 2.6, 4, x, 1.3, z);
    const roofG = new THREE.ConeGeometry(4.6, 1.4, 4); roofG.rotateY(Math.PI / 4); roofG.translate(x, 3.3, z); B.add(M.tent, roofG);
    B.box(surfaceMaterial(0x000000, { emissive: 0x6a3a14 }), 5.4, 0.9, 0.05, x - s * 0, 1.8, z - s * 0 + 2.05 * 0);
    practicals.push(practical([x - s * 3.4, 2.4, z], [2.2, 1.5, 0.8], { reach: 1 }));
    tentLights.push(V(x - s * 3.2, 2.6, z - 1.2), V(x - s * 3.2, 2.6, z + 1.2));
  }
  group.add(bulbMesh(tentLights, [5, 3.2, 1.6], 0.1));
  // cameras on risers, a jib
  B.box(M.black, 2.4, 1.2, 2.4, -9, 0.6, 14); B.box(M.black, 2.4, 1.2, 2.4, 9, 0.6, 14);

  const stageT = new THREE.Mesh(mergeTruss(stageTruss, 0.4), M.metal);
  group.add(stageT);
  colliders.push(...B.build(group, [M.deck]));

  // ---- surroundings ----
  const sky = skyDome({ top: [0.003, 0.007, 0.028], horizon: [0.035, 0.04, 0.075], glow: [0.55, 0.3, 0.14], glowAmount: 0.45 });
  group.add(sky);
  group.add(skyline({ count: 36, rMin: 200, rMax: 300, hMin: 14, hMax: 42, seed: 4, arc: [Math.PI * 0.55, Math.PI * 1.55] }));
  group.add(treeBelt({ count: 160, rMin: 100, rMax: 150, center: [0, 46], seed: 8, hMin: 8, hMax: 16 }));
  group.add(treeBelt({ count: 40, rMin: 55, rMax: 80, center: [0, 46], seed: 18, hMin: 7, hMax: 12, keep: (x, z) => z > 20 }));

  // ---- people ----
  const crowd = new Crowd();
  const density = (z, x) => {
    const edge = Math.max(0, 1 - Math.max(0, Math.abs(x) - 24) / 7);
    const along = Math.max(0.3, 1 - Math.max(0, z - 10) / 95);
    if (z > 22 && z < 32 && Math.abs(x) < 6) return 0; // FOH
    return along * edge;
  };
  standingField(crowd, { x0: -29, x1: 29, z0: 3.6, z1: 62, spacing: 0.7, density, faceTo: [0, 4, -4], look: 'casual', mode: 0, seed: 21, fRatio: 0.45 });
  // security in the pit, FOH crew, band
  for (let i = 0; i < 12; i++) crowd.add({ variant: 'M', mode: 4, x: -13 + i * 2.4, z: 2.2, yaw: Math.PI, look: 'perf', seed: 500 + i, role: 6, y: 0 });
  crowd.add({ variant: 'M', mode: 4, x: -1.6, y: 1.0, z: 26.9, yaw: Math.PI, look: 'perf', seed: 601, role: 6 });
  crowd.add({ variant: 'F', mode: 4, x: 2.6, y: 1.0, z: 26.9, yaw: Math.PI, look: 'perf', seed: 602, role: 6 });
  const band = [
    [1, 0, DECK, -2.3, 0, 'M'], // singer
    [3, -4.8, DECK, -3.8, 0.3, 'M'], // guitar
    [3, 4.9, DECK, -4.0, -0.3, 'F'], // bass
    [6, -8.2, DECK, -5.4, 0.4, 'M'], // keys
    [4, 0.5, DECK + 0.45, -8.2, 0, 'M'], // drums on a riser
  ];
  for (const [role, x, y, z, yaw, v] of band) crowd.add({ variant: v, mode: 4, x, y, z, yaw, look: 'perf', seed: 700 + role * 3, role, tall: 0.04 });
  // drum kit, keyboard, mic stand
  const kit = new Batch();
  kit.box(M.black, 1.8, 0.45, 1.6, 0.5, DECK + 0.22, -8.2); // riser
  for (const [dx, dy, dz, r] of [[0.5, 0.55, -7.5, 0.28], [-0.2, 0.9, -7.4, 0.2], [1.1, 0.9, -7.4, 0.22], [-0.9, 0.7, -7.7, 0.3], [1.9, 0.7, -7.7, 0.3]]) {
    const d = new THREE.CylinderGeometry(r, r, 0.3, 14); d.translate(dx, DECK + 0.45 + dy, dz); kit.add(M.gold, d);
  }
  kit.box(M.black, 1.5, 0.12, 0.45, -8.2, DECK + 0.95, -4.6); kit.box(M.metal, 1.4, 0.05, 0.05, -8.2, DECK + 0.7, -4.3);
  kit.cyl(M.metal, [0, DECK, -1.6], [0, DECK + 1.5, -1.6], 0.018, 4);
  kit.build(group);

  return finish('concert', group, colliders, {
    crowd: addCrowd(group, crowd),
    screens: [back, imagL, imagR],
    practicals,
    sky,
    atmos: { fogBase: [0.004, 0.006, 0.012], density: 0.007, tintGain: 0.1, ambient: [0.012, 0.015, 0.03], exposure: 1.1, bloom: 0.75 },
    info: {
      est: ['crowd extents and counts', 'roof height', 'PA hang size', 'FOH distance (sources give no standard)'],
      stage: [0, 4.2, -4], crowdCentre: [0, 0, 24],
      foh: [0, 4.6, 24.2], fohAim: [0, 4.2, -4],
      eye: [[2, 1.7, 12], [-6, 1.7, 22], [8, 1.7, 36], [0, 1.7, 6]],
      pit: { pos: [1.6, 1.45, 2.1], aim: [0, 6.5, -5] },
      stagePov: { pos: [0, 3.4, -3.2], aim: [0, 2.4, 32] },
      orbit: { centre: [0, 4, 14], radius: 58, alt: [20, 34], aim: [0, 4, 0], arc: 0.95 },
      reveal: { from: [0, 2.6, 82], to: [0, 17, 30], aim0: [0, 4, 0], aim1: [0, 5, -3] },
      fly: [[0, 14, 70], [0, 11, 40], [0, 8.5, 14], [0, 8, 1], [0, 15, -6]],
      top: { centre: [0, 0, 20], alt: 90 },
      // a jib in the photo pit: it swings along the barrier and climbs, always within a few strides of the stage
      crane: [
        { pts: [[-14, 2.0, 6.2], [-8.5, 3.4, 4.8], [-3, 5.0, 4.0], [3, 5.8, 4.0], [9, 4.1, 4.9], [14.5, 2.5, 6.6]], aim0: [-3, 3.6, -4], aim1: [3, 4.4, -4], fov: [54, 44] },
        { pts: [[0, 1.8, 5.2], [0, 3.4, 5.8], [0, 6.0, 7.6], [0, 9.0, 10.5]], aim0: [0, 2.8, -3], aim1: [0, 6.0, -5], fov: [60, 42] },
        { pts: [[-9, 1.55, 3.9], [-3, 1.8, 3.6], [3, 1.9, 3.6], [9, 1.6, 4.0]], aim0: [-2, 6.0, -5], aim1: [2, 6.5, -5], fov: [74, 64] },
        { pts: [[12, 3.0, 8], [8, 4.4, 5.8], [3, 6.4, 4.8], [-4, 7.4, 5.2], [-9, 5.6, 6.5]], aim0: [-2, 4.2, -4], aim1: [0, 5.6, -5], fov: [50, 40] },
      ],
      bounds: { x: [-28, 28], z: [4, 70] },
      walkStart: [4, 1.65, 14],
    },
  });
}

// ============================================================ GARBA ============================================================

function garba({ dandiya = false } = {}) {
  const group = new THREE.Group();
  const B = new Batch();
  const M = {
    ground: surfaceMaterial(0xffffff, { map: groundTexture('dirt'), mapScale: 1 / 14 }),
    deck: surfaceMaterial(0x6a1a1a, { sheen: 0.3 }),
    carpet: surfaceMaterial(0x8e1b1b),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.35 }),
    pole: surfaceMaterial(0xc9c0a8, { sheen: 0.4 }),
    gold: surfaceMaterial(0xd9a400, { sheen: 0.9 }),
    saffron: surfaceMaterial(0xe8590c, { side: THREE.DoubleSide }),
    maroon: surfaceMaterial(0x7a1020, { side: THREE.DoubleSide }),
    cloth: surfaceMaterial(0x17171b, { side: THREE.DoubleSide }),
    pa: surfaceMaterial(0x25262b, { sheen: 0.35 }),
    tent: surfaceMaterial(0xe8e0cc, { side: THREE.DoubleSide }),
    marigold: surfaceMaterial(0xf08a00),
    marigold2: surfaceMaterial(0xffb300),
    black: surfaceMaterial(0x1c1c20),
    flame: surfaceMaterial(0x000000, { emissive: 0xffa030 }),
  };
  const colliders = [];
  const practicals = [];
  const trussList = [];
  const C = [0, 16]; // garbi centre

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), M.ground);
  ground.position.set(0, 0, 40);
  group.add(ground); colliders.push(ground);
  // rangoli around the garbi
  const rang = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48).rotateX(-Math.PI / 2), surfaceMaterial(0xffffff, { map: rangoliTexture(), uv: true }));
  rang.position.set(C[0], 0.02, C[1]);
  // CircleGeometry uvs span the unit square, which is what the texture expects
  group.add(rang);

  // --- stage at the north end: deck, red carpet, gold-trimmed pillars, saffron drapes, LED backdrop ---
  B.box(M.deck, 16, DECK, 8, 0, DECK / 2, -3.5);
  B.box(M.carpet, 13, 0.03, 6.5, 0, DECK + 0.02, -3.2);
  for (const s of [-1, 1]) {
    B.tube(M.pole, 0.28, 0.32, 7.4, s * 8.6, 0, -0.5, 12);
    B.tube(M.gold, 0.36, 0.36, 0.3, s * 8.6, 0, -0.5, 12);
    B.tube(M.gold, 0.36, 0.36, 0.3, s * 8.6, 7.4, -0.5, 12);
    B.box(M.saffron, 0.04, 5.5, 3.2, s * 7.6, 3.6, -3); // side drapes
  }
  B.box(M.maroon, 17.4, 0.7, 0.2, 0, 7.05, -0.5); // valance
  B.box(M.gold, 17.6, 0.12, 0.26, 0, 6.65, -0.45);
  trussList.push([[-8, 6.25, -0.5], [8, 6.25, -0.5]]); // carries the pars, blinders and laser
  for (const x of [-8, -4, 0, 4, 8]) B.cyl(M.metal, [x, 6.25, -0.5], [x, 6.9, -0.5], 0.02, 4);
  const back = ledPanel(11, 4.6, [0, DECK + 0.2 + 2.3, -7.35]);
  B.box(M.gold, 11.6, 0.2, 0.15, 0, DECK + 5.0, -7.45); B.box(M.gold, 0.2, 5.0, 0.15, -5.8, DECK + 2.5, -7.45); B.box(M.gold, 0.2, 5.0, 0.15, 5.8, DECK + 2.5, -7.45);
  B.box(M.maroon, 17, 6.5, 0.1, 0, 4.4, -7.6);
  // --- towers at the corners, carrying the beams ---
  for (const [x, z] of [[-14, 4], [14, 4], [-14, 28], [14, 28]]) {
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) trussList.push([[x + dx, 0, z + dz], [x + dx, 9.3, z + dz]]);
    trussList.push([[x - 0.5, 9.3, z], [x + 0.5, 9.3, z]], [[x - 0.5, 4.5, z - 0.5], [x + 0.5, 4.5, z + 0.5]]);
    B.box(M.black, 1.6, 0.3, 1.6, x, 9.5, z);
    practicals.push(practical([x, 9.0, z + (z < 10 ? 1 : -1) * 0.8], [0.8, 0.9, 1.1], { reach: 0.5 }));
  }
  // --- ring poles carrying the pars, radial string-light canopy, centre mast ---
  const poleTops = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = Math.sin(a) * 13, z = C[1] + Math.cos(a) * 13;
    B.tube(M.pole, 0.06, 0.07, 6.3, x, 0, z, 8);
    poleTops.push([x, 6.25, z]);
  }
  B.tube(M.pole, 0.07, 0.1, 8.2, C[0], 0, C[1], 10); // centre mast carries the canopy strands
  const bulbs = [];
  const mast = [C[0], 8.2, C[1]];
  for (const top of poleTops) bulbs.push(...bulbString(mast, top, { sag: 0.9, spacing: 0.55 }));
  for (let i = 0; i < 12; i++) bulbs.push(...bulbString(poleTops[i], poleTops[(i + 1) % 12], { sag: 0.55, spacing: 0.55 }));
  group.add(bulbMesh(bulbs, [3.2, 2.0, 0.85], 0.06));
  for (const top of poleTops) practicals.push(practical([top[0], 5.9, top[2]], [1.5, 0.95, 0.45], { reach: 0.35 }));
  // strand wires
  const wireMat = M.black;
  for (const top of poleTops) B.cyl(wireMat, mast, top, 0.006, 3);
  // --- garbi: stepped base, earthen pot with a lamp, marigold ring, diyas ---
  B.tube(M.marigold2, 2.0, 2.2, 0.28, C[0], 0, C[1], 24);
  B.tube(M.marigold, 1.5, 1.7, 0.22, C[0], 0.28, C[1], 24);
  B.tube(M.carpet, 0.5, 0.9, 0.7, C[0], 0.5, C[1], 14);
  const pot = new THREE.SphereGeometry(0.55, 14, 10); pot.scale(1, 1.1, 1); pot.translate(C[0], 1.55, C[1]); B.add(M.gold, pot);
  const flame = new THREE.SphereGeometry(0.18, 8, 6); flame.translate(C[0], 1.55, C[1]); B.add(M.flame, flame);
  practicals.push(practical([C[0], 2.0, C[1]], [2.2, 1.35, 0.6], { reach: 0.6 }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = new THREE.SphereGeometry(0.07, 6, 4); d.translate(C[0] + Math.sin(a) * 1.9, 0.34, C[1] + Math.cos(a) * 1.9); B.add(M.flame, d);
  }
  // pixel ring posts, so the bars are physically carried
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.tube(M.metal, 0.03, 0.03, 2.55, Math.sin(a) * 2.2 + C[0], 0, Math.cos(a) * 2.2 + C[1], 6); }
  // --- entrance arch with marigold garlands, food stalls, lamp posts ---
  const gate = [0, 44];
  for (const s of [-1, 1]) B.tube(M.maroon, 0.35, 0.4, 5.2, s * 4.5, 0, gate[1], 10);
  B.box(M.gold, 10.4, 0.5, 0.5, 0, 5.3, gate[1]);
  B.box(surfaceMaterial(0x000000, { emissive: 0x7a3a08 }), 8, 1.1, 0.12, 0, 4.2, gate[1] - 0.2);
  const garland = [];
  for (const s of [-1, 1]) for (let i = 0; i < 14; i++) garland.push(V(s * 4.5 + s * 0.3 * Math.sin(i), 5.1 - i * 0.34, gate[1] - 0.3));
  for (let i = 0; i <= 24; i++) { const t = i / 24; garland.push(V(-4.5 + 9 * t, 5.0 - 0.9 * 4 * t * (1 - t), gate[1] - 0.3)); }
  const gm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), M.marigold, garland.length);
  const m4 = new THREE.Matrix4();
  garland.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); gm.setMatrixAt(i, m4); });
  group.add(gm);
  practicals.push(practical([0, 4.0, gate[1] - 1.5], [2.0, 1.4, 0.7], { reach: 0.5 }));
  const stallBulbs = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.12 + (i / 8) * Math.PI * 1.76; // gap at the entrance side handled by skipping near +z? keep all but the gate arc
    const x = Math.sin(a + Math.PI) * 30, z = C[1] + Math.cos(a + Math.PI) * 30;
    if (z > 38) continue;
    const yaw = Math.atan2(C[0] - x, C[1] - z);
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    const stall = new Batch();
    stall.box(M.tent, 5, 2.4, 3, 0, 1.2, 0);
    stall.box(M.saffron, 5.4, 0.08, 1.8, 0, 2.5, 1.7, 0, 0.35);
    stall.box(surfaceMaterial(0x000000, { emissive: 0x6a3a10 }), 4.6, 1.1, 0.05, 0, 1.2, 1.52);
    stall.build(g);
    group.add(g);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    practicals.push(practical([x + fx * 1.8, 2.3, z + fz * 1.8], [2.0, 1.3, 0.5], { reach: 0.5 }));
    for (let k = -2; k <= 2; k++) stallBulbs.push(V(x + fx * 2.5 + Math.cos(yaw) * k * 0.9, 2.4, z + fz * 2.5 - Math.sin(yaw) * k * 0.9));
  }
  group.add(bulbMesh(stallBulbs, [3, 1.9, 0.8], 0.07));
  const lampBulbs = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = Math.sin(a) * 34, z = C[1] + Math.cos(a) * 34;
    if (z > 40) continue;
    B.tube(M.pole, 0.05, 0.07, 6.5, x, 0, z, 6);
    lampBulbs.push(V(x, 6.6, z));
    if (i % 2 === 0) practicals.push(practical([x, 6.3, z], [2.6, 2.0, 1.1], { reach: 0.45 }));
  }
  group.add(bulbMesh(lampBulbs, [4.5, 3.4, 1.7], 0.15));

  const trussM = new THREE.Mesh(mergeTruss(trussList, 0.45), M.metal);
  group.add(trussM);
  colliders.push(...B.build(group, [M.deck]));

  // --- surroundings: apartment blocks around the society ground, trees, glow ---
  const sky = skyDome({ top: [0.004, 0.008, 0.03], horizon: [0.045, 0.04, 0.06], glow: [0.7, 0.4, 0.15], glowAmount: 0.6 });
  group.add(sky);
  group.add(skyline({ count: 46, rMin: 105, rMax: 160, hMin: 16, hMax: 44, seed: 6, lit: 0.4 }));
  group.add(treeBelt({ count: 90, rMin: 48, rMax: 62, center: C, seed: 12, hMin: 7, hMax: 12 }));

  // --- people ---
  const crowd = new Crowd();
  const mode = dandiya ? 3 : 2;
  danceRings(crowd, { cx: C[0], cz: C[1], rMin: 3.5, rMax: 11.6, gap: 1.0, arc: 0.85, mode, seed: 31 });
  // watchers around the dance area, and by the stalls
  standingField(crowd, { x0: -24, x1: 24, z0: -6, z1: 40, spacing: 0.95, look: 'garba', mode: 5, seed: 41, fRatio: 0.55, faceTo: [C[0], 0, C[1]], density: (z, x) => { const d = Math.hypot(x - C[0], z - C[1]); return d > 15.5 && d < 25 && !(z < 0.5 && Math.abs(x) < 9) ? 0.55 : 0; } });
  for (const [role, x, z, yaw, v] of [[1, -1.2, -2.6, 0, 'M'], [1, 1.2, -2.6, 0, 'F'], [1, 0, -3.4, 0, 'M'], [5, -3.6, -4.6, 0.2, 'M'], [6, 3.6, -4.8, -0.2, 'M'], [4, 5.8, -4.6, -0.3, 'M']]) crowd.add({ variant: v, mode: 4, x, y: DECK, z, yaw, look: 'garba', seed: 800 + x * 7 + z, role, tall: 0.03 });
  const kit = new Batch();
  kit.box(M.black, 1.3, 0.12, 0.5, 3.6, DECK + 0.95, -4.2);
  const dhol = new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14); dhol.rotateZ(Math.PI / 2); dhol.translate(-3.6, DECK + 0.85, -4.1); kit.add(M.gold, dhol);
  kit.build(group);

  return finish('garba', group, colliders, {
    crowd: addCrowd(group, crowd),
    screens: [back],
    practicals,
    sky,
    atmos: { fogBase: [0.008, 0.006, 0.005], density: 0.007, tintGain: 0.1, ambient: [0.012, 0.011, 0.018], exposure: 0.85, bloom: 0.5, beamHaze: 1.35 },
    info: {
      est: ['ground and ring radii', 'stage size', 'crowd counts', 'string-light layout'],
      stage: [0, 3.4, -3.5], crowdCentre: [C[0], 0, C[1]],
      foh: [0, 5.0, 40], fohAim: [0, 3, 8],
      eye: [[0, 1.65, C[1] + 8.4], [7.5, 1.65, C[1] + 1.5], [-6, 1.65, C[1] - 4], [0, 1.65, 6]],
      pit: { pos: [3.5, 1.5, 2.4], aim: [0, 4.5, -4] },
      stagePov: { pos: [0, 3.2, -3.4], aim: [C[0], 1.5, C[1]] },
      orbit: { centre: [C[0], 0, C[1]], radius: 36, alt: [14, 24], aim: [C[0], 1.5, C[1]], arc: 1.9 },
      reveal: { from: [0, 3.4, 52], to: [0, 20, 38], aim0: [C[0], 2, C[1]], aim1: [C[0], 1, C[1]] },
      fly: [[0, 11, 48], [0, 9, 34], [3, 7.5, 24], [0, 7.2, 14], [-2, 7, 8], [0, 12, 0]],
      top: { centre: [C[0], 0, C[1]], alt: 44 },
      crane: [
        { pts: [[-10, 3.2, 2.6], [-5, 4.8, 4.6], [1, 6.0, 6.2], [7, 4.6, 5.8], [11, 3.0, 5.0]], aim0: [-2, 1.8, C[1]], aim1: [2, 2.4, C[1]], fov: [56, 46] },
        { pts: [[0, 2.2, 5.0], [0, 4.6, 6.4], [0, 7.8, 8.8]], aim0: [0, 2.6, C[1]], aim1: [0, 3.4, C[1] + 4], fov: [60, 48] },
        { pts: [[9, 2.0, 21], [8, 2.4, 14], [6.6, 2.8, 9]], aim0: [0, 3.6, C[1]], aim1: [-1, 4.2, C[1] - 6], fov: [64, 54] },
      ],
      bounds: { x: [-12, 12], z: [3, 28] },
      walkStart: [4.2, 1.6, C[1] + 6],
    },
  });
}

// ============================================================ CLUB ============================================================

function club() {
  const group = new THREE.Group();
  const B = new Batch();
  const M = {
    floor: surfaceMaterial(0xffffff, { map: groundTexture('floor'), mapScale: 1 / 3, sheen: 1.0 }),
    ceiling: surfaceMaterial(0x121216, { side: THREE.DoubleSide }),
    wall: surfaceMaterial(0x1d1d24),
    panel: surfaceMaterial(0x17171d, { sheen: 0.2 }),
    black: surfaceMaterial(0x101015, { sheen: 0.35 }),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.4 }),
    wood: surfaceMaterial(0x4a2f1c, { sheen: 0.5 }),
    sofa: surfaceMaterial(0x4a1830),
    neon: surfaceMaterial(0x000000, { emissive: 0x00e5ff }),
    neonM: surfaceMaterial(0x000000, { emissive: 0xff2bd6 }),
    glass: surfaceMaterial(0x000000, { emissive: 0xff9a40 }),
    chrome: surfaceMaterial(0xdddddd, { sheen: 1.0 }),
  };
  const colliders = [];
  const practicals = [];
  const T = [];
  const W = 20, D = 18.6, H = 6.4, z0 = -6.4, CZ = 3.2;
  const zc = z0 + D / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), M.floor);
  floor.position.set(0, 0, zc);
  group.add(floor); colliders.push(floor);
  B.box(M.ceiling, W, 0.1, D, 0, H, zc);
  B.box(M.wall, 0.2, H, D, -W / 2, H / 2, zc); B.box(M.wall, 0.2, H, D, W / 2, H / 2, zc);
  B.box(M.wall, W, H, 0.2, 0, H / 2, z0 + D); B.box(M.wall, W, H, 0.2, 0, H / 2, z0);
  // acoustic panels and the LED seams along the side walls
  for (let z = -4; z < 11; z += 2.2) {
    B.box(M.panel, 0.08, 2.4, 1.7, W / 2 - 0.12, 2.3, z); B.box(M.panel, 0.08, 2.4, 1.7, -W / 2 + 0.12, 2.3, z);
  }
  B.box(M.neonM, 0.04, 0.05, D - 1, W / 2 - 0.1, 4.4, zc); B.box(M.neon, 0.04, 0.05, D - 1, -W / 2 + 0.1, 4.4, zc);
  B.box(M.neon, W - 1, 0.05, 0.04, 0, 0.5, z0 + D - 0.12); // skirting light along the rear wall

  // DJ stage: raised platform, booth with decks, subs, a screen band above the LED wall (the wall itself is the MXL/MXR matrix)
  B.box(M.black, 7.2, 0.5, 3.2, 0, 0.25, -4.1);
  B.box(M.chrome, 7.2, 0.03, 0.03, 0, 0.52, -2.52);
  B.box(M.black, 3.6, 1.0, 1.2, 0, 1.0, -3.2); B.box(M.metal, 3.6, 0.03, 1.2, 0, 1.52, -3.2);
  for (const dx of [-1.0, 1.0]) { B.box(M.black, 0.62, 0.05, 0.5, dx, 1.56, -3.2); const cd = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20); cd.translate(dx, 1.6, -3.2); B.add(M.chrome, cd); }
  for (const s of [-1, 1]) { B.box(M.black, 1.1, 1.7, 0.95, s * 4.6, 1.2, -3.6); B.box(M.black, 1.1, 1.0, 0.95, s * 4.6, 0.55, -3.6); B.box(M.black, 1.1, 2.4, 0.95, s * 8.2, 1.2, 0.2); }
  B.box(M.black, 12.4, 4.2, 0.2, 0, 3.0, z0 + 0.5); // wall frame behind the matrix
  const topBand = ledPanel(12, 1.1, [0, 5.55, z0 + 0.62], 0, 256);

  // bar along the left wall with back-bar shelves and bottles
  B.box(M.wood, 0.8, 1.1, 8.4, -8.4, 0.55, 5.8);
  B.box(M.neon, 0.06, 0.05, 8.4, -8.0, 0.3, 5.8);
  B.box(M.black, 0.5, 2.5, 8.4, -9.6, 1.25, 5.8);
  const bottles = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 26; i++) bottles.push(V(-9.3, 1.25 + row * 0.5, 1.7 + i * 0.32));
  group.add(bulbMesh(bottles, [2.6, 1.7, 0.9], 0.07));
  for (let row = 0; row < 3; row++) B.box(M.neon, 0.04, 0.03, 8.0, -9.34, 1.09 + row * 0.5, 5.8);
  for (let z = 2; z <= 9.5; z += 2.3) practicals.push(practical([-8.2, 1.7, z], [0.5, 1.2, 1.5], { reach: 0.8 }));
  // VIP sofas and tables along the right wall
  for (let z = -2; z < 10; z += 3.6) {
    B.box(M.sofa, 1.2, 0.5, 2.6, 8.8, 0.25, z); B.box(M.sofa, 0.3, 0.9, 2.6, 9.4, 0.65, z);
    B.box(M.black, 0.8, 0.45, 1.0, 7.5, 0.22, z); B.box(M.glass, 0.1, 0.06, 0.1, 7.5, 0.5, z);
    practicals.push(practical([7.5, 0.7, z], [1.2, 0.55, 0.25], { reach: 0.6 }));
  }
  // pillars wrapped in LED strips
  for (const [x, z] of [[-7.6, 0.6], [7.6, 0.6], [-7.6, 9.2], [7.6, 9.2]]) {
    B.box(M.black, 0.6, H, 0.6, x, H / 2, z);
    B.box(M.neonM, 0.04, H - 0.4, 0.04, x + 0.32, H / 2, z + 0.32);
    B.box(M.neon, 0.04, H - 0.4, 0.04, x - 0.32, H / 2, z - 0.32);
  }

  // truss: a ring over the floor (carries the ring beams), and bars across it. Rig coordinates: ring r 3.6 at y 5.3 round (0, 3.2).
  const ringPts = (r, y, n = 20) => Array.from({ length: n + 1 }, (_, i) => [Math.sin((i / n) * Math.PI * 2) * r, y, CZ + Math.cos((i / n) * Math.PI * 2) * r]);
  const rp = ringPts(3.6, 5.3);
  for (let i = 0; i < rp.length - 1; i++) T.push([rp[i], rp[i + 1]]);
  T.push([[-6.4, 5.3, -1.6], [6.4, 5.3, -1.6]]);                    // front bar (hybrids)
  T.push([[-6.4, 5.3, 7.4], [6.4, 5.3, 7.4]]);                      // rear bar (sharpies)
  T.push([[-5.6, 5.2, 2.2], [5.6, 5.2, 2.2]]);                      // wash bar across the floor
  T.push([[-5.6, 5.0, 0.6], [5.6, 5.0, 0.6]]);                      // strobe bar
  T.push([[-6.4, 5.3, -1.6], [-6.4, 5.3, 7.4]], [[6.4, 5.3, -1.6], [6.4, 5.3, 7.4]]); // side rails
  for (const [x, z] of [[-6.4, -1.6], [6.4, -1.6], [-6.4, 7.4], [6.4, 7.4], [0, -1.6], [0, 7.4], [3.6 * Math.sin(Math.PI / 2), CZ], [-3.6, CZ]]) B.cyl(M.metal, [x, 5.3, z], [x, H, z], 0.016, 4);
  // tube ring: cables hold each LED tube to the ceiling
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; B.cyl(M.metal, [Math.sin(a) * 5.2, 5.3, CZ + Math.cos(a) * 5.2], [Math.sin(a) * 5.2, H, CZ + Math.cos(a) * 5.2], 0.008, 3); }
  // mirror ball
  const ball = new THREE.IcosahedronGeometry(0.42, 2).toNonIndexed(); ball.computeVertexNormals(); ball.translate(0, 4.6, CZ); B.add(M.chrome, ball); // faceted: it glitters
  B.cyl(M.metal, [0, H, CZ], [0, 5.0, CZ], 0.01, 3);
  B.box(M.neonM, 3.4, 0.12, 0.05, 0, 5.1, z0 + 0.4); // sign above the wall frame
  practicals.push(practical([0, 3.4, -2.0], [0.8, 0.9, 1.3], { reach: 0.7 }));
  practicals.push(practical([-9, 2.4, 1.0], [0.3, 1.1, 1.5], { reach: 0.8 }), practical([8.6, 3.4, 6], [0.4, 0.5, 0.8], { reach: 0.6 }));

  group.add(new THREE.Mesh(mergeTruss(T, 0.3), M.metal));
  colliders.push(...B.build(group, [M.wall, M.ceiling]));

  // people: dance floor, bar, DJ
  const crowd = new Crowd();
  standingField(crowd, { x0: -7.2, x1: 7.2, z0: 0.0, z1: 10.2, spacing: 0.82, density: (z, x) => (z < 2 ? 1.0 : 0.88) * (Math.abs(x) < 6 ? 1 : 0.6), faceTo: [0, 1.5, -3], look: 'club', mode: 1, seed: 51, fRatio: 0.5 });
  standingField(crowd, { x0: -7.6, x1: -6.8, z0: 2, z1: 9.5, spacing: 0.9, density: () => 0.9, faceTo: [-9, 1, 6], look: 'club', mode: 5, seed: 52, fRatio: 0.5 });
  crowd.add({ variant: 'M', mode: 4, x: 0, y: 0.5, z: -3.9, yaw: 0, look: 'club', seed: 901, role: 2, tall: 0.04 });
  crowd.add({ variant: 'F', mode: 4, x: -9.0, y: 0, z: 4.2, yaw: Math.PI / 2, look: 'club', seed: 902, role: 6 });
  crowd.add({ variant: 'M', mode: 4, x: -9.0, y: 0, z: 7.5, yaw: Math.PI / 2, look: 'club', seed: 903, role: 6 });
  const sky = new THREE.Group();

  return finish('club', group, colliders, {
    crowd: addCrowd(group, crowd),
    screens: [topBand],
    practicals,
    sky,
    atmos: { fogBase: [0.005, 0.004, 0.01], density: 0.02, tintGain: 0.16, ambient: [0.008, 0.008, 0.014], exposure: 1.0, bloom: 0.7, beamHaze: 1.7 },
    info: {
      est: ['room size', 'crowd density (~3 sq ft per guest rule of thumb)'],
      stage: [0, 2.4, -2.0], crowdCentre: [0, 0, CZ],
      foh: [0, 2.5, 11.4], fohAim: [0, 2.7, -2.0],
      eye: [[2, 1.7, 6], [-3, 1.7, 8.6], [3.4, 1.7, 1.6], [0, 1.7, 10.4]],
      pit: { pos: [2.6, 1.5, -0.2], aim: [0, 3.4, 3.4] },
      stagePov: { pos: [0, 2.3, -3.9], aim: [0, 3.6, 8.5] },
      orbit: { centre: [0, 0, CZ], radius: 5.6, alt: [2.5, 3.5], aim: [0, 3.2, CZ], arc: 1.15 },
      reveal: { from: [0, 1.9, 11.3], to: [0, 3.5, 6.4], aim0: [0, 2.6, -2.0], aim1: [0, 3.6, 1.2] },
      fly: [[0, 3.5, 11.2], [0, 3.7, 7.6], [0, 3.6, 3.4], [0, 3.3, -0.2], [0, 3.0, -2.6]],
      top: { centre: [0, 0, CZ], alt: 5.2, fov: 88 },
      crane: [
        { pts: [[-5.4, 2.0, 1.6], [-2.8, 3.0, 3.0], [1.6, 3.5, 4.6], [5.0, 2.6, 5.8]], aim0: [-1, 3.2, -2.2], aim1: [1, 3.8, -2.2], fov: [62, 52] },
        { pts: [[0, 1.7, 9.6], [0, 2.7, 7.4], [0, 3.9, 5.4]], aim0: [0, 2.4, -2.2], aim1: [0, 4.0, 1.5], fov: [66, 54] },
        { pts: [[4.8, 2.4, -1.2], [2.6, 3.4, 1.4], [-1.4, 3.8, 3.4], [-4.6, 2.6, 5.6]], aim0: [0, 3.8, 6.5], aim1: [0, 4.2, 4.5], fov: [64, 56] },
      ],
      bounds: { x: [-8.8, 8.8], z: [-0.6, 11.4] },
      walkStart: [4, 1.65, 8.2],
    },
  });
}

export function buildVenue(kind, opts = {}) {
  const v = kind === 'garba' ? garba(opts) : kind === 'club' ? club() : kind === 'hall' ? hall() : kind === 'lawn' ? lawn() : concert();
  const g = v.group;
  v.dandiya = !!opts.dandiya;
  if (new URLSearchParams(location.search).has('nocrowd')) v.crowd.visible = false;
  for (const scr of v.screens) { g.add(scr.mesh); v.colliders.push(scr.mesh); }
  // state: { t, bp, energy, bpm, silence, phones, kind, pal, title, artist, low, mid, high }
  v.update = (s) => {
    v.crowd.userData.update(s);
    for (const scr of v.screens) scr.update(s);
  };
  g.userData.venue = v;
  return v;
}

export { trussGeometry };
