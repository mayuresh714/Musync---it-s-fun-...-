// validate(wal) -> { ok, errors[], warnings[] }
// Schema checks (ajv) plus semantic checks a schema can't express.
import Ajv from 'ajv';
import { WAL_SCHEMA } from './schema.js';
import { PALETTES } from './vocab.js';

let compiled;

export function validateWal(wal) {
  compiled ||= new Ajv({ allErrors: true, strict: false }).compile(WAL_SCHEMA);
  const errors = [];
  const warnings = [];
  if (!compiled(wal)) {
    for (const e of compiled.errors) errors.push(`${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ' ' + JSON.stringify(e.params.allowedValues) : ''}`);
    return { ok: false, errors, warnings };
  }
  const dur = wal.meta.duration;
  const palettes = { ...PALETTES, ...(wal.palettes || {}) };

  const sorted = (arr, name) => {
    for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) { errors.push(`${name} not sorted at index ${i}`); return; }
  };
  sorted(wal.timing.beats, 'timing.beats');
  if (wal.timing.downbeats) sorted(wal.timing.downbeats, 'timing.downbeats');

  const secs = wal.sections;
  if (secs[0].start > 0.05) warnings.push(`first section starts at ${secs[0].start}s, not 0`);
  secs.forEach((s, i) => {
    if (s.end <= s.start) errors.push(`section ${s.id}: end <= start`);
    if (s.end > dur + 0.5) errors.push(`section ${s.id}: ends after song (${s.end} > ${dur})`);
    if (i > 0 && Math.abs(s.start - secs[i - 1].end) > 0.05) errors.push(`section ${s.id}: gap/overlap with previous (${secs[i - 1].end} -> ${s.start})`);
    if (s.palette && !palettes[s.palette]) errors.push(`section ${s.id}: unknown palette "${s.palette}"`);
  });
  if (Math.abs(secs[secs.length - 1].end - dur) > 0.5) warnings.push(`last section ends at ${secs[secs.length - 1].end}s; song is ${dur}s`);
  const ids = new Set();
  for (const s of secs) { if (ids.has(s.id)) errors.push(`duplicate section id ${s.id}`); ids.add(s.id); }

  const drops = secs.filter((s) => s.kind === 'drop').length;
  if (drops > 4) warnings.push(`${drops} drop sections; drops should be the 2-3 real peaks`);

  for (const [i, c] of (wal.cues || []).entries()) {
    if (c.t > dur) errors.push(`cue ${i}: t=${c.t} after song end`);
    if (c.until != null && c.until <= c.t) errors.push(`cue ${i}: until <= t`);
    if (!c.move && !c.dim && !c.color && !c.fx) warnings.push(`cue ${i} (t=${c.t}) has no move/dim/color/fx`);
    for (const part of [c.move, c.dim, c.color]) if (part?.palette && !palettes[part.palette]) errors.push(`cue ${i}: unknown palette "${part.palette}"`);
    if (c.move && ['pixel', 'strobe', 'blinder'].includes(c.layer)) warnings.push(`cue ${i}: layer ${c.layer} has no movement; move ignored`);
    if (c.dim?.look === 'strobe' && (c.dim.rate ?? 10) > 20) warnings.push(`cue ${i}: strobe > 20 Hz; many fixtures cap lower and it is a photosensitivity risk`);
  }
  for (const [i, a] of (wal.accents || []).entries()) if (a.t > dur) errors.push(`accent ${i}: after song end`);
  const env = wal.envelopes;
  if (env?.energy && Math.abs(env.energy.length / env.rate - dur) > 1) warnings.push('envelope length does not match duration');

  return { ok: errors.length === 0, errors, warnings };
}
