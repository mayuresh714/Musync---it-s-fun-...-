import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoPhrases, choreograph } from '../core/choreo/choreograph.js';
import { cleanPhrases, cleanMotifs } from '../server/lib/merge.js';
import { createDecoder } from '../core/decoder/decoder.js';
import { MOVE, DIM } from '../core/decoder/looks.js';
import { createTimebase } from '../core/decoder/timebase.js';
import { validateWal, draftWal } from '../core/index.js';
import { PALETTES, STROBE_PATTERNS } from '../core/wal/vocab.js';

const demo = JSON.parse(readFileSync(new URL('../sim/public/songs/demo.wal.json', import.meta.url), 'utf8'));
const concert = JSON.parse(readFileSync(new URL('../sim/public/rigs/concert.json', import.meta.url), 'utf8'));
const analysis = { bpm: demo.meta.bpm, meter: 4, duration: demo.meta.duration, beats: demo.timing.beats, downbeats: demo.timing.downbeats, accents: demo.accents, onsets: demo.onsets, envelopes: demo.envelopes, analyzer: 'test', key: 'C', sections: demo.sections };

test('autoPhrases: repeated hooks are refrains that count their returns, the last is the tagline', () => {
  const secs = [
    { id: 's1', start: 0, end: 20, kind: 'verse', energy: 0.4, group: 'A' },
    { id: 's2', start: 20, end: 40, kind: 'chorus', energy: 0.8, group: 'B' },
    { id: 's3', start: 40, end: 60, kind: 'verse', energy: 0.4, group: 'A' },
    { id: 's4', start: 60, end: 80, kind: 'chorus', energy: 0.9, group: 'B' },
  ];
  const a = { bpm: 120, meter: 4, downbeats: Array.from({ length: 40 }, (_, i) => i * 2) };
  const ph = autoPhrases(secs, a, []);
  const refrains = ph.filter((p) => p.role === 'refrain');
  assert.ok(refrains.length >= 2, 'refrains found');
  assert.deepEqual(refrains.map((p) => p.n).slice(0, 2), [1, 2]);
  assert.equal(ph.filter((p) => p.role === 'tagline').length, 1, 'one tagline');
  assert.equal(ph[ph.length - 1].role, 'tagline');
  assert.ok(ph.some((p) => p.role === 'lift'), 'the line before a chorus lifts into it');
  for (let i = 1; i < ph.length; i++) assert.ok(ph[i].t >= ph[i - 1].until - 1e-6, 'phrases do not overlap');
});

test('choreography: the refrain has the same signature on every return, with more layers later', () => {
  const secs = [{ id: 's1', start: 0, end: analysis.duration, kind: 'chorus', energy: 0.8, group: 'A', palette: 'festival' }];
  const bar = (60 / analysis.bpm) * 4;
  const phrases = [1, 2, 3].map((n) => ({ t: n * 4 * bar, until: n * 4 * bar + 2 * bar, role: 'refrain', motif: 'hook', n, energy: 0.8 }));
  const cues = choreograph({ sections: secs, phrases, analysis, palettes: PALETTES });
  const at = (n, layer) => cues.filter((c) => c.layer === layer && Math.abs(c.t - phrases[n - 1].t) < 1e-3 && c.move);
  const shape = (c) => c.map((x) => x.move.look).join('+');
  assert.equal(shape(at(1, 'beam')), shape(at(3, 'beam')), 'same movement shape on each return');
  const strobes = (n) => cues.filter((c) => c.layer === 'strobe' && c.t >= phrases[n - 1].t && c.t < phrases[n - 1].until && c.dim.look === 'strobe_seq').length;
  assert.equal(strobes(1), 0, 'first return is clean');
  assert.ok(strobes(2) >= 1 && strobes(3) >= 1, 'later returns add strobe patterns');
  assert.ok(cues.some((c) => c.fx === 'co2'), 'CO2 on a returning refrain');
});

test('choreography: calm styles never strobe or fire effects', () => {
  const wal = draftWal(analysis, { title: 't', styles: ['devotional'] });
  assert.ok(!wal.cues.some((c) => c.dim?.look === 'strobe_seq' || ['co2', 'confetti', 'flame'].includes(c.fx)));
});

test('draftWal: phrases come out in the WAL and the result validates on every layer', () => {
  const wal = draftWal(analysis, { title: 'demo', styles: ['edm'] });
  assert.ok(wal.phrases.length > 5);
  const v = validateWal(wal);
  assert.ok(v.ok, v.errors.join('; '));
  const layers = new Set(wal.cues.map((c) => c.layer));
  for (const l of ['beam', 'spot', 'wash', 'pixel', 'strobe', 'laser', 'blinder']) assert.ok(layers.has(l), `${l} has cues`);
});

test('cleanPhrases: snaps to bars, closes gaps, counts motif returns and drops bad roles', () => {
  const a = { bpm: 120, meter: 4, duration: 40, downbeats: Array.from({ length: 20 }, (_, i) => i * 2) };
  const warns = [];
  const raw = [
    { start: 0.3, end: 4.1, role: 'line', gist: 'one two three' },
    { start: 4.2, end: 8, role: 'refrain', motif: 'hook' },
    { start: 8.1, end: 15.9, role: 'nonsense' },
    { start: 16, end: 20, role: 'refrain', motif: 'hook' },
    { start: 20, end: 40, role: 'tagline', motif: 'tag' },
  ];
  const ph = cleanPhrases(raw, a, [{ start: 0, end: 40, energy: 0.6 }], (w) => warns.push(w));
  assert.equal(ph[0].t, 0); assert.equal(ph[ph.length - 1].until, 40);
  for (let i = 1; i < ph.length; i++) assert.equal(ph[i].t, ph[i - 1].until, 'gap-free');
  assert.deepEqual(ph.filter((p) => p.motif === 'hook').map((p) => p.n), [1, 2]);
  assert.equal(ph[2].role, 'line');
  assert.ok(warns.some((w) => /nonsense/.test(w)));
  assert.equal(Object.keys(cleanMotifs({ hook: { name: 'Mukhda', gist: 'x' }, ghost: {} }, ph)).sort().join(), 'hook,tag');
  assert.equal(cleanPhrases([{ start: 0, end: 5, role: 'line' }], a, [], () => {}), null, 'too few phrases -> null (fall back to automatic phrases)');
});

function ctxFor(look, bp, q = {}, el = { i: 2, n: 5, u: 0.2, side: 1, pos: [2, 8, -4] }) {
  const tb = createTimebase(demo);
  return { t: tb.timeOfBeat(bp), bp, bp0: 0, p: 0.5, el, q, tb, cue: { t: 0, until: 100 } };
}

test('moves that dance: bounce dips on the beat and recovers; snap changes formation every N beats', () => {
  const elev = (d) => Math.asin(d.y) * 180 / Math.PI;
  const onBeat = elev(MOVE.bounce(ctxFor('bounce', 8.0)));
  const late = elev(MOVE.bounce(ctxFor('bounce', 8.9)));
  assert.ok(late > onBeat + 8, `elevation should dip on the beat (${onBeat} -> ${late})`);
  const a = MOVE.snap(ctxFor('snap', 0.5, { every: 2 })), b = MOVE.snap(ctxFor('snap', 2.5, { every: 2 })), c = MOVE.snap(ctxFor('snap', 3.5, { every: 2 }));
  assert.notDeepEqual(a, b, 'formation changes after 2 beats');
  assert.deepEqual(b, c, 'and holds within the 2 beats');
  const m = ctxFor('vocal', 8); const lo = MOVE.vocal({ ...m, tb: { ...m.tb, envelope: () => 0.1 } }), hi = MOVE.vocal({ ...m, tb: { ...m.tb, envelope: () => 0.95 } });
  assert.ok(hi.y > lo.y, 'vocal look rises with the voice');
});

test('strobe_seq: each pattern flashes the right number of times per beat and never above 12 Hz', () => {
  const tb = createTimebase(demo), spb = tb.spb;
  const count = (pattern, beats = 4, el) => {
    let n = 0, prev = 0, minGap = Infinity, lastOn = null;
    const steps = beats * 400;
    for (let i = 0; i < steps; i++) {
      const bp = 8 + (i / steps) * beats;
      const v = DIM.strobe_seq({ t: tb.timeOfBeat(bp), bp, bp0: 8, p: i / steps, el: el || { i: 1, n: 4, side: 1 }, q: { pattern }, tb, cue: { t: tb.timeOfBeat(8), until: tb.timeOfBeat(8 + beats) } }) > 0 ? 1 : 0;
      if (v && !prev) { n++; const t = tb.timeOfBeat(bp); if (lastOn != null) minGap = Math.min(minGap, t - lastOn); lastOn = t; }
      prev = v;
    }
    return { n, minGap };
  };
  assert.equal(count('single').n, 4);
  assert.equal(count('double').n, 8);
  assert.equal(count('triple').n, 12);
  assert.equal(count('gallop').n, 12);
  assert.equal(count('heartbeat').n, 4);
  assert.ok(count('burst').n >= 4 * 4, 'burst is dense');
  for (const p of Object.keys(STROBE_PATTERNS)) { const r = count(p); assert.ok(r.minGap >= 1 / 12 - 0.01, `${p} gap ${r.minGap} stays at or under 12 Hz`); }
  const sides = (side) => count('split', 4, { i: 0, n: 2, side }).n;
  assert.equal(sides(-1) + sides(1), 4, 'split alternates: one side per beat');
});

test('hung heads use their whole reachable range (no clamping at the tilt stop)', () => {
  const wal = structuredClone(demo);
  const T = wal.sections[1].start;
  wal.cues = [{ t: T, until: T + 30, layer: 'beam', move: { look: 'ballyhoo', speed: 4 }, dim: { look: 'on' }, color: { look: 'static', hex: '#ffffff' } }];
  const d = createDecoder(wal, concert);
  const tilts = new Set();
  for (let i = 0; i < 200; i++) tilts.add(Math.round(d.frame(T + i * 0.1).B1.tilt / 3));
  assert.ok(tilts.size > 8, `hung beam tilt should vary widely, saw ${tilts.size} distinct values`);
  for (let i = 0; i < 200; i++) assert.ok(d.frame(T + i * 0.1).B1.tilt <= 125.01, 'never beyond the 125 degree stop');
});
