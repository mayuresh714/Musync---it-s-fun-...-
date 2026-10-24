// Live listening in the browser: captures audio from a browser tab (a YouTube tab, say) or the microphone and feeds
// the spectrum to the LiveTracker. Nothing is recorded or sent anywhere; the audio only goes through an analyser.
import { LiveTracker } from '../../core/live/tracker.js';

const RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export const LIVE_ERRORS = {
  NotAllowedError: 'Permission was declined. Allow it in the browser prompt and try again.',
  NotFoundError: 'No microphone was found on this computer.',
  AbortError: 'The picker was closed before anything was chosen.',
  NotSupportedError: 'This browser cannot capture tab audio. Use Chrome or Edge, or switch to the microphone.',
};

async function getStream(kind) {
  if (kind === 'mic') return navigator.mediaDevices.getUserMedia({ audio: RAW });
  if (!navigator.mediaDevices.getDisplayMedia) { const e = new Error('no getDisplayMedia'); e.name = 'NotSupportedError'; throw e; }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { ...RAW }, systemAudio: 'include', selfBrowserSurface: 'exclude', preferCurrentTab: false });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    const e = new Error('The tab was shared without its sound. Choose the tab again and tick “Share tab audio”.'); e.name = 'NoAudioError'; throw e;
  }
  return stream;
}

export async function startLive(kind, { style = 'bollywood', sensitivity = 1, onEnded } = {}) {
  const stream = await getStream(kind);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const an = ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0.15; an.minDecibels = -110; an.maxDecibels = 0;
  src.connect(an); // deliberately not connected to the speakers: a mic would feed back, and a tab already plays itself
  const tracker = new LiveTracker({ binHz: ctx.sampleRate / an.fftSize, style, floor: sensitivity });
  const db = new Float32Array(an.frequencyBinCount), mags = new Float32Array(an.frequencyBinCount);
  const t0 = ctx.currentTime;
  let stopped = false, lastT = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    ctx.close().catch(() => {});
    onEnded?.();
  };
  stream.getTracks().forEach((t) => { t.onended = stop; }); // the user pressed "Stop sharing"
  return {
    kind, tracker, ctx, stop,
    label: kind === 'mic' ? 'Microphone' : 'Browser tab',
    now: () => ctx.currentTime - t0,
    // pull one spectrum frame; returns true when the show needs rebuilding
    tick() {
      if (stopped) return false;
      const t = ctx.currentTime - t0;
      if (t - lastT < 0.012) return false;
      lastT = t;
      an.getFloatFrequencyData(db);
      for (let i = 0; i < db.length; i++) mags[i] = db[i] > -140 ? Math.pow(10, db[i] / 20) : 0;
      const v = tracker.version;
      tracker.push(t, mags);
      return tracker.version !== v;
    },
    setSensitivity(k) { tracker.fl = k; },
    setStyle(s) { tracker.style = s; },
  };
}
