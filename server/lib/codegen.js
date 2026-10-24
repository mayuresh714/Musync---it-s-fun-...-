// The code-only engine: audio -> analysis -> choreography -> WAL, with no AI call. Takes seconds, works offline,
// costs nothing. It has no idea what the words mean, so sections come from the analyzer and the refrain / line /
// tagline structure is inferred from repeated groups; the AI director does that from the lyrics instead.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { analyze, draftWal, validateWal, TARGET_SR } from '../../core/index.js';
import { fixTempo } from '../../core/analysis/grid.js';
import { STYLES } from '../../core/wal/vocab.js';
import { decodeAudio } from './director.js';
import { cleanName } from './lyrics.js';

export async function directCode({ audioPath, filename, title, artist, style, dir, emit = () => {} }) {
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  emit({ stage: 'decode', detail: 'Reading the audio' });
  const samples = decodeAudio(audioPath);
  emit({ stage: 'analyze', detail: 'Measuring tempo, beats, energy and bands' });
  let a = analyze(samples, TARGET_SR, { meter: 4 });
  a = fixTempo(a, 'auto');
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(a));
  emit({ stage: 'analyze', done: true, data: { bpm: a.bpm, duration: a.duration, key: a.key, tempoNote: a.tempoNote } });
  emit({ stage: 'cues', detail: 'Choreographing every layer from the structure of the song' });
  const styles = [STYLES[style] ? style : 'bollywood'];
  const name = title || cleanName(filename);
  const wal = draftWal(a, {
    title: name, ...(artist ? { artist } : {}), styles,
    audio: { file: filename, sha256: createHash('sha256').update(readFileSync(audioPath)).digest('hex'), duration: a.duration },
    generator: 'musync-code/0.2 (no AI)',
  });
  emit({ stage: 'validate', detail: 'Checking the show against the format' });
  const v = validateWal(wal);
  if (!v.ok) throw new Error(`The WAL did not validate: ${v.errors.slice(0, 3).join('; ')}`);
  writeFileSync(join(dir, 'song.wal.json'), JSON.stringify(wal));
  const report = {
    title: name, artist: artist || '', bpm: wal.meta.bpm, duration: wal.meta.duration, styles, mood: '', language: '', phrases: wal.phrases.length,
    sections: wal.sections.length, cues: wal.cues.length, accents: wal.accents.length, understanding: {}, moments: [], lyrics: null, tempoNote: a.tempoNote,
    warnings: [...v.warnings, 'Made by the code engine: no lyrics were read, so the lights follow the sound and the repeat structure only.'],
    timings: { totalMs: Date.now() - t0 }, claude: [], costUsd: 0, engine: 'code', ext: extname(filename), sha256: wal.meta.audio.sha256,
  };
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 1));
  emit({ stage: 'done', done: true, data: report });
  return { wal, report };
}
