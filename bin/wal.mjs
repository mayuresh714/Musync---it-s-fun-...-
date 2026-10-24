#!/usr/bin/env node
// wal — Musync command line: audio -> analysis -> WAL, validation, summaries, previews.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, draftWal, validateWal, summarize, createDecoder, WAL_SCHEMA, TARGET_SR } from '../core/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `wal — Musync WAL tools

  wal build <audio> --id <song-id> [--title T] [--artist A] [--style dandiya,bollywood] [--mood M] [--meter 4]
        analyze + draft into songs/<id>/ (analysis.json, song.wal.json, summary.txt)
  wal analyze <audio> [-o analysis.json] [--meter 4]
  wal draft <analysis.json> [-o song.wal.json] [--title ...] [--style ...]
  wal validate <song.wal.json>
  wal summary <analysis.json|song.wal.json>
  wal preview <song.wal.json> [--rig rig.json] [--at 12.5,60] [--every 4]
        decode on a rig and print what each fixture does (text check, no 3D)
  wal direct <audio> --id <song-id> [--title T] [--artist A] [--style S] [--lyrics file.txt] [--notes "..."] [--model sonnet|opus]
        AI director: Claude reads the song's measurements and lyrics and writes the show (needs the claude CLI)
  wal publish <song-id> [--audio <file>]
        copy songs/<id>/song.wal.json (and optionally the audio) into the simulator
  wal schema [-o docs/wal.schema.json]
  wal demo
        synthesize the copyright-free demo track and publish it to the simulator
`;

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') opt.o = argv[++i];
    else if (a.startsWith('--')) { const k = a.slice(2); opt[k] = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true; }
    else pos.push(a);
  }
  return { pos, opt };
}

export function decodeAudio(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(TARGET_SR), '-'], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`ffmpeg not available: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString()}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, obj) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(obj, null, 1) + '\n'); };

function runAnalyze(file, opt) {
  const t0 = Date.now();
  const samples = decodeAudio(file);
  const a = analyze(samples, TARGET_SR, { meter: Number(opt.meter) || 4 });
  console.error(`analyzed ${basename(file)}: ${a.duration}s, ${a.bpm} bpm, ${a.sections.length} sections in ${Date.now() - t0} ms`);
  return a;
}

function draftOpts(opt, audioFile, analysis) {
  return {
    title: opt.title || (audioFile ? basename(audioFile, extname(audioFile)) : 'Untitled'),
    artist: opt.artist,
    styles: opt.style ? String(opt.style).split(',') : undefined,
    mood: opt.mood,
    audio: audioFile ? { file: basename(audioFile), sha256: sha256(audioFile), duration: analysis.duration } : undefined,
  };
}

function report(v) {
  for (const w of v.warnings) console.error(`warn: ${w}`);
  for (const e of v.errors) console.error(`error: ${e}`);
  console.error(v.ok ? 'WAL valid' : `WAL invalid (${v.errors.length} errors)`);
}

const DEFAULT_RIG = join(ROOT, 'sim/public/rigs/concert.json');

const cmds = {
  analyze({ pos, opt }) {
    const a = runAnalyze(pos[0], opt);
    if (opt.o) writeJson(opt.o, a); else console.log(JSON.stringify(a));
  },
  draft({ pos, opt }) {
    const a = readJson(pos[0]);
    const wal = draftWal(a, draftOpts(opt, null, a));
    report(validateWal(wal));
    if (opt.o) writeJson(opt.o, wal); else console.log(JSON.stringify(wal));
  },
  build({ pos, opt }) {
    const file = pos[0];
    const id = opt.id || basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dir = join(ROOT, 'songs', id);
    const a = runAnalyze(file, opt);
    const wal = draftWal(a, draftOpts(opt, file, a));
    writeJson(join(dir, 'analysis.json'), a);
    writeJson(join(dir, 'song.wal.json'), wal);
    writeFileSync(join(dir, 'summary.txt'), summarize(a) + '\n');
    report(validateWal(wal));
    console.log(`songs/${id}/  analysis.json  song.wal.json  summary.txt`);
    console.log(summarize(a));
  },
  validate({ pos }) {
    const v = validateWal(readJson(pos[0]));
    report(v);
    process.exitCode = v.ok ? 0 : 1;
  },
  summary({ pos }) { console.log(summarize(readJson(pos[0]))); },
  preview({ pos, opt }) {
    const wal = readJson(pos[0]);
    const rig = readJson(opt.rig || DEFAULT_RIG);
    const dec = createDecoder(wal, rig);
    console.log(`rig: ${rig.name || 'rig'} — layers ${dec.report.present.join(', ')}`);
    if (Object.keys(dec.report.fallbacks).length) console.log(`fallbacks: ${Object.entries(dec.report.fallbacks).map(([a, b]) => `${a}->${b}`).join(', ')}`);
    if (dec.report.dropped.length) console.log(`no fixture for: ${dec.report.dropped.join(', ')}`);
    const times = opt.at ? String(opt.at).split(',').map(Number) : wal.sections.map((s) => +(s.start + Math.min(2, (s.end - s.start) / 2)).toFixed(2));
    for (const t of times) {
      const st = dec.frame(t);
      const sec = dec.sectionAt(t);
      console.log(`\n@ ${t}s  [${sec.id} ${sec.kind} e${sec.energy}]`);
      const byRole = {};
      for (const [id, s] of Object.entries(st)) (byRole[s.role] ||= []).push([id, s]);
      for (const [role, list] of Object.entries(byRole)) {
        const fmt = ([id, s]) => {
          if (s.pixels) { const lit = s.pixels.filter((p) => Math.max(...p) > 0.2).length; return `${id} ${lit}/${s.pixels.length}px lit`; }
          const hex = '#' + s.rgb.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0')).join('');
          return `${id} ${(s.dim * 100).toFixed(0)}% ${hex}${s.pan != null ? ` p${s.pan.toFixed(0)} t${s.tilt.toFixed(0)}` : ''}`;
        };
        console.log(`  ${role.padEnd(7)} ${list.map(fmt).join(' | ')}`);
      }
    }
  },
  async direct({ pos, opt }) {
    const { direct } = await import('../server/lib/director.js');
    const file = resolve(pos[0]);
    const id = opt.id || basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const dir = join(ROOT, 'songs', id);
    const t0 = Date.now();
    let last = '';
    const { wal, report } = await direct({
      audioPath: file, filename: basename(file), title: opt.title, artist: opt.artist, style: opt.style, notes: opt.notes, model: opt.model, dir,
      lyricsText: opt.lyrics ? readFileSync(opt.lyrics, 'utf8') : undefined,
      emit: (e) => {
        const line = e.done ? `${e.stage} done` : e.detail ? `${e.stage}: ${e.detail}` : null;
        if (line && line !== last) { last = line; console.error(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ${line}`); }
      },
    });
    console.log(summarize(wal));
    console.log(`\nstory: ${report.understanding.story}\nwarnings: ${report.warnings.length ? '\n  - ' + report.warnings.join('\n  - ') : 'none'}\ncost: $${report.costUsd}  time: ${(report.timings.totalMs / 1000).toFixed(0)}s\nsongs/${id}/song.wal.json`);
  },
  publish({ pos, opt }) {
    const id = pos[0];
    const src = join(ROOT, 'songs', id, 'song.wal.json');
    if (!existsSync(src)) throw new Error(`no ${src}`);
    const outDir = join(ROOT, 'sim/public/songs');
    mkdirSync(outDir, { recursive: true });
    copyFileSync(src, join(outDir, `${id}.wal.json`));
    let audio = null;
    if (opt.audio) { audio = `${id}${extname(opt.audio)}`; copyFileSync(opt.audio, join(outDir, audio)); }
    const idxFile = join(outDir, 'index.json');
    const idx = existsSync(idxFile) ? readJson(idxFile) : [];
    const wal = readJson(src);
    const entry = { id, title: wal.meta.title, artist: wal.meta.artist, bpm: Math.round(wal.meta.bpm), duration: wal.meta.duration, styles: wal.meta.styles || [], mood: wal.meta.mood || '', language: wal.meta.language || '', created: wal.meta.created, source: 'demo', wal: `${id}.wal.json`, audio: audio || idx.find((e) => e.id === id)?.audio || null };
    writeJson(idxFile, [...idx.filter((e) => e.id !== id), entry]);
    console.log(`published ${id} -> sim/public/songs/ (${audio ? 'with audio' : 'WAL only; load the audio file in the simulator'})`);
  },
  schema({ opt }) {
    const out = opt.o || join(ROOT, 'docs/wal.schema.json');
    writeJson(out, WAL_SCHEMA);
    console.log(`wrote ${out}`);
  },
  async demo() {
    const { synthSong, encodeWav } = await import('../test/synth.js');
    const s = synthSong();
    const dir = join(ROOT, 'songs/demo');
    mkdirSync(dir, { recursive: true });
    const wav = join(dir, 'demo.wav');
    writeFileSync(wav, encodeWav(s.samples, s.sr));
    const a = analyze(s.samples, s.sr);
    const wal = draftWal(a, { title: 'Musync Demo (synthetic)', artist: 'musync', styles: ['edm'], audio: { file: 'demo.wav', sha256: sha256(wav), duration: a.duration } });
    writeJson(join(dir, 'analysis.json'), a);
    writeJson(join(dir, 'song.wal.json'), wal);
    report(validateWal(wal));
    cmds.publish({ pos: ['demo'], opt: { audio: wav } });
  },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !cmds[cmd]) { console.log(USAGE); process.exit(cmd ? 1 : 0); }
try { await cmds[cmd](parseArgs(rest)); }
catch (e) { console.error(`wal ${cmd}: ${e.message}`); process.exit(1); }
