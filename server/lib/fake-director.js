// A stand-in for the Claude director used by tests (MUSYNC_FAKE_DIRECTOR=1): same events, same files,
// no model call. It reuses the demo show so the result plays.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DEMO = resolve(dirname(fileURLToPath(import.meta.url)), '../../sim/public/songs/demo.wal.json');
const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Cancelled')); }); });

export async function fakeDirect({ audioPath, filename, title, artist, engine, dir, signal, emit = () => {} }) {
  mkdirSync(dir, { recursive: true });
  for (const [stage, detail] of [['decode', 'Reading the audio'], ['analyze', 'Measuring tempo, beats, energy and bands'], ['lyrics', 'Looking up the lyrics'], ['research', 'Looking up the song'], ['bible', 'The director is listening'], ['cues', 'Writing the cue sheet'], ['validate', 'Checking the show']]) {
    emit({ stage, detail }); await sleep(Number(process.env.MUSYNC_FAKE_MS || 250), signal);
  }
  if (/fail/i.test(filename)) throw new Error('The fake director was asked to fail.');
  const wal = JSON.parse(readFileSync(DEMO, 'utf8'));
  const name = title || filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  wal.meta.title = name; if (artist) wal.meta.artist = artist;
  const sha = createHash('sha256').update(readFileSync(audioPath)).digest('hex');
  wal.meta.audio = { file: filename, sha256: sha, duration: wal.meta.duration };
  writeFileSync(join(dir, 'song.wal.json'), JSON.stringify(wal));
  const report = { title: name, artist: artist || '', bpm: wal.meta.bpm, duration: wal.meta.duration, styles: ['bollywood'], mood: 'test', language: 'English', sections: wal.sections.length, cues: wal.cues.length, accents: wal.accents.length, costUsd: 0, engine: engine || 'ai', sha256: sha, warnings: [], understanding: {} };
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
  emit({ stage: 'done', done: true, data: report });
  return { wal, report };
}
