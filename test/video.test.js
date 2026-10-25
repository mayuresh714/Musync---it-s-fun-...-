import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFrameStats, profileOf, barMotion, hitsOnBeat, cleanBrief, videoBlock, measureVideo, makeSheets, extractAudio, isVideoFile, watchPrompt } from '../server/lib/video.js';
import { barTable, biblePrompt } from '../server/lib/brief.js';

const W = 48, H = 27, FRAME = W * H * 3;
const frame = (r, g, b, box = null) => { // one raw rgb24 thumbnail, optionally with a bright box at x
  const f = Buffer.alloc(FRAME);
  for (let i = 0; i < W * H; i++) { f[i * 3] = r; f[i * 3 + 1] = g; f[i * 3 + 2] = b; }
  if (box != null) for (let y = 8; y < 16; y++) for (let x = box; x < box + 8 && x < W; x++) { const p = (y * W + x) * 3; f[p] = 255; f[p + 1] = 255; f[p + 2] = 0; }
  return f;
};
const statsOf = (frames) => { const s = createFrameStats(); s.push(Buffer.concat(frames)); return s.out; };

test('frame stats read whole frames even when chunks split them', () => {
  const a = frame(10, 10, 10), b = frame(10, 10, 10, 5), buf = Buffer.concat([a, b]);
  const s = createFrameStats();
  s.push(buf.subarray(0, 1000)); s.push(buf.subarray(1000, 5000)); s.push(buf.subarray(5000));
  assert.equal(s.out.diff.length, 2);
  assert.equal(s.out.diff[0], 0);
  assert.ok(s.out.diff[1] > 0);
});

test('a still picture is "little" movement; a moving box is "busy"; a hard cut is a cut, not motion', () => {
  const still = profileOf(statsOf(Array.from({ length: 80 }, () => frame(20, 30, 60))));
  assert.equal(still.movement, 'little');
  assert.equal(still.hits.length, 0);
  const frames = [];
  for (let i = 0; i < 40; i++) frames.push(frame(20, 30, 60, (i * 7) % 38)); // box dances for 10 s
  for (let i = 0; i < 40; i++) frames.push(frame(200, 40, 40, (i * 7) % 38)); // hard cut to another set at 10 s
  const p = profileOf(statsOf(frames));
  assert.equal(p.movement, 'busy');
  assert.deepEqual(p.cuts, [10]);
  assert.ok(p.motion.every((m) => m >= 0 && m <= 1));
});

test('bar motion is 0-9 per bar and hits snap to a beat within 90 ms', () => {
  const p = { rate: 4, duration: 8, motion: [...Array(16).fill(0.05), ...Array(16).fill(0.9)], cuts: [4.5], hits: [{ t: 5.03, strength: 0.9 }, { t: 6.5, strength: 0.6 }] };
  const bars = barMotion(p, [{ t: 0 }, { t: 4 }], 8);
  assert.equal(bars[0].m, 0); assert.equal(bars[1].m, 8); assert.equal(bars[1].cuts, 1);
  const h = hitsOnBeat(p, [5, 5.5, 6, 6.4], 10);
  assert.deepEqual(h.map((x) => [x.t, x.onBeat]), [[5, true], [6.5, false]]);
});

test('the video brief reply is cleaned: clamped times, valid colours, junk dropped, empty is refused', () => {
  const b = cleanBrief({ usefulness: 'rich', cast: [{ role: 'lead', look: 'dancer in red' }, {}], scenes: [
    { start: 10, end: 5, action: 'bad' }, { start: -3, end: 40, action: 'wide', energy: 99, colors: ['#FF0000', 'red', '#12'] }, { start: 2, end: 9, action: 'ok', energy: 4 }],
  steps: [{ name: 'hook step', what: 'arms up', at: [3, 999, 'x'] }, { what: 'no name' }], lights: ['one', '', 5] }, 30);
  assert.deepEqual(b.scenes.map((s) => [s.start, s.end]), [[0, 30], [2, 9]]);
  assert.equal(b.scenes[0].energy, 9);
  assert.deepEqual(b.scenes[0].colors, ['#ff0000']);
  assert.deepEqual(b.steps, [{ name: 'hook step', what: 'arms up', at: [3] }]);
  assert.equal(b.cast.length, 1);
  assert.equal(cleanBrief({ scenes: [], steps: [] }, 30), null);
  assert.equal(cleanBrief('nope', 30), null);
});

test('the video block and the bar table carry the picture into the director prompt, and audio-only prompts stay unchanged', () => {
  const a = { bpm: 120, meter: 4, key: 'C', tempoNote: '', duration: 8, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], downbeats: [0, 2, 4, 6], sections: [], accents: [],
    onsets: { low: [], mid: [], high: [] }, envelopes: { rate: 20, energy: Array(160).fill(30), low: Array(160).fill(30), mid: Array(160).fill(30), high: Array(160).fill(30) } };
  const plain = biblePrompt(a, { filename: 'x.wav' }, null, '');
  assert.ok(!/MUSIC VIDEO|  v c/.test(plain));
  const brief = cleanBrief({ usefulness: 'rich', summary: 'Two dancers.', scenes: [{ start: 0, end: 8, action: 'lead spins', emotion: 'joy', energy: 7 }], steps: [{ name: 'spin', what: 'turns', at: [2] }] }, 8);
  const profile = { rate: 4, duration: 8, motion: Array(32).fill(0.5), cuts: [4], hits: [{ t: 2, strength: 0.8 }], movement: 'busy' };
  const vbars = barMotion(profile, barTable(a).bars, 8);
  const withV = biblePrompt(a, { filename: 'x.wav' }, null, '', { text: videoBlock(brief, profile, a.beats), bars: vbars });
  assert.match(withV, /MUSIC VIDEO/); assert.match(withV, /lead spins/); assert.match(withV, /bar {2}start {3}E L M H {2}ons\/s {2}v c/);
});

test('the reader is told which files to open and never to name people from faces', () => {
  const t = watchPrompt({ sheets: [{ file: 'frames/overview-01.jpg', kind: 'overview', start: 0, step: 2, count: 9 }], profile: { duration: 20, cuts: [], movement: 'some' }, meta: { title: 'T' }, research: '' });
  assert.match(t, /frames\/overview-01\.jpg/);
  assert.ok(isVideoFile('A.MP4') && isVideoFile('b.mov') && !isVideoFile('c.mp3'));
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
test('a real generated clip: motion, a cut, sheets with the time stamped, and the audio taken out', { skip: !hasFfmpeg }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'musync-video-'));
  try {
    const f = join(d, 'clip.mp4');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x223355:s=320x180:d=6:r=25', '-f', 'lavfi', '-i', 'color=c=red:s=40x40:d=6:r=25', '-f', 'lavfi', '-i', 'color=c=0x552222:s=320x180:d=6:r=25', '-f', 'lavfi', '-i', 'color=c=yellow:s=50x50:d=6:r=25', '-f', 'lavfi', '-i', 'sine=f=220:d=12',
      '-filter_complex', "[0:v][1:v]overlay=x='mod(t*200,260)':y=70[a];[2:v][3:v]overlay=x='mod(t*220,260)':y=60[b];[a][b]concat=n=2:v=1:a=0[v]", '-map', '[v]', '-map', '4:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const p = await measureVideo(f);
    assert.ok(Math.abs(p.duration - 12) < 0.6, `duration ${p.duration}`);
    assert.equal(p.movement, 'busy');
    assert.ok(p.cuts.some((c) => Math.abs(c - 6) < 0.3), `cuts ${p.cuts}`);
    const s = makeSheets(f, d, p, { bursts: 1 });
    assert.ok(s.sheets.length >= 2 && s.sheets.some((x) => x.kind === 'burst'));
    for (const x of s.sheets) assert.ok(existsSync(join(d, x.file)), x.file);
    extractAudio(f, join(d, 'audio.m4a'));
    assert.ok(existsSync(join(d, 'audio.m4a')));
    assert.throws(() => extractAudio(join(d, 'frames', 'overview-01.jpg'), join(d, 'x.m4a')), /could not be read|no sound/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
