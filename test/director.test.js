import test from 'node:test';
import assert from 'node:assert/strict';
import { fixTempo, barProfile } from '../core/analysis/grid.js';
import { snapSections, cleanCues, overlay } from '../server/lib/merge.js';
import { extractJson } from '../server/lib/claude.js';
import { validateWal, draftWal } from '../core/index.js';

// A 130 BPM track whose beat tracker landed on half time (65 BPM) with onsets on every eighth.
function halfTimeAnalysis() {
  const dur = 60, period = 60 / 65;
  const beats = []; for (let t = 0.5; t < 50; t += period) beats.push(+t.toFixed(3));
  const onsets = []; for (let t = 0.5; t < dur; t += period / 2) onsets.push([+t.toFixed(3), 1]);
  const n = dur * 20;
  const env = Array.from({ length: n }, (_, i) => 20 + (i % 7));
  return { duration: dur, bpm: 65, meter: 4, key: 'A minor', beats, downbeats: beats.filter((_, i) => i % 4 === 0), onsets: { low: onsets, mid: [], high: [] },
    envelopes: { rate: 20, energy: env, low: env, mid: env, high: env }, sections: [], accents: [] };
}

test('fixTempo doubles a half-time grid and extends it to the end of the song', () => {
  const a = fixTempo(halfTimeAnalysis());
  assert.ok(Math.abs(a.bpm - 130) < 1, `bpm ${a.bpm}`);
  assert.ok(a.beats[a.beats.length - 1] > a.duration - 0.6, 'grid reaches the end');
  assert.ok(a.beats[0] < 0.5 + 1e-6 && a.beats[0] >= 0, 'grid reaches the start');
  assert.equal(a.downbeats.length, Math.ceil(a.beats.length / 4));
  assert.match(a.tempoNote, /doubled/);
});

test('fixTempo leaves a correct grid alone', () => {
  const a = halfTimeAnalysis();
  a.onsets.low = a.beats.map((t) => [t, 1]); // onsets only on the beats
  assert.ok(Math.abs(fixTempo(a).bpm - 65) < 1);
});

test('barProfile covers the song with 0-9 levels', () => {
  const a = fixTempo(halfTimeAnalysis());
  const bars = barProfile(a);
  assert.ok(bars.length > 20);
  for (const b of bars) for (const k of ['e', 'l', 'm', 'h']) assert.ok(b[k] >= 0 && b[k] <= 9);
  assert.ok(Math.abs(bars[bars.length - 1].end - a.duration) < 1e-6);
});

test('snapSections snaps to bars, closes gaps and merges slivers', () => {
  const a = fixTempo(halfTimeAnalysis());
  const warns = [];
  const s = snapSections([
    { start: 0, end: 10.2, kind: 'intro', palette: 'fire' },
    { start: 10.4, end: 10.9, kind: 'verse', palette: 'fire' }, // under a bar: merged
    { start: 11, end: 40, kind: 'nonsense', palette: 'nope' },
    { start: 40, end: 58, kind: 'drop', palette: 'fire' },
  ], a, ['fire'], (w) => warns.push(w));
  assert.equal(s[0].start, 0);
  assert.equal(s[s.length - 1].end, a.duration);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].start, s[i - 1].end);
  assert.ok(s.some((x) => x.kind === 'verse' && x.id), 'unknown kind falls back');
  assert.ok(warns.length >= 2);
});

test('cleanCues drops unknown looks/params, caps strobe and keeps valid intent', () => {
  const a = fixTempo(halfTimeAnalysis());
  const warns = [];
  const cues = cleanCues([
    { t: 5.01, layer: 'beam', move: { look: 'sweep', speed: 16, bogus: 1 }, dim: { look: 'pulse', on: 'beat', intensity: 4 }, color: { look: 'static', palette: 'fire', index: 1 } },
    { t: 7, layer: 'strobe', dim: { look: 'strobe', rate: 40 } },
    { t: 9, layer: 'pixel', move: { look: 'sweep' }, dim: { look: 'wobble' } },
    { t: 99, layer: 'beam', dim: { look: 'on' } },
    { t: 3, layer: 'toaster', dim: { look: 'on' } },
  ], { a, validPalettes: ['fire'], warn: (w) => warns.push(w) });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].move.bogus, undefined);
  assert.equal(cues[0].dim.intensity, 1);
  assert.equal(cues[1].dim.rate, 12);
  assert.ok(warns.length >= 3);
});

test('overlay replaces only what the override specifies, over its span', () => {
  const base = [{ t: 0, until: 20, layer: 'beam', move: { look: 'sweep', speed: 16 }, dim: { look: 'on', intensity: 0.5 }, color: { look: 'static', palette: 'fire', index: 0 } }];
  const out = overlay(base, [{ t: 8, until: 12, layer: 'beam', dim: { look: 'pulse', on: 'beat' } }, { t: 5, layer: 'all', fx: 'flash' }], [{ start: 0, end: 20 }], 20)
    .filter((c) => c.layer === 'beam');
  assert.equal(out.length, 3);
  assert.deepEqual([out[0].t, out[0].until, out[1].t, out[1].until, out[2].t], [0, 8, 8, 12, 12]);
  assert.equal(out[1].dim.look, 'pulse');
  assert.equal(out[1].move.look, 'sweep'); // inherited from the baseline
  assert.equal(out[0].dim.look, 'on');
});

test('extractJson finds an object in a fenced, chatty reply', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":{"b":"}"},"c":[1]}\n```\nDone'), { a: { b: '}' }, c: [1] });
  assert.throws(() => extractJson('{"a": '), /cut off/);
});

test('draftWal accepts director sections and custom palettes and still validates', () => {
  const a = fixTempo(halfTimeAnalysis());
  a.sections = [{ id: 's1', start: 0, end: 60, kind: 'verse', energy: 0.5, group: 'A' }];
  const wal = draftWal(a, { sections: [{ id: 's1', start: 0, end: 30, kind: 'intro', energy: 0.3, group: 'A', palette: 'ember', label: 'Opening' }, { id: 's2', start: 30, end: 60, kind: 'chorus', energy: 0.9, group: 'B', palette: 'fire' }], palettes: { ember: ['#ff3300', '#220000'] }, styles: ['bollywood'], title: 't' });
  assert.equal(wal.sections[0].label, 'Opening');
  assert.deepEqual(wal.palettes.ember, ['#ff3300', '#220000']);
  const v = validateWal(wal);
  assert.ok(v.ok, v.errors.join('; '));
});

test('overlay never stretches or duplicates one-shot effects when an override lands on top of them', () => {
  const base = [
    { t: 0, until: 40, layer: 'beam', dim: { look: 'on' } },
    { t: 10, layer: 'all', fx: 'blackout', dur: 0.4 },
    { t: 12, layer: 'beam', fx: 'flash', dur: 0.3 },
  ];
  const out = overlay(base, [{ t: 5, until: 30, layer: 'beam', dim: { look: 'pulse', on: 'beat' } }], [{ start: 0, end: 40 }], 40);
  const fx = out.filter((c) => c.fx);
  assert.equal(fx.length, 2, 'still exactly two effects');
  for (const c of fx) assert.equal(c.until, undefined, 'no span was invented for a one-shot');
});
