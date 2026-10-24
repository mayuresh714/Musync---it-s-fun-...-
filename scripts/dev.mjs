#!/usr/bin/env node
// One command for development: the Musync backend (Claude director) and the simulator together.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
  p.on('exit', (code) => { console.error(`${name} exited (${code})`); process.exit(code || 0); });
  return p;
};
const procs = [run('backend', process.execPath, ['server/index.mjs']), run('simulator', process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'sim/vite.config.js'])];
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { procs.forEach((p) => p.kill(sig)); process.exit(0); });
