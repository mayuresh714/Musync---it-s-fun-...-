import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { synthSong } from './synth.js';
import { analyze, draftWal, validateWal, createDecoder } from '../core/index.js';

const song = synthSong();
const analysis = analyze(song.samples, song.sr);
const rigsDir = new URL('../sim/public/rigs/', import.meta.url);
const rigs = Object.fromEntries(readdirSync(rigsDir).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, rigsDir)))]));

test('tempo within 1% of truth', () => {
  assert.ok(Math.abs(analysis.bpm - song.truth.bpm) / song.truth.bpm < 0.01, `bpm ${analysis.bpm}`);
});

test('downbeats land on true bar starts (within 60 ms)', () => {
  const near = analysis.downbeats.filter((d) => song.truth.downbeats.some((t) => Math.abs(t - d) < 0.06)).length;
  assert.ok(near / analysis.downbeats.length > 0.9, `${near}/${analysis.downbeats.length}`);
});

test('section boundaries found within one bar', () => {
  const bar = (60 / song.truth.bpm) * 4;
  const truth = song.truth.sections.slice(1).map((s) => s.start);
  const found = analysis.sections.map((s) => s.start);
  const hit = truth.filter((t) => found.some((f) => Math.abs(f - t) < bar)).length;
  assert.ok(hit >= truth.length - 1, `${hit}/${truth.length} boundaries`);
});

test('both drops and the pre-drop silences are detected', () => {
  const truthDrops = song.truth.sections.filter((s) => s.kind === 'drop').map((s) => s.start);
  const drops = analysis.accents.filter((a) => a.type === 'drop').map((a) => a.t);
  for (const t of truthDrops) assert.ok(drops.some((d) => Math.abs(d - t) < 1), `drop at ${t}`);
  const sil = analysis.accents.filter((a) => a.type === 'silence');
  for (const s of song.truth.sections.filter((x) => x.silenceAt)) assert.ok(sil.some((a) => Math.abs(a.t - s.silenceAt) < 0.2), `silence at ${s.silenceAt}`);
});

test('drafted WAL is valid for every style', () => {
  for (const style of ['edm', 'bollywood', 'dandiya', 'concert', 'devotional', 'wedding', 'romantic']) {
    const v = validateWal(draftWal(analysis, { title: 't', styles: [style] }));
    assert.ok(v.ok, `${style}: ${v.errors.join('; ')}`);
  }
});

test('calm styles never strobe', () => {
  const wal = draftWal(analysis, { styles: ['devotional'] });
  assert.ok(!wal.cues.some((c) => c.dim?.look === 'strobe'));
});

test('validator rejects bad WALs', () => {
  const wal = draftWal(analysis, { title: 't' });
  assert.equal(validateWal({ ...wal, wal: '2.0' }).ok, false);
  assert.equal(validateWal({ ...wal, cues: [{ t: 1, layer: 'beam', move: { look: 'moonwalk' } }] }).ok, false);
  const gap = structuredClone(wal);
  gap.sections[1].start += 3;
  assert.equal(validateWal(gap).ok, false);
});

test('decoder plays the same WAL on every rig with sane values', () => {
  const wal = draftWal(analysis, { title: 't', styles: ['dandiya'] });
  for (const [name, rig] of Object.entries(rigs)) {
    const dec = createDecoder(wal, rig);
    for (let t = 0; t < wal.meta.duration; t += 0.37) {
      for (const [id, s] of Object.entries(dec.frame(t))) {
        const vals = [s.dim, ...s.rgb, s.pan ?? 0, s.tilt ?? 0, ...(s.pixels || []).flat()];
        assert.ok(vals.every(Number.isFinite), `${name} ${id} @${t}`);
        assert.ok(s.dim >= 0 && s.dim <= 1, `${name} ${id} dim ${s.dim}`);
        if (s.tilt != null) assert.ok(Math.abs(s.pan) <= 270 && s.tilt >= 0, `${name} ${id} pan/tilt out of range`);
      }
    }
  }
});

test('missing layers fall back on a single-beam rig', () => {
  const wal = draftWal(analysis, { title: 't' });
  const dec = createDecoder(wal, rigs['single-sharpy']);
  assert.deepEqual(dec.report.present, ['beam']);
  assert.equal(dec.report.fallbacks.wash, 'beam');
  assert.ok(dec.report.dropped.includes('strobe'));
  const drop = analysis.sections.find((s) => s.kind === 'drop');
  assert.ok(dec.frame(drop.start + 0.05).B1.dim > 0.5, 'beam is up on the drop');
});

test('silence accent blacks the rig out', () => {
  const wal = draftWal(analysis, { title: 't' });
  const sil = wal.accents.find((a) => a.type === 'silence');
  const st = createDecoder(wal, rigs.concert).frame(sil.t + sil.dur / 2);
  assert.ok(Object.values(st).every((s) => s.dim === 0 || (s.pixels && s.pixels.flat().every((v) => v === 0))));
});

test('decoding is deterministic', () => {
  const wal = draftWal(analysis, { title: 't' });
  const a = createDecoder(wal, rigs.concert).frame(70.3);
  const b = createDecoder(wal, rigs.concert).frame(70.3);
  assert.deepEqual(a, b);
});
