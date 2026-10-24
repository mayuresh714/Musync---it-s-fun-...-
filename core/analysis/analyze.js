// analyze(samples, sr) -> analysis object (pure data, JSON-serialisable).
// Runs identically in Node (bin/wal.mjs) and in the browser (simulator).
import { computeFeatures, smooth, normalize, percentile, pickPeaks } from './features.js';
import { onsetEnvelope, estimateTempo, trackBeats, downbeatPhase, meanVec } from './rhythm.js';
import { barFeatures, segmentBars, labelSections, groupSections, findSilences, findHits, estimateKey } from './structure.js';

export const ANALYZER_VERSION = 'musync-analyze/0.1';
export const TARGET_SR = 22050;

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;

export function analyze(samples, sr, { meter = 4, onProgress = () => {} } = {}) {
  if (sr !== TARGET_SR) {
    samples = resample(samples, sr, TARGET_SR);
    sr = TARGET_SR;
  }
  const duration = samples.length / sr;
  onProgress('features', 0.05);
  const F = computeFeatures(samples, sr);
  const t = (frame) => (frame * F.hop + F.nFft / 2) / sr;
  const frameAt = (sec) => Math.max(0, Math.min(F.nFrames - 1, Math.round((sec * sr - F.nFft / 2) / F.hop)));

  onProgress('rhythm', 0.5);
  const env = onsetEnvelope(F);
  const tempo = estimateTempo(env, F.fps);
  const beatFrames = trackBeats(env, tempo.period);
  const phase = downbeatPhase(beatFrames, F, meter);
  const beatTimes = beatFrames.map(t);
  // refine BPM: least-squares slope of beat time vs beat index (beats sit on a frame grid)
  const bpm = beatTimes.length > 8 ? 60 / slope(beatTimes) : tempo.bpm;

  // loudness 0..1: dB relative to the song's loud level, 30 dB range
  const db = Float32Array.from(F.rms, (v) => 20 * Math.log10(v + 1e-9));
  const top = percentile(db, 97);
  const loud = Float32Array.from(db, (v) => Math.max(0, Math.min(1, (v - (top - 30)) / 30)));
  const loudS = smooth(loud, Math.round(F.fps * 0.15));
  const lowN = normalize(smooth(F.band.low, 2), 97);
  const midN = normalize(smooth(F.band.mid, 2), 97);
  const highN = normalize(smooth(F.band.high, 2), 97);

  onProgress('structure', 0.7);
  // bars from downbeats; pad the edges so the whole song is covered
  let barFrames = beatFrames.filter((_, i) => i >= phase && (i - phase) % meter === 0);
  if (barFrames.length < 2) barFrames = [0, F.nFrames - 1];
  if (barFrames[0] > F.fps) barFrames = [0, ...barFrames];
  else barFrames[0] = 0;
  barFrames.push(F.nFrames - 1);
  const barSec = (60 / bpm) * meter;
  const vecs = barFeatures(F, barFrames, loudS);
  const barEnergy = vecs.map((v) => v[v.length - 1] / 4);
  const starts = segmentBars(vecs, barEnergy, duration, barSec);

  const onsetDensity = smooth(Float32Array.from(env, (v) => (v > 0.3 ? 1 : 0)), Math.round(F.fps));
  const sections = starts.map((b, i) => {
    const endBar = i + 1 < starts.length ? starts[i + 1] : barFrames.length - 1;
    const a = barFrames[b], z = barFrames[endBar];
    const avg = (arr) => { let s = 0; for (let f = a; f < z; f++) s += arr[f]; return s / Math.max(1, z - a); };
    const l = avg(loudS), lo = avg(lowN), hi = avg(highN), dens = avg(onsetDensity);
    // energy trend: second half vs first half of the section
    const mid = Math.floor((a + z) / 2);
    let s1 = 0, s2 = 0;
    for (let f = a; f < mid; f++) s1 += loudS[f] + 0.5 * highN[f];
    for (let f = mid; f < z; f++) s2 += loudS[f] + 0.5 * highN[f];
    const trend = (s2 / Math.max(1, z - mid) - s1 / Math.max(1, mid - a)) / 1.5;
    return {
      start: i === 0 ? 0 : r3(t(a)),
      end: i + 1 < starts.length ? r3(t(z)) : r3(duration),
      bars: endBar - b,
      energy: r2(Math.min(1, 0.6 * l + 0.25 * lo + 0.15 * Math.min(1, dens * 3))),
      low: r2(lo), high: r2(hi), density: r2(dens), trend: r2(trend),
      _vec: meanVec(vecs, b, endBar),
    };
  });
  // energy is relative to the loudest section, so every song uses the full 0..1 range
  const eMax = Math.max(0.5, ...sections.map((s) => s.energy));
  sections.forEach((s) => (s.energy = r2(Math.min(1, s.energy / eMax))));
  groupSections(sections, sections.map((s) => s._vec));
  labelSections(sections);
  sections.forEach((s, i) => { delete s._vec; s.id = `s${i + 1}`; });

  onProgress('accents', 0.85);
  const accents = [];
  for (const s of sections) {
    if (s.kind === 'drop') accents.push({ t: s.start, type: 'drop', strength: r2(Math.min(1, s.energy)) });
    if (s.kind === 'build') accents.push({ t: s.start, type: 'riser', dur: r3(s.end - s.start), strength: r2(Math.min(1, 0.5 + s.trend)) });
  }
  for (const [a, z] of findSilences(F, loud)) accents.push({ t: r3(t(a)), type: 'silence', dur: r3((z - a) / F.fps), strength: 1 });
  for (const [p, v] of findHits(F, env)) accents.push({ t: r3(t(p)), type: 'hit', strength: r2(Math.min(1, v)) });
  accents.sort((a, b) => a.t - b.t);

  const onsets = {};
  for (const band of ['low', 'mid', 'high']) {
    const bf = normalize(F.bandFlux[band], 99);
    const peaks = pickPeaks(bf, { pre: 3, post: 3, delta: 0.12, wait: Math.round(F.fps * 0.09) });
    onsets[band] = peaks.filter((p) => bf[p] > 0.2).map((p) => [r3(t(p)), r2(Math.min(1, bf[p]))]);
  }

  // 20 Hz envelopes as integers 0..100
  const rate = 20;
  const nEnv = Math.ceil(duration * rate);
  const sample = (arr) => {
    const out = new Array(nEnv);
    for (let i = 0; i < nEnv; i++) out[i] = Math.round(100 * (arr[frameAt(i / rate)] || 0));
    return out;
  };

  onProgress('done', 1);
  const key = estimateKey(F);
  return {
    analyzer: ANALYZER_VERSION,
    duration: r3(duration),
    bpm: r2(bpm),
    meter,
    key: key.key,
    beats: beatTimes.map(r3),
    downbeats: beatTimes.filter((_, i) => i >= phase && (i - phase) % meter === 0).map(r3),
    sections,
    accents,
    onsets,
    envelopes: { rate, energy: sample(loudS), low: sample(lowN), mid: sample(midN), high: sample(highN) },
  };
}

function slope(y) {
  const n = y.length;
  const mx = (n - 1) / 2;
  let my = 0;
  for (const v of y) my += v;
  my /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (y[i] - my); den += (i - mx) ** 2; }
  return num / den;
}

// Linear-interpolation resampler; fine for analysis (not for playback).
export function resample(x, from, to) {
  if (from === to) return x;
  const ratio = from / to;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  // crude anti-alias: box filter when downsampling
  const k = Math.max(1, Math.floor(ratio));
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    if (k > 1) {
      let s = 0;
      for (let m = 0; m < k; m++) s += x[j + m] || 0;
      out[i] = s / k;
    } else {
      const f = pos - j;
      out[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f;
    }
  }
  return out;
}
