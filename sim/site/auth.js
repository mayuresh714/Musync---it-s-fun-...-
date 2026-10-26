// Sign up, sign in and sign out. Accounts are saved on this device only: the password is never stored, only a salted
// PBKDF2 hash, and the session is a small record in localStorage. The functions below are the whole surface the pages
// use, so a real server login can replace this file later.
import { users, shows } from './store.js';

const SESSION = 'musync.session';
const ITER = 150_000;
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fail = (code) => Object.assign(new Error(code), { code });

async function hash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const clean = (e) => String(e || '').trim().toLowerCase();
const listeners = new Set();
const notify = () => { for (const fn of listeners) fn(readSession()); };
window.addEventListener('storage', (e) => { if (e.key === SESSION) notify(); });

export const auth = {
  // the signed-in person, read straight from this browser (no waiting): { id, email, name } or null
  user: () => readSession(),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async signUp({ name, email, password }) {
    name = String(name || '').trim().slice(0, 60); email = clean(email);
    if (!name) throw fail('name');
    if (!emailOk(email)) throw fail('email');
    if (String(password || '').length < 8) throw fail('weak');
    try {
      if (await users.get(email)) throw fail('taken');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const u = { email, name, id: `a-${crypto.randomUUID()}`, salt: b64(salt), hash: await hash(password, salt), iter: ITER, created: new Date().toISOString() };
      await users.put(u);
      return start(u);
    } catch (e) { throw e.code ? e : fail('nosupport'); }
  },

  async signIn({ email, password }) {
    email = clean(email);
    if (!emailOk(email)) throw fail('email');
    let u;
    try { u = await users.get(email); } catch { throw fail('nosupport'); }
    // the same work is done for an unknown email, so the answer does not reveal which emails exist
    const salt = u ? unb64(u.salt) : new Uint8Array(16);
    const h = await hash(String(password || ''), salt);
    if (!u || h !== u.hash) throw fail('bad');
    return start(u);
  },

  signOut() { try { localStorage.removeItem(SESSION); } catch {} notify(); },

  // checks that the saved session still points at a real account (e.g. it was deleted in another tab)
  async verify() {
    const s = readSession();
    if (!s) return null;
    try { const u = await users.get(s.email); if (u && u.id === s.id) return s; } catch { return s; }
    auth.signOut();
    return null;
  },

  async updateName(name) {
    const s = readSession(); name = String(name || '').trim().slice(0, 60);
    if (!s) throw fail('bad'); if (!name) throw fail('name');
    const u = await users.get(s.email); u.name = name; await users.put(u);
    return start(u);
  },

  async changePassword(oldPassword, newPassword) {
    const s = readSession(); if (!s) throw fail('bad');
    if (String(newPassword || '').length < 8) throw fail('weak');
    const u = await users.get(s.email);
    if ((await hash(String(oldPassword || ''), unb64(u.salt))) !== u.hash) throw fail('bad');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    u.salt = b64(salt); u.hash = await hash(newPassword, salt); u.iter = ITER;
    await users.put(u);
  },

  async deleteAccount() {
    const s = readSession(); if (!s) return;
    await shows.deleteAll(s.id);
    await users.delete(s.email);
    auth.signOut();
  },
};

function start(u) {
  const s = { id: u.id, email: u.email, name: u.name };
  try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch { throw fail('nosupport'); }
  notify();
  return s;
}

export { shows };
