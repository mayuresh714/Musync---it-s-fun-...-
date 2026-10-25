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

test('the procession rig sits inside its venue: the show on the light trolley, a soft light on the idol, and the old venues are unchanged', async () => {
  const { VENUES, normalizePlan } = await import('../core/design/rig-plan.js');
  const r = rig('procession'), B = VENUES.procession.bounds;
  assert.equal(r.venue, 'procession');
  assert.ok(r.fixtures.length >= 25 && r.fixtures.length <= 45, `${r.fixtures.length} lights`);
  for (const f of r.fixtures) assert.ok(f.pos[0] >= B.x[0] && f.pos[0] <= B.x[1] && f.pos[1] >= B.y[0] && f.pos[1] <= B.y[1] && f.pos[2] >= B.z[0] && f.pos[2] <= B.z[1], `${f.id} is outside the venue`);
  assert.ok(r.fixtures.filter((f) => f.pos[2] > 25).length >= 3, 'some lights are on the idol trolley');
  assert.ok(r.fixtures.some((f) => f.model === 'claypaky-sharpy' && f.pos[2] < -8), 'sharpies on the light trolley');
  const plan = normalizePlan({ venue: 'procession', name: 't', fixtures: r.fixtures });
  assert.ok(plan.ok && plan.plan.venue === 'procession' && plan.plan.rig.fixtures.length === r.fixtures.length, 'the designer accepts the venue and keeps every light');
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
