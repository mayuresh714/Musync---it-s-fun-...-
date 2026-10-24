// Re-choreograph a WAL made by Musync with the current choreography engine. A WAL carries everything the engine
// needs (beat grid, onsets, envelopes, sections, phrases, palettes), so older shows get today's moves without
// touching the audio or calling the AI again. What the AI said about this particular song survives: the sections
// and phrases it wrote, its palettes, and its one-shot moments (blackouts, flashes, effects it placed by hand).
import { draftWal } from './draft.js';
import { autoPhrases, CHOREO_VERSION } from '../choreo/choreograph.js';

const BASELINE_NOTE = /^(refrain|tagline|line|answer|lift|instrumental|silence)( [\w-]+)?: /;

export const isAutoMade = (wal) => /^musync-(director|code|live)|\+ musync-draft/.test(wal?.meta?.generator || '');
export const needsRemaster = (wal) => isAutoMade(wal) && (wal.meta.choreo || 1) < CHOREO_VERSION && !!wal.envelopes && !!wal.timing?.beats?.length;

export function remasterWal(wal) {
  const a = {
    bpm: wal.meta.bpm, meter: wal.meta.meter || 4, duration: wal.meta.duration, key: wal.meta.key, analyzer: 'wal',
    beats: wal.timing.beats, downbeats: wal.timing.downbeats?.length ? wal.timing.downbeats : wal.timing.beats.filter((_, i) => i % (wal.meta.meter || 4) === 0),
    accents: wal.accents || [], onsets: wal.onsets || {}, envelopes: wal.envelopes, sections: wal.sections,
  };
  const fresh = draftWal(a, {
    title: wal.meta.title, artist: wal.meta.artist, styles: wal.meta.styles, mood: wal.meta.mood, language: wal.meta.language, notes: wal.meta.notes, audio: wal.meta.audio,
    sections: wal.sections, palettes: wal.palettes, motifs: wal.motifs,
    phrases: wal.phrases?.length ? wal.phrases : autoPhrases(wal.sections, a, a.accents),
    generator: `${wal.meta.generator.replace(/\s*\+\s*choreo\d+$/, '')}`,
  });
  // moments the AI placed by hand: one-shot effects carrying its own note
  const moments = (wal.cues || []).filter((c) => c.fx && !c.move && !c.dim && !c.color && c.note && !BASELINE_NOTE.test(c.note));
  const out = { ...wal, meta: { ...fresh.meta, created: wal.meta.created, choreo: CHOREO_VERSION }, palettes: { ...wal.palettes, ...fresh.palettes }, phrases: fresh.phrases, cues: [...fresh.cues, ...moments].sort((x, y) => x.t - y.t) };
  return out;
}
