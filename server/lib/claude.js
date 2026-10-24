// Runs the Claude Code CLI headless (`claude -p`) on the user's own subscription login.
// Tools are disabled unless `tools` names some (the research pass allows web search only): the agent otherwise only reads the brief we give it and writes JSON back.
import { spawn } from 'node:child_process';

export const CLAUDE_BIN = process.env.MUSYNC_CLAUDE_BIN || 'claude';

export function claudeAvailable() {
  return new Promise((resolve) => {
    const p = spawn(CLAUDE_BIN, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

// Returns { text, usage, costUsd, ms }. onText(totalChars, textSoFar) fires as the answer streams in.
export function runClaude({ system, prompt, model = process.env.MUSYNC_MODEL || 'sonnet', effort, cwd, signal, onText, timeoutMs = 10 * 60 * 1000, tools = '' }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', model, '--tools', tools, ...(tools ? ['--allowedTools', tools] : []), '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
      '--setting-sources', '', '--system-prompt', system, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (effort) args.push('--effort', effort);
    const t0 = Date.now();
    const p = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_DISABLE_TELEMETRY: '1' } });
    let buf = '', err = '', text = '', final = null, done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(v); };
    const onAbort = () => { p.kill('SIGTERM'); finish(reject, new Error('cancelled')); };
    const timer = setTimeout(() => { p.kill('SIGTERM'); finish(reject, new Error(`Claude took longer than ${Math.round(timeoutMs / 60000)} minutes`)); }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    p.on('error', (e) => finish(reject, new Error(e.code === 'ENOENT' ? 'The `claude` CLI was not found. Install Claude Code and sign in with `claude`.' : e.message)));
    p.stderr.on('data', (d) => (err += d));
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') { text += ev.event.delta.text; onText?.(text.length, text); }
        else if (ev.type === 'result') final = ev;
      }
    });
    p.on('close', (code) => {
      if (final && !final.is_error && typeof final.result === 'string') return finish(resolve, { text: final.result, usage: final.usage, costUsd: final.total_cost_usd, ms: Date.now() - t0 });
      const why = final?.result || err.trim().split('\n').slice(-3).join(' ') || `claude exited with code ${code}`;
      finish(reject, new Error(/log ?in|auth|credential/i.test(why) ? `Claude is not signed in. Run \`claude\` once in a terminal and log in. (${why})` : why));
    });
    p.stdin.end(prompt);
  });
}

// Pull the first complete JSON object out of a model reply (it may be wrapped in prose or a code fence).
export function extractJson(text) {
  const s = text.indexOf('{');
  if (s < 0) throw new Error('no JSON object in the reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(s, i + 1));
  }
  throw new Error('the JSON object in the reply was cut off');
}
