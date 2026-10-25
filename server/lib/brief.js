// Builds the text the agent reads: song facts, the lyric form, and a per-bar table of the recording.
import { barProfile } from '../../core/analysis/grid.js';
import { stanzas } from './lyrics.js';
import { mmss } from './prompts.js';

// vm (optional): per-bar video movement { m 0-9, cuts } from the music video; adds the v and c columns
export function barTable(a, vm = null) {
  const bars = barProfile(a);
  const lines = [`bar  start   E L M H  ons/s${vm ? '  v c' : ''}`];
  let prev = null;
  for (const [i, b] of bars.entries()) {
    const mark = prev ? (b.e - prev.e >= 3 ? ' ^' : prev.e - b.e >= 3 ? ' v' : '') : '';
    lines.push(`${String(b.n).padStart(3)}  ${mmss(b.t).padStart(6)}  ${b.e} ${b.l} ${b.m} ${b.h}  ${b.o.toFixed(1).padStart(4)}${vm?.[i] ? `  ${vm[i].m} ${vm[i].cuts || '.'}` : ''}${mark}`);
    prev = b;
  }
  return { text: lines.join('\n'), bars };
}

export function songFacts(a, meta, lyrics) {
  const secs = a.sections.map((s) => `  ${s.id} ${mmss(s.start)}-${mmss(s.end)} ${s.kind} (auto, rough) energy ${s.energy}`).join('\n');
  const acc = (a.accents || []).map((x) => `  ${mmss(x.t)} ${x.type}${x.dur ? ` ${x.dur.toFixed(1)}s` : ''}`).join('\n') || '  (none)';
  return `SONG
file name: ${meta.filename}
${meta.title ? `title (given): ${meta.title}\n` : ''}${meta.artist ? `artist (given): ${meta.artist}\n` : ''}${meta.style ? `style hint from the creator: ${meta.style}\n` : ''}${meta.notes ? `creator's notes: ${meta.notes}\n` : ''}duration: ${a.duration}s (${mmss(a.duration)})
tempo: ${a.bpm} BPM, ${a.meter}/4, key ${a.key} (key is a rough estimate)
tempo check: ${a.tempoNote}
beat grid: ${a.beats.length} beats, ${a.downbeats.length} bars of ${(60 / a.bpm * a.meter).toFixed(2)}s

AUTOMATIC SECTIONS (rough, energy-based; the bar table below is more reliable)
${secs}

AUTOMATIC ACCENTS (silences are real gaps; "hit" is an isolated loud stab)
${acc}
${lyrics ? lyricsBlock(lyrics, a.duration) : '\nLYRICS\nnone found. Work from the bar table and your own knowledge of the song if you know it; say so in "confidence".'}`;
}

function lyricsBlock(l, duration) {
  const st = stanzas(l.plain);
  const body = st.map((s) => `[L${s.n}]${s.repeatOf ? ` (same as L${s.repeatOf})` : ''}\n${s.lines.join('\n')}`).join('\n\n');
  const gap = Math.abs(l.listedDuration - duration);
  return `
LYRICS (${l.track} by ${l.artist}, via ${l.source}; no timestamps${l.synced ? '' : ' available'}.${gap > 8 ? ` The listing is ${l.listedDuration}s but this file is ${duration}s, so the file likely has extra intro/outro or repeats; place stanzas using the bar table, not by proportion.` : ''}
Stanzas are numbered so you can reason about form: repeated stanzas are the hook.)
${body.slice(0, 7000)}`;
}

export function biblePrompt(a, meta, lyrics, research = '', video = null) {
  const { text } = barTable(a, video?.bars);
  return `${songFacts(a, meta, lyrics)}
${research ? `\nRESEARCH DOSSIER (what a researcher found about the song and its culture; background, not measurement)\n${research.slice(0, 6000)}\n` : ''}${video ? `\n${video.text}\n` : ''}
BAR TABLE (measured from the recording; start = bar start time. E = overall energy, L/M/H = low, mid, high band level, all 0-9 relative to this song's own loudest bars; ons/s = note onsets per second; ^ / v = energy jumps up / down by 3+ vs the previous bar. Mid-band level high with strong onsets usually means the voice or lead is present.)
${text}

Write the director's bible JSON now.`;
}

export function cuesPrompt(bible, a, phraseText, momentsText, barText, videoText = '') {
  return `DIRECTOR'S BIBLE
${JSON.stringify(bible.understanding, null, 1)}

Tempo: ${a.bpm} BPM, ${a.meter}/4. Bars are ${(60 / a.bpm * a.meter).toFixed(2)}s. Song length ${a.duration}s.

PALETTES
${JSON.stringify(bible.palettes)}

SECTIONS (already snapped to bar boundaries)
${bible.sections.map((s) => `${s.id} ${mmss(s.start)}-${mmss(s.end)} [${s.kind}] "${s.label}" group ${s.group} e${s.energy} palette ${s.palette}\n    mood: ${s.mood}. says: ${s.lyric}\n    movement: ${(s.move || []).join(', ') || '(your choice)'}\n    idea: ${s.idea}`).join('\n')}

SIGNATURE MOMENTS
${momentsText}

PHRASE PLAN (what the choreography engine is already playing, phrase by phrase; override only where you add meaning)
${phraseText}

BAR TABLE (same as the director read)
${barText}
${videoText ? `\n${videoText}\n` : ''}
Write the cue sheet JSON now.`;
}

export function phraseLines(phrases, motifs = {}) {
  return phrases.map((p) => `${mmss(p.t)}-${mmss(p.until)} ${p.role}${p.motif ? ` ${p.motif}${p.n ? ` (return ${p.n})` : ''}` : ''}${p.gist ? ` "${p.gist}"` : ''}`).join('\n') || '(none)';
}

// What the researcher is told: who the song is (as far as the file says), plus a taste of the words to identify it by.
export function researchPrompt(a, meta, lyrics) {
  const lines = lyrics ? lyrics.plain.split('\n').filter(Boolean).slice(0, 14).join('\n') : '';
  return `Research this song for the lighting director.

file name: ${meta.filename}
${meta.title ? `title (given): ${meta.title}\n` : ''}${meta.artist ? `artist (given): ${meta.artist}\n` : ''}${meta.style ? `style hint from the creator: ${meta.style}\n` : ''}${meta.notes ? `creator's notes: ${meta.notes}\n` : ''}length: ${mmss(a.duration)}, about ${Math.round(a.bpm)} BPM
${lyrics ? `lyrics found: "${lyrics.track}" by ${lyrics.artist}. First lines:\n${lines}` : 'no lyrics were found: identify the song from its name.'}

Search the web, then write the dossier.`;
}
