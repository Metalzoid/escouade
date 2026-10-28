// The interface of the fake `vibe` (« Vue Vibe »): `vibe [--resume <id>] --agent <agent> [--add-dir=<dir>]`, in a
// pseudo-terminal, as Mistral Vibe 3.0.3's own was tried (docs/TODO-1.8.md, point 0, « Mistral Vibe », ESC-265 and
// ESC-268). It needs VIBE_HOME.
//
// - Each launch is added to <VIBE_HOME>/fake-tui-launches.jsonl ({argv, cwd, home, mcpServers, mcpToken, hooks,
//   trusted, telemetry, activeModel, config}): what Escouade gave it in its variables and its VIBE_HOME.
// - Its session is `--resume <id>` when its store has it (<VIBE_HOME>/logs/session/unified/<id>/, written by the fake
//   ACP once something was said); else it says « Error: Failed to resume session: Session not found: <id> » and goes
//   on in a new one, as Vibe does. It shows `fake-vibe-tui <id>`.
// - Its journal is the store's (`journal/<sequence on 16 digits>.jsonl`), written as Vibe writes it
//   (tests/fixtures/vibe/tui-journal-*.jsonl): a segment opened as it starts, another at the end of each turn, the one
//   before the last removed. Each line it reads (pasted text, then Enter) is a prompt: the user's message, then the
//   reply « Fini : <prompt> » and the turn `completed`. "commande" runs `npm test` (bash) first; "permission" asks its
//   permission first (a callback) and waits for Enter; "lent" waits for Escape, which ends the turn `interrupted`.
//   A line read during a turn waits for its end. Ctrl+C twice out of a turn ends the process.
// - Its hooks (<VIBE_HOME>/hooks.toml, `command` of each) run as Vibe runs them, in a shell, their event on their
//   input: `pre_tool` and `post_tool` around its tool, `post_agent` at the end of each turn. Each one run is added
//   to <VIBE_HOME>/fake-tui-hooks.jsonl ({event, command}).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/** The hooks of its hooks.toml: [{type, command}]. */
function hooksOf(text) {
  const out = [];
  for (const block of (text ?? '').split('[[hooks]]').slice(1)) {
    const type = block.match(/^type\s*=\s*"([^"]+)"/m)?.[1];
    const command = block.match(/^command\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/m)?.[1];
    if (type && command) out.push({ type, command: command.startsWith('"') ? JSON.parse(command) : command.slice(1, -1) });
  }
  return out;
}

export function tui(argv) {
  const home = process.env.VIBE_HOME;
  if (!home) {
    process.stderr.write('fake vibe: VIBE_HOME is needed\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  fs.mkdirSync(home, { recursive: true });
  const hooksText = read(path.join(home, 'hooks.toml'));
  fs.appendFileSync(
    path.join(home, 'fake-tui-launches.jsonl'),
    JSON.stringify({
      argv,
      cwd,
      home,
      mcpServers: process.env.VIBE_MCP_SERVERS ?? null,
      mcpToken: process.env.ESCOUADE_MCP_TOKEN ?? null,
      hooks: hooksText,
      trusted: read(path.join(home, 'trusted_folders.toml')),
      telemetry: process.env.VIBE_ENABLE_TELEMETRY ?? null,
      activeModel: process.env.VIBE_ACTIVE_MODEL ?? null,
      config: read(path.join(home, 'config.toml')),
    }) + '\n',
  );
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const store = path.join(home, 'logs', 'session', 'unified');
  const resumed = flag('--resume');
  let notFound = null;
  if (resumed && !fs.existsSync(path.join(store, resumed))) notFound = resumed;
  const id = resumed && !notFound ? resumed : crypto.randomUUID();
  const journal = path.join(store, id, 'journal');
  fs.mkdirSync(journal, { recursive: true });
  const segments = () =>
    fs
      .readdirSync(journal)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
  let seq = segments().reduce((n, f) => Math.max(n, parseInt(f, 10) + 1), 1);
  let segment;
  const openSegment = () => {
    segment = path.join(journal, `${String(seq).padStart(16, '0')}.jsonl`);
    fs.writeFileSync(segment, '');
    // The store keeps the segment before the last one only.
    const all = segments();
    for (const old of all.slice(0, -2)) fs.rmSync(path.join(journal, old), { force: true });
  };
  openSegment();
  // The session as the fake ACP keeps it (logs/session/fake/<id>.json), which it loads back: one store for both.
  const kept = path.join(home, 'logs', 'session', 'fake', `${id}.json`);
  const session = read(kept) ? JSON.parse(read(kept)) : { id, cwd, history: [], model: 'mistral-medium-3.5', thinking: 'high' };
  const keep = (sessionUpdate, text) => {
    session.history.push({ sessionUpdate, content: { type: 'text', text } });
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    fs.writeFileSync(kept, JSON.stringify(session));
  };
  const record = (type, payload) =>
    fs.appendFileSync(segment, JSON.stringify({ payload, recovery_journal_record_version: 1, sequence: seq++, type }) + '\n');
  const delta = (...ops) => record('projection_delta', { delta: ops, watermark: seq });
  const envelope = (turn, status, running) => ({
    op: 'set_envelope',
    state: {
      activeCallbacks: [],
      format: 'harness.public-session-state/v1',
      latestTurn: { id: turn, sessionId: id, status, startedAt: Date.now() },
      session: { id, status: running ? { activeTurnId: turn, type: 'running' } : { type: 'idle' } },
    },
  });
  const hooks = hooksOf(hooksText);
  const runHooks = (event, more) =>
    Promise.all(
      hooks
        .filter((h) => h.type === event)
        .map(
          (h) =>
            new Promise((resolve) => {
              fs.appendFileSync(path.join(home, 'fake-tui-hooks.jsonl'), JSON.stringify({ event, command: h.command }) + '\n');
              const child = spawn(h.command, { shell: true, cwd, stdio: ['pipe', 'ignore', 'ignore'] });
              child.on('error', resolve);
              child.on('exit', resolve);
              child.stdin.end(
                JSON.stringify({
                  hook_event_name: event,
                  session_id: id,
                  parent_session_id: null,
                  transcript_path: path.join(store, id),
                  cwd,
                  ...more,
                }),
              );
            }),
        ),
    );

  // Raw before its first screen (ESC-125): a key typed as soon as that shows would else reach a terminal still cooked.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  if (notFound) process.stdout.write(`Error: Failed to resume session: Session not found: ${notFound}\r\n`);
  process.stdout.write(`\x1b[?2004hfake-vibe-tui ${id}\r\n`);

  let waiting = null;
  let queue = Promise.resolve();
  let ctrlC = 0;
  const turn = async (prompt) => {
    const turnId = `turn-${crypto.randomUUID()}`;
    const msgId = `rs-${crypto.randomUUID()}`;
    delta(
      {
        op: 'append_entry',
        entry: {
          id: msgId,
          type: 'message',
          role: 'user',
          source: 'turn_start',
          content: [{ type: 'text', text: prompt }],
          generationStatus: 'completed',
          sessionId: id,
          turnId,
        },
      },
      envelope(turnId, 'in_progress', true),
    );
    keep('user_message_chunk', prompt);
    process.stdout.write(`fake-turn ${prompt}\r\n`);
    let status = 'completed';
    if (prompt.includes('commande') || prompt.includes('permission')) {
      const command = prompt.includes('permission') ? 'node --version' : 'npm test';
      const effect = `effect-${crypto.randomUUID()}`;
      const detail = { kind: 'tool', toolName: 'file_system.bash', input: { command, timeout_seconds: 120 } };
      await runHooks('pre_tool', { tool_name: 'bash', tool_call_id: effect, tool_input: { command } });
      delta(
        {
          op: 'append_entry',
          entry: {
            id: effect,
            type: 'effect',
            detail,
            generationStatus: 'in_progress',
            state: { status: 'running', outputText: '' },
            sessionId: id,
            turnId,
          },
        },
        envelope(turnId, 'in_progress', true),
      );
      if (prompt.includes('permission')) {
        const callbackId = `approval-${crypto.randomUUID()}`;
        record('callback_registered', {
          callback_id: callbackId,
          kind: 'approval',
          routing: {
            callbackId,
            type: 'callback',
            title: 'Approve file_system.bash',
            state: { status: 'open' },
            detail: { kind: 'approval', effect: detail },
          },
        });
        process.stdout.write('fake-vibe-permission\r\n');
        await new Promise((resolve) => (waiting = { resolve, kind: 'permission' }));
        record('callback_resolved', {
          callback_id: callbackId,
          state: 'resolved',
          result: { callbackId, output: { decision: { type: 'approve' }, type: 'approval' } },
        });
      }
      await runHooks('post_tool', { tool_name: 'bash', tool_call_id: effect, tool_status: 'success' });
      delta(
        {
          op: 'replace_entry',
          entry: {
            id: effect,
            type: 'effect',
            detail,
            generationStatus: 'completed',
            state: { decision: 'execute', display: { success: true } },
            sessionId: id,
            turnId,
          },
        },
        envelope(turnId, 'in_progress', true),
      );
    }
    if (prompt.includes('lent')) {
      process.stdout.write('Esc/Ctrl+C to interrupt\r\n');
      await new Promise((resolve) => (waiting = { resolve, kind: 'turn' }));
      status = 'interrupted';
    } else {
      await runHooks('post_agent', { agent_name: flag('--agent') });
      keep('agent_message_chunk', `Fini : ${prompt}`);
      delta({
        op: 'append_entry',
        entry: {
          id: `assistant-${crypto.randomUUID()}`,
          type: 'message',
          role: 'assistant',
          source: 'harness',
          content: [{ type: 'text', text: `Fini : ${prompt}` }],
          generationStatus: 'completed',
          outcome: { type: 'committed' },
          sessionId: id,
          turnId,
        },
      });
    }
    delta(envelope(turnId, status, false));
    record('receipt_succeeded', {});
    openSegment();
  };

  let line = '';
  let pasting = false;
  const draw = () => process.stdout.write(`\r\x1b[2K> ${line}`);
  process.stdin.on('data', (chunk) => {
    for (const _ of chunk.matchAll(/\x03/g)) {
      if (waiting) continue;
      if (++ctrlC >= 2) process.exit(0);
      process.stdout.write('\r\nPress Ctrl+C again to quit\r\n');
    }
    chunk = chunk.replaceAll('\x03', '');
    for (const part of chunk.split(/(\x1b\[20[01]~|\r)/)) {
      if (part === '\x1b[200~') pasting = true;
      else if (part === '\x1b[201~') {
        pasting = false;
        draw();
      } else if (part === '') continue;
      else if (part === '\x1b' && !pasting) {
        if (waiting?.kind === 'turn') {
          const w = waiting;
          waiting = null;
          w.resolve();
        }
      } else if (part === '\r') {
        if (waiting?.kind === 'permission') {
          const w = waiting;
          waiting = null;
          w.resolve();
        } else if (line.trim() && !waiting) {
          const prompt = line.trim();
          line = '';
          ctrlC = 0;
          draw();
          // A message typed during a turn waits for its end, as Vibe queues it.
          queue = queue.then(() => turn(prompt));
        }
      } else {
        for (const c of part) {
          if (c === '\x7f' || c === '\b') line = line.slice(0, -1);
          else if (c === '\x15') line = '';
          else line += c;
        }
        if (!pasting) draw();
      }
    }
  });
}
