// Choreography: turns the lyric architecture of a song (lines, a returning refrain, a closing tagline)
// into cues for every layer. A song is a few lines that lead into a central phrase; that phrase comes
// back after every stanza and the lights greet it with the same signature each time, only bigger.
// Lines get their own turn of colour and movement. Everything is locked to the beat grid, and every
// layer has a part: beams and spots move as one shape in 3-D, wash carries colour, pixels, tubes and
// walls play the rhythm and the tune, strobes and lasers punctuate.
//
// What each part does is chosen from the repertoire (repertoire.js), not hard-coded: every figure is scored
// against the song's genre, how loud the phrase is, whether the instruments there are rhythmic, melodic or
// airy, and what has already been played, so a dhol-led garba number and a piano ballad get different shows
// and a show never repeats a move back to back. The choice is seeded from the song, so it is stable.
import { applyImage } from './imagery.js';
import { BEAM, LIFT, SPOT, BEAM_DIM, PIXEL, TUBE, MATRIX, WASH, COLOR, LASER, STROBE_PICK } from './repertoire.js';

// bump when the choreography changes enough that older shows should be re-made from their stored structure
export const CHOREO_VERSION = 5;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const CALM = new Set(['devotional', 'romantic', 'classical']);

// Fallback when no director supplied phrases: derive them from sections and repeated groups.
export function autoPhrases(sections, a, accents = []) {
  const barSec = (60 / a.bpm) * (a.meter || 4);
  const downs = a.downbeats;
  const snap = (t) => downs.reduce((best, d) => (Math.abs(d - t) < Math.abs(best - t) ? d : best), downs[0] ?? t);
  const phrases = [], returns = {};
  const lastChorusIdx = sections.reduce((m, s, i) => (['chorus', 'drop'].includes(s.kind) ? i : m), -1);
  sections.forEach((s, si) => {
    const bars = Math.max(1, Math.round((s.end - s.start) / barSec));
    const len = s.energy > 0.6 || ['chorus', 'drop'].includes(s.kind) ? 2 : 4;
    const hook = ['chorus', 'drop'].includes(s.kind);
    const next = sections[si + 1];
    const toHook = next && ['chorus', 'drop', 'build'].includes(next.kind);
    for (let b = 0; b < bars; b += len) {
      const t = r3(snap(s.start + b * barSec)), until = r3(Math.min(s.end, snap(s.start + Math.min(bars, b + len) * barSec) || s.end));
      if (until - t < barSec * 0.9) continue;
      const lastOfSection = b + len >= bars;
      let role = 'line', motif;
      if (hook) { role = 'refrain'; motif = `hook-${s.group || 'A'}`; returns[motif] = (returns[motif] || 0) + 1; if (lastOfSection && si === lastChorusIdx) role = 'tagline'; }
      else if (['intro', 'outro', 'solo'].includes(s.kind)) role = 'instrumental';
      else if (s.kind === 'build') role = 'lift';
      else if (s.kind === 'break') role = 'instrumental';
      else if (lastOfSection && toHook) role = 'lift';
      else if (b > 0 && (b / len) % 2 === 1) role = 'answer';
      phrases.push({ t, until, role, ...(motif ? { motif, n: returns[motif] } : {}), energy: s.energy });
    }
  });
  for (const x of accents) if (x.type === 'silence' && (x.dur ?? 0) >= 0.5) phrases.push({ t: r3(x.t), until: r3(x.t + x.dur), role: 'silence', energy: 0 });
  return phrases.sort((p, q) => p.t - q.t);
}

// ── deterministic randomness ───────────────────────────────────────────────────────────────────────
function hstr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hnum(seed, ...k) { let h = seed >>> 0; for (const v of k) { h ^= typeof v === 'string' ? hstr(v) : (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; } return (h >>> 0) / 4294967296; }

// ── what the instruments are doing: rhythmic, melodic or airy ──────────────────────────────────────
function makeProbe(a) {
  const env = a.envelopes, rate = env?.rate || 20, on = a.onsets || {};
  const avg = (arr, t0, t1) => {
    if (!arr?.length) return null;
    const i0 = Math.max(0, Math.floor(t0 * rate)), i1 = Math.max(i0 + 1, Math.min(arr.length, Math.ceil(t1 * rate)));
    let s = 0; for (let i = i0; i < i1; i++) s += arr[i] || 0;
    return s / (i1 - i0) / 100;
  };
  const cnt = (arr, t0, t1) => {
    if (!arr?.length) return 0;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][0] < t0) lo = m + 1; else hi = m; }
    let n = 0; for (let i = lo; i < arr.length && arr[i][0] < t1; i++) n++;
    return n;
  };
  const has = !!(env?.low?.length && (on.low || on.mid || on.high));
  const feat = (t0, t1) => {
    const d = Math.max(0.5, t1 - t0);
    return { l: avg(env.low, t0, t1) ?? 0, m: avg(env.mid, t0, t1) ?? 0, h: avg(env.high, t0, t1) ?? 0, ol: cnt(on.low, t0, t1) / d, om: cnt(on.mid, t0, t1) / d, oh: cnt(on.high, t0, t1) / d };
  };
  if (!has) return () => ({ rhythmic: 1 / 3, melodic: 1 / 3, airy: 1 / 3 });
  const whole = feat(0, a.duration || 1);
  const sum = (f) => f.l + f.m + f.h + 1e-6, ons = (f) => f.ol + f.om + f.oh + 1e-6;
  const base = { low: whole.l / sum(whole), mid: whole.m / sum(whole), high: whole.h / sum(whole), lowOns: whole.ol / ons(whole), ons: ons(whole) };
  return (t0, t1) => {
    const f = feat(t0, t1);
    const dens = ons(f) / base.ons;
    const rhythmic = clamp(0.5 + (dens - 1) * 0.5 + (f.ol / ons(f) - base.lowOns) * 1.2, 0.05, 1);
    const melodic = clamp(0.5 + (f.m / sum(f) - base.mid) * 2.4 - (dens - 1) * 0.4, 0.05, 1);
    const airy = clamp(0.5 + (f.h / sum(f) - base.high) * 3 + (1 - dens) * 0.2, 0.05, 1);
    const s = rhythmic + melodic + airy;
    return { rhythmic: rhythmic / s, melodic: melodic / s, airy: airy / s };
  };
}

// ── choosing from the repertoire ───────────────────────────────────────────────────────────────────
// the look names a repertoire entry plays (so the director's per-section figure choices can steer the pick)
const looksCache = new Map();
function looksOf(e) {
  let l = looksCache.get(e);
  if (!l) { const m = e.make({ L: 0.7, sd: 1, bars: 2 }); l = new Set([m.move?.look, ...(m.parts || []).map((p) => p.move.look)].filter(Boolean)); looksCache.set(e, l); }
  return l;
}

const MOVERS = new Set(['beam', 'lift', 'spot', 'laser']); // pools whose entries play a movement look

class Picker {
  constructor(seed) { this.seed = seed; this.uses = new Map(); this.recent = new Map(); this.recentLooks = new Map(); }
  pick(pool, name, x, { filter, feel, commit = true, bias } = {}) {
    let best = null, bw = -1;
    for (const relax of [false, true]) {
      for (const e of pool) {
        if (filter && !filter(e)) continue;
        if (feel && e.feel && e.feel !== feel) continue;
        let w = Math.max(e.w[x.style] ?? e.w['*'] ?? 0.1, x.style2 ? (e.w[x.style2] ?? e.w['*'] ?? 0.1) * 0.75 : 0);
        const L = x.Lfig ?? x.L;
        if (!relax) { if (L < e.tier[0] - 0.12 || L > e.tier[1] + 0.12) continue; if (L < e.tier[0] || L > e.tier[1]) w *= 0.3; }
        let tag = 0; for (const k of Object.keys(e.tags)) tag += e.tags[k] * (x.tags[k] ?? 0);
        w *= 0.55 + 1.5 * tag;
        if (x.calm && e.feel === 'hit') w *= 0.15;
        const key = `${name}:${e.id}`;
        w /= 1 + 0.9 * (this.uses.get(key) || 0);
        const rec = this.recent.get(name) || [];
        const ri = rec.lastIndexOf(e.id);
        if (ri >= 0) w *= [0.5, 0.2, 0.04][Math.min(2, rec.length - 1 - ri)];
        // a different entry that plays the same look (carousel, fast carousel, two-way carousel) is the same move to the eye
        if (MOVERS.has(name)) { const rl = this.recentLooks.get(name) || []; const mine = looksOf(e); for (let k = 0; k < rl.length; k++) if ([...mine].some((l) => rl[rl.length - 1 - k].has(l))) { w *= [0.04, 0.3][k] ?? 1; break; } }
        w *= 0.7 + 0.6 * hnum(this.seed, name, e.id, x.sd ?? 0);
        if (bias && bias(e)) w *= bias(e);
        if (w > bw) { bw = w; best = e; }
      }
      if (best) break;
    }
    if (best && commit) {
      this.uses.set(`${name}:${best.id}`, (this.uses.get(`${name}:${best.id}`) || 0) + 1);
      const rec = this.recent.get(name) || [];
      rec.push(best.id); if (rec.length > 3) rec.shift();
      this.recent.set(name, rec);
      if (MOVERS.has(name)) { const rl = this.recentLooks.get(name) || []; rl.push(looksOf(best)); if (rl.length > 2) rl.shift(); this.recentLooks.set(name, rl); }
    }
    return best;
  }
}

export function choreograph({ sections, phrases, analysis: a, palettes, style = 'bollywood', styles = [], title = '' }) {
  const style2 = styles.find((s) => s !== style);
  const calm = CALM.has(style);
  const dandiya = style === 'dandiya';
  const spb = 60 / a.bpm, meter = a.meter || 4, barSec = spb * meter;
  const cues = [];
  const seed = hstr(`${title}|${style}|${Math.round(a.bpm * 10)}|${Math.round(a.duration)}|${a.key || ''}|${a.downbeats?.length || 0}`);
  const picker = new Picker(seed);
  const probe = makeProbe(a);
  const secAt = (t) => sections.find((s) => t >= s.start - 1e-3 && t < s.end - 1e-3) || sections[sections.length - 1];
  const palLen = (s) => (palettes[s.palette]?.length || 3);
  const downsIn = (t0, t1) => a.downbeats.filter((d) => d >= t0 - 1e-3 && d < t1 - 1e-3);
  const finalTag = [...phrases].reverse().find((p) => p.role === 'tagline');
  const signatures = {};
  const lineSigs = {}; // a stanza line that returns (same motif) is lit the same way each time, so the room can learn it
  let darkUsed = 0;

  const lastFx = { co2: -99, flame: -99, confetti: -99, spark: -99, streamers: -99 };
  const mayFire = (type, t, gap) => { if (t - lastFx[type] < gap) return false; lastFx[type] = t; return true; };
  let lineIdx = 0; // line number inside the current stanza
  let prev = null, blockPos = 0, held = null, restHalf = 0; // held: the beam figure a stanza keeps for a few lines
  phrases.forEach((p, pi) => {
    const sec = secAt(p.t);
    const pal = sec.palette, n = palLen(sec);
    const ret = p.n || 1;
    const baseE = clamp(sec.energy * 0.6 + (p.energy ?? sec.energy) * 0.4);
    // each return of the refrain is a little bigger, but never louder than the music around it: a quiet coda stays quiet
    const grow = Math.min(0.2, 0.08 * (ret - 1)) + 0.1;
    const L = clamp(baseE + (p.role === 'refrain' ? grow * (0.3 + 0.7 * baseE) : 0) + (p.role === 'tagline' ? 0.3 * (0.4 + 0.6 * baseE) : 0) - (p.role === 'silence' ? 1 : 0));
    const t = p.t, u = p.until, dur = u - t;
    const idx = (p.role === 'answer' ? lineIdx + 1 : lineIdx) % n;
    const hint = sec.move || [];
    const steer = hint.length ? (e) => (hint.some((h) => looksOf(e).has(h)) ? 3.2 : 1) : null;
    const x = { L, Lfig: calm ? Math.min(L, 0.62) : L, sd: Math.floor(hnum(seed, 'phrase', pi) * 99999), style, style2, calm, tags: probe(t, u), pal, n, idx };
    const put = (layer, parts, a0 = t, a1 = u) => { if (parts.dim?.intensity > 1) parts.dim.intensity = 1; if (a1 - a0 > 1e-3) cues.push({ t: r3(a0), until: r3(a1), layer, ...parts, ...(p.gist && layer === 'beam' && a0 === t && !parts.group ? { note: `${p.role}${p.motif ? ' ' + p.motif : ''}: ${p.gist}` } : {}) }); };
    const off = (layer) => put(layer, { dim: { look: 'off' } });
    const mid = r3(t + Math.max(barSec, Math.round(dur / barSec / 2) * barSec)); // half-phrase on a bar line
    const lastBar = downsIn(t, u).slice(-1)[0] ?? u - barSec;
    const firstBeat = r3(t + spb);
    const cut = prev?.role === 'silence'; // the phrase lands out of a held silence
    const color = (layerKind, over = {}, opts = {}) => {
      const allow = { wash: ['static', 'gradient', 'sweep', 'split', 'cycle-bar', 'tide'], grid: ['gradient', 'sweep', 'pairs', 'cycle-bar', 'cycle-beat', 'tide', 'split'] }[layerKind];
      const e = picker.pick(COLOR, `color-${layerKind}`, { ...x, ...over }, { filter: allow ? (c) => allow.includes(c.id) : null, ...opts });
      return e.make({ ...x, ...over });
    };
    // a beam figure may be one shape for the whole layer or two ensembles (group cues) each with its own shape
    // at the louder moments, figures that sweep the shafts through space also open the prism: each beam becomes a ring of rays
    const PRISM = new Set(['lotus', 'carousel', 'helix', 'peacock', 'cone', 'spin', 'orbit', 'lissajous', 'spiral', 'scissor', 'ripple', 'ribbon']);
    const withPrism = (mvv) => (!calm && x.L >= 0.55 && PRISM.has(mvv.look) && hnum(seed, 'prism', pi, mvv.look) < (dandiya ? 0.9 : 0.65) ? { ...mvv, prism: true } : mvv);
    const putFigure = (layer, fig, dim, col, a0 = t, a1 = u) => {
      if (fig.parts) {
        const [A, B] = fig.parts;
        const mA = layer === 'beam' ? withPrism(A.move) : A.move, mB = layer === 'beam' ? withPrism(B.move) : B.move;
        put(layer, { move: mA, dim, color: col }, a0, a1);
        put(layer, { group: A.group, move: mA }, a0, a1);
        put(layer, { group: B.group, move: mB }, a0, a1);
      } else put(layer, { move: layer === 'beam' ? withPrism(fig.move) : fig.move, dim, color: col }, a0, a1);
    };
    const gridLayers = (xx = x, o = {}) => {
      const px = picker.pick(PIXEL, 'pixel', xx);
      const m = px.make(xx);
      put('pixel', { dim: dandiya && xx.L > 0.3 ? { look: 'dandiya_tap', decay: o.tight ? 0.13 : 0.18, intensity: o.tight ? 1 : 0.7 } : m.dim, color: dandiya && xx.L > 0.3 ? { look: 'split', palette: pal, split: o.tight ? 'oddeven' : 'lr' } : (m.color ? { ...m.color, palette: pal } : color('grid', xx)) }, o.a0 ?? t, o.a1 ?? u);
      const tb = picker.pick(TUBE, 'tube', xx);
      put('tube', { dim: tb.make(xx), color: color('grid', xx) }, o.a0 ?? t, o.a1 ?? u);
      const mx = picker.pick(MATRIX, 'matrix', xx);
      put('matrix', { dim: mx.make(xx), color: color('grid', xx) }, o.a0 ?? t, o.a1 ?? u);
    };
    const washLayer = (xx = x, extra = {}) => {
      const w = picker.pick(WASH, 'wash', xx);
      put('wash', { dim: extra.look ? extra : w.make(xx).dim, color: color('wash', xx) });
    };
    const beamDim = (fig, xx = x) => {
      const d = picker.pick(BEAM_DIM, 'beamdim', xx, { feel: fig.feel });
      return d.make(xx);
    };

    const c0 = cues.length;
    if (p.role !== 'line' && p.role !== 'answer' && p.role !== 'lift') lineIdx = 0;

    if (p.role === 'silence') {
      // Silence is music too. By default the room keeps one colour and breathes; a full blackout is rare (the director
      // flags it, it needs a loud phrase before it, and a show gets two at most).
      if (p.dark && darkUsed < 2 && (prev?.energy ?? 0) >= 0.6) {
        darkUsed++;
        for (const l of ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'laser', 'strobe', 'blinder']) off(l);
        cues.push({ t: r3(t), layer: 'all', fx: 'blackout', dur: r3(Math.max(0.2, dur - 0.05)) });
      } else {
        const hold = (i) => ({ look: 'static', palette: pal, index: i % n });
        put('wash', { dim: { look: 'breathe', speed: 8, intensity: 0.34 }, color: hold(idx) });
        put('beam', { move: { look: 'drift', speed: 32 }, dim: { look: 'breathe', speed: 8, intensity: 0.3 }, color: hold(idx + 1) });
        put('spot', { dim: { look: 'breathe', speed: 8, intensity: 0.35 }, color: hold(idx + 2) });
        for (const l of ['pixel', 'tube', 'matrix']) put(l, { dim: { look: 'breathe', speed: 8, intensity: 0.22 }, color: hold(idx) });
        for (const l of ['laser', 'strobe', 'blinder']) off(l);
      }
    }

    else if (p.role === 'line' || p.role === 'answer' || p.role === 'lift') {
      const lift = p.role === 'lift';
      // beams/spots: the voice. Quiet lines drift and follow the vocal; livelier ones swing, dance or travel with the kick.
      let fig, dim, lcol, lspot;
      const lsig = !lift && p.motif ? lineSigs[p.motif] : null;
      if (lsig) { fig = lsig.fig; dim = lsig.dim; lcol = lsig.col; lspot = lsig.spot; held = { sec: sec.id, fig, dim, n: 1 }; }
      else if (lift) { const e = picker.pick(LIFT, 'lift', { ...x, bars: dur / barSec }); fig = { ...e.make({ ...x, bars: dur / barSec }), feel: 'flow' }; dim = { look: 'swell', intensity: 0.95 }; }
      else if (held && held.sec === sec.id && held.n < 3 && !prev?.role?.match(/silence|refrain|tagline/)) {
        // the figure holds across a few lines while colour and the other layers move on: layers change at different rates
        fig = held.fig; dim = held.dim; held.n++;
      } else {
        const e = picker.pick(BEAM, 'beam', x, { bias: p.role === 'answer' ? (c) => (c.id.startsWith('duo-') ? 3 : 1) * (steer ? steer(c) : 1) : steer });
        fig = { ...e.make(x), feel: e.feel };
        dim = beamDim(fig);
        held = { sec: sec.id, fig, dim, n: 1 };
      }
      if (!lift && !lcol) lcol = color('beam');
      if (!lift && p.motif && !lsig) lineSigs[p.motif] = { fig, dim, col: lcol };
      putFigure('beam', fig, dim, lift ? { look: 'sweep', palette: pal, speed: 8 } : lcol);
      if (!lift && !calm) {
        // negative space: one half of the heads rests through quieter lines (alternating), and every line ends on a low breath of light, never black
        if (x.L < 0.75) { put('beam', { group: restHalf++ % 2 ? 'odd' : 'even', dim: { look: 'off' } }); }
        if (dur > spb * 6) put('beam', { dim: { look: 'breathe', speed: 8, intensity: 0.3 } }, r3(u - spb), u);
      }
      const sp = picker.pick(SPOT, 'spot', x);
      if (!lift && p.motif && !lsig) lineSigs[p.motif].spot = sp.make(x).move;
      put('spot', { move: lspot || (p.motif && lineSigs[p.motif]?.spot) || sp.make(x).move, dim: { look: 'follow', env: 'mid', intensity: 0.85 }, color: { look: 'static', palette: pal, index: (idx + 2) % n } });
      washLayer(lift ? { ...x, L: Math.max(x.L, 0.8) } : x, lift ? { look: 'swell', intensity: 0.9 } : {});
      gridLayers(lift ? { ...x, L: Math.max(0.7, x.L) } : x);
      if (lift && !calm && L > 0.45) put('strobe', { dim: { look: 'strobe_seq', pattern: 'stutter', intensity: 0.7 } }, lastBar, u); else off('strobe');
      if (!calm && L > 0.78) { const lz = picker.pick(LASER, 'laser', x); put('laser', { move: lz.make(x).move, dim: { look: 'on', intensity: 0.5 }, color: color('beam') }); } else off('laser');
      off('blinder');
      lineIdx++;
    }

    else if (p.role === 'refrain') {
      // The signature: identical on every return, escalating by adding layers, never by changing the shape.
      // A long chorus is often several refrain phrases in a row: the first plays the signature, the next ones swap its
      // two halves and bring in one fresh figure, so thirty seconds of hook do not repeat one move eight times.
      const key = p.motif || 'hook';
      const adjacent = prev?.role === 'refrain' && prev.motif === p.motif && Math.abs(t - prev.until) < 0.05;
      blockPos = adjacent ? blockPos + 1 : 0;
      const makeLeg = (xs, exclude = []) => {
        const taken = new Set(exclude.flatMap((l) => [...l.looks]));
        const e = picker.pick(BEAM, 'beam', xs, { filter: (c) => ![...looksOf(c)].some((l) => taken.has(l)), bias: (c) => (steer ? steer(c) : 1) * (exclude.length && c.id.startsWith('duo-') ? 1.8 : 1) });
        const fig = { ...e.make(xs), feel: e.feel };
        return { id: e.id, looks: looksOf(e), fig, dim: beamDim(fig, xs), col: color('beam', xs) };
      };
      const sig = signatures[key] ||= (() => {
        const xs = { ...x, L: Math.max(0.7, L), Lfig: calm ? 0.62 : Math.max(0.72, L) };
        const A = makeLeg(xs), B = makeLeg(xs, [A]);
        return { A, B, spot: picker.pick(SPOT, 'spot', xs).make(xs).move, wash: picker.pick(WASH, 'wash', xs), washCol: color('wash', xs), xs };
      })();
      const bp4 = blockPos % 4;
      if (bp4 === 2 || !sig.V) sig.V = blockPos >= 2 ? makeLeg({ ...sig.xs, sd: x.sd }, [sig.A, sig.B]) : sig.V;
      const [first, second] = bp4 === 0 ? [sig.A, sig.B] : bp4 === 1 ? [sig.B, sig.A] : bp4 === 2 ? [sig.V || sig.A, sig.A] : [sig.B, sig.V || sig.B];
      const bump = 0.1 * Math.min(2, ret - 1);
      putFigure('beam', first.fig, { ...first.dim, intensity: Math.min(1, (first.dim.intensity ?? 0.9) + bump) }, first.col, t, mid);
      putFigure('beam', second.fig, { ...second.dim, intensity: 1 }, second.col, mid, u);
      put('spot', { move: sig.spot, dim: { look: 'pulse', on: 'half', decay: 0.8, intensity: 1 }, color: { look: 'static', hex: '#ffffff' } });
      put('wash', { dim: { ...sig.wash.make(sig.xs).dim, intensity: Math.min(1, 0.8 + 0.15 * Math.min(2, ret - 1)) }, color: sig.washCol });
      gridLayers({ ...x, L: Math.max(x.L, 0.78) }, { tight: true });
      if (!calm && ret >= 2 && L > 0.55) put('strobe', { dim: { look: 'strobe_seq', pattern: picker.pick(STROBE_PICK, 'strobe', { ...x, L: Math.max(0.7, L) }).make(), intensity: 0.7 } }, lastBar, u); else off('strobe');
      if (!calm && L > 0.55 && ret >= 2) { const lz = picker.pick(LASER, 'laser', { ...x, L: Math.max(0.75, L) }); put('laser', { move: lz.make(x).move, dim: { look: 'pulse', on: 'beat', decay: 0.3, intensity: 0.9 }, color: sig.A.col }); } else off('laser');
      put('blinder', { dim: { look: 'pulse', on: 'beat', decay: 0.7, intensity: ret >= 2 ? 0.85 : 0.5 } }, t, firstBeat);
      if (!calm && blockPos === 0 && !cut && prev && t - spb > prev.t) cues.push({ t: r3(t - spb), layer: 'all', fx: 'blackout', dur: r3(spb - 0.04) }); // a dark beat so the refrain lands
      if (cut || ret === 1) cues.push({ t: r3(t), layer: 'all', fx: 'flash', dur: 0.25 });
      if (!calm && ret >= 2 && L > 0.7 && mayFire('co2', t, 14)) cues.push({ t: r3(t), layer: 'all', fx: 'co2', dur: 0.9 });
      else if (!calm && ret >= 2 && L > 0.62 && mayFire('spark', t, 18)) cues.push({ t: r3(t), layer: 'all', fx: 'spark', dur: 2 });
    }

    else if (p.role === 'tagline') {
      const final = p === finalTag;
      const xs = { ...x, L: 1, Lfig: calm ? 0.62 : 1 };
      // a breath of dark, then the whole rig lands together
      if (!calm && t - spb > (prev?.t ?? 0)) cues.push({ t: r3(t - spb), layer: 'all', fx: 'blackout', dur: r3(spb - 0.04) });
      const a1 = picker.pick(BEAM, 'beam', xs, { feel: 'hit' }), b1 = picker.pick(BEAM, 'beam', xs, { filter: (c) => c.id !== a1.id });
      putFigure('beam', { ...a1.make(xs), feel: a1.feel }, { look: 'pulse', on: 'beat', decay: 0.35, intensity: 1 }, { look: 'cycle', palette: pal, on: 'beat' }, t, mid);
      putFigure('beam', { ...b1.make(xs), feel: b1.feel }, { look: 'pulse', on: 'beat', decay: 0.35, intensity: 1 }, { look: 'cycle', palette: pal, on: 'beat' }, mid, u);
      put('spot', { move: picker.pick(SPOT, 'spot', xs, { filter: (c) => c.id !== 'perform' && c.id !== 'perform2' }).make(xs).move, dim: { look: 'pulse', on: 'beat', decay: 0.4, intensity: 1 }, color: { look: 'cycle', palette: pal, on: 'bar' } });
      put('wash', { dim: { look: 'pulse', on: 'low', decay: 0.3, intensity: 1 }, color: { look: 'cycle', palette: pal, on: 'beat' } });
      gridLayers(xs, { tight: true });
      if (!calm) put('strobe', { dim: { look: 'strobe_seq', pattern: 'burst', intensity: 0.85 } }, t, firstBeat), put('strobe', { dim: { look: 'strobe_seq', pattern: 'gallop', intensity: 0.8 } }, firstBeat, u);
      else off('strobe');
      if (!calm) { const lz = picker.pick(LASER, 'laser', xs); put('laser', { move: lz.make(xs).move, dim: { look: 'on', intensity: 1 }, color: { look: 'cycle', palette: pal, on: 'bar' } }); } else off('laser');
      put('blinder', { dim: { look: 'pulse', on: 'beat', decay: 0.6, intensity: 1 } }, t, r3(t + 2 * spb));
      cues.push({ t: r3(t), layer: 'all', fx: 'flash', dur: 0.3 });
      if (!calm && mayFire('co2', t, 6)) cues.push({ t: r3(t), layer: 'all', fx: 'co2', dur: 1 });
      if (!calm && mayFire('spark', t, 12)) cues.push({ t: r3(t + spb), layer: 'all', fx: 'spark', dur: 2.5 });
      if (final && !calm) { if (mayFire('confetti', t, 30)) cues.push({ t: r3(t + spb), layer: 'all', fx: 'confetti', dur: 2 }); if (mayFire('streamers', t, 30)) cues.push({ t: r3(t + 2 * spb), layer: 'all', fx: 'streamers', dur: 2 }); if (L > 0.9 && mayFire('flame', t, 60)) cues.push({ t: r3(t), layer: 'all', fx: 'flame', dur: 0.8 }); }
    }

    else { // instrumental: the rhythm section speaks
      const driven = L > 0.5;
      const e = picker.pick(BEAM, 'beam', { ...x, tags: driven ? { ...x.tags, rhythmic: x.tags.rhythmic + 0.2 } : x.tags }, { bias: steer });
      const fig = { ...e.make(x), feel: e.feel };
      putFigure('beam', fig, driven ? { look: 'pulse', on: 'low', decay: 0.4, intensity: 0.9 } : { look: 'breathe', speed: 8, intensity: 0.5 }, color('beam', {}, {}));
      put('spot', { move: picker.pick(SPOT, 'spot', x).make(x).move, dim: { look: 'follow', env: 'energy', intensity: 0.6 }, color: { look: 'static', palette: pal, index: 2 % n } });
      washLayer(x, driven ? { look: 'pulse', on: 'low', decay: 0.5, intensity: 0.8 } : {});
      gridLayers(x);
      if (!calm && L > 0.7) put('strobe', { dim: { look: 'strobe_seq', pattern: 'chase', intensity: 0.6 } }); else off('strobe');
      if (!calm && L > 0.8) { const lz = picker.pick(LASER, 'laser', x); put('laser', { move: lz.make(x).move, dim: { look: 'on', intensity: 0.7 }, color: color('beam') }); } else off('laser');
      off('blinder');
    }
    if (p.image && p.role !== 'silence') applyImage(cues, c0, p.image, { L, pal, calm }, t, u, r3);
    prev = p;
  });
  return cues.sort((x, y) => x.t - y.t);
}
