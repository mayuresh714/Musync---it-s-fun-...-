#!/usr/bin/env node
// End-to-end interface tests in a real browser, against an isolated backend + simulator:
//   a temp library of 1000 fake songs, the fake director (no Claude calls), ports 8799 / 5199.
//   node test/e2e/run.mjs            run everything
//   node test/e2e/run.mjs library    run tests whose name contains "library"
// Needs Google Chrome and a Playwright-compatible driver (patchright / playwright-core); set CHROME and
// MUSYNC_PW_DIR if yours live somewhere else.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW_DIRS = [process.env.MUSYNC_PW_DIR, `${process.env.HOME}/.vscode/extensions/danielsanmedium.dscodegpt-3.24.62/standalone/`, `${ROOT}/`].filter(Boolean);
function driver() {
  for (const d of PW_DIRS) for (const name of ['patchright', 'playwright-core', 'playwright']) { try { return { chromium: createRequire(d.endsWith('/') ? d : d + '/')(name).chromium, name }; } catch {} }
  throw new Error('No Playwright-compatible driver found. Set MUSYNC_PW_DIR to a folder whose node_modules has patchright or playwright-core.');
}

const API = 8799, UI = 5199, URL_ = `http://localhost:${UI}/studio`;
const tmp = mkdtempSync(join(tmpdir(), 'musync-e2e-'));
const data = join(tmp, 'jobs');
const procs = [];
const cleanup = () => { for (const p of procs) p.kill('SIGTERM'); try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

spawnSync(process.execPath, ['scripts/seed-library.mjs', '--count', '1000', '--out', data], { cwd: ROOT, stdio: 'ignore' });
const env = { ...process.env, MUSYNC_PORT: String(API), MUSYNC_UI_PORT: String(UI), MUSYNC_DATA: data, MUSYNC_FAKE_DIRECTOR: '1', MUSYNC_FAKE_YTDLP: '1', MUSYNC_FAKE_MS: '120', MUSYNC_EXPORTS: join(tmp, 'exports') };
procs.push(spawn(process.execPath, ['server/index.mjs'], { cwd: ROOT, env, stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore' }));
procs.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'sim/vite.config.js', '--strictPort'], { cwd: ROOT, env, stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore' }));
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`http://127.0.0.1:${API}/api/health`)).ok && (await fetch(URL_)).ok) break; } catch {}
  await sleep(250);
  if (i === 79) { console.error('servers did not start'); process.exit(2); }
}

// A looping 120 BPM "song" for the fake microphone: kick on every beat, clap on 2 and 4, hats, a bass drone and a pad.
function fakeMusic(path, seconds = 32, sr = 44100) {
  const n = seconds * sr, pcm = Buffer.alloc(n * 2), spb = 0.5;
  let rnd = 1; const noise = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 2 ** 31) - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr, into = t % spb, bar = Math.floor(t / spb) % 4, hb = (t % (spb / 2));
    const kick = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-into * 30)) * into) * Math.exp(-into * 14) * (bar === 0 ? 1 : 0.75);
    const clap = (bar === 1 || bar === 3) ? noise() * Math.exp(-into * 22) * 0.35 : 0;
    const hat = (t % spb) > spb / 2 - 0.001 ? noise() * Math.exp(-hb * 70) * 0.18 : 0;
    const pad = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t)) * 0.04 + Math.sin(2 * Math.PI * 55 * t) * 0.1;
    pcm.writeInt16LE(Math.max(-1, Math.min(1, (kick * 0.8 + clap + hat + pad) * 0.6)) * 32767 | 0, i * 2);
  }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}
const fakeMic = join(tmp, 'fake-mic.wav'); fakeMusic(fakeMic);
const { chromium } = driver();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeMic}`] });
const shots = join(ROOT, '.musync', 'e2e-shots'); mkdirSync(shots, { recursive: true });
const filter = process.argv[2];
const { tests } = await import('./ui.tests.mjs');

let pass = 0, fail = 0;
const failures = [];
const fresh = async (viewport = { width: 1500, height: 860 }) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|favicon|Failed to load resource.*(404|net::)/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => { try { localStorage.setItem('musync.quality', 'low'); localStorage.setItem('musync.welcomed', '1'); } catch {} });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__musync?.app?.wal && !document.querySelector('#loader:not(.done)'), null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const ev = (fn, arg) => page.evaluate(fn, arg, false);
  return { ctx, page, errors, ev };
};

for (const t of tests) {
  if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) continue;
  const t0 = Date.now();
  let env2;
  try { env2 = await fresh(t.viewport); } catch (e) { try { env2 = await fresh(t.viewport); } catch (e2) { fail++; failures.push([t.name, 'page did not boot']); console.log(`  FAIL ${t.name}\n       the page did not boot: ${e2.message.split('\n')[0]}`); continue; } }
  try {
    await Promise.race([t.fn(env2, { URL: URL_, shots, API }), sleep(t.timeout || 40000).then(() => { throw new Error('timed out'); })]);
    if (env2.errors.length) throw new Error(`browser errors: ${env2.errors.slice(0, 3).join(' | ')}`);
    pass++; console.log(`  ok   ${t.name} (${Date.now() - t0} ms)`);
  } catch (e) {
    fail++; failures.push([t.name, e.message]);
    console.log(`  FAIL ${t.name}\n       ${e.message.split('\n')[0]}`);
    await env2.page.screenshot({ path: join(shots, `FAIL-${t.name.replace(/\W+/g, '-')}.png`) }).catch(() => {});
  }
  await env2.ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? `  (screenshots: ${shots})` : ''}`);
if (fail) { cleanup.skip = true; }
process.exit(fail ? 1 : 0);
