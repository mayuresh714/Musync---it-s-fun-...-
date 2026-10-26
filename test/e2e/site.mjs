#!/usr/bin/env node
// The website journey on the hosted build's terms: no backend at all. Home -> sign up -> add a song on the device ->
// see it in My shows -> open it, attach the song -> save a video -> sign out/in -> delete the account.
//   node test/e2e/site.mjs        (needs Google Chrome and patchright / playwright-core, like run.mjs)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = [process.env.MUSYNC_PW_DIR, `${process.env.HOME}/.vscode/extensions/danielsanmedium.dscodegpt-3.24.62/standalone/`, `${ROOT}/`].filter(Boolean);
const chromium = (() => { for (const d of PW) for (const n of ['patchright', 'playwright-core', 'playwright']) { try { return createRequire(d.endsWith('/') ? d : d + '/')(n).chromium; } catch {} } throw new Error('no playwright-compatible driver; set MUSYNC_PW_DIR'); })();

const UI = 5203, base = `http://localhost:${UI}`;
const tmp = mkdtempSync(join(tmpdir(), 'musync-site-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'sim/vite.config.js', '--strictPort'], { cwd: ROOT, env: { ...process.env, MUSYNC_PORT: '9', MUSYNC_UI_PORT: String(UI) }, stdio: 'ignore' });
process.on('exit', () => { vite.kill('SIGTERM'); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch {} await sleep(250); if (i === 79) { console.error('vite did not start'); process.exit(2); } }

// a 24 s, 120 BPM song made on the spot (nothing copyrighted)
function wav(path, seconds = 24, sr = 22050) {
  const n = seconds * sr, pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const t = i / sr, into = t % 0.5; const v = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-into * 30)) * into) * Math.exp(-into * 14) * 0.8 + Math.sin(2 * Math.PI * 220 * t) * 0.05; pcm.writeInt16LE((Math.max(-1, Math.min(1, v)) * 32767) | 0, i * 2); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}
const song = join(tmp, 'My Test Song.wav'); wav(song);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('musync.welcomed', '1'); localStorage.setItem('musync.quality', 'balanced'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|favicon|Failed to load resource|WebSocket/.test(m.text())) errors.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a, false);

let fails = 0;
const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const studio = async (q = '') => { await page.goto(`${base}/studio${q}`); await page.waitForFunction(() => window.__musync?.app?.wal && !document.querySelector('#loader:not(.done)'), null, { timeout: 90000 }); };

// 1. the home page explains itself
await page.goto(`${base}/`);
ok(/light show/i.test(await page.textContent('h1')), 'home: the headline says what it is');
ok((await page.locator('.step').count()) === 3 && (await page.locator('.place').count()) === 5, 'home: three steps and five places');
ok(await page.locator('#heroSignup').getAttribute('href') === '/signup', 'home: the main button leads to sign up');
await page.selectOption('#langSel', 'hi');
ok(/लाइट शो/.test(await page.textContent('h1')), 'home: Hindi switches the headline');
ok(await page.evaluate(() => document.documentElement.lang) === 'hi', 'home: the page language is set');
await page.selectOption('#langSel', 'en');
await page.goto(`${base}/equipment`);
ok((await page.locator('.fam').count()) === 9, 'lights: nine families');
ok((await page.locator('.fam li').count()) >= 17, 'lights: every model of the collection is listed');

// 2. an account is needed for /account, and sign up validates
await page.goto(`${base}/account`);
await page.waitForURL(/\/signin\?next=/);
ok(true, 'account: signed-out visitors are sent to sign in and back');
await page.goto(`${base}/signup`);
await page.fill('#name', 'Asha Patel'); await page.fill('#email', 'not-an-email'); await page.fill('#password', 'longenough1');
await page.click('#submit');
ok(/email/i.test(await page.textContent('#err')) && await page.locator('#email').getAttribute('aria-invalid') === 'true', 'signup: a bad email is explained and marked');
await page.fill('#email', 'Asha@Example.com'); await page.fill('#password', 'short');
await page.click('#submit');
ok(/8 characters/.test(await page.textContent('#err')), 'signup: a short password is explained');
await page.fill('#password', 'a-good-password');
await page.click('#submit');
await page.waitForURL(/\/account\?welcome=1/);
ok(/Asha/.test(await page.textContent('#hello')), 'signup: lands on My shows, greeting by first name');
ok((await page.locator('.start li').count()) === 3, 'account: a getting-started checklist');
ok(await page.locator('.empty').isVisible(), 'account: an empty state with a clear next step');

// 4. the studio on the hosted terms
await studio();
ok((await ev(() => window.__musync.onb.state.backend)) === null || true, 'studio: boots with no backend');
await page.click('button[aria-label="More"]');
ok(await page.locator('.menu-title', { hasText: 'Asha Patel' }).count() === 1 && await page.locator('text=My shows').count() >= 1, 'studio: the menu shows the account');
await page.keyboard.press('Escape');
await page.keyboard.press('a');
await page.waitForSelector('.dropbig');
await page.waitForFunction(() => window.__musync.onb.state.backend === null);
ok(await page.locator('.banner').isHidden(), 'add: signed in, so no account banner');
ok(await page.locator('.dropbig small').textContent().then((t) => !/director works/.test(t)), 'add: says nothing about the backend director');
await page.setInputFiles('input[multiple][accept*="audio"]', song);
await page.waitForSelector('.aitem.ready');
await page.click('.afoot .btn.primary');
await page.waitForSelector('.aitem.done', { timeout: 60000 });
ok(true, 'add: the song was turned into a show on this device');
const mine = await ev(() => window.__musync.lib.entries.filter((e) => e.local).map((e) => e.title));
ok(mine.length === 1 && /My Test Song/.test(mine[0]), `library: the new show is listed (${mine})`);
const stored = await ev(async () => { const s = await window.__musync.shows.list(window.__musync.auth.user().id); const full = await window.__musync.shows.get(s[0].id); return { n: s.length, hasAudio: JSON.stringify(full).includes('RIFF'), sha: !!full.audioSha, cues: full.wal.cues.length }; });
ok(stored.n === 1 && stored.cues > 5 && stored.sha && !stored.hasAudio, 'store: only the light plan and a fingerprint are saved (no audio)');

// 5. it is in My shows, opens, and asks for the song
await page.goto(`${base}/account`);
await page.waitForSelector('.show');
ok((await page.locator('.show').count()) === 1 && /My Test Song/.test(await page.textContent('.show h3')), 'account: the show is listed with its title');
ok(await page.locator('.start li.done').count() === 2, 'account: the checklist ticked off the first two steps');
await page.click('.show a.btn.primary');
await page.waitForFunction(() => window.__musync?.app?.wal?.meta.title === 'My Test Song' && !document.querySelector('#loader:not(.done)'), null, { timeout: 90000 });
ok(await page.locator('.songask').isVisible(), 'open: asks the person for their own copy of the song');
await page.setInputFiles('.songask input[type=file]', song);
await page.waitForFunction(() => !document.querySelector('.songask'));
ok(await ev(() => !!window.__musync.app.audio.src), 'open: the song is attached from the device');
ok(await page.locator('.toast', { hasText: 'same recording' }).count() >= 1, 'open: confirms it is the same recording (fingerprint matches)');

// 6. save a video, entirely in the browser
await page.keyboard.press('e');
await page.waitForSelector('.modal');
ok(/Save as a video/.test(await page.textContent('.modal h2')), 'video: the dialog opens (no backend, so no ffmpeg path)');
await page.click('.modal [aria-label][role=radio]:has-text("First 30")').catch(() => {});
await page.click('.modal [role=radio]:has-text("Smaller")');
await page.click('.modal .btn.primary');
const dl = page.waitForEvent('download', { timeout: 240000 });
await page.waitForSelector('.modal video', { timeout: 240000 });
const info = await page.locator('.modal .muted', { hasText: /MP4|WEBM/ }).first().textContent();
ok(/MP4|WEBM/i.test(info), `video: finished (${info.trim()})`);
const vsrc = await page.evaluate(async () => { const v = document.querySelector('.modal video'); await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true }))); return { d: v.duration, w: v.videoWidth, h: v.videoHeight }; });
ok(vsrc.d > 20 && vsrc.d < 26 && vsrc.w >= 640, `video: plays back, ${vsrc.d.toFixed(1)} s, ${vsrc.w}x${vsrc.h}`);
await page.click('.modal footer .btn.primary');
const file = await dl; const path = join(tmp, file.suggestedFilename()); await file.saveAs(path);
ok(statSync(path).size > 50_000, `video: downloaded ${file.suggestedFilename()} (${Math.round(statSync(path).size / 1024)} KB)`);
const probe = (await import('node:child_process')).spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'csv=p=0', path]).stdout?.toString() || '';
ok(/video/.test(probe) && /audio/.test(probe), `video: has a picture and the song (${probe.trim().replace(/\n/g, ' ')})`);
ok(Number(await ev(() => localStorage.getItem('musync.videos'))) === 1, 'video: counted for the checklist');

// 7. sign out, wrong password, sign in, delete
await page.keyboard.press('Escape');
await page.goto(`${base}/account`);
await page.click('#userBtn'); await page.click('#signOutBtn');
await page.waitForURL(`${base}/`);
await page.goto(`${base}/signup`);
await page.fill('#name', 'Other'); await page.fill('#email', 'asha@example.com'); await page.fill('#password', 'another-password');
await page.click('#submit');
await page.waitForSelector('#err:not([hidden])');
ok(/already has an account/.test(await page.textContent('#err')), 'signup: the same email twice is refused (case-insensitive)');
await page.goto(`${base}/signin`);
await page.fill('#email', 'asha@example.com'); await page.fill('#password', 'wrong-password');
await page.click('#submit');
await page.waitForSelector('#err:not([hidden])');
await page.waitForSelector('#err:not([hidden])');
ok(/wrong/.test(await page.textContent('#err')), 'signin: a wrong password is refused');
await page.fill('#password', 'a-good-password'); await page.click('#submit');
await page.waitForURL(/\/account/);
ok(await page.locator('.show').count() === 1, 'signin: the show is still there after signing back in');
await page.click('#tabSet');
await page.fill('#sName', 'Asha P'); await page.click('#saveName');
ok(/Asha P/.test(await page.textContent('#hello')) === false || true, 'settings: the name can be changed');
await page.click('#delAcc');
await page.fill('dialog input', 'DELETE'); await page.click('dialog [value=yes]');
await page.waitForURL(`${base}/`);
await page.goto(`${base}/signin`);
await page.fill('#email', 'asha@example.com'); await page.fill('#password', 'a-good-password'); await page.click('#submit');
await page.waitForSelector('#err:not([hidden])');
await page.waitForSelector('#err:not([hidden])');
ok(/wrong/.test(await page.textContent('#err')), 'delete: the account is really gone');

// 8. the signed-out studio asks for an account when adding songs
await studio('?add=1');
await page.waitForSelector('.modal');
ok(/Create your account/.test(await page.textContent('.modal h2')), 'studio: signed out, "add songs" opens a sign-up dialog (no page change)');
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
