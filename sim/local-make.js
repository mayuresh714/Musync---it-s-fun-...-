// Makes a light show from an audio file entirely inside the browser: decode, measure beats and sections, draft the WAL.
// The audio is never sent anywhere. This is the path the hosted site uses (no backend), and the "quick draft" in the studio.
export const sha256 = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

// "Some_Song_Name_Lyrical_Artist_Name.mp3" -> "Some Song Name"
export const titleFromName = (f) => f.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s*[\(\[](official|lyric|lyrical|audio|video|full|hd)[^)\]]*[\)\]]/gi, '').replace(/\s+/g, ' ').trim() || 'Untitled';

export async function decodeMono(buffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let buf;
  try { buf = await ctx.decodeAudioData(buffer.slice(0)); }
  catch { throw new Error('This browser could not read that file. Try an mp3, wav or m4a song.'); }
  finally { ctx.close?.(); }
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
  return { mono, sr: buf.sampleRate, duration: buf.duration };
}

export async function makeWal({ buffer, fileName, style = 'bollywood', title, artist, onStage = () => {} }) {
  onStage('decode');
  const { mono, sr, duration } = await decodeMono(buffer);
  if (duration < 5) throw new Error('That file is too short to make a show (under 5 seconds).');
  if (duration > 25 * 60) throw new Error('That file is longer than 25 minutes. Try a single song.');
  const hash = crypto.subtle ? await sha256(buffer) : undefined;
  const worker = new Worker(new URL('./analyze-worker.js', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (m) => {
        if (m.data.type === 'progress') onStage(m.data.stage);
        if (m.data.type === 'done') resolve(m.data);
        if (m.data.type === 'error') reject(new Error(m.data.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'The analysis worker crashed.'));
      worker.postMessage({ samples: mono, sr, opts: { title: title || titleFromName(fileName), ...(artist ? { artist } : {}), styles: [style], audio: { file: fileName, sha256: hash, duration } } }, [mono.buffer]);
    });
    onStage('done');
    return { ...result, sha256: hash, duration };
  } finally { worker.terminate(); }
}
