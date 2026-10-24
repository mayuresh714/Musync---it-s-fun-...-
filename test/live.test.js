import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveTracker } from '../core/live/tracker.js';
import { createDecoder } from '../core/decoder/decoder.js';
import { validateWal } from '../core/wal/validate.js';
import { readFileSync } from 'node:fs';

const concert = JSON.parse(readFileSync(new URL('../sim/public/rigs/concert.json', import.meta.url), 'utf8'));
const BIN = 23.4375; // 48 kHz, 2048-point FFT

// Synthetic 4/4: a kick on every beat (stronger on the one), clap on 2 and 4, hats between. `level(t)` scales the whole mix.
function play(bpm, seconds, level = () => 1, offset = 0.2, fps = 60) {
  const lt = new LiveTracker({ binHz: BIN });
  const spb = 60 / bpm;
  const mags = new Float32Array(512);
  const env = (dt, tau) => (dt < 0 ? 0 : Math.exp(-dt / tau));
  for (let t = 1 / fps; t < seconds; t += 1 / fps) {
    mags.fill(0.0004);
    const lvl = level(t);
    for (let i = 1; i < 400; i++) mags[i] += (i < 7 ? 0.02 : i < 60 ? 0.012 : 0.004) * lvl; // sustained bass, pads and air under the hits, as in real music
    const beatPos = (t - offset) / spb, k = Math.floor(beatPos), into = (beatPos - k) * spb, intoHalf = ((beatPos * 2) % 1) * spb / 2;
    const lv = level(t);
    const kick = env(into, 0.07) * lv * (k % 4 === 0 ? 1.0 : 0.6);
    const clap = (k % 2 === 1) ? env(into, 0.05) * lv * 0.5 : 0;
    const hat = ((Math.floor(beatPos * 2) % 2) === 1) ? env(intoHalf, 0.02) * lv * 0.3 : 0;
    for (let i = 1; i < 7; i++) mags[i] += 0.05 * kick;           // ~25-150 Hz
    for (let i = 8; i < 60; i++) mags[i] += 0.02 * clap + 0.004 * kick;   // mids
    for (let i = 90; i < 400; i++) mags[i] += 0.006 * hat;             // highs
    lt.push(t, mags);
  }
  return lt;
}

test('live: locks onto a steady tempo and puts beats on the kick', () => {
  const lt = play(126, 30);
  assert.ok(Math.abs(lt.bpm - 126) / 126 < 0.03, `bpm ${lt.bpm}`);
  const P = 60 / 126;
  const errs = lt.pastBeats.slice(-12).map((b) => { let e = (b.t - 0.2) % P; if (e > P / 2) e -= P; if (e < -P / 2) e += P; return Math.abs(e); });
  assert.ok(Math.max(...errs) < 0.07, `beats are off the kick by up to ${Math.max(...errs).toFixed(3)} s`);
  assert.ok(lt.onsets.low.length > 30, 'kick onsets found');
  assert.equal(lt.accents.filter((a) => a.type === 'drop').length, 0, 'steady music has no drops');
});

test('live: finds the downbeat from the stronger kick on the one', () => {
  const lt = play(120, 40);
  const wal = lt.wal(40);
  const k = Math.round((wal.timing.downbeats.find((d) => d > 20) - 0.2) / 0.5);
  assert.equal(k % 4, 0, 'downbeats fall on every fourth kick starting at the accented one');
});

test('live: a sudden jump in level is a drop and gets a tagline phrase straight away', () => {
  const lt = play(124, 50, (t) => (t < 30 ? 0.25 : 1));
  assert.ok(lt.phrases.some((p) => p.role === 'tagline' && p.t > 29 && p.t < 34), `roles: ${lt.phrases.map((p) => `${p.role}@${p.t}`).join(' ')}`);
  assert.ok(lt.accents.some((a) => a.type === 'drop'));
});

test('live: a quiet stretch becomes lines and silence, and loud returns as refrain', () => {
  const lt = play(120, 70, (t) => (t < 20 ? 1 : t < 40 ? 0.3 : t < 46 ? 0.003 : 1));
  const roles = new Set(lt.phrases.map((p) => p.role));
  assert.ok(roles.has('refrain'), [...roles].join());
  assert.ok(lt.phrases.some((p) => p.role === 'silence' && p.t > 38 && p.t < 52), `roles: ${lt.phrases.map((p) => `${p.role}@${p.t}`).join(' ')}`);
});

test('live: the rolling WAL is valid, covers the present, and plays on a rig with every layer', () => {
  const lt = play(128, 45, (t) => (t < 20 ? 0.5 : 1));
  const wal = lt.wal(45);
  const v = validateWal(wal);
  assert.ok(v.ok, v.errors.join('; '));
  assert.ok(wal.timing.beats[wal.timing.beats.length - 1] > 60, 'beat grid reaches ahead');
  const d = createDecoder(wal, concert);
  const lit = {};
  for (let t = 30; t < 44; t += 0.05) { const f = d.frame(t); for (const [id, st] of Object.entries(f)) if ((st.dim > 0.05) || st.pixels?.some((p) => p[0] + p[1] + p[2] > 0.1)) lit[st.role] = true; }
  for (const role of ['beam', 'wash', 'pixel']) assert.ok(lit[role], `${role} lit while the live show plays`);
});

test('live: silence stays silent and does not invent a tempo', () => {
  const lt = new LiveTracker({ binHz: BIN });
  const mags = new Float32Array(512).fill(0.0002);
  for (let t = 0.02; t < 20; t += 1 / 60) lt.push(t, mags);
  assert.equal(lt.bpm, 0);
  assert.ok(lt.status().energy < 0.1);
});
