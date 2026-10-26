#!/usr/bin/env node
// Look at the show the way a person in the room would. Plays a song in a real browser, one fixed time-step at a
// time (so every run is identical), and writes stills, contact sheets or a video.
//
//   node scripts/capture.mjs --song "Rang De" --rig dandiya --cam crane --at 30,60,95 --out /tmp/shots
//   (add --wal path/to/song.wal.json to play a show that is not in the library)
//   node scripts/capture.mjs --song "Illuminati" --rig concert --strip 40 --frames 8 --every 0.5   (a motion strip)
//   node scripts/capture.mjs --song "Kamariya" --rig club --video 20 --from 35                      (a .mp4 clip, needs ffmpeg)
//
// options: --url http://localhost:5173/studio   --size 1280x720   --quality high|balanced|low   --haze 1.5   --sheet (also tile the stills)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW_DIRS = [process.env.MUSYNC_PW_DIR, `${process.env.HOME}/.vscode/extensions/danielsanmedium.dscodegpt-3.24.62/standalone/`, `${ROOT}/`].filter(Boolean);
function driver() {
  for (const d of PW_DIRS) for (const name of ['patchright', 'playwright-core', 'playwright']) { try { return createRequire(d.endsWith('/') ? d : d + '/')(name).chromium; } catch {} }
  throw new Error('No Playwright-compatible driver found. Set MUSYNC_PW_DIR to a folder whose node_modules has patchright or playwright-core.');
}
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const url = arg('url', 'http://localhost:5173/studio'), song = arg('song', ''), rig = arg('rig', 'concert'), cam = arg('cam', 'director');
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number);
const at = String(arg('at', '')).split(',').filter(Boolean).map(Number);
const out = resolve(String(arg('out', join(ROOT, '.musync', 'captures', `${Date.now()}`))));
const fps = +arg('fps', 20), lead = +arg('lead', 3);
mkdirSync(out, { recursive: true });

const browser = await driver().launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.addInitScript((q) => { try { localStorage.setItem('musync.quality', q); localStorage.setItem('musync.welcomed', '1'); } catch {} }, String(arg('quality', 'high')));
await page.goto(url);
await page.waitForFunction(() => window.__musync?.app?.wal && !document.querySelector('#loader:not(.done)'), null, { timeout: 90000 });
const ev = (fn, a) => page.evaluate(fn, a, false).catch((e)=>{console.error('EV FAIL',String(fn).slice(0,120),'\n',e.message,'\n',(e.stack||'').split('\n').slice(0,6).join('\n'),errors);process.exit(3)});

await ev(async (r) => { await window.__musync.loadRigPreset(r); }, rig);
const found = await ev(async (q) => {
  const M = window.__musync, e = q ? M.lib.entries.find((x) => `${x.title} ${x.artist || ''}`.toLowerCase().includes(String(q).toLowerCase())) : M.lib.entries[0];
  if (!e) return null;
  await M.loadSong(e.id);
  return { id: e.id, title: e.title, dur: M.app.wal.meta.duration, styles: M.app.wal.meta.styles };
}, song === true ? '' : song);
if (!found) { console.error(`no song matches "${song}"`); process.exit(2); }
if (arg('wal')) { const wal = JSON.parse(readFileSync(String(arg('wal')), 'utf8')); await ev(async (w) => { await window.__musync.setWal(w); }, wal); found.title = wal.meta.title; found.dur = wal.meta.duration; found.styles = wal.meta.styles; }
await ev((m) => { window.__musync.actions.setCamera(m); }, cam);
if (arg('haze')) await ev((h) => window.__musync.actions.look.set({ haze: h }), +arg('haze'));
await page.keyboard.press('u'); // cinema mode: hide the interface so the picture is the picture
await page.waitForTimeout(400);
console.log(`song: ${found.title}  (${found.dur.toFixed(0)} s, ${(found.styles || []).join('/')})   rig: ${rig}   camera: ${cam}`);
await ev(() => window.__musync.capture.hold(true));
if (arg('pre')) await page.evaluate(String(arg('pre')), undefined, false);

const run = async (t0, secs) => { await ev((a) => { window.__musync.capture.seek(a[0]); window.__musync.capture.step(a[1], a[2]); }, [Math.max(0, t0 - lead), lead, fps]); };
const files = [];
const shot = async (name) => { const f = join(out, name); await page.screenshot({ path: f }); files.push(f); return f; };
const describe = (t) => ev((x) => { const d = window.__musync.app.decoder.describe(x); return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.move ? v.move.look + (v.move.prism ? '+prism' : '') : (v.dim?.look || '-')])); }, t);

if (arg('video')) {
  const secs = +arg('video'), from = +arg('from', 0), frames = Math.round(secs * fps), dir = join(out, 'frames'); mkdirSync(dir, { recursive: true });
  await run(from, 0);
  for (let i = 0; i < frames; i++) { await ev((a) => window.__musync.capture.step(1 / a, a), fps); await page.screenshot({ path: join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 }); }
  const mp4 = join(out, `${found.title.replace(/\W+/g, '_').slice(0, 30)}_${rig}_${from}s.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.jpg'), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', mp4]);
  console.log(r.status === 0 ? `video: ${mp4}` : `frames in ${dir} (ffmpeg failed: ${r.stderr})`);
} else if (arg('strip')) {
  const t0 = +arg('strip'), n = +arg('frames', 8), every = +arg('every', 0.5);
  await run(t0, 0);
  for (let i = 0; i < n; i++) { await shot(`strip-${String(i).padStart(2, '0')}.png`); await ev((a) => window.__musync.capture.step(a[0], a[1]), [every, fps]); }
  console.log(JSON.stringify(await describe(t0)));
} else {
  for (const t of at.length ? at : [found.dur * 0.25, found.dur * 0.5, found.dur * 0.75]) {
    await run(t, 0);
    const f = await shot(`t${String(Math.round(t)).padStart(4, '0')}.png`);
    console.log(`${t.toFixed(1)}s  ${f}  ${JSON.stringify(await describe(t))}`);
  }
}
if (arg('eval')) console.log('eval:', JSON.stringify(await page.evaluate(String(arg('eval')), undefined, false)));
if (arg('sheet') && files.length > 1) {
  // tile the stills: scale each, join each row with hstack, join the rows with vstack
  const cols = Math.min(files.length, +arg('cols', files.length <= 4 ? 2 : 4)), rows = Math.ceil(files.length / cols), tw = Math.round(1920 / cols / 2) * 2;
  const parts = files.map((_, i) => `[${i}:v]scale=${tw}:-2[s${i}]`);
  const rowsOut = [];
  for (let r = 0; r < rows; r++) {
    const ids = files.map((_, i) => i).filter((i) => Math.floor(i / cols) === r);
    while (ids.length < cols) { parts.push(`color=c=black:s=${tw}x${Math.round((tw * H) / W / 2) * 2}[b${r}_${ids.length}]`); ids.push(`b${r}_${ids.length}`); }
    parts.push(`${ids.map((i) => (typeof i === 'number' ? `[s${i}]` : `[${i}]`)).join('')}hstack=inputs=${cols}[r${r}]`);
    rowsOut.push(`[r${r}]`);
  }
  parts.push(rows > 1 ? `${rowsOut.join('')}vstack=inputs=${rows}[out]` : `${rowsOut[0]}null[out]`);
  const sheet = join(out, 'sheet.jpg');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', parts.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '3', sheet]);
  console.log(r.status === 0 ? `sheet: ${sheet}` : `sheet failed: ${r.stderr}`);
}
if (errors.length) console.log('browser errors:', [...new Set(errors)].slice(0, 5));
await browser.close();
