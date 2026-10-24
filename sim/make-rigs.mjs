// Generates the preset rigs in sim/public/rigs/. Coordinates: metres, origin at the
// front-centre of the stage at audience-floor level; x+ audience-right, y+ up, z+ towards audience.
import { writeFileSync } from 'node:fs';
const out = (name, rig) => writeFileSync(new URL(`./public/rigs/${name}.json`, import.meta.url), JSON.stringify(rig, null, 1) + '\n');
const row = (prefix, model, n, width, y, z, mount, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, model, pos: [+(n > 1 ? -width / 2 + (i * width) / (n - 1) : 0).toFixed(2), y, z], mount, ...extra }));
const DECK = 1.2;

out('single-sharpy', { name: 'Single Sharpy', venue: 'stage', fixtures: [{ id: 'B1', model: 'claypaky-sharpy', pos: [0, DECK, -3], mount: 'floor' }] });

out('quad-sharpy', { name: '4 × Sharpy on the deck', venue: 'stage', fixtures: row('B', 'claypaky-sharpy', 4, 9, DECK, -1.2, 'floor') });

const ringOf = (prefix, model, n, radius, y, cx, cz, mount, extra = {}) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (extra.rot || 0);
    return { id: `${prefix}${i + 1}`, model, pos: [+(cx + Math.sin(a) * radius).toFixed(2), y, +(cz + Math.cos(a) * radius).toFixed(2)], mount, ...(extra.aimTo ? { aim: extra.aimTo } : {}) };
  });

// Concert stage: a restrained festival rig. Every moving head is a Sharpy-class beam or a spot, set in clear rows so
// the picture reads as lines and fans rather than a thicket; washes, pixels and tubes give colour behind them.
out('concert', {
  name: 'Concert stage',
  venue: 'stage',
  fixtures: [
    ...row('B', 'claypaky-sharpy', 6, 12, 8, -4, 'hung'),            // main truss: the beam line
    ...row('BF', 'claypaky-sharpy', 4, 10, DECK, -6.5, 'floor'),     // floor beams behind the band
    ...row('MY', 'claypaky-mythos2', 4, 16, 8, -6.6, 'hung'),        // hybrids on the back truss
    ...row('S', 'robe-megapointe', 4, 9, 8, -2.5, 'hung'),           // spots
    ...row('P', 'led-par-54x3', 6, 14, 8, -0.6, 'hung'),             // front wash
    ...row('PX', 'pixel-bar-16', 4, 10, DECK + 0.1, -7.6, 'floor'),
    ...row('TB', 'led-tube-2m', 5, 12, 6.7, -6.0, 'hung'),
    ...row('ST', 'martin-atomic-3000', 2, 8, 8, -2.5, 'hung'),
    ...row('HS', 'hybrid-strobe-bar', 2, 12, 7.2, -5.2, 'hung'),
    ...row('BL', 'blinder-4lite', 2, 15, 6, -0.4, 'hung'),
    ...row('L', 'laser-rgb-3w', 2, 6, DECK + 0.2, -7.2, 'floor'),
    { id: 'SC1', model: 'star-cloth', pos: [0, DECK + 3.4, -8.2], mount: 'floor' },
  ],
});

// Club: a truss ring over the floor carrying the beams, pixel tubes hung round it, LED wall behind the booth,
// washes, strobes, lasers on the walls and uplights on the perimeter.
const CZ = 3.2; // dance floor centre
out('club', {
  name: 'Club',
  venue: 'club',
  surround: true,
  focus: [0, 0, CZ],
  fixtures: [
    ...ringOf('RB', 'claypaky-sharpy', 6, 3.6, 5.3, 0, CZ, 'hung'),                   // beams round the truss ring
    ...row('FB', 'claypaky-mythos2', 4, 7, 5.3, -1.6, 'hung'),                         // front bar: hybrids
    ...row('BB', 'claypaky-sharpy', 2, 6, 5.3, 7.4, 'hung'),                           // rear bar over the bar side
    ...ringOf('TB', 'led-tube-2m', 8, 5.2, 4.3, 0, CZ, 'hung'),                         // tube ring
    { id: 'MXL', model: 'led-matrix-wall', pos: [-3.1, 3.0, -5.6], mount: 'floor' },  // LED wall behind the booth
    { id: 'MXR', model: 'led-matrix-wall', pos: [3.1, 3.0, -5.6], mount: 'floor' },
    ...row('PX', 'pixel-bar-16', 4, 3.2, 0.8, -2.3, 'floor'),                          // booth facade
    ...row('HS', 'hybrid-strobe-bar', 2, 8, 5.0, 0.6, 'hung'),
    ...row('P', 'led-par-54x3', 6, 16, 0.35, 11, 'floor').map((f) => ({ ...f, aim: [f.pos[0], 5.0, 12.2] })), // perimeter uplights wash the rear wall
    ...row('BL', 'blinder-4lite', 2, 5, 3.0, -2.6, 'hung'),
    { id: 'L1', model: 'laser-rgb-3w', pos: [-8.6, 5.2, 0.5], mount: 'hung', aim: [0, 4.2, 3.2] },
    { id: 'L2', model: 'laser-rgb-3w', pos: [8.6, 5.2, 0.5], mount: 'hung', aim: [0, 4.2, 3.2] },
  ],
});

// Navratri ground, kept deliberately small: 10 moving heads, every one hung so it can aim down into the dancers
// (a floor-mounted head on a pole top only ever reaches the sky and reads as a static canopy), 8 pole pars, a
// few pixel tubes round the garbi and two strobes. A wall of overlapping beams reads as a flashy mess.
const R = 13, cz = 16;
const pole = (i) => { const a = (i / 12) * Math.PI * 2; return [Math.sin(a), Math.cos(a)]; };
// the four cardinal poles carry a Sharpy: from here the rays cross over the dancers like the ribs of a tent
const poleBeams = [0, 3, 6, 9].map((i, k) => {
  const [sx, sz] = pole(i);
  return { id: `PB${k + 1}`, model: 'claypaky-sharpy', pos: [+(sx * (R + 0.35)).toFixed(2), 6.55, +(cz + sz * (R + 0.35)).toFixed(2)], mount: 'hung' };
});
// the other eight poles carry a par that washes the ring in front of it, aimed in toward the garbi
const ring = [1, 2, 4, 5, 7, 8, 10, 11].map((i, k) => {
  const [sx, sz] = pole(i);
  return { id: `RP${k + 1}`, model: 'led-par-54x3', pos: [+(sx * R).toFixed(2), 6, +(cz + sz * R).toFixed(2)], mount: 'hung', aim: [+(sx * 6).toFixed(2), 0, +(cz + sz * 6).toFixed(2)] };
});
// pixel tubes stand on the posts round the garbi
const garbi = Array.from({ length: 4 }, (_, i) => {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  return { id: `GT${i + 1}`, model: 'led-tube-2m', pos: [+(Math.sin(a) * 2.2).toFixed(2), 1.4, +(cz + Math.cos(a) * 2.2).toFixed(2)], mount: 'floor' };
});
const towers = [[-14, 4], [14, 4], [-14, 28], [14, 28]];
out('dandiya', {
  name: 'Dandiya / Garba ground',
  venue: 'garba',
  surround: true,
  focus: [0, 0, cz],
  fixtures: [
    ...towers.map(([x, z], t) => ({ id: `T${t + 1}B1`, model: 'claypaky-sharpy', pos: [x, 9, z], mount: 'hung' })),
    ...poleBeams,
    ...row('SB', 'claypaky-sharpy', 2, 8, DECK, -1.5, 'floor'),
    ...row('SP', 'led-par-54x3', 2, 10, 6, -0.5, 'hung').map((f) => ({ ...f, aim: [f.pos[0] * 0.8, DECK, -3.5] })),
    ...ring,
    ...garbi,
    { id: 'MXL', model: 'led-matrix-panel', pos: [-10.6, DECK + 2.4, -1.6], mount: 'floor' },
    { id: 'MXR', model: 'led-matrix-panel', pos: [10.6, DECK + 2.4, -1.6], mount: 'floor' },
    ...row('SS', 'sunstrip-10', 2, 9, 5.6, -0.3, 'hung'),
  ],
});

// Wedding venues (new scenes; the rigs above are untouched). A modest starter rig for each.
out('hall', {
  name: 'Banquet hall',
  venue: 'hall',
  fixtures: [
    ...row('FB', 'claypaky-sharpy', 4, 9, 4.2, -3.6, 'hung'),                                   // front truss: beams over the stage
    ...row('SW', 'led-par-54x3', 4, 9, 3.9, -7.6, 'hung').map((f) => ({ ...f, aim: [f.pos[0] * 0.8, 1.6, -5.5] })), // rear truss washes the stage
    ...row('DW', 'led-par-54x3', 3, 8, 4.3, 3, 'hung').map((f) => ({ ...f, aim: [f.pos[0], 0, 6] })),  // over the dance floor
    ...row('DX', 'led-par-54x3', 3, 8, 4.3, 9, 'hung').map((f) => ({ ...f, aim: [f.pos[0], 0, 8] })),
    ...row('PB', 'pixel-bar-16', 2, 6, 1.1, -4.3, 'floor'),
  ],
});
out('lawn', {
  name: 'Wedding lawn',
  venue: 'lawn',
  fixtures: [
    ...row('FB', 'claypaky-sharpy', 4, 12, 5.2, -3.2, 'hung'),
    ...row('SW', 'led-par-54x3', 4, 10, 4.6, -8.2, 'hung').map((f) => ({ ...f, aim: [f.pos[0] * 0.7, 1.6, -5.8] })),
    ...row('DW', 'led-par-54x3', 3, 8, 5.6, 4, 'hung').map((f) => ({ ...f, aim: [f.pos[0], 0, 8] })),
    ...row('DX', 'led-par-54x3', 3, 8, 5.6, 12, 'hung').map((f) => ({ ...f, aim: [f.pos[0], 0, 9] })),
    ...row('PB', 'pixel-bar-16', 2, 7, 0.9, -3.4, 'floor'),
  ],
});
console.log('rigs written');
