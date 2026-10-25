// Turns the agent's JSON into a valid WAL: snaps sections to bars, cleans cues against the schema,
// and overlays them on the rule-based baseline so anything the agent leaves out still plays well.
import { WAL_SCHEMA } from '../../core/wal/schema.js';
import { SECTION_KINDS, PALETTES, ACCENT_TYPES, FX, PHRASE_ROLES, GROUPS, IMAGES } from '../../core/wal/vocab.js';

const r3 = (x) => Math.round(x * 1000) / 1000;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function nearest(sorted, t) {
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < t) lo = m + 1; else hi = m; }
  return lo > 0 && Math.abs(sorted[lo - 1] - t) <= Math.abs(sorted[lo] - t) ? sorted[lo - 1] : sorted[lo];
}

export function snapSections(raw, a, validPalettes, warn) {
  const edges = [...new Set([0, ...a.downbeats.filter((t) => t > 0 && t < a.duration), a.duration])].sort((x, y) => x - y);
  const barSec = (60 / a.bpm) * (a.meter || 4);
  const list = (raw || []).filter((s) => num(s.start) != null && num(s.end) != null).sort((x, y) => x.start - y.start);
  if (!list.length) return null;
  // boundary between neighbours = snapped midpoint of (previous end, next start)
  const bounds = [0];
  for (let i = 1; i < list.length; i++) bounds.push(nearest(edges, (list[i - 1].end + list[i].start) / 2));
  bounds.push(a.duration);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const start = bounds[i], end = bounds[i + 1];
    if (end - start < barSec * 0.8) { if (out.length) { out[out.length - 1].end = end; warn(`section "${list[i].label || i}" is under a bar long; merged into the one before`); } continue; }
    out.push({ ...list[i], start: r3(start), end: r3(end) });
  }
  if (!out.length) return null;
  out[out.length - 1].end = a.duration;
  const fallbackPal = validPalettes[0];
  return out.map((s, i) => ({
    id: `s${i + 1}`,
    start: s.start, end: s.end,
    kind: SECTION_KINDS[s.kind] ? s.kind : (warn(`unknown section kind "${s.kind}" -> verse`), 'verse'),
    energy: Math.max(0, Math.min(1, num(s.energy) ?? 0.5)),
    group: String(s.group || String.fromCharCode(65 + (i % 26))),
    ...(s.label ? { label: String(s.label).slice(0, 60) } : {}),
    ...(s.mood ? { mood: String(s.mood).slice(0, 60) } : {}),
    ...(s.lyric ? { lyric: String(s.lyric).slice(0, 140) } : {}),
    ...(s.idea ? { idea: String(s.idea).slice(0, 240) } : {}),
    ...(Array.isArray(s.move) && s.move.length ? { move: s.move.filter((m) => typeof m === 'string').slice(0, 3).map((m) => m.slice(0, 20)) } : {}),
    palette: validPalettes.includes(s.palette) ? s.palette : (warn(`section ${i + 1}: unknown palette "${s.palette}"`), fallbackPal),
  }));
}

export function cleanPalettes(custom, warn) {
  const out = {};
  for (const [name, cols] of Object.entries(custom || {})) {
    const ok = Array.isArray(cols) ? cols.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)) : [];
    if (ok.length) out[String(name).slice(0, 24)] = ok.slice(0, 6); else warn(`palette "${name}" had no valid #rrggbb colours; ignored`);
  }
  return out;
}

const ITEM = WAL_SCHEMA.properties.cues.items.properties;
const PART_KEYS = { move: 'move', dim: 'dim', color: 'color' };

function cleanPart(kind, part, validPalettes, warn, ctx) {
  const def = ITEM[kind];
  if (!part || typeof part !== 'object') return null;
  if (!def.properties.look.enum.includes(part.look)) { warn(`${ctx}: unknown ${kind} look "${part.look}" dropped`); return null; }
  const out = { look: part.look };
  for (const [k, v] of Object.entries(part)) {
    if (k === 'look') continue;
    const p = def.properties[k];
    if (!p) continue; // params the schema doesn't know are dropped
    if (p.enum) { if (p.enum.includes(v)) out[k] = v; continue; }
    if (p.type === 'string') { if (typeof v === 'string' && (!p.pattern || new RegExp(p.pattern).test(v))) out[k] = v; continue; }
    if (p.type === 'boolean') { out[k] = !!v; continue; }
    let n = num(v);
    if (n == null) continue;
    if (p.minimum != null) n = Math.max(p.minimum, n);
    if (p.maximum != null) n = Math.min(p.maximum, n);
    if (p.exclusiveMinimum != null && n <= p.exclusiveMinimum) continue;
    if (p.type === 'integer') n = Math.round(n);
    out[k] = n;
  }
  if (out.rate != null) out.rate = Math.min(12, out.rate);
  if (out.palette && !validPalettes.includes(out.palette)) { warn(`${ctx}: unknown palette "${out.palette}" dropped`); delete out.palette; if (kind === 'color' && out.look !== 'rainbow' && !out.hex) return null; }
  return out;
}

export function cleanCues(raw, { a, validPalettes, warn }) {
  const out = [];
  const period = 60 / a.bpm;
  const snap = (t) => { const b = nearest(a.beats, t); return Math.abs(b - t) <= period * 0.4 ? b : t; };
  (Array.isArray(raw) ? raw : []).forEach((c, i) => {
    const ctx = `cue ${i + 1}`;
    if (!c || typeof c !== 'object') return;
    if (!ITEM.layer.enum.includes(c.layer)) { warn(`${ctx}: unknown layer "${c.layer}" dropped`); return; }
    let t = num(c.t);
    if (t == null || t < 0 || t >= a.duration) { warn(`${ctx}: time ${c.t} outside the song; dropped`); return; }
    t = r3(snap(t));
    const cue = { t, layer: c.layer };
    if (GROUPS.includes(c.group) && c.group !== 'all') cue.group = c.group;
    let until = num(c.until);
    if (until != null) { until = r3(Math.min(a.duration, snap(until))); if (until > t) cue.until = until; }
    for (const k of Object.keys(PART_KEYS)) {
      if (k === 'move' && ['pixel', 'strobe', 'blinder', 'tube', 'matrix'].includes(c.layer)) continue;
      const part = cleanPart(k, c[k], validPalettes, warn, ctx);
      if (part) cue[k] = part;
    }
    if (c.fx != null) { if (FX[c.fx]) cue.fx = c.fx; else warn(`${ctx}: unknown fx "${c.fx}"`); }
    if (num(c.dur) != null && c.dur >= 0) cue.dur = r3(Math.min(c.dur, 30));
    if (typeof c.note === 'string') cue.note = c.note.slice(0, 200);
    if (!cue.move && !cue.dim && !cue.color && !cue.fx) return;
    out.push(cue);
  });
  return out.slice(0, 420);
}

export function cleanAccents(raw, { a, warn }) {
  const out = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = num(x?.t);
    if (t == null || t < 0 || t > a.duration || !ACCENT_TYPES[x.type]) { warn(`accent at ${x?.t} (${x?.type}) dropped`); continue; }
    const acc = { t: r3(t), type: x.type };
    if (num(x.strength) != null) acc.strength = Math.max(0, Math.min(1, x.strength));
    if (num(x.dur) != null && x.dur >= 0) acc.dur = r3(Math.min(x.dur, 20));
    if (x.fx && (FX[x.fx] || x.fx === 'none')) acc.fx = x.fx;
    if (typeof x.note === 'string') acc.note = x.note.slice(0, 200);
    out.push(acc);
  }
  return out;
}

// Overlay: for each override cue, the baseline cues of the same layer it overlaps are split at its
// edges and the overlapped piece takes the override's move/dim/color on top of what was there.
export function overlay(base, overrides, sections, duration) {
  let cues = base.map((c) => ({ ...c }));
  const parts = overrides.filter((o) => o.move || o.dim || o.color);
  const oneShots = overrides.filter((o) => !(o.move || o.dim || o.color));
  const sectionEnd = (t) => (sections.find((s) => t >= s.start && t < s.end) || { end: duration }).end;
  for (const o of parts) {
    const t0 = o.t, t1 = o.until ?? sectionEnd(o.t);
    const next = [];
    let covered = false;
    for (const b of cues) {
      const bEnd = b.until ?? duration;
      // one-shot effects (blackout, flash, CO2...) are moments, not spans: never split, stretch or duplicate them
      if (b.fx && !b.move && !b.dim && !b.color) { next.push(b); continue; }
      if (b.layer !== o.layer || bEnd <= t0 || b.t >= t1 || (o.group && b.group !== o.group)) { next.push(b); continue; }
      covered = true;
      if (b.t < t0) next.push({ ...b, until: r3(t0) });
      const mid = { ...b, t: r3(Math.max(b.t, t0)), until: r3(Math.min(bEnd, t1)) };
      for (const k of ['move', 'dim', 'color']) if (o[k]) mid[k] = o[k];
      if (o.note) mid.note = o.note;
      next.push(mid);
      if (bEnd > t1) next.push({ ...b, t: r3(t1) });
    }
    if (!covered) next.push({ ...o, until: o.until ?? r3(t1) });
    cues = next;
  }
  const min = 0.25;
  cues = cues.filter((c) => (c.until ?? duration) - c.t >= min || c.fx);
  return [...cues, ...oneShots].sort((x, y) => x.t - y.t);
}

// Phrases: the lyric architecture. Snapped to bar lines, gap-free, with the return count of each motif computed here
// so the agent only has to say which phrase is which.
export function cleanPhrases(raw, a, sections, warn) {
  const downs = [...new Set([0, ...a.downbeats.filter((t) => t > 0 && t < a.duration), a.duration])].sort((x, y) => x - y);
  const list = (Array.isArray(raw) ? raw : []).filter((p) => num(p?.start) != null && num(p?.end) != null && p.end > p.start).sort((x, y) => x.start - y.start);
  if (list.length < 3) return null;
  const barSec = (60 / a.bpm) * (a.meter || 4);
  const bounds = [0];
  for (let i = 1; i < list.length; i++) bounds.push(nearest(downs, (list[i - 1].end + list[i].start) / 2));
  bounds.push(a.duration);
  const out = [];
  const motifs = new Set();
  for (let i = 0; i < list.length; i++) {
    const t = bounds[i], until = bounds[i + 1];
    if (until - t < barSec * 0.8) { if (out.length) out[out.length - 1].until = r3(until); continue; }
    const p = list[i];
    const role = PHRASE_ROLES[p.role] ? p.role : (warn(`phrase ${i + 1}: unknown role "${p.role}" -> line`), 'line');
    const ph = { t: r3(t), until: r3(until), role };
    if (p.motif && role !== 'silence') { ph.motif = String(p.motif).slice(0, 24).replace(/\s+/g, '-'); motifs.add(ph.motif); }
    if (typeof p.gist === 'string' && p.gist.trim()) ph.gist = p.gist.trim().split(/\s+/).slice(0, 14).join(' ');
    if (IMAGES[p.image]) ph.image = p.image;
    if (role === 'silence' && p.dark === true) ph.dark = true;
    const sec = sections.find((s) => ph.t >= s.start - 1e-3 && ph.t < s.end - 1e-3);
    ph.energy = Math.max(0, Math.min(1, num(p.energy) ?? sec?.energy ?? 0.5));
    out.push(ph);
  }
  if (!out.length) return null;
  out[0].t = 0; out[out.length - 1].until = a.duration;
  const count = {};
  for (const p of out) if (p.motif) p.n = (count[p.motif] = (count[p.motif] || 0) + 1);
  if (!out.some((p) => p.role === 'refrain')) warn('the director marked no refrain; the lights have no recurring signature');
  return out;
}

export function cleanMotifs(raw, phrases) {
  const out = {};
  const used = new Set((phrases || []).map((p) => p.motif).filter(Boolean));
  for (const [id, m] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const key = String(id).slice(0, 24).replace(/\s+/g, '-');
    if (!used.has(key) || !m || typeof m !== 'object') continue;
    out[key] = { ...(m.name ? { name: String(m.name).slice(0, 60) } : {}), ...(m.gist ? { gist: String(m.gist).split(/\s+/).slice(0, 14).join(' ') } : {}), ...(PHRASE_ROLES[m.role] ? { role: m.role } : {}) };
  }
  for (const id of used) out[id] ||= {};
  return out;
}
