// Live listening: turns a stream of spectrum frames (from a microphone or a captured tab) into the same things the
// offline analyzer produces (tempo, beat grid, onsets, envelopes, phrases) and into a rolling WAL that the normal
// decoder plays. Pure code with no audio API in it, so it is tested with synthetic music.
//
//   const lt = new LiveTracker({ binHz })
//   lt.push(t, magnitudes)        every ~16 ms: linear magnitudes of the FFT bins, t in seconds since start
//   lt.wal(t)                     a WAL covering everything heard so far plus the next bars, rebuilt on demand
//
// What it can and cannot do (be straight about it): it hears only what has already happened, so it follows the
// music with about a bar of lag when the structure changes, and reacts at once to sudden jumps (a drop). It locks
// to a steady tempo within a few seconds; free-time music (aalap) and tempo changes need a moment to settle.
import { PHRASE_ROLES, PALETTES } from '../wal/vocab.js';
import { choreograph } from '../choreo/choreograph.js';

const RATE = 50;          // envelope samples per second
const OSR = 100;          // onset-strength samples per second
const BANDS = { low: [30, 150], mid: [150, 2000], high: [2000, 10000] };
const MOODS = {
  high: ['neon', 'fire', 'festival', 'royal'],
  mid: ['royal', 'ocean', 'festival', 'marigold'],
  low: ['ocean', 'romance', 'ice', 'sacred'],
};
const KIND = { refrain: 'chorus', tagline: 'drop', lift: 'build', silence: 'break', line: 'verse', answer: 'verse', instrumental: 'interlude' };
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export class LiveTracker {
  constructor({ binHz = 23.4375, style = 'bollywood', meter = 4, phraseBars = 2, floor = 1 } = {}) {
    this.fl = floor; // input sensitivity: below this level a band counts as silent (smaller = more sensitive)
    this.binHz = binHz; this.style = style; this.meter = meter; this.phraseBars = phraseBars;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.band = { low: 0, mid: 0, high: 0 };         // normalised 0..1 now
    this.peak = { low: 1e-3, mid: 1e-3, high: 1e-3 };
    this.prev = { low: 0, mid: 0, high: 0 };
    this.flux = { low: { mu: 0, sd: 0.05, last: -1 }, mid: { mu: 0, sd: 0.05, last: -1 }, high: { mu: 0, sd: 0.05, last: -1 } };
    this.env = { energy: [], low: [], mid: [], high: [] };
    this.onsets = { low: [], mid: [], high: [] };
    this.os = [];                                     // onset strength at OSR
    this.bpm = 0; this.conf = 0; this.cand = { bpm: 0, n: 0 };
    this.anchor = null; this.period = 0.5;
    this.lastTempoAt = 0;
    this.pastBeats = []; this.beatCount = 0; this.dbVotes = new Array(this.meter).fill(0); this.dbPhase = 0;
    this.accents = [];
    this.phrases = []; this.sections = []; this.cues = [];
    this.bars = [];                                   // { t, e, low, mid, high }
    this.lastBar = -1; this.refrainRun = 0; this.lastDrop = -99; this.paletteIdx = 0; this.mood = 'mid'; this.lineParity = 0;
    this.version = 0;                                  // bumps when the cues or grid changed: the decoder must be rebuilt
    this.silentSince = null;
  }

  // ── spectrum in ──────────────────────────────────────────────────────
  push(t, mags) {
    if (t <= this.t && this.t > 0) return;
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const raw = {};
    for (const [name, [lo, hi]] of Object.entries(BANDS)) {
      const a = Math.max(1, Math.floor(lo / this.binHz)), b = Math.min(mags.length - 1, Math.ceil(hi / this.binHz));
      let s = 0; for (let i = a; i <= b; i++) s += mags[i] * mags[i];
      raw[name] = Math.sqrt(s / Math.max(1, b - a + 1));
    }
    // automatic gain: a slow peak follower per band, so a quiet phone speaker and a loud PA look the same
    const FLOOR = { low: 1.8e-3 * this.fl, mid: 1.2e-3 * this.fl, high: 1.0e-3 * this.fl };
    let fluxSum = 0;
    for (const n of ['low', 'mid', 'high']) {
      // slow follower (half-life about a minute): fast enough to adapt to the room, slow enough that a drop still stands out
      this.peak[n] = Math.max(raw[n], this.peak[n] * Math.pow(0.988, dt), FLOOR[n]);
      const v = raw[n] < FLOOR[n] ? 0 : Math.min(1, raw[n] / this.peak[n]);
      const f = Math.max(0, v - this.prev[n]);
      this.prev[n] = v; this.band[n] = v;
      const F = this.flux[n];
      F.mu += (f - F.mu) * Math.min(1, dt * 2); F.sd += (Math.abs(f - F.mu) - F.sd) * Math.min(1, dt * 2);
      const thr = Math.max(0.06, F.mu + 2.4 * F.sd);
      if (f > thr && t - F.last > 0.09 && raw[n] > FLOOR[n] * 1.5) { F.last = t; this.onsets[n].push([r3(t), r3(Math.min(1, f / (thr * 2)))]); }
      fluxSum += f * { low: 0.6, mid: 0.3, high: 0.1 }[n];
    }
    // onset strength on a fixed grid (max within each slot)
    const oi = Math.floor(t * OSR);
    while (this.os.length <= oi) this.os.push(0);
    this.os[oi] = Math.max(this.os[oi], fluxSum);
    // envelopes at RATE
    const e = Math.min(1, 0.5 * this.band.low + 0.3 * this.band.mid + 0.2 * this.band.high);
    const ei = Math.floor(t * RATE);
    const q = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100);
    while (this.env.energy.length <= ei) {
      this.env.energy.push(q(e)); this.env.low.push(q(this.band.low)); this.env.mid.push(q(this.band.mid)); this.env.high.push(q(this.band.high));
    }
    // trim: keep the last minute of onsets and an hour of envelope
    for (const n of ['low', 'mid', 'high']) if (this.onsets[n].length > 600) this.onsets[n].splice(0, this.onsets[n].length - 400);
    this.rawE = raw.low + raw.mid * 1.5; // un-normalised loudness: the follower above hides level changes, this keeps them
    if (t - this.lastTempoAt > 0.5 && t > 3) { this.lastTempoAt = t; this.tempo(); }
    this.beats();
    this.structure();
    this.reactive(e);
  }

  // ── tempo and phase ──────────────────────────────────────────────────
  tempo() {
    const N = Math.min(this.os.length, 8 * OSR);
    if (N < 3 * OSR) return;
    const raw = this.os.slice(this.os.length - N);
    // blur each onset over about 30 ms: sharp 10 ms spikes miss each other by a sample or two and the correlation turns to noise
    const K = [0.06, 0.24, 0.4, 0.24, 0.06];
    const x = raw.map((_, i) => K.reduce((s, w, j) => s + w * (raw[i + j - 2] || 0), 0));
    const m = mean(x);
    const y = x.map((v) => v - m);
    const lagMin = Math.floor(OSR * 60 / 190), lagMax = Math.min(Math.floor(OSR * 60 / 55), N - 10);
    const ac = new Float64Array(lagMax * 2 + 2);
    for (let lag = 1; lag < ac.length && lag < N - 5; lag++) { let s = 0; for (let i = 0; i + lag < N; i++) s += y[i] * y[i + lag]; ac[lag] = s / (N - lag); }
    const r0 = Math.max(1e-9, ac[1] > 0 ? (() => { let s = 0; for (let i = 0; i < N; i++) s += y[i] * y[i]; return s / N; })() : 1e-9);
    let best = 0, bl = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      const bpm = 6000 / lag;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.8, 2));
      const sc = (ac[lag] + 0.25 * (ac[lag * 2] || 0)) * prior;
      if (sc > best) { best = sc; bl = lag; }
    }
    if (!bl) return;
    // a bar-length or half-time winner is usually the beat's slower shadow: take the faster pulse if it is nearly as strong
    const half = Math.round(bl / 2);
    if (half >= lagMin && ac[half] > 0.55 * ac[bl] && ac[half] > 0) bl = half;
    // parabolic refinement
    const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1];
    const off = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
    const bpm = 6000 / (bl + Math.max(-0.5, Math.min(0.5, off)));
    this.conf = Math.max(0, Math.min(1, ac[bl] / r0));
    if (this.conf < 0.08) return;
    if (!this.bpm) { this.bpm = bpm; this.cand = { bpm: 0, n: 0 }; }
    else if (Math.abs(Math.log2(bpm / this.bpm)) < 0.035) { this.bpm += (bpm - this.bpm) * 0.25; this.cand = { bpm: 0, n: 0 }; }
    else {
      // a different tempo must persist for three looks (1.5 s) before we follow it
      if (this.cand.bpm && Math.abs(Math.log2(bpm / this.cand.bpm)) < 0.04) this.cand.n++; else this.cand = { bpm, n: 1 };
      if (this.cand.n >= 3) { this.bpm = this.cand.bpm; this.cand = { bpm: 0, n: 0 }; this.anchor = null; this.version++; }
    }
    const P = 60 / this.bpm;
    // phase: the offset whose comb of recent beats collects the most onset strength
    let bestPhi = 0, bestS = -1;
    const now = this.t;
    for (let phi = 0; phi < P; phi += 0.01) {
      let s = 0;
      for (let k = 0; k < 8; k++) {
        const tt = now - phi - k * P;
        if (tt < 0) break;
        const i = Math.round(tt * OSR);
        s += Math.max(this.os[i - 1] || 0, this.os[i] || 0, this.os[i + 1] || 0);
      }
      if (s > bestS) { bestS = s; bestPhi = phi; }
    }
    const lastBeat = now - bestPhi;
    if (this.anchor == null) { this.anchor = lastBeat; this.period = P; this.version++; }
    else {
      let e = (lastBeat - this.anchor) % this.period;
      if (e > this.period / 2) e -= this.period; if (e < -this.period / 2) e += this.period;
      this.anchor += e * (this.conf > 0.2 ? 0.3 : 0.1);
      if (Math.abs(this.period - P) > 0.002) { this.period += (P - this.period) * 0.3; }
    }
  }

  // record beats as they pass; vote for the downbeat with the low band (the kick lands on one)
  beats() {
    if (this.anchor == null) return;
    const P = this.period;
    for (;;) {
      const last = this.pastBeats.length ? this.pastBeats[this.pastBeats.length - 1].t : this.anchor - P;
      let next = this.pastBeats.length ? last + P : this.anchor;
      // keep the stored grid on the (slowly moving) anchor
      if (this.pastBeats.length) { const k = Math.round((next - this.anchor) / P); next = this.anchor + k * P; if (next <= last + P * 0.5) next = last + P; }
      if (next > this.t) break;
      const idx = this.beatCount++;
      this.pastBeats.push({ t: r3(next), i: idx });
      const ei = Math.min(this.env.low.length - 1, Math.round(next * RATE));
      this.dbVotes[idx % this.meter] = this.dbVotes[idx % this.meter] * 0.93 + (this.env.low[ei] || 0) / 100;
      this.dbPhase = this.dbVotes.indexOf(Math.max(...this.dbVotes));
      this.version++;
    }
    if (this.pastBeats.length > 400) this.pastBeats.splice(0, 100);
  }

  beatList(horizon) {
    const out = this.pastBeats.map((b) => b);
    if (this.anchor == null) { // before a lock: a steady 120 so everything has a pulse
      const o = []; for (let t = 0; t < horizon; t += 0.5) o.push({ t: r3(t), i: Math.round(t / 0.5) }); return o;
    }
    let t = (out.length ? out[out.length - 1].t : this.anchor - this.period) + this.period, i = this.beatCount;
    while (t < horizon) { out.push({ t: r3(t), i }); t += this.period; i++; }
    return out;
  }

  // ── structure: bars -> phrases -> sections ───────────────────────────
  structure() {
    if (this.anchor == null || !this.pastBeats.length) return;
    const last = this.pastBeats[this.pastBeats.length - 1];
    const isDown = (b) => b.i % this.meter === this.dbPhase;
    const barNo = Math.floor(last.i / this.meter);
    if (!isDown(last) || barNo === this.lastBar) return;
    this.lastBar = barNo;
    const t1 = last.t, t0 = this.bars.length ? this.bars[this.bars.length - 1].end : Math.max(0, t1 - this.period * this.meter);
    const seg = (arr) => { const a = Math.floor(t0 * RATE), b = Math.max(a + 1, Math.floor(t1 * RATE)); return mean(arr.slice(a, b)) / 100; };
    const bar = { t: t0, end: t1, e: seg(this.env.energy), low: seg(this.env.low), mid: seg(this.env.mid), high: seg(this.env.high) };
    this.bars.push(bar);
    if (this.bars.length > 128) this.bars.shift();
    if (this.bars.length % this.phraseBars === 0 || this.phrases.length === 0) this.nextPhrase(t1);
  }

  chooseRole() {
    const B = this.bars, n = B.length, cur = B[n - 1];
    const recent = B.slice(Math.max(0, n - 9), n - 1), base = mean(recent.map((b) => b.e)) || cur.e;
    const peak = Math.max(0.15, ...B.slice(Math.max(0, n - 32)).map((b) => b.e));
    const rel = cur.e / peak;
    const slope = n >= 4 ? cur.e - mean(B.slice(n - 4, n - 1).map((b) => b.e)) : 0;
    const prevRole = this.phrases.length ? this.phrases[this.phrases.length - 1].role : null;
    if (cur.e < 0.06 || rel < 0.12) return ['silence', rel];
    if (cur.e > base * 1.5 && cur.e > 0.5 && this.t - this.lastDrop > 24 && n > 6) return ['tagline', rel];
    if (slope > 0.1 && rel < 0.9) return ['lift', rel];
    if (rel > 0.74) { this.highRun = (this.highRun || 0) + 1; if (this.highRun % 4 === 0) return ['line', rel]; return ['refrain', rel]; }
    this.highRun = 0;
    const lowShare = cur.low / Math.max(1e-3, cur.low + cur.mid + cur.high);
    if (lowShare > 0.58 && cur.mid < 0.35) return ['instrumental', rel];
    this.lineParity ^= 1;
    return [prevRole === 'line' && this.lineParity ? 'answer' : 'line', rel];
  }

  nextPhrase(t) {
    const [role, rel] = this.chooseRole();
    this.pushPhrase(role, t, rel);
  }

  pushPhrase(role, t, rel) {
    const prev = this.phrases[this.phrases.length - 1];
    if (prev) { prev.until = r3(t); this.sections[this.sections.length - 1].end = r3(t); } // gap-free, whatever the grid did
    else t = 0;
    if (role === 'refrain') this.refrainRun = prev && ['refrain', 'tagline'].includes(prev.role) ? this.refrainRun : this.refrainRun + 1;
    if (role === 'silence') this.refrainRun = 0;
    if (role === 'tagline') this.lastDrop = t;
    const barSec = this.period * this.meter;
    const until = r3(t + barSec * this.phraseBars);
    const e = this.bars.length ? this.bars[this.bars.length - 1].e : 0.3;
    this.mood = e > 0.68 ? 'high' : e > 0.4 ? 'mid' : 'low';
    // new colour world on a drop, and every few phrases so a long jam does not stay one colour
    if (role === 'tagline' || this.phrases.length % 8 === 7) this.paletteIdx++;
    const list = MOODS[this.mood];
    const palette = list[this.paletteIdx % list.length];
    const ph = { t: r3(t), until, role, energy: r3(Math.max(0.05, Math.min(1, rel ?? e))), ...(role === 'refrain' || role === 'tagline' ? { motif: 'live', n: Math.max(1, this.refrainRun) } : {}) };
    this.phrases.push(ph);
    this.sections.push({ id: `s${this.phrases.length}`, start: r3(t), end: until, kind: KIND[role], energy: ph.energy, palette, label: role });
    if (this.phrases.length > 60) { this.phrases.shift(); this.sections.shift(); }
    this.version++;
  }

  // ── react at once to a sudden jump, without waiting for the next phrase ─
  reactive(e) {
    const dt = Math.min(0.2, Math.max(1e-3, this.t - (this.lastReact ?? this.t - 0.016)));
    this.lastReact = this.t;
    this.eAvg = (this.eAvg ?? e) + (e - (this.eAvg ?? e)) * Math.min(1, dt / 8);
    this.eFast = (this.eFast ?? e) + (e - (this.eFast ?? e)) * Math.min(1, dt / 0.3);
    const rl = this.rawE ?? 0;
    this.rFast = (this.rFast ?? rl) + (rl - (this.rFast ?? rl)) * Math.min(1, dt / 0.8);
    this.rSlow = (this.rSlow ?? rl) + (rl - (this.rSlow ?? rl)) * Math.min(1, dt / 10);
    if (this.t < 6 || this.anchor == null) return;
    const jump = this.eFast - this.eAvg;
    const louder = this.rFast / Math.max(1e-6, this.rSlow); // how much louder than the last ten seconds
    if (((jump > 0.28 && this.eFast > 0.55) || (louder > 1.9 && this.rFast > 0.01 * this.fl)) && this.eFast > 0.4 && this.t - this.lastDrop > 24 && this.t - (this.lastJump || -99) > 4) {
      this.lastJump = this.t;
      const P = this.period * this.meter;
      this.accents.push({ t: r3(this.t), type: 'drop', strength: 1 });
      this.pushPhrase('tagline', this.t, 1);
      this.phrases[this.phrases.length - 1].until = r3(this.t + P);
      this.sections[this.sections.length - 1].end = r3(this.t + P);
    } else if (this.band.low > 0.9 && this.onsets.low.length && this.t - this.onsets.low[this.onsets.low.length - 1][0] < 0.03 && this.t - (this.lastHit || -99) > 1.5) {
      this.lastHit = this.t; this.accents.push({ t: r3(this.t), type: 'hit', strength: 0.8 });
    }
    // silence: everything went quiet
    if (this.eFast < 0.03) { this.silentSince ??= this.t; } else this.silentSince = null;
    if (this.accents.length > 60) this.accents.splice(0, 30);
  }

  // ── the rolling WAL ──────────────────────────────────────────────────
  wal(now = this.t) {
    const horizon = now + 40;
    const beats = this.beatList(horizon);
    const keepFrom = Math.max(0, now - 90);
    const bl = beats.filter((b) => b.t >= keepFrom);
    const downbeats = bl.filter((b) => b.i % this.meter === this.dbPhase).map((b) => b.t);
    const bpm = this.bpm || 120;
    const palettes = {};
    for (const s of this.sections) palettes[s.palette] = PALETTES[s.palette];
    // a provisional section so the decoder always has somewhere to stand
    const lastEnd = this.sections.length ? this.sections[this.sections.length - 1].end : 0;
    const sections = this.sections.map((s) => ({ ...s }));
    const phrases = this.phrases.map((p) => ({ ...p }));
    if (!sections.length || lastEnd < now + 4) {
      const pal = MOODS[this.mood][this.paletteIdx % MOODS[this.mood].length];
      palettes[pal] = PALETTES[pal];
      sections.push({ id: `s0-${sections.length}`, start: r3(Math.max(0, lastEnd)), end: r3(now + 120), kind: this.t < 6 ? 'intro' : 'verse', energy: 0.4, palette: pal });
      if (!phrases.length || phrases[phrases.length - 1].until < now + 4) phrases.push({ t: r3(Math.max(0, lastEnd)), until: r3(now + 120), role: 'line', energy: 0.4 });
    } else sections[sections.length - 1].end = Math.max(sections[sections.length - 1].end, r3(now + 120));
    const analysis = { bpm, meter: this.meter, beats: bl.map((b) => b.t), downbeats, duration: now + 120, accents: [] };
    const cues = choreograph({ sections, phrases, analysis, palettes, style: this.style });
    const onsets = Object.fromEntries(Object.entries(this.onsets).map(([k, v]) => [k, v.filter((o) => o[0] >= keepFrom)]));
    return {
      wal: '1.0',
      meta: { title: 'Live', duration: r3(now + 120), bpm: Math.round(bpm * 100) / 100, meter: this.meter, styles: [this.style], generator: 'musync-live/0.1' },
      timing: { beats: analysis.beats, downbeats },
      palettes, sections, phrases, cues,
      accents: this.accents.filter((a) => a.t >= keepFrom),
      onsets,
      envelopes: { rate: RATE, energy: this.env.energy, low: this.env.low, mid: this.env.mid, high: this.env.high },
    };
  }

  // the last `sec` seconds of loudness and the beats inside them, for the dock's live strip
  recent(sec = 20, points = 120) {
    const out = [], e = this.env.energy, end = e.length - 1;
    for (let k = 0; k < points; k++) { const i = Math.max(0, end - Math.round(((points - 1 - k) / points) * sec * RATE)); out.push((e[i] || 0) / 100); }
    const t0 = this.t - sec;
    return { energy: out, beats: this.pastBeats.filter((b) => b.t > t0).map((b) => ({ x: (b.t - t0) / sec, down: b.i % this.meter === this.dbPhase })), sec };
  }

  // for the dock: what the listener is hearing right now
  status() {
    const p = this.phrases[this.phrases.length - 1];
    return { bpm: this.bpm ? Math.round(this.bpm * 10) / 10 : 0, conf: this.conf, locked: this.anchor != null, role: p?.role || '—', level: this.band, energy: (this.env.energy[this.env.energy.length - 1] || 0) / 100, silent: this.silentSince != null };
  }
}
