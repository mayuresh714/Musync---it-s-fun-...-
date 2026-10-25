// The critic: checks the finished show for the faults people notice. It is deterministic, so it can run on every show.
// It keeps blackouts rare (long ones beyond the first two are removed) and reports how dark the show is, how much each
// layer plays and how many stanza lines and steps return with the same light.
const LAYERS = ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'laser', 'strobe', 'blinder'];
const LONG = 0.8, MAX_BLACKOUTS = 2;

export function critic(wal, duration) {
  const notes = [];
  // long blackouts: keep the first two, drop the rest (the engine's one-beat dark before a refrain stays)
  let kept = 0, dropped = 0;
  const isLong = (c) => c.fx === 'blackout' && (c.dur ?? 0) >= LONG;
  const keep = (c) => { if (!isLong(c)) return true; if (kept < MAX_BLACKOUTS) { kept++; return true; } dropped++; return false; };
  wal.cues = wal.cues.filter(keep);
  wal.accents = wal.accents.filter((x) => (x.fx === 'blackout' && (x.dur ?? 0) >= LONG ? keep({ fx: 'blackout', dur: x.dur }) : true));
  if (dropped) notes.push(`${dropped} long blackout${dropped > 1 ? 's' : ''} removed (only ${MAX_BLACKOUTS} are allowed in one show).`);

  // time lit per layer, and time with nothing lit
  const step = 0.5, n = Math.ceil(duration / step);
  const lit = Object.fromEntries(LAYERS.map((l) => [l, new Uint8Array(n)]));
  for (const c of wal.cues) {
    if (c.fx && !c.dim && !c.move && !c.color) continue;
    if (c.dim?.look === 'off') continue;
    const ls = c.layer === 'all' ? LAYERS : [c.layer];
    for (let i = Math.floor(c.t / step); i < Math.min(n, Math.ceil((c.until ?? duration) / step)); i++) for (const l of ls) if (lit[l]) lit[l][i] = 1;
  }
  const share = {};
  for (const l of LAYERS) share[l] = Math.round((lit[l].reduce((s, v) => s + v, 0) / n) * 100);
  let dark = 0;
  for (let i = 0; i < n; i++) if (!lit.beam[i] && !lit.wash[i] && !lit.spot[i]) dark++;
  const darkPct = Math.round((dark / n) * 100);
  if (darkPct > 10) notes.push(`The room is without main light for ${darkPct}% of the show.`);

  const motifs = {};
  for (const p of wal.phrases || []) if (p.motif) motifs[p.motif] = (motifs[p.motif] || 0) + 1;
  const returns = Object.values(motifs).filter((v) => v > 1).length;
  return { darkPct, layers: share, blackouts: kept, motifsThatReturn: returns, notes };
}
