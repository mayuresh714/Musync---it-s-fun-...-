import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXTURES } from '../core/fixtures/library.js';
import { createDecoder } from '../core/decoder/decoder.js';
import { validateWal } from '../core/wal/validate.js';
import { benchModes, benchRig, benchWal } from '../sim/bench.js';

const base = JSON.parse(readFileSync(new URL('../songs/demo/song.wal.json', import.meta.url), 'utf8'));

test('bench: every fixture has a valid rig and every mode makes a valid show that decodes', () => {
  for (const model of Object.keys(FIXTURES)) {
    const rig = benchRig(model), aspects = benchModes(model);
    assert.ok(aspects.find((a) => a.id === 'dim')?.modes.length, `${model} has light modes`);
    for (const a of aspects) for (const m of a.modes) {
      const wal = benchWal(base, model, { [a.id]: m.id });
      const v = validateWal(wal);
      assert.ok(v.ok, `${model} ${m.id}: ${v.errors?.[0]}`);
      const f = createDecoder(wal, rig).frame(5);
      assert.ok(f.T1 && Number.isFinite(f.T1.dim), `${model} ${m.id} decodes`);
    }
  }
});

test('bench: a mover gets a movement list, a pixel bar does not', () => {
  assert.ok(benchModes('claypaky-sharpy').some((a) => a.id === 'move'));
  assert.ok(!benchModes('pixel-bar-16').some((a) => a.id === 'move'));
  assert.ok(benchModes('martin-atomic-3000')[0].modes.length > 5);
});
