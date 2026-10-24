// Song structure: bar-level self-similarity novelty + energy change -> section
// boundaries, per-section stats, repetition groups, heuristic section kinds,
// accents (drops, hits, silences, risers) and key.
import { smooth, normalize, percentile, pickPeaks } from './features.js';
import { meanVec, cosine } from './rhythm.js';

export function barFeatures(F, barFrames, energy) {
  const rows = [];
  for (let i = 0; i < barFrames.length - 1; i++) {
    const a = barFrames[i], b = barFrames[i + 1];
    const tim = meanVec(F.timbre, a, b);
    const chr = meanVec(F.chroma, a, b);
    let cn = 0;
    for (const v of chr) cn = Math.max(cn, v);
    let e = 0;
    for (let f = a; f < b; f++) e += energy[f];
    e /= Math.max(1, b - a);
    rows.push({ tim, chr: chr.map((v) => (cn ? v / cn : 0)), energy: e });
  }
  // z-score the timbre dims across the song so the SSM sees contrast, not loudness
  const d = rows[0]?.tim.length || 0;
  for (let k = 0; k < d; k++) {
    let m = 0, s = 0;
    for (const r of rows) m += r.tim[k];
    m /= rows.length;
    for (const r of rows) s += (r.tim[k] - m) ** 2;
    s = Math.sqrt(s / rows.length) || 1;
    for (const r of rows) r.tim[k] = (r.tim[k] - m) / s;
  }
  return rows.map((r) => Float32Array.from([...r.tim, ...Array.from(r.chr, (v) => v * 1.5), r.energy * 4]));
}

function checkerboardNovelty(vecs, half = 4) {
  const n = vecs.length;
  const S = vecs.map((a) => vecs.map((b) => cosine(a, b)));
  const nov = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let a = -half; a < half; a++) {
      for (let b = -half; b < half; b++) {
        const x = i + a, y = i + b;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        const g = Math.exp(-0.5 * (((a + 0.5) / half) ** 2 + ((b + 0.5) / half) ** 2));
        s += sign * g * S[x][y];
        w += g;
      }
    }
    nov[i] = w ? Math.max(0, s / w) : 0;
  }
  return { nov, S };
}

// Returns bar indices where new sections start (always includes 0).
export function segmentBars(vecs, barEnergy, durationSec, barSec) {
  const n = vecs.length;
  if (n < 8) return [0];
  const { nov } = checkerboardNovelty(vecs, 4);
  const novN = normalize(nov, 99);
  const eChange = new Float32Array(n);
  for (let i = 2; i < n - 1; i++) {
    const before = (barEnergy[i - 1] + barEnergy[i - 2]) / 2;
    const after = (barEnergy[i] + barEnergy[i + 1]) / 2;
    eChange[i] = Math.abs(after - before);
  }
  const eN = normalize(eChange, 99);
  const score = Float32Array.from(novN, (v, i) => (0.6 * v + 0.4 * eN[i]) * (i % 4 === 0 ? 1.25 : i % 2 === 0 ? 1.05 : 0.85));

  const target = Math.max(2, Math.round(durationSec / 22));
  const minBars = Math.max(4, Math.round(8 / barSec)); // >= 4 bars and >= ~8 s
  const cands = [];
  for (let i = 2; i < n - 2; i++) if (score[i] >= score[i - 1] && score[i] >= score[i + 1]) cands.push(i);
  cands.sort((a, b) => score[b] - score[a]);
  const floor = percentile(score, 60);
  const chosen = [0];
  for (const c of cands) {
    if (chosen.length > target * 1.5) break;
    if (score[c] < floor) break;
    if (chosen.some((x) => Math.abs(x - c) < minBars)) continue;
    if (n - c < minBars / 2) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a - b);
}

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function estimateKey(F) {
  const tot = meanVec(F.chroma, 0, F.nFrames);
  let best = { score: -Infinity };
  for (let r = 0; r < 12; r++) {
    for (const [mode, prof] of [['major', KS_MAJOR], ['minor', KS_MINOR]]) {
      const rot = prof.map((_, i) => prof[(i - r + 12) % 12]);
      const s = pearson(tot, rot);
      if (s > best.score) best = { score: s, key: `${NOTES[r]} ${mode}`, mode };
    }
  }
  return best;
}

function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb || 1);
}

// Heuristic labels. The /wal skill is expected to revise these with musical judgement.
export function labelSections(secs) {
  const energies = secs.map((s) => s.energy);
  const hiThr = Math.max(0.68, percentile(energies, 70));
  const mean = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const top = Math.max(...energies);
  secs.forEach((s, i) => {
    const prev = secs[i - 1], next = secs[i + 1];
    let kind = 'verse';
    if (s.energy >= hiThr) kind = 'chorus';
    // a drop is a top-energy section slamming in after something clearly lighter
    if (s.energy >= Math.max(hiThr, top - 0.06) && prev && prev.energy < s.energy - 0.25 && s.low >= prev.low * 1.3) kind = 'drop';
    if (next && s.trend > 0.12 && next.energy > s.energy + 0.1) kind = 'build';
    if (i > 0 && i < secs.length - 1 && kind !== 'build' && s.energy < mean - 0.05 && prev.energy > s.energy + 0.3) kind = 'break';
    if (i === 0 && (s.energy < mean || (next && next.energy > s.energy + 0.1))) kind = 'intro';
    if (i === secs.length - 1 && secs.length > 2 && (s.energy < mean || s.trend < -0.1)) kind = 'outro';
    s.kind = kind;
  });
  // only the strongest few real peaks stay "drop"; the rest become chorus
  const drops = secs.filter((s) => s.kind === 'drop').sort((a, b) => b.energy - a.energy);
  drops.slice(3).forEach((s) => (s.kind = 'chorus'));
  return secs;
}

// Group sections that sound alike (A, B, C...) so repeats can reuse looks.
export function groupSections(secs, vecsPerSec) {
  const groups = [];
  secs.forEach((s, i) => {
    let g = groups.findIndex((gv) => cosine(gv, vecsPerSec[i]) > 0.9);
    if (g < 0) { groups.push(vecsPerSec[i]); g = groups.length - 1; }
    s.group = String.fromCharCode(65 + (g % 26));
  });
}

export function findSilences(F, energySmooth, { minSec = 0.25 } = {}) {
  const thr = 0.06;
  const out = [];
  let start = -1;
  const minFrames = Math.round(minSec * F.fps);
  for (let i = 0; i <= energySmooth.length; i++) {
    const quiet = i < energySmooth.length && energySmooth[i] < thr;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      if (i - start >= minFrames && start > F.fps * 1 && i < energySmooth.length - F.fps * 1) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

// "Hits" are onsets that stand far above the surrounding onsets (stabs, slams,
// orchestral hits) — not every snare in a busy passage.
export function findHits(F, env, { maxPerMinute = 4, contextSec = 4, ratio = 2.2 } = {}) {
  const sm = smooth(env, 1);
  const peaks = pickPeaks(sm, { pre: 3, post: 3, delta: 0.05, wait: Math.round(F.fps * 0.25) });
  const ctx = Math.round(F.fps * contextSec);
  const hits = [];
  let lo = 0;
  for (let k = 0; k < peaks.length; k++) {
    const p = peaks[k];
    while (peaks[lo] < p - ctx) lo++;
    const around = [];
    for (let j = lo; j < peaks.length && peaks[j] <= p + ctx; j++) if (j !== k) around.push(sm[peaks[j]]);
    around.sort((a, b) => a - b);
    const med = around.length ? around[around.length >> 1] : 0;
    if (sm[p] >= 0.45 && sm[p] >= ratio * med) hits.push([p, sm[p]]);
  }
  const limit = Math.max(3, Math.round((F.nFrames / F.fps / 60) * maxPerMinute));
  return hits.sort((a, b) => b[1] - a[1]).slice(0, limit).sort((a, b) => a[0] - b[0]);
}
