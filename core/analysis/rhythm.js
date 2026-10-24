// Tempo estimation (onset autocorrelation with a log-normal tempo prior),
// beat tracking (Ellis 2007 dynamic programming) and downbeat phase selection.
import { smooth, normalize } from './features.js';

// Onset strength used for rhythm: full-band flux plus low-band flux (kick/dhol),
// detrended so sustained loud passages don't swamp the transients.
export function onsetEnvelope(F) {
  const n = F.nFrames;
  const flux = normalize(F.flux, 99);
  const low = normalize(F.bandFlux.low, 99);
  const high = normalize(F.bandFlux.high, 99);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = flux[i] + 0.6 * low[i] + 0.3 * high[i];
  const trend = smooth(raw, Math.round(F.fps * 0.4));
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.max(0, raw[i] - trend[i]);
  return normalize(env, 99.5);
}

export function estimateTempo(env, fps, { minBpm = 60, maxBpm = 200, priorBpm = 115, priorOctaves = 1.0 } = {}) {
  const n = env.length;
  const minLag = Math.floor((60 * fps) / maxBpm);
  const maxLag = Math.ceil((60 * fps) / minBpm);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const x = Float32Array.from(env, (v) => v - mean);
  const ac = new Float64Array(maxLag * 2 + 2);
  for (let lag = 1; lag < ac.length; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
    ac[lag] = s / (n - lag);
  }
  let best = minLag, bestScore = -Infinity;
  const score = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / priorBpm) / priorOctaves, 2));
    // reward lags whose double also correlates (true beat period has metrical support)
    const s = (ac[lag] + 0.5 * ac[2 * lag]) * prior;
    score[lag] = s;
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  // parabolic refinement
  let lag = best;
  if (best > minLag && best < maxLag) {
    const a = score[best - 1], b = score[best], c = score[best + 1];
    const d = a - 2 * b + c;
    if (d < 0) lag = best + (0.5 * (a - c)) / d;
  }
  return { bpm: (60 * fps) / lag, period: lag };
}

export function trackBeats(env, period, { tightness = 100 } = {}) {
  const n = env.length;
  // local score: onset envelope smoothed by a gaussian matched to the period
  const half = Math.round(period);
  const sigma = period / 32;
  const kern = [];
  for (let k = -half; k <= half; k++) kern.push(Math.exp(-0.5 * (k / sigma) ** 2));
  let std = 0;
  for (let i = 0; i < n; i++) std += env[i] * env[i];
  std = Math.sqrt(std / n) || 1;
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += (env[j] / std) * kern[k + half];
    }
    local[i] = s;
  }

  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2), hi = Math.round(period * 2);
  let firstBeat = true;
  let localMax = 0;
  for (let i = 0; i < n; i++) {
    localMax = Math.max(localMax, local[i]);
    let bestV = -Infinity, bestJ = -1;
    for (let j = i - hi; j <= i - lo; j++) {
      if (j < 0) continue;
      const v = cum[j] - tightness * Math.log((i - j) / period) ** 2;
      if (v > bestV) { bestV = v; bestJ = j; }
    }
    cum[i] = local[i] + (bestJ >= 0 ? bestV : 0);
    // don't let the path start before the first real onset
    if (firstBeat && local[i] < 0.01 * localMax) back[i] = -1;
    else { firstBeat = false; back[i] = bestJ; }
  }

  // last beat: final local max of cum above half the median of local maxima
  const maxima = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] >= cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(cum[i]);
  maxima.sort((a, b) => a - b);
  const thr = 0.5 * (maxima[maxima.length >> 1] || 0);
  let end = n - 1;
  for (let i = n - 2; i > 0; i--) if (cum[i] >= cum[i - 1] && cum[i] >= cum[i + 1] && cum[i] >= thr) { end = i; break; }

  const beats = [];
  for (let i = end; i >= 0; i = back[i]) {
    beats.push(i);
    if (back[i] < 0) break;
  }
  beats.reverse();

  // trim weak beats at the edges (silence / fade)
  let rms = 0;
  for (const b of beats) rms += local[b] ** 2;
  rms = Math.sqrt(rms / Math.max(1, beats.length));
  const strong = (b) => local[b] >= 0.5 * rms;
  let s = 0, e = beats.length;
  while (s < e && !strong(beats[s])) s++;
  while (e > s && !strong(beats[e - 1])) e--;
  return beats.slice(s, e);
}

// Pick which beat of each bar is "1": the phase where low-end hits and harmonic
// changes line up best.
export function downbeatPhase(beatFrames, F, meter = 4) {
  const low = normalize(F.bandFlux.low, 99);
  const chromaChange = beatFrames.map((b, i) => {
    if (i === 0 || i === beatFrames.length - 1) return 0;
    const before = meanVec(F.chroma, beatFrames[i - 1], b);
    const after = meanVec(F.chroma, b, beatFrames[i + 1]);
    return 1 - cosine(before, after);
  });
  const lowAt = beatFrames.map((b) => Math.max(low[b] || 0, low[b + 1] || 0, low[b - 1] || 0));
  let best = 0, bestScore = -Infinity;
  for (let p = 0; p < meter; p++) {
    let s = 0, c = 0;
    for (let i = p; i < beatFrames.length; i += meter) { s += lowAt[i] + 2 * chromaChange[i]; c++; }
    s /= Math.max(1, c);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

export function meanVec(rows, a, b) {
  const d = rows[0].length;
  const out = new Float32Array(d);
  const lo = Math.max(0, a), hi = Math.min(rows.length, Math.max(b, a + 1));
  for (let i = lo; i < hi; i++) for (let k = 0; k < d; k++) out[k] += rows[i][k];
  for (let k = 0; k < d; k++) out[k] /= Math.max(1, hi - lo);
  return out;
}

export function cosine(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}
