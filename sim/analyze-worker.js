// Runs the same analyzer + drafter as the CLI, off the main thread.
import { analyze, draftWal, validateWal } from '../core/index.js';

self.onmessage = async (e) => {
  const { samples, sr, opts } = e.data;
  try {
    const analysis = analyze(samples, sr, { onProgress: (stage, p) => self.postMessage({ type: 'progress', stage, p }) });
    const wal = draftWal(analysis, opts);
    self.postMessage({ type: 'done', analysis, wal, validation: validateWal(wal) });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
