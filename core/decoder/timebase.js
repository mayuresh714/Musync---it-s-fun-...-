// Musical time from a WAL: continuous beat position, trigger lists, envelopes.

export function lastIndexLE(arr, t) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export function createTimebase(wal) {
  const beats = wal.timing.beats.length ? wal.timing.beats : [0];
  const spb = 60 / (wal.meta.bpm || 120);
  const meter = wal.meta.meter || 4;
  const downbeats = wal.timing.downbeats?.length ? wal.timing.downbeats : beats.filter((_, i) => i % meter === 0);

  // continuous beat position (beat index + fraction); extrapolates before/after
  const beatPos = (t) => {
    if (t <= beats[0]) return (t - beats[0]) / spb;
    const i = lastIndexLE(beats, t);
    if (i >= beats.length - 1) return beats.length - 1 + (t - beats[beats.length - 1]) / spb;
    return i + (t - beats[i]) / (beats[i + 1] - beats[i]);
  };
  const timeOfBeat = (p) => {
    if (p <= 0) return beats[0] + p * spb;
    const i = Math.floor(p);
    if (i >= beats.length - 1) return beats[beats.length - 1] + (p - (beats.length - 1)) * spb;
    return beats[i] + (p - i) * (beats[i + 1] - beats[i]);
  };

  const sub = (div, offset = 0) => {
    const out = [];
    for (let p = offset; p < beats.length - 1; p += 1 / div) out.push(timeOfBeat(p));
    return out;
  };
  const triggers = {
    beat: beats,
    half: beats.filter((_, i) => i % 2 === 0),
    bar: downbeats,
    phrase: downbeats.filter((_, i) => i % 4 === 0),
    offbeat: sub(1, 0.5),
    '8th': sub(2),
    '16th': sub(4),
    low: (wal.onsets?.low || []).map((o) => o[0]),
    mid: (wal.onsets?.mid || []).map((o) => o[0]),
    high: (wal.onsets?.high || []).map((o) => o[0]),
  };
  const strengths = {
    low: (wal.onsets?.low || []).map((o) => o[1]),
    mid: (wal.onsets?.mid || []).map((o) => o[1]),
    high: (wal.onsets?.high || []).map((o) => o[1]),
  };
  // onset layers fall back to beats when a WAL carries no onsets
  for (const k of ['low', 'mid', 'high']) if (!triggers[k].length) triggers[k] = beats;

  const env = wal.envelopes;
  const envelope = (name, t) => {
    const arr = env?.[name];
    if (!arr?.length) return 0.7;
    const x = t * env.rate;
    const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x)));
    const j = Math.min(arr.length - 1, i + 1);
    const f = Math.max(0, Math.min(1, x - i));
    return (arr[i] * (1 - f) + arr[j] * f) / 100;
  };

  // last trigger at or before t: { idx, time, strength }
  const lastTrigger = (on, t) => {
    const arr = triggers[on] || beats;
    const idx = lastIndexLE(arr, t);
    return { idx, time: idx >= 0 ? arr[idx] : -Infinity, strength: strengths[on]?.[idx] ?? 1 };
  };

  return { beats, downbeats, spb, meter, beatPos, timeOfBeat, triggers, lastTrigger, envelope };
}
