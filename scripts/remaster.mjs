#!/usr/bin/env node
// Re-choreograph every auto-made WAL in the library and the bundled demos with the current engine (no audio, no AI).
// The old file is kept next to it as song.wal.v1.json (jobs) or *.v1.json (demos). Run with --dry to only report.
import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remasterWal, needsRemaster, validateWal } from '../core/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dry = process.argv.includes('--dry');
const targets = [];
const jobs = process.env.MUSYNC_DATA || join(root, '.musync', 'jobs');
if (existsSync(jobs)) for (const id of readdirSync(jobs)) targets.push(join(jobs, id, 'song.wal.json'));
const demos = join(root, 'sim', 'public', 'songs');
if (existsSync(demos)) for (const f of readdirSync(demos)) if (f.endsWith('.wal.json')) targets.push(join(demos, f));
let n = 0;
for (const f of targets) {
  if (!existsSync(f)) continue;
  let wal; try { wal = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (!needsRemaster(wal)) continue;
  const next = remasterWal(wal), v = validateWal(next);
  if (!v.ok) { console.log(`skip ${wal.meta.title}: ${v.errors[0]}`); continue; }
  console.log(`${dry ? 'would remaster' : 'remastered'} ${wal.meta.title.slice(0, 50)}: ${wal.cues.length} -> ${next.cues.length} cues`);
  if (!dry) { copyFileSync(f, f.replace(/\.json$/, '.v1.json')); writeFileSync(f, JSON.stringify(next)); }
  n++;
}
console.log(`${n} show${n === 1 ? '' : 's'} ${dry ? 'need' : 'brought up to'} the current choreography`);
