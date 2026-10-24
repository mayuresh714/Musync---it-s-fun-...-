// Fetching the audio of a YouTube link with yt-dlp (must be installed: brew install yt-dlp).
// Only YouTube hosts are accepted, the URL is passed as an argument (never through a shell), one video at a time.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;
export const MAX_SECONDS = 25 * 60;
export const ytdlpAvailable = () => !!process.env.MUSYNC_FAKE_YTDLP || spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0;

// -> normalised key for de-duplication, or null if this is not a single YouTube video link
export function videoKey(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.test(u.hostname)) return null;
  const id = /youtu\.be$/i.test(u.hostname) ? u.pathname.slice(1) : u.searchParams.get('v') || (/^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname) || [])[2];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

function run(args, { signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; if (onLine) String(d).split('\n').forEach((l) => l && onLine(l)); });
    p.stderr.on('data', (d) => { err += d; });
    const abort = () => p.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    p.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? 'yt-dlp is not installed. Install it with: brew install yt-dlp' : e.message)));
    p.on('close', (code) => { signal?.removeEventListener('abort', abort); if (signal?.aborted) reject(new Error('Cancelled')); else if (code === 0) resolve(out); else { const er = new Error(friendly(err)); er.raw = err; reject(er); } });
  });
}
// YouTube often asks anonymous downloads to "confirm you're not a bot". The fix is to borrow the sign-in of a browser on this
// computer (cookies are read locally by yt-dlp and never stored or sent anywhere else). Chrome by default; MUSYNC_YT_BROWSER overrides.
const BOT = /confirm you.re not a bot|Sign in to confirm|cookies/i;
let useCookies = false; // once needed, used for every later download this session
const BROWSER = () => process.env.MUSYNC_YT_BROWSER || 'chrome';
async function ytdlp(args, opts) {
  const withCookies = () => ['--cookies-from-browser', BROWSER(), ...args];
  if (useCookies) return run(withCookies(), opts);
  try { return await run(args, { ...opts, raw: true }); }
  catch (e) {
    if (!BOT.test(e.raw || '')) throw new Error(friendly(e.raw || e.message));
    useCookies = true;
    return run(withCookies(), opts);
  }
}
const friendly = (e) => (/Private video|members-only/i.test(e) ? 'That video is private or members-only, so it cannot be downloaded.'
  : BOT.test(e) ? `YouTube wants a signed-in browser for this video. Sign in to YouTube in ${BROWSER() === 'chrome' ? 'Chrome' : BROWSER()} on this computer and try again (you may be asked to allow keychain access).`
  : /unavailable|not available|removed/i.test(e) ? 'That video is unavailable.' : /HTTP Error 429|Too Many/i.test(e) ? 'YouTube is rate-limiting this computer. Try again in a few minutes.'
  : `yt-dlp could not fetch it: ${String(e).trim().split('\n').pop().slice(0, 200)}`);

// -> { file, title, artist, duration }
export async function fetchAudio(url, dir, { signal, emit = () => {} } = {}) {
  if (process.env.MUSYNC_FAKE_YTDLP) { // test seam: a short silent track, no network
    const n = 4410 + Math.floor(Math.random() * 1000), b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(14700, 24); b.writeUInt32LE(29400, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    writeFileSync(join(dir, 'audio.wav'), b);
    return { file: 'audio.wav', title: `Fake video ${videoKey(url)}`, artist: 'Fake Channel', duration: 3 };
  }
  emit({ stage: 'download', detail: 'Reading the video details' });
  const info = JSON.parse(await ytdlp(['--no-playlist', '--no-warnings', '--dump-single-json', '--', url], { signal }));
  if (info.is_live) throw new Error('That is a live stream; use Live mode in the simulator instead.');
  if (info.duration > MAX_SECONDS) throw new Error(`That video is ${Math.round(info.duration / 60)} minutes long; the limit is ${MAX_SECONDS / 60}.`);
  emit({ stage: 'download', detail: `Downloading the audio (${Math.round(info.duration / 60 * 10) / 10} min)` });
  await ytdlp(['--no-playlist', '--no-warnings', '-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', join(dir, 'audio.%(ext)s'), '--', url], { signal });
  const file = readdirSync(dir).find((f) => /^audio\.(mp3|m4a|opus|wav|webm|ogg)$/.test(f));
  if (!file) throw new Error('The download finished but no audio file was produced.');
  const artist = (info.artist || info.creator || info.uploader || '').replace(/ - Topic$/, '');
  return { file, title: info.track || info.title || '', artist, duration: info.duration };
}
