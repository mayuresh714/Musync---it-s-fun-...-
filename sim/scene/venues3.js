// A third venue, added beside the others (which are untouched): a street procession at night.
//   procession: a tractor pulling the light trolley (truss frame, LED wall, speakers), a generator vehicle behind it,
//   a dancing crowd on the road, and a second tractor and trolley carrying the Ganesh idol; shops, balconies and
//   thousands of onlookers along both pavements, string lights across the road.
// Coordinates: metres, x right, y up. The convoy travels towards negative z: the light trolley faces the guests (+z).
import * as THREE from 'three';
import { surfaceMaterial, practical, mergeTruss } from './stage.js';
import { Batch, groundTexture, skyDome, skyline, bulbString, bulbMesh, rng } from './env.js';
import { Crowd, standingField } from './people.js';
import { LedScreen } from './screens.js';

const finish = (kind, group, colliders, extra) => ({ kind, group, colliders, screens: [], practicals: [], ...extra });
function ledPanel(w, h, pos, ry = 0, res = 320) {
  const s = new LedScreen(w, h, { res });
  s.mesh.position.set(...pos); s.mesh.rotation.y = ry;
  return s;
}

// where things stand (also told to the AI designer in core/design/rig-plan.js)
export const PROCESSION = {
  deckY: 1.25,
  lead: { x: [-1.9, 1.9], z: [-19.5, -8], truss: { y: 6.0, arches: [-18.5, -14, -9.5], halfW: 1.8 } },
  idol: { x: [-1.9, 1.9], z: [27, 37], truss: { y: 5.4, arches: [28, 36], halfW: 1.8 }, at: [0, 1.25, 32] },
};

export function procession() {
  const group = new THREE.Group();
  const B = new Batch();
  const R = rng(5);
  const M = {
    road: surfaceMaterial(0xffffff, { map: groundTexture('tarmac'), mapScale: 1 / 8, sheen: 0.05 }),
    path: surfaceMaterial(0x34312d, { sheen: 0.1 }),
    deck: surfaceMaterial(0x23201c, { sheen: 0.3 }),
    metal: surfaceMaterial(0x9a9da2, { sheen: 0.4 }),
    black: surfaceMaterial(0x101012, { sheen: 0.3 }),
    tyre: surfaceMaterial(0x0c0c0d),
    red: surfaceMaterial(0xa8232b, { sheen: 0.5 }),
    blue: surfaceMaterial(0x1d4e9c, { sheen: 0.5 }),
    white: surfaceMaterial(0xd8d6cf, { sheen: 0.3 }),
    grey: surfaceMaterial(0x5a5e66, { sheen: 0.3 }),
    cream: surfaceMaterial(0xe5d9bd),
    wall: [surfaceMaterial(0x4e4338), surfaceMaterial(0x43392f), surfaceMaterial(0x57493b), surfaceMaterial(0x3b332b)],
    glass: surfaceMaterial(0x000000, { emissive: 0xc88a45 }),
    glass2: surfaceMaterial(0x000000, { emissive: 0xd9a868 }),
    marigold: surfaceMaterial(0x000000, { emissive: 0xff8a1c }),
    marigold2: surfaceMaterial(0x000000, { emissive: 0xffb81c }),
    rose: surfaceMaterial(0x000000, { emissive: 0xff4f86 }),
    lamp: surfaceMaterial(0x000000, { emissive: 0xffd9a0 }),
    head: surfaceMaterial(0x000000, { emissive: 0xfff0c8 }),
    idol: surfaceMaterial(0xd2491c, { sheen: 0.5 }),
    idolSkin: surfaceMaterial(0xe8a07a, { sheen: 0.5 }),
    gold: surfaceMaterial(0xc9a13a, { sheen: 0.9 }),
    halo: surfaceMaterial(0x000000, { emissive: 0xffb347 }),
    pole: surfaceMaterial(0x3c3a36),
    cable: surfaceMaterial(0x141416),
  };
  const colliders = [], practicals = [], T = [];
  const mat4 = (i) => M.wall[i % 4];

  // road, pavements, kerbs
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), M.road);
  ground.position.set(0, 0, 8);
  group.add(ground); colliders.push(ground);
  for (const s of [-1, 1]) B.box(M.path, 3.4, 0.16, 90, s * 7.7, 0.08, 8); // pavements
  for (let z = -34; z < 50; z += 6) B.box(surfaceMaterial(0x6a665a), 0.14, 0.012, 2.4, 0, 0.012, z); // centre line

  // ── a tractor: hood, cab, big rear wheels, small front wheels, exhaust, headlamps (front towards -z) ──
  const wheel = (mat, r, w, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2); g.translate(x, y, z); B.add(mat, g); };
  function tractor(zf, body) {
    B.box(body, 1.5, 1.1, 2.5, 0, 1.2, zf + 1.3);        // hood
    B.box(M.black, 1.2, 0.3, 0.2, 0, 1.25, zf - 0.02);   // grille
    B.box(body, 2.0, 0.5, 2.0, 0, 1.55, zf + 3.6);       // body under the cab
    B.box(M.black, 1.9, 1.5, 1.8, 0, 2.7, zf + 3.5);     // cab
    B.box(M.glass2, 1.6, 0.8, 0.04, 0, 2.9, zf + 2.6);   // windscreen
    B.box(body, 2.1, 0.12, 2.0, 0, 3.5, zf + 3.5);       // roof
    for (const s of [-1, 1]) { wheel(M.tyre, 0.95, 0.55, s * 1.2, 0.95, zf + 3.7); wheel(M.metal, 0.4, 0.58, s * 1.2, 0.95, zf + 3.7); wheel(M.tyre, 0.55, 0.32, s * 0.85, 0.55, zf + 0.6); }
    B.tube(M.metal, 0.05, 0.06, 1.1, 0.45, 2.2, zf + 1.5, 8); // exhaust
    for (const s of [-1, 1]) B.box(M.head, 0.3, 0.2, 0.06, s * 0.55, 1.5, zf - 0.04);
    practicals.push(practical([0, 1.5, zf - 0.6], [2.6, 2.3, 1.7], { reach: 1.2, dir: [0, -0.05, -1], cone: 0.7 }));
  }
  // a flat-bed trolley: deck, side boards with marigold garlands, axles at the back
  function trolley(z0, z1, { w = 1.9 } = {}) {
    B.box(M.deck, w * 2, 0.2, z1 - z0, 0, 1.15, (z0 + z1) / 2);
    B.box(M.metal, 0.16, 0.5, z1 - z0 - 1.2, 0, 0.8, (z0 + z1) / 2); // chassis beam
    for (const s of [-1, 1]) {
      B.box(M.black, 0.1, 0.45, z1 - z0, s * w, 1.5, (z0 + z1) / 2);
      B.box(M.marigold, 0.14, 0.14, z1 - z0 - 0.3, s * (w + 0.02), 1.62, (z0 + z1) / 2);
      for (const dz of [1.4, 2.4]) { wheel(M.tyre, 0.62, 0.34, s * (w - 0.2), 0.62, z1 - dz); wheel(M.metal, 0.26, 0.36, s * (w - 0.2), 0.62, z1 - dz); }
    }
    B.box(M.black, 0.1, 0.3, 1.2, 0, 1.1, z0 - 0.5);   // draw bar
    B.box(M.marigold, 2 * w, 0.14, 0.14, 0, 1.62, z1 - 0.06);
    B.box(M.marigold2, 2 * w, 0.14, 0.14, 0, 1.62, z0 + 0.06);
  }

  // ── lead convoy: tractor, light trolley with truss frame, LED wall, speakers and DJ desk ──
  tractor(-26, M.red);
  trolley(-19.5, -8);
  const L = PROCESSION.lead;
  for (const z of L.truss.arches) for (const s of [-1, 1]) B.tube(M.metal, 0.07, 0.09, L.truss.y - 1.25, s * L.truss.halfW, 1.25, z, 6);
  for (const z of L.truss.arches) T.push([[-L.truss.halfW, L.truss.y, z], [L.truss.halfW, L.truss.y, z]]);
  for (const s of [-1, 1]) { T.push([[s * L.truss.halfW, L.truss.y, -18.5], [s * L.truss.halfW, L.truss.y, -9.5]]); T.push([[s * L.truss.halfW, 3.7, -18.5], [s * L.truss.halfW, 3.7, -9.5]]); }
  B.box(M.black, 3.9, 3.4, 0.22, 0, 1.25 + 1.7, -19.2);                // LED wall back frame
  const wall = ledPanel(3.7, 3.2, [0, 1.25 + 1.75, -19.07], 0, 256);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { B.box(M.black, 0.9, 0.62, 0.7, s * 1.2, 1.25 + 0.31 + k * 0.64, -9.2); B.box(M.grey, 0.8, 0.5, 0.04, s * 1.2, 1.25 + 0.31 + k * 0.64, -8.82); } // speaker stacks
  B.box(M.black, 1.5, 0.8, 0.7, 0, 1.25 + 0.4, -9.5);                   // DJ desk
  B.box(M.rose, 1.5, 0.06, 0.04, 0, 1.25 + 0.66, -9.14);
  // generator vehicle behind the trolley, to one side so nothing hides the lights; cables run to the trolley
  B.box(M.white, 2.1, 1.7, 2.2, 4.2, 1.5, -4.6); B.box(M.blue, 2.1, 0.5, 4.4, 4.2, 0.85, -5.7);
  B.box(M.grey, 1.8, 1.3, 1.9, 4.2, 2.1, -6.6); B.box(M.black, 0.5, 0.5, 0.04, 4.2, 2.0, -5.64);
  B.tube(M.metal, 0.07, 0.08, 0.9, 4.7, 2.7, -7.2, 8);
  for (const s of [-1, 1]) { wheel(M.tyre, 0.5, 0.3, 4.2 + s * 1.0, 0.5, -3.7); wheel(M.tyre, 0.5, 0.3, 4.2 + s * 1.0, 0.5, -7.2); }
  for (const [x0, z0, x1, z1] of [[3.4, -7.6, 1.5, -8.3], [3.0, -7.6, 1.0, -8.2], [1.5, -8.3, 0.4, -8.4]]) B.add(M.cable, new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0), 0.07, 0.1).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0.06, (z0 + z1) / 2));
  practicals.push(practical([4.2, 2.4, -3.2], [2.2, 2.0, 1.4], { reach: 0.8 }));

  // ── the idol convoy: tractor, trolley with a canopy of truss, a decorated pedestal and a Ganesh ──
  tractor(21, M.blue);
  trolley(27, 37);
  const I = PROCESSION.idol;
  for (const z of I.truss.arches) for (const s of [-1, 1]) B.tube(M.metal, 0.07, 0.09, I.truss.y - 1.25, s * I.truss.halfW, 1.25, z, 6);
  for (const z of I.truss.arches) T.push([[-I.truss.halfW, I.truss.y, z], [I.truss.halfW, I.truss.y, z]]);
  for (const s of [-1, 1]) T.push([[s * I.truss.halfW, I.truss.y, 28], [s * I.truss.halfW, I.truss.y, 36]]);
  // pedestal with floral steps
  B.box(M.marigold, 3.0, 0.4, 3.0, 0, 1.45, 32); B.box(M.rose, 2.6, 0.4, 2.6, 0, 1.85, 32); B.box(M.gold, 2.2, 0.3, 2.2, 0, 2.2, 32);
  // Ganesh, seated, facing the guests behind the light trolley (towards -z): belly, head, trunk, ears, crown, four arms, halo
  const Y = 2.35;
  B.tube(M.idol, 0.78, 0.95, 1.4, 0, Y, 32, 14);                           // seated body
  B.tube(M.idol, 0.62, 0.8, 0.5, 0, Y + 0.95, 31.7, 12);                   // belly
  B.box(M.idolSkin, 0.9, 0.85, 0.85, 0, Y + 1.85, 31.7); // head
  B.box(M.idolSkin, 0.22, 0.9, 0.3, 0, Y + 1.5, 31.2);                      // trunk
  B.box(M.idolSkin, 0.24, 0.3, 0.3, -0.04, Y + 1.0, 31.1, 0, 0);
  for (const s of [-1, 1]) { B.box(M.idolSkin, 0.1, 0.8, 0.7, s * 0.55, Y + 1.9, 31.75); B.box(M.idol, 0.2, 0.9, 0.26, s * 0.95, Y + 1.0, 31.5, 0, 0.3 * s); B.box(M.idol, 0.2, 0.7, 0.26, s * 0.85, Y + 0.45, 31.3); }
  B.tube(M.gold, 0.1, 0.55, 0.9, 0, Y + 2.25, 31.7, 10);                    // crown
  B.box(M.gold, 1.4, 0.12, 0.5, 0, Y + 1.15, 31.55);                         // sash
  for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; B.box(M.halo, 0.34, 0.34, 0.2, Math.sin(a) * 2.1, Y + 1.8 + Math.cos(a) * 2.1, 33.4, a); } // glowing halo ring
  practicals.push(practical([0, Y + 1.8, 31], [3.0, 2.0, 1.0], { reach: 1.0, dir: [0, 0, -1], cone: 0.9 }));

  // ── the street: shop fronts and balconies on both sides, lamps, string lights across the road ──
  const z0 = -34, z1 = 52;
  for (const s of [-1, 1]) {
    let z = z0;
    while (z < z1) {
      const d = 5 + R() * 5, h = 7 + R() * 7, i = Math.floor(R() * 4), x = s * (9.7 + (R() < 0.3 ? 0.6 : 0));
      B.box(mat4(i), 2.4, h, d, s * 10.9, h / 2, z + d / 2);
      B.box(M.black, 0.1, 2.8, d * 0.7, x - s * 0.05, 1.6, z + d / 2);              // shop shutter / front
      B.box(M.glass2, 0.06, 1.7, d * 0.55, x - s * 0.1, 1.7, z + d / 2);             // lit shop window
      B.box(M.lamp, 0.08, 0.5, d * 0.5, x - s * 0.12, 3.2, z + d / 2);               // signboard
      if (R() < 0.45) practicals.push(practical([s * 9.2, 1.8, z + d / 2], [1.0, 0.75, 0.45], { reach: 0.6 }));
      const floors = Math.floor((h - 3.6) / 3);
      for (let f = 0; f < floors; f++) for (let w = 0; w < Math.floor(d / 1.8); w++) if (R() < 0.7) B.box(R() < 0.5 ? M.glass : M.glass2, 0.06, 1.2, 0.9, x - s * 0.1, 4.4 + f * 3, z + 0.9 + w * 1.8);
      if (R() < 0.6) { B.box(M.black, 1.4, 0.12, d * 0.6, s * 9.2, 5.2, z + d / 2); B.box(M.marigold, 0.08, 0.5, d * 0.6, s * 8.55, 5.5, z + d / 2); } // balcony with a garland
      z += d + 0.3;
    }
  }
  const poles = [], bulbs = [];
  for (let z = -30; z <= 48; z += 12) {
    for (const s of [-1, 1]) { B.tube(M.pole, 0.05, 0.07, 6.4, s * 6.4, 0, z, 6); B.box(M.lamp, 0.5, 0.12, 0.3, s * 6.0, 6.4, z); poles.push([s * 6.4, 6.4, z]); practicals.push(practical([s * 6.1, 6.2, z], [1.5, 1.2, 0.7], { reach: 0.5 })); }
    const l = poles[poles.length - 2], r = poles[poles.length - 1];
    bulbs.push(...bulbString(l, r, { sag: 0.9, spacing: 0.5 }));
  }
  group.add(bulbMesh(bulbs, [4.4, 3.4, 1.6], 0.06));

  T.length && group.add(new THREE.Mesh(mergeTruss(T, 0.3), M.metal));
  colliders.push(...B.build(group, [M.deck, M.path]));

  group.add(skyDome({ top: [0.004, 0.008, 0.03], horizon: [0.05, 0.04, 0.05], glow: [0.6, 0.34, 0.14], glowAmount: 0.55 }));
  group.add(skyline({ count: 30, rMin: 120, rMax: 190, hMin: 14, hMax: 44, seed: 12, lit: 0.4 }));

  // ── people: the dancing crowd on the road behind the light trolley, a few on the trolley, onlookers all along both pavements ──
  const crowd = new Crowd();
  standingField(crowd, { x0: -5.2, x1: 5.2, z0: -4.2, z1: 18, spacing: 0.9, density: (z) => 0.55 + 0.4 * Math.min(1, (z + 4) / 6), faceTo: [0, 3, -14], look: 'garba', mode: 1, seed: 33, fRatio: 0.42 });
  for (const s of [-1, 1]) standingField(crowd, { x0: s * 6.5 - 0.1, x1: s * 8.8, z0: -26, z1: 46, spacing: 0.62, density: () => 0.85, faceTo: [0, 1.6, 6], look: 'casual', mode: 0, y: 0.16, seed: 40 + s, fRatio: 0.45 });
  standingField(crowd, { x0: -4, x1: 4, z0: -26, z1: -21.2, spacing: 1.0, density: () => 0.3, faceTo: [0, 1.6, 8], look: 'casual', mode: 0, seed: 52 }); // those walking ahead of the convoy
  crowd.add({ variant: 'M', mode: 4, x: 0, y: 1.25, z: -10.2, yaw: Math.PI, look: 'perf', seed: 901, role: 1 }); // the DJ
  crowd.add({ variant: 'F', mode: 4, x: -1.2, y: 1.25, z: -12, yaw: Math.PI, look: 'garba', seed: 902, role: 1 });
  crowd.add({ variant: 'M', mode: 4, x: 1.2, y: 1.25, z: -12.5, yaw: Math.PI, look: 'garba', seed: 903, role: 1 });
  const cg = crowd.build(); group.add(cg);

  return finish('procession', group, colliders, {
    crowd: cg,
    screens: [wall],
    practicals,
    sky: new THREE.Group(),
    atmos: { fogBase: [0.012, 0.009, 0.007], density: 0.014, tintGain: 0.12, ambient: [0.016, 0.013, 0.02], exposure: 0.9, bloom: 0.6, beamHaze: 1.6 },
    info: {
      est: ['road width', 'trolley size and truss', 'crowd along the route'],
      stage: [0, 3.2, -14], crowdCentre: [0, 0, 6],
      foh: [0, 3.0, 20], fohAim: [0, 3.6, -14],
      eye: [[1.5, 1.7, 8], [-2.5, 1.7, 3], [2, 1.7, 13], [0, 1.7, 0]],
      pit: { pos: [0.5, 1.7, -5.5], aim: [0, 3.6, -14] },
      stagePov: { pos: [0, 4.2, -10.6], aim: [0, 2.0, 20] },
      orbit: { centre: [0, 0, -6], radius: 16, alt: [5, 10], aim: [0, 3, -13], arc: 1.5 },
      reveal: { from: [0, 2.6, 34], to: [0, 11, 20], aim0: [0, 3, -14], aim1: [0, 3, -8] },
      fly: [[0, 10, 40], [0, 8, 26], [0, 6, 14], [0, 5.4, 2], [0, 5.5, -8]],
      top: { centre: [0, 0, 6], alt: 38 },
      crane: [
        { pts: [[-4.5, 3, -2], [-2, 4.4, 0], [3, 5.2, 2], [5, 4, 0]], aim0: [-1, 3.2, -14], aim1: [1, 3.4, -14], fov: [58, 48] },
        { pts: [[0, 2.2, 7], [0, 4, 4], [0, 6.2, 1]], aim0: [0, 3.2, -14], aim1: [0, 3.6, -9], fov: [62, 50] },
        { pts: [[4.8, 2.2, 11], [4.5, 2.8, 7], [4, 3.2, 3]], aim0: [0, 3.4, -12], aim1: [0, 3.2, -10], fov: [64, 54] },
      ],
      bounds: { x: [-5.5, 5.5], z: [-3, 22] },
      walkStart: [2, 1.65, 14],
    },
  });
}
