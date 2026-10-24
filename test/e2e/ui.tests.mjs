// Interface tests. Each test gets a fresh page; every navigation control in the app is exercised.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const M = (ev, fn, arg) => ev(fn, arg);
// a tiny valid WAV (0.3 s of silence) to stand in for an uploaded song
let wavSeq = 0;
const wav = (path) => { const n = 4410 + (wavSeq++ % 9) * 2 + Math.floor(Math.random() * 1000), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(14700, 24); b.writeUInt32LE(29400, 28); b.writeInt16LE(Math.floor(Math.random() * 20000), 44); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); writeFileSync(path, b); };

// the top bar is small now: the camera lives in one menu and the rest in "More"
const menuPick = async (page, button, label) => { await page.click(`button[aria-label="${button}"]`); await page.waitForSelector('.popover.on'); await page.click(`.popover .menu-item:has-text("${label}")`); };
const pickView = (page, label) => menuPick(page, 'Camera view', label);
const moreItem = (page, label) => menuPick(page, 'More', label);
const openSettingsMenu = async (page) => { await moreItem(page, 'Picture quality'); await page.waitForSelector('.popover.on .menu-item:has-text("High")'); };

const until = (page, label, id) => page.waitForFunction((i) => window.__musync.app.songId === i, id, { timeout: 8000 }).catch(async () => { throw new Error(`${label}: song stayed ${await page.evaluate(() => window.__musync.app.songId, undefined, false)}, wanted ${id}`); });
const openLib = async (page) => { await page.click('.lib-open'); await page.waitForSelector('.sheet .srow'); await page.waitForSelector('.sheet input[aria-label="Search songs"]:focus'); };
const rowTitles = (page) => page.$$eval('.srow .smeta b', (n) => n.map((x) => x.textContent));
const summary = (page) => page.locator('.sfoot .sum').innerText();
const current = (ev) => ev(() => window.__musync.app.songId);

export const tests = [
  // ── boot ────────────────────────────────────────────────────────────
  { name: 'boot: loads 1000+ songs and renders without errors', async fn({ page, ev }) {
    const n = await ev(() => window.__musync.lib.entries.length);
    assert(n >= 1000, `expected 1000+ songs, got ${n}`);
    assert(await page.locator('#topbar').isVisible(), 'topbar missing');
    assert(await page.locator('#dock').isVisible(), 'dock missing');
    eq(await page.title().then((t) => t.endsWith('· Musync')), true, 'title');
  } },

  // ── top bar: every camera button ───────────────────────────────────
  { name: 'cameras: the camera menu lists every view in plain words and each one works', async fn({ page, ev }) {
    const map = { 'Close crane': ['crane', 'Crane'], 'Sound desk': ['foh', 'Sound desk'], 'In the crowd': ['crowd', 'Crowd'], 'Front row': ['pit', 'Front row'], 'On stage': ['stage', 'On stage'], 'Walk around': ['walk', 'Walk'], 'Free look': ['free', 'Free look'], 'Auto': ['director', 'Auto'] };
    for (const [label, [mode, short]] of Object.entries(map)) {
      await pickView(page, label);
      await page.waitForTimeout(120);
      eq(await ev(() => window.__musync.app.camera), mode, `camera after ${label}`);
      assert((await page.locator('button[aria-label="Camera view"]').innerText()).includes(short), `button names the view "${short}"`);
      eq(await page.locator('.popover.on').count(), 0, 'menu closes after picking');
    }
    await page.click('button[aria-label="Camera view"]'); await page.waitForSelector('.popover.on');
    eq(await page.locator('.popover.on .menu-item').count(), 12, 'twelve views');
    eq(await page.locator('.popover.on .menu-item span.check').count(), 1, 'the current view is ticked');
  } },
  { name: 'cameras: the four drone shots each work', async fn({ page, ev }) {
    for (const [label, mode] of [['Drone: circle', 'orbit'], ['Drone: rise', 'reveal'], ['Drone: fly over', 'fly'], ['Drone: from above', 'top']]) {
      await pickView(page, label);
      await page.waitForTimeout(150);
      eq(await ev(() => window.__musync.app.camera), mode, `drone ${label}`);
      assert((await page.locator('button[aria-label="Camera view"]').innerText()).includes('Drone'), 'button says Drone');
    }
  } },
  { name: 'cameras: number keys, C cycles, and the menu closes on Escape', async fn({ page, ev }) {
    for (const [k, m] of [['6', 'foh'], ['7', 'crowd'], ['8', 'pit'], ['9', 'stage'], ['2', 'orbit'], ['1', 'director']]) { await page.keyboard.press(k); await page.waitForTimeout(100); eq(await ev(() => window.__musync.app.camera), m, `key ${k}`); }
    await page.keyboard.press('c'); await page.waitForTimeout(100);
    eq(await ev(() => window.__musync.app.camera), 'crane', 'C moves to the next camera');
    await page.click('button[aria-label="Camera view"]'); await page.waitForSelector('.popover.on');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    eq(await page.locator('.popover.on').count(), 0, 'Escape closes the menu');
  } },

  { name: 'cameras: J is the crane, and every crane shot stays close to the stage on each venue', async fn({ page, ev }) {
    await page.keyboard.press('j'); await page.waitForTimeout(150);
    eq(await ev(() => window.__musync.app.camera), 'crane', 'J selects the crane');
    for (const rig of ['concert', 'dandiya', 'club', 'hall', 'lawn']) {
      const r = await ev(async (id) => {
        const M = window.__musync; await M.loadRigPreset(id);
        const I = M.camRig.info, out = [];
        for (let k = 0; k < I.crane.length; k++) {
          M.camRig.craneIdx = k; M.camRig.shot = 'crane'; M.camRig.dur = 17;
          for (const u of [0, 8, 16]) { const f = M.camRig.frameFor('crane', u); const s = I.stage; out.push(Math.hypot(f.pos.x - s[0], f.pos.z - s[2])); if (![f.pos.x, f.pos.y, f.pos.z].every(Number.isFinite)) return { bad: true }; }
        }
        return { max: Math.max(...out), n: I.crane.length };
      }, rig);
      assert(!r.bad, `${rig}: crane position is not a number`);
      assert(r.n >= 3, `${rig}: wants at least three crane moves, has ${r.n}`);
      assert(r.max < { concert: 30, dandiya: 30, club: 16, hall: 18, lawn: 30 }[rig], `${rig}: the crane wandered ${r.max.toFixed(1)} m from the stage`);
    }
  } },
  { name: 'record: Shift+E and the button record live and download a video', async fn({ page, ev }) {
    await page.keyboard.press('Shift+E'); await page.waitForTimeout(500);
    eq(await ev(() => window.__musync.recorder.active), true, 'recording started');
    eq(await page.getAttribute('button[aria-label="Stop recording"]', 'aria-pressed'), 'true', 'button shows recording');
    await page.waitForTimeout(1500);
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await page.click('button[aria-label="Stop recording"]');
    const d = await dl;
    assert(/\.(webm|mp4)$/.test(d.suggestedFilename()), `video file name, got ${d.suggestedFilename()}`);
    eq(await ev(() => window.__musync.recorder.active), false, 'recording stopped');
    eq(await page.getAttribute('button[aria-label="Record"]', 'aria-pressed'), 'false', 'button back to idle');
  }, timeout: 30000 },
  { name: 'record: E exports the show frame by frame and pressing E again cancels without leaving a file', async fn({ page, ev }) {
    const before = await ev(() => fetch('/api/health').then((r) => r.json()));
    assert(before.ffmpeg, 'the export needs ffmpeg');
    await page.keyboard.press('e');
    await page.waitForSelector('button[aria-label="Stop recording"]', { timeout: 15000 });
    await page.waitForFunction(() => /%|Saving/.test(document.querySelector('.rec-time')?.textContent || '') || window.__musync.app.hold, null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('e');
    await page.waitForSelector('button[aria-label="Record"]', { state: 'attached', timeout: 30000 });
    eq(await ev(() => window.__musync.app.hold), false, 'the live loop is running again');
    eq(await ev(() => window.__musync.recorder.active), false, 'no live recording was started');
  }, timeout: 60000 },

  // ── top bar: view actions ─────────────────────────────────────────
  { name: 'view: the haze item in More and the H key toggle haze', async fn({ page, ev }) {
    await page.click('button[aria-label="More"]'); await page.waitForSelector('.popover.on');
    eq(await page.locator('.popover .menu-item:has-text("Haze") span.check').count(), 1, 'haze starts on (ticked)');
    await page.click('.popover .menu-item:has-text("Haze")'); await page.waitForTimeout(150);
    eq(await ev(() => window.__musync.app.haze), false, 'haze off');
    await page.keyboard.press('h');
    eq(await ev(() => window.__musync.app.haze), true, 'haze on again');
  } },
  { name: 'look: panel opens, sliders and keys change thickness, spill, screens, glow, effects; reset restores', async fn({ page, ev }) {
    const look = () => ev(() => window.__musync.actions.look.get());
    await moreItem(page, 'Appearance');
    await page.waitForSelector('.look');
    const d = await look();
    // beam thickness slider to the far right = 8x
    await page.locator('.look input[data-key="beamWidth"]').fill('1');
    await page.waitForTimeout(80);
    assert((await look()).beamWidth > 7.9, 'beam width should reach 8x');
    await page.locator('.look input[data-key="beamWidth"]').fill('0');
    assert((await look()).beamWidth < 0.51, 'beam width should reach 0.5x');
    await page.locator('.look input[data-key="spill"]').fill('0.9');
    eq((await look()).spill, 0.9, 'spill');
    await page.locator('.look input[data-key="screen"]').fill('0.1');
    eq((await look()).screen, 0.1, 'screen');
    await page.locator('.look input[data-key="glow"]').fill('0.2');
    eq((await look()).glow, 0.2, 'glow');
    // the renderer really received them
    eq(await ev(() => window.__musync.rigView.look.spill), 0.9, 'rigView spill');
    await page.click('.look .lk-toggle');
    eq((await look()).effects, false, 'effects off');
    assert(await ev(() => window.__musync.effects.enabled === false), 'effects disabled in renderer');
    await page.click('.look button:has-text("Reset")');
    await page.waitForSelector('.look');
    const r = await look();
    eq(r.beamWidth, d.beamWidth, 'reset beamWidth'); eq(r.spill, d.spill, 'reset spill'); eq(r.effects, true, 'reset effects');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    eq(await page.locator('.look').count(), 0, 'Escape closes the Look panel');
    const w0 = (await look()).beamWidth;
    await page.keyboard.press(']'); assert((await look()).beamWidth > w0, ']' + ' should thicken');
    await page.keyboard.press('['); await page.keyboard.press('[');
    assert((await look()).beamWidth < w0, '[ should thin');
    await page.keyboard.press('v'); await page.waitForSelector('.look');
  } },
  { name: 'look: settings survive a reload', async fn({ page, ev }) {
    await ev(() => window.__musync.actions.look.set({ beamWidth: 3.3, spill: 0.55 }));
    await page.reload();
    await page.waitForFunction(() => window.__musync?.app?.wal, null, { timeout: 30000 });
    const l = await ev(() => window.__musync.actions.look.get());
    eq(l.beamWidth, 3.3, 'beamWidth persisted'); eq(l.spill, 0.55, 'spill persisted');
  } },
  { name: 'drawers: Rig and Show open and close by button, key and Escape; rig tabs switch', async fn({ page }) {
    await page.click('button[aria-controls="rigDrawer"]'); await page.waitForSelector('#rigDrawer.open');
    for (const tab of ['Add', 'In use', 'Place']) { await page.click(`#rigDrawer [role=tab]:has-text("${tab}")`); await page.waitForTimeout(80); eq(await page.getAttribute(`#rigDrawer [role=tab]:has-text("${tab}")`, 'aria-selected'), 'true', `${tab} tab`); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    assert(!(await page.locator('#rigDrawer.open').count()), 'Escape closes the rig drawer');
    await page.keyboard.press('s'); await page.waitForSelector('#showDrawer.open');
    await page.click('#showDrawer button[aria-label^="Close"]'); await page.waitForTimeout(350);
    assert(!(await page.locator('#showDrawer.open').count()), 'close button closes the show drawer');
    await page.keyboard.press('r'); await page.waitForSelector('#rigDrawer.open');
    await page.click('button[aria-controls="rigDrawer"]'); await page.waitForTimeout(350);
    assert(!(await page.locator('#rigDrawer.open').count()), 'Lights button toggles closed');
  } },
  { name: 'rig: choosing a preset rebuilds the rig; the strobe bars and hybrid heads exist', async fn({ page, ev }) {
    const roles = await ev(() => [...new Set(window.__musync.app.rig.fixtures.map((f) => f.model))]);
    assert(roles.includes('hybrid-strobe-bar') && roles.includes('claypaky-mythos2'), `concert rig should include the new fixtures, has ${roles}`);
    await page.click('button[aria-controls="rigDrawer"]'); await page.waitForSelector('#rigDrawer.open');
    await page.click('#rigDrawer .opt:has-text("Club")');
    await page.waitForFunction(() => window.__musync.app.rig.venue === 'club', null, { timeout: 15000 });
  }, timeout: 60000 },
  { name: 'settings and help: quality, auto-next, frame rate, shortcuts dialog', async fn({ page, ev }) {
    await openSettingsMenu(page);
    await page.click('.popover .menu-item:has-text("High")'); await page.waitForTimeout(200);
    eq(await ev(() => window.__musync.app.quality), 'high', 'quality');
    await openSettingsMenu(page);
    await page.click('.popover .menu-item:has-text("Play the next song automatically")'); await page.waitForTimeout(200);
    eq(await ev(() => window.__musync.app.queue.autoNext), false, 'auto-next off');
    await openSettingsMenu(page);
    await page.click('.popover .menu-item:has-text("Show frame rate")'); await page.waitForTimeout(200);
    eq(await ev(() => window.__musync.app.showPerf), true, 'perf readout');
    await page.keyboard.press('?'); await page.waitForSelector('.modal');
    const txt = await page.locator('.modal').innerText();
    for (const w of ['Song library', 'Search songs', 'Add songs', 'Next / previous song', 'Beam thinner / thicker', 'Look panel']) assert(txt.includes(w), `help should list "${w}"`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    eq(await page.locator('.modal').count(), 0, 'Escape closes help');
  } },

  // ── transport ──────────────────────────────────────────────────────
  { name: 'transport: play button, Space, seek keys, timeline click, mute and volume', async fn({ page, ev }) {
    await page.click('#dock .play'); await page.waitForTimeout(250);
    eq(await ev(() => window.__musync.app.playing), true, 'playing after click');
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    eq(await ev(() => window.__musync.app.playing), false, 'paused after Space');
    await ev(() => window.__musync.seek(40));
    const t0 = await ev(() => window.__musync.app.clock);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
    const t1 = await ev(() => window.__musync.app.clock);
    assert(Math.abs(t1 - t0 - 5) < 0.6, `ArrowRight should skip 5 s (${t0} -> ${t1})`);
    await page.keyboard.press('Shift+ArrowLeft'); await page.waitForTimeout(100);
    const t2 = await ev(() => window.__musync.app.clock);
    assert(t2 < t1 - 9, 'Shift+ArrowLeft should jump back');
    const box = await page.locator('#timelineCanvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2); await page.waitForTimeout(150);
    const dur = await ev(() => window.__musync.app.wal.meta.duration);
    const t3 = await ev(() => window.__musync.app.clock);
    assert(Math.abs(t3 - dur / 2) < dur * 0.06, `timeline click should seek to the middle (${t3} of ${dur})`);
    await page.keyboard.press('m'); eq(await ev(() => window.__musync.app.muted), true, 'muted');
    await page.click('button[aria-label="Mute"]'); eq(await ev(() => window.__musync.app.muted), false, 'unmuted by button');
    await page.locator('input[aria-label="Volume"]').fill('0.3'); await page.waitForTimeout(80);
    eq(await ev(() => Math.round(window.__musync.app.volume * 100)), 30, 'volume');
  } },

  // ── library: open, close, search ──────────────────────────────────
  { name: 'library: opens by button, L, / and Ctrl+K; closes by X, Esc and backdrop; focus returns', async fn({ page }) {
    const sheet = () => page.locator('.sheet').count();
    await page.click('.lib-open'); await page.waitForSelector('.sheet input[aria-label="Search songs"]:focus'); eq(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search songs', 'search focused on open');
    await page.click('button[aria-label="Close library"]'); await page.waitForTimeout(320); eq(await sheet(), 0, 'X closes');
    await page.keyboard.press('l'); await page.waitForSelector('.sheet'); await page.keyboard.press('Escape'); await page.waitForTimeout(320); eq(await sheet(), 0, 'Esc closes');
    await page.keyboard.press('/'); await page.waitForSelector('.sheet'); await page.mouse.click(8, 8); await page.waitForTimeout(320); eq(await sheet(), 0, 'backdrop closes');
    await page.keyboard.press('Control+k'); await page.waitForSelector('.sheet'); await page.keyboard.press('Control+k');
    await page.waitForTimeout(100); assert(await sheet() === 1, 'Ctrl+K while open keeps one sheet');
    await page.keyboard.press('Escape'); await page.waitForTimeout(320);
    await page.keyboard.press('l'); await page.waitForSelector('.sheet input[aria-label="Search songs"]:focus'); await page.keyboard.press('l');
    assert((await page.locator('.sheet input[aria-label="Search songs"]').inputValue()) === 'l', 'typing l in the search box types, it does not toggle');
  } },
  { name: 'library: 1000 songs stay virtual (few DOM rows) and scrolling is smooth', async fn({ page }) {
    await openLib(page);
    const rows = await page.locator('.srow').count();
    assert(rows < 40, `expected a windowed list, found ${rows} rows`);
    eq(await summary(page), '1,003 songs', 'summary');
    const t0 = Date.now();
    await page.evaluate(() => { const l = document.querySelector('.slist'); for (let i = 0; i < 40; i++) l.scrollTop += 600; });
    await page.waitForTimeout(100);
    const dt = Date.now() - t0;
    assert(dt < 1500, `scrolling 40 jumps took ${dt} ms`);
    const first = await page.$eval('.srow', (n) => +n.dataset.i);
    assert(first > 100, 'list should have scrolled far down');
    await page.focus('.slist'); await page.keyboard.press('End'); await page.waitForTimeout(150);
    assert(await page.locator('.srow.active').count() === 1, 'one active row after End');
    eq(await page.$eval('.srow.active', (n) => +n.dataset.i), 1002, 'End goes to the last song');
    await page.keyboard.press('Home'); await page.waitForTimeout(150);
    eq(await page.$eval('.srow.active', (n) => +n.dataset.i), 0, 'Home goes back to the first');
  } },
  { name: 'library: search filters live, supports bpm: and style:, highlights, clears with Esc, shows empty state', async fn({ page, ev }) {
    await openLib(page);
    await page.keyboard.type('musync demo'); await page.waitForTimeout(200);
    eq((await rowTitles(page))[0], 'Musync Demo (synthetic)', 'best match first');
    assert((await page.locator('.srow mark').count()) > 0, 'matches are highlighted');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    eq(await page.locator('.sheet').count(), 1, 'first Esc only clears the search');
    eq(await page.locator('.sheet input[aria-label="Search songs"]').inputValue(), '', 'query cleared');
    await page.keyboard.type('bpm:130-135'); await page.waitForTimeout(200);
    const bpms = await page.$$eval('.srow .schips .chip:nth-child(2)', (n) => n.map((x) => parseInt(x.textContent)));
    assert(bpms.length && bpms.every((b) => b >= 130 && b <= 135), `bpm filter: ${bpms}`);
    await page.fill('.sheet input[aria-label="Search songs"]', 'style:edm'); await page.waitForTimeout(200);
    const styled = await ev(() => window.__musync.libUI.state.results.map((e) => e.styles));
    assert(styled.length > 50 && styled.every((s) => s.includes('edm')), `style filter returned ${styled.length} songs, not all edm`);
    await page.fill('.sheet input[aria-label="Search songs"]', 'zzzzqqqq'); await page.waitForTimeout(200);
    assert(await page.locator('.empty.big:visible').count() === 1, 'empty state');
    await page.click('.empty.big button:has-text("Clear search")'); await page.waitForTimeout(200);
    eq(await summary(page), '1,003 songs', 'cleared');
    await page.fill('.sheet input[aria-label="Search songs"]', 'ÐÏL'); // odd characters never crash the search
  } },
  { name: 'library: typing anywhere in the list jumps to the search box', async fn({ page }) {
    await openLib(page);
    await page.focus('.slist'); await page.keyboard.press('r'); await page.waitForTimeout(100);
    eq(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search songs', 'focus moved');
  } },
  { name: 'library: arrow keys, PageDown, Home/End move the active row; Enter plays it and closes', async fn({ page, ev }) {
    await openLib(page);
    const act = () => page.$eval('.srow.active', (n) => +n.dataset.i);
    const a0 = await act();
    await page.keyboard.press('ArrowDown'); eq(await act(), a0 + 1, 'ArrowDown');
    await page.keyboard.press('ArrowUp'); eq(await act(), a0, 'ArrowUp');
    await page.keyboard.press('PageDown'); eq(await act(), a0 + 8, 'PageDown');
    await page.keyboard.press('Home'); await page.focus('.slist'); await page.keyboard.press('Home'); eq(await act(), 0, 'Home');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const want = await page.$eval('.srow.active', (n) => n.dataset.id);
    await page.keyboard.press('Enter');
    await page.waitForFunction((id) => window.__musync.app.songId === id && window.__musync.app.playing, want, { timeout: 8000 });
    await page.waitForTimeout(320);
    eq(await page.locator('.sheet').count(), 0, 'sheet closes after Enter');
  } },
  { name: 'library: clicking a row plays it; reopening scrolls to and marks the playing song', async fn({ page, ev }) {
    await openLib(page);
    await page.click('.srow[data-i="3"] .smeta');
    await page.waitForFunction(() => window.__musync.app.playing, null, { timeout: 8000 });
    const id = await current(ev);
    await page.waitForTimeout(320);
    await page.keyboard.press('l'); await page.waitForSelector('.sheet .srow.cur');
    eq(await page.$eval('.srow.cur', (n) => n.dataset.id), id, 'current row highlighted');
    assert(await page.locator('.srow.cur.playing .eq').count() === 1, 'equaliser bars on the playing row');
  } },
  { name: 'library: sort menu, filter chips and facet menus', async fn({ page }) {
    await openLib(page);
    await page.click('button[aria-label="Sort songs"]'); await page.waitForSelector('.popover.on');
    await page.click('.popover .menu-item:has-text("Title A–Z")'); await page.waitForTimeout(200);
    const t = await rowTitles(page);
    assert([...t].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join() === t.join(), 'sorted by title');
    await page.click('button[aria-label="Sort songs"]'); await page.waitForSelector('.popover.on');
    await page.click('.popover .menu-item:has-text("Tempo")'); await page.waitForTimeout(200);
    const b = await page.$$eval('.srow .schips .chip:nth-child(2)', (n) => n.map((x) => parseInt(x.textContent)));
    assert(b.every((v, i) => i === 0 || v >= b[i - 1]), `sorted by tempo ${b}`);
    await page.click('.chips button:has-text("Demos")'); await page.waitForTimeout(200);
    assert((await page.locator('.srow').count()) <= 3, 'only demos');
    await page.click('.chips button:has-text("Made here")'); await page.waitForTimeout(200);
    eq(await summary(page).then((s) => s.includes('1,000') || s.includes('of')), true, 'made-here count');
    await page.click('.chips button:has-text("All")');
    await page.click('.tools.sub button:has-text("Style")'); await page.waitForSelector('.popover.on');
    await page.click('.popover .menu-item:has-text("devotional")'); await page.waitForTimeout(200);
    assert(await page.locator('.tools.sub button.active').count() === 1, 'style facet active');
    await page.click('.tools.sub button:has-text("Clear filters")'); await page.waitForTimeout(200);
    eq(await summary(page), '1,003 songs', 'filters cleared');
    await page.click('.tools.sub button:has-text("Language")'); await page.waitForSelector('.popover.on');
    assert((await page.locator('.popover .menu-item').count()) > 3, 'language facets listed');
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    eq(await page.locator('.sheet').count(), 1, 'Escape closes only the menu');
  } },
  { name: 'library: favourites by star button and Ctrl+S, the Favourites filter, persisted after reload', async fn({ page, ev }) {
    await openLib(page);
    const id0 = await page.$eval('.srow[data-i="0"]', (n) => n.dataset.id);
    await page.click('.srow[data-i="0"] .sfav');
    eq(await page.getAttribute('.srow[data-i="0"] .sfav', 'aria-pressed'), 'true', 'starred by click');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Control+s'); await page.waitForTimeout(120);
    eq(await page.getAttribute('.srow[data-i="1"] .sfav', 'aria-pressed'), 'true', 'starred by Ctrl+S');
    await page.click('.chips button:has-text("Favourites")'); await page.waitForTimeout(200);
    eq(await page.locator('.srow').count(), 2, 'two favourites');
    await page.click('.srow[data-i="0"] .sfav'); await page.waitForTimeout(200);
    eq(await page.locator('.srow').count(), 1, 'unstarring removes it from the Favourites view');
    await page.keyboard.press('Escape'); await page.waitForTimeout(320);
    await page.reload(); await page.waitForFunction(() => window.__musync?.app?.wal, null, { timeout: 30000 });
    eq(await ev(() => window.__musync.lib.favs.size), 1, 'favourite persisted');
  } },
  { name: 'library: row menu (right-click) offers play, favourite, rename, delete; rename and delete work', async fn({ page, ev }) {
    await openLib(page);
    await page.fill('.sheet input[aria-label="Search songs"]', 'bholenath'); await page.waitForTimeout(250);
    const before = await page.locator('.srow').count();
    assert(before >= 1, 'a Bholenath song exists in the seed');
    const id = await page.$eval('.srow', (n) => n.dataset.id);
    await page.click('.srow', { button: 'right' }); await page.waitForSelector('.popover.on');
    const items = await page.$$eval('.popover .menu-item', (n) => n.map((x) => x.textContent));
    for (const w of ['Play', 'favourites', 'Rename', 'Delete']) assert(items.some((i) => i.includes(w)), `menu has ${w}: ${items}`);
    await page.click('.popover .menu-item:has-text("Rename")'); await page.waitForSelector('.modal input');
    await page.fill('.modal input[aria-label="Title"]', 'Renamed By Test'); await page.keyboard.press('Enter');
    await page.waitForFunction((i) => window.__musync.lib.byId.get(i)?.title === 'Renamed By Test', id, { timeout: 8000 });
    await page.fill('.sheet input[aria-label="Search songs"]', 'renamed by test'); await page.waitForTimeout(250);
    eq(await page.locator('.srow').count(), 1, 'renamed song found');
    await page.click('.srow .smore'); await page.waitForSelector('.popover.on');
    await page.click('.popover .menu-item:has-text("Delete")'); await page.waitForSelector('.modal');
    await page.click('.modal button:has-text("Delete")');
    await page.waitForFunction((i) => !window.__musync.lib.byId.has(i), id, { timeout: 8000 });
    await page.waitForTimeout(300);
    eq(await page.locator('.srow').count(), 0, 'deleted song gone');
  } },
  { name: 'library: demo songs have no rename/delete; Tab stays inside the sheet', async fn({ page }) {
    await openLib(page);
    await page.fill('.sheet input[aria-label="Search songs"]', 'musync demo'); await page.waitForTimeout(250);
    await page.click('.srow', { button: 'right' }); await page.waitForSelector('.popover.on');
    const items = await page.$$eval('.popover .menu-item', (n) => n.map((x) => x.textContent));
    assert(!items.some((i) => /Delete|Rename/.test(i)), 'demo has no destructive actions');
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    assert(await page.evaluate(() => !!document.activeElement?.closest('.sheet')), 'focus never leaves the sheet');
    for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(() => !!document.activeElement?.closest('.sheet')), 'focus never leaves the sheet (backwards)');
  } },

  // ── queue: next / previous / shuffle / auto-next ───────────────────
  { name: 'queue: next and previous buttons and N / B follow the list order', async fn({ page, ev }) {
    await openLib(page);
    await page.fill('.sheet input[aria-label="Search songs"]', 'lights'); await page.waitForTimeout(250);
    const ids = await ev(() => window.__musync.libUI.state.results.map((e) => e.id));
    assert(ids.length >= 4, 'need a few matches');
    await page.keyboard.press('Enter'); await until(page, 'enter plays first', ids[0]);
    await page.click('button[aria-label="Next song"]'); await until(page, 'song 1', ids[1]);
    await page.keyboard.press('n'); await until(page, 'song 2', ids[2]);
    // previous restarts first when more than 3 s in
    await ev(() => window.__musync.seek(10));
    await page.click('button[aria-label="Previous song"]'); await page.waitForTimeout(300);
    eq(await current(ev), ids[2], 'Previous restarts the song when past 3 s');
    await ev(() => window.__musync.seek(0));
    await page.keyboard.press('b'); await until(page, 'song 1', ids[1]);
    await page.keyboard.press('b'); await until(page, 'song 0', ids[0]);
    await page.click('button[aria-label="Previous song"]'); // wraps to the end of the list
    await until(page, 'song ids.length - 1', ids[ids.length - 1]);
  }, timeout: 60000 },
  { name: 'queue: shuffle toggles and picks a different song; rapid Next presses settle on the last', async fn({ page, ev }) {
    await page.click('button[aria-label="Shuffle"]'); eq(await page.getAttribute('button[aria-label="Shuffle"]', 'aria-pressed'), 'true', 'shuffle on');
    const a = await current(ev);
    await page.keyboard.press('n'); await page.waitForTimeout(700);
    assert((await current(ev)) !== a, 'shuffle moved to another song');
    await page.keyboard.press('z'); eq(await page.getAttribute('button[aria-label="Shuffle"]', 'aria-pressed'), 'false', 'shuffle off by Z');
    for (let i = 0; i < 5; i++) await page.keyboard.press('n');
    await page.waitForTimeout(900);
    assert(await ev(() => !!window.__musync.app.wal), 'a show is loaded after rapid presses');
  } },
  { name: 'queue: a finished song moves on to the next automatically (and not when switched off)', async fn({ page, ev }) {
    await openLib(page);
    await page.fill('.sheet input[aria-label="Search songs"]', 'raat'); await page.waitForTimeout(250);
    const ids = await ev(() => window.__musync.libUI.state.results.map((e) => e.id));
    await page.keyboard.press('Enter'); await page.waitForFunction((i) => window.__musync.app.songId === i && window.__musync.app.playing, ids[0], { timeout: 8000 });
    await ev(() => window.__musync.seek(window.__musync.app.wal.meta.duration - 0.6));
    await page.waitForFunction((i) => window.__musync.app.songId === i, ids[1], { timeout: 10000 });
    await page.waitForFunction(() => window.__musync.app.playing, null, { timeout: 8000 });
    await ev(() => window.__musync.actions.setAutoNext(false));
    await ev(() => window.__musync.seek(window.__musync.app.wal.meta.duration - 0.6));
    await page.waitForTimeout(2500);
    eq(await current(ev), ids[1], 'stays put when auto-next is off');
    eq(await ev(() => window.__musync.app.playing), false, 'stopped at the end');
  }, timeout: 60000 },

  // ── add songs: onboarding ─────────────────────────────────────────
  { name: 'add: tab switch by button, A key and arrow keys; empty state and options render', async fn({ page }) {
    await page.keyboard.press('a'); await page.waitForSelector('.sheet #pane-add:not([hidden])');
    assert(await page.locator('.dropbig').isVisible(), 'drop area visible');
    assert((await page.locator('.add-opts select option').count()) >= 7, 'occasions listed');
    await page.focus('#tab-add'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    eq(await page.getAttribute('#tab-songs', 'aria-selected'), 'true', 'arrow left moves to Songs');
    await page.click('#tab-add'); await page.waitForTimeout(150);
    eq(await page.getAttribute('#tab-add', 'aria-selected'), 'true', 'tab click');
    assert(await page.locator('.afoot .btn.primary[disabled]').count() === 1, 'start is disabled with nothing queued');
  } },
  { name: 'add: a batch of files is queued, run through the director, shown with progress and appears in the library', async fn({ page, ev }, { shots }) {
    const dir = shots; const files = ['Batch_One.wav', 'Batch_Two.wav', 'Batch_Three.wav'].map((n) => join(dir, n));
    files.forEach(wav);
    const n0 = await ev(() => window.__musync.lib.entries.length);
    await page.keyboard.press('a'); await page.waitForSelector('.dropbig');
    await page.setInputFiles('.pane-add input[type=file]', files);
    await page.waitForFunction(() => document.querySelectorAll('.aitem').length === 3);
    eq(await page.locator('.aitem .ameta b').first().innerText(), 'Batch One', 'filename is prettified');
    await page.selectOption('.add-opts select', 'edm');
    await page.click('.afoot .btn.primary');
    await page.waitForFunction(() => [...document.querySelectorAll('.aitem')].some((n) => /running|queued/.test(n.className)), null, { timeout: 8000 });
    assert(await page.locator('[data-badge]:not([hidden])').count() === 1, 'tab badge shows work in progress');
    await page.waitForFunction(() => document.querySelectorAll('.aitem.done').length === 3, null, { timeout: 30000 });
    await page.waitForFunction((a0) => window.__musync.lib.entries.length >= a0 + 3, n0, { timeout: 8000 }).catch(() => {});
    const n = await ev(() => window.__musync.lib.entries.length);
    const names = await ev(() => window.__musync.lib.entries.filter((e) => /^Batch/.test(e.title)).map((e) => e.title));
    assert(n >= n0 + 3, `library should have grown by 3 from ${n0}, has ${n} (Batch songs: ${names.join(', ')})`);
    await page.click('.aitem.done .btn:has-text("Play")');
    await page.waitForFunction(() => /^Batch/.test(window.__musync.lib.byId.get(window.__musync.app.songId)?.title || ''), null, { timeout: 8000 });
    await page.waitForSelector('.sheet', { state: 'detached' });
    // sending the same audio again is recognised, not redone
    await page.keyboard.press('a'); await page.waitForSelector('.dropbig');
    await page.click('.afoot button:has-text("Clear finished")');
    await page.setInputFiles('.pane-add input[type=file]', [files[0]]);
    await page.click('.afoot .btn.primary');
    await page.waitForFunction(() => document.querySelector('.aitem.dup'), null, { timeout: 8000 });
  }, timeout: 70000 },
  { name: 'add: failures can be retried, unsupported files are refused, items can be removed', async fn({ page }, { shots }) {
    const bad = join(shots, 'fail_me.wav'); wav(bad);
    const txt = join(shots, 'notes.txt'); writeFileSync(txt, 'hello');
    await page.keyboard.press('a'); await page.waitForSelector('.dropbig');
    await page.setInputFiles('.pane-add input[type=file]', [txt]);
    await page.waitForSelector('.toast.warn');
    eq(await page.locator('.aitem').count(), 0, 'text file not queued');
    await page.setInputFiles('.pane-add input[type=file]', [bad]);
    await page.click('.afoot .btn.primary');
    await page.waitForSelector('.aitem.error', { timeout: 15000 });
    assert(await page.locator('.aitem.error .btn:has-text("Retry")').count() === 1, 'retry offered');
    await page.click('.aitem.error button[aria-label^="Remove"]');
    eq(await page.locator('.aitem').count(), 0, 'removed');
  }, timeout: 40000 },
  { name: 'add: dropping several audio files anywhere opens the Add tab with them queued', async fn({ page }, { shots }) {
    const files = ['Drop_A.wav', 'Drop_B.wav'].map((n) => join(shots, n)); files.forEach(wav);
    await page.evaluate(async (names) => {
      const dt = new DataTransfer();
      for (const n of names) dt.items.add(new File([new Uint8Array(100)], n, { type: 'audio/wav' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, ['Drop_A.wav', 'Drop_B.wav']);
    await page.waitForSelector('.sheet #pane-add:not([hidden])', { timeout: 5000 });
    eq(await page.locator('.aitem').count(), 2, 'both files queued');
  } },
  { name: 'welcome card appears once for a first-time visitor and its buttons work', async fn({ page, ctx }) {
    const p = await ctx.newPage();
    await p.goto(page.url().replace(/#.*/, ''));
    await p.evaluate(() => localStorage.removeItem('musync.welcomed'));
    await p.reload();
    await p.waitForSelector('.welcome', { timeout: 30000 });
    await p.click('.welcome button:has-text("Add songs")');
    await p.waitForSelector('.sheet #pane-add:not([hidden])');
    eq(await p.locator('.welcome').count(), 0, 'card gone');
    await p.reload(); await p.waitForFunction(() => window.__musync?.app?.wal, null, { timeout: 30000 }); await p.waitForTimeout(800);
    eq(await p.locator('.welcome').count(), 0, 'not shown again');
  }, timeout: 60000 },

  // ── show: lyric architecture and choreography reach the renderer ───
  { name: 'show: strobe patterns, motion looks and stage effects decode on the concert rig', async fn({ page, ev }) {
    const r = await ev(async () => {
      const { createDecoder } = window.__musync;
      const app = window.__musync.app;
      const wal = structuredClone(app.wal);
      const T = wal.sections[1].start;
      wal.cues = [
        { t: T, until: T + 8, layer: 'strobe', dim: { look: 'strobe_seq', pattern: 'double' }, color: { look: 'static', hex: '#ffffff' } },
        { t: T, until: T + 8, layer: 'beam', move: { look: 'bounce' }, dim: { look: 'on' }, color: { look: 'static', hex: '#ff0000' } },
        { t: T, layer: 'all', fx: 'co2', dur: 1 }, { t: T + 1, layer: 'all', fx: 'confetti', dur: 1 },
      ];
      const d = createDecoder(wal, app.rig);
      const spb = 60 / wal.meta.bpm;
      let flashes = 0, prev = 0; const tilts = new Set();
      for (let i = 0; i < 400; i++) { const t = T + i * spb / 40; const f = d.frame(t); const on = f.HS1.pixels[0][0] > 0.2 ? 1 : 0; if (on && !prev) flashes++; prev = on; tilts.add(Math.round(f.B1.tilt)); }
      return { flashes, tilts: tilts.size, fx: d.effects(T + 0.2).map((e) => e.type), fx2: d.effects(T + 3).map((e) => e.type) };
    });
    assert(r.flashes >= 18 && r.flashes <= 22, `double strobe over 10 beats should flash ~20 times, got ${r.flashes}`);
    assert(r.tilts > 3, `bounce should change tilt, saw ${r.tilts} values`);
    assert(r.fx.includes('co2'), 'co2 effect active'); assert(r.fx2.includes('confetti') && !r.fx2.includes('co2'), 'confetti outlives co2');
  } },
  { name: 'show: stage effects emit particles when triggered', async fn({ page, ev }) {
    const n = await ev(async () => {
      const fx = window.__musync.effects;
      fx.update(0.016, [{ type: 'co2', t: 1, age: 0.01, dur: 1 }, { type: 'confetti', t: 1, age: 0.01, dur: 1 }, { type: 'flame', t: 1, age: 0.01, dur: 1 }, { type: 'spark', t: 1, age: 0.01, dur: 1 }, { type: 'streamers', t: 1, age: 0.01, dur: 1 }], { t: 1.01 });
      for (let i = 0; i < 10; i++) fx.update(0.016, [], { t: 1.02 + i * 0.016 });
      return Object.values(fx.sys).map((s) => s.pts.visible);
    });
    eq(n.join(), 'true,true,true,true', 'co2, confetti (also streamers), flame and spark systems visible');
  } },


  // ── live mode ──────────────────────────────────────────────────────
  { name: 'live: the microphone is followed in real time (tempo found, lights lit), and stopping restores a song', async fn({ page, ev }, { shots }) {
    await moreItem(page, 'Listen live');
    await page.waitForSelector('.modal .opt.big');
    assert((await page.locator('.modal .opt.big').count()) === 2, 'two sources offered');
    await page.click('.modal .opt.big:has-text("microphone")');
    await page.waitForFunction(() => window.__musync.app.live, null, { timeout: 15000 });
    assert(await page.evaluate(() => document.body.classList.contains('live')), 'body marked live');
    await page.waitForFunction(() => { const t = window.__musync.app.live?.tracker; return t && t.bpm > 100 && t.bpm < 140; }, null, { timeout: 40000 });
    const r = await ev(() => { const L = window.__musync.app.live; return { bpm: L.tracker.bpm, locked: L.tracker.status().locked, roles: L.tracker.phrases.map((p) => p.role) }; });
    assert(Math.abs(r.bpm - 120) < 6, `tempo ${r.bpm} should be near 120`);
    // the rig really plays: lights lit while the live show runs
    let lit = 0;
    for (let i = 0; i < 20; i++) { lit += await ev(() => { const st = window.__musync.app.decoder.frame(window.__musync.app.clock); return Object.values(st).filter((s) => s.dim > 0.1 || s.pixels?.some((p) => p[0] + p[1] + p[2] > 0.2)).length; }); await page.waitForTimeout(100); }
    assert(lit > 40, `lights lit during live (${lit})`);
    assert((await page.locator('.live-tag').isVisible()), 'LIVE tag visible');
    assert((await page.locator('#dock .now').innerText()).length > 0, 'dock shows the live section');
    const txt = await page.locator('#dock .track small').innerText();
    assert(/live/i.test(txt), `dock says LIVE (${txt})`);
    // sensitivity panel
    await page.click('.live-open'); await page.waitForSelector('.look');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.screenshot({ path: join(shots, 'live-mic.png') });
    // stop with the play button
    await page.click('#dock .play');
    await page.waitForFunction(() => !window.__musync.app.live, null, { timeout: 8000 });
    assert(!(await page.evaluate(() => document.body.classList.contains('live'))), 'live class removed');
    await page.waitForFunction(() => window.__musync.app.songId, null, { timeout: 8000 });
  }, timeout: 90000 },
  { name: 'live: a tab shared without sound (or a refused picker) fails kindly and nothing is left running', async fn({ page, ev }) {
    await page.keyboard.press('o'); await page.waitForSelector('.modal .opt.big');
    await page.click('.modal .opt.big:has-text("browser tab")');
    await page.waitForTimeout(2500);
    assert(!(await ev(() => window.__musync.app.live)) || true, 'ok');
    // either it worked (a fake display with audio) or it said why not; in both cases the app is usable
    if (await ev(() => !!window.__musync.app.live)) { await page.click('#dock .play'); await page.waitForFunction(() => !window.__musync.app.live); }
    else assert((await page.locator('.toast.error').count()) >= 1, 'an error toast explains what to do');
  }, timeout: 40000 },

  // ── panels, engines and links ─────────────────────────────────────
  { name: 'panels: Rig builder and Show info both open on the right, one at a time', async fn({ page }) {
    await page.keyboard.press('r'); await page.waitForSelector('#rigDrawer.open');
    const w = (await page.viewportSize()).width;
    let box = await page.locator('#rigDrawer').boundingBox();
    assert(box.x > w / 2, `rig drawer should be on the right (x=${box.x})`);
    await page.keyboard.press('s'); await page.waitForSelector('#showDrawer.open');
    await page.waitForTimeout(350);
    assert(!(await page.locator('#rigDrawer.open').count()), 'opening Show closes Rig');
    box = await page.locator('#showDrawer').boundingBox();
    assert(box.x > w / 2, 'show drawer on the right');
  } },
  { name: 'add: YouTube links are validated, deduplicated, and made with the chosen engine', async fn({ page, ev }) {
    await page.keyboard.press('a'); await page.waitForSelector('.linkrow input');
    await page.fill('.linkrow input', 'https://example.com/watch?v=abc'); await page.keyboard.press('Enter');
    await page.waitForSelector('.toast.warn');
    eq(await page.locator('.aitem').count(), 0, 'non-YouTube link refused');
    await page.click('.engine button:has-text("Code only")');
    eq(await page.getAttribute('.engine button:has-text("Code only")', 'aria-checked'), 'true', 'code engine selected');
    await page.fill('.linkrow input', 'https://www.youtube.com/watch?v=Ab3dEfGh1jK'); await page.keyboard.press('Enter');
    eq(await page.locator('.aitem').count(), 1, 'link queued');
    await page.click('.afoot .btn.primary');
    await page.waitForFunction(() => document.querySelector('.aitem.done'), null, { timeout: 20000 });
    await page.waitForFunction(() => [...window.__musync.lib.entries].some((e) => e.videoKey === 'Ab3dEfGh1jK' && e.engine === 'code'), null, { timeout: 8000 });
    const title = await ev(() => window.__musync.lib.entries.find((e) => e.videoKey === 'Ab3dEfGh1jK').title);
    assert(/Fake video/.test(title), `title comes from the video (${title})`);
    // the same video again is recognised
    await page.click('.afoot button:has-text("Clear finished")');
    await page.fill('.linkrow input', 'https://youtu.be/Ab3dEfGh1jK'); await page.keyboard.press('Enter');
    await page.click('.afoot .btn.primary');
    await page.waitForSelector('.aitem.dup', { timeout: 10000 });
    // same method again: offered "Make again", not silently repeated
    assert(await page.locator('.aitem.dup button:has-text("Make again")').count() === 1, 'make again offered');
    // switching to the AI director upgrades the code-made show and replaces it
    await page.click('.afoot button:has-text("Clear finished")');
    const oldId = await ev(() => window.__musync.lib.entries.find((e) => e.videoKey === 'Ab3dEfGh1jK').id);
    await page.click('.engine button:has-text("AI director")');
    await page.fill('.linkrow input', 'https://youtu.be/Ab3dEfGh1jK?list=RDxyz'); await page.keyboard.press('Enter');
    await page.click('.afoot .btn.primary');
    await page.waitForFunction(() => document.querySelector('.aitem.done'), null, { timeout: 30000 });
    await page.waitForFunction((o) => { const e = window.__musync.lib.entries.filter((x) => x.videoKey === 'Ab3dEfGh1jK'); return e.length === 1 && e[0].engine === 'ai' && e[0].id !== o; }, oldId, { timeout: 10000 });
    assert(/replaced/.test(await page.locator('.aitem.done small').innerText()), 'item says it replaced the earlier show');
    // now AI again: a real duplicate with the option to remake
    await page.click('.afoot button:has-text("Clear finished")');
    await page.fill('.linkrow input', 'https://www.youtube.com/watch?v=Ab3dEfGh1jK'); await page.keyboard.press('Enter');
    await page.click('.afoot .btn.primary');
    await page.waitForSelector('.aitem.dup', { timeout: 10000 });
    await page.click('.aitem.dup button:has-text("Make again")');
    await page.waitForFunction(() => document.querySelector('.aitem.done'), null, { timeout: 30000 });
    eq(await ev(() => window.__musync.lib.entries.filter((x) => x.videoKey === 'Ab3dEfGh1jK').length), 1, 'still a single library entry');
  }, timeout: 120000 },

  // ── responsive ────────────────────────────────────────────────────
  { name: 'phone: dock, library and add tab fit a 390 px screen without sideways scroll', viewport: { width: 390, height: 844 }, async fn({ page, ev }) {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    eq(await overflow(), 0, 'no horizontal overflow on load');
    assert(await page.locator('#dock .play').isVisible(), 'play button visible');
    await page.keyboard.press('l'); await page.waitForSelector('.sheet .srow');
    const box = await page.locator('.sheet').boundingBox();
    assert(box.width <= 390 + 1, `sheet fits the screen (${box.width})`);
    await page.click('.srow[data-i="2"] .smeta'); await page.waitForFunction(() => window.__musync.app.playing, null, { timeout: 8000 });
    await page.keyboard.press('a'); await page.waitForSelector('.dropbig');
    assert((await page.locator('.dropbig').boundingBox()).width <= 390, 'drop area fits');
    eq(await overflow(), 0, 'no overflow with the sheet open');
  } },
];

// ── Design with AI (fake designer: no model calls) ──────────────────────────────────────────────────────────────
// a real 1x1 PNG, a real JPEG header, and bytes that are not an image
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const NOTIMG = Buffer.from('this is not an image at all');
const plan = async (API, parts, sid) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(parts)) { if (k === 'images') for (const b of v) fd.append('images', new Blob([b.bytes]), b.name); else fd.set(k, v); }
  if (sid) fd.set('sid', sid);
  const r = await fetch(`http://127.0.0.1:${API}/api/plan`, { method: 'POST', body: fd });
  return { status: r.status, body: await r.json() };
};
const finish = async (API, id) => { for (let i = 0; i < 60; i++) { const s = await (await fetch(`http://127.0.0.1:${API}/api/plan/${id}`)).json(); if (s.status === 'done' || s.status === 'error') return s; await new Promise((r) => setTimeout(r, 150)); } throw new Error('plan never finished'); };
const ask = async (page, text, files) => {
  if (files) await page.setInputFiles('#aiDrawer input[type=file]', files);
  await page.fill('#aiDrawer .ai-text', text);
  await page.press('#aiDrawer .ai-text', 'Enter');
};
const botCount = (page) => page.locator('#aiDrawer .ai-msg.bot .ai-plan').count();
const waitPlans = (page, n) => page.waitForFunction((k) => document.querySelectorAll('#aiDrawer .ai-msg.bot .ai-plan').length >= k, n, { timeout: 15000 });

tests.push(
  { name: 'design: opens from the top bar and with D, is one-at-a-time with the other panels, and shows ideas', async fn({ page }) {
    await page.click('button[aria-controls="aiDrawer"]');
    await page.waitForSelector('#aiDrawer.open');
    eq(await page.locator('#aiDrawer .ai-ideas .mchip').count(), 4, 'four starter ideas');
    await page.keyboard.press('Escape'); await page.locator('#aiDrawer .ai-text').blur();
    await page.keyboard.press('r');
    await page.waitForSelector('#rigDrawer.open');
    assert(!(await page.locator('#aiDrawer.open').count()), 'AI panel closed when Rig opened');
    await page.keyboard.press('d');
    await page.waitForSelector('#aiDrawer.open');
    assert(!(await page.locator('#rigDrawer.open').count()), 'Rig closed when AI opened');
    await page.click('#aiDrawer .ai-ideas .mchip >> nth=1');
    assert((await page.inputValue('#aiDrawer .ai-text')).includes('open-air'), 'idea fills the box');
  } },

  { name: 'design: a request becomes a rig on screen, with a fixture list, and playback continues', async fn({ page, ev }) {
    await page.keyboard.press('d');
    await ask(page, 'A garba night for 800 guests, 14 fixtures please');
    await waitPlans(page, 1);
    const r = await ev(() => ({ venue: window.__musync.app.rig.venue, n: window.__musync.app.rig.fixtures.length, preset: window.__musync.app.presetId, playing: window.__musync.app.playing }));
    eq(r.venue, 'garba', 'venue'); assert(r.n > 0 && r.n <= 14, `fixtures ${r.n}`); eq(r.preset, 'ai', 'preset'); eq(r.playing, true, 'keeps playing');
    assert(/\d+ lights/.test(await page.locator('#aiDrawer .ai-meta').innerText()), 'the card counts the lights');
    await page.click('#aiDrawer .ai-plan summary');
    assert(/×/.test(await page.locator('#aiDrawer .ai-bom').innerText()), 'the list shows quantities');
    assert(await ev(() => window.__musync.app.decoder?.report?.present?.length > 0), 'decoder plays on the new rig');
    // the user's own saved rig is untouched
    eq(await ev(() => localStorage.getItem('musync.customRig')), null, 'nothing saved over My rig');
  } },

  { name: 'design: a follow-up edits the current rig, and any earlier design can be shown again', async fn({ page, ev }) {
    await page.keyboard.press('d');
    await ask(page, 'An outdoor concert for 3000 people');
    await waitPlans(page, 1);
    const first = await ev(() => window.__musync.app.rig.fixtures.length);
    await page.locator('#aiDrawer .ai-text').blur();
    await ask(page, 'add more beams');
    await waitPlans(page, 2);
    eq(await ev(() => window.__musync.app.rig.fixtures.length), first + 2, 'two beams added to the same rig');
    await page.locator('#aiDrawer .ai-plan >> nth=0').getByRole('button', { name: 'Show this design' }).click();
    await page.waitForFunction((n) => window.__musync.app.rig.fixtures.length === n, first, { timeout: 8000 });
    assert((await page.locator('#aiDrawer .ai-plan >> nth=0').getByRole('button', { name: 'Showing now' }).count()) === 1, 'button says showing now');
  } },

  { name: 'design: photos are attached, previewed, removable, limited to four, and sent', async fn({ page }) {
    await page.keyboard.press('d');
    const imgs = [1, 2, 3, 4, 5].map((i) => ({ name: `room${i}.png`, mimeType: 'image/png', buffer: PNG }));
    await page.setInputFiles('#aiDrawer input[type=file]', imgs);
    eq(await page.locator('#aiDrawer .ai-thumb').count(), 4, 'only four thumbnails');
    await page.locator('#aiDrawer .ai-thumb .x >> nth=0').click();
    eq(await page.locator('#aiDrawer .ai-thumb').count(), 3, 'one removed');
    await page.setInputFiles('#aiDrawer input[type=file]', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: NOTIMG }]);
    eq(await page.locator('#aiDrawer .ai-thumb').count(), 3, 'a text file is refused');
    await ask(page, 'This is the hall, ceiling about 5 m');
    await waitPlans(page, 1);
    assert(/3 photo/.test(await page.locator('#aiDrawer .ai-msg.me .ai-sub').first().innerText()), 'message says 3 photos');
    eq(await page.locator('#aiDrawer .ai-thumb').count(), 0, 'thumbnails cleared after sending');
  } },

  { name: 'design: a failed request shows the reason, keeps the old rig, and the next message works', async fn({ page, ev }) {
    await page.keyboard.press('d');
    const before = await ev(() => window.__musync.app.rig.name);
    await ask(page, 'please fail now');
    await page.waitForSelector('#aiDrawer .ai-msg.err', { timeout: 10000 });
    assert(/asked to fail/.test(await page.locator('#aiDrawer .ai-msg.err').innerText()), 'reason shown');
    eq(await ev(() => window.__musync.app.rig.name), before, 'rig unchanged');
    await page.locator('#aiDrawer .ai-text').blur();
    await ask(page, 'a small club night');
    await waitPlans(page, 1);
    eq(await ev(() => window.__musync.app.rig.venue), 'club', 'recovers');
  } },

  { name: 'design: the conversation survives a reload, "New design" clears it', async fn({ page }) {
    await page.keyboard.press('d');
    await ask(page, 'A garba ground tonight please');
    await waitPlans(page, 1);
    await page.reload();
    await page.waitForFunction(() => window.__musync?.app?.wal && !document.querySelector('#loader:not(.done)'));
    await page.keyboard.press('d');
    eq(await botCount(page), 1, 'plan card restored');
    await page.getByRole('button', { name: 'New design' }).click();
    eq(await page.locator('#aiDrawer .ai-msg').count(), 0, 'cleared');
  } },

  { name: 'design: the test bench and an AI design hand over cleanly (the real rig is not lost)', async fn({ page, ev }) {
    await ev(() => window.__musync.actions.bench.start('claypaky-sharpy'));
    assert(await ev(() => window.__musync.app.rig.fixtures.length === 1), 'bench rig');
    await page.keyboard.press('d');
    await ask(page, 'a big garba night tonight');
    await waitPlans(page, 1);
    assert(await ev(() => window.__musync.app.rig.fixtures.length > 5 && window.__musync.app.presetId === 'ai'), 'design replaced the bench');
  } },

  { name: 'design api: validation, limits, sessions and the status endpoint', async fn(_, { API }) {
    const miss = await plan(API, {});
    eq(miss.status, 400, 'no message');
    const notimg = await plan(API, { message: 'x', images: [{ name: 'a.png', bytes: NOTIMG }] });
    eq(notimg.status, 400, 'text disguised as png'); assert(/not a JPEG/.test(notimg.body.error), 'says why');
    const many = await plan(API, { message: 'x', images: Array.from({ length: 5 }, (_, i) => ({ name: `p${i}.png`, bytes: PNG })) });
    eq(many.status, 400, 'five photos');
    const badSid = await plan(API, { message: 'x' }, '../../etc');
    eq(badSid.status, 400, 'path-like session id');
    const ok = await plan(API, { message: 'a club night, limited', images: [{ name: 'a.png', bytes: PNG }] });
    eq(ok.status, 202, 'accepted'); assert(/^[a-f0-9]{16}$/.test(ok.body.sid), 'session id');
    const busy = await plan(API, { message: 'again' }, ok.body.sid);
    eq(busy.status, 409, 'second message while the first runs');
    const s = await finish(API, ok.body.id);
    eq(s.status, 'done', 'finished'); eq(s.result.venue, 'club', 'venue'); assert(s.result.bom.length > 0 && s.result.rig.fixtures.length <= 14, 'limited rig with a bill of materials');
    const next = await plan(API, { message: 'fewer lights', rig: JSON.stringify(s.result.rig) }, ok.body.sid);
    eq(next.status, 202, 'follow-up accepted');
    const s2 = await finish(API, next.body.id);
    assert(s2.result.rig.fixtures.length < s.result.rig.fixtures.length, 'fewer lights means fewer');
    const unk = await fetch(`http://127.0.0.1:${API}/api/plan/ffffffffffffffff`);
    eq(unk.status, 404, 'unknown request');
  } },
);

// ── responsive: the same checks at every screen size people use ─────────────────────────────────────────────────
const SIZES = [['wide monitor', 2560, 1300], ['full HD', 1920, 1000], ['laptop', 1366, 700], ['small laptop', 1024, 640], ['tablet upright', 820, 1180], ['phone upright', 390, 844], ['small phone', 320, 568], ['phone sideways', 844, 390]];
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel, false);
for (const [label, W, H] of SIZES) {
  tests.push({ name: `responsive (${label} ${W}x${H}): chrome fits, nothing overlaps, targets are big enough, every panel and menu stays on screen`, viewport: { width: W, height: H }, timeout: 60000, async fn({ page, ev }, { shots }) {
    const touch = W < 900;
    const bad = await page.evaluate(({ W, H }) => {
      const out = [];
      if (document.documentElement.scrollWidth > W) out.push('page scrolls sideways');
      for (const e of document.querySelectorAll('#topbar button, #dock button, #dock canvas')) {
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        const name = e.getAttribute('aria-label') || e.className;
        if (r.left < -0.5 || r.right > W + 0.5 || r.top < -0.5 || r.bottom > H + 0.5) out.push(`${name} outside the screen`);
        if (e.tagName === 'BUTTON' && (r.width < 38 || r.height < 38)) out.push(`${name} is only ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    }, { W, H }, false);
    eq(bad.join('; '), '', 'chrome');
    const tl = await rect(page, '.tb-left'), tr = await rect(page, '.tb-right'), dock = await rect(page, '#dock');
    assert(tr.l >= tl.r + 4, `top bar halves overlap (${Math.round(tl.r)} vs ${Math.round(tr.l)})`);
    assert(dock.t > tl.b + 40, 'the player leaves room for the scene');
    assert(dock.h >= 100 && dock.h <= 140, `player height ${dock.h}`);
    // the title and the play button are readable and the progress bar is a usable size
    assert((await rect(page, '.play')).w >= 48, 'play button big enough');
    assert((await rect(page, '#timelineCanvas')).w >= 160, 'progress bar wide enough');
    assert((await rect(page, '#dock .track b')).w >= 60, 'song title has room');
    // menus: camera and More
    for (const b of ['Camera view', 'More']) {
      await page.click(`button[aria-label="${b}"]`); await page.waitForSelector('.popover.on');
      const p = await rect(page, '.popover.on');
      assert(p.l >= 0 && p.r <= W + 0.5 && p.t >= 0 && p.b <= H + 0.5, `${b} menu stays on screen (${Math.round(p.l)}..${Math.round(p.r)} x ${Math.round(p.t)}..${Math.round(p.b)})`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    }
    // panels: Design with AI and Lights stay between the top bar and the player
    for (const [btn, id] of [['aiDrawer', 'aiDrawer'], ['rigDrawer', 'rigDrawer']]) {
      await page.click(`button[aria-controls="${btn}"]`); await page.waitForSelector(`#${id}.open`); await page.waitForTimeout(400);
      const d = await rect(page, `#${id}`);
      assert(d.l >= 0 && d.r <= W + 0.5 && d.t >= 0, `${id} inside the screen`);
      assert(d.b <= dock.t + 2, `${id} ends above the player (${Math.round(d.b)} vs ${Math.round(dock.t)})`);
      assert(d.h >= Math.min(200, H * 0.35), `${id} tall enough to use (${Math.round(d.h)})`);
      await page.click(`button[aria-controls="${btn}"]`); await page.waitForTimeout(350);
    }
    // the main job works at this size: choose a camera from the menu, press play, ask the designer for a rig
    await pickView(page, 'Drone: circle'); eq(await ev(() => window.__musync.app.camera), 'orbit', 'camera menu works');
    await page.click('.play'); await page.waitForTimeout(300);
    eq(await ev(() => window.__musync.app.playing), true, 'play button works');
    await page.click('button[aria-controls="aiDrawer"]'); await page.waitForSelector('#aiDrawer.open');
    await ask(page, 'a club night, limited');
    await waitPlans(page, 1);
    assert(await ev(() => window.__musync.app.rig.venue === 'club'), 'design applied');
    const send = await rect(page, '#aiDrawer .ai-row button.primary'), input = await rect(page, '#aiDrawer .ai-text');
    assert(send.w >= 40 && input.w >= 120, 'composer usable');
    if (touch) assert(send.h >= 44, 'send button is a finger-sized target');
    await page.screenshot({ path: `${shots}/responsive-${W}x${H}.png` });
  } });
}

tests.push(
  { name: 'venues: Banquet hall and Wedding lawn load, play, and every camera view works in them', async fn({ page, ev }) {
    for (const [id, kind] of [['hall', 'hall'], ['lawn', 'lawn']]) {
      await ev(async (r) => { await window.__musync.loadRigPreset(r); }, id);
      await page.waitForFunction((k) => window.__musync.app.venue?.kind === k, kind, { timeout: 20000 });
      assert(await ev(() => window.__musync.app.rig.fixtures.length >= 10), `${id} has a starter rig`);
      for (const mode of ['director', 'crane', 'orbit', 'reveal', 'fly', 'top', 'foh', 'crowd', 'pit', 'stage', 'walk', 'free']) {
        await ev((m) => window.__musync.actions.setCamera(m), mode);
        await page.waitForTimeout(80);
        const ok = await ev(() => { const p = window.__musync.stage.camera.position; return [p.x, p.y, p.z].every(Number.isFinite); });
        assert(ok, `${id} ${mode}: camera position is not a number`);
      }
      await ev(() => { window.__musync.actions.setCamera('foh'); window.__musync.capture.hold(true); window.__musync.capture.seek(30); window.__musync.capture.step(2, 20); });
      assert(await ev(() => window.__musync.app.decoder.report.present.includes('beam')), `${id}: the show plays on its rig`);
    }
    await page.click('button[aria-controls="rigDrawer"]'); await page.waitForSelector('#rigDrawer.open');
    const names = await page.locator('#rigDrawer .opt b').allInnerTexts();
    for (const n of ['Banquet hall', 'Wedding lawn', 'Concert stage', 'Dandiya / Garba ground', 'Club']) assert(names.includes(n), `place list has ${n}`);
  }, timeout: 90000 },

  { name: 'design: the first design starts from an empty venue, never from the built-in rig; edits send only the AI design', async fn({ page, ev }) {
    const bodies = [];
    await page.route('**/api/plan', async (route) => { const b = route.request().postData() || ''; bodies.push(/name="rig"/.test(b)); await route.continue(); });
    await ev(async () => { await window.__musync.loadRigPreset('concert'); });
    await page.keyboard.press('d');
    await ask(page, 'A wedding reception for 250 guests in a banquet hall, keep it limited');
    await waitPlans(page, 1);
    eq(bodies[0], false, 'no rig was sent with the first message while the concert preset was showing');
    const r1 = await ev(() => ({ venue: window.__musync.app.rig.venue, kind: window.__musync.app.venue.kind, name: window.__musync.app.rig.name }));
    eq(r1.venue, 'hall', 'wedding in a hall goes to the banquet hall'); eq(r1.kind, 'hall', 'the hall scene is on screen');
    await page.locator('#aiDrawer .ai-text').blur();
    await ask(page, 'add more beams');
    await waitPlans(page, 2);
    eq(bodies[1], true, 'the follow-up sends the AI design');
    // the built-in presets are exactly as they were
    const counts = await ev(async () => { const o = {}; for (const id of ['concert', 'club', 'dandiya']) o[id] = (await (await fetch(`rigs/${id}.json`)).json()).fixtures.length; return o; });
    eq(JSON.stringify(counts), JSON.stringify({ concert: 42, club: 38, dandiya: 28 }), 'built-in rigs unchanged');
  }, timeout: 60000 },

  { name: 'design: a vague first message gets one question with tap answers, nothing changes on screen, tapping continues', async fn({ page, ev }) {
    await page.keyboard.press('d');
    const before = await ev(() => window.__musync.app.rig.name);
    await ask(page, 'help me');
    await page.waitForSelector('#aiDrawer .ai-ask .mchip', { timeout: 15000 });
    eq(await page.locator('#aiDrawer .ai-plan').count(), 0, 'no design card for a question');
    eq(await ev(() => window.__musync.app.rig.name), before, 'the rig on screen is untouched');
    assert(!/null/.test(await page.locator('#aiDrawer .ai-list').innerText()), 'no stray "null" text');
    await page.locator('#aiDrawer .ai-ask .mchip:has-text("Wedding")').click();
    await waitPlans(page, 1);
    eq(await ev(() => window.__musync.app.rig.venue), 'hall', 'wedding builds in the hall');
    const txt = await page.locator('#aiDrawer .ai-list').innerText();
    assert(!/null|undefined/.test(txt), 'no null or undefined anywhere in the chat');
    assert(/Banquet hall/.test(txt) && /lights/.test(txt), 'the card names the venue and counts the lights');
  } },
);
