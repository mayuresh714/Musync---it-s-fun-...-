// Record the show: the 3-D picture (no interface) plus the song, saved as a video file. Starting from rest plays
// the song from the top and stops by itself when it ends; starting while it plays records from that moment.
const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export function createRecorder({ canvas, audio, onState, onSaved, onError }) {
  let rec = null, chunks = [], t0 = 0, timer = 0, stream = null, name = 'musync';

  const supported = () => typeof MediaRecorder !== 'undefined' && !!canvas.captureStream;

  function start({ fileName = 'musync' } = {}) {
    if (rec) return false;
    if (!supported()) { onError?.(new Error('This browser cannot record video. Use Chrome, Edge or Firefox.')); return false; }
    name = fileName;
    try {
      stream = canvas.captureStream(60);
      const a = audio?.captureStream?.() || audio?.mozCaptureStream?.();
      if (a) for (const tr of a.getAudioTracks()) stream.addTrack(tr);
      const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
    } catch (e) { rec = null; onError?.(e); return false; }
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(timer);
      const mime = rec.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: mime });
      const secs = (performance.now() - t0) / 1000;
      stream?.getTracks().forEach((t) => t.stop());
      rec = null; stream = null;
      onState?.({ on: false, secs });
      if (blob.size > 1000) {
        const file = `${name}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);
        onSaved?.({ file, bytes: blob.size, secs });
      } else onError?.(new Error('Nothing was recorded.'));
    };
    rec.start(500);
    t0 = performance.now();
    onState?.({ on: true, secs: 0 });
    timer = setInterval(() => onState?.({ on: true, secs: (performance.now() - t0) / 1000 }), 500);
    return true;
  }

  function stop() { if (rec && rec.state !== 'inactive') rec.stop(); }

  return { start, stop, toggle: (o) => (rec ? (stop(), false) : start(o)), get active() { return !!rec; }, supported };
}
