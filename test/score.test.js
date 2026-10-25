import test from 'node:test';
import assert from 'node:assert/strict';
import { choreograph } from '../core/choreo/choreograph.js';
import { stepCues, recipeFor } from '../server/lib/steps.js';
import { critic } from '../server/lib/critic.js';
import { cleanPhrases } from '../server/lib/merge.js';
import { PALETTES } from '../core/wal/vocab.js';

const bpm = 120, spb = 0.5;
const a = { bpm, meter: 4, duration: 120, beats: Array.from({ length: 240 }, (_, i) => i * spb), downbeats: Array.from({ length: 60 }, (_, i) => i * 2), accents: [] };
const sections = [{ id: 's1', start: 0, end: 120, kind: 'verse', energy: 0.7, palette: 'sunset', group: 'A' }];
const ph = (t, role, extra = {}) => ({ t, until: t + 8, role, energy: 0.7, ...extra });
const run = (phrases) => choreograph({ sections, phrases, analysis: a, palettes: PALETTES, style: 'bollywood', styles: ['bollywood'], title: 'x' });

test('a stanza line that returns (same motif) gets the same beam figure and colour every time', () => {
  const cues = run([ph(0, 'line', { motif: 'tune' }), ph(8, 'line'), ph(16, 'line', { motif: 'tune' }), ph(24, 'line')]);
  const at = (t) => cues.find((c) => c.layer === 'beam' && c.move && c.t >= t && c.t < t + 8 && !c.group);
  assert.deepEqual(at(0).move.look, at(16).move.look);
  assert.deepEqual(at(0).color, at(16).color);
});

test('a silence breathes by default and only a flagged one, after a loud phrase, goes black (twice at most)', () => {
  const cues = run([ph(0, 'line'), ph(8, 'silence', { energy: 0 }), ph(16, 'line'), ph(24, 'silence', { dark: true, energy: 0 }), ph(32, 'line'), ph(40, 'silence', { dark: true }), ph(48, 'line'), ph(56, 'silence', { dark: true }), ph(64, 'line')]);
  const black = cues.filter((c) => c.fx === 'blackout' && c.dur > 4);
  assert.ok(black.length <= 2 && black.length >= 1, `long blackouts: ${black.length}`);
  assert.ok(!black.some((c) => c.t === 8), 'an unflagged silence is not black');
  const wash = cues.find((c) => c.layer === 'wash' && c.t === 8);
  assert.ok(wash && wash.dim.look === 'breathe' && wash.dim.intensity > 0.2, 'the wash holds a low colour');
});

test('cleanPhrases keeps motifs on lines and the dark flag only on silences', () => {
  const raw = [{ start: 0, end: 8, role: 'line', motif: 'tune' }, { start: 8, end: 16, role: 'silence', dark: true }, { start: 16, end: 24, role: 'line', motif: 'tune', dark: true }, { start: 24, end: 32, role: 'refrain', motif: 'hook' }];
  const out = cleanPhrases(raw, a, sections, () => {});
  assert.equal(out[0].motif, 'tune'); assert.equal(out[2].n, 2);
  assert.equal(out[1].dark, true); assert.equal(out[2].dark, undefined);
});

test('the dancers\' steps: one recipe per step, played at every return, never over a silence', () => {
  const brief = { scenes: [{ start: 0, end: 120, colors: ['#ff8800'] }], steps: [{ name: 'garba spin', what: 'dancers whirl in a ring', at: [10, 30, 50] }, { name: 'hand wave', what: 'arms sweep up', at: [70, 90] }] };
  const phrases = [{ t: 0, until: 40, role: 'line' }, { t: 28, until: 32, role: 'silence' }, { t: 40, until: 120, role: 'line' }];
  const cues = stepCues(brief, a, phrases, Object.keys(PALETTES));
  const beam = cues.filter((c) => c.layer === 'beam');
  assert.ok(beam.some((c) => c.t === 10) && beam.some((c) => c.t === 50) && !beam.some((c) => c.t === 30), 'silent step skipped');
  assert.equal(beam.find((c) => c.t === 10).move.look, beam.find((c) => c.t === 50).move.look, 'same step, same light');
  assert.notEqual(beam.find((c) => c.t === 10).move.look, beam.find((c) => c.t === 70).move.look);
  assert.ok(cues.some((c) => c.layer === 'pixel'), 'the grid answers too');
  assert.equal(recipeFor({ name: 'mystery', what: '' }).move.look, 'lotus');
});

test('the critic keeps two long blackouts, reports darkness and layer use', () => {
  const lit = (l) => ({ t: 0, until: 100, layer: l, dim: { look: 'on' } });
  const wal = { cues: [lit('wash'), lit('beam'), { t: 10, layer: 'all', fx: 'blackout', dur: 2 }, { t: 20, layer: 'all', fx: 'blackout', dur: 2 }, { t: 30, layer: 'all', fx: 'blackout', dur: 2 }, { t: 40, layer: 'all', fx: 'blackout', dur: 0.4 }], accents: [], phrases: [{ motif: 'h' }, { motif: 'h' }] };
  const r = critic(wal, 100);
  assert.equal(r.blackouts, 2);
  assert.equal(wal.cues.filter((c) => c.fx === 'blackout').length, 3, 'the short one stays');
  assert.equal(r.layers.wash, 100); assert.equal(r.layers.laser, 0); assert.equal(r.motifsThatReturn, 1); assert.equal(r.darkPct, 0);
});

import { expandDesign, applyElevation, checkDesign, designPrompt } from '../server/lib/design.js';

test('the designer: gestures replay identically at their times and tile along a returning line, never in a silence', () => {
  const phrases = [{ t: 0, until: 8, role: 'line' }, { t: 8, until: 16, role: 'refrain', motif: 'hook' }, { t: 20, until: 24, role: 'silence' }, { t: 24, until: 32, role: 'refrain', motif: 'hook' }];
  const design = {
    opening: { bars: 4, cues: [{ beat: 0, beats: 8, layer: 'wash', dim: { look: 'breathe', speed: 8, intensity: 0.3 } }] },
    gestures: [
      { id: 'hook', onMotif: 'hook', beats: 4, cues: [{ beat: 0, beats: 2, layer: 'beam', group: 'pairA', move: { look: 'fan' }, dim: { look: 'on', intensity: 1 } }, { beat: 2, beats: 2, layer: 'beam', group: 'pairB', move: { look: 'fan' }, dim: { look: 'on', intensity: 1 } }] },
      { id: 'spin', at: [21, 40, 60], beats: 4, cues: [{ beat: 0, beats: 4, layer: 'beam', move: { look: 'carousel' }, dim: { look: 'on' } }] },
    ],
    elevation: [{ from: 0, to: 10, level: 1 }, { from: 10, to: 60, level: 8 }],
  };
  const r = expandDesign(design, { a, phrases, validPalettes: Object.keys(PALETTES) });
  const pairA = r.cues.filter((c) => c.group === 'pairA');
  assert.ok(pairA.length >= 4, `tiled over both hooks: ${pairA.length}`);
  assert.ok(r.cues.some((c) => c.layer === 'wash' && c.t === 0), 'the opening is placed');
  assert.ok(!r.cues.some((c) => c.move?.look === 'carousel' && c.t >= 20 && c.t < 24), 'nothing inside the silence');
  assert.ok(pairA.every((c) => c.until > c.t));
});

test('elevation holds equipment back: no lasers, strobes or stage effects at a low level', () => {
  const cues = [{ t: 5, until: 8, layer: 'laser', dim: { look: 'on' } }, { t: 5, until: 8, layer: 'strobe', dim: { look: 'strobe_seq' } }, { t: 5, layer: 'all', fx: 'co2', dur: 1 }, { t: 5, until: 8, layer: 'beam', dim: { look: 'on' } }, { t: 20, until: 24, layer: 'laser', dim: { look: 'on' } }, { t: 20, layer: 'all', fx: 'co2', dur: 1 }];
  const out = applyElevation(cues, [{ from: 0, to: 10, level: 2 }, { from: 10, to: 60, level: 9 }]);
  assert.equal(out.cues.length, 3);
  assert.ok(out.cues.some((c) => c.layer === 'beam') && out.cues.filter((c) => c.t === 20).length === 2);
  assert.ok(checkDesign({ gestures: [], elevation: [] }).length >= 2);
});

test('the designer prompt carries the story, the sections, the video and the bar table', () => {
  const bible = { understanding: { title: 'T', story: 'a tease', emotionalArc: 'a -> b' }, palettes: { rust: ['#aa5500', '#ffcc00'] } };
  const secs = [{ start: 0, end: 30, kind: 'verse', label: 'Verse', energy: 0.4, palette: 'rust' }];
  const p = designPrompt({ bible, sections: secs, phraseText: 'phr', momentsText: 'mom', video: { text: 'MUSIC VIDEO block', peaks: 'PEAKS' }, barText: 'BARS', a });
  for (const k of ['a tease', 'Verse', 'rust: #aa5500', 'MUSIC VIDEO block', 'PEAKS', 'BARS']) assert.ok(p.includes(k), k);
});
