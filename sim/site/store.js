// Accounts and shows live in this browser (IndexedDB). A show is only the WAL light plan: no audio is ever stored.
// Everything goes through these few functions so a cloud backend can replace them later without touching the pages.
const DB = 'musync', VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(Object.assign(new Error('no storage'), { code: 'nosupport' })); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'email' });
      if (!db.objectStoreNames.contains('shows')) db.createObjectStore('shows', { keyPath: 'id' }).createIndex('userId', 'userId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(Object.assign(req.error || new Error('no storage'), { code: 'nosupport' })); };
    req.onblocked = () => { dbp = null; reject(Object.assign(new Error('blocked'), { code: 'nosupport' })); };
  });
  return dbp;
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function tx(store, mode, fn) {
  const db = await open();
  const t = db.transaction(store, mode);
  const out = await fn(t.objectStore(store));
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return out;
}

export const users = {
  get: (email) => tx('users', 'readonly', (s) => wrap(s.get(email))),
  put: (u) => tx('users', 'readwrite', (s) => wrap(s.put(u))),
  delete: (email) => tx('users', 'readwrite', (s) => wrap(s.delete(email))),
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export const shows = {
  async list(userId) {
    const all = await tx('shows', 'readonly', (s) => wrap(s.index('userId').getAll(userId)));
    return all.map(({ wal, ...meta }) => meta).sort((a, b) => b.created.localeCompare(a.created));
  },
  get: (id) => tx('shows', 'readonly', (s) => wrap(s.get(id))),
  async add(userId, { title, artist = '', wal, source = 'device', audioSha = '' }) {
    const m = wal.meta || {};
    const show = {
      id: `u-${uid()}`, userId, title: title || m.title || 'Untitled', artist, source, audioSha,
      bpm: Math.round(m.bpm || 0), duration: m.duration || 0, styles: m.styles || [], mood: m.mood || '', language: m.language || '',
      created: new Date().toISOString(), wal,
    };
    await tx('shows', 'readwrite', (s) => wrap(s.put(show)));
    return show;
  },
  async rename(id, title) {
    return tx('shows', 'readwrite', async (s) => { const x = await wrap(s.get(id)); if (!x) return null; x.title = title; if (x.wal?.meta) x.wal.meta.title = title; await wrap(s.put(x)); return x; });
  },
  delete: (id) => tx('shows', 'readwrite', (s) => wrap(s.delete(id))),
  async deleteAll(userId) {
    const ids = (await shows.list(userId)).map((x) => x.id);
    await tx('shows', 'readwrite', async (s) => { for (const id of ids) await wrap(s.delete(id)); });
    return ids.length;
  },
  async exportAll(userId) {
    return tx('shows', 'readonly', (s) => wrap(s.index('userId').getAll(userId)));
  },
};
