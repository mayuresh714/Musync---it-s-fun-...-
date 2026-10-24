#!/usr/bin/env node
// Musync backend: accepts an audio file, runs the Claude director, streams progress, serves the result.
// Local-first: listens on 127.0.0.1 and uses the Claude Code CLI login already on this machine.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, createReadStream, rmSync, copyFileSync } from 'node:fs';
import { join, extname, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { direct as realDirect } from './lib/director.js';
import { fakeDirect } from './lib/fake-director.js';
import { directCode } from './lib/codegen.js';
import { fetchAudio, ytdlpAvailable, videoKey } from './lib/youtube.js';
import { claudeAvailable } from './lib/claude.js';
import { design as realDesign, IMAGE_TYPES } from './lib/planner.js';
import { fakeDesign } from './lib/fake-planner.js';
import { remasterWal, needsRemaster, validateWal } from '../core/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.MUSYNC_DATA || join(ROOT, '.musync', 'jobs');
const PORT = Number(process.env.MUSYNC_PORT || 8787);
const MAX_UPLOAD = 300 * 1024 * 1024;
mkdirSync(DATA, { recursive: true });

// MUSYNC_FAKE_DIRECTOR=1 swaps Claude for a canned show, so the whole add-songs flow can be tested for free
const direct = process.env.MUSYNC_FAKE_DIRECTOR ? fakeDirect : realDirect;
// MUSYNC_FAKE_YTDLP=1 likewise fakes the download of a link
const jobs = new Map(); // id -> { id, status, events[], listeners:Set, controller, error, report }
let queue = Promise.resolve();
const AUDIO_TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const fail = (res, code, message) => json(res, code, { error: message });
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const safeName = (n) => basename(String(n || 'song')).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
const field = (fd, k) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, 20000) : undefined; };

// The library: one light entry per finished show, kept in memory and refreshed as jobs finish, so listing
// a thousand songs never touches a thousand WAL files.
const library = new Map();
function entryOf(job) {
  const r = job.report;
  if (!r) return null;
  const id = job.id;
  return {
    id, title: job.meta.title || r.title || job.meta.filename, artist: job.meta.artist || r.artist || r.understanding?.artist || '',
    bpm: r.bpm, duration: r.duration, styles: r.styles || r.understanding?.styles || [], mood: r.mood || r.understanding?.mood || '', language: r.language || r.understanding?.language || '',
    created: job.meta.created, sha256: r.sha256 || null, source: 'ai', director: true, cost: r.costUsd, engine: r.engine || job.meta.engine || 'ai', videoKey: job.meta.videoKey || null,
    wal: `/api/jobs/${id}/wal`, audio: `/api/jobs/${id}/audio`,
  };
}
function indexJob(job) { const e = entryOf(job); if (e && job.status === 'done') library.set(job.id, e); }
const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex');

function emitTo(job, event) {
  const ev = { at: Date.now(), ...event };
  if (ev.stage && ev.stage !== 'end') { job.stage = ev.stage; if (ev.detail) job.detail = ev.detail; }
  // streaming-token chatter is only useful live; keep history small
  if (!(ev.chars != null && !ev.done)) job.events.push(ev); else job.last = ev;
  for (const send of job.listeners) send(ev);
}

function startJob(job, input) {
  job.status = 'queued';
  emitTo(job, { stage: 'queued', detail: 'Waiting for its turn' });
  queue = queue.then(async () => {
    if (job.controller.signal.aborted) return;
    job.status = 'running';
    try {
      const signal = job.controller.signal;
      if (input.url) { // a link: fetch the audio first, then carry on exactly as for an upload
        const got = await fetchAudio(input.url, job.dir, { signal, emit: (e) => emitTo(job, e) });
        input.audioPath = join(job.dir, got.file);
        input.filename = safeName(got.file);
        input.title ||= got.title || undefined;
        input.artist ||= got.artist || undefined;
        job.meta = { ...job.meta, audio: got.file, filename: input.filename, title: job.meta.title || input.title, artist: job.meta.artist || input.artist };
        writeFileSync(join(job.dir, 'meta.json'), JSON.stringify(job.meta, null, 1));
      }
      const run = process.env.MUSYNC_FAKE_DIRECTOR ? fakeDirect : job.meta.engine === 'code' ? directCode : direct;
      const { report } = await run({ ...input, engine: job.meta.engine, dir: job.dir, signal, emit: (e) => emitTo(job, e) });
      job.status = 'done'; job.report = report; indexJob(job);
      const old = job.meta.replaces;
      if (old && old !== job.id && library.has(old) && !['queued', 'running'].includes(jobs.get(old)?.status)) { jobs.delete(old); library.delete(old); rmSync(join(DATA, old), { recursive: true, force: true }); }
    } catch (e) {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'error';
      job.error = job.controller.signal.aborted ? 'Cancelled' : e.message;
      emitTo(job, { stage: 'error', error: job.error });
      writeFileSync(join(job.dir, 'error.txt'), String(e.stack || e));
    }
    for (const send of job.listeners) send({ stage: 'end' });
  });
}

function loadJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  const dir = join(DATA, id);
  if (!/^[a-f0-9]{16}$/.test(id) || !existsSync(join(dir, 'meta.json'))) return null;
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const done = existsSync(join(dir, 'song.wal.json'));
  const job = { id, dir, meta, status: done ? 'done' : 'error', events: [], listeners: new Set(), controller: new AbortController(), report: done ? JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) : null, error: done ? null : 'This job did not finish' };
  jobs.set(id, job);
  return job;
}

function sendFile(req, res, file, type) {
  const size = statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(file).pipe(res);
  }
}

const routes = [
  ['GET', /^\/api\/health$/, async (req, res) => json(res, 200, { ok: true, claude: process.env.MUSYNC_FAKE_DIRECTOR ? 'fake' : await claudeAvailable(), ffmpeg: process.env.MUSYNC_FAKE_DIRECTOR ? true : hasFfmpeg(), model: process.env.MUSYNC_MODEL || 'sonnet', ytdlp: ytdlpAvailable() })],

  ['POST', /^\/api\/jobs$/, async (req, res) => {
    if (Number(req.headers['content-length']) > MAX_UPLOAD) return fail(res, 413, 'That file is too large (limit 300 MB).');
    const ctype = req.headers['content-type'] || '';
    if (!ctype.startsWith('multipart/form-data')) return fail(res, 400, 'Send multipart form data with a "file" or a "url" field.');
    let fd;
    try { fd = await new Request('http://local/', { method: 'POST', headers: { 'content-type': ctype }, body: Readable.toWeb(req), duplex: 'half' }).formData(); }
    catch (e) { return fail(res, 400, `Could not read the upload: ${e.message}`); }
    const engine = field(fd, 'engine') === 'code' ? 'code' : 'ai';
    const fake = !!process.env.MUSYNC_FAKE_DIRECTOR;
    if (engine === 'ai' && !fake && !(await claudeAvailable())) return fail(res, 503, 'The Claude Code CLI was not found. Install Claude Code and sign in by running `claude` once, or choose the code engine.');
    if (!fake && !hasFfmpeg()) return fail(res, 503, 'ffmpeg is not installed. Install it with `brew install ffmpeg`.');
    const url = field(fd, 'url');
    const file = fd.get('file');
    const id = randomBytes(8).toString('hex');
    const dir = join(DATA, id);
    let audioName = null, hash = null, key = null, bytes = null, ext = null, replaces = null;
    if (url) {
      key = videoKey(url);
      if (!key) return fail(res, 400, 'That is not a YouTube video link. Paste a youtube.com or youtu.be link to a single video.');
      if (!ytdlpAvailable()) return fail(res, 503, 'yt-dlp is not installed, so links cannot be downloaded. Install it with: brew install yt-dlp');
      const busy = [...jobs.values()].find((j) => j.meta.videoKey === key && ['queued', 'running'].includes(j.status));
      if (busy) return json(res, 200, { id: busy.id, duplicate: true, busy: true, title: busy.meta.title || 'this video' });
      const dup = [...library.values()].find((e) => e.videoKey === key);
      if (dup) {
        // asking for the AI version of a song made by code upgrades it; the same method again needs an explicit "make again"
        if (field(fd, 'replace') === dup.id || (engine === 'ai' && dup.engine === 'code')) replaces = dup.id;
        else return json(res, 200, { id: dup.id, duplicate: true, engine: dup.engine, title: dup.title || 'this video' });
      }
    } else {
      if (!file || typeof file === 'string' || !file.size) return fail(res, 400, 'No audio file or link in the request.');
      ext = (extname(file.name || '').toLowerCase() || '.wav');
      if (!AUDIO_TYPES[ext]) return fail(res, 400, `${ext} is not a supported audio type (use wav, mp3, m4a, aac, ogg or flac).`);
      bytes = Buffer.from(await file.arrayBuffer());
      hash = sha256Of(bytes);
      const dup = [...library.values()].find((e) => e.sha256 === hash);
      if (dup) {
        if (field(fd, 'replace') === dup.id || (engine === 'ai' && dup.engine === 'code')) replaces = dup.id;
        else return json(res, 200, { id: dup.id, duplicate: true, engine: dup.engine, title: dup.title });
      }
    }
    mkdirSync(dir, { recursive: true });
    if (bytes) { audioName = `audio${ext}`; writeFileSync(join(dir, audioName), bytes); }
    const meta = { id, filename: bytes ? safeName(file.name) : (url || '').slice(0, 120), title: field(fd, 'title') || (replaces && library.get(replaces)?.title) || '', artist: field(fd, 'artist') || (replaces && library.get(replaces)?.artist) || '', style: field(fd, 'style'), notes: field(fd, 'notes'), engine, created: new Date().toISOString(), audio: audioName, ...(replaces ? { replaces } : {}), ...(url ? { url, videoKey: key } : {}) };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
    const job = { id, dir, meta, status: 'queued', events: [], listeners: new Set(), controller: new AbortController() };
    jobs.set(id, job);
    startJob(job, { audioPath: audioName && join(dir, audioName), filename: meta.filename, title: meta.title, artist: meta.artist, style: meta.style, notes: meta.notes, lyricsText: field(fd, 'lyrics'), url });
    json(res, 202, { id, ...(replaces ? { replaces } : {}) });
  }],

  ['GET', /^\/api\/jobs\/([a-f0-9]{16})\/events$/, (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown job');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    job.events.forEach(send);
    if (job.last) send(job.last);
    if (['done', 'error', 'cancelled'].includes(job.status)) { send({ stage: 'end' }); return res.end(); }
    const listener = (ev) => { send(ev); if (ev.stage === 'end') res.end(); };
    job.listeners.add(listener);
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(beat); job.listeners.delete(listener); });
  }],

  ['GET', /^\/api\/jobs\/([a-f0-9]{16})$/, (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown job');
    json(res, 200, { id, status: job.status, error: job.error || null, meta: job.meta, report: job.report || null });
  }],

  ['POST', /^\/api\/jobs\/([a-f0-9]{16})\/cancel$/, (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown job');
    job.controller.abort();
    json(res, 200, { ok: true });
  }],

  ['GET', /^\/api\/jobs\/([a-f0-9]{16})\/wal$/, (req, res, [id]) => {
    const job = loadJob(id);
    const f = job && join(job.dir, 'song.wal.json');
    if (!f || !existsSync(f)) return fail(res, 404, 'No WAL yet');
    sendFile(req, res, f, 'application/json');
  }],

  ['GET', /^\/api\/jobs\/([a-f0-9]{16})\/audio$/, (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown job');
    sendFile(req, res, join(job.dir, job.meta.audio), AUDIO_TYPES[extname(job.meta.audio)] || 'application/octet-stream');
  }],

  ['GET', /^\/api\/library$/, (req, res) => json(res, 200, [...library.values()].sort((a, b) => b.created.localeCompare(a.created)))],

  // Everything the queue knows about, newest first: lets the interface show a batch of songs being onboarded.
  ['GET', /^\/api\/jobs$/, (req, res) => {
    const queued = [...jobs.values()].filter((j) => j.status === 'queued').sort((a, b) => a.meta.created.localeCompare(b.meta.created));
    const list = [...jobs.values()].filter((j) => j.events.length > 0).map((j) => ({
      id: j.id, status: j.status, title: j.meta.title || j.meta.filename, filename: j.meta.filename, stage: j.stage || null, detail: j.detail || null,
      error: j.error || null, created: j.meta.created, position: j.status === 'queued' ? queued.indexOf(j) + 1 : 0, ...(j.last?.progress ? { progress: j.last.progress } : {}),
    }));
    json(res, 200, list.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 200));
  }],

  ['DELETE', /^\/api\/library\/([a-f0-9]{16})$/, (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown song');
    if (job.status === 'running' || job.status === 'queued') return fail(res, 409, 'That song is still being made. Cancel it first.');
    jobs.delete(id); library.delete(id);
    rmSync(join(DATA, id), { recursive: true, force: true });
    json(res, 200, { ok: true });
  }],

  ['PATCH', /^\/api\/library\/([a-f0-9]{16})$/, async (req, res, [id]) => {
    const job = loadJob(id);
    if (!job) return fail(res, 404, 'Unknown song');
    let body = '';
    for await (const c of req) { body += c; if (body.length > 10000) return fail(res, 413, 'Too large'); }
    let patch; try { patch = JSON.parse(body || '{}'); } catch { return fail(res, 400, 'Send JSON'); }
    for (const k of ['title', 'artist']) if (typeof patch[k] === 'string') job.meta[k] = patch[k].trim().slice(0, 200);
    writeFileSync(join(job.dir, 'meta.json'), JSON.stringify(job.meta, null, 1));
    indexJob(job);
    json(res, 200, library.get(id) || { ok: true });
  }],
];

// ── video export ─────────────────────────────────────────────────────────
// The browser renders the show one fixed time-step at a time and posts each frame; ffmpeg joins them with the song.
// Nothing here depends on how fast the machine draws, so the file is smooth and exact.
const exportsMap = new Map();
const EXPORT_DIR = process.env.MUSYNC_EXPORTS || join(homedir(), 'Downloads');
async function readBody(req, max = 40 * 1024 * 1024) {
  const parts = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new Error('Frame too large'); parts.push(c); }
  return Buffer.concat(parts);
}
routes.push(
  ['POST', /^\/api\/export$/, async (req, res) => {
    if (!hasFfmpeg()) return fail(res, 503, 'ffmpeg is not installed. Install it with `brew install ffmpeg`.');
    let o; try { o = JSON.parse((await readBody(req, 20000)).toString() || '{}'); } catch { return fail(res, 400, 'Send JSON'); }
    const fps = Math.max(12, Math.min(60, Number(o.fps) || 30));
    const name = String(o.name || 'Musync show').replace(/[^\w\- ]+/g, '').trim().slice(0, 150) || 'Musync show';
    const id = randomBytes(6).toString('hex');
    mkdirSync(EXPORT_DIR, { recursive: true });
    let file = join(EXPORT_DIR, `${name}.mp4`);
    for (let i = 2; existsSync(file); i++) file = join(EXPORT_DIR, `${name} (${i}).mp4`);
    const w = Math.max(2, Math.round(Number(o.width) / 2) * 2) || 1920;
    const audio = typeof o.audio === 'string' && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(o.audio) ? o.audio : null;
    const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0'];
    if (audio) args.push('-ss', String(Math.max(0, Number(o.from) || 0)), '-i', audio);
    args.push('-vf', `scale=${w}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-maxrate', '24M', '-bufsize', '48M', '-r', String(fps), '-movflags', '+faststart');
    if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
    args.push(file);
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; ff.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    const ex = { id, ff, file, frames: 0, err: () => err, exited: new Promise((r) => ff.on('close', (code) => r(code))) };
    ff.stdin.on('error', () => {});
    exportsMap.set(id, ex);
    json(res, 200, { id, file });
  }],
  ['POST', /^\/api\/export\/([a-f0-9]{12})\/frame$/, async (req, res, [id]) => {
    const ex = exportsMap.get(id);
    if (!ex) return fail(res, 404, 'Unknown export');
    const buf = await readBody(req);
    if (ex.ff.exitCode != null) return fail(res, 500, `ffmpeg stopped: ${ex.err().split('\n').slice(-3).join(' ')}`);
    if (!ex.ff.stdin.write(buf)) await new Promise((r) => ex.ff.stdin.once('drain', r));
    ex.frames++;
    json(res, 200, { ok: true, frames: ex.frames });
  }],
  ['POST', /^\/api\/export\/([a-f0-9]{12})\/(finish|cancel)$/, async (req, res, [id, what]) => {
    const ex = exportsMap.get(id);
    if (!ex) return fail(res, 404, 'Unknown export');
    exportsMap.delete(id);
    if (what === 'cancel') { ex.ff.kill('SIGKILL'); await ex.exited; rmSync(ex.file, { force: true }); return json(res, 200, { ok: true }); }
    ex.ff.stdin.end();
    const code = await ex.exited;
    if (code !== 0) return fail(res, 500, `ffmpeg failed: ${ex.err().split('\n').slice(-3).join(' ')}`);
    json(res, 200, { ok: true, file: ex.file, frames: ex.frames, bytes: statSync(ex.file).size });
  }],
);

// ── AI designer: a chat turn (words + photos + the current rig) in, a validated rig plan out ─────────────────────────
const PLANS = process.env.MUSYNC_PLANS || join(dirname(DATA), 'plans');
mkdirSync(PLANS, { recursive: true });
const planJobs = new Map(); // id -> { id, sid, status, stage, detail, chars, result, error }
let planQueue = Promise.resolve();
const sniffImage = (b) => (b[0] === 0xff && b[1] === 0xd8 ? '.jpg' : b.slice(0, 4).toString('latin1') === '\x89PNG' ? '.png' : b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' ? '.webp' : b.slice(0, 3).toString('latin1') === 'GIF' ? '.gif' : null);
const MAX_PHOTOS = 4, MAX_PHOTO = 8 * 1024 * 1024;
routes.push(
  ['POST', /^\/api\/plan$/, async (req, res) => {
    if (Number(req.headers['content-length']) > MAX_PHOTOS * MAX_PHOTO + 1024 * 1024) return fail(res, 413, 'Too much data: up to 4 photos of 8 MB each.');
    const ctype = req.headers['content-type'] || '';
    if (!ctype.startsWith('multipart/form-data')) return fail(res, 400, 'Send multipart form data with a "message".');
    let fd;
    try { fd = await new Request('http://local/', { method: 'POST', headers: { 'content-type': ctype }, body: Readable.toWeb(req), duplex: 'half' }).formData(); }
    catch (e) { return fail(res, 400, `Could not read the request: ${e.message}`); }
    const fake = !!process.env.MUSYNC_FAKE_DIRECTOR;
    if (!fake && !(await claudeAvailable())) return fail(res, 503, 'The Claude Code CLI was not found. Install Claude Code and sign in by running `claude` once.');
    const message = field(fd, 'message');
    if (!message) return fail(res, 400, 'Tell the designer what you need.');
    let sid = field(fd, 'sid');
    if (sid && !/^[a-f0-9]{16}$/.test(sid)) return fail(res, 400, 'Bad session id.');
    sid ||= randomBytes(8).toString('hex');
    const dir = join(PLANS, sid);
    if (planJobs.size && [...planJobs.values()].some((j) => j.sid === sid && ['queued', 'running'].includes(j.status))) return fail(res, 409, 'The designer is still working on your last message.');
    const files = fd.getAll('images').filter((f) => f && typeof f !== 'string' && f.size);
    if (files.length > MAX_PHOTOS) return fail(res, 400, `At most ${MAX_PHOTOS} photos per message.`);
    const saved = [];
    mkdirSync(dir, { recursive: true });
    let n = readdirSync(dir).filter((f) => /^photo-\d+\./.test(f)).length;
    for (const f of files) {
      if (f.size > MAX_PHOTO) return fail(res, 413, 'A photo is larger than 8 MB.');
      const bytes = Buffer.from(await f.arrayBuffer());
      const ext = sniffImage(bytes);
      if (!ext) return fail(res, 400, `${safeName(f.name)} is not a JPEG, PNG, WebP or GIF image.`);
      const name = `photo-${++n}${ext}`;
      writeFileSync(join(dir, name), bytes); saved.push(name);
    }
    let rig = null;
    const rj = field(fd, 'rig');
    if (rj) { try { rig = JSON.parse(rj); if (!Array.isArray(rig?.fixtures)) rig = null; } catch { rig = null; } }
    const id = randomBytes(8).toString('hex');
    const job = { id, sid, status: 'queued', stage: 'queued', detail: 'Waiting for its turn', controller: new AbortController() };
    planJobs.set(id, job);
    planQueue = planQueue.then(async () => {
      job.status = 'running';
      try {
        const run = fake ? fakeDesign : realDesign;
        const out = await run({ dir, message, rig, newImages: saved, signal: job.controller.signal, emit: (e) => { if (e.stage) job.stage = e.stage; if (e.detail) job.detail = e.detail; if (e.chars != null) job.chars = e.chars; } });
        job.result = { ...out.plan, warnings: out.warnings, sid, photos: saved.length }; job.status = 'done'; job.stage = 'done';
      } catch (e) { job.status = 'error'; job.error = e.message; job.stage = 'error'; }
    });
    json(res, 202, { id, sid });
  }],
  ['GET', /^\/api\/plan\/([a-f0-9]{16})$/, (req, res, [id]) => {
    const j = planJobs.get(id);
    if (!j) return fail(res, 404, 'Unknown request.');
    json(res, 200, { id, status: j.status, stage: j.stage, detail: j.detail, chars: j.chars || 0, ...(j.result ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}) });
  }],
);

// A show made by an older choreography is re-made from its own stored structure (no AI, no audio): the old file stays as song.wal.v1.json.
function migrate(id) {
  const f = join(DATA, id, 'song.wal.json');
  try {
    const wal = JSON.parse(readFileSync(f, 'utf8'));
    if (!needsRemaster(wal)) return;
    const next = remasterWal(wal);
    if (!validateWal(next).ok) return;
    copyFileSync(f, join(DATA, id, 'song.wal.v1.json')); writeFileSync(f, JSON.stringify(next));
    console.log(`remastered ${wal.meta.title}`);
  } catch (e) { console.error('could not remaster', id, e.message); }
}
for (const id of readdirSync(DATA)) { try { if (existsSync(join(DATA, id, 'song.wal.json'))) migrate(id); const j = loadJob(id); if (j?.status === 'done') indexJob(j); } catch (e) { console.error('skipped', id, e.message); } }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  for (const [method, re, handler] of routes) {
    const m = method === req.method && re.exec(url.pathname);
    if (!m) continue;
    try { return await handler(req, res, m.slice(1)); }
    catch (e) { console.error(e); if (!res.headersSent) fail(res, 500, e.message); else res.end(); return; }
  }
  fail(res, 404, 'Not found');
});
server.requestTimeout = 0;
server.listen(PORT, '127.0.0.1', async () => {
  const claude = await claudeAvailable();
  console.log(`musync backend on http://127.0.0.1:${PORT}  claude: ${claude || 'NOT FOUND'}  ffmpeg: ${hasFfmpeg() ? 'ok' : 'NOT FOUND'}  data: ${DATA}`);
});
