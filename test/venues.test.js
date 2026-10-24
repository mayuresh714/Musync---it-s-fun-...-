import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// The three original venues and their rigs must stay exactly as designed: new venues are added beside them, never edited into them.
const rig = (n) => JSON.parse(readFileSync(new URL(`../sim/public/rigs/${n}.json`, import.meta.url), 'utf8'));

test('built-in rigs keep their fixture counts', () => {
  assert.equal(rig('concert').fixtures.length, 42);
  assert.equal(rig('club').fixtures.length, 38);
  assert.equal(rig('dandiya').fixtures.length, 28);
});

test('the two wedding rigs exist, are small, and sit inside their venues', async () => {
  const { VENUES } = await import('../core/design/rig-plan.js');
  for (const [name, venue] of [['hall', 'hall'], ['lawn', 'lawn']]) {
    const r = rig(name), B = VENUES[venue].bounds;
    assert.equal(r.venue, venue);
    assert.ok(r.fixtures.length >= 10 && r.fixtures.length <= 25, `${name} has ${r.fixtures.length}`);
    for (const f of r.fixtures) assert.ok(f.pos[0] >= B.x[0] && f.pos[0] <= B.x[1] && f.pos[1] >= B.y[0] && f.pos[1] <= B.y[1] && f.pos[2] >= B.z[0] && f.pos[2] <= B.z[1], `${name} ${f.id} is outside the venue`);
  }
});
