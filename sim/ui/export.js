// Save the show as a video, made entirely in this browser. The studio renders the show one fixed time-step at a time
// (so the result is smooth whatever the speed of this device), WebCodecs encodes each picture, the song is encoded
// beside it, and a muxer joins them into one MP4 (or WebM). Nothing is uploaded: the file goes to the person's Downloads.
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { el, modal, fmtTime, segIndicator } from './kit.js';
import { icon } from './icons.js';

const SR = 48000;
export const webCodecsReady = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof AudioData !== 'undefined';

// Which container/codec pair this browser can really encode. MP4 (H.264 + AAC) plays everywhere, so it goes first.
async function pickFormat(w, h, fps, bitrate) {
  const tries = [
    { kind: 'mp4', v: 'avc1.64002A', a: 'mp4a.40.2', mime: 'video/mp4', ext: 'mp4' },
    { kind: 'mp4', v: 'avc1.4D002A', a: 'mp4a.40.2', mime: 'video/mp4', ext: 'mp4' },
    { kind: 'webm', v: 'vp09.00.40.08', a: 'opus', mime: 'video/webm', ext: 'webm' },
    { kind: 'webm', v: 'vp8', a: 'opus', mime: 'video/webm', ext: 'webm' },
  ];
  for (const f of tries) {
    try {
      const vs = await VideoEncoder.isConfigSupported({ codec: f.v, width: w, height: h, bitrate, framerate: fps });
      const as = await AudioEncoder.isConfigSupported({ codec: f.a, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 });
      if (vs.supported && as.supported) return f;
    } catch {}
  }
  return null;
}

// the song, as 48 kHz stereo, from the bytes the person picked (or the bundled demo)
async function decodeSong(bytes, from, to) {
  const probe = new (window.AudioContext || window.webkitAudioContext)();
  let src;
  try { src = await probe.decodeAudioData(bytes.slice(0)); } finally { probe.close?.(); }
  const a = Math.max(0, Math.floor(from * src.sampleRate)), b = Math.min(src.length, Math.ceil(to * src.sampleRate));
  const off = new OfflineAudioContext(2, Math.max(1, Math.round(((b - a) / src.sampleRate) * SR)), SR);
  const s = off.createBufferSource();
  s.buffer = src; s.connect(off.destination); s.start(0, a / src.sampleRate, (b - a) / src.sampleRate);
  return off.startRendering();
}

// Render and encode. host.render calls onFrame once per picture; this resolves with a Blob.
export async function makeVideo({ host, fps = 30, longSide = 1920, seconds = Infinity, onProgress, cancelled }) {
  const dur = Math.min(seconds, host.duration);
  let audioBytes = null;
  try { audioBytes = await host.getAudio(); } catch { audioBytes = null; }
  const bitrate = longSide >= 1900 ? 8_000_000 : 5_000_000;
  let enc = null, aenc = null, muxer = null, target = null, fmt = null, W = 0, H = 0, err = null, wake = null;
  const fail = (e) => { err = err || e; };
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    await host.render({
      fps, longSide, seconds: dur, cancelled,
      async onFrame(canvas, i, total) {
        if (err) throw err;
        if (!enc) {
          W = canvas.width & ~1; H = canvas.height & ~1;
          fmt = await pickFormat(W, H, fps, bitrate);
          if (!fmt) throw new Error('This browser cannot encode video. Try Chrome or Edge on a computer.');
          target = fmt.kind === 'mp4' ? new Mp4Target() : new WebmTarget();
          const a = audioBytes ? { codec: fmt.kind === 'mp4' ? 'aac' : 'opus', numberOfChannels: 2, sampleRate: SR } : undefined;
          muxer = fmt.kind === 'mp4'
            ? new Mp4Muxer({ target, video: { codec: 'avc', width: W, height: H }, ...(a ? { audio: a } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
            : new WebmMuxer({ target, video: { codec: fmt.v.startsWith('vp09') ? 'V_VP9' : 'V_VP8', width: W, height: H, frameRate: fps }, ...(a ? { audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: SR } } : {}), firstTimestampBehavior: 'offset' });
          enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: fail });
          enc.configure({ codec: fmt.v, width: W, height: H, bitrate, framerate: fps, ...(fmt.kind === 'mp4' ? { avc: { format: 'avc' } } : {}) });
          if (audioBytes) {
            const pcm = await decodeSong(audioBytes, 0, dur);
            aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: fail });
            aenc.configure({ codec: fmt.a, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 });
            const L = pcm.getChannelData(0), R = pcm.getChannelData(1), step = SR; // one second per chunk
            for (let k = 0; k < L.length; k += step) {
              const n = Math.min(step, L.length - k), data = new Float32Array(n * 2);
              data.set(L.subarray(k, k + n), 0); data.set(R.subarray(k, k + n), n);
              const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((k / SR) * 1e6), data });
              aenc.encode(ad); ad.close();
            }
          }
        }
        if (canvas.width < W || canvas.height < H) throw new Error('The window changed size while saving. Please keep it as it is and try again.');
        const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), visibleRect: { x: 0, y: 0, width: W, height: H } });
        enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
        vf.close();
        while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4)); // do not run far ahead of the encoder
        onProgress?.(i + 1, total);
      },
    });
    if (cancelled()) return null;
    if (err) throw err;
    onProgress?.(-1, 0); // finishing
    await enc.flush();
    await aenc?.flush();
    muxer.finalize();
    return { blob: new Blob([target.buffer], { type: fmt.mime }), ext: fmt.ext, W, H, hasAudio: !!audioBytes };
  } finally {
    try { enc?.close(); } catch {}
    try { aenc?.close(); } catch {}
    try { await wake?.release(); } catch {}
  }
}

const mb = (n) => `${(n / 1048576).toFixed(n > 1.04e8 ? 0 : 1)} MB`;
const clock = (s) => fmtTime(Math.max(0, s));

// The dialog: choose length and sharpness, watch it work, then watch the result and download it.
export function openExportDialog({ host, onSaved }) {
  const canFast = webCodecsReady();
  const opt = { len: host.duration > 40 ? 'short' : 'full', q: '1080' };
  const body = el('div', {});
  const footer = el('div', {});
  let job = null, cancelled = false, url = null;
  const m = modal({ title: 'Save as a video', sub: `${host.title} · ${host.camera}`, body, footer, onClose: () => { cancelled = true; if (url) URL.revokeObjectURL(url); } });

  const seg = (name, items) => {
    const node = el('div', { class: 'seg fill', role: 'radiogroup', style: { marginTop: '6px' } }, ...items.map(([v, label, sub]) =>
      el('button', { role: 'radio', class: opt[name] === v ? 'on' : '', 'aria-checked': String(opt[name] === v), style: { flex: 1, display: 'grid', gap: '2px', padding: '8px 10px', minHeight: '52px' }, onclick: () => { opt[name] = v; setup(); } },
        el('b', { text: label }), el('small', { class: 'muted', text: sub }))));
    requestAnimationFrame(segIndicator(node));
    return node;
  };

  function setup() {
    body.innerHTML = ''; footer.innerHTML = '';
    if (!canFast) {
      body.append(el('div', { class: 'note', html: `${icon('info', 16)}<span>This browser cannot make a video by itself. It can record the show while it plays instead: the song plays once, from the start, and the video is saved when it ends. Chrome or Edge on a computer makes a smoother video.</span>` }));
      footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
        el('button', { class: 'btn primary', 'data-autofocus': true, html: `${icon('record', 16)}<span>Record while it plays</span>`, onclick: () => { m.close(); host.recordLive(); } }));
      return;
    }
    const secs = opt.len === 'short' ? Math.min(30, host.duration) : host.duration;
    const est = Math.round(secs * (opt.q === '1080' ? 1.1 : 0.6));
    body.append(
      el('div', { class: 'label', text: 'How much of the song' }),
      seg('len', [['short', 'First 30 seconds', 'Quick to make'], ['full', 'Whole song', clock(host.duration)]]),
      el('div', { class: 'label', style: { marginTop: '16px' }, text: 'Picture size' }),
      seg('q', [['720', 'Smaller', '720p · easy to send'], ['1080', 'Sharper', '1080p · looks best']]),
      el('div', { class: 'note', style: { marginTop: '16px' }, html: `${icon('info', 16)}<span>Takes about <b>${est < 90 ? `${Math.max(10, est)} seconds` : `${Math.round(est / 60)} minutes`}</b> on a fast computer. Keep this tab open and in front. The video is made on your device and goes to your Downloads folder; nothing is uploaded.</span>` }));
    footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      el('button', { class: 'btn primary', 'data-autofocus': true, html: `${icon('film', 16)}<span>Make the video</span>`, onclick: go }));
  }

  async function go() {
    body.innerHTML = ''; footer.innerHTML = '';
    cancelled = false;
    const bar = el('div', { class: 'bar', style: { marginTop: '12px' } }, el('i'));
    const line = el('div', { class: 'muted', style: { marginTop: '10px', fontVariantNumeric: 'tabular-nums', minHeight: '20px' }, text: 'Getting ready…' });
    const prev = el('canvas', { width: 320, height: 180, style: { width: '100%', borderRadius: '12px', background: '#000', marginTop: '14px', display: 'block' } });
    body.append(el('b', { text: 'Making your video' }), bar, line, prev);
    footer.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }));
    const t0 = performance.now();
    const secs = opt.len === 'short' ? 30 : Infinity;
    try {
      const out = await makeVideo({
        host, fps: 30, longSide: opt.q === '1080' ? 1920 : 1280, seconds: secs, cancelled: () => cancelled,
        onProgress: (i, total) => {
          if (i < 0) { line.textContent = 'Finishing the file…'; return; }
          const p = i / total;
          bar.style.setProperty('--v', String(Math.max(0.03, p)));
          const el_ = (performance.now() - t0) / 1000, left = p > 0.03 ? el_ / p - el_ : 0;
          line.textContent = `${Math.round(p * 100)}%${left ? ` · about ${left < 90 ? `${Math.round(left)} s` : `${Math.round(left / 60)} min`} left` : ''}`;
          if (i % 15 === 0) { const c = host.canvas(); prev.getContext('2d').drawImage(c, 0, 0, prev.width, prev.height); }
        },
      });
      if (!out) return;
      done(out);
    } catch (e) { if (!cancelled) fail(e); }
  }

  function fail(e) {
    body.innerHTML = ''; footer.innerHTML = '';
    body.append(el('div', { class: 'est-box', html: `${icon('alert', 16)}<span></span>` }));
    body.querySelector('span').textContent = e.message || 'The video could not be made.';
    footer.append(el('button', { class: 'btn', text: 'Close', onclick: () => m.close() }), el('button', { class: 'btn primary', text: 'Try again', onclick: setup }));
  }

  function done({ blob, ext, W, H, hasAudio }) {
    url = URL.createObjectURL(blob);
    const file = `${host.fileName}.${ext}`;
    body.innerHTML = ''; footer.innerHTML = '';
    const v = el('video', { src: url, controls: true, playsinline: true, style: { width: '100%', borderRadius: '12px', background: '#000', maxHeight: '46vh' } });
    body.append(v, el('div', { class: 'muted', style: { marginTop: '10px', fontSize: '13px' }, text: `${W} × ${H} · ${ext.toUpperCase()} · ${mb(blob.size)}${hasAudio ? '' : ' · no sound (the song was not loaded)'}` }));
    if (!hasAudio) body.append(el('div', { class: 'note', style: { marginTop: '10px' }, html: `${icon('info', 16)}<span>This video has no sound because the song file is not loaded. Add your copy of the song, then save again.</span>` }));
    const save = () => { const a = document.createElement('a'); a.href = url; a.download = file; a.click(); onSaved?.({ file, bytes: blob.size }); };
    const f = new File([blob], file, { type: blob.type });
    footer.append(el('button', { class: 'btn', text: 'Make another', onclick: setup }));
    if (navigator.canShare?.({ files: [f] })) footer.append(el('button', { class: 'btn', html: `${icon('share', 16)}<span>Share</span>`, onclick: () => navigator.share({ files: [f], title: host.title }).then(() => onSaved?.({ file, bytes: blob.size })).catch(() => {}) }));
    footer.append(el('button', { class: 'btn primary', 'data-autofocus': true, html: `${icon('download', 16)}<span>Download</span>`, onclick: save }));
    footer.querySelector('[data-autofocus]')?.focus();
  }

  setup();
  return m;
}
