// The show designer: the pass where the agent composes the things that make this song's show its own.
//  - the OPENING: how the show begins (often slow and grand, before the first line)
//  - the ELEVATION: how the show climbs, section by section, and which equipment each level may use
//  - GESTURES: short pieces of choreography written by the agent for a step of the dancers or a returning line,
//    in beats, on any layer and group (for example two pairs of sharpies answering each other). Code does not
//    invent the gesture; it only plays the agent's gesture again, identically, at every time it returns, because
//    a gesture the room has seen once is one it can dance to the second time.
import { VOCAB_TEXT, mmss } from './prompts.js';
import { cleanCues } from './merge.js';

export const DESIGN_SYSTEM = `You are the show designer for a live light show. A director has read the song (the bible, below) and, when there is a music video, a reader has described what the dancers do. A choreography engine already lights every phrase. Your job is the part only a designer can do: compose this song's own signature, as a few pieces of light choreography.

WAL VOCABULARY (the lights are described by role, never by fixture; every rig maps its own lights to these roles)
${VOCAB_TEXT}

THE THREE THINGS YOU WRITE

1. OPENING. How the show begins. A song usually does not start at full power: a slow, grand start (one colour rising from nothing, a single pair of beams opening like a curtain, a spot finding the first sound) earns the first big moment. Say how many bars it lasts, and write its cues.

2. ELEVATION. A climb of levels over the song, 0 to 9, each stretch of the song at one level. The level decides which equipment may speak:
   0-2 the wash and one or two beams or a spot, slow; 3-4 all beams and the grid, moderate; 5-6 everything above, faster, a blinder on the beat; 7-8 strobes and lasers join; 9 stage effects (CO2, confetti) and everything at once, for the one or two real peaks only.
   Start low, climb with the story, come back down at breaks and bridges so the last chorus is the highest. Do not sit at one level for the whole song. Give 5 to 12 stretches that cover the song.

3. GESTURES. A gesture is a few bars of cues, in BEATS from the gesture's start (beat 0). It is played again, identically, every time it returns. Write one for:
   - the signature step of the dancers (when a video brief lists one), so the lights do the step when the dancers do it;
   - the hook line (the refrain), so the crowd learns the show;
   - a second or third step or line that returns (a stanza line, an answer, a spin, a freeze), only if it truly returns.
   Compose each as a little piece of choreography with a shape: a call and an answer, a build and a hit, a sweep that opens and a hold. Use the groups. When the video has two leads, a pair, or a line of dancers answering one another, or the hook is a call and answer, give the beams in pairs of two (pairA and pairB) the call and the answer, so two pairs of sharpies do the step together and then trade it; left and right pass a figure across the room; inner opens while outer holds; odd and even alternate. Use more than one layer: the beams make the figure, the pixels and tubes play its rhythm, the wash holds the colour, a blinder or a flash marks the hit. Colours come from the song's palettes or from the costume colours of that scene. Do not copy the same shape for every gesture; the step of a spin and the step of a hip sway should not look alike.

TIMES AND REPEATS
- A gesture lists WHERE it plays in "at" (seconds, taken from the video steps' times or from the phrase table; never inside a silence) and/or "onMotif" (a motif id from the bible: it then plays at the start of every phrase of that motif).
- Cue timing inside a gesture: "beat" (0 = gesture start) and "beats" (length). A gesture is 2 to 8 beats long. Keep to what the beat grid allows: nothing shorter than one beat.
- A gesture tied to a returning line repeats itself until that line ends, so design it to loop cleanly (its last beat leads back into its first).
- At most 40 plays in the whole song. Never two gestures overlapping in time on the same layer.

QUIET IS DESIGN, NOT DARKNESS
Silence and slow lines are lit with low, breathing colour, never black. The only dark is the one or two stops the director flagged.

Reply with ONE JSON object and nothing else:
{
 "concept": "2 sentences: the idea of this show in plain words",
 "opening": { "idea": "what happens and why", "bars": 4-16, "cues": [ { "beat": 0, "beats": 8, "layer": str, "group": "optional", "move": {...}, "dim": {...}, "color": {...}, "fx": "optional", "dur": sec } ] },
 "elevation": [ { "from": sec, "to": sec, "level": 0-9, "why": "short" } ],
 "gestures": [ { "id": "short-id", "answers": "the step or line it answers, in words", "at": [sec], "onMotif": "motif id (optional)", "beats": 2-8, "cues": [ same cue fields as the opening ] } ]
}`;

export function designPrompt({ bible, sections, phraseText, momentsText, video, barText, a }) {
  const u = bible.understanding || {};
  return `SONG: ${u.title || ''} ${u.artist ? `by ${u.artist}` : ''}; ${a.bpm} BPM; ${a.duration.toFixed(0)} s; beat ${(60 / a.bpm).toFixed(3)} s; bar ${(240 / a.bpm).toFixed(2)} s.
STORY: ${u.story || ''}
EMOTION: ${u.emotionalArc || ''}; MOOD: ${u.mood || ''}; CULTURE: ${u.culture || ''}
VISUAL IDENTITY: ${u.visualIdentity || ''}

SECTIONS
${sections.map((s) => `${mmss(s.start)}-${mmss(s.end)} ${s.kind} "${s.label}" energy ${s.energy} palette ${s.palette}${s.move?.length ? ` move ${s.move.join('/')}` : ''}${s.idea ? ` : ${s.idea}` : ''}`).join('\n')}

PALETTES
${Object.entries(bible.palettes || {}).map(([k, v]) => `${k}: ${v.join(' ')}`).join('\n') || '(built-in palettes by name)'}

PHRASES (role, motif)
${phraseText}

SIGNATURE MOMENTS
${momentsText}
${video ? `\n${video.text}\n${video.peaks}\n` : '\n(No video: design gestures only for the hook line and the lines that return.)\n'}
BAR TABLE
${barText}

Design the show now.`;
}

const tidy = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');

export function checkDesign(j) {
  const p = [];
  if (!j || typeof j !== 'object') return ['the reply is not an object'];
  if (!Array.isArray(j.gestures) || !j.gestures.length) p.push('"gestures" must have at least one gesture (the hook, or a step that returns)');
  else j.gestures.forEach((g, i) => { if (!Array.isArray(g?.cues) || !g.cues.length) p.push(`gestures[${i}] needs cues`); if (!(Array.isArray(g?.at) && g.at.length) && !g?.onMotif) p.push(`gestures[${i}] needs "at" times or "onMotif"`); });
  if (!Array.isArray(j.elevation) || j.elevation.length < 3) p.push('"elevation" must be 3 or more stretches covering the song');
  return p;
}

// turns beat-relative cues into absolute cues at time t0
function place(list, t0, spb, cap) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c !== 'object') continue;
    const b = Math.max(0, Number(c.beat) || 0), len = Math.max(1, Number(c.beats) || 1);
    const { beat, beats, ...rest } = c;
    out.push({ ...rest, t: t0 + b * spb, until: Math.min(cap, t0 + (b + len) * spb) });
  }
  return out;
}

// design: the agent's reply; returns { cues, plays, elevation, opening } with every cue cleaned like any model output
export function expandDesign(design, { a, phrases, validPalettes, warn = () => {} }) {
  const spb = 60 / a.bpm, meter = a.meter || 4;
  const silent = (t) => (phrases || []).some((p) => p.role === 'silence' && t >= p.t - 0.01 && t < p.until);
  const raw = [];
  let plays = 0;
  const o = design.opening;
  if (o?.cues?.length) {
    const bars = Math.max(2, Math.min(24, Math.round(Number(o.bars) || 8)));
    raw.push(...place(o.cues, 0, spb, Math.min(a.duration, bars * meter * spb)).map((c) => ({ ...c, note: c.note || 'opening' })));
  }
  const taken = []; // [layer, t, until] so two plays of gestures never overlap on one layer
  for (const g of (design.gestures || []).slice(0, 8)) {
    const times = new Set((Array.isArray(g.at) ? g.at : []).map(Number).filter((t) => Number.isFinite(t) && t >= 0 && t < a.duration));
    if (g.onMotif) for (const p of phrases || []) if (p.motif === g.onMotif) times.add(p.t);
    const len = Math.max(2, Math.min(8, Math.round(Number(g.beats) || 4))) * spb;
    const ends = new Map((phrases || []).filter((p) => g.onMotif && p.motif === g.onMotif).map((p) => [p.t, p.until]));
    // a gesture on a returning line keeps repeating until the line ends (the step goes on while the line does), up to four times
    const starts = [...times].sort((x, y) => x - y).flatMap((t0) => { const e = ends.get(t0); const r = [t0]; if (e) for (let k = 1; k < 4 && t0 + k * len + len * 0.6 < e; k++) r.push(t0 + k * len); return r; });
    for (const t0 of starts) {
      if (plays >= 40 || silent(t0)) continue;
      const cues = place(g.cues, t0, spb, a.duration).map((c) => ({ ...c, note: `${tidy(g.id)}: ${tidy(g.answers)}`.slice(0, 190) }));
      if (cues.some((c) => taken.some(([l, s, e]) => l === c.layer && c.t < e && (c.until ?? c.t) > s && !c.fx))) continue;
      for (const c of cues) if (!c.fx || c.move || c.dim || c.color) taken.push([c.layer, c.t, c.until ?? c.t]);
      raw.push(...cues);
      plays++;
    }
  }
  const cues = cleanCues(raw, { a, validPalettes, warn });
  const elevation = (Array.isArray(design.elevation) ? design.elevation : []).map((e) => ({ from: Number(e.from), to: Number(e.to), level: Math.max(0, Math.min(9, Math.round(Number(e.level)))), why: tidy(e.why).slice(0, 120) })).filter((e) => Number.isFinite(e.from) && Number.isFinite(e.to) && e.to > e.from && Number.isFinite(e.level)).sort((x, y) => x.from - y.from);
  return { cues, plays, elevation, concept: tidy(design.concept), opening: o ? { idea: tidy(o.idea), bars: o.bars } : null };
}

// The climb. A level lets some equipment speak and keeps the rest quiet: below 7 no lasers or strobes, below 5 no blinders,
// below 9 no stage effects. The engine's cues for the layers that are held back are removed for that stretch.
const GATES = [[7, ['strobe', 'laser']], [5, ['blinder']]];
const STAGE_FX = new Set(['co2', 'flame', 'confetti', 'streamers', 'spark']);
export function applyElevation(cues, elevation) {
  if (!elevation?.length) return { cues, removed: 0 };
  const level = (t) => (elevation.find((e) => t >= e.from && t < e.to) || elevation[elevation.length - 1]).level;
  let removed = 0;
  const kept = cues.filter((c) => {
    const L = level(c.t);
    if (c.fx && STAGE_FX.has(c.fx) && L < 9 && !(c.fx === 'spark' && L >= 7)) { removed++; return false; }
    for (const [min, layers] of GATES) if (L < min && layers.includes(c.layer) && !c.fx) { if (c.dim?.look === 'off') return true; removed++; return false; }
    return true;
  });
  return { cues: kept, removed };
}
