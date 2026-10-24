// The song library, without any DOM: entries, search, sorting, favourites, recents and the play queue.
// Entries are metadata only (a few hundred bytes each), so a thousand songs search instantly; a song's WAL
// is fetched only when it is played.
const KEYS = { fav: 'musync.favs', rec: 'musync.recents', plays: 'musync.plays', last: 'musync.last' };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const SORTS = {
  recent: { label: 'Recently added', cmp: (a, b) => (b.created || '').localeCompare(a.created || '') || a.title.localeCompare(b.title) },
  played: { label: 'Recently played', cmp: (a, b, L) => (L.recentRank(a.id) - L.recentRank(b.id)) || a.title.localeCompare(b.title) },
  most: { label: 'Most played', cmp: (a, b, L) => (L.plays[b.id] || 0) - (L.plays[a.id] || 0) || a.title.localeCompare(b.title) },
  title: { label: 'Title A–Z', cmp: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) },
  artist: { label: 'Artist A–Z', cmp: (a, b) => (a.artist || '￿').localeCompare(b.artist || '￿', undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title) },
  tempo: { label: 'Tempo', cmp: (a, b) => (a.bpm || 0) - (b.bpm || 0) },
  length: { label: 'Length', cmp: (a, b) => (a.duration || 0) - (b.duration || 0) },
};
export const FILTERS = [
  ['all', 'All'],
  ['fav', 'Favourites'],
  ['recent', 'Recent'],
  ['mine', 'Made here'],
  ['demo', 'Demos'],
];

export function createLibrary() {
  const L = {
    entries: [], byId: new Map(),
    favs: new Set(read(KEYS.fav, [])),
    recents: read(KEYS.rec, []),
    plays: read(KEYS.plays, {}),
    listeners: new Set(),
    onChange(fn) { L.listeners.add(fn); return () => L.listeners.delete(fn); },
    emit() { for (const fn of L.listeners) fn(); },

    setEntries(list) {
      const seen = new Set();
      L.entries = [];
      for (const e of list) {
        if (!e?.id || seen.has(e.id)) continue;
        seen.add(e.id);
        const title = String(e.title || e.id), artist = String(e.artist || '');
        const styles = Array.isArray(e.styles) ? e.styles : [];
        L.entries.push({
          ...e, title, artist, styles, language: e.language || '', mood: e.mood || '',
          source: e.source || (e.director ? 'ai' : 'demo'),
          _t: fold(title), _a: fold(artist),
          _hay: fold([title, artist, e.mood, e.language, styles.join(' '), e.source === 'ai' || e.director ? 'made here ai director' : ''].join(' ')),
        });
      }
      L.byId = new Map(L.entries.map((e) => [e.id, e]));
      L.recents = L.recents.filter((id) => L.byId.has(id));
      for (const id of [...L.favs]) if (!L.byId.has(id)) L.favs.delete(id);
      L.emit();
    },

    recentRank: (id) => { const i = L.recents.indexOf(id); return i < 0 ? 1e6 : i; },
    isFav: (id) => L.favs.has(id),
    toggleFav(id) { if (L.favs.has(id)) L.favs.delete(id); else L.favs.add(id); write(KEYS.fav, [...L.favs]); L.emit(); return L.favs.has(id); },
    markPlayed(id) {
      L.recents = [id, ...L.recents.filter((x) => x !== id)].slice(0, 60);
      L.plays[id] = (L.plays[id] || 0) + 1;
      write(KEYS.rec, L.recents); write(KEYS.plays, L.plays); write(KEYS.last, id);
    },
    lastId: () => { const id = read(KEYS.last, null); return L.byId.has(id) ? id : null; },

    // Facets for the filter menus: value -> count over the whole library.
    facets(key) {
      const m = new Map();
      for (const e of L.entries) for (const v of key === 'styles' ? e.styles : e.language ? e.language.split(/,| and /).map((x) => x.trim()).filter(Boolean) : []) m.set(v, (m.get(v) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    },

    // query: free text plus bpm:120-130, style:edm, lang:hindi. Every token must match.
    search({ q = '', filter = 'all', sort = 'recent', style = null, language = null } = {}) {
      const toks = fold(q).split(/\s+/).filter(Boolean);
      let bpm = null; const words = [];
      for (const t of toks) {
        const m = /^bpm:(\d+)(?:-(\d+))?$/.exec(t);
        if (m) bpm = [+m[1], +(m[2] ?? m[1])];
        else if (t.startsWith('style:') && t.length > 6) style = t.slice(6);
        else if ((t.startsWith('lang:') || t.startsWith('language:')) && t.includes(':') && t.split(':')[1]) language = t.split(':')[1];
        else words.push(t);
      }
      const scored = [];
      for (const e of L.entries) {
        if (filter === 'fav' && !L.favs.has(e.id)) continue;
        if (filter === 'recent' && !L.recents.includes(e.id)) continue;
        if (filter === 'mine' && e.source === 'demo') continue;
        if (filter === 'demo' && e.source !== 'demo') continue;
        if (style && !e.styles.some((s) => fold(s) === fold(style))) continue;
        if (language && !fold(e.language).includes(fold(language))) continue;
        if (bpm && !(e.bpm >= bpm[0] - 0.5 && e.bpm <= bpm[1] + 0.5)) continue;
        let score = 0, ok = true;
        for (const w of words) {
          if (e._t.startsWith(w)) score += 4;
          else if (e._t.includes(' ' + w)) score += 3;
          else if (e._t.includes(w)) score += 2;
          else if (e._a.includes(w)) score += 1.5;
          else if (e._hay.includes(w)) score += 1;
          else { ok = false; break; }
        }
        if (ok) scored.push([e, score]);
      }
      const cmp = SORTS[sort]?.cmp || SORTS.recent.cmp;
      // with text, relevance wins; the chosen sort breaks ties and orders everything else
      scored.sort((a, b) => (words.length ? b[1] - a[1] : 0) || cmp(a[0], b[0], L));
      return scored.map((x) => x[0]);
    },
  };
  return L;
}

// Highlight positions of query words inside a string (returns HTML-safe markup).
export function highlight(text, q) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const words = fold(q).split(/\s+/).filter((w) => w && !w.includes(':'));
  if (!words.length) return esc(text);
  const f = fold(text);
  const hit = new Array(text.length).fill(false);
  // fold() can change length for exotic characters; only highlight when positions line up
  if (f.length === text.length) for (const w of words) { let i = f.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) hit[k] = true; i = f.indexOf(w, i + w.length); } }
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    if (hit[i] !== open) { out += hit[i] ? '<mark>' : '</mark>'; open = hit[i]; }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}
