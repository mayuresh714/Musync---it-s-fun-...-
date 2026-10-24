// Why do the shows feel poor? Decodes every onboarded song on a rig and measures what a viewer feels:
// how many movers stand still, how many beams are lit, how many colours, whether light follows the beat,
// the loudness curve and the words. usage: node scripts/study.mjs [rig=dandiya] [--json out.json]
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecoder } from '../core/decoder/decoder.js';

const rigName = process.argv.slice(2).find((a) => !a.startsWith('--') && !a.endsWith('.json')) || 'dandiya';
const rig = JSON.parse(readFileSync(fileURLToPath(new URL(`../sim/public/rigs/${rigName}.json`, import.meta.url)), 'utf8'));
const root = fileURLToPath(new URL('../.musync/jobs/', import.meta.url));
const FPS = 20, DEG = 180 / Math.PI;
const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.12 * mx || mx < 0.05) return -1; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] ?? 0; };
const corr = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy || 1); };

const rows = [];
for (const id of readdirSync(root)) {
  const d = join(root, id);
  if (!existsSync(join(d, 'song.wal.json')) || !existsSync(join(d, 'analysis.json'))) continue;
  const wal = JSON.parse(readFileSync(join(d, 'song.wal.json'), 'utf8'));
  const a = JSON.parse(readFileSync(join(d, 'analysis.json'), 'utf8'));
  const dec = createDecoder(wal, rig);
  const dur = Math.min(wal.meta.duration, 200), N = Math.floor(dur * FPS);
  const movers = rig.fixtures.filter((f) => f.model.includes('sharpy') || f.model.includes('mythos')).map((f) => f.id);
  const prev = {}, still = Object.fromEntries(movers.map((m) => [m, 0])), lit = Object.fromEntries(movers.map((m) => [m, 0])), travel = Object.fromEntries(movers.map((m) => [m, 0]));
  const litCount = [], total = [], beamTot = [], moverLevel = [], hueBins = new Array(12).fill(0), hueSection = {}, spreadSamples = [];
  let strobeFrames = 0, whiteFrames = 0, colourFrames = 0, onsetFrames = 0;
  for (let i = 0; i < N; i++) {
    const t = i / FPS, f = dec.frame(t);
    let nl = 0, tot = 0, ml = 0; const dirs = [];
    for (const m of movers) {
      const s = f[m]; if (!s) continue;
      const on = s.dim > 0.12;
      if (on) { nl++; lit[m]++; ml += s.dim; dirs.push(s.aim); const h = hue(s.rgb); if (h >= 0) { hueBins[Math.floor(h / 30)]++; colourFrames++; const sec = wal.sections.find((q) => t >= q.start && t < q.end)?.id; (hueSection[sec] ||= new Array(12).fill(0))[Math.floor(h / 30)]++; } else whiteFrames++; }
      const p = prev[m];
      if (p) { const dot = Math.max(-1, Math.min(1, p.x * s.aim.x + p.y * s.aim.y + p.z * s.aim.z)), ang = Math.acos(dot) * DEG * FPS; travel[m] += ang; if (on && ang < 3) still[m]++; }
      prev[m] = s.aim;
    }
    let bt = 0; for (const k in f) { tot += (f[k].dim || 0); if (f[k].role === 'beam') bt += f[k].dim || 0; }
    beamTot.push(bt);
    // how spread are the lit beams: mean angle between each beam and the crowd of all beams (1 = all parallel/one bundle)
    if (dirs.length > 2) { const c = dirs.reduce((u, v) => ({ x: u.x + v.x, y: u.y + v.y, z: u.z + v.z }), { x: 0, y: 0, z: 0 }); spreadSamples.push(Math.hypot(c.x, c.y, c.z) / dirs.length); }
    litCount.push(nl); moverLevel.push(nl ? ml / nl : 0); total.push(tot);
  }
  // does the light answer the beat? total light within 100 ms after a beat vs the quietest point before the next
  const beats = (wal.timing?.beats || a.beats || []).filter((b) => b < dur - 0.3);
  let punch = [], phase = [];
  for (let k = 0; k < beats.length - 1; k++) { const i0 = Math.round(beats[k] * FPS), i1 = Math.round(beats[k + 1] * FPS); if (i1 >= N || i1 - i0 < 3) continue; const on = Math.max(total[i0], total[i0 + 1] || 0, total[i0 + 2] || 0), off = Math.min(...total.slice(i0 + 1, i1)); punch.push(on > 1e-3 ? (on - off) / on : 0); }
  // 1 - ratio of intensity swing on beats to the overall mean: small = flat wall
  const env = (wal.envelopes?.energy || []).map((v) => v / 100), envRate = wal.envelopes?.rate || 20;
  const envR = []; for (let i = 0; i < N; i++) envR.push(env[Math.min(env.length - 1, Math.round((i / FPS) * envRate))] ?? 0);
  const onsets = (a.onsets?.low || []).filter(([t, s]) => s > 0.6 && t < dur - 0.3);
  let answered = 0;
  for (const [t] of onsets) { const i = Math.round(t * FPS); const before = mean(total.slice(Math.max(0, i - 3), i)), after = Math.max(...total.slice(i, i + 3)); if (after > before * 1.15 + 0.2) answered++; onsetFrames++; }
  let bAns = 0; for (const [t] of onsets) { const i = Math.round(t * FPS); const before = mean(beamTot.slice(Math.max(0, i - 3), i)), after = Math.max(...beamTot.slice(i, i + 3)); if (after > before * 1.15 + 0.1) bAns++; }
  const bp = (x, q) => pct(x, q) || 0.05;
  const secRows = wal.sections.filter((s) => s.start < dur).map((s) => { const i0 = Math.floor(s.start * FPS), i1 = Math.min(N, Math.floor(s.end * FPS)); return { e: s.energy, light: mean(total.slice(i0, i1)), dist: mean(litCount.slice(i0, i1)) }; });
  const looks = new Set(wal.cues.filter((c) => c.layer === 'beam' && c.move && !c.group).map((c) => c.move.look)), nBeamCues = wal.cues.filter((c) => c.layer === 'beam' && c.move && !c.group).length;
  const hueEntropy = (() => { const s = hueBins.reduce((x, y) => x + y, 0) || 1; return -hueBins.reduce((e, v) => (v ? e + (v / s) * Math.log2(v / s) : e), 0); })();
  const topHue = Math.max(...hueBins) / (hueBins.reduce((x, y) => x + y, 0) || 1);
  const sectionHues = Object.values(hueSection).map((b) => b.indexOf(Math.max(...b)));
  const stillShare = mean(movers.map((m) => (lit[m] ? still[m] / lit[m] : 1)));
  const neverMove = movers.filter((m) => travel[m] / N < 4).length;
  const totalP = pct(total, 0.95) || 1, high = total.filter((v) => v > 0.8 * totalP).length / N;
  rows.push({
    id, song: wal.meta.title.slice(0, 26), bpm: Math.round(wal.meta.bpm), secs: wal.sections.length, phrases: (wal.phrases || []).length, lyrics: existsSync(join(d, 'lyrics.txt')) ? 'yes' : 'no',
    beamLit: +mean(litCount).toFixed(1), movers: movers.length, stillPct: Math.round(100 * stillShare), neverMove, deg_s: Math.round(mean(movers.map((m) => travel[m] / N))),
    hues: +hueEntropy.toFixed(2), topHuePct: Math.round(100 * topHue), whitePct: Math.round(100 * whiteFrames / (whiteFrames + colourFrames || 1)), hueChanges: new Set(sectionHues).size,
    bundle: +mean(spreadSamples).toFixed(2), beatPunch: +mean(punch).toFixed(2), onsetHit: Math.round(100 * answered / (onsetFrames || 1)), nOnsets: onsetFrames,
    envCorr: +corr(total, envR).toFixed(2), secCorr: +corr(secRows.map((r) => r.e), secRows.map((r) => r.light)).toFixed(2), beamOnset: Math.round(100 * bAns / (onsetFrames || 1)), beamRange: +(bp(beamTot, 0.9) / bp(beamTot, 0.1)).toFixed(1), beamDark: Math.round(100 * beamTot.filter((v) => v < 0.15 * bp(beamTot, 0.97)).length / N), range: +(pct(total, 0.9) / (pct(total, 0.1) || 0.1)).toFixed(1), nearMax: Math.round(100 * high),
    looks: looks.size, beamCues: nBeamCues, avgLookSec: +(dur / Math.max(1, nBeamCues)).toFixed(1),
  });
}
console.log(`rig: ${rigName}  (${rig.fixtures.length} fixtures)`);
console.table(rows);
const keys = ['beamLit', 'stillPct', 'neverMove', 'deg_s', 'hues', 'topHuePct', 'whitePct', 'bundle', 'beatPunch', 'onsetHit', 'envCorr', 'secCorr', 'beamOnset', 'beamRange', 'beamDark', 'range', 'nearMax', 'looks', 'avgLookSec'];
console.log('MEAN', Object.fromEntries(keys.map((k) => [k, +mean(rows.map((r) => r[k])).toFixed(2)])));
const out = process.argv.indexOf('--json'); if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(rows, null, 1));
