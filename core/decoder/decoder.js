// createDecoder(wal, rig) -> { frame(t) -> { [fixtureId]: state }, report }
//
// Turns rig-agnostic WAL intent into per-fixture state for one rig. Pure JS with no
// rendering, so the same decoder can drive the simulator or (later) Art-Net/sACN.
//
// Rig: { fixtures: [{ id, model, pos: [x,y,z], mount: 'hung'|'floor', role? }] }
// State: { role, dim, rgb: [r,g,b], aim: {x,y,z}, pan, tilt, pixels?: [[r,g,b]...], laser?: {...}, strobeHz }
//
// Cue resolution per layer: cues active at t (t <= now < until) are applied in start
// order, so a later cue overrides only the parts (move/dim/color) it defines.
// A cue for a layer the rig lacks plays on the first FALLBACK layer the rig has.
import { FIXTURES } from '../fixtures/library.js';
import { FALLBACK, PALETTES, LAYERS } from '../wal/vocab.js';
import { createTimebase } from './timebase.js';
import { MOVE, DIM, COLOR, hexToRgb, poseDir, needsFrame, inGroup } from './looks.js';

const DEG = 180 / Math.PI;
// seconds an effect stays visible after its trigger window
const STAGE_FX = { co2: 0.6, confetti: 6, flame: 0.8, spark: 1.2, streamers: 5 };
// movement look -> the shape a laser draws for it
const LASER_PATTERN = { tunnel: 'tunnel', spiral: 'tunnel', orbit: 'tunnel', lotus: 'cone', helix: 'cone', spin: 'cone', cone: 'cone', carousel: 'sheet', curtain: 'sheet', scanline: 'sheet', scissor: 'sheet', ribbon: 'wave', lissajous: 'wave', peacock: 'burst', ripple: 'burst', dance: 'fan' };
function turn(a, deg) { const r = deg / DEG, c = Math.cos(r), s = Math.sin(r); return { x: a.x * c + a.z * s, y: a.y, z: -a.x * s + a.z * c }; }

export function buildElements(rig, library = FIXTURES) {
  const fixtures = rig.fixtures.map((f) => {
    const profile = library[f.model];
    if (!profile) throw new Error(`unknown fixture model "${f.model}" (${f.id})`);
    return { ...f, profile, role: f.role || profile.role, mount: f.mount || (f.pos[1] > 2 ? 'hung' : 'floor') };
  });
  const byRole = {};
  for (const f of fixtures) {
    const cells = [];
    const P = f.profile.pixels || 1;
    if (P > 1 && f.profile.width) {
      // grid cloth in the x/y plane
      const cols = Math.round(Math.sqrt((P * f.profile.width) / f.profile.height));
      const rows = Math.ceil(P / cols);
      for (let k = 0; k < P; k++) {
        const cx = (k % cols) / Math.max(1, cols - 1) - 0.5, cy = Math.floor(k / cols) / Math.max(1, rows - 1) - 0.5;
        cells.push({ sub: k, pos: [f.pos[0] + cx * f.profile.width, f.pos[1] + cy * f.profile.height, f.pos[2]] });
      }
    } else if (P > 1 && f.profile.vertical) {
      const len = f.profile.length || 1;
      for (let k = 0; k < P; k++) cells.push({ sub: k, pos: [f.pos[0], f.pos[1] + ((k + 0.5) / P - 0.5) * len, f.pos[2]] });
    } else if (P > 1) {
      const len = f.profile.length || 1;
      for (let k = 0; k < P; k++) cells.push({ sub: k, pos: [f.pos[0] + ((k + 0.5) / P - 0.5) * len, f.pos[1], f.pos[2]] });
    } else cells.push({ sub: 0, pos: f.pos });
    (byRole[f.role] ||= []).push(...cells.map((c) => ({ ...c, fixture: f })));
  }
  // centroid of the whole rig in plan, for ring order (garba laps)
  let cx = 0, cz = 0;
  for (const f of fixtures) { cx += f.pos[0]; cz += f.pos[2]; }
  cx /= Math.max(1, fixtures.length); cz /= Math.max(1, fixtures.length);

  // Where the action is. A stage rig faces the audience (+z); a ring rig (garba ground: lights all round the
  // dancers) faces its middle, so every look is turned to point inwards from wherever its fixture stands.
  const xs = fixtures.map((f) => f.pos[0]), zs = fixtures.map((f) => f.pos[2]);
  const surround = rig.surround ?? (Math.max(...xs) - Math.min(...xs) >= 14 && Math.max(...zs) - Math.min(...zs) >= 14);
  const focus = rig.focus || (surround ? [cx, 0, cz] : [0, 0, 10]);

  for (const els of Object.values(byRole)) {
    els.sort((a, b) => a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2] || a.pos[1] - b.pos[1]);
    const n = els.length;
    const maxAbsX = Math.max(1e-6, ...els.map((e) => Math.abs(e.pos[0])));
    const lo = [0, 1, 2].map((k) => Math.min(...els.map((e) => e.pos[k]))), hi = [0, 1, 2].map((k) => Math.max(...els.map((e) => e.pos[k])));
    const span2d = hi[0] - lo[0] > 0.05 && hi[1] - lo[1] > 0.05;
    els.forEach((e, i) => {
      e.i = i; e.n = n;
      e.u = n > 1 ? (2 * i) / (n - 1) - 1 : 0;
      e.side = e.pos[0] < -0.3 ? -1 : e.pos[0] > 0.3 ? 1 : 0;
      const a = Math.atan2(e.pos[0] - cx, e.pos[2] - cz);
      e.ring = (a / (2 * Math.PI) + 1) % 1;
      e.center = Math.abs(e.pos[0]) / maxAbsX;
      e.focus = focus; e.surround = surround;
      e.az0 = surround ? Math.atan2(focus[0] - e.pos[0], focus[2] - e.pos[2]) * DEG : 0;
      e.span2d = span2d;
      e.gx = hi[0] > lo[0] ? (e.pos[0] - lo[0]) / (hi[0] - lo[0]) : 0.5;
      e.gy = hi[1] > lo[1] ? (e.pos[1] - lo[1]) / (hi[1] - lo[1]) : 0.5;
      e.depth = hi[2] - lo[2] > 0.5 ? (e.pos[2] - lo[2]) / (hi[2] - lo[2]) : n > 1 ? i / (n - 1) : 0.5;
      e.rad = span2d ? Math.min(1, Math.hypot(e.gx - 0.5, e.gy - 0.5) * 2) : e.center;
    });
  }
  return { fixtures, byRole, focus, surround };
}

// aim direction -> pan/tilt (deg) for a mount. tilt 0 = along the base axis
// (up for floor, down for hung); pan 0 faces the audience (+z).
export function aimToPanTilt(aim, mount, prevPan = 0, profile = {}) {
  const up = mount === 'hung' ? -1 : 1;
  let tilt = Math.acos(Math.max(-1, Math.min(1, aim.y * up))) * DEG;
  let pan = Math.atan2(aim.x, aim.z) * DEG;
  if (mount === 'hung') pan = -pan;
  // pick the pan equivalent (±360) closest to the previous pan, within range
  const half = (profile.pan || 540) / 2;
  let best = pan, bd = Infinity;
  for (const k of [-720, -360, 0, 360, 720]) {
    const p = pan + k;
    if (Math.abs(p) > half) continue;
    if (Math.abs(p - prevPan) < bd) { bd = Math.abs(p - prevPan); best = p; }
  }
  tilt = Math.min(tilt, (profile.tilt || 270) / 2);
  return { pan: best, tilt };
}
export function panTiltToAim(pan, tilt, mount) {
  const up = mount === 'hung' ? -1 : 1;
  const p = (mount === 'hung' ? -pan : pan) / DEG, t = tilt / DEG;
  return { x: Math.sin(t) * Math.sin(p), y: up * Math.cos(t), z: Math.sin(t) * Math.cos(p) };
}

// A head hung upside down on a truss can only tilt about 35 degrees above horizontal (Sharpy: 250 degrees of
// tilt, so 125 either side of straight down). Looks are written in "sky" terms (0-80 degrees up); without
// this squeeze every hung head would clamp at its stop and the whole rig would move as one. Floor heads
// keep the full sky.
function reachable(aim, mount, profile) {
  if (mount !== 'hung' || !profile.tilt) return aim;
  const el = Math.asin(Math.max(-1, Math.min(1, aim.y))) * DEG;
  if (el < 0) return aim;
  const reach = profile.tilt / 2 - 90;
  const e2 = (-35 + (Math.min(el, 80) * (reach + 35)) / 80) / DEG;
  const h = Math.hypot(aim.x, aim.z) || 1;
  return { x: (aim.x / h) * Math.cos(e2), y: Math.sin(e2), z: (aim.z / h) * Math.cos(e2) };
}

function snapToWheel(rgb, wheel) {
  if (!wheel?.length) return rgb;
  const m = Math.max(...rgb, 1e-6);
  const n = rgb.map((v) => v / m);
  let best = wheel[0], bd = Infinity;
  for (const w of wheel) {
    const d = (w[0] - n[0]) ** 2 + (w[1] - n[1]) ** 2 + (w[2] - n[2]) ** 2;
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

export function createDecoder(wal, rig, { library = FIXTURES, prevPan: carriedPan } = {}) {
  const tb = createTimebase(wal);
  const { fixtures, byRole } = buildElements(rig, library);
  const present = new Set(Object.keys(byRole));
  const palettes = Object.fromEntries(Object.entries({ ...PALETTES, ...(wal.palettes || {}) }).map(([k, v]) => [k, v.map(hexToRgb)]));
  const sections = wal.sections;
  const sectionAt = (t) => sections.find((s) => t >= s.start && t < s.end) || sections[sections.length - 1];
  const wheels = Object.fromEntries(Object.entries(library).filter(([, p]) => p.wheel).map(([k, p]) => [k, p.wheel.map(hexToRgb)]));

  // resolve layer -> roles once
  const report = { present: [...present], fallbacks: {}, dropped: [] };
  const targetsOf = (layer) => {
    if (layer === 'all') return [...present];
    if (present.has(layer)) return [layer];
    const fb = (FALLBACK[layer] || []).find((r) => present.has(r));
    if (fb) { report.fallbacks[layer] = fb; return [fb]; }
    if (!report.dropped.includes(layer)) report.dropped.push(layer);
    return [];
  };
  const cuesByRole = Object.fromEntries([...present].map((r) => [r, []]));
  const groupsByRole = Object.fromEntries([...present].map((r) => [r, new Set()]));
  const fxCues = [];
  for (const cue of wal.cues || []) {
    const until = cue.until ?? (cue.fx ? cue.t + (cue.dur ?? 0.5) : sectionAt(cue.t).end);
    const c = { ...cue, until };
    if (cue.fx) fxCues.push(c);
    for (const role of targetsOf(cue.layer)) {
      cuesByRole[role].push({ cue: c, own: cue.layer === role ? 1 : 0, grp: cue.group && cue.group !== 'all' ? cue.group : null });
      if (cue.group && cue.group !== 'all') groupsByRole[role].add(cue.group);
    }
  }
  // a group cue is an overlay: it plays after the cues for the whole layer, whatever their start times
  for (const list of Object.values(cuesByRole)) list.sort((a, b) => (a.grp ? 1 : 0) - (b.grp ? 1 : 0) || a.cue.t - b.cue.t || a.own - b.own);
  for (const l of Object.keys(LAYERS)) if (!present.has(l)) targetsOf(l);

  const accents = (wal.accents || []).filter((a) => a.fx !== 'none');
  const prevPan = carriedPan || new Map(); // live mode rebuilds the decoder every beat and carries pan state across

  function activeIntent(role, t, groups = null) {
    const out = { move: null, dim: null, color: null };
    for (const { cue, grp } of cuesByRole[role]) {
      if (cue.t > t || (grp && !(groups && groups.has(grp)))) continue;
      if (t >= cue.until) continue;
      for (const k of ['move', 'dim', 'color']) if (cue[k]) out[k] = { q: cue[k], cue };
    }
    return out;
  }
  // which of a role's cue groups an element belongs to (cached: fixtures never change inside a decoder)
  const memberOf = new Map();
  const groupsOf = (role, el) => {
    if (!groupsByRole[role].size) return null;
    const k = `${role}:${el.fixture.id}:${el.sub}`;
    let g = memberOf.get(k);
    if (!g) { g = new Set([...groupsByRole[role]].filter((x) => inGroup(el, x))); memberOf.set(k, g); }
    return g;
  };

  // Glide: when a cue changes a part, the new look is blended in from whatever the old look was doing, over a few
  // beats (the tempo's, so a ballad eases slowly and a drop lands fast). Hard hits (`snap`, a flash) opt out with glide 0.
  const prevCache = new Map();
  const prevIntent = (role, gkey, grp, t0) => {
    const k = `${role}|${gkey}|${t0}`;
    let v = prevCache.get(k);
    if (!v) { v = activeIntent(role, t0 - 1e-4, grp); prevCache.set(k, v); if (prevCache.size > 400) prevCache.delete(prevCache.keys().next().value); }
    return v;
  };
  const NO_GLIDE = new Set(['snap', 'bounce', 'thump']);
  const glideOf = (part, dflt) => (!part ? 0 : part.q.glide ?? part.cue.glide ?? (NO_GLIDE.has(part.q.look) ? 0 : dflt));
  const ease = (x) => x * x * (3 - 2 * x);
  const nlerp = (a, b, k) => { const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k, n = Math.hypot(x, y, z) || 1; return { x: x / n, y: y / n, z: z / n }; };

  // Global accent modifiers at time t.
  function accentState(t) {
    let blackout = false, flash = 0, burst = 0, hitFlash = 0;
    for (const a of accents) {
      if (a.t > t + 0.01) break;
      const dt = t - a.t;
      const fx = a.fx || { drop: 'burst', hit: 'flash' }[a.type];
      if (fx === 'blackout' && dt < (a.dur ?? 0.3) - 0.02) blackout = true;
      if (fx === 'burst' && dt < 0.45) { burst = Math.max(burst, a.strength ?? 1); flash = Math.max(flash, Math.exp(-dt / 0.35) * (a.strength ?? 1)); }
      if (fx === 'flash') hitFlash = Math.max(hitFlash, Math.exp(-dt / 0.18) * (a.strength ?? 1));
    }
    const fxRoles = {};
    for (const c of fxCues) {
      if (t < c.t || t >= c.until) continue;
      for (const r of targetsOf(c.layer)) (fxRoles[r] ||= []).push(c);
    }
    return { blackout, flash, burst, hitFlash, fxRoles };
  }

  function frame(t) {
    const sec = sectionAt(t);
    const bp = tb.beatPos(t);
    const acc = accentState(t);
    const states = {};
    for (const f of fixtures) states[f.id] = { role: f.role, dim: 0, rgb: [0, 0, 0], pixels: f.profile.pixels > 1 ? [] : undefined };

    for (const role of present) {
      const intentCache = new Map();
      const secPal = palettes[sec.palette] || palettes.festival;
      for (const el of byRole[role]) {
        const grp = groupsOf(role, el);
        const gkey = grp ? [...grp].sort().join(',') : '';
        let intent = intentCache.get(gkey);
        if (!intent) { intent = activeIntent(role, t, grp); intentCache.set(gkey, intent); }
        const mk = (part) => {
          const cue = part?.cue || { t: sec.start, until: sec.end };
          const p = Math.max(0, Math.min(1, (t - cue.t) / Math.max(1e-3, cue.until - cue.t)));
          return { t, p, bp, bp0: tb.beatPos(cue.t), el, q: part?.q || {}, tb, cue };
        };
        // how far into its glide a part is: 0 as the cue starts, 1 once the new look has fully arrived
        const gl = (part, beats) => { const g = glideOf(part, beats); return g > 0 && part.cue.t > 0.01 ? Math.min(1, (bp - tb.beatPos(part.cue.t)) / g) : 1; };
        const before = (part, k) => { const pv = prevIntent(role, gkey, grp, part.cue.t); return pv[k]; };
        // dim
        const evalDim = (it) => (it ? (DIM[it.q.look] || DIM.on)(mk(it)) : 0.6 * sec.energy * tb.envelope('energy', t));
        let dim = evalDim(intent.dim);
        { const k = intent.dim ? gl(intent.dim, 0.75) : 1; if (k < 1) { const pd = before(intent.dim, 'dim'); if (pd) dim = evalDim(pd) + (dim - evalDim(pd)) * ease(k); } }
        // color
        const evalColor = (it) => { const pal = palettes[it?.q.palette] || secPal; return it ? (COLOR[it.q.look] || COLOR.static)(mk(it), pal) : COLOR.gradient(mk(null), pal); };
        let rgb = evalColor(intent.color);
        { const k = intent.color ? gl(intent.color, 2) : 1; if (k < 1) { const pc = before(intent.color, 'color'); if (pc) { const r0 = evalColor(pc), e = ease(k); rgb = rgb.map((v, i) => r0[i] + (v - r0[i]) * e); } } }
        // accents
        const fx = acc.fxRoles[role] || [];
        if (role === 'strobe') rgb = rgb.map((v) => v + (1 - v) * 0.85); // strobes are white lights
        if (acc.burst && (role === 'strobe' || role === 'blinder')) { dim = Math.max(dim, (t * 15) % 1 < 0.25 ? acc.burst : 0); }
        if (acc.flash && (role === 'blinder' || role === 'wash')) dim = Math.max(dim, acc.flash);
        if (acc.hitFlash && (role === 'wash' || role === 'blinder' || role === 'pixel')) { dim = Math.max(dim, acc.hitFlash); rgb = rgb.map((v) => v + (1 - v) * acc.hitFlash * 0.6); }
        for (const c of fx) {
          const dt = t - c.t;
          if (c.fx === 'flash') { const k = Math.exp(-dt / 0.2); dim = Math.max(dim, k); rgb = rgb.map((v) => v + (1 - v) * k * 0.7); }
          if (c.fx === 'burst') dim = (t * 15) % 1 < 0.25 ? 1 : 0;
          if (c.fx === 'blackout') dim = 0;
        }
        if (acc.blackout) dim = 0;

        const st = states[el.fixture.id];
        if (st.pixels) { st.pixels[el.sub] = rgb.map((v) => v * dim); st.dim = 1; continue; }
        st.dim = Math.max(0, Math.min(1, dim));
        st.rgb = el.fixture.profile.colorSystem === 'wheel' ? snapToWheel(rgb, wheels[el.fixture.model]) : rgb;

        // movement (movers and lasers)
        if (el.fixture.profile.pan || role === 'laser') {
          const m = intent.move;
          // no move intent: beams/lasers park up in the air, washes and spots light the stage
          const aimOf = (it) => { let a = it ? (MOVE[it.q.look] || MOVE.still)(mk(it)) : poseDir(role === 'beam' || role === 'laser' ? 'up' : 'performer', el); if (it && el.surround && needsFrame(it.q.look, it.q)) a = turn(a, el.az0); return a; };
          let aim = aimOf(m);
          { const k = m ? gl(m, 2) : 1; if (k < 1) { const pm = before(m, 'move'); aim = nlerp(aimOf(pm), aim, ease(k)); } }
          const aimR = reachable(aim, el.fixture.mount, el.fixture.profile);
          if (el.fixture.profile.pan) aim = aimR;
          st.aim = aim;
          if (m?.q.prism && el.fixture.profile.prism) st.prism = { rays: 8, spin: bp };
          if (el.fixture.profile.pan) {
            const pt = aimToPanTilt(aimR, el.fixture.mount, prevPan.get(el.fixture.id) ?? 0, el.fixture.profile);
            prevPan.set(el.fixture.id, pt.pan);
            st.pan = pt.pan; st.tilt = pt.tilt;
          }
          if (role === 'laser') {
            const look = m?.q.look || 'still';
            st.laser = {
              pattern: LASER_PATTERN[look] || (look === 'still' ? 'beam' : 'fan'),
              spread: m?.q.spread ?? 0.7,
              beams: look === 'still' ? 1 : ['cone', 'burst'].includes(LASER_PATTERN[look]) ? 14 : 9,
              phase: bp,
            };
          }
        }
        if (intent.dim?.q.look === 'strobe') st.strobeHz = intent.dim.q.rate ?? 10;
      }
    }
    return states;
  }

  // One-shot stage effects (CO2 jets, confetti, flame) alive at t. They are hardware a rig may or may not
  // own, so the decoder only states them; a simulator draws them, a real rig maps them to its DMX relays.
  const stageFx = [...fxCues.filter((c) => STAGE_FX[c.fx]).map((c) => ({ type: c.fx, t: c.t, dur: c.dur ?? 1 })),
    ...accents.filter((a) => STAGE_FX[a.fx]).map((a) => ({ type: a.fx, t: a.t, dur: a.dur ?? 1 }))].sort((a, b) => a.t - b.t);
  function effects(t) {
    const out = [];
    for (const e of stageFx) {
      if (e.t > t) break;
      const life = STAGE_FX[e.type] + e.dur;
      if (t - e.t < life) out.push({ ...e, age: t - e.t });
    }
    return out;
  }

  // Which looks are active per layer at t (for UIs and debugging).
  function describe(t) {
    const out = {};
    for (const role of present) {
      const a = activeIntent(role, t);
      out[role] = Object.fromEntries(['move', 'dim', 'color'].filter((k) => a[k]).map((k) => [k, { ...a[k].q, from: a[k].cue.layer }]));
    }
    return out;
  }

  return { frame, effects, describe, report, fixtures, byRole, timebase: tb, sectionAt };
}
