// Rig plan: what the AI designer returns, checked and cleaned before the simulator ever sees it.
// Pure JS (no DOM, no server) so the same rules run in the backend, in tests and, later, in the browser.
//
// A model reply is never trusted: unknown fixtures are dropped, positions are clamped into the venue,
// ids are made unique, and the result is always a rig the decoder can play (or a clear error).
import { FIXTURES } from '../fixtures/library.js';

// The three simulator scenes and the space a fixture may sit in (metres; x right, y up, z towards the audience).
export const VENUES = {
  hall: { label: 'Banquet hall (indoor, low ceiling, stage at one end, dance floor and round tables): weddings, sangeet, receptions, corporate dinners', bounds: { x: [-11.5, 11.5], y: [0, 4.8], z: [-8.5, 20] }, ceiling: 5 },
  lawn: { label: 'Wedding lawn (open air at night, mandap stage, ceremony chairs, dance floor, tables, string lights): garden weddings, receptions, farmhouse parties', bounds: { x: [-17, 17], y: [0, 7], z: [-9, 26] }, ceiling: 7 },
  stage: { label: 'Stage (outdoor or indoor, audience in front)', bounds: { x: [-20, 20], y: [0, 12], z: [-12, 30] }, ceiling: 12 },
  club: { label: 'Club / hall (dance floor with a DJ booth)', bounds: { x: [-12, 12], y: [0, 6.5], z: [-8, 14] }, ceiling: 6.5 },
  garba: { label: 'Open ground with a dance ring (garba, dandiya, mela)', bounds: { x: [-18, 18], y: [0, 10], z: [-3, 32] }, ceiling: 10 },
};
export const CAMERAS = ['director', 'crane', 'orbit', 'reveal', 'fly', 'top', 'foh', 'crowd', 'pit', 'stage', 'walk'];
export const MAX_FIXTURES = 60;
const ID_PREFIX = { beam: 'B', spot: 'S', wash: 'W', pixel: 'P', strobe: 'ST', laser: 'L', blinder: 'BL', tube: 'T', matrix: 'M' };

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(num);
const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
const str = (v, n = 400) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const asks = (v) => (Array.isArray(v) ? v.map((q) => (typeof q === 'string' ? { ask: str(q, 160), options: [] } : { ask: str(q?.ask ?? q?.q, 160), options: list(q?.options, 5, 40) })).filter((q) => q.ask).slice(0, 3) : []);
const list = (v, n = 6, len = 240) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);

// The catalogue the designer may use, as plain facts for the prompt.
export function catalogue(library = FIXTURES) {
  return Object.entries(library).map(([model, p]) => ({
    model, name: p.name, role: p.role, moving: !!p.pan || p.role === 'laser',
    ...(p.beamAngle ? { beamDeg: p.beamAngle } : {}), ...(p.pixels > 1 ? { pixels: p.pixels } : {}),
    ...(p.length ? { lengthM: p.length } : {}), ...(p.width ? { widthM: p.width } : {}),
  }));
}

// raw: the JSON object the model produced. Returns { ok, error?, plan?, warnings }.
function understanding(raw) {
  const u = raw.understanding && typeof raw.understanding === 'object' ? raw.understanding : {};
  return { occasion: str(u.occasion, 120), guests: num(u.guests) ? Math.round(u.guests) : null, room: str(u.room, 240), budget: str(u.budget, 120), mounting: str(u.mounting, 240) };
}

export function normalizePlan(raw, { library = FIXTURES } = {}) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'The designer did not return a plan.', warnings };
  const src0 = Array.isArray(raw.fixtures) ? raw.fixtures : Array.isArray(raw.rig?.fixtures) ? raw.rig.fixtures : [];
  // a turn that only asks a question: nothing to build yet, and nothing on screen changes
  if (!src0.length && asks(raw.questions).length) return { ok: true, warnings, plan: { kind: 'ask', reply: str(raw.reply, 1200) || 'I have a question first.', questions: asks(raw.questions).slice(0, 1), understanding: understanding(raw), assumptions: [], highlights: [] } };
  const venue = VENUES[raw.venue] ? raw.venue : VENUES[raw.rig?.venue] ? raw.rig.venue : null;
  if (!venue) return { ok: false, error: `Unknown venue "${raw.venue}". Use one of ${Object.keys(VENUES).join(', ')}.`, warnings };
  const B = VENUES[venue].bounds;
  const src = src0;
  const fixtures = [], used = new Set(), count = {};
  for (const f of src) {
    if (fixtures.length >= MAX_FIXTURES) { warnings.push(`Only the first ${MAX_FIXTURES} fixtures are kept.`); break; }
    const p = library[f?.model];
    if (!p) { warnings.push(`Dropped an unknown fixture "${f?.model}".`); continue; }
    if (!vec(f.pos)) { warnings.push(`Dropped a ${p.name} with no valid position.`); continue; }
    const pos = [clamp(f.pos[0], B.x), clamp(f.pos[1], B.y), clamp(f.pos[2], B.z)].map((v) => Math.round(v * 100) / 100);
    if (pos.some((v, i) => v !== Math.round(f.pos[i] * 100) / 100)) warnings.push(`Moved a ${p.name} back inside the venue.`);
    const mount = f.mount === 'floor' || f.mount === 'hung' ? f.mount : pos[1] > 2.5 ? 'hung' : 'floor';
    let id = str(f.id, 12).replace(/[^\w-]/g, '');
    const pre = ID_PREFIX[p.role] || 'F';
    if (!id || used.has(id)) { count[pre] = (count[pre] || 0) + 1; id = `${pre}${count[pre]}`; while (used.has(id)) id = `${pre}${++count[pre]}`; }
    used.add(id);
    const out = { id, model: f.model, pos, mount };
    if (vec(f.aim)) out.aim = f.aim.map((v) => Math.round(v * 100) / 100);
    fixtures.push(out);
  }
  if (!fixtures.length) return { ok: false, error: 'The plan had no usable fixtures.', warnings };
  const rig = { name: str(raw.name, 80) || 'AI design', venue, fixtures };
  if (venue === 'garba') { rig.surround = true; rig.focus = vec(raw.focus) ? raw.focus : [0, 0, 16]; } else if (venue === 'club') rig.surround = true; // ring venues aim every look inward
  const plan = {
    kind: 'design',
    reply: str(raw.reply, 1200) || 'Here is a first design.',
    name: rig.name, venue, rig,
    camera: CAMERAS.includes(raw.camera) ? raw.camera : 'director',
    understanding: understanding(raw),
    highlights: list(raw.highlights, 5, 120),
    assumptions: list(raw.assumptions), questions: asks(raw.questions),
    bom: bomOf(rig, library),
  };
  return { ok: true, plan, warnings };
}

// Bill of materials: how many of each fixture, grouped by layer.
export function bomOf(rig, library = FIXTURES) {
  const n = {};
  for (const f of rig.fixtures) n[f.model] = (n[f.model] || 0) + 1;
  return Object.entries(n).map(([model, qty]) => ({ model, name: library[model]?.name || model, role: library[model]?.role || '', qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}
