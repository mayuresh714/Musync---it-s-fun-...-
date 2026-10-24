// A stand-in for the Claude designer (MUSYNC_FAKE_DIRECTOR=1): no model call, same shape of answer.
// It picks a venue from a few words and trims a real preset rig to the size asked for, so the whole chat flow can be tested for free.
import { readFileSync } from 'node:fs';
import { normalizePlan } from '../../core/design/rig-plan.js';

const preset = (n) => JSON.parse(readFileSync(new URL(`../../sim/public/rigs/${n}.json`, import.meta.url), 'utf8'));
const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Cancelled')); }); });

export async function fakeDesign({ message, rig, newImages = [], signal, emit = () => {} }) {
  emit({ stage: newImages.length ? 'looking' : 'thinking', detail: 'Reading the request' }); await sleep(Number(process.env.MUSYNC_FAKE_MS || 250), signal);
  if (/fail/i.test(message)) throw new Error('The fake designer was asked to fail.');
  emit({ stage: 'designing', detail: 'Placing the fixtures' }); await sleep(Number(process.env.MUSYNC_FAKE_MS || 250), signal);
  const t = message.toLowerCase();
  // too little to go on: ask one question and build nothing
  if (!rig?.fixtures?.length && t.trim().split(/\s+/).length < 4 && !/continue|just build|go ahead/.test(t)) {
    return { plan: normalizePlan({ reply: 'Happy to help. What kind of event is it?', questions: [{ ask: 'What kind of event is it?', options: ['Wedding', 'DJ night', 'Concert', 'Garba night'] }] }).plan, warnings: [], costUsd: 0 };
  }
  const outdoor = /lawn|garden|farm|outdoor|open air|open-air/.test(t);
  const venue = /garba|dandiya|navratri|mela/.test(t) ? 'garba' : /wedding|sangeet|reception|banquet|hall|engagement/.test(t) ? (outdoor ? 'lawn' : 'hall') : outdoor && !/concert/.test(t) ? 'lawn' : /club|dj|dance floor|lounge|party/.test(t) ? 'club' : 'stage';
  const base = preset({ garba: 'dandiya', club: 'club', stage: 'concert', hall: 'hall', lawn: 'lawn' }[venue]);
  let fixtures = base.fixtures;
  const asked = /(\d+)\s*(fixtures|lights)/.exec(t);
  const small = /limited|small|few|minimal|budget/.test(t);
  const want = asked ? Number(asked[1]) : small ? 14 : null;
  if (rig?.fixtures?.length && /remove|fewer|less/.test(t)) fixtures = rig.fixtures.slice(0, Math.max(1, Math.round(rig.fixtures.length * 0.7)));
  else if (rig?.fixtures?.length && /add|more/.test(t)) fixtures = [...rig.fixtures, ...base.fixtures.filter((f) => f.model === 'claypaky-sharpy').slice(0, 2).map((f, i) => ({ ...f, id: `X${i + 1}` }))];
  else if (want) { // keep a spread of models: every Nth fixture
    const step = Math.max(1, Math.floor(fixtures.length / want));
    fixtures = fixtures.filter((_, i) => i % step === 0).slice(0, want);
  }
  const res = normalizePlan({
    highlights: ['Moving beams for the entrance', 'Warm washes over the dance floor'],
    reply: `I built a ${venue} rig with ${fixtures.length} fixtures for “${message.slice(0, 60)}”.${newImages.length ? ` I looked at ${newImages.length} photo(s).` : ''}`,
    name: `AI ${venue} rig`, venue, camera: venue === 'garba' ? 'orbit' : 'foh',
    understanding: { occasion: message.slice(0, 80), guests: (/(\d+)\s*(guests|people|pax)/.exec(t) || [])[1] ? Number(/(\d+)\s*(guests|people|pax)/.exec(t)[1]) : null, room: 'from the description', budget: asked ? `${asked[1]} fixtures` : '', mounting: 'truss' },
    assumptions: ['Rigging points assumed from the venue type.'], questions: [{ ask: 'Do you want it warmer or more colourful?', options: ['Warmer', 'More colourful'] }], fixtures,
  });
  if (!res.ok) throw new Error(res.error);
  return { plan: res.plan, warnings: res.warnings, costUsd: 0 };
}
