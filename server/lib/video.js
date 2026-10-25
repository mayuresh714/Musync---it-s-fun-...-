// The music video as evidence for the director.
//   1. measure: ffmpeg reads thumbnails at 4 fps, plain code turns them into a motion curve, cuts and step hits (no AI)
//   2. look: ffmpeg builds contact sheets and burst sheets; one Claude call reads them and writes a "video brief"
//   3. the director adds the brief and the motion column to its prompts (see brief.js / director.js)
// Video time equals audio time because the audio is taken from the same file. Everything here is optional:
// a caller catches any error and carries on from the audio alone.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { runClaude, extractJson } from './claude.js';
import { mmss } from './prompts.js';

export const VIDEO_TYPES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
export const isVideoFile = (name) => !!VIDEO_TYPES[extname(String(name || '')).toLowerCase()];

const RATE = 4, W = 48, H = 27, FRAME = W * H * 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const percentile = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---- measuring ------------------------------------------------------------------------------------

// Feeds raw rgb24 chunks in; per frame it keeps the mean brightness and the change from the frame before.
export function createFrameStats() {
  let rest = Buffer.alloc(0), prev = null;
  const out = { diff: [], bright: [], rgb: [] };
  return {
    out,
    push(chunk) {
      let buf = rest.length ? Buffer.concat([rest, chunk]) : chunk, o = 0;
      for (; o + FRAME <= buf.length; o += FRAME) {
        const cur = Uint8Array.from(buf.subarray(o, o + FRAME));
        let r = 0, g = 0, b = 0, sum = 0, d = 0;
        for (let p = 0; p < FRAME; p += 3) {
          r += cur[p]; g += cur[p + 1]; b += cur[p + 2]; sum += 0.299 * cur[p] + 0.587 * cur[p + 1] + 0.114 * cur[p + 2];
          if (prev) d += Math.abs(cur[p] - prev[p]) + Math.abs(cur[p + 1] - prev[p + 1]) + Math.abs(cur[p + 2] - prev[p + 2]);
        }
        out.diff.push(prev ? d / (FRAME * 255) : 0); out.bright.push(sum / (W * H) / 255);
        out.rgb.push([r, g, b].map((v) => Math.round(v / (W * H))));
        prev = cur;
      }
      rest = buf.subarray(o);
    },
  };
}

// raw per-frame differences -> a profile the director can use
export function profileOf(stats, duration = null) {
  const n = stats.diff.length, dur = duration || n / RATE;
  // a cut is a jump far above the recent usual change; its size says nothing about the dancing, so it is not counted as motion
  const cuts = [], motion = [];
  for (let i = 0; i < n; i++) {
    const d = stats.diff[i], recent = median(stats.diff.slice(Math.max(0, i - 12), i));
    const isCut = i > 0 && d > Math.max(0.12, recent * 4);
    if (isCut) { cuts.push(+(i / RATE).toFixed(2)); motion.push(motion.length ? motion[motion.length - 1] : 0); } else motion.push(d);
  }
  const ref = Math.max(percentile(motion, 0.95), 0.004);
  const norm = motion.map((m) => clamp(m / (ref * 1.25), 0, 1));
  const smooth = norm.map((_, i) => { let s = 0, c = 0; for (let k = -1; k <= 1; k++) { const v = norm[i + k]; if (v != null) { s += v; c++; } } return s / c; });
  // hits: local peaks of the (lightly smoothed) motion, at least 0.75 s apart, strongest first
  const peaks = [];
  for (let i = 1; i < n - 1; i++) if (smooth[i] >= smooth[i - 1] && smooth[i] > smooth[i + 1] && smooth[i] > 0.55) peaks.push({ t: +(i / RATE).toFixed(2), strength: +smooth[i].toFixed(2) });
  const hits = [];
  for (const p of peaks.sort((a, b) => b.strength - a.strength)) if (hits.every((h) => Math.abs(h.t - p.t) >= 0.75)) hits.push(p);
  hits.sort((a, b) => a.t - b.t);
  const active = smooth.filter((v) => v > 0.25).length / Math.max(1, n);
  return { rate: RATE, duration: +dur.toFixed(2), motion: smooth.map((v) => +v.toFixed(3)), cuts, hits: hits.slice(0, 120), bright: stats.bright.map((v) => +v.toFixed(3)), rgb: stats.rgb,
    // a lyric video or a still photo barely moves: the director is told not to expect steps
    movement: active > 0.35 && ref > 0.01 ? 'busy' : active > 0.12 ? 'some' : 'little' };
}

export function measureVideo(file, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const st = createFrameStats();
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `fps=${RATE},scale=${W}:${H}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', (d) => st.push(d));
    p.stderr.on('data', (d) => { err += d; });
    const abort = () => p.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    p.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? 'ffmpeg is not installed' : e.message)));
    p.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new Error('cancelled'));
      if (code !== 0 || !st.out.diff.length) return reject(new Error(`the video could not be read${err ? `: ${err.trim().split('\n').pop().slice(0, 140)}` : ''}`));
      resolve(profileOf(st.out));
    });
  });
}

// per bar: how much the picture moves, 0-9 (relative to this video's own busiest bars). `bars` are { t } at bar starts.
export function barMotion(profile, bars, duration) {
  const at = (t) => clamp(Math.floor(t * profile.rate), 0, profile.motion.length - 1);
  return bars.map((b, i) => {
    const t1 = bars[i + 1]?.t ?? duration, i0 = at(b.t), i1 = Math.max(i0 + 1, at(t1));
    let s = 0, c = 0; for (let k = i0; k < i1 && k < profile.motion.length; k++) { s += profile.motion[k]; c++; }
    const cuts = profile.cuts.filter((x) => x >= b.t && x < t1).length;
    return { m: clamp(Math.round((c ? s / c : 0) * 9), 0, 9), cuts };
  });
}

// the step hits that land on a beat (within 90 ms): the moments the lights can answer exactly
export function hitsOnBeat(profile, beats, limit = 40) {
  const out = [];
  for (const h of profile.hits) {
    let best = null; for (const b of beats) { const d = Math.abs(b - h.t); if (!best || d < best.d) best = { b, d }; if (b > h.t + 0.5) break; }
    out.push({ t: best && best.d <= 0.09 ? +best.b.toFixed(2) : h.t, strength: h.strength, onBeat: !!(best && best.d <= 0.09) });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, limit).sort((a, b) => a.t - b.t);
}

export function extractAudio(videoFile, outFile) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', videoFile, '-vn', '-c:a', 'aac', '-b:a', '192k', outFile], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffmpeg is needed to read videos (${r.error.message}). Install it with: brew install ffmpeg`);
  if (r.status !== 0) throw new Error(/does not contain any stream|Output file.*no streams|matches no streams/i.test(r.stderr) ? 'That video has no sound track.' : `That video could not be read: ${r.stderr.trim().split('\n').pop().slice(0, 160)}`);
}

// ---- contact sheets -------------------------------------------------------------------------------

const FONTS = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'];
const font = () => FONTS.find((f) => existsSync(f));
const FW = 480, FH = 270;

function sheet(file, out, { start, span, step, label }) {
  const fnt = font();
  const base = `fps=1/${step},scale=${FW}:${FH}:force_original_aspect_ratio=decrease,pad=${FW}:${FH}:(ow-iw)/2:(oh-ih)/2:black`;
  // each tile carries its own time in seconds so the reader never has to count
  const text = fnt && label ? `,drawtext=fontfile=${fnt}:text='%{eif\\:floor(t+${start.toFixed(3)})\\:d}.%{eif\\:mod(floor((t+${start.toFixed(3)})*10)\\,10)\\:d}s':x=8:y=8:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65` : '';
  for (const withText of fnt && label ? [true, false] : [false]) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(span), '-i', file, '-an', '-vf', `${base}${withText ? text : ''},tile=3x3`, '-frames:v', '1', '-q:v', '4', out], { encoding: 'utf8' });
    if (r.status === 0 && existsSync(out)) return withText;
  }
  return null;
}

// -> { dir, sheets: [{ file, kind, start, step, count }] }: coarse sheets over the whole video, then bursts around the biggest hits
export function makeSheets(file, dir, profile, { maxCoarse = 10, bursts = 5 } = {}) {
  const out = join(dir, 'frames');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const dur = profile.duration, per = 9;
  const step = Math.max(2, Math.ceil(dur / (maxCoarse * per)));
  const sheets = [];
  for (let s = 0; s * per * step < dur; s++) {
    const start = s * per * step, f = `overview-${String(s + 1).padStart(2, '0')}.jpg`;
    if (sheet(file, join(out, f), { start, span: per * step, step, label: true }) != null) sheets.push({ file: `frames/${f}`, kind: 'overview', start: Math.round(start), step, count: Math.min(per, Math.ceil((dur - start) / step)) });
  }
  // bursts: nine frames a quarter second apart, where the picture moves most, spread across the video
  const picked = [];
  // a peak next to a camera cut is the edit, not the dancers: bursts are taken where people move inside one shot
  const inShot = (t) => !profile.cuts.some((c) => c > t - 1.2 && c < t + 1.3);
  for (const h of [...profile.hits].filter((h) => inShot(h.t)).sort((a, b) => b.strength - a.strength)) if (picked.length < bursts && picked.every((p) => Math.abs(p - h.t) > Math.max(10, dur / 14))) picked.push(h.t);
  picked.sort((a, b) => a - b).forEach((t, i) => {
    const start = clamp(t - 1, 0, Math.max(0, dur - 2.5)), f = `burst-${i + 1}.jpg`;
    if (sheet(file, join(out, f), { start, span: 2.3, step: 0.25, label: true }) != null) sheets.push({ file: `frames/${f}`, kind: 'burst', start: +start.toFixed(2), step: 0.25, count: 9 });
  });
  return { dir: out, sheets };
}

// ---- the video brief (one Claude call that reads the sheets) --------------------------------------

export const VIDEO_SYSTEM = `You are the choreography reader for a lighting director. A music video is given to you as contact sheets: JPEG grids of 3 by 3 frames, read left to right, top to bottom, each tile stamped with its time in seconds. "overview" sheets cover the whole video at an even spacing. "burst" sheets show about two seconds at four frames a second where the picture moves most, so you can see a step happen. Open every sheet with the Read tool, then write the brief the director will use.

What the lights will do with your brief: follow the dancers' steps, mirror the emotion of each scene, borrow the costume and set colours, and bring the signature step back as the same light motif each time it returns. Audiences who know the video notice when the lights copy it.

Rules:
- Describe only what you can see. If a sheet is unclear, say so. Do not invent steps. If the video is a lyric video, a still image, a slideshow, a performance of a band or has no dancing, say that in "usefulness" and keep the scenes short.
- Never identify a real person from their face. Name people only by role and look ("lead dancer in a red lehenga", "man in a black bandhgala"). If the title or artist is given and you know who the lead actors are in that song, you may use those names for the roles, but say it comes from your knowledge of the song, not from the faces.
- Name steps in the language of the dance if you recognise them (garba clap, dandiya strike, dodhiyu, hook step, bhangra shoulder, mudra, spin, lift, walk, freeze), otherwise describe the movement in plain words ("both arms sweep up and out", "line of dancers stamps in unison").
- Times are seconds in the video, taken from the stamps on the tiles. Scenes must not overlap and should cover the video, merging neighbours that are alike (aim for 6 to 18 scenes).
- Colours are "#rrggbb" of the costumes, set and light you see most, at most 4 per scene.
- For every signature step list EVERY time it happens in "at" (use the burst sheets and the overview tiles; a hook step usually returns many times). Be generous with the list but never guess a time you cannot see. The lights repeat their answer at each time.
- energy is 0 to 9: how much happens in the picture (0 still, 9 everyone moving at full speed).

Reply with ONE JSON object and nothing else:
{
 "usefulness": "rich | some | little, and why in one sentence",
 "summary": "2 sentences: what the video is and how it moves",
 "cast": [ { "role": "lead | supporting | ensemble | crowd | band", "look": "plain description", "does": "what they mainly do" } ],
 "scenes": [ { "start": sec, "end": sec, "setting": "where", "focus": "who the camera is on", "action": "what they do, the step", "emotion": "2-4 words", "energy": 0-9, "colors": ["#rrggbb"], "camera": "static | handheld | tracking | cranes | cuts fast" } ],
 "steps": [ { "name": "step name", "what": "how it looks", "at": [sec, sec] } ],
 "emotionArc": "one line",
 "lights": ["up to 6 short ideas for the lights, each tied to something you saw, e.g. 'the lead's spin at 1:12 -> one beam pair sweeps round together'"]
}`;

const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim().toLowerCase() : null);
const text = (v, n = 160) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function cleanBrief(j, duration) {
  if (!j || typeof j !== 'object') return null;
  const scenes = (Array.isArray(j.scenes) ? j.scenes : []).map((s) => ({
    start: clamp(Number(s.start), 0, duration), end: clamp(Number(s.end), 0, duration), setting: text(s.setting, 90), focus: text(s.focus, 110), action: text(s.action, 200),
    emotion: text(s.emotion, 50), energy: clamp(Math.round(Number(s.energy) || 0), 0, 9), colors: (Array.isArray(s.colors) ? s.colors.map(hex).filter(Boolean) : []).slice(0, 4), camera: text(s.camera, 40),
  })).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start).sort((a, b) => a.start - b.start).slice(0, 30);
  const steps = (Array.isArray(j.steps) ? j.steps : []).map((s) => ({ name: text(s.name, 60), what: text(s.what, 180), at: (Array.isArray(s.at) ? s.at.map(Number).filter((t) => Number.isFinite(t) && t >= 0 && t <= duration) : []).slice(0, 12) })).filter((s) => s.name).slice(0, 10);
  if (!scenes.length && !steps.length) return null;
  return {
    usefulness: text(j.usefulness, 200), summary: text(j.summary, 320),
    cast: (Array.isArray(j.cast) ? j.cast : []).map((c) => ({ role: text(c.role, 20), look: text(c.look, 120), does: text(c.does, 140) })).filter((c) => c.look || c.does).slice(0, 6),
    scenes, steps, emotionArc: text(j.emotionArc, 200), lights: (Array.isArray(j.lights) ? j.lights : []).map((l) => text(l, 220)).filter(Boolean).slice(0, 6),
  };
}

export function watchPrompt({ sheets, profile, meta, research }) {
  const list = sheets.map((s) => `${s.file}: ${s.kind}, tiles every ${s.step}s starting at ${s.start}s (${s.count} tiles)`).join('\n');
  const cuts = profile.cuts.length;
  return `Video length ${profile.duration}s. ${cuts} camera cuts measured (${cuts ? `about one every ${(profile.duration / cuts).toFixed(1)}s` : 'a single continuous shot'}). Measured amount of movement: ${profile.movement}.
${meta.title ? `title: ${meta.title}\n` : ''}${meta.artist ? `artist: ${meta.artist}\n` : ''}${meta.style ? `style hint: ${meta.style}\n` : ''}${research ? `\nBACKGROUND ON THE SONG (from a researcher; context only)\n${research.slice(0, 1500)}\n` : ''}
SHEETS TO OPEN WITH THE READ TOOL (files in your working folder):
${list}

Write the brief now.`;
}

export async function watchVideo({ dir, sheets, profile, meta, research, signal, model, onText }) {
  const reply = await runClaude({ system: VIDEO_SYSTEM, prompt: watchPrompt({ sheets, profile, meta, research }), cwd: dir, signal, model, tools: 'Read', effort: process.env.MUSYNC_EFFORT_VIDEO || 'low', timeoutMs: 6 * 60 * 1000, onText });
  const brief = cleanBrief(extractJson(reply.text), profile.duration);
  if (!brief) throw new Error('the video reader returned no usable scenes');
  return { brief, costUsd: reply.costUsd, ms: reply.ms };
}

// ---- what the director reads ----------------------------------------------------------------------

export function videoBlock(brief, profile, beats = []) {
  const hits = hitsOnBeat(profile, beats, 30);
  const sc = brief.scenes.map((s) => `  ${mmss(s.start)}-${mmss(s.end)} e${s.energy} ${s.emotion ? `[${s.emotion}] ` : ''}${s.focus ? `${s.focus}: ` : ''}${s.action}${s.setting ? ` (${s.setting})` : ''}${s.colors.length ? ` colours ${s.colors.join(' ')}` : ''}`).join('\n');
  const st = brief.steps.map((s) => `  ${s.name}: ${s.what}${s.at.length ? ` at ${s.at.map(mmss).join(', ')}` : ''}`).join('\n') || '  (none seen)';
  return `MUSIC VIDEO (somebody watched it for you; video time is the same as audio time)
usefulness: ${brief.usefulness || 'unknown'}; measured movement: ${profile.movement}; ${profile.cuts.length} cuts
${brief.summary}
cast: ${brief.cast.map((c) => `${c.role} (${c.look}${c.does ? `, ${c.does}` : ''})`).join('; ') || 'not clear'}
emotion arc: ${brief.emotionArc || 'n/a'}
scenes:
${sc}
steps seen:
${st}
what the lights could answer: ${brief.lights.join(' | ') || 'n/a'}
STRONGEST MOVEMENT PEAKS measured in the picture (time, strength 0-1${beats.length ? ', * = lands on a beat' : ''}): ${hits.map((h) => `${mmss(h.t)}${h.onBeat ? '*' : ''} ${h.strength}`).join(', ') || 'none'}`;
}

export const VIDEO_RULES = `

THE MUSIC VIDEO
A "MUSIC VIDEO" block describes what the video shows: who dances, the steps, the emotion of each scene, the costume colours and the measured movement peaks. The bar table also has a "v" column: how much the picture moves in that bar (0-9) and "c" for camera cuts. People who know the song know the video, so the lights should answer it.
- Trust the bar table for WHERE sections start; use the video to explain WHAT each section is: solo lead = few focused figures; ensemble or crowd = wide, many-headed figures; a calm romantic scene = slow, warm and soft; fast footwork = fast, tight movement. A cut to a new scene on or next to a bar start is a strong hint for a section boundary.
- Give each section "move" figures that match the steps the dancers do (sweeping arms = fan or sweep, stamping line = pulse or chase, spin = rotate, freeze = a held pose or a blackout). In "idea" say which step it answers.
- Costume and set colours are the first choice for palettes; the emotion of the scene decides warm or cool, soft or hard.
- Signature steps are signature moments: put each in "moments" with the exact time, and make a step that returns use the same motif each time (the audience should recognise it).
- If usefulness is "little" or movement is "little", the video says almost nothing about dance: lean on the music and lyrics as usual and do not invent steps.`;

export const VIDEO_CUE_RULES = `

THE MUSIC VIDEO
The director's bible already carries the video's ideas. In the cue prompt you also get the strongest movement peaks measured in the picture (* = on a beat). Where the picture has a strong peak that lands on a beat, answer it with an accent, a one-shot fx or a snap in the move layer at exactly that time (use the listed time), but never more than one such answer every two seconds and not in a quiet or silent section. Keep the figure and the colour of the scene the video shows.`;

// removes the video and the frames once they have been used
export function cleanVideoFiles(dir) {
  try { for (const f of readdirSync(dir)) if (/^video\.\w+$/.test(f)) rmSync(join(dir, f), { force: true }); } catch { /* already gone */ }
  rmSync(join(dir, 'frames'), { recursive: true, force: true });
}
