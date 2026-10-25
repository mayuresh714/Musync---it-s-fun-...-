// The director: audio -> analysis -> (lyrics) -> Claude bible -> Claude cue sheet -> validated WAL.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { analyze, draftWal, validateWal, summarize, TARGET_SR } from '../../core/index.js';
import { fixTempo } from '../../core/analysis/grid.js';
import { PALETTES, STYLES } from '../../core/wal/vocab.js';
import { runClaude, extractJson } from './claude.js';
import { findLyrics, cleanName } from './lyrics.js';
import { biblePrompt, cuesPrompt, barTable, phraseLines, researchPrompt } from './brief.js';
import { BIBLE_SYSTEM, CUES_SYSTEM, RESEARCH_SYSTEM, repairPrompt, mmss } from './prompts.js';
import { measureVideo, makeSheets, watchVideo, barMotion, hitsOnBeat, videoBlock, VIDEO_RULES, VIDEO_CUE_RULES } from './video.js';
import { stepCues } from './steps.js';
import { DESIGN_SYSTEM, designPrompt, checkDesign, expandDesign, applyElevation } from './design.js';
import { critic } from './critic.js';
import { snapSections, cleanPalettes, cleanCues, cleanAccents, overlay, cleanPhrases, cleanMotifs } from './merge.js';

// said once after the video block so the director cannot read more into a thin video than it holds
const VIDEO_NOTE = (profile, dur) => (profile.movement === 'little' ? '\nNOTE: almost nothing moves in this picture (a lyric video or stills). Do not expect steps from it.' : '');

export function decodeAudio(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(TARGET_SR), '-'], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`ffmpeg is needed to read audio files (${r.error.message}). Install it with: brew install ffmpeg`);
  if (r.status !== 0) throw new Error(`That file could not be decoded as audio: ${r.stderr.toString().slice(0, 200)}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4).slice();
}

const write = (dir, name, data) => writeFileSync(join(dir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1));

async function askJson({ system, prompt, label, effort, cwd, signal, emit, stage, stats, validate, model }) {
  let reply = await runClaude({ system, prompt, effort, cwd, signal, model, onText: (n, txt) => emit({ stage, chars: n, progress: stats?.(txt) }) });
  const log = [{ label, ms: reply.ms, costUsd: reply.costUsd }];
  for (let attempt = 0; attempt < 2; attempt++) {
    let json, problems = [];
    try { json = extractJson(reply.text); problems = validate(json); } catch (e) { problems = [`could not parse your reply as JSON: ${e.message}`]; }
    if (!problems.length) return { json, log };
    if (attempt === 1) throw new Error(`${label}: the agent's reply stayed invalid after one repair (${problems.slice(0, 3).join('; ')})`);
    emit({ stage, repair: true, detail: `Fixing ${problems.length} problem${problems.length > 1 ? 's' : ''} in the reply` });
    reply = await runClaude({ system, prompt: repairPrompt(label, problems, reply.text.slice(0, 40000)), effort, cwd, signal, model, onText: (n) => emit({ stage, chars: n }) });
    log.push({ label: `${label} (repair)`, ms: reply.ms, costUsd: reply.costUsd });
  }
}

export async function direct({ audioPath, videoPath = null, filename, title, artist, style, lyricsText, notes, dir, signal, emit = () => {}, model }) {
  mkdirSync(dir, { recursive: true });
  const warnings = [];
  const warn = (w) => warnings.push(w);
  const t0 = Date.now();
  const timings = {};
  const lap = (k) => { timings[k] = Date.now() - t0 - Object.values(timings).reduce((s, v) => s + v, 0); };

  emit({ stage: 'decode', detail: 'Reading the audio' });
  const samples = decodeAudio(audioPath);
  lap('decode');
  emit({ stage: 'analyze', detail: 'Measuring tempo, beats, energy and bands' });
  let a = analyze(samples, TARGET_SR, { meter: 4 });
  const raw = { bpm: a.bpm, sections: a.sections.length };
  a = fixTempo(a, 'auto');
  write(dir, 'analysis.json', a);
  lap('analyze');
  emit({ stage: 'analyze', done: true, data: { bpm: a.bpm, duration: a.duration, key: a.key, tempoNote: a.tempoNote, rawBpm: raw.bpm } });

  emit({ stage: 'lyrics', detail: 'Looking up the lyrics' });
  let lyrics = null;
  if (lyricsText?.trim()) lyrics = { source: 'provided by you', track: title || cleanName(filename), artist: artist || '', listedDuration: a.duration, plain: lyricsText.trim(), synced: null };
  else {
    try { lyrics = await findLyrics({ filename, title, artist, duration: a.duration, signal }); } catch (e) { if (signal?.aborted) throw e; }
  }
  if (lyrics) write(dir, 'lyrics.txt', lyrics.plain);
  lap('lyrics');
  emit({ stage: 'lyrics', done: true, data: lyrics ? { source: lyrics.source, track: lyrics.track, artist: lyrics.artist, lines: lyrics.plain.split('\n').filter(Boolean).length } : { source: null } });
  if (!lyrics) warn('No lyrics were found. The show follows the music and the agent\'s own knowledge of the song. Paste the lyrics to improve it.');

  const meta = { filename, title, artist, style, notes };
  const palNames = Object.keys(PALETTES);

  // ---- pass 0: research ----------------------------------------------------------------
  // Web search only. Learns what the song is, where it comes from and how crowds live it; the bible and the cue
  // sheet both read it. If the search is unavailable the director carries on from the audio, the words and its own knowledge.
  let research = '', researchLog = [];
  if (process.env.MUSYNC_RESEARCH !== '0') {
    emit({ stage: 'research', detail: 'Looking up the song, its culture and its genre' });
    try {
      const r = await runClaude({ system: RESEARCH_SYSTEM, prompt: researchPrompt(a, meta, lyrics), tools: 'WebSearch', effort: process.env.MUSYNC_EFFORT_RESEARCH || 'low', cwd: dir, signal, model, timeoutMs: 4 * 60 * 1000, onText: (n) => emit({ stage: 'research', chars: n }) });
      research = r.text.trim();
      researchLog = [{ label: 'research', ms: r.ms, costUsd: r.costUsd }];
      write(dir, 'research.md', research);
    } catch (e) {
      if (signal?.aborted) throw e;
      warn(`The background research could not run (${String(e.message).slice(0, 90)}). The director worked from the audio, the lyrics and what it already knows.`);
    }
    lap('research');
    emit({ stage: 'research', done: true, data: { found: research.length > 0, chars: research.length } });
  }

  // ---- pass 0b: the music video (optional) ----------------------------------------------------
  // Measure the picture (motion, cuts, step hits), let Claude read contact sheets of it, and hand both to the director.
  // Any failure here only costs the video's evidence: the show is then made from the audio exactly as without a video.
  let video = null, videoLog = [], videoInfo = null;
  const vbars = () => (video ? barMotion(video.profile, barTable(a).bars, a.duration) : null); // recomputed if the tempo grid changes
  if (videoPath && process.env.MUSYNC_VIDEO !== '0') {
    emit({ stage: 'video', detail: 'Watching the video: dancers, steps and mood' });
    try {
      const profile = await measureVideo(videoPath, { signal });
      emit({ stage: 'video', detail: 'Reading frames of the video', data: { movement: profile.movement, cuts: profile.cuts.length } });
      const { sheets } = makeSheets(videoPath, dir, profile);
      if (!sheets.length) throw new Error('no frames could be taken from it');
      const seen = await watchVideo({ dir, sheets, profile, meta, research, signal, model, onText: (n) => emit({ stage: 'video', chars: n }) });
      write(dir, 'video.json', { brief: seen.brief, profile: { duration: profile.duration, movement: profile.movement, cuts: profile.cuts, hits: profile.hits } });
      videoLog = [{ label: 'video', ms: seen.ms, costUsd: seen.costUsd }];
      const peaks = hitsOnBeat(profile, a.beats, 30);
      video = {
        text: videoBlock(seen.brief, profile, a.beats) + VIDEO_NOTE(profile, a.duration),
        profile,
        peaks: `MOVEMENT PEAKS IN THE VIDEO (time, strength; * = lands on a beat)\n${peaks.map((h) => `${mmss(h.t)}${h.onBeat ? '*' : ''} ${h.strength}`).join('  ') || '(none)'}`,
        brief: seen.brief,
      };
      videoInfo = { usefulness: seen.brief.usefulness, summary: seen.brief.summary, scenes: seen.brief.scenes.length, steps: seen.brief.steps.map((x) => x.name), cast: seen.brief.cast.map((c) => `${c.role}: ${c.look}`), movement: profile.movement, cuts: profile.cuts.length, emotionArc: seen.brief.emotionArc };
      emit({ stage: 'video', done: true, data: videoInfo });
    } catch (e) {
      if (signal?.aborted) throw e;
      warn(`The video could not be used (${String(e.message).slice(0, 110)}). The show was made from the audio, the words and what the director knows about the song.`);
      emit({ stage: 'video', done: true, data: { failed: true } });
    }
    lap('video');
  }

  // ---- pass 1: the bible -------------------------------------------------------------
  emit({ stage: 'bible', detail: 'The director is listening to the numbers and reading the words' });
  const bibleReply = await askJson({
    system: BIBLE_SYSTEM + (video ? VIDEO_RULES : ''), prompt: biblePrompt(a, meta, lyrics, research, video && { ...video, bars: vbars() }), label: 'bible', effort: process.env.MUSYNC_EFFORT_BIBLE || 'medium', cwd: dir, signal, emit, stage: 'bible', model,
    stats: (txt) => ({ sections: (txt.match(/"kind"\s*:/g) || []).length }),
    validate(j) {
      const p = [];
      if (!j.understanding?.story) p.push('understanding.story is missing');
      if (!Array.isArray(j.sections) || j.sections.length < 2) p.push('sections must be an array of at least 2 sections covering the whole song');
      else j.sections.forEach((s, i) => { if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.end <= s.start) p.push(`sections[${i}] needs numeric start < end`); });
      if (!Array.isArray(j.phrases) || j.phrases.length < 6) p.push('"phrases" must map the lyric architecture: an array of phrases (lines, refrain returns, tagline) covering the whole song');
      return p;
    },
  });
  const bible = bibleReply.json;
  write(dir, 'bible.json', bible);
  lap('bible');

  // optional tempo correction from the agent (relative to the repaired grid it read)
  const factor = [0.5, 2].includes(bible.tempo?.factor) ? bible.tempo.factor : 1;
  if (factor !== 1) { a = fixTempo(a, factor); warn(`The director changed the tempo grid x${factor} (${bible.tempo.why || 'no reason given'}): now ${a.bpm} BPM.`); }

  const custom = cleanPalettes(bible.palettes, warn);
  const validPalettes = [...Object.keys(custom), ...palNames];
  const sections = snapSections(bible.sections, a, Object.keys(custom).length ? Object.keys(custom) : palNames, warn);
  if (!sections) throw new Error('The director returned no usable sections.');
  const styles = (bible.understanding?.styles || []).filter((s) => STYLES[s]);
  if (!styles.length) styles.push(STYLES[style] ? style : 'bollywood');
  const u = bible.understanding || {};
  const title2 = title || u.title || cleanName(filename);
  const phrases = cleanPhrases(bible.phrases, a, sections, warn);
  if (!phrases) warn('The director gave no usable phrase map, so the lights follow sections and repeated groups instead of the lyric lines.');
  const motifs = phrases ? cleanMotifs(bible.motifs, phrases) : {};
  const draftOpts = {
    phrases: phrases || undefined, motifs,
    title: title2, artist: artist || u.artist || undefined, styles, mood: u.mood, language: u.language, palettes: custom, sections,
    notes: [u.story, u.visualIdentity].filter(Boolean).join(' '),
    audio: { file: filename, sha256: createHash('sha256').update(readFileSync(audioPath)).digest('hex'), duration: a.duration },
    generator: `musync-director/0.2 (claude ${model || process.env.MUSYNC_MODEL || 'sonnet'})`,
  };
  const baseline = draftWal(a, draftOpts);
  emit({ stage: 'bible', done: true, data: { understanding: u, sections: sections.map((s) => ({ start: s.start, end: s.end, kind: s.kind, label: s.label, mood: s.mood, palette: s.palette })), palettes: { ...PALETTES, ...custom } } });

  // ---- pass 2: the cue sheet ---------------------------------------------------------
  emit({ stage: 'cues', detail: 'Writing the cue sheet, layer by layer' });
  const phraseText = phraseLines(baseline.phrases);
  const momentsText = (bible.moments || []).map((m) => `${mmss(m.t)}  ${m.what} -> ${m.light}`).join('\n') || '(none)';
  const cueCtx = { a, validPalettes, warn };
  // the dancers' signature steps: one recipe of light per step, played at every return of it
  // ---- pass 2a: the show designer (runs beside the cue sheet): opening, elevation and gestures the agent composes ----
  emit({ stage: 'design', detail: 'Composing the opening, the climb and the signature steps' });
  let design = null, designLog = [];
  const designJob = askJson({
    system: DESIGN_SYSTEM, prompt: designPrompt({ bible, sections, phraseText, momentsText, video, barText: barTable(a, vbars()).text, a }), label: 'design', effort: process.env.MUSYNC_EFFORT_DESIGN || 'medium', cwd: dir, signal, emit, stage: 'design', model,
    stats: (txt) => ({ gestures: (txt.match(/"answers"\s*:/g) || []).length }),
    validate: checkDesign,
  }).then((r) => {
    design = expandDesign(r.json, { a, phrases: baseline.phrases, validPalettes, warn });
    designLog = r.log; write(dir, 'design.json', { ...r.json, played: design.plays });
    emit({ stage: 'design', done: true, data: { concept: design.concept, plays: design.plays, levels: design.elevation.length } });
  }).catch((e) => {
    if (signal?.aborted) throw e;
    warn(`The show designer could not run (${String(e.message).slice(0, 100)}), so the signature steps use simple stock shapes and the climb is the engine's own.`);
    emit({ stage: 'design', done: true, data: { failed: true } });
  });
  const stepsFallback = () => (video?.brief ? stepCues(video.brief, a, baseline.phrases, validPalettes, warn) : []);
  let stepsAt = [];
  let wal = null;
  const cueReply = await askJson({
    system: CUES_SYSTEM + (video ? VIDEO_CUE_RULES : ''), prompt: cuesPrompt({ ...bible, sections }, a, phraseText, momentsText, barTable(a, vbars()).text, video?.peaks || ''), label: 'cues', effort: process.env.MUSYNC_EFFORT_CUES || 'low', cwd: dir, signal, emit, stage: 'cues', model,
    stats: (txt) => ({ cues: (txt.match(/"layer"\s*:/g) || []).length }),
    validate(j) {
      const p = [];
      if (!Array.isArray(j.cues) || j.cues.length < 5) return ['"cues" must be an array of cues (aim for 25-70)'];
      const cleaned = cleanCues(j.cues, { ...cueCtx, warn: (w) => p.push(w) });
      const accents = cleanAccents(j.accents, { a, warn: () => {} });
      wal = build(cleaned, accents);
      const v = validateWal(wal);
      p.push(...v.errors);
      return p.slice(0, 12);
    },
  });
  function build(cues, accents) {
    const w = structuredClone(baseline);
    w.palettes = { ...custom, ...(w.palettes || {}) }; // the designer's gestures may use a palette no section does
    w.cues = overlay(baseline.cues, [...cues, ...stepsAt], sections, a.duration);
    if (design?.elevation?.length) w.cues = applyElevation(w.cues, design.elevation).cues;
    w.accents = [...baseline.accents, ...accents].sort((x, y) => x.t - y.t);
    return w;
  }
  await designJob;
  stepsAt = design ? design.cues : stepsFallback();
  const cleanWarn = [];
  const finalCues = cleanCues(cueReply.json.cues, { ...cueCtx, warn: (w) => cleanWarn.push(w) });
  wal = build(finalCues, cleanAccents(cueReply.json.accents, { a, warn: (w) => cleanWarn.push(w) }));
  if (cleanWarn.length) warn(`${cleanWarn.length} detail${cleanWarn.length > 1 ? 's' : ''} in the cue sheet were adjusted to fit the WAL format (e.g. ${cleanWarn[0]})`);
  if (cueReply.json.notes) wal.meta.notes = `${wal.meta.notes || ''}\n\nLighting notes: ${String(cueReply.json.notes).slice(0, 1500)}`.trim();
  lap('cues');
  const review = critic(wal, a.duration);
  review.notes.forEach(warn);
  review.steps = stepsAt.filter((c) => c.layer === 'beam').length;
  if (design) review.design = { concept: design.concept, opening: design.opening, plays: design.plays, levels: design.elevation };

  emit({ stage: 'validate', detail: 'Checking the show against the format' });
  const v = validateWal(wal);
  if (!v.ok) throw new Error(`The final WAL did not validate: ${v.errors.slice(0, 3).join('; ')}`);
  warnings.push(...v.warnings);
  write(dir, 'song.wal.json', wal);
  const cost = [...researchLog, ...videoLog, ...bibleReply.log, ...designLog, ...cueReply.log].reduce((s, l) => s + (l.costUsd || 0), 0);
  const report = {
    title: wal.meta.title, artist: wal.meta.artist || '', bpm: wal.meta.bpm, duration: wal.meta.duration, styles: wal.meta.styles || [], mood: wal.meta.mood || '', language: wal.meta.language || '', phrases: wal.phrases?.length || 0, sections: wal.sections.length, cues: wal.cues.length, accents: wal.accents.length,
    understanding: u, researched: research.length > 0, moments: bible.moments || [], lyrics: lyrics ? { source: lyrics.source, track: lyrics.track, artist: lyrics.artist } : null,
    tempoNote: a.tempoNote, warnings, timings: { ...timings, totalMs: Date.now() - t0 }, claude: [...researchLog, ...videoLog, ...bibleReply.log, ...designLog, ...cueReply.log], video: videoInfo, critic: review, costUsd: Math.round(cost * 1000) / 1000, ext: extname(filename), sha256: wal.meta.audio?.sha256 || null,
  };
  write(dir, 'report.json', report);
  emit({ stage: 'done', done: true, data: report });
  return { wal, report };
}
