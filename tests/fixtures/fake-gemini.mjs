#!/usr/bin/env node
// A fake `gemini --acp` of Gemini CLI for the tests (ESC-274): ACP v1 (JSON-RPC 2.0, one message a line), as Gemini CLI
// 0.66.0 speaks it in the study (tests/fixtures/gemini/): its calls tell no `rawInput` (their tool is the start of their
// id), its permissions repeat the whole call, its change of mode is a text « [MODE_UPDATE] <mode> », and `session/load`
// replays the history after its answer. The words of each message pick what it plays:
//   bonjour (or anything else) — a reply;  raisonnement — a thought « **sujet**\n… », then a reply;
//   commande — `npm test` (run_shell_command), asking its permission in the modes default and autoEdit, unless « Allow
//   for this session » allowed it before; refused, its call fails « was canceled by the user » and the fake waits for
//   the turn to be cut (session/cancel);
//   fichier — notes.txt written in the agent's folder (write_file, its diff), asking in the mode default;
//   lis <chemin> — read_file of <chemin>, refused « denied by policy » when a `deny` rule of the --policy file matches its
//   arguments (as JSON), else its first line said;
//   question — the turn ends on a block <escouade_question> (Gemini has no tool to ask in ACP: Escouade tells it to);
//   « The user answered your questions » — says the answer;
//   propose un plan — in the mode plan, its plan written in its plans folder, then exit_plan_mode asking its approval
//   (Allow / Reject); allowed, « [MODE_UPDATE] default » and the mode default;
//   sous-agent — invoke_agent « generalist », refused « denied by policy » outside the mode yolo, as Gemini's;
//   lent — a turn of 4 s (a command), stopped by session/cancel;  modèle — says its model and mode;
//   confiance — says whether its folder is trusted (GEMINI_CLI_TRUST_WORKSPACE);  réglages — says its settings.json;
//   outil escouade <outil> — calls <outil> of Escouade's MCP server, by the entry `escouade` of its session (left out of
//   an untrusted folder, without a word, as Gemini's), its permission asked outside yolo;
//   limite — the error 429 of a rate limit.
// Each turn spends 1 200 input tokens (200 from the cache) and 20 output, told in its answer's `usage`.
// Sessions are kept in $GEMINI_CLI_HOME/.gemini/tmp/fake/chats/<id>.json. Each message, and each launch ({launch: {argv,
// cwd, home, trust, policy, auth}}), goes to $FAKE_GEMINI_LOG when set. No key is ever logged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
if (argv.includes('--version') || argv.includes('-v')) {
  console.log(process.env.FAKE_GEMINI_VERSION || '0.66.0');
  process.exit(0);
}
const logFile = process.env.FAKE_GEMINI_LOG;
const log = (entry) => logFile && fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
const home = path.join(process.env.GEMINI_CLI_HOME || path.join(process.cwd(), '.fake-gemini-home'), '.gemini');
const policyAt = argv.indexOf('--policy');
const policyFile = policyAt >= 0 ? argv[policyAt + 1] : null;
const trusted = process.env.GEMINI_CLI_TRUST_WORKSPACE === 'true';
const settingsFile = path.join(home, 'settings.json');
const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return null;
  }
};
log({
  launch: {
    argv,
    cwd: process.cwd(),
    home: process.env.GEMINI_CLI_HOME ?? null,
    trust: trusted,
    policy: policyFile ? fs.readFileSync(policyFile, 'utf8') : null,
    auth: readSettings()?.security?.auth?.selectedType ?? null,
  },
});
if (!argv.includes('--acp')) {
  process.stderr.write('fake gemini: only --acp is played\n');
  process.exit(2);
}
const sessionsDir = path.join(home, 'tmp', 'fake', 'chats');
fs.mkdirSync(sessionsDir, { recursive: true });

/** The `deny` rules of the --policy file: their tools and their regular expression of the arguments. */
function denyRules() {
  if (!policyFile) return [];
  const text = fs.readFileSync(policyFile, 'utf8');
  const str = (v) => (v.startsWith("'") ? v.slice(1, -1) : JSON.parse(v));
  return text
    .split('[[rule]]')
    .slice(1)
    .map((block) => {
      const get = (k) => block.match(new RegExp(`^${k} = (.+)$`, 'm'))?.[1]?.trim();
      const tools = get('toolName');
      return {
        tools: tools?.startsWith('[')
          ? [...tools.matchAll(/(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/g)].map((m) => m[1] ?? JSON.parse(`"${m[2]}"`))
          : [tools && str(tools)],
        args: get('argsPattern') && str(get('argsPattern')),
        command: get('commandRegex') && str(get('commandRegex')),
        decision: get('decision') && str(get('decision')),
      };
    })
    .filter((r) => r.decision === 'deny');
}
const deniedBy = (tool, args) =>
  denyRules().some(
    (r) =>
      r.tools.includes(tool) &&
      (r.args ? new RegExp(r.args).test(JSON.stringify(args)) : r.command ? new RegExp(r.command).test(args.command ?? '') : true),
  );

const MODES = [
  { id: 'default', name: 'Default', description: 'Prompts for approval' },
  { id: 'autoEdit', name: 'Auto Edit', description: 'Auto-approves edit tools' },
  { id: 'yolo', name: 'YOLO', description: 'Auto-approves all tools' },
  { id: 'plan', name: 'Plan', description: 'Read-only mode' },
];
const MODELS = [
  { modelId: 'auto', name: 'Auto', description: 'Let Gemini CLI decide the best model for the task' },
  { modelId: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
  { modelId: 'gemini-3.8-flash', name: 'gemini-3.8-flash' },
  { modelId: 'gemini-3.5-flash-lite', name: 'gemini-3.5-flash-lite' },
];

function write(msg) {
  const m = { jsonrpc: '2.0', ...msg };
  log({ dir: 'in', msg: m });
  process.stdout.write(JSON.stringify(m) + '\n');
}
const result = (id, r) => write({ id, result: r });
const error = (id, message, code = -32603) => write({ id, error: { code, message } });

// ----- requests to the client -----
let nextId = 0;
const waiting = new Map();
function ask(method, params) {
  const id = nextId++;
  write({ id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}

// ----- sessions -----
const sessions = new Map();
const fileOf = (id) => path.join(sessionsDir, `${id}.json`);
function save(s) {
  fs.writeFileSync(fileOf(s.id), JSON.stringify({ id: s.id, cwd: s.cwd, history: s.history, model: s.model }));
}
function opened(s) {
  return {
    modes: { availableModes: MODES, currentModeId: s.mode },
    models: { availableModels: MODELS, currentModelId: s.model },
  };
}
function update(s, u, keep = true) {
  write({ method: 'session/update', params: { sessionId: s.id, update: u } });
  if (keep && /chunk$|^tool_call$/.test(u.sessionUpdate)) s.history.push(u);
}
const say = (s, text) => {
  for (const piece of text.match(/.{1,12}/gsu) ?? [])
    update(s, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: piece } });
};
const think = (s, text) => update(s, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text } });
let callNo = 0;
const callId = (tool) => `${tool}__${tool}_${Date.now()}_${callNo++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPTS = [
  { optionId: 'proceed_always', name: 'Allow for this session', kind: 'allow_always' },
  { optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' },
  { optionId: 'cancel', name: 'Reject', kind: 'reject_once' },
];
async function permission(s, toolCall, options = OPTS) {
  const r = await ask('session/request_permission', { sessionId: s.id, options, toolCall });
  return r?.outcome?.outcome === 'selected' ? r.outcome.optionId : 'cancel';
}
const failed = (s, id, kind, text) =>
  update(s, {
    sessionUpdate: 'tool_call_update',
    toolCallId: id,
    status: 'failed',
    content: [{ type: 'content', content: { type: 'text', text } }],
    kind,
  });
const modeUpdate = (s, mode) => {
  s.mode = mode;
  update(s, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `[MODE_UPDATE] ${mode}` } }, false);
};

/** The text of the tool `tool` of the MCP server `entry` (`{url, headers: [{name, value}]}`, as ACP gives it). */
async function escouadeTool(entry, tool) {
  const base = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  for (const h of entry.headers ?? []) base[h.name] = h.value;
  let session = null;
  const call = async (method, params, id) => {
    const headers = { ...base, ...(session ? { 'mcp-session-id': session } : {}) };
    const body = JSON.stringify(id === undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params });
    const r = await fetch(entry.url, { method: 'POST', headers, body });
    session = r.headers.get('mcp-session-id') ?? session;
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}`);
    if (id === undefined) return null;
    const answers = text.includes('data:')
      ? text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => JSON.parse(l.slice(5)))
      : [JSON.parse(text)];
    const answer = answers.find((a) => a.id === id);
    if (answer?.error) throw new Error(answer.error.message);
    return answer?.result;
  };
  await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'gemini-cli', version: '0' } }, 1);
  await call('notifications/initialized', {});
  const result = await call('tools/call', { name: tool, arguments: {} }, 2);
  return (result?.content ?? []).map((c) => c.text ?? '').join('');
}

async function turn(s, words, cancelled) {
  if (words.startsWith('outil escouade ')) {
    const tool = words.slice('outil escouade '.length).trim();
    // An untrusted folder leaves out its session's servers, without a word.
    const entry = trusted ? s.mcp.find((m) => m.name === 'escouade') : null;
    if (!entry) return say(s, 'Pas de serveur escouade dans la session.');
    const id = callId(`mcp_escouade_${tool}`);
    const tc = { toolCallId: id, status: 'pending', title: `${tool} (escouade MCP Server)`, content: [], locations: [], kind: 'other' };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    if (s.mode !== 'yolo' && !s.always.has(`mcp:${tool}`)) {
      const option = await permission(s, tc, [
        { optionId: 'proceed_always_server', name: 'Allow all server tools for this session', kind: 'allow_always' },
        { optionId: 'proceed_always_tool', name: 'Allow tool for this session', kind: 'allow_always' },
        { optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' },
        { optionId: 'cancel', name: 'Reject', kind: 'reject_once' },
      ]);
      if (option.startsWith('proceed_always')) s.always.add(`mcp:${tool}`);
      if (option === 'cancel') return failed(s, id, 'other', `Tool "mcp_escouade_${tool}" was canceled by the user.`);
    }
    try {
      const text = await escouadeTool(entry, tool);
      update(s, {
        sessionUpdate: 'tool_call_update',
        ...tc,
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text } }],
      });
      say(s, `Escouade a répondu : ${text}`);
    } catch (e) {
      failed(s, id, 'other', e.message);
      say(s, `Escouade a refusé : ${e.message}`);
    }
    return;
  }
  if (words.startsWith('The user answered your questions')) {
    const answer = words.match(/→ (.*)$/m)?.[1] ?? '';
    return say(s, `Tu as choisi ${answer}.`);
  }
  if (words.startsWith('lis ')) {
    const file = path.resolve(s.cwd, words.slice(4).trim());
    const id = callId('read_file');
    if (deniedBy('read_file', { file_path: file })) {
      update(s, {
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'Tool execution for "ReadFile" denied by policy.' } }],
        kind: 'read',
      });
      return say(s, 'Lecture refusée par les règles.');
    }
    const tc = {
      toolCallId: id,
      status: 'in_progress',
      title: path.basename(file),
      content: [],
      locations: [{ path: file }],
      kind: 'read',
    };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n')[0] : '(absent)';
    update(s, { sessionUpdate: 'tool_call_update', ...tc, status: 'completed', content: [] });
    return say(s, `Le fichier dit : ${text}`);
  }
  if (words.includes('raisonnement')) {
    think(s, '**Analyse**\nJe regarde la demande avant de répondre.');
    say(s, 'Voici ma réponse réfléchie.');
  } else if (words.includes('commande')) {
    const id = callId('run_shell_command');
    const tc = {
      toolCallId: id,
      status: 'pending',
      title: 'npm test',
      content: [{ type: 'content', content: { type: 'text', text: `[current working directory ${s.cwd}] (lance les tests)` } }],
      locations: [],
      kind: 'execute',
    };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    let ok = s.mode === 'yolo' || s.always.has('shell:npm');
    if (!ok) {
      const option = await permission(s, tc);
      if (option === 'proceed_always') s.always.add('shell:npm');
      ok = option.startsWith('proceed');
    }
    if (ok) {
      update(s, { sessionUpdate: 'tool_call_update', ...tc, status: 'completed', content: [] });
      say(s, 'La commande a marché.');
    } else {
      failed(s, id, 'execute', 'Tool "run_shell_command" was canceled by the user.');
      for (let i = 0; i < 50 && !cancelled(); i++) await sleep(20);
      if (!cancelled()) say(s, 'Commande refusée.');
    }
  } else if (words.includes('fichier')) {
    const file = path.join(s.cwd, 'notes.txt');
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const after = before + 'note de Gemini\n';
    const id = callId('write_file');
    const tc = {
      toolCallId: id,
      status: 'pending',
      title: 'Writing to notes.txt',
      content: [{ type: 'diff', path: file, oldText: before, newText: after, _meta: { kind: before ? 'modify' : 'add' } }],
      locations: [{ path: file }],
      kind: 'edit',
    };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    let ok = s.mode === 'yolo' || s.mode === 'autoEdit';
    if (!ok) ok = (await permission(s, tc)).startsWith('proceed');
    if (ok) {
      fs.writeFileSync(file, after);
      update(s, { sessionUpdate: 'tool_call_update', ...tc, status: 'completed' });
      say(s, 'J’ai modifié notes.txt.');
    } else {
      failed(s, id, 'edit', 'Tool "write_file" was canceled by the user.');
      for (let i = 0; i < 50 && !cancelled(); i++) await sleep(20);
    }
  } else if (words.includes('question')) {
    const block = { questions: [{ question: 'Quelle couleur préfères-tu ?', options: ['rouge', 'bleu'], multiSelect: false }] };
    say(s, `Il me faut ton choix.\n<escouade_question>${JSON.stringify(block)}</escouade_question>`);
  } else if (words.includes('propose un plan')) {
    if (s.mode !== 'plan') return say(s, 'Je ne suis pas en mode plan.');
    think(s, '**Plan**\nJe regarde le code avant de proposer.');
    const dir = path.join(home, 'tmp', 'fake', s.id, 'plans');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'plan.md');
    fs.writeFileSync(file, '# Ajouter sub\n\n1. Ajouter la fonction sub.\n2. Écrire son test.\n');
    const id = callId('exit_plan_mode');
    const tc = {
      toolCallId: id,
      status: 'pending',
      title: `Requesting plan approval for: ${file}`,
      content: [],
      locations: [],
      kind: 'other',
    };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    const option = await permission(s, tc, OPTS.slice(1));
    if (option === 'proceed_once') {
      modeUpdate(s, 'default');
      update(s, {
        sessionUpdate: 'tool_call_update',
        ...tc,
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: `Plan approved: ${file}` } }],
      });
      say(s, 'Plan approuvé, je le mets en œuvre.');
    } else {
      failed(s, id, 'other', 'Tool "exit_plan_mode" was canceled by the user.');
      for (let i = 0; i < 50 && !cancelled(); i++) await sleep(20);
    }
  } else if (words.includes('sous-agent')) {
    const id = callId('invoke_agent');
    if (s.mode !== 'yolo') {
      failed(s, id, 'think', 'Tool execution for "invoke_agent" denied by policy.');
      return say(s, 'Sous-agent refusé.');
    }
    const tc = {
      toolCallId: id,
      status: 'in_progress',
      title: "Delegating to agent 'generalist'",
      content: [],
      locations: [],
      kind: 'think',
    };
    update(s, { sessionUpdate: 'tool_call', ...tc });
    await sleep(30);
    update(s, { sessionUpdate: 'tool_call_update', ...tc, status: 'completed' });
    say(s, 'Le sous-agent a résumé le README.');
  } else if (words.includes('lent')) {
    say(s, 'Je commence un long travail…');
    const id = callId('run_shell_command');
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: id,
      status: 'in_progress',
      title: 'sleep 4',
      content: [],
      locations: [],
      kind: 'execute',
    });
    for (let i = 0; i < 40 && !cancelled(); i++) await sleep(100);
    if (cancelled()) return;
    update(s, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed', content: [], kind: 'execute' });
    say(s, 'Long travail fini.');
  } else if (words.includes('modèle')) {
    say(s, `Je tourne sur ${s.model}, mode ${s.mode}.`);
  } else if (words.includes('confiance')) {
    say(s, trusted ? 'Dossier de confiance.' : 'Dossier sans confiance.');
  } else if (words.includes('réglages')) {
    say(s, `Réglages : ${JSON.stringify(readSettings())}`);
  } else {
    say(s, `Gemini a reçu : ${words}`);
  }
}

// ----- the protocol -----
let running = null;
function newSession(cwd, mcp) {
  const s = { id: crypto.randomUUID(), cwd, history: [], mode: 'default', model: 'auto', mcp: mcp ?? [], always: new Set() };
  sessions.set(s.id, s);
  save(s);
  return s;
}
function loaded(id, cwd, mcp) {
  if (sessions.has(id)) return sessions.get(id);
  if (!fs.existsSync(fileOf(id))) return null;
  const kept = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
  const s = { ...kept, cwd, mode: 'default', mcp: mcp ?? [], always: new Set() };
  sessions.set(s.id, s);
  return s;
}
async function onMessage(msg) {
  if (msg.method === undefined) {
    const resolve = waiting.get(msg.id);
    waiting.delete(msg.id);
    resolve?.(msg.result ?? null);
    return;
  }
  const p = msg.params ?? {};
  switch (msg.method) {
    case 'initialize':
      return result(msg.id, {
        protocolVersion: 1,
        authMethods: [
          { id: 'oauth-personal', name: 'Log in with Google', description: 'Log in with your Google account' },
          { id: 'gemini-api-key', name: 'Gemini API key', description: 'Use an API key with Gemini Developer API' },
        ],
        agentInfo: { name: 'gemini-cli', title: 'Gemini CLI', version: '0.66.0' },
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, audio: true, embeddedContext: true },
          mcpCapabilities: { http: true, sse: true },
        },
      });
    case 'session/new': {
      if (readSettings() === null && process.env.FAKE_GEMINI_NO_ACCOUNT)
        return error(msg.id, 'Gemini API key is missing or not configured.', -32000);
      const s = newSession(p.cwd, p.mcpServers);
      result(msg.id, { sessionId: s.id, ...opened(s) });
      return update(
        s,
        { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'memory', description: 'Manage memory.' }] },
        false,
      );
    }
    case 'session/load': {
      const s = loaded(p.sessionId, p.cwd, p.mcpServers);
      if (!s) return error(msg.id, `Session not found: ${p.sessionId}`, -32602);
      // Its context first, then its answer, then the rest of its history: as Gemini replays it.
      write({
        method: 'session/update',
        params: {
          sessionId: s.id,
          update: {
            sessionUpdate: 'user_message_chunk',
            content: { type: 'text', text: '<session_context>\nThis is the Gemini CLI.\n</session_context>' },
          },
        },
      });
      result(msg.id, opened(s));
      for (const u of s.history) write({ method: 'session/update', params: { sessionId: s.id, update: u } });
      return;
    }
    case 'session/set_mode': {
      const s = sessions.get(p.sessionId);
      if (!s) return error(msg.id, 'Session not found', -32602);
      if (!MODES.some((m) => m.id === p.modeId)) return error(msg.id, `Invalid mode: ${p.modeId}`, -32602);
      modeUpdate(s, p.modeId);
      return result(msg.id, {});
    }
    case 'session/set_model': {
      const s = sessions.get(p.sessionId);
      if (!s) return error(msg.id, 'Session not found', -32602);
      s.model = p.modelId;
      save(s);
      return result(msg.id, {});
    }
    case 'session/cancel':
      if (running?.session === p.sessionId) running.cancelled = true;
      return;
    case 'session/prompt': {
      const s = sessions.get(p.sessionId);
      if (!s) return error(msg.id, 'Session not found', -32602);
      const text = (p.prompt ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      s.history.push({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } });
      const run = { session: s.id, cancelled: false };
      running = run;
      // A turn takes a moment, as a real one does.
      await sleep(40);
      // What it plays is picked by the user's own words: not those of Escouade's blocks before them.
      const own = text.replace(/<(instructions|escouade)>[\s\S]*?<\/\1>\n*/g, '').trim();
      if (own.includes('limite')) {
        running = null;
        return error(msg.id, 'Resource has been exhausted (e.g. check quota).', 429);
      }
      try {
        await turn(s, own, () => run.cancelled);
      } finally {
        running = null;
        save(s);
      }
      if (run.cancelled) return result(msg.id, { stopReason: 'cancelled' });
      return result(msg.id, {
        stopReason: 'end_turn',
        usage: { inputTokens: 1200, outputTokens: 20, cachedReadTokens: 200, totalTokens: 1220 },
        _meta: {
          quota: {
            token_count: { input_tokens: 1200, output_tokens: 20 },
            model_usage: [{ model: s.model, token_count: { input_tokens: 1200, output_tokens: 20 } }],
          },
        },
      });
    }
    default:
      if (msg.id !== undefined) error(msg.id, `"Method not found": ${msg.method}`, -32601);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  for (;;) {
    const nl = buf.indexOf('\n');
    if (nl < 0) return;
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    log({ dir: 'out', msg });
    onMessage(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
