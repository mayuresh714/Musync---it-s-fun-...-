// Synthetic test song with known ground truth (tempo, downbeats, sections).
// Used by the tests and to give the simulator a demo track with no copyright.

export const DEMO_STRUCTURE = [
  // [kind, bars, layers]
  ['intro', 8, { pad: 1, hat: 0.4 }],
  ['verse', 16, { pad: 0.6, kick: 0.8, snare: 0.6, hat: 0.6, bass: 0.7, lead: 0.5 }],
  ['build', 8, { pad: 0.8, snareRoll: 1, riser: 1, hat: 0.8 }],
  ['drop', 16, { kick: 1, snare: 1, clap: 1, hat: 1, bass: 1, lead: 1 }],
  ['break', 8, { pad: 1, tap: 0.6 }],
  ['build', 8, { pad: 0.8, snareRoll: 1, riser: 1, hat: 0.8 }],
  ['drop', 16, { kick: 1, snare: 1, clap: 1, hat: 1, bass: 1, lead: 1, tap: 0.8 }],
  ['outro', 8, { pad: 0.8, hat: 0.3 }],
];

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthSong({ bpm = 124, sr = 22050, structure = DEMO_STRUCTURE, leadIn = 0.5 } = {}) {
  const rnd = mulberry(7);
  const beat = 60 / bpm;
  const bars = structure.reduce((a, s) => a + s[1], 0);
  const total = leadIn + bars * 4 * beat + 2;
  const out = new Float32Array(Math.ceil(total * sr));
  const add = (t0, fn, dur) => {
    const a = Math.floor(t0 * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n && a + i < out.length; i++) out[a + i] += fn(i / sr);
  };
  const kick = (g) => (t) => g * Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 7);
  const noiseHit = (g, decay, hp) => {
    let prev = 0;
    return (t) => { const n = rnd() * 2 - 1; const v = hp ? n - prev : n; prev = n; return g * v * Math.exp(-t * decay); };
  };
  const tone = (g, f, decay) => (t) => g * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay);
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 294]];

  const truth = { bpm, sections: [], downbeats: [] };
  let t = leadIn, bar = 0;
  for (const [kind, nBars, L] of structure) {
    truth.sections.push({ kind, start: t, end: t + nBars * 4 * beat });
    for (let b = 0; b < nBars; b++, bar++) {
      const bt = t + b * 4 * beat;
      truth.downbeats.push(bt);
      const ch = chords[Math.floor(bar / 2) % 4];
      if (L.pad) for (const f of ch) add(bt, (x) => L.pad * 0.06 * Math.sin(2 * Math.PI * f * x) * Math.min(1, x * 4), 4 * beat);
      if (L.bass) for (let q = 0; q < 4; q++) add(bt + q * beat, tone(L.bass * 0.35, ch[0] / 4, 4), beat);
      if (L.lead) for (let q = 0; q < 8; q++) add(bt + (q * beat) / 2, tone(L.lead * 0.08, ch[q % 3] * 2, 9), beat / 2);
      for (let q = 0; q < 4; q++) {
        const qt = bt + q * beat;
        if (L.kick) add(qt, kick(L.kick * 0.9), 0.4);
        if (L.snare && q % 2 === 1) add(qt, noiseHit(L.snare * 0.35, 18, false), 0.25);
        if (L.clap && q % 2 === 1) add(qt + 0.01, noiseHit(L.clap * 0.3, 30, true), 0.15);
        if (L.hat) { add(qt + beat / 2, noiseHit(L.hat * 0.18, 60, true), 0.06); add(qt, noiseHit(L.hat * 0.1, 80, true), 0.04); }
        if (L.tap) { add(qt, noiseHit(L.tap * 0.25, 90, true), 0.05); add(qt + beat * 0.75, noiseHit(L.tap * 0.2, 90, true), 0.05); }
      }
      if (L.snareRoll) {
        const div = b < nBars / 2 ? 4 : b < nBars - 2 ? 8 : 16;
        for (let q = 0; q < div; q++) add(bt + (q * 4 * beat) / div, noiseHit(0.12 + 0.25 * (b / nBars), 25, false), 0.1);
      }
      if (L.riser) {
        const s0 = (b / nBars), s1 = ((b + 1) / nBars);
        add(bt, (x) => { const p = s0 + (s1 - s0) * (x / (4 * beat)); return (rnd() * 2 - 1) * 0.12 * p * p; }, 4 * beat);
      }
    }
    // one-beat silence before each drop
    if (kind === 'build') {
      const st = Math.floor((t + nBars * 4 * beat - beat) * sr), en = Math.floor((t + nBars * 4 * beat) * sr);
      for (let i = st; i < en && i < out.length; i++) out[i] = 0;
      truth.sections[truth.sections.length - 1].silenceAt = t + nBars * 4 * beat - beat;
    }
    t += nBars * 4 * beat;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh((out[i] / peak) * 1.2) * 0.9;
  // re-silence (tanh keeps zeros, but be explicit)
  return { samples: out, sr, truth, duration: out.length / sr };
}

export function encodeWav(samples, sr) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const s = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(buf);
}
