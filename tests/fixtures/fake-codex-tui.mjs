// The interface of the fake `codex` (« Vue Codex »): `codex [resume <id> | fork <id>] [options]`, in a
// pseudo-terminal, as Codex 0.163.0's own was tried (docs/TODO-1.8.md, point 0, « Vue terminal »). It needs
// CODEX_HOME.
//
// - Its hooks are those of its `-c hooks.<Event>=[{hooks=[{type="command",command="…"}]}]` options, run as
//   commands (through a shell) with their event's payload on their input (the payloads of
//   tests/fixtures/codex/hooks-payloads.jsonl): only the trusted ones, as Codex does, i.e. those whose key
//   (`<session-flags>/config.toml:<event>:0:0`) has, in a `-c hooks.state={…}` option, the hash its
//   app-server's `hooks/list` gives (`hookHash`). Each hook it would run is added to
//   <CODEX_HOME>/fake-tui-hooks.jsonl ({event, trusted}), and each launch to <CODEX_HOME>/fake-tui-launches.jsonl
//   ({argv, cwd, hookUrl, hookToken, mcpToken}: whether those variables were given).
// - On a folder whose repository's root has no trust level in <CODEX_HOME>/config.toml, it first shows
//   `fake-codex-trust` and waits: Enter trusts the folder (written in config.toml as Codex does), Ctrl+C quits.
//   Then it shows `fake-codex-tui`.
// - Each line it reads (pasted text, then Enter) is a prompt; its session's rollout
//   (<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<date>-<id>.jsonl) is written as Codex writes it (see
//   tests/fixtures/codex/tui-rollout.jsonl): `task_started`, the user's message, a reply « Fini : <prompt> »,
//   `token_count`, `task_complete`. A new session has its id (`thr-tui-<pid>`) and its file from its first
//   message, which `SessionStart` tells. "permission" in the prompt asks for a command (PreToolUse,
//   PermissionRequest) and goes on once the next Enter comes (PostToolUse, the command); "lent" makes the turn
//   wait for Escape, which interrupts it (the `Interrupt` hook, `turn_aborted`); "/quit" ends the process, as two
//   Ctrl+C do.
// - `resume <id>` of a session with no rollout in CODEX_HOME fails as Codex does: « ERROR: No saved session
//   found with ID <id>. … », exit code 1.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_FLAGS = process.platform === 'win32' ? 'C:\\<session-flags>\\config.toml' : '/<session-flags>/config.toml';
const snake = (e) => e.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

/** The hash `hooks/list` gives the hook of `event` running `command` (the fake's own). */
export const hookHash = (event, command) => 'sha256:' + crypto.createHash('sha256').update(`${event}\n${command}`).digest('hex');

/** The hooks of `-c hooks.<Event>=…` among `argv`: [{event, command, key, hash}]. */
export function hooksOf(argv) {
  const hooks = [];
  argv.forEach((a, i) => {
    if (argv[i - 1] !== '-c') return;
    const m = a.match(/^hooks\.([A-Za-z]+)=\[.*command=("(?:[^"\\]|\\.)*")/);
    if (!m || m[1] === 'state') return;
    const command = JSON.parse(m[2]);
    hooks.push({ event: m[1], command, key: `${SESSION_FLAGS}:${snake(m[1])}:0:0`, hash: hookHash(m[1], command) });
  });
  return hooks;
}

/** The trust `-c hooks.state={…}` gives, by key. */
export function trustOf(argv) {
  const state = {};
  argv.forEach((a, i) => {
    if (argv[i - 1] !== '-c' || !a.startsWith('hooks.state=')) return;
    for (const m of a.matchAll(/("(?:[^"\\]|\\.)*")=\{trusted_hash="([^"]*)"\}/g)) state[JSON.parse(m[1])] = m[2];
  });
  return state;
}

/** The rollout of the session `id` in CODEX_HOME `home`, if there is one. */
export function findRollout(home, id) {
  const sessions = path.join(home, 'sessions');
  if (!fs.existsSync(sessions)) return null;
  for (const y of fs.readdirSync(sessions))
    for (const m of fs.readdirSync(path.join(sessions, y)))
      for (const d of fs.readdirSync(path.join(sessions, y, m)))
        for (const f of fs.readdirSync(path.join(sessions, y, m, d)))
          if (f.startsWith('rollout-') && f.endsWith(`-${id}.jsonl`)) return path.join(sessions, y, m, d, f);
  return null;
}

/** A new rollout file for the session `id` in `home`, its `session_meta` written. */
export function newRollout(home, id, cwd, extra = {}) {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const dir = path.join(home, 'sessions', String(now.getFullYear()), p2(now.getMonth() + 1), p2(now.getDate()));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${now.toISOString().slice(0, 19).replaceAll(':', '-')}-${id}.jsonl`);
  const meta = { session_id: id, id, timestamp: now.toISOString(), cwd, originator: 'fake-codex', cli_version: '0.163.0', ...extra };
  fs.appendFileSync(file, JSON.stringify({ timestamp: now.toISOString(), type: 'session_meta', payload: meta }) + '\n');
  return file;
}

/** The repository root of `dir` (the project's, for a worktree), as Codex asks the trust of it. */
function repoRoot(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const git = path.join(d, '.git');
    if (fs.existsSync(git)) {
      if (fs.statSync(git).isDirectory()) return d;
      const target = fs
        .readFileSync(git, 'utf8')
        .replace(/^gitdir:\s*/, '')
        .trim()
        .replaceAll('\\', '/');
      const at = target.indexOf('/.git/worktrees/');
      return at >= 0 ? path.resolve(target.slice(0, at)) : d;
    }
    if (path.dirname(d) === d) return dir;
  }
}

const norm = (p) => {
  const s = p.replaceAll('\\', '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};

export function tui(argv, log) {
  const home = process.env.CODEX_HOME;
  if (!home) {
    process.stderr.write('fake codex: CODEX_HOME is needed\n');
    process.exit(2);
  }
  fs.mkdirSync(home, { recursive: true });
  // Each launch: its arguments, and whether it was given the variables of Escouade's hooks and server.
  const given = (k) => !!process.env[k];
  fs.appendFileSync(
    path.join(home, 'fake-tui-launches.jsonl'),
    JSON.stringify({
      argv,
      cwd: process.cwd(),
      hookUrl: given('ESCOUADE_HOOK_URL'),
      hookToken: given('ESCOUADE_HOOK_TOKEN'),
      mcpToken: given('ESCOUADE_MCP_TOKEN'),
    }) + '\n',
  );
  const quit = (text) => {
    try {
      fs.writeSync(2, text);
    } catch {
      process.stderr.write(text);
    }
    setTimeout(() => process.exit(1), 150);
  };
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const [sub, of] = argv[0] === 'resume' || argv[0] === 'fork' ? argv : [];
  if (sub === 'resume' && !findRollout(home, of)) {
    quit(`ERROR: No saved session found with ID ${of}. Run \`codex resume\` without an ID to choose from existing sessions.\r\n`);
    return;
  }
  const model = flag('-m') ?? 'gpt-6-luna';
  const hooks = hooksOf(argv);
  const trust = trustOf(argv);
  const cwd = process.cwd();
  // Its session: resumed, or new (its id and file from its first message).
  let session = sub === 'resume' ? of : null;
  let file = session ? findRollout(home, session) : null;
  const write = (type, payload) => fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), type, payload }) + '\n');
  const event = (payload) => write('event_msg', payload);
  const hook = (name, extra = {}) =>
    new Promise((resolve) => {
      const h = hooks.find((x) => x.event === name);
      if (!h) return resolve();
      const trusted = trust[h.key] === h.hash;
      fs.appendFileSync(path.join(home, 'fake-tui-hooks.jsonl'), JSON.stringify({ event: name, trusted }) + '\n');
      if (!trusted) return resolve();
      const payload = {
        session_id: session,
        transcript_path: file,
        cwd,
        hook_event_name: name,
        model,
        permission_mode: 'default',
        ...extra,
      };
      const child = spawn(h.command, { shell: true, stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', resolve);
      child.on('exit', resolve);
      child.stdin.end(JSON.stringify(payload));
    });

  // The question about the folder, when its config has no trust level for it.
  const root = repoRoot(cwd);
  const config = path.join(home, 'config.toml');
  const known = () => {
    const text = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
    return [...text.matchAll(/^\[projects\.['"](.*)['"]\]\s*$/gm)].map((m) => norm(m[1].replaceAll('\\\\', '\\')));
  };
  let trusting = !known().some((k) => norm(root) === k || norm(cwd) === k || norm(cwd).startsWith(k + '/'));
  // Raw before its first screen (ESC-125): a key typed as soon as that shows would else reach a terminal still cooked, which
  // turns Enter into \n.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdout.write(trusting ? '\x1b[?2004hfake-codex-trust\r\n' : '\x1b[?2004hfake-codex-tui\r\n');

  let n = 0;
  let waiting = null;
  const turn = async (prompt) => {
    if (prompt === '/quit' || prompt === '/exit') process.exit(0);
    let first = false;
    if (!file) {
      session = sub === 'fork' ? `thr-fork-tui-${process.pid}` : `thr-tui-${process.pid}`;
      file = newRollout(home, session, cwd, sub === 'fork' ? { forked_from_id: of } : {});
      first = true;
    }
    // Its own id: the end of a turn that is slow to end (its Stop hook) is never written with the next one's.
    const turnId = `turn-tui-${process.pid}-${++n}`;
    process.stdout.write(`fake-turn ${prompt}\r\n`);
    event({ type: 'task_started', turn_id: turnId, model_context_window: 258400 });
    if (first) await hook('SessionStart', { source: sub === 'resume' ? 'resume' : 'startup' });
    await hook('UserPromptSubmit', { turn_id: turnId, prompt });
    event({
      type: 'item_completed',
      thread_id: session,
      turn_id: turnId,
      item: { type: 'UserMessage', id: `u-${process.pid}-${n}`, content: [{ type: 'text', text: prompt, text_elements: [] }] },
    });
    if (prompt.includes('permission')) {
      const input = { command: 'echo tui' };
      await hook('PreToolUse', { turn_id: turnId, tool_name: 'Bash', tool_input: input });
      // Waiting for the answer before the hook says it waits: Escouade shows the card as the hook reaches it, and
      // a key typed then is the answer, not a message.
      const answered = new Promise((resolve) => (waiting = resolve));
      await hook('PermissionRequest', { turn_id: turnId, tool_name: 'Bash', tool_input: input });
      await answered;
      await hook('PostToolUse', { turn_id: turnId, tool_name: 'Bash', tool_input: input, tool_response: 'tui' });
      event({
        type: 'item_completed',
        thread_id: session,
        turn_id: turnId,
        item: {
          type: 'CommandExecution',
          id: `exec-${process.pid}-${n}`,
          command: ['sh', '-c', 'echo tui'],
          parsed_cmd: [{ type: 'unknown', cmd: 'echo tui' }],
          status: 'completed',
          aggregated_output: 'tui',
          exit_code: 0,
        },
      });
    }
    if (prompt.includes('lent')) {
      const stopped = await new Promise((resolve) => (waiting = resolve));
      if (stopped === 'escape') {
        await hook('Interrupt', { turn_id: turnId });
        event({ type: 'turn_aborted', turn_id: turnId, reason: 'interrupted', duration_ms: 50 });
        return;
      }
    }
    const reply = `Fini : ${prompt}`;
    event({
      type: 'item_completed',
      thread_id: session,
      turn_id: turnId,
      item: { type: 'AgentMessage', id: `msg-${process.pid}-${n}`, content: [{ type: 'Text', text: reply }], phase: 'final_answer' },
    });
    const usage = { input_tokens: 1000 * n, cached_input_tokens: 500 * n, output_tokens: 20 * n, total_tokens: 1020 * n };
    event({ type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage, model_context_window: 258400 } });
    await hook('Stop', { turn_id: turnId, stop_hook_active: false, last_assistant_message: reply });
    event({ type: 'task_complete', turn_id: turnId, last_agent_message: reply, duration_ms: 12 });
  };

  let line = '';
  let pasting = false;
  let ctrlC = 0;
  const draw = () => process.stdout.write(`\r\x1b[2K› ${line}`);
  // A key sequence the terminal gave in two reads (under load) is read whole: its start waits a moment for the
  // rest, then is read as it is (Escape alone).
  let held = '';
  let flush = null;
  process.stdin.on('data', (data) => {
    clearTimeout(flush);
    const whole = held + data;
    const cut = whole.match(/\x1b(\[(2(0[01]?)?)?)?$/);
    held = cut ? cut[0] : '';
    if (held)
      flush = setTimeout(() => {
        const rest = held;
        held = '';
        read(rest);
      }, 50);
    read(cut ? whole.slice(0, cut.index) : whole);
  });
  const read = (chunk) => {
    for (const _ of chunk.matchAll(/\x03/g)) {
      log?.({ ctrlC: Date.now() });
      if (trusting || ++ctrlC >= 2) process.exit(0);
    }
    chunk = chunk.replaceAll('\x03', '');
    for (const part of chunk.split(/(\x1b\[20[01]~|\r|\x1b)/)) {
      if (part === '\x1b[200~') pasting = true;
      else if (part === '\x1b[201~') {
        pasting = false;
        draw();
      } else if (part === '') continue;
      else if (part === '\x1b') {
        if (waiting) [waiting, (waiting = null)][0]('escape');
      } else if (part === '\r') {
        if (trusting) {
          // « Trust and continue »: written in its config, as Codex does.
          trusting = false;
          fs.appendFileSync(config, `\n[projects.'${root}']\ntrust_level = "trusted"\n`);
          process.stdout.write('\r\nfake-codex-tui\r\n');
        } else if (waiting) {
          [waiting, (waiting = null)][0]('enter');
        } else if (line.trim()) {
          const prompt = line.trim();
          line = '';
          draw();
          turn(prompt);
        }
      } else if (!trusting) {
        for (const c of part) {
          if (c === '\x7f' || c === '\b') line = line.slice(0, -1);
          else if (c === '\x15') line = '';
          else line += c;
        }
        if (!pasting) draw();
      }
    }
  };
}
