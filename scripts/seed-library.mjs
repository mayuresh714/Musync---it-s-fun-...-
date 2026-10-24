#!/usr/bin/env node
// Fills a backend data folder with N fake finished songs so the library UI can be tested at scale.
//   node scripts/seed-library.mjs [--count 1000] [--out .musync/seed]
// Then:  MUSYNC_DATA=.musync/seed npm run dev
// Every song points (by symlink) at one of the bundled demo shows, so nothing is copied.
import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const COUNT = Number(opt('count', 1000));
const OUT = resolve(ROOT, opt('out', '.musync/seed'));
const SONGS = join(ROOT, 'sim/public/songs');
const bases = [['demo.wal.json', 'demo.wav'], ['demo-dandiya.wal.json', 'demo-dandiya.wav']];

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const A = ['Tera', 'Mera', 'Dil', 'Raat', 'Chand', 'Pehla', 'Ek', 'Sanam', 'Zindagi', 'Ishq', 'Baarish', 'Mahi', 'Rang', 'Naina', 'Tujhe', 'Kesariya', 'Gulaal', 'Ghoomar', 'Dhol', 'Garba', 'Navratri', 'Maza', 'Kadava', 'Aai', 'Majha', 'Pyaar', 'Sapna', 'Teri', 'Khwaab', 'Safar', 'Midnight', 'Neon', 'Electric', 'Summer', 'Golden', 'Fire', 'Gravity', 'Echo', 'Velvet', 'Thunder', 'Satrangi', 'Bholenath', 'Ganpati'];
const B = ['Jaadu', 'Kahani', 'Yaadein', 'Raatein', 'Deewana', 'Mastana', 'Shaam', 'Mohabbat', 'Dilbar', 'Saathiya', 'Tamasha', 'Jashn', 'Aarti', 'Mantra', 'Dreams', 'Lights', 'Heartbeat', 'Rain', 'Skyline', 'Rhythm', 'Wave', 'Pulse', 'Anthem', 'Tune', 'Khel', 'Nasha', 'Mela', 'Utsav', 'Baraat', 'Sangeet'];
const ARTISTS = ['Arijit Singh', 'Shreya Ghoshal', 'Sunidhi Chauhan', 'Badshah', 'Diljit Dosanjh', 'AP Dhillon', 'Neha Kakkar', 'Atif Aslam', 'Kishore Kumar', 'Lata Mangeshkar', 'Ajay-Atul', 'Shankar Mahadevan', 'Jubin Nautiyal', 'Prateek Kuhad', 'Darshan Raval', 'Falguni Pathak', 'Kinjal Dave', 'Vishal-Shekhar', 'Pritam', 'A. R. Rahman', 'The Local Train', 'Raftaar', 'Mohit Chauhan', ''];
const LANG = ['Hindi', 'Hindi', 'Hindi', 'Punjabi', 'Marathi', 'Gujarati', 'English', 'Hindi and English', 'Punjabi and English', 'Tamil'];
const STYLES = ['bollywood', 'edm', 'dandiya', 'concert', 'wedding', 'romantic', 'devotional'];
const MOOD = ['swagger and heat', 'tender longing', 'festival joy', 'late-night drive', 'devotional calm', 'defiant celebration', 'wistful romance', 'party anthem'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (let i = 0; i < COUNT; i++) {
  const id = (i + 1).toString(16).padStart(16, '0');
  const dir = join(OUT, id);
  mkdirSync(dir);
  const [wal, wav] = bases[i % bases.length];
  const title = `${pick(A)} ${pick(B)}${rnd() < 0.2 ? ` ${pick(['Remix', 'Reprise', '(Lofi)', 'Part 2'])}` : ''}`;
  const artist = pick(ARTISTS);
  const created = new Date(Date.now() - i * 3600e3 * (1 + rnd() * 6)).toISOString();
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id, filename: `${title}.wav`, title, artist, created, audio: 'audio.wav' }));
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ title, artist, bpm: 70 + Math.round(rnd() * 90), duration: 150 + Math.round(rnd() * 150), styles: [pick(STYLES)], mood: pick(MOOD), language: pick(LANG), costUsd: 0.2, sha256: `seed-${i}` }));
  symlinkSync(join(SONGS, wal), join(dir, 'song.wal.json'));
  symlinkSync(join(SONGS, wav), join(dir, 'audio.wav'));
}
console.log(`seeded ${COUNT} songs in ${OUT}\nrun:  MUSYNC_DATA=${OUT} npm run dev`);
