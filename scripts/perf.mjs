#!/usr/bin/env node
// Frame cost of each preset rig in a real browser: node scripts/perf.mjs [--quality high] [--seconds 5]
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = [process.env.MUSYNC_PW_DIR, `${process.env.HOME}/.vscode/extensions/danielsanmedium.dscodegpt-3.24.62/standalone/`, `${ROOT}/`].filter(Boolean);
const chromium = (() => { for (const d of PW) for (const n of ['patchright', 'playwright-core', 'playwright']) { try { return createRequire(d.endsWith('/') ? d : d + '/')(n).chromium; } catch {} } throw new Error('no Playwright driver'); })();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
await page.addInitScript((q) => { localStorage.setItem('musync.quality', q); localStorage.setItem('musync.welcomed', '1'); }, arg('quality', 'high'));
await page.goto(arg('url', 'http://localhost:5173/'));
await page.waitForFunction(() => window.__musync?.app?.wal && !document.querySelector('#loader:not(.done)'), null, { timeout: 90000 });
const secs = +arg('seconds', 5);
const rows = [];
for (const rig of ['single-sharpy', 'quad-sharpy', 'concert', 'club', 'dandiya']) for (const cam of ['crane', 'foh']) {
  const r = await page.evaluate(async ([rig, cam, secs]) => {
    const M = window.__musync;
    await M.loadRigPreset(rig); M.actions.setCamera(cam); M.seek?.(40); M.app.clock = 40; M.play();
    await new Promise((r) => setTimeout(r, 1500));
    const f0 = M.app.frames, t0 = performance.now(); let worst = 0, last = performance.now();
    await new Promise((res) => { const tick = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; if (n - t0 < secs * 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    const fps = (M.app.frames - f0) / ((performance.now() - t0) / 1000);
    M.pause();
    return { fps: +fps.toFixed(1), worstMs: +worst.toFixed(0), cpuMs: +M.perf.cpuMs.toFixed(1), renderMs: +M.perf.renderMs.toFixed(1), fixtures: M.app.rig.fixtures.length };
  }, [rig, cam, secs], false);
  rows.push({ rig, cam, ...r });
}
console.table(rows);
await browser.close();
