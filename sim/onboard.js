// Adding songs at scale: pick or drop many audio files, send them to the backend queue (the Claude director
// works through them one at a time), and follow every job until it is in the library. No DOM here.
const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|m4v|webm|mkv)$/i; // sound files, or videos (the sound is taken from them and the picture is watched)
const STAGES = ['queued', 'download', 'decode', 'analyze', 'lyrics', 'research', 'video', 'bible', 'design', 'cues', 'validate', 'done'];
const STAGE_TEXT = { queued: 'Waiting for its turn', download: 'Downloading the audio', decode: 'Reading the audio', analyze: 'Measuring tempo and beats', lyrics: 'Looking up the lyrics', research: 'Researching the song and its culture', video: 'Watching the video: dancers, steps and mood', bible: 'Understanding the song', design: 'Composing the opening, the climb and the signature steps', cues: 'Writing the cue sheet', validate: 'Checking the show', done: 'Ready' };

// "Some_Song_Name_Lyrical_Artist_Name.wav" -> "Some Song Name Lyrical Artist Name"
export const prettyName = (f) => f.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s*\((official|lyric|lyrical|audio|video)[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();

export function createOnboarder({ onChange, onSongsChanged, local }) {
  const S = { backend: undefined, items: [], remote: [], uploading: 0, timer: null, seq: 0 };
  const emit = () => onChange?.(S);

  async function api(path, opt) {
    const res = await fetch(`/api${path}`, opt);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `The backend answered ${res.status}`);
    return body;
  }

  async function checkBackend() {
    try { S.backend = await (await fetch('/api/health', { signal: AbortSignal.timeout(2500) })).json(); } catch { S.backend = null; }
    emit();
    if (S.backend) poll();
    return S.backend;
  }

  function add(files) {
    let added = 0, skipped = 0;
    for (const f of files) {
      if (!AUDIO.test(f.name) && !f.type?.startsWith('audio/') && !f.type?.startsWith('video/')) { skipped++; continue; }
      if (S.items.some((i) => i.file && i.file.name === f.name && i.file.size === f.size && i.status !== 'error')) { skipped++; continue; }
      S.items.push({ key: ++S.seq, file: f, name: prettyName(f.name), size: f.size, status: 'ready', stage: null, detail: '', error: null, jobId: null, position: 0 });
      added++;
    }
    emit();
    return { added, skipped };
  }

  // Links: one YouTube video per line (or separated by spaces). Anything else is skipped and counted.
  const YT = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i;
  function addLinks(text) {
    let added = 0, skipped = 0;
    for (const raw of String(text).split(/[\s,]+/).filter(Boolean)) {
      if (!YT.test(raw)) { skipped++; continue; }
      if (S.items.some((i) => i.link === raw && i.status !== 'error')) { skipped++; continue; }
      S.items.push({ key: ++S.seq, link: raw, name: raw.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), size: 0, status: 'ready', stage: null, detail: '', error: null, jobId: null, position: 0 });
      added++;
    }
    emit();
    return { added, skipped };
  }

  const remove = (key) => { S.items = S.items.filter((i) => i.key !== key || ['uploading', 'queued', 'running'].includes(i.status)); emit(); };
  const clearFinished = () => { S.items = S.items.filter((i) => !['done', 'dup'].includes(i.status)); emit(); };

  async function uploadOne(it, form) {
    it.status = 'uploading'; it.error = null; emit();
    try {
      const fd = new FormData();
      if (it.link) fd.append('url', it.link); else fd.append('file', it.file, it.file.name);
      for (const [k, v] of Object.entries(form)) if (v && String(v).trim()) fd.append(k, v);
      if (it.replace) fd.append('replace', it.replace);
      const r = await api('/jobs', { method: 'POST', body: fd });
      it.jobId = r.id;
      if (r.duplicate) {
        it.status = 'dup'; it.dupId = r.id; it.dupEngine = r.engine || null; it.title = r.title;
        it.detail = r.busy ? `“${r.title}” is already being made` : `Already in your library as “${r.title}”${r.engine ? ` (made by ${r.engine === 'code' ? 'code' : 'the AI director'})` : ''}`;
      } else {
        it.status = 'queued'; it.stage = 'queued'; it.replace = null;
        if (r.replaces) { it.replaces = r.replaces; it.upgrade = true; }
      }
    } catch (e) { it.status = 'error'; it.error = e.message; }
    emit();
  }

  // Upload with a small concurrency so a big batch starts working while the rest is still going up.
  async function start(form = {}) {
    const todo = S.items.filter((i) => i.status === 'ready' || i.status === 'error');
    if (!todo.length) return;
    if (S.backend === undefined || S.backend === null) await checkBackend();
    if (!S.backend && local) return startLocal(todo.filter((i) => i.file), form);
    if (!S.backend) { for (const i of todo) { i.status = 'error'; i.error = 'The Musync backend is not running.'; } emit(); return; }
    let next = 0;
    const worker = async () => { while (next < todo.length) { const it = todo[next++]; await uploadOne(it, form); } };
    await Promise.all([worker(), worker()]);
    poll();
  }

  // No backend (the hosted site): each song is read and drafted on this device, one at a time, and saved to the account.
  // The audio never leaves the browser; only the light plan (WAL) is stored.
  const LOCAL_PCT = { decode: 0.1, features: 0.3, rhythm: 0.55, structure: 0.8, accents: 0.92, done: 1 };
  async function startLocal(todo, form) {
    if (!local.user()) { local.needAccount(); return; }
    const done = [];
    for (const it of todo) {
      it.status = 'running'; it.stage = 'decode'; it.error = null; it.pct = 0.04; it.detail = 'Reading the song on this device'; emit();
      try {
        const r = await local.make(it, form, (stage) => { it.pct = LOCAL_PCT[stage] ?? it.pct; it.detail = { decode: 'Reading the song on this device', features: 'Measuring the sound', rhythm: 'Finding the beat', structure: 'Finding the verses and the chorus', accents: 'Placing the lights' }[stage] || it.detail; emit(); });
        it.jobId = r.show.id; it.title = r.show.title;
        if (r.dup) { it.status = 'dup'; it.dupId = r.show.id; it.detail = `Already in your library as “${r.show.title}”`; }
        else { it.status = 'done'; it.pct = 1; done.push(it); }
      } catch (e) { it.status = 'error'; it.error = e.message; }
      emit();
    }
    if (done.length) onSongsChanged?.(done.length, done);
  }

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      for (;;) {
        let jobs;
        try { jobs = await api('/jobs'); } catch { break; }
        const byId = new Map(jobs.map((j) => [j.id, j]));
        let active = 0, finished = 0; const done = [];
        for (const it of S.items) {
          const j = it.jobId && byId.get(it.jobId);
          if (!j || ['dup', 'ready'].includes(it.status)) continue;
          const was = it.status;
          if (j.title && it.link) it.name = j.title;
          it.stage = j.stage; it.position = j.position; it.detail = j.detail || STAGE_TEXT[j.stage] || '';
          if (j.status === 'done') it.status = 'done';
          else if (j.status === 'error' || j.status === 'cancelled') { it.status = 'error'; it.error = j.error || 'Failed'; }
          else it.status = j.status === 'running' ? 'running' : 'queued';
          if (was !== 'done' && it.status === 'done') { finished++; done.push(it); }
          if (['queued', 'running'].includes(it.status)) active++;
        }
        // jobs from an earlier visit or another tab: shown read-only so nothing is a mystery
        S.remote = jobs.filter((j) => !S.items.some((i) => i.jobId === j.id) && ['queued', 'running'].includes(j.status));
        active += S.remote.length;
        emit();
        if (finished) onSongsChanged?.(finished, done);
        if (!active && !S.items.some((i) => i.status === 'uploading')) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally { polling = false; }
  }

  async function cancel(it) {
    if (!it.jobId) { remove(it.key); return; }
    try { await api(`/jobs/${it.jobId}/cancel`, { method: 'POST' }); } catch {}
    poll();
  }
  // "Make it again": the song is already in the library; send it through the chosen method and replace the old show when it finishes
  const remake = (it, form) => { it.replace = it.dupId; it.status = 'ready'; it.error = null; return start(form); };
  const retry = (it, form) => { it.status = 'ready'; it.error = null; return start(form); };

  return {
    state: S, checkBackend, local: !!local, add, addLinks, remove, clearFinished, start, cancel, retry, remake, poll, stageIndex: (st) => Math.max(0, STAGES.indexOf(st)), STAGES, STAGE_TEXT,
    pending: () => S.items.filter((i) => ['uploading', 'queued', 'running'].includes(i.status)).length + S.remote.length,
  };
}
