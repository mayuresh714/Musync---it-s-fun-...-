// Beat-grid repair and per-bar profile, used by the director before an agent reads the song.
// The tempo tracker can land on half-time (a 131 BPM dance track reads as 65) and stops tracking
// when the tail of a song is dense, so the grid is checked against the onsets and extended to the end.

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function nearestIndex(sorted, t) {
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < t) lo = mid + 1; else hi = mid; }
  return lo > 0 && Math.abs(sorted[lo - 1] - t) < Math.abs(sorted[lo] - t) ? lo - 1 : lo;
}

// How much onset energy sits at the midpoints between beats compared with on the beats.
// Near 1 means the real pulse is twice as fast as the tracked one.
function midpointRatio(a) {
  const onsets = [...(a.onsets.low || []), ...(a.onsets.mid || []), ...(a.onsets.high || [])];
  if (!onsets.length || a.beats.length < 8) return 0;
  const period = median(a.beats.slice(1).map((b, i) => b - a.beats[i]));
  const tol = Math.min(0.07, period * 0.12);
  // onsets are sorted per band, not globally, so look them up through a bucketed index
  const bucket = new Map();
  for (const [ot, w] of onsets) { const k = Math.floor(ot / 0.25); (bucket.get(k) || bucket.set(k, []).get(k)).push([ot, w]); }
  const near = (t) => { let s = 0; for (let k = Math.floor((t - tol) / 0.25); k <= Math.floor((t + tol) / 0.25); k++) for (const [ot, w] of bucket.get(k) || []) if (Math.abs(ot - t) <= tol) s += w; return s; };
  let onBeat = 0, offBeat = 0;
  for (let i = 0; i + 1 < a.beats.length; i++) { onBeat += near(a.beats[i]); offBeat += near((a.beats[i] + a.beats[i + 1]) / 2); }
  return onBeat > 0 ? offBeat / onBeat : 0;
}

// factor: 'auto' | 0.5 | 1 | 2. Returns a new analysis whose beats/downbeats cover 0..duration.
export function fixTempo(a, factor = 'auto') {
  const note = [];
  let beats = [...a.beats];
  if (beats.length < 4) return { ...a, tempoNote: 'too few beats to repair' };
  let f = factor;
  if (f === 'auto') {
    const ratio = midpointRatio(a);
    f = a.bpm < 92 && a.bpm * 2 <= 190 && ratio >= 0.6 ? 2 : 1;
    if (f === 2) note.push(`tracked ${a.bpm} BPM but ${Math.round(ratio * 100)}% as much onset energy sits between beats as on them, so the pulse is doubled`);
  }
  if (f === 2) {
    const out = [];
    for (let i = 0; i < beats.length; i++) { out.push(beats[i]); if (i + 1 < beats.length) out.push((beats[i] + beats[i + 1]) / 2); }
    out.push(beats[beats.length - 1] + (beats[beats.length - 1] - beats[beats.length - 2]) / 2);
    beats = out;
  } else if (f === 0.5) beats = beats.filter((_, i) => i % 2 === 0);

  const p = median(beats.slice(1).map((b, i) => b - beats[i]));
  // extend the grid to both ends of the song at the steady period
  while (beats[beats.length - 1] + p < a.duration) beats.push(beats[beats.length - 1] + p);
  while (beats[0] - p >= 0) beats.unshift(beats[0] - p);
  const meter = a.meter || 4;
  const phaseAnchor = a.downbeats?.length ? nearestIndex(beats, a.downbeats[0]) : 0;
  const phase = ((phaseAnchor % meter) + meter) % meter;
  const downbeats = beats.filter((_, i) => i % meter === phase);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return {
    ...a,
    bpm: Math.round((60 / p) * 100) / 100,
    beats: beats.map(r3),
    downbeats: downbeats.map(r3),
    tempoNote: note.join('; ') || (f === 1 ? 'tempo kept' : `tempo scaled x${f}`),
  };
}

// One row per bar: relative energy and band levels (0-9) plus onsets per second.
export function barProfile(a) {
  const rate = a.envelopes.rate;
  const meterSec = (60 / a.bpm) * (a.meter || 4);
  const edges = [...a.downbeats];
  if (edges[0] > meterSec * 0.4) edges.unshift(0); else edges[0] = 0;
  edges.push(a.duration);
  const avg = (arr, t0, t1) => {
    const i0 = Math.floor(t0 * rate), i1 = Math.max(i0 + 1, Math.min(arr.length, Math.ceil(t1 * rate)));
    let s = 0; for (let i = i0; i < i1; i++) s += arr[i] || 0;
    return s / (i1 - i0);
  };
  const onsets = [...(a.onsets.low || []), ...(a.onsets.mid || []), ...(a.onsets.high || [])].map((o) => o[0]).sort((x, y) => x - y);
  const bars = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const t0 = edges[i], t1 = edges[i + 1];
    if (t1 - t0 < 0.3) continue;
    let c = 0; for (const t of onsets) { if (t >= t0 && t < t1) c++; else if (t >= t1) break; }
    bars.push({ n: bars.length + 1, t: t0, end: t1, e: avg(a.envelopes.energy, t0, t1), l: avg(a.envelopes.low, t0, t1), m: avg(a.envelopes.mid, t0, t1), h: avg(a.envelopes.high, t0, t1), o: c / (t1 - t0) });
  }
  const top = (k) => Math.max(1, [...bars.map((b) => b[k])].sort((x, y) => x - y)[Math.floor(bars.length * 0.97)] || 1);
  const scale = { e: top('e'), l: top('l'), m: top('m'), h: top('h') };
  for (const b of bars) for (const k of ['e', 'l', 'm', 'h']) b[k] = Math.max(0, Math.min(9, Math.round((b[k] / scale[k]) * 9)));
  return bars;
}
