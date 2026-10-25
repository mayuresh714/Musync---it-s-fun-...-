// Lyrics lookup on LRCLIB (free, no key). Returns plain text and, when the site has them, timed lines.
// The match is verified against the file name and duration, because a wrong song is worse than none.
const UA = { 'User-Agent': 'musync-director/0.1 (https://github.com/musync)' };

export function cleanName(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

async function search(q, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: UA, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
      if (r.ok) return await r.json();
    } catch (e) { if (signal?.aborted) throw e; }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  return [];
}

export function parseLrc(lrc) {
  const out = [];
  for (const line of lrc.split('\n')) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m && m[3].trim()) out.push({ t: Math.round((+m[1] * 60 + +m[2]) * 100) / 100, text: m[3].trim() });
  }
  return out;
}

export async function findLyrics({ filename, title, artist, duration, signal }) {
  const words = cleanName(filename).split(' ').filter(Boolean);
  const queries = [];
  if (title) queries.push(artist ? `${title} ${artist}` : title, title);
  for (const n of [Math.min(6, words.length), 5, 4, 3, 2]) if (n <= words.length) queries.push(words.slice(0, n).join(' '));
  const haystack = norm(`${filename} ${title || ''} ${artist || ''}`);
  const words_ = (x) => String(x).toLowerCase().normalize('NFKD').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hayWords = new Set(words_(`${filename} ${title || ''} ${artist || ''}`));
  const seen = new Set();
  let best = null;
  for (const q of [...new Set(queries)]) {
    const results = await search(q, signal);
    for (const r of results) {
      if (seen.has(r.id)) continue; seen.add(r.id);
      if (r.instrumental || !(r.plainLyrics || r.syncedLyrics)) continue;
      // the track name must appear in what we know about the file (e.g. the song name in the file name)
      const name = norm(String(r.trackName || '').replace(/\(.*?\)/g, ''));
      const nameWords = words_(String(r.trackName || '').replace(/\(.*?\)/g, ''));
      if (name.length < 3 || !(haystack.includes(name) || (nameWords.length >= 2 && nameWords.every((w) => hayWords.has(w))))) continue;
      const artistHit = norm(r.artistName || '').length > 2 && haystack.includes(norm(r.artistName));
      const durGap = Math.abs((r.duration || 0) - duration);
      const score = (artistHit ? 3 : 0) + (r.syncedLyrics ? 2 : 0) + Math.max(0, 3 - durGap / 10);
      if (!best || score > best.score) best = { score, r, durGap };
    }
    if (best && best.score >= 4) break;
  }
  if (!best) return null;
  const { r, durGap } = best;
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  return {
    source: `lrclib:${r.id}`,
    track: r.trackName, artist: r.artistName, album: r.albumName, listedDuration: r.duration, durationGap: Math.round(durGap * 10) / 10,
    plain: (r.plainLyrics || synced?.map((l) => l.text).join('\n') || '').trim(),
    // a longer cut of the song (a video with an extended intro or repeated hooks) has different timings: use the words, not the times
    synced: durGap > 12 ? null : synced,
  };
}

// Split lyrics into numbered stanzas and mark repeats, so an agent can see the song's form.
export function stanzas(plain) {
  const blocks = plain.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const firstSeen = new Map();
  return blocks.map((lines, i) => {
    const key = norm(lines.join(''));
    const same = firstSeen.get(key);
    if (same == null) firstSeen.set(key, i + 1);
    return { n: i + 1, lines, repeatOf: same ?? null };
  });
}
