// How different are the shows? Re-choreographs every onboarded song and reports how many distinct figures each
// uses, how much each leans on its favourite, and how alike pairs of songs are (shared moves in the same order).
// usage: node scripts/variety.mjs [--old]   (--old reads the cues already stored in each WAL instead)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choreograph, autoPhrases } from '../core/choreo/choreograph.js';
import { PALETTES } from '../core/wal/vocab.js';

const root = fileURLToPath(new URL('../.musync/jobs/', import.meta.url));
const OLD = process.argv.includes('--old');
const songs = [];
for (const id of readdirSync(root)) {
  const d = join(root, id);
  if (!existsSync(join(d, 'song.wal.json')) || !existsSync(join(d, 'analysis.json'))) continue;
  const wal = JSON.parse(readFileSync(join(d, 'song.wal.json'), 'utf8'));
  const a = JSON.parse(readFileSync(join(d, 'analysis.json'), 'utf8'));
  const styles = wal.meta.styles || ['bollywood'];
  const pal = { ...PALETTES, ...(wal.palettes || {}) };
  const cues = OLD ? wal.cues : choreograph({ sections: wal.sections, phrases: wal.phrases?.length ? wal.phrases : autoPhrases(wal.sections, a, a.accents), analysis: a, palettes: pal, style: styles[0], styles, title: wal.meta.title });
  songs.push({ id, title: wal.meta.title.slice(0, 28), styles, cues });
}
const seqOf = (cues, layer = 'beam') => cues.filter((c) => c.layer === layer && c.move && !c.group).sort((x, y) => x.t - y.t).map((c) => c.move.look);
const bigrams = (s) => new Set(s.slice(1).map((v, i) => `${s[i]}>${v}`));
const jac = (A, B) => { const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };
let rows = [];
for (const s of songs) {
  const seq = seqOf(s.cues), count = {};
  for (const v of seq) count[v] = (count[v] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const dims = new Set(s.cues.filter((c) => c.dim).map((c) => c.layer + ':' + c.dim.look)).size;
  rows.push({ title: s.title, style: s.styles[0], distinct: top.length, topShare: Math.round((top[0]?.[1] / seq.length) * 100), top3: top.slice(0, 3).map((t) => t[0]).join(' '), dimLooks: dims, cues: s.cues.length, bg: bigrams(seq) });
}
console.log(OLD ? 'STORED (old) cues' : 'NEW choreography');
console.table(rows.map(({ bg, ...r }) => r));
let sum = 0, k = 0, max = 0;
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) { const v = jac(rows[i].bg, rows[j].bg); sum += v; k++; max = Math.max(max, v); }
console.log(`mean similarity between songs (shared move transitions): ${(100 * sum / k).toFixed(1)}%   worst pair: ${(100 * max).toFixed(1)}%`);
