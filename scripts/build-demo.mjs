#!/usr/bin/env node
// Prepares the copyright-free demo library for a hosted build (Vercel): synthesises the demo track, publishes it, and
// adds the dandiya-style version of it (the same synthetic audio under a different show). Then `npm run build` bundles
// everything in sim/public. Nothing from anyone's own library is involved: the repository holds no commercial audio.
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const songs = `${root}sim/public/songs`;
const run = spawnSync(process.execPath, [`${root}bin/wal.mjs`, 'demo'], { cwd: root, stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status || 1);

const index = JSON.parse(readFileSync(`${songs}/index.json`, 'utf8')).filter((e) => e.id === 'demo');
if (existsSync(`${songs}/demo-dandiya.wal.json`)) {
  copyFileSync(`${songs}/demo.wav`, `${songs}/demo-dandiya.wav`);
  const m = JSON.parse(readFileSync(`${songs}/demo-dandiya.wal.json`, 'utf8')).meta;
  index.push({ id: 'demo-dandiya', title: m.title, artist: m.artist || 'musync', wal: 'demo-dandiya.wal.json', audio: 'demo-dandiya.wav', bpm: Math.round(m.bpm), duration: m.duration, styles: m.styles || [], mood: m.mood || '', language: m.language || '', created: new Date().toISOString(), source: 'demo' });
}
writeFileSync(`${songs}/index.json`, JSON.stringify(index, null, 1));
console.log(`demo library ready: ${index.map((e) => e.title).join(', ')}`);
