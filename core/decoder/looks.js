// Look implementations. Each takes a context and returns:
//   move  -> aim direction in stage space {x,y,z} (unit)
//   dim   -> 0..1
//   color -> [r,g,b] 0..1
//
// Stage space: metres, origin at front-centre of the stage floor,
// x+ = audience's right, y+ = up, z+ = towards the audience.
//
// ctx = { t, p (0..1 progress through cue), bp (beat position), bp0 (beat position at cue start),
//         el (element: {i, n, u, side, ring, center, pos}), q (intent params), tb (timebase), cue }

const DEG = Math.PI / 180;

export function dirFromAngles(az, el) {
  const ce = Math.cos(el * DEG);
  return { x: ce * Math.sin(az * DEG), y: Math.sin(el * DEG), z: ce * Math.cos(az * DEG) };
}
function dirTo(from, to) {
  const x = to[0] - from[0], y = to[1] - from[1], z = to[2] - from[2];
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}
const phaseOf = (ctx, speed = 8) => (2 * Math.PI * (ctx.bp - ctx.bp0)) / speed;

// smooth value-noise for ballyhoo
function noise1(seed, x) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export function poseDir(pose, el) {
  const p = el.pos;
  const F = el.focus || [0, 0, 10];
  if (el.surround) { // ring rigs: poses are relative to the middle of the dance ring
    switch (pose) {
      case 'up': return dirFromAngles(el.az0 + el.u * 10, 78);
      case 'out': return dirFromAngles(el.az0 + el.u * 35, 35);
      case 'center': return dirTo(p, [F[0], 7, F[2]]);
      case 'cross': return dirTo(p, [2 * F[0] - p[0], 8, 2 * F[2] - p[2]]);
      case 'audience': return dirTo(p, [F[0], 1.8, F[2]]);
      default: break;
    }
  }
  switch (pose) {
    case 'up': return dirFromAngles(el.u * 10, 78);
    case 'out': return dirFromAngles(el.u * 35, 35);
    case 'center': return dirTo(p, [0, 6, 6]);
    case 'cross': return dirTo(p, [-p[0] * 1.3, 7, 8]);
    case 'audience': return dirTo(p, [el.u * 8, 1.5, 12]);
    case 'down': return dirTo(p, [p[0], 0, p[2] + 0.5]);
    case 'performer': return dirTo(p, [el.u * 4, 1.3, -3]);
    default: return dirFromAngles(el.u * 20, 45);
  }
}


// a beat's accent as a head would move it: a quick but smooth attack (never an instant jump), then a relaxed decay
const kick = (f, k) => Math.min(1, (1 - Math.exp(-f * 16)) * Math.exp(-f * k) * 1.55);
const ease3 = (x) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
const TAU = Math.PI * 2;
const cyc = (c, def = 16) => (c.bp - c.bp0) / (c.q.speed ?? def);
const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 4 - 1 : 3 - f * 4; }; // -1..1 triangle, period 1
function hash(seed, a, b = 0) { const s = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453; return s - Math.floor(s); }

// Formations for the "dance" figure: (element, spread, random 0..1, step) -> [azimuth offset, elevation]
const FORMATIONS = [
  (e, s) => [e.u * s * 52, 56],                                              // 0 fan
  (e, s) => [-e.u * s * 46, 46],                                             // 1 cross
  (e, s) => [e.u * s * 62, 24 + Math.abs(e.u) * 40],                         // 2 V
  (e, s) => [e.u * s * 46, 72 - Math.abs(e.u) * 40],                         // 3 cathedral
  () => [0, 52],                                                             // 4 wall
  (e, s) => [-34 * s, 44],                                                   // 5 wall leaning left
  (e, s) => [34 * s, 44],                                                    // 6 wall leaning right
  (e, s) => [(e.i % 2 ? 1 : -1) * (24 + 26 * s), 50],                        // 7 pairs apart
  (e, s) => [e.u * s * 30, 14],                                              // 8 low sweep into the crowd
  (e, s, r) => [(r * 2 - 1) * 70 * s, 18 + r * 52],                          // 9 scatter
  (e, s) => [e.u * s * 40, e.i % 2 ? 68 : 26],                               // 10 zipper
  () => [0, 80],                                                             // 11 straight up
  (e, s) => [e.u * s * 50, 20 + (e.u + 1) * 25],                             // 12 diagonal rising
  (e, s) => [e.u * s * 50, 20 + (1 - e.u) * 25],                             // 13 diagonal falling
  (e, s) => [e.u * s * 20 + (e.side || 1) * 8, 34 + (e.i % 3) * 14],         // 14 three-tier
  (e, s) => [Math.sign(e.u || 1) * (10 + Math.abs(e.u) * 50) * s, 36 + Math.abs(e.u) * 26], // 15 outward wings
];
const SEQ_CACHE = new Map();
function formationSeq(seed, cueT) {
  const key = `${seed}:${Math.round(cueT * 10)}`;
  let seq = SEQ_CACHE.get(key);
  if (seq) return seq;
  seq = [];
  let prev = -1;
  for (let k = 0; k < 8; k++) {
    let f = Math.floor(hash(seed, k + cueT * 0.37) * FORMATIONS.length);
    if (f === prev) f = (f + 5) % FORMATIONS.length;
    seq.push(f); prev = f;
  }
  if (SEQ_CACHE.size > 400) SEQ_CACHE.clear();
  SEQ_CACHE.set(key, seq);
  return seq;
}

export const MOVE = {
  still: (c) => poseDir(c.q.pose || 'up', c.el),
  fan: (c) => {
    if (c.q.pose && c.q.pose !== 'up' && c.q.pose !== 'out') return poseDir(c.q.pose, c.el);
    const s = c.q.spread ?? 0.8;
    return dirFromAngles(c.el.u * s * 55, c.q.pose === 'out' ? 35 : 55 - s * 10);
  },
  fan_open: (c) => {
    const e = c.p * c.p * (3 - 2 * c.p);
    return dirFromAngles(c.el.u * (c.q.spread ?? 0.9) * 55 * e, 80 - 30 * e);
  },
  fan_close: (c) => {
    const e = 1 - c.p;
    return dirFromAngles(c.el.u * (c.q.spread ?? 0.7) * 55 * e, 50 + 30 * c.p);
  },
  sweep: (c) => dirFromAngles(Math.sin(phaseOf(c, c.q.speed)) * (c.q.spread ?? 0.5) * 55 + c.el.u * 8, 42 + (c.q.tilt ?? 0) * 25),
  wave: (c) => dirFromAngles(c.el.u * 25 * (c.q.spread ?? 0.6) + c.el.u * 10, 45 + Math.sin(phaseOf(c, c.q.speed) - c.el.i * 0.7) * (c.q.spread ?? 0.6) * 30),
  circle: (c) => {
    const ph = phaseOf(c, c.q.speed) + c.el.i * 0.5;
    const s = c.q.size ?? 0.5;
    return dirFromAngles(c.el.u * 30 + Math.cos(ph) * s * 25, 50 + Math.sin(ph) * s * 20);
  },
  crossfire: (c) => {
    const side = c.el.side || (c.el.i % 2 ? 1 : -1);
    const a = Math.sin(phaseOf(c, c.q.speed)) * (c.q.spread ?? 0.8) * 45;
    return dirFromAngles(-side * (10 + a), 40);
  },
  ballyhoo: (c) => {
    const x = (c.bp - c.bp0) / (c.q.speed ?? 4);
    const s = c.q.spread ?? 0.9;
    return dirFromAngles((noise1(c.el.i, x) * 2 - 1) * 60 * s, 25 + noise1(c.el.i + 50, x * 1.3) * 45 * s);
  },
  tunnel: (c) => {
    const ph = phaseOf(c, c.q.speed ?? 8);
    return dirTo(c.el.pos, [Math.cos(ph) * 1.5, 6 + Math.sin(ph) * 1.5, 9]);
  },
  // ── movements that dance with the music ──
  // Head nod: the fan holds a pose and every beat the elevation dips and recovers.
  bounce: (c) => {
    const f = frac(c.bp);
    const depth = (c.q.size ?? 0.5) * 22 * Math.pow(1 - f, 3);
    const s = c.q.spread ?? 0.6;
    return dirFromAngles(c.el.u * s * 45, 58 - depth);
  },
  // Formation jumps every N beats: a programmed dance step. Eased by the fixture's own motors.
  snap: (c) => {
    const every = c.q.every || 2;
    const k = Math.floor(Math.max(0, c.bp - c.bp0 + 1e-6) / every);
    const s = c.q.spread ?? 0.8;
    const side = c.el.side || (c.el.i % 2 ? 1 : -1);
    switch (k % 4) {
      case 0: return dirFromAngles(c.el.u * s * 50, 62);
      case 1: return dirFromAngles(-side * (14 + s * 20), 40);       // cross over
      case 2: return dirFromAngles(c.el.u * s * 18, 22);             // low, into the crowd
      default: return dirFromAngles(side * (18 + s * 26) + c.el.u * 8, 50); // wide out
    }
  },
  // Pendulum locked to the bar, wider when the singer is louder.
  swing: (c) => {
    const amp = (c.q.spread ?? 0.6) * (0.55 + 0.9 * c.tb.envelope('mid', c.t));
    const ph = (2 * Math.PI * (c.bp - c.bp0)) / (c.q.speed ?? 4);
    return dirFromAngles(Math.sin(ph) * amp * 50 + c.el.u * 10, 46 + Math.cos(ph * 2) * 6);
  },
  // The fan opens on each beat and closes before the next: the shape of a dancer's arms.
  pulse_fan: (c) => {
    const f = frac(c.bp);
    const open = 0.4 + 0.6 * kick(f, 3.2);
    const s = (c.q.spread ?? 0.8) * open;
    return dirFromAngles(c.el.u * s * 58, 62 - (c.q.size ?? 0.4) * 14 * open);
  },
  // Sharp travelling wave, fixture to fixture.
  domino: (c) => {
    const ph = (2 * Math.PI * (c.bp - c.bp0)) / (c.q.speed ?? 4) - c.el.i * 0.9;
    const k = Math.max(0, Math.sin(ph));
    return dirFromAngles(c.el.u * (c.q.spread ?? 0.7) * 45, 30 + 42 * k * k);
  },
  // Full-circle dance: azimuth goes through everything a 540 degree pan allows, then comes back.
  spin: (c) => {
    const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 4 - 1 : 3 - f * 4; }; // -1..1..-1 over one cycle
    const ph = (c.bp - c.bp0) / (c.q.speed ?? 8) + c.el.u * 0.5 * (c.q.spread ?? 0.5);
    const el = 18 + (c.q.size ?? 0.5) * 55 + Math.sin(ph * 2 * Math.PI * 2) * 6;
    return dirFromAngles(tri(ph) * 262, el);
  },
  cone: (c) => {
    const tri = (x) => { const f = x - Math.floor(x); return f < 0.5 ? f * 4 - 1 : 3 - f * 4; };
    const dir = c.el.i % 2 ? 1 : -1;
    const ph = (c.bp - c.bp0) / (c.q.speed ?? 8);
    return dirFromAngles(dir * tri(ph + c.el.i * 0.13) * 255, 22 + (c.q.size ?? 0.5) * 45);
  },
  // Elevation follows the vocal line (mid envelope): rises with the singer, settles on resolution.
  vocal: (c) => {
    const m = c.tb.envelope('mid', c.t);
    const ph = (2 * Math.PI * (c.bp - c.bp0)) / 16;
    return dirFromAngles(c.el.u * (c.q.spread ?? 0.6) * 40 + Math.sin(ph + c.el.i * 0.4) * 10, 24 + (c.q.size ?? 0.6) * 60 * Math.pow(m, 1.2));
  },
  // ── figures: the whole unit moves as one shape ──
  orbit: (c) => {
    const F = c.el.focus || [0, 0, 10];
    const ph = TAU * cyc(c, 16);
    const R = 4 + (c.q.size ?? 0.5) * 18;
    const H = 7 + (c.q.size ?? 0.5) * 7;
    const loose = (c.q.spread ?? 0.25) * 9;
    return dirTo(c.el.pos, [F[0] + Math.cos(ph) * R + c.el.u * loose, H + Math.sin(ph * 2) * 1.8, F[2] + Math.sin(ph) * R * 0.7]);
  },
  lissajous: (c) => {
    const F = c.el.focus || [0, 0, 10];
    const lag = (c.q.phase ?? 0.3) * (c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0) * 0.5;
    const ph = TAU * (cyc(c, 16) - lag);
    const R = 5 + (c.q.size ?? 0.5) * 20;
    const loose = (c.q.spread ?? 0.2) * 7;
    return dirTo(c.el.pos, [F[0] + Math.sin(ph) * R + c.el.u * loose, 8 + Math.cos(ph * 2) * 3.5 * (0.4 + (c.q.size ?? 0.5)), F[2] + Math.sin(ph * 2) * R * 0.5]);
  },
  helix: (c) => {
    const dir = c.el.i % 2 ? 1 : -1;
    const t = cyc(c, 16);
    const el = 30 + (c.q.size ?? 0.5) * 30 + Math.sin(TAU * 2 * t + dir * c.el.i * 0.5) * 14;
    return dirFromAngles(c.el.az0 + dir * (t * 360 + c.el.i * (c.q.spread ?? 0.4) * 24), el);
  },
  lotus: (c) => {
    const open = 0.5 - 0.5 * Math.cos(TAU * cyc(c, 16));
    const span = c.el.surround ? 360 : 210;
    const az = (c.el.n > 1 ? c.el.i / (c.el.n - (c.el.surround ? 0 : 1)) - (c.el.surround ? 0 : 0.5) : 0) * span;
    const turn = cyc(c, 16) * (c.el.surround ? 90 : 25);
    const el = 80 - (8 + open * ((c.q.size ?? 0.5) * 52 + 14));
    return dirFromAngles(c.el.az0 + (c.el.surround ? az + turn : az * (0.55 + 0.45 * open) + turn * 0.3), el);
  },
  carousel: (c) => {
    const t = cyc(c, 16);
    const lag = (c.q.phase ?? 0) * (c.el.n > 1 ? c.el.i / c.el.n : 0) * 40;
    const el = 14 + (c.q.size ?? 0.4) * 34 + Math.sin(TAU * 2 * t) * 5;
    const az = c.el.surround ? t * 360 + lag : tri(t) * 95 + lag;
    return dirFromAngles(c.el.az0 + az, el);
  },
  curtain: (c) => {
    const t = cyc(c, 16);
    const twist = (c.q.phase ?? 0) * c.el.u * 40;
    return dirFromAngles(c.el.az0 + tri(t) * (c.q.spread ?? 0.6) * 62 + twist, 26 + (c.q.size ?? 0.5) * 34 + Math.sin(TAU * t * 0.5) * 8);
  },
  scissor: (c) => {
    const k = Math.sin(TAU * cyc(c, 8));
    const s = (c.q.spread ?? 0.7) * 62;
    return dirFromAngles(c.el.az0 + c.el.u * s * k, 40 + (c.q.size ?? 0.4) * 24 - Math.abs(k) * 8 + (1 - Math.abs(c.el.u)) * 8);
  },
  ripple: (c) => {
    const dirn = (c.q.tilt ?? 0) < 0 ? -1 : 1;
    const w = Math.sin(TAU * (c.el.center * 0.9 * dirn - cyc(c, 8)));
    return dirFromAngles(c.el.az0 + c.el.u * (c.q.spread ?? 0.6) * 38, 44 + w * (c.q.size ?? 0.6) * 34);
  },
  stairs: (c) => {
    const every = c.q.every || 1, x = Math.max(0, c.bp - c.bp0 + 1e-6) / every, step = Math.floor(x);
    const n = Math.max(2, c.el.n);
    const lvlOf = (st) => ((c.el.i + st) % n) / (n - 1);
    let lvl = lvlOf(step);
    const g = (x - step) * every / 0.5; // each step slides into place rather than jumping
    if (step > 0 && g < 1) lvl = lvlOf(step - 1) + (lvl - lvlOf(step - 1)) * ease3(g);
    return dirFromAngles(c.el.az0 + c.el.u * (c.q.spread ?? 0.7) * 42, 18 + lvl * (20 + (c.q.size ?? 0.6) * 45));
  },
  scanline: (c) => {
    const t = cyc(c, 8);
    const lag = (c.q.phase ?? 0) * c.el.center * 0.25;
    const e = 0.5 + 0.5 * tri(t - lag);
    return dirFromAngles(c.el.az0 + c.el.u * (c.q.spread ?? 0.6) * 45, 8 + e * (22 + (c.q.size ?? 0.5) * 36));
  },
  spiral: (c) => {
    const F = c.el.focus || [0, 0, 10];
    const turns = (c.q.speed ?? 3);
    const a = c.p * turns * TAU, r = (1 - c.p) * (6 + (c.q.size ?? 0.5) * 14) + 0.5;
    return dirTo(c.el.pos, [F[0] + Math.cos(a) * r + c.el.u * (c.q.spread ?? 0.2) * 5, 3 + c.p * 12, F[2] + Math.sin(a) * r * 0.7]);
  },
  peacock: (c) => {
    const f = frac(c.bp);
    const open = 0.72 + 0.28 * kick(f, 3) + 0.08 * Math.sin(TAU * cyc(c, 16));
    const u = c.el.u, a = Math.abs(u);
    const shimmer = Math.sin(c.t * 6.5 + c.el.i * 1.7) * 2.2 * a;
    return dirFromAngles(c.el.az0 + u * (c.q.spread ?? 0.85) * 76 * open + shimmer, 16 + (c.q.size ?? 0.6) * 50 * (1 - Math.pow(a, 1.6)) * open + 10 * open);
  },
  dance: (c) => {
    const every = c.q.every || 2;
    const x = Math.max(0, c.bp - c.bp0 + 1e-6) / every, k = Math.floor(x);
    const seq = formationSeq(c.q.seed ?? 0, c.cue.t);
    const s = c.q.spread ?? 0.8;
    const at = (kk) => { const form = FORMATIONS[seq[kk % seq.length]]; const [az, el] = form(c.el, s, hash(c.q.seed ?? 0, kk + 3, c.el.i + 1), kk); return [az, el]; };
    let [az, el] = at(k);
    const g = (x - k) * every / 0.6; // the change of formation takes the first 0.6 beat of the step, eased
    if (k > 0 && g < 1) { const [a0, e0] = at(k - 1), w = ease3(g); az = a0 + (az - a0) * w; el = e0 + (el - e0) * w; }
    return dirFromAngles(c.el.az0 + az, el);
  },
  drift: (c) => {
    const sp = c.q.speed ?? 16, x = (c.bp - c.bp0) / sp, seed = c.q.seed ?? 3;
    const shared = noise1(seed, x) * 2 - 1, shared2 = noise1(seed + 9, x * 1.2) * 2 - 1;
    const own = noise1(seed + c.el.i * 3 + 20, x * 1.7) * 2 - 1, own2 = noise1(seed + c.el.i * 3 + 21, x * 1.5) * 2 - 1;
    const s = c.q.spread ?? 0.6;
    return dirFromAngles(c.el.az0 + c.el.u * s * 30 + shared * 40 * s + own * 16 * s, 46 + (c.q.size ?? 0.5) * 8 + shared2 * 18 + own2 * 10);
  },
  ribbon: (c) => {
    const lag = (c.q.phase ?? 0.5) * (c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0) * 0.45;
    const t = cyc(c, 16) - lag;
    return dirFromAngles(c.el.az0 + Math.sin(TAU * t) * (c.q.spread ?? 0.7) * 62, 42 + Math.cos(TAU * 2 * t) * (c.q.size ?? 0.5) * 30);
  },
};

const ease = (x) => x * x * (3 - 2 * x);
function frac(x) { return x - Math.floor(x); }
const MIN_FLASH_GAP = 1 / 12; // seconds; WAL never asks for more than 12 flashes a second

function stepIndex(c, on, every = 1) {
  const cur = c.tb.lastTrigger(on, c.t);
  const start = c.tb.lastTrigger(on, c.cue.t - 1e-3);
  const k = cur.idx - start.idx - 1; // steps since cue start (first trigger at/after start = 0)
  return { k: Math.floor(Math.max(0, k) / every), cur, raw: k };
}

export const DIM = {
  on: (c) => c.q.intensity ?? 1,
  off: () => 0,
  follow: (c) => (c.q.intensity ?? 1) * Math.pow(c.tb.envelope(c.q.env || 'energy', c.t), 1.4),
  pulse: (c) => {
    const every = c.q.every || 1;
    const on = c.q.on || 'beat';
    const arr = c.tb.triggers[on];
    // walk back to the last trigger that counts (every Nth since cue start)
    const { cur } = stepIndex(c, on);
    const start = c.tb.lastTrigger(on, c.cue.t - 1e-3).idx + 1;
    let idx = cur.idx;
    while (idx >= start && (idx - start) % every !== 0) idx--;
    if (idx < start) return 0;
    const dt = c.t - arr[idx];
    const s = ['low', 'mid', 'high'].includes(on) ? 0.5 + 0.5 * (c.tb.lastTrigger(on, arr[idx]).strength ?? 1) : 1;
    return (c.q.intensity ?? 1) * s * Math.exp(-dt / Math.max(0.03, c.q.decay ?? 0.4));
  },
  chase: (c) => {
    const { k, cur } = stepIndex(c, c.q.on || 'beat', c.q.every || 1);
    const n = c.el.n;
    if (cur.idx < 0) return 0;
    let pos;
    const dir = c.q.direction || 'forward';
    if (dir === 'bounce') { const m = Math.max(1, 2 * (n - 1)); const r = k % m; pos = r < n ? r : m - r; }
    else if (dir === 'reverse') pos = n - 1 - (k % n);
    else if (dir === 'out' || dir === 'in') {
      const steps = Math.ceil(n / 2);
      const r = k % steps;
      const ring = dir === 'out' ? r : steps - 1 - r;
      return Math.abs(Math.round(c.el.center * (steps - 1)) - ring) === 0 ? 1 : 0.06;
    } else pos = k % n;
    const width = Math.max(1, (c.q.width ?? 0.25) * n);
    const d = Math.abs(c.el.i - pos);
    const age = c.t - cur.time;
    return Math.max(0.04, 1 - d / width) * (0.75 + 0.25 * Math.exp(-age * 4));
  },
  alternate: (c) => {
    const { k, cur } = stepIndex(c, c.q.on || 'beat', c.q.every || 1);
    if (cur.idx < 0) return 0;
    const group = c.q.split === 'oddeven' ? c.el.i % 2 : c.el.side < 0 ? 0 : 1;
    return group === k % 2 ? (c.q.intensity ?? 1) : 0.05;
  },
  breathe: (c) => (c.q.intensity ?? 1) * (0.25 + 0.75 * (0.5 - 0.5 * Math.cos(phaseOf(c, c.q.speed ?? 8)))),
  sparkle: (c) => {
    const dens = c.q.density ?? 0.3;
    const seed = c.el.i * 12.9898 + (c.el.sub || 0) * 78.233;
    const r = (n) => { const s = Math.sin(seed + n) * 43758.5453; return s - Math.floor(s); };
    if (r(1) > dens * 1.6) return 0.03;
    const w = 1.2 + r(2) * 3;
    return (c.q.intensity ?? 1) * Math.pow(Math.max(0, Math.sin(c.t * w + r(3) * 6.28)), 10);
  },
  strobe: (c) => {
    const rate = (c.q.rate ?? 10) * (c.q.ramp ? 0.25 + 0.75 * c.p : 1);
    const ph = c.t * rate;
    return ph - Math.floor(ph) < 0.22 ? (c.q.intensity ?? 1) : 0;
  },
  swell: (c) => (c.q.intensity ?? 1) * Math.pow(c.p, 1.5),
  fade: (c) => (c.q.intensity ?? 1) * (1 - ease(c.p)),
  dandiya_tap: (c) => {
    const cur = c.tb.lastTrigger('high', c.t);
    const start = c.tb.lastTrigger('high', c.cue.t - 1e-3);
    if (cur.idx <= start.idx) return 0.05;
    const side = (cur.idx - start.idx) % 2 ? -1 : 1;
    const mine = c.el.side === 0 ? true : c.el.side === side;
    if (!mine) return 0.05;
    return (c.q.intensity ?? 1) * (0.4 + 0.6 * cur.strength) * Math.exp(-(c.t - cur.time) / Math.max(0.04, c.q.decay ?? 0.15));
  },
  strobe_seq: (c) => {
    const I = c.q.intensity ?? 1;
    const spb = c.tb.spb;
    const bp = Math.max(0, c.bp - c.bp0 + 1e-6);
    const every = c.q.every || 1;
    // flashes are [startFraction, lengthFraction] inside a window of `win` beats
    let win = every, flashes;
    switch (c.q.pattern || 'single') {
      case 'double': flashes = [[0, 0.1], [0.25, 0.1]]; win = every; break;
      case 'triple': flashes = [[0, 0.08], [0.17, 0.08], [0.34, 0.08]]; break;
      case 'gallop': flashes = [[0, 0.14], [0.5, 0.08], [0.75, 0.08]]; break;
      case 'heartbeat': flashes = [[0, 0.07], [0.14, 0.07]]; win = 2 * every; break;
      case 'burst': {
        const n = Math.max(2, Math.floor((spb * every) / MIN_FLASH_GAP));
        flashes = Array.from({ length: n }, (_, i) => [i / n, 0.5 / n]); break;
      }
      case 'stutter': {
        // flash rate climbs smoothly from one per beat to the 12 Hz ceiling across the cue, ending as a solid burst
        const D = Math.max(0.5, c.cue.until - c.cue.t), e = Math.max(0, c.t - c.cue.t);
        const r0 = 1 / spb, r1 = 1 / MIN_FLASH_GAP;
        return frac(r0 * e + ((r1 - r0) * e * e) / (2 * D)) < 0.4 ? I : 0;
      }
      case 'split': {
        const k = Math.floor(bp / every);
        const mine = c.el.side === 0 ? true : (c.el.side < 0) === (k % 2 === 0);
        return mine && frac(bp / every) < 0.16 ? I : 0;
      }
      case 'chase': {
        const slot = c.el.n > 1 ? c.el.i / c.el.n : 0;
        const d = frac(bp / every - slot);
        return d < Math.max(0.08, 1 / Math.max(2, c.el.n)) ? I : 0;
      }
      case 'random': {
        const slot = Math.floor(c.t / 0.09);
        const h = Math.sin((c.el.i + 1) * 12.9898 + slot * 78.233) * 43758.5453;
        return h - Math.floor(h) < (c.q.rate != null ? Math.min(0.9, c.q.rate / 24) : 0.18) ? I : 0;
      }
      default: flashes = [[0, 0.12]];
    }
    const w = frac(bp / win) * win; // beats into the window
    for (const [a, l] of flashes) {
      const x = w - a * win;
      if (x >= 0 && x < l * win) return I;
    }
    return 0;
  },
  garba_circle: (c) => {
    const lap = (c.bp - c.bp0) / (c.q.speed ?? 16);
    let head = lap - Math.floor(lap);
    if (c.q.direction === 'reverse') head = 1 - head;
    let d = Math.abs(c.el.ring - head);
    d = Math.min(d, 1 - d);
    const w = Math.max(0.05, (c.q.width ?? 0.3) / 2);
    return Math.max(0.05, 1 - d / w);
  },
  // ── layered pixel / tube / matrix looks (use grid coordinates gx, gy; 0..1) ──
  comet: (c) => {
    const lap = (c.bp - c.bp0) / (c.q.speed ?? 8);
    let head = c.q.direction === 'bounce' ? 0.5 + 0.5 * tri(lap) : lap - Math.floor(lap);
    if (c.q.direction === 'reverse') head = 1 - head;
    const pos = c.el.gx != null && c.el.span2d ? c.el.gx : c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0;
    let d = c.q.direction === 'reverse' ? pos - head : head - pos;
    if (c.q.direction !== 'bounce') d = d - Math.floor(d); else d = Math.max(0, d);
    const tail = Math.max(0.06, c.q.width ?? 0.3);
    return (c.q.intensity ?? 1) * Math.max(0.03, Math.pow(Math.max(0, 1 - d / tail), 1.5));
  },
  meter: (c) => {
    const e = Math.pow(c.tb.envelope(c.q.env || 'energy', c.t), 1.1);
    const v = c.q.direction === 'out' ? Math.abs((c.el.gy ?? 0.5) - 0.5) * 2 : (c.el.gy ?? (c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0));
    const lvl = Math.min(1, e * 1.15);
    return v <= lvl ? (c.q.intensity ?? 1) * (0.45 + 0.55 * (1 - v / Math.max(0.05, lvl) * 0.4)) : 0.04;
  },
  ripple: (c) => {
    const sp = c.q.speed ?? 4;
    const dist = c.el.rad ?? c.el.center ?? 0;
    const w = Math.max(0.08, c.q.width ?? 0.3);
    const head = ((c.bp - c.bp0) / sp) % 1;
    let d = c.q.direction === 'in' ? (1 - head) - dist : dist - head;
    d = Math.abs(d);
    return (c.q.intensity ?? 1) * Math.max(0.04, 1 - d / w);
  },
  checker: (c) => {
    const step = Math.floor(Math.max(0, c.bp - c.bp0 + 1e-6) / (c.q.every || 1));
    const cell = c.el.gx != null && c.el.span2d ? Math.floor(c.el.gx * 8) + Math.floor((c.el.gy ?? 0) * 5) : c.el.i;
    return (cell + step) % 2 ? (c.q.intensity ?? 1) : 0.05;
  },
  eq: (c) => {
    const col = c.el.gx != null && c.el.span2d ? c.el.gx : c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0;
    const band = col < 0.34 ? 'low' : col < 0.67 ? 'mid' : 'high';
    const k = Math.floor(col * 12);
    const lvl = Math.min(1, c.tb.envelope(band, c.t) * (0.75 + 0.5 * hash(3, k)) * 1.2 * (0.6 + (c.q.density ?? 0.6) * 0.6));
    const y = c.el.gy ?? 0.5;
    return y <= lvl ? (c.q.intensity ?? 1) * (0.5 + 0.5 * y / Math.max(0.1, lvl)) : 0.03;
  },
  rain: (c) => {
    const col = c.el.gx != null && c.el.span2d ? Math.floor(c.el.gx * 14) : c.el.i;
    const sp = (c.q.speed ?? 4) * 0.25;
    const pos = (((c.bp - c.bp0) / (1 / sp * 4) + hash(7, col)) % 1 + 1) % 1;
    const y = c.q.direction === 'reverse' ? (c.el.gy ?? 0.5) : 1 - (c.el.gy ?? 0.5);
    let d = pos - y; d = d - Math.floor(d);
    if (hash(11, col) > (c.q.density ?? 0.55)) return 0.02;
    return (c.q.intensity ?? 1) * Math.max(0.02, Math.pow(Math.max(0, 1 - d / 0.35), 2));
  },
  plasma: (c) => {
    const t = (c.bp - c.bp0) / (c.q.speed ?? 16) * TAU;
    const x = (c.el.gx ?? (c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0)) * 6.5, y = (c.el.gy ?? 0.5) * 5;
    const v = 0.5 + 0.25 * Math.sin(x + t) + 0.25 * Math.sin(y * 1.3 - t * 1.3 + x * 0.4) + 0.12 * Math.sin((x + y) * 1.6 + t * 2);
    return (c.q.intensity ?? 1) * Math.pow(Math.max(0, Math.min(1, v)), 1.6);
  },
  diagonal: (c) => {
    const lap = (c.bp - c.bp0) / (c.q.speed ?? 8);
    const x = c.el.gx != null && c.el.span2d ? c.el.gx + (c.el.gy ?? 0) * 0.6 : c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0;
    let ph = (x * 1.6 - (c.q.direction === 'reverse' ? -lap : lap)) * 3;
    ph = ph - Math.floor(ph);
    return (c.q.intensity ?? 1) * (ph < Math.max(0.12, c.q.width ?? 0.4) ? 1 : 0.05);
  },
  thump: (c) => {
    const on = c.q.on || 'beat';
    const cur = c.tb.lastTrigger(on, c.t);
    if (cur.idx < 0) return 0;
    const delay = (c.el.rad ?? c.el.center ?? 0) * (c.q.speed ?? 0.25) * c.tb.spb;
    const dt = c.t - cur.time - delay;
    if (dt < 0) return 0.05;
    return (c.q.intensity ?? 1) * Math.max(0.04, Math.exp(-dt / Math.max(0.05, c.q.decay ?? 0.35)));
  },
};

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

export const COLOR = {
  static: (c, pal) => (c.q.hex ? hexToRgb(c.q.hex) : pal[(c.q.index ?? 0) % pal.length]),
  cycle: (c, pal) => {
    const { k } = stepIndex(c, c.q.on || 'bar', c.q.every || 1);
    return pal[k % pal.length];
  },
  split: (c, pal) => {
    const g = c.q.split === 'oddeven' ? c.el.i % 2 : c.el.side < 0 ? 0 : 1;
    return pal[g % pal.length];
  },
  gradient: (c, pal) => {
    if (pal.length === 1) return pal[0];
    const x = (c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0) * (pal.length - 1);
    const i = Math.min(pal.length - 2, Math.floor(x)), f = x - i;
    return pal[i].map((v, k) => v * (1 - f) + pal[i + 1][k] * f);
  },
  rainbow: (c) => hsv(c.el.i / Math.max(1, c.el.n) + (c.bp - c.bp0) / (c.q.speed ?? 32), 1, 1),
  sweep: (c, pal) => {
    if (pal.length === 1) return pal[0];
    const pos = (c.el.gx != null && c.el.span2d ? c.el.gx : c.el.n > 1 ? c.el.i / (c.el.n - 1) : 0) + (c.bp - c.bp0) / (c.q.speed ?? 16);
    const x = (((pos % 1) + 1) % 1) * pal.length;
    const i = Math.floor(x) % pal.length, f = x - Math.floor(x);
    const a = pal[i], b = pal[(i + 1) % pal.length];
    return a.map((v, k) => v * (1 - f) + b[k] * f);
  },
  pairs: (c, pal) => {
    const { k } = stepIndex(c, c.q.on || 'bar', c.q.every || 1);
    return pal[(c.el.i + k) % 2 === 0 ? 0 : 1 % pal.length];
  },
  fire: (c) => {
    const f = 0.5 + 0.5 * noise1(c.el.i + 7, c.t * 2.6 * (c.q.speed ? 8 / c.q.speed : 1)) ;
    return [1, 0.12 + 0.55 * f * f, 0.02 * f];
  },
  tide: (c, pal) => {
    const d = c.el.rad ?? c.el.center ?? 0;
    const k = Math.floor((d * 3 - (c.bp - c.bp0) / (c.q.speed ?? 8)) * 1);
    return pal[((k % pal.length) + pal.length) % pal.length];
  },
};

// Looks that place themselves relative to the rig's focus (el.az0 / el.focus). Every other look is written for a
// stage that faces +z, so on a ring rig (garba) the decoder turns it to face the middle of the ring.
export const FRAMED = new Set(['orbit', 'lissajous', 'helix', 'lotus', 'carousel', 'curtain', 'scissor', 'ripple', 'stairs', 'scanline', 'spiral', 'peacock', 'dance', 'drift', 'ribbon', 'tunnel']);
export function needsFrame(look, q) {
  if (FRAMED.has(look) || look === 'still') return false;
  if (look === 'fan' && q.pose && q.pose !== 'up' && q.pose !== 'out') return false;
  return true;
}
export function inGroup(el, g) {
  if (!g || g === 'all' || el.n <= 1) return true;
  switch (g) {
    case 'left': return el.u < 0 || (el.u === 0 && el.i % 2 === 0);
    case 'right': return el.u > 0 || (el.u === 0 && el.i % 2 === 1);
    case 'odd': return el.i % 2 === 1;
    case 'even': return el.i % 2 === 0;
    case 'inner': return el.center < 0.5;
    case 'outer': return el.center >= 0.5;
    case 'front': return el.depth >= 0.5;
    case 'back': return el.depth < 0.5;
    default: return true;
  }
}
