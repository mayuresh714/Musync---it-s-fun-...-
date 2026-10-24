// Re-run the AI director on songs already in the library, from the audio kept on disk (so the newest prompt, with
// imagery, research and lyrics, applies), one at a time. The old show is replaced when the new one finishes.
// usage: node scripts/rerun-director.mjs [--only 68b5,e1356] [--skip ec03] [--server http://localhost:5173]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : process.argv[i + 1]; };
const server = arg('server') || 'http://localhost:5173';
const only = (arg('only') || '').split(',').filter(Boolean), skip = (arg('skip') || '').split(',').filter(Boolean);
const root = fileURLToPath(new URL('../.musync/jobs/', import.meta.url));
const lib = await (await fetch(`${server}/api/library`)).json();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const e of lib) {
  if ((only.length && !only.some((p) => e.id.startsWith(p))) || skip.some((p) => e.id.startsWith(p))) continue;
  const dir = join(root, e.id), audio = existsSync(dir) && readdirSync(dir).find((f) => /^audio\./.test(f));
  if (!audio) { console.log(`skip ${e.title.slice(0, 40)}: no audio on disk`); continue; }
  const fd = new FormData();
  fd.set('file', new Blob([readFileSync(join(dir, audio))]), audio);
  fd.set('replace', e.id); fd.set('engine', 'ai'); fd.set('title', e.title); fd.set('artist', e.artist || ''); if (e.style) fd.set('style', e.style);
  if (existsSync(join(dir, 'lyrics.txt'))) fd.set('lyrics', readFileSync(join(dir, 'lyrics.txt'), 'utf8'));
  const r = await fetch(`${server}/api/jobs`, { method: 'POST', body: fd }), j = await r.json();
  if (!j.id || j.duplicate) { console.log(`not started ${e.title.slice(0, 40)}:`, JSON.stringify(j).slice(0, 120)); continue; }
  console.log(`started ${e.title.slice(0, 40)} -> ${j.id}`);
  for (;;) { await wait(20000); const all = await (await fetch(`${server}/api/jobs`)).json(); const me = (all.jobs || all).find((x) => x.id === j.id); if (!me || !['queued', 'running'].includes(me.status)) { console.log(`  ${me?.status || 'gone'} ${me?.error || ''}`); break; } }
}
