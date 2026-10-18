// The interface of the fake `copilot` (« Vue Copilot »): `copilot [--resume <id> | --session-id <id>] [options]`,
// in a pseudo-terminal, as Copilot CLI 1.0.98's own was tried (docs/TODO-1.8.md, point 0, « Vue terminal »). It
// needs COPILOT_HOME.
//
// - Its hooks are those of the plugin of its `--plugin-dir <dir>` (`<dir>/hooks/hooks.json`, `{version: 1, hooks}`),
//   and of `<COPILOT_HOME>/hooks/*.json`: run as commands with their event's payload on their input (the payloads of
//   tests/fixtures/copilot/tui-hooks.jsonl). The `powershell` entry under Windows, `bash` elsewhere: a line
//   `& '<program>' <argument>` (or `'<program>' <argument>`) runs the program itself, any other through a shell.
//   Each hook it runs is added to <COPILOT_HOME>/fake-tui-hooks.jsonl ({event, from}), and each launch to
//   <COPILOT_HOME>/fake-tui-launches.jsonl ({argv, cwd, hookUrl, hookToken}: whether those variables were given).
//   As Copilot CLI 1.0.98 does, a plugin of `--plugin-dir` gets a folder of its data, left empty:
//   <COPILOT_HOME>/plugin-data/_direct/<SHA-256 of {"source":"local","path":"<its folder, resolved>"}> (ESC-122).
// - On a folder that neither it nor a folder above it is in the `trustedFolders` of <COPILOT_HOME>/config.json, it
//   first shows `fake-copilot-trust` and waits: Enter trusts it for this process (« 1. Yes »), Down then Enter
//   remembers it (written in config.json as Copilot does), Ctrl+C quits. Then it shows `fake-copilot-tui`.
// - Its session is kept as the fake server keeps it (<COPILOT_HOME>/session-state/<id>.json, its events), and its
//   log (<COPILOT_HOME>/session-state/<id>/events.jsonl) is written as Copilot writes it (see
//   tests/fixtures/copilot/tui-events.jsonl): each line it reads (pasted text, then Enter) is a prompt, its turn
//   `user.message`, `assistant.turn_start`, `session.usage_record`, a reply « Fini : <prompt> », `assistant.turn_end`,
//   then the `agentStop` hook. "permission" in the prompt asks for a command (preToolUse, permissionRequest,
//   `permission.requested`, notification `permission_prompt`) and goes on once the next Enter comes (postToolUse);
//   "question" asks the user (`user_input.requested`), answered by the next line; "lent" makes the turn wait for
//   Escape twice (« esc again to interrupt »), which interrupts it (`abort`, no agentStop); "/quit" ends the process, as two Ctrl+C do (sessionEnd).
// - On a Free account (`free`: no model listed), a `--model` that is not `auto` is refused as Copilot CLI 1.0.98
//   refuses it, said under its first line: « ✗ Model "<model>" from --model flag is not available. Using "auto"
//   instead. » (ESC-122), and it runs on `auto`.
// - `--resume <id>` of a session with no event in COPILOT_HOME fails as Copilot does: « Error: No session, task, or
//   name matched '<id>'. … », exit code 1.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const norm = (p) => {
  const s = p.replaceAll('\\', '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};

/** The JSON of a file of Copilot's whose first lines may be comments (`config.json`). */
const readJsonc = (file) => {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n'),
    );
  } catch {
    return {};
  }
};

/** The hooks of the plugin folder `dir` and of the home `home`: [{event, line, env, from}]. */
function hooksOf(dir, home) {
  const files = [];
  if (dir) files.push([path.join(dir, 'hooks', 'hooks.json'), 'plugin']);
  const own = path.join(home, 'hooks');
  if (fs.existsSync(own)) for (const f of fs.readdirSync(own)) if (f.endsWith('.json')) files.push([path.join(own, f), 'home']);
  const hooks = [];
  for (const [file, from] of files) {
    if (!fs.existsSync(file)) continue;
    const decl = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [event, entries] of Object.entries(decl.hooks || {}))
      for (const e of entries) {
        const line = process.platform === 'win32' ? e.powershell : e.bash;
        if (e.type === 'command' && line) hooks.push({ event, line, env: e.env || {}, from });
      }
  }
  return hooks;
}

/** A hook's line as a program and its argument, when it is one (`& 'C:\…\x.exe' arg`, `'/…/x' arg`). */
function programOf(line) {
  const ps = line.match(/^&\s*'((?:[^']|'')*)'\s*(\w*)$/);
  if (ps) return [ps[1].replaceAll("''", "'"), ps[2] ? [ps[2]] : []];
  const sh = line.match(/^'((?:[^']|'\\'')*)'\s*(\w*)$/);
  if (sh) return [sh[1].replaceAll("'\\''", "'"), sh[2] ? [sh[2]] : []];
  return null;
}

export function tui(argv, { free = false } = {}) {
  const home = process.env.COPILOT_HOME;
  if (!home) {
    process.stderr.write('fake copilot: COPILOT_HOME is needed\n');
    process.exit(2);
  }
  fs.mkdirSync(home, { recursive: true });
  const given = (k) => !!process.env[k];
  fs.appendFileSync(
    path.join(home, 'fake-tui-launches.jsonl'),
    JSON.stringify({ argv, cwd: process.cwd(), hookUrl: given('ESCOUADE_HOOK_URL'), hookToken: given('ESCOUADE_HOOK_TOKEN') }) + '\n',
  );
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const states = path.join(home, 'session-state');
  fs.mkdirSync(states, { recursive: true });
  const logOf = (id) => path.join(states, id, 'events.jsonl');
  const written = (id) => fs.existsSync(logOf(id)) && fs.statSync(logOf(id)).size > 0;
  const resumed = flag('--resume');
  if (resumed && !written(resumed)) {
    const text = `Error: No session, task, or name matched '${resumed}'.\r\n\r\nTo resume by session or task ID:  copilot --resume=<id>\r\n`;
    try {
      fs.writeSync(2, text);
    } catch {
      process.stderr.write(text);
    }
    setTimeout(() => process.exit(1), 150);
    return;
  }
  const id = resumed || flag('--session-id') || crypto.randomUUID();
  const cwd = process.cwd();
  const asked = flag('--model');
  const refused = free && asked && asked !== 'auto' ? asked : null;
  const model = refused ? 'auto' : asked || 'gpt-6-luna';
  const hooks = hooksOf(flag('--plugin-dir'), home);
  if (flag('--plugin-dir')) {
    const source = JSON.stringify({ source: 'local', path: path.resolve(flag('--plugin-dir')) });
    fs.mkdirSync(path.join(home, 'plugin-data', '_direct', crypto.createHash('sha256').update(source).digest('hex')), { recursive: true });
  }

  // Its session, as the fake server keeps it.
  const file = path.join(states, `${id}.json`);
  const s = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { id, cwd, model, effort: null, mode: 'interactive', permissions: 'manual', events: [], todos: [], nano: 0, system: null };
  let last = s.events.at(-1)?.id ?? null;
  const emit = (type, data) => {
    const event = { type, data, id: crypto.randomUUID(), timestamp: new Date().toISOString(), parentId: last };
    last = event.id;
    s.events.push(event);
    fs.writeFileSync(file, JSON.stringify(s));
    fs.mkdirSync(path.dirname(logOf(id)), { recursive: true });
    fs.appendFileSync(logOf(id), JSON.stringify(event) + '\n');
    return event;
  };
  const hook = (event, extra = {}) =>
    Promise.all(
      hooks
        .filter((h) => h.event === event)
        .map(
          (h) =>
            new Promise((resolve) => {
              fs.appendFileSync(path.join(home, 'fake-tui-hooks.jsonl'), JSON.stringify({ event, from: h.from }) + '\n');
              const payload = { sessionId: id, timestamp: Date.now(), cwd, ...extra };
              const env = { ...process.env, ...h.env };
              const program = programOf(h.line);
              const child = program
                ? spawn(program[0], program[1], { env, stdio: ['pipe', 'ignore', 'ignore'] })
                : spawn(h.line, { shell: true, env, stdio: ['pipe', 'ignore', 'ignore'] });
              child.on('error', resolve);
              child.on('exit', resolve);
              child.stdin.on('error', () => {});
              child.stdin.end(JSON.stringify(payload));
            }),
        ),
    );

  // The question about the folder, when its config trusts neither it nor a folder above it.
  const config = path.join(home, 'config.json');
  const trusted = () => (readJsonc(config).trustedFolders || []).map(norm).some((k) => norm(cwd) === k || norm(cwd).startsWith(k + '/'));
  let trusting = !trusted();
  let remember = false;
  // Raw before its first screen (ESC-125): a key typed as soon as that shows would else reach a terminal still cooked, which
  // turns Enter into \n.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdout.write(trusting ? '\x1b[?2004hfake-copilot-trust\r\n' : '\x1b[?2004hfake-copilot-tui\r\n');
  if (refused) process.stdout.write(`✗ Model "${refused}" from --model flag is not available. Using "auto" instead.\r\n`);

  let first = true;
  let waiting = null;
  let n = 0;
  const end = async () => {
    await hook('sessionEnd', { reason: 'user_exit' });
    process.exit(0);
  };
  const turn = async (prompt) => {
    if (prompt === '/quit' || prompt === '/exit') return end();
    if (!s.events.length)
      emit('session.start', { sessionId: id, version: 1, producer: 'copilot-agent', copilotVersion: '1.0.98', context: { cwd } });
    n += 1;
    process.stdout.write(`fake-turn ${prompt}\r\n`);
    await hook('userPromptSubmitted', { prompt });
    emit('user.message', { content: prompt, messageId: crypto.randomUUID(), interactionId: crypto.randomUUID(), turnId: '0' });
    if (first) {
      first = false;
      await hook('sessionStart', { source: resumed ? 'resume' : 'new', initialPrompt: prompt });
    }
    emit('assistant.turn_start', { turnId: '0' });
    emit('session.usage_record', {
      usage: {
        model,
        inputTokens: 1000 * n,
        outputTokens: 20,
        cacheReadTokens: 500,
        cacheWriteTokens: 0,
        copilotUsage: { totalNanoAiu: 32216000 },
      },
    });
    if (prompt.includes('permission')) {
      const toolCallId = 'call_' + crypto.randomUUID().slice(0, 8);
      const args = { command: 'echo tui', description: 'Print tui' };
      emit('tool.execution_start', { toolCallId, toolName: 'powershell', arguments: args, turnId: '0' });
      await hook('preToolUse', { toolName: 'powershell', toolArgs: args });
      await hook('permissionRequest', {
        hookName: 'permissionRequest',
        toolName: 'powershell',
        toolInput: { command: 'echo tui' },
        permissionSuggestions: [],
      });
      const requestId = crypto.randomUUID();
      emit('permission.requested', { requestId, permissionRequest: { kind: 'shell', toolCallId, fullCommandText: 'echo tui' } });
      // Waiting for the answer before the hook says it waits: Escouade shows the card as the hook reaches it, and a
      // key typed then is the answer, not a message.
      const answered = new Promise((resolve) => (waiting = resolve));
      await hook('notification', {
        message: 'Run command: echo tui',
        title: 'Permission needed',
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
      });
      await answered;
      emit('permission.completed', { requestId, toolCallId, result: { kind: 'approved' }, decisionSource: 'human_response' });
      await hook('postToolUse', { toolName: 'powershell', toolArgs: args, toolResult: { resultType: 'success', textResultForLlm: 'tui' } });
      emit('tool.execution_complete', { toolCallId, success: true, result: { content: 'tui', detailedContent: 'tui' } });
    }
    if (prompt.includes('question')) {
      const requestId = crypto.randomUUID();
      emit('user_input.requested', { requestId, question: 'Quelle couleur ?', choices: ['Bleu', 'Vert'], allowFreeform: true });
      const answer = await new Promise((resolve) => (waiting = resolve));
      emit('user_input.completed', { requestId, answer, wasFreeform: true });
    }
    if (prompt.includes('lent')) {
      const stopped = await new Promise((resolve) => (waiting = resolve));
      if (stopped === 'escape') {
        emit('assistant.turn_end', { turnId: '0' });
        emit('abort', { reason: 'user_initiated' });
        return;
      }
    }
    const reply = `Fini : ${prompt}`;
    emit('assistant.message', { messageId: crypto.randomUUID(), content: reply, toolRequests: [], turnId: '0', phase: 'final_answer' });
    emit('assistant.turn_end', { turnId: '0' });
    await hook('agentStop', { transcriptPath: logOf(id), stopReason: 'end_turn', stop_hook_active: false });
  };

  let line = '';
  let pasting = false;
  let ctrlC = 0;
  let escaped = 0;
  const draw = () => process.stdout.write(`\r\x1b[2K❯ ${line}`);
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
      if (trusting) process.exit(0);
      if (++ctrlC >= 2) end();
    }
    chunk = chunk.replaceAll('\x03', '');
    for (const part of chunk.split(/(\x1b\[20[01]~|\x1b\[B|\r|\x1b)/)) {
      if (part === '\x1b[200~') pasting = true;
      else if (part === '\x1b[201~') {
        pasting = false;
        draw();
      } else if (part === '') continue;
      else if (part === '\x1b[B') {
        if (trusting) remember = true;
      } else if (part === '\x1b') {
        // As Copilot: a first Escape asks for a second, which interrupts if it comes soon enough.
        if (waiting && Date.now() - escaped < 2000) {
          escaped = 0;
          [waiting, (waiting = null)][0]('escape');
        } else if (waiting) {
          escaped = Date.now();
          process.stdout.write('\r\nesc again to interrupt\r\n');
        }
      } else if (part === '\r') {
        if (trusting) {
          // « 1. Yes » for this process; « 2. Yes, and remember this folder » written in its config.
          trusting = false;
          if (remember) {
            const c = readJsonc(config);
            c.trustedFolders = [...(c.trustedFolders || []), cwd];
            fs.writeFileSync(
              config,
              '// User settings belong in settings.json.\n// This file is managed automatically.\n' + JSON.stringify(c, null, 2),
            );
          }
          process.stdout.write('\r\nfake-copilot-tui\r\n');
        } else if (waiting) {
          const answer = line.trim();
          line = '';
          draw();
          [waiting, (waiting = null)][0](answer || 'enter');
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
