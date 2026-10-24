import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createDecoder, buildElements } from '../core/decoder/decoder.js';
import { MOVE, DIM, COLOR, inGroup } from '../core/decoder/looks.js';
import { createTimebase } from '../core/decoder/timebase.js';
import { choreograph, autoPhrases } from '../core/choreo/choreograph.js';
import { remasterWal, needsRemaster } from '../core/wal/remaster.js';
import { validateWal, draftWal } from '../core/index.js';
import { PALETTES, MOVE_LOOKS, DIM_LOOKS, COLOR_LOOKS, STYLES } from '../core/wal/vocab.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const demo = read('../sim/public/songs/demo.wal.json');
const rigs = Object.fromEntries(readdirSync(new URL('../sim/public/rigs/', import.meta.url)).map((f) => [f.replace('.json', ''), read(`../sim/public/rigs/${f}`)]));
const analysisOf = (wal) => ({ bpm: wal.meta.bpm, meter: 4, duration: wal.meta.duration, beats: wal.timing.beats, downbeats: wal.timing.downbeats, accents: wal.accents, onsets: wal.onsets, envelopes: wal.envelopes, analyzer: 'test', key: wal.meta.key || 'C', sections: wal.sections });

test('every look in the vocabulary is implemented', () => {
  for (const k of Object.keys(MOVE_LOOKS)) assert.equal(typeof MOVE[k], 'function', `MOVE.${k}`);
  for (const k of Object.keys(DIM_LOOKS)) assert.equal(typeof DIM[k], 'function', `DIM.${k}`);
  for (const k of Object.keys(COLOR_LOOKS)) assert.equal(typeof COLOR[k], 'function', `COLOR.${k}`);
});

test('every movement figure aims at a finite unit vector on a stage rig and on a ring rig', () => {
  const tb = createTimebase(demo);
  for (const rigName of ['concert', 'dandiya', 'club']) {
    const { byRole } = buildElements(rigs[rigName]);
    for (const el of byRole.beam) for (const look of Object.keys(MOVE_LOOKS)) for (const bp of [0.3, 5.1, 11.7, 33.2]) {
      const q = { speed: 8, spread: 0.7, size: 0.5, every: 2, seed: 7, phase: 0.4, pose: 'up' };
      const d = MOVE[look]({ t: tb.timeOfBeat(bp), bp, bp0: 0, p: 0.4, el, q, tb, cue: { t: 0, until: 60 } });
      const len = Math.hypot(d.x, d.y, d.z);
      assert.ok(Number.isFinite(len) && Math.abs(len - 1) < 1e-6, `${rigName} ${look} at beat ${bp}: |dir| = ${len}`);
    }
  }
});

test('a ring rig turns every look inward: tower beams aim at the dance ring, not away from it', () => {
  const rig = rigs.dandiya;
  const wal = structuredClone(demo);
  wal.cues = [{ t: 0, until: 200, layer: 'beam', move: { look: 'fan', spread: 0.6 }, dim: { look: 'on' }, color: { look: 'static', hex: '#ffffff' } }];
  const d = createDecoder(wal, rig), st = d.frame(40);
  const [fx, , fz] = rig.focus;
  for (const f of rig.fixtures.filter((x) => /^T\dB1$/.test(x.id))) {
    const a = st[f.id].aim, toFocus = [fx - f.pos[0], fz - f.pos[2]], n = Math.hypot(...toFocus);
    const dot = (a.x * toFocus[0] + a.z * toFocus[1]) / (n * Math.hypot(a.x, a.z));
    assert.ok(dot > 0.5, `${f.id} should face the ring (dot ${dot.toFixed(2)})`);
  }
});

test('group cues: only the named half of a layer plays them, and a group overlays the whole-layer cue', () => {
  const rig = rigs.concert;
  const wal = structuredClone(demo);
  wal.cues = [
    { t: 0, until: 200, layer: 'beam', move: { look: 'still', pose: 'up' }, dim: { look: 'on' }, color: { look: 'static', hex: '#ff0000' } },
    { t: 10, until: 100, layer: 'beam', group: 'odd', move: { look: 'still', pose: 'audience' }, color: { look: 'static', hex: '#0000ff' } },
  ];
  const d = createDecoder(wal, rig);
  const { byRole } = buildElements(rig);
  const st = d.frame(30);
  for (const el of byRole.beam) {
    const s = st[el.fixture.id];
    const blue = s.rgb[2] > s.rgb[0];
    assert.equal(blue, el.i % 2 === 1, `${el.fixture.id} (index ${el.i}) colour`);
  }
  const lone = buildElements({ fixtures: [rig.fixtures[0]] }).byRole.beam[0];
  assert.ok(inGroup(lone, 'odd') && inGroup(lone, 'even'), 'a single head plays every group');
});

test('prism: only heads with a prism open it, and only when the move asks', () => {
  const wal = structuredClone(demo);
  wal.cues = [{ t: 0, until: 200, layer: 'beam', move: { look: 'carousel', prism: true }, dim: { look: 'on' }, color: { look: 'static', hex: '#ffffff' } }];
  const st = createDecoder(wal, rigs.dandiya).frame(30);
  assert.ok(st.PB2.prism && st.PB2.prism.rays === 8, '7R beam opens its prism');
  assert.ok(!createDecoder(wal, rigs.concert).frame(30).S1.prism, 'a spot without a prism has none');
  wal.cues[0].move = { look: 'carousel' };
  assert.ok(!createDecoder(wal, rigs.dandiya).frame(30).PB2.prism, 'closed unless asked');
});

test('tubes and matrix walls: pixels carry grid positions and the grid looks use them', () => {
  const { byRole } = buildElements(rigs.club);
  const m = byRole.matrix;
  assert.ok(m.length >= 600, 'a matrix wall has hundreds of cells');
  assert.ok(m.every((e) => e.gx >= 0 && e.gx <= 1 && e.gy >= 0 && e.gy <= 1), 'grid coordinates 0..1');
  const tb = createTimebase(demo);
  const ctx = (el, bp) => ({ t: tb.timeOfBeat(bp), bp, bp0: 0, p: 0.5, el, q: { speed: 8, density: 0.7 }, tb, cue: { t: 0, until: 60 } });
  for (const look of ['eq', 'plasma', 'ripple', 'rain', 'checker', 'diagonal', 'meter', 'thump', 'comet']) {
    let widest = 0;
    for (const bp of [5.1, 9.3, 14.6, 20.4, 27.7, 31.2]) {
      const vals = m.filter((_, i) => i % 7 === 0).map((e) => DIM[look]({ ...ctx(e, bp), q: { speed: look === 'thump' ? 0.5 : 8, density: 0.7, on: 'beat' } }));
      assert.ok(vals.every((v) => Number.isFinite(v) && v >= 0 && v <= 1.0001), `${look} stays in 0..1`);
      widest = Math.max(widest, Math.max(...vals) - Math.min(...vals));
    }
    assert.ok(widest > 0.05, `${look} makes a picture (not one flat value)`);
  }
  const tube = byRole.tube.filter((e) => e.fixture.id === 'TB1');
  assert.ok(tube[tube.length - 1].pos[1] > tube[0].pos[1], 'tube cells climb the tube');
});

test('every rig decodes every bundled show with sane values', () => {
  const shows = readdirSync(new URL('../sim/public/songs/', import.meta.url)).filter((f) => f.endsWith('.wal.json') && !f.includes('.v1.')).map((f) => read(`../sim/public/songs/${f}`));
  for (const [name, rig] of Object.entries(rigs)) for (const wal of shows) {
    const d = createDecoder(wal, rig);
    for (const t of [3, wal.meta.duration * 0.3, wal.meta.duration * 0.6]) {
      const st = d.frame(t);
      for (const f of rig.fixtures) {
        const s = st[f.id];
        assert.ok(s && Number.isFinite(s.dim) && s.dim >= 0 && s.dim <= 1.0001, `${name} ${f.id} dim ${s?.dim}`);
        assert.ok(s.rgb.every(Number.isFinite), `${name} ${f.id} rgb`);
        if (s.pan != null) assert.ok(Number.isFinite(s.pan) && Number.isFinite(s.tilt), `${name} ${f.id} pan/tilt`);
        if (s.pixels) assert.ok(s.pixels.every((c) => c.every(Number.isFinite)), `${name} ${f.id} pixels`);
      }
    }
  }
});

test('choreography varies: no figure twice in a row, many figures per song, and different songs dance differently', () => {
  const a = analysisOf(demo);
  const make = (style, title, bpmShift = 0) => {
    const an = { ...a, bpm: a.bpm + bpmShift };
    const phrases = autoPhrases(demo.sections, an, []);
    return choreograph({ sections: demo.sections.map((s) => ({ ...s, palette: s.palette || 'festival' })), phrases, analysis: an, palettes: PALETTES, style, styles: [style], title });
  };
  const seq = (cues) => cues.filter((c) => c.layer === 'beam' && c.move && !c.group).sort((x, y) => x.t - y.t).map((c) => c.move.look);
  const s1 = seq(make('edm', 'Song One')), s2 = seq(make('dandiya', 'Song Two')), s3 = seq(make('devotional', 'Song Three'));
  assert.ok(new Set(s1).size >= 8, `a song uses many figures, saw ${new Set(s1).size}`);
  // consecutive phrases (not the two halves of one refrain) should rarely repeat
  let repeats = 0; for (let i = 1; i < s1.length; i++) if (s1[i] === s1[i - 1]) repeats++;
  assert.ok(repeats <= s1.length * 0.3, `too many back-to-back repeats: ${repeats} of ${s1.length}`);
  const bigrams = (s) => new Set(s.slice(1).map((v, i) => `${s[i]}>${v}`));
  const overlap = (x, y) => [...x].filter((v) => y.has(v)).length / Math.max(1, Math.min(x.size, y.size));
  assert.ok(overlap(bigrams(s1), bigrams(s2)) < 0.5, 'club and garba shows share under half their transitions');
  assert.ok(overlap(bigrams(s1), bigrams(s3)) < 0.5, 'club and devotional shows share under half their transitions');
  assert.ok(s2.some((l) => ['carousel', 'lotus', 'peacock', 'helix'].includes(l)), 'the garba show uses ring figures');
  assert.ok(s3.every((l) => !['ballyhoo', 'crossfire'].includes(l)), 'devotional never uses the hard figures');
  assert.deepEqual(seq(make('edm', 'Song One')), s1, 'the same song always gets the same show');
});

test('every style choreographs a valid WAL on every layer, and the new layers get cues', () => {
  const a = analysisOf(demo);
  for (const style of Object.keys(STYLES)) {
    const wal = draftWal(a, { title: `t-${style}`, styles: [style] });
    const v = validateWal(wal);
    assert.ok(v.ok, `${style}: ${v.errors.join('; ')}`);
    const layers = new Set(wal.cues.map((c) => c.layer));
    for (const l of ['beam', 'spot', 'wash', 'pixel', 'tube', 'matrix', 'strobe', 'laser', 'blinder']) assert.ok(layers.has(l), `${style}: ${l} has cues`);
    if (['devotional', 'romantic', 'classical'].includes(style)) assert.ok(!wal.cues.some((c) => c.dim?.look === 'strobe_seq'), `${style} never strobes`);
  }
});

test('remaster: an older show is re-choreographed from its own structure and keeps its hand-placed moments', () => {
  const old = structuredClone(demo);
  old.meta.generator = 'musync-director/0.2 (claude sonnet)'; delete old.meta.choreo;
  old.cues = [{ t: 20, layer: 'all', fx: 'blackout', dur: 1.2, note: 'the beat drops out on the word' }, { t: 30, until: 40, layer: 'beam', move: { look: 'sweep' }, dim: { look: 'on' }, color: { look: 'static', hex: '#ff0000' }, note: 'old look' }];
  assert.ok(needsRemaster(old));
  const next = remasterWal(old);
  assert.ok(validateWal(next).ok);
  assert.ok(next.cues.length > 100, 'a full show');
  assert.ok(next.cues.some((c) => c.fx === 'blackout' && c.note?.includes('beat drops out')), 'the hand-placed blackout survives');
  assert.ok(!needsRemaster(next), 'and it is not remastered twice');
  assert.deepEqual(next.sections.map((s) => s.id), old.sections.map((s) => s.id), 'sections untouched');
});
