// Frame-level features from mono PCM: RMS, band energies, spectral flux onset
// envelopes (full + per band), 24 log-spaced timbre bands and 12-bin chroma.
import { fft, hann } from './fft.js';

export const BANDS = {
  low: [20, 150],     // kick, bass, dhol body
  mid: [150, 2000],   // vocals, snare body, harmonium, guitars
  high: [2000, 11000] // hats, claps, dandiya stick taps, shakers
};

export function computeFeatures(samples, sr, { nFft = 2048, hop = 512 } = {}) {
  const nFrames = Math.max(1, Math.floor((samples.length - nFft) / hop) + 1);
  const nBins = nFft / 2 + 1;
  const win = hann(nFft);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const binHz = sr / nFft;

  const bandIdx = Object.fromEntries(
    Object.entries(BANDS).map(([k, [lo, hi]]) => [k, [Math.max(1, Math.round(lo / binHz)), Math.min(nBins - 1, Math.round(hi / binHz))]])
  );

  // 24 log-spaced bands 40 Hz .. 10 kHz for timbre
  const nTimbre = 24;
  const tEdges = [];
  for (let i = 0; i <= nTimbre; i++) tEdges.push(Math.round((40 * Math.pow(10000 / 40, i / nTimbre)) / binHz));

  // chroma: map each bin 55 Hz..5 kHz to pitch class
  const chromaOf = new Int8Array(nBins).fill(-1);
  for (let b = 1; b < nBins; b++) {
    const f = b * binHz;
    if (f < 55 || f > 5000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    chromaOf[b] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const rms = new Float32Array(nFrames);
  const band = { low: new Float32Array(nFrames), mid: new Float32Array(nFrames), high: new Float32Array(nFrames) };
  const flux = new Float32Array(nFrames);
  const bandFlux = { low: new Float32Array(nFrames), mid: new Float32Array(nFrames), high: new Float32Array(nFrames) };
  const timbre = new Array(nFrames);
  const chroma = new Array(nFrames);
  const centroid = new Float32Array(nFrames);

  let prev = new Float32Array(nBins);
  let cur = new Float32Array(nBins);

  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    let sq = 0;
    for (let i = 0; i < nFft; i++) {
      const s = samples[off + i] || 0;
      sq += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(sq / nFft);
    fft(re, im);

    let wsum = 0, msum = 0;
    for (let b = 0; b < nBins; b++) {
      const m = Math.hypot(re[b], im[b]);
      cur[b] = Math.log1p(100 * m); // log compression, gamma=100
      wsum += b * m; msum += m;
    }
    centroid[f] = msum > 0 ? (wsum / msum) * binHz : 0;

    let fl = 0;
    const bf = { low: 0, mid: 0, high: 0 };
    for (let b = 1; b < nBins; b++) {
      const d = cur[b] - prev[b];
      if (d > 0) fl += d;
    }
    for (const k of Object.keys(BANDS)) {
      const [lo, hi] = bandIdx[k];
      let e = 0, d = 0;
      for (let b = lo; b <= hi; b++) {
        const m = Math.expm1(cur[b]) / 100;
        e += m * m;
        const x = cur[b] - prev[b];
        if (x > 0) d += x;
      }
      band[k][f] = Math.sqrt(e / (hi - lo + 1));
      bandFlux[k][f] = d / (hi - lo + 1);
    }
    flux[f] = fl / nBins;

    const tv = new Float32Array(nTimbre);
    for (let i = 0; i < nTimbre; i++) {
      const lo = Math.max(1, tEdges[i]);
      const hi = Math.max(lo, Math.min(nBins - 1, tEdges[i + 1]));
      let s = 0;
      for (let b = lo; b <= hi; b++) s += cur[b];
      tv[i] = s / (hi - lo + 1);
    }
    timbre[f] = tv;

    const cv = new Float32Array(12);
    for (let b = 1; b < nBins; b++) if (chromaOf[b] >= 0) cv[chromaOf[b]] += cur[b];
    chroma[f] = cv;

    const t = prev; prev = cur; cur = t;
  }

  return { sr, hop, nFft, fps: sr / hop, nFrames, rms, band, flux, bandFlux, timbre, chroma, centroid };
}

// ---- small numeric helpers shared by the analysis modules ----

// Centered moving average (edges use the shorter window available).
export function smooth(x, radius) {
  const n = x.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius), hi = Math.min(n, i + radius + 1);
    out[i] = (pre[hi] - pre[lo]) / (hi - lo);
  }
  return out;
}

export function percentile(x, p) {
  const a = Float32Array.from(x).sort();
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * (a.length - 1))))];
}

export function normalize(x, top = 98) {
  const hi = percentile(x, top) || 1e-9;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.min(1, x[i] / hi);
  return out;
}

// Local maxima above an adaptive threshold (moving mean + delta), at least `wait` frames apart.
export function pickPeaks(x, { pre = 6, post = 6, delta = 0.05, wait = 4 } = {}) {
  const peaks = [];
  let last = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const lo = Math.max(0, i - pre), hi = Math.min(x.length - 1, i + post);
    let isMax = true, mean = 0;
    for (let j = lo; j <= hi; j++) {
      if (x[j] > x[i]) { isMax = false; break; }
      mean += x[j];
    }
    if (!isMax) continue;
    mean /= hi - lo + 1;
    if (x[i] >= mean + delta && i - last >= wait) { peaks.push(i); last = i; }
  }
  return peaks;
}
