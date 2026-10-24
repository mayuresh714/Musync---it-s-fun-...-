#!/usr/bin/env node
// Give a song a lyric score: attach an image (fire, water, embrace...) to its phrases from a hand-written score file
// (scripts/scores/*.json: { reading, images: [[phrase start, image], ...] }) and re-choreograph it from its own structure.
// The previous show is kept beside it as song.wal.prev.json.
//   node scripts/score.mjs "Aaj Ki Raat" scripts/scores/aaj-ki-raat.json
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remasterWal, validateWal } from '../core/index.js';
import { IMAGES } from '../core/wal/vocab.js';

const [pick, scoreFile] = process.argv.slice(2);
const root = fileURLToPath(new URL('../.musync/jobs/', import.meta.url));
const score = JSON.parse(readFileSync(scoreFile, 'utf8'));
let dir = null, wal = null;
for (const id of readdirSync(root)) {
  const f = join(root, id, 'song.wal.json');
  if (!existsSync(f)) continue;
  const w = JSON.parse(readFileSync(f, 'utf8'));
  if (w.meta.title.toLowerCase().includes(pick.toLowerCase())) { dir = join(root, id); wal = w; break; }
}
if (!wal) { console.error(`no song matches "${pick}"`); process.exit(2); }
let hit = 0;
for (const p of wal.phrases) delete p.image;
for (const [t, image] of score.images) {
  if (!IMAGES[image]) { console.error(`unknown image "${image}"`); process.exit(2); }
  const p = wal.phrases.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b));
  if (Math.abs(p.t - t) > 0.4) { console.error(`no phrase near ${t}s`); continue; }
  p.image = image; hit++;
}
const next = remasterWal(wal);
if (score.reading && !String(next.meta.notes || '').includes('Lyric reading')) next.meta.notes = `${next.meta.notes || ''}\n\n${score.reading}`.trim();
const v = validateWal(next);
if (!v.ok) { console.error(v.errors.slice(0, 8)); process.exit(1); }
copyFileSync(join(dir, 'song.wal.json'), join(dir, 'song.wal.prev.json'));
writeFileSync(join(dir, 'song.wal.json'), JSON.stringify(next));
console.log(`${wal.meta.title}: ${hit}/${score.images.length} phrases carry an image, ${next.cues.length} cues, valid`);
