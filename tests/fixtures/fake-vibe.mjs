#!/usr/bin/env node
// A fake `vibe-acp` of Mistral Vibe for the tests (ESC-266): ACP v1 (JSON-RPC 2.0, one message a line), as Mistral Vibe
// 3.0.3 speaks it (tests/fixtures/vibe/). The words of each message pick what it plays:
//   bonjour (or anything else) — a reply;  raisonnement — a reasoning, then a reply;
//   commande — `npm test` (bash), asking its permission in the agents `ask` and `accept-edits` (its permission names its
//   call alone, as Vibe's), unless « Always allow » allowed it before (`npm` in the `[tools.bash]` allowlist of the
//   config.toml of $VIBE_HOME, as Vibe writes it); refused, its call fails « Tool execution denied by approval
//   callback » and the fake waits for the turn to be cut (session/cancel), as Escouade cuts it;
//   fichier — notes.txt written in the agent's folder (write_file, its diff in its tool_call, named from the folder),
//   asking in the agent `ask`; « fichier dehors »: a file beside the folder;
//   question — ui.ask_user_question, then elicitation/create (a form), if the client asked for them;
//   propose un plan — its tasks (plan) and the plan as its last words;  approved — « The plan is approved »: carried out;
//   sous-agent — tasks (vibe.todo, plan) and a subagent (agents.spawn);  lent — a turn of 4 s (a command), stopped by
//   session/cancel;  modèle — says its model, thinking and agent;  confiance — says whether its folder is trusted
//   (trusted_folders.toml of $VIBE_HOME);  outil escouade <outil> — calls <outil> of Escouade's MCP server, by the entry
//   `escouade` its session was given (`mcpServers`) and its header, and says its answer.
//   compte — says the key it runs on (« Compte : clé …<its last four> », « Compte : clé de la machine » without one);
//   limite — the error -31001 of a rate limit, as Vibe gives it once it has tried again for 5 minutes.
// Each turn spends 0.0123 $ and 9 393 input tokens (3 200 from the cache), 73 output: its usage_update says what the
// session spent so far, as Vibe's, and session/load says it again first.
// `-p` (`vibe -p`, the texts written, ESC-267): its question read from its input, its answer printed alone
// (« Réponse de Vibe : <its last line> », a name « <two words>-vibe » for a <tache>), its call logged ({print: {argv,
// home, apiKey, question}}); a refused key prints Vibe's error on stderr, nothing on stdout.
// With --agent, it is its interface `vibe` (fake-vibe-tui.mjs). MISTRAL_API_KEY=cle-refusee-… : every prompt answers the error -31002 of a key Vibe refuses. Sessions are kept in
// $VIBE_HOME/logs/session/fake/<id>.json, replayed by session/load and copied by session/fork. Each message, and each
// launch ({launch: {argv, cwd, home, apiKey, telemetry, autoUpdate}}: the fake values of the tests), goes to
// $FAKE_VIBE_LOG when set.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
if (argv.includes('--version') || argv.includes('-v')) {
  console.log(`vibe-acp ${process.env.FAKE_VIBE_VERSION || '3.0.3'}`);
  process.exit(0);
}
if (argv.includes('--agent')) {
  // Its interface (« Vue Vibe », started with its agent): fake-vibe-tui.mjs, which ends the process itself.
  const { tui } = await import('./fake-vibe-tui.mjs');
  tui(argv);
  await new Promise(() => {});
}
const logFile = process.env.FAKE_VIBE_LOG;
const log = (entry) => logFile && fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
const home = process.env.VIBE_HOME || path.join(process.cwd(), '.fake-vibe');
const apiKey = process.env.MISTRAL_API_KEY || null;
log({
  launch: {
    argv,
    cwd: process.cwd(),
    home: process.env.VIBE_HOME ?? null,
    apiKey,
    telemetry: process.env.VIBE_ENABLE_TELEMETRY ?? null,
    autoUpdate: process.env.VIBE_ENABLE_AUTO_UPDATE ?? null,
  },
});
if (argv.includes('-p') || argv.includes('--prompt')) {
  let question = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (question += d));
  process.stdin.on('end', () => {
    log({ print: { argv, home: process.env.VIBE_HOME ?? null, apiKey, question } });
    if (apiKey?.startsWith('cle-refusee')) {
      process.stderr.write('Error: Invalid API key (from env var MISTRAL_API_KEY). Please check your API key and try again.\n');
      process.exit(1);
    }
    const task = question.match(/<(tache|task)>\s*([\s\S]*?)\s*<\/\1>/)?.[2];
    const name = task === undefined ? null : `${(task.toLowerCase().match(/[a-z]+/g) ?? ['tache']).slice(0, 2).join('-')}-vibe`;
    const key = apiKey ? `clé …${apiKey.slice(-4)}` : 'clé de la machine';
    const last = question.trim().split('\n').at(-1);
    process.stdout.write(`${name ?? (last === 'compte' ? `Compte : ${key}` : `Réponse de Vibe : ${last}`)}\n`);
    process.exit(0);
  });
  await new Promise(() => {});
}
const sessionsDir = path.join(home, 'logs', 'session', 'fake');
fs.mkdirSync(sessionsDir, { recursive: true });
const configFile = path.join(home, 'config.toml');
const readConfig = () => {
  try {
    return fs.readFileSync(configFile, 'utf8');
  } catch {
    return '';
  }
};
const allowed = (cmd) => new RegExp(`allowlist = \\[[^\\]]*"${cmd}"`).test(readConfig());
function allowAlways(cmd) {
  // As Vibe writes it: the list of its shell tool, in the config.toml of its VIBE_HOME.
  const list = ['cat', 'ls', 'git status', cmd].map((c) => `"${c}"`).join(', ');
  fs.writeFileSync(configFile, `[tools.bash]\nallowlist = [${list}]\n`);
}
const trusted = (cwd) => {
  try {
    const t = fs.readFileSync(path.join(home, 'trusted_folders.toml'), 'utf8');
    return t.includes(`'${cwd.replace(/\//g, path.sep)}'`) || t.includes(`'${cwd}'`);
  } catch {
    return false;
  }
};

const MODES = [
  { id: 'ask', name: 'Ask', description: 'Requires approval for tool executions' },
  { id: 'accept-edits', name: 'Accept Edits', description: 'Auto-approves file edits only' },
  { id: 'auto-approve', name: 'Auto Approve', description: 'Auto-approves all tool executions' },
];
const MODELS = [
  { value: 'mistral-medium-3.5', name: 'Mistral Medium 3.5', description: 'mistral-vibe-cli-latest' },
  { value: 'devstral-2', name: 'Devstral 2', description: 'devstral-latest' },
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
let elicitation = false;
const sessions = new Map();
const fileOf = (id) => path.join(sessionsDir, `${id}.json`);
function save(s) {
  const kept = { id: s.id, cwd: s.cwd, history: s.history, model: s.model, thinking: s.thinking, spent: s.spent };
  fs.writeFileSync(fileOf(s.id), JSON.stringify(kept));
  // Vibe's store keeps a session once something was said in it (an empty one is not kept): its journal, where its
  // interface resumes it (fake-vibe-tui.mjs).
  if (s.history.length) {
    const journal = path.join(home, 'logs', 'session', 'unified', s.id, 'journal');
    if (!fs.existsSync(journal)) {
      fs.mkdirSync(journal, { recursive: true });
      fs.writeFileSync(path.join(journal, '0000000000000001.jsonl'), '');
    }
  }
}
// What a session has spent so far, as Vibe's usage_update says it.
const NONE_SPENT = { cost: 0, prompt: 0, cached: 0, completion: 0 };
function usage(s) {
  const t = s.spent ?? NONE_SPENT;
  const u = {
    sessionUpdate: 'usage_update',
    used: t.prompt + t.completion,
    size: 202144,
    _meta: { promptTokens: t.prompt, completionTokens: t.completion, cachedTokens: t.cached, totalTokens: t.prompt + t.completion },
  };
  if (t.cost > 0) u.cost = { amount: t.cost, currency: 'USD' };
  write({ method: 'session/update', params: { sessionId: s.id, update: u } });
}
function spend(s) {
  const t = s.spent ?? NONE_SPENT;
  s.spent = { cost: t.cost + 0.0123, prompt: t.prompt + 9393, cached: t.cached + 3200, completion: t.completion + 73 };
  usage(s);
}
function opened(s) {
  return {
    modes: { currentModeId: s.mode, availableModes: MODES },
    configOptions: [
      {
        id: 'mode',
        name: 'Session Mode',
        category: 'mode',
        type: 'select',
        currentValue: s.mode,
        options: MODES.map((m) => ({ value: m.id, name: m.name, description: m.description })),
      },
      { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: s.model, options: MODELS },
      {
        id: 'thinking',
        name: 'Thinking',
        category: 'thinking',
        type: 'select',
        currentValue: s.thinking,
        options: [
          { value: 'off', name: 'Off' },
          { value: 'high', name: 'High' },
        ],
      },
    ],
    _meta: { workspace_trust: { status: trusted(s.cwd) ? 'trusted' : 'untrusted', details: null } },
  };
}
function update(s, u, keep = true) {
  write({ method: 'session/update', params: { sessionId: s.id, update: u } });
  if (keep && /chunk$/.test(u.sessionUpdate)) s.history.push(u);
}
let messageNo = 0;
const say = (s, text) => {
  const messageId = `assistant-${++messageNo}`;
  for (const piece of text.match(/.{1,12}/gsu) ?? [])
    update(s, { sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text: piece } });
};
const think = (s, text) =>
  update(s, { sessionUpdate: 'agent_thought_chunk', messageId: `reasoning-${++messageNo}-0`, content: { type: 'text', text } });
const callId = () => `effect-${crypto.randomUUID()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPTS = [
  { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'allow_always', name: 'Allow for remainder of this session', kind: 'allow_always' },
  { optionId: 'allow_always_permanent', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'reject_once', name: 'Deny', kind: 'reject_once' },
];
/** Its permission names its call alone, as Vibe's. */
async function permission(s, id) {
  const r = await ask('session/request_permission', { sessionId: s.id, toolCall: { toolCallId: id }, options: OPTS });
  return r?.outcome?.optionId ?? 'reject_once';
}
const denied = (s, id, meta) =>
  update(s, {
    sessionUpdate: 'tool_call_update',
    toolCallId: id,
    status: 'failed',
    content: [{ type: 'content', content: { type: 'text', text: 'Tool execution denied by approval callback' } }],
    _meta: meta,
  });

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
  await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'vibe', version: '0' } }, 1);
  await call('notifications/initialized', {});
  const result = await call('tools/call', { name: tool, arguments: {} }, 2);
  return (result?.content ?? []).map((c) => c.text ?? '').join('');
}

async function turn(s, words, cancelled) {
  if (s.history.length <= 1) update(s, { sessionUpdate: 'session_info_update', title: words.slice(0, 30) }, false);
  if (words.startsWith('outil escouade ')) {
    const tool = words.slice('outil escouade '.length).trim();
    const entry = s.mcp.find((m) => m.name === 'escouade');
    if (!entry) return say(s, 'Pas de serveur escouade dans la session.');
    try {
      say(s, `Escouade a répondu : ${await escouadeTool(entry, tool)}`);
    } catch (e) {
      say(s, `Escouade a refusé : ${e.message}`);
    }
    return;
  }
  if (words === 'compte') return say(s, `Compte : ${apiKey ? `clé …${apiKey.slice(-4)}` : 'clé de la machine'}`);
  if (words.includes('raisonnement')) {
    think(s, 'Je réfléchis à la question posée.');
    say(s, 'Voici ma réponse réfléchie.');
  } else if (words.includes('commande')) {
    const id = callId();
    const meta = { tool_name: 'bash', effect_kind: 'shell' };
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: id,
      title: 'bash: npm test',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { command: 'npm test' },
      _meta: meta,
    });
    let ok = s.mode === 'auto-approve' || allowed('npm');
    if (!ok) {
      const option = await permission(s, id);
      if (option === 'allow_always_permanent') allowAlways('npm');
      ok = option.startsWith('allow');
    }
    if (ok) {
      update(s, {
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        kind: 'execute',
        status: 'completed',
        rawOutput: { stdout: '1 test passed\n', stderr: '', output: '1 test passed\n', returncode: 0, truncated: false },
        _meta: meta,
      });
      say(s, 'La commande a marché.');
    } else {
      denied(s, id, meta);
      // Vibe would try again under another form: Escouade cuts the turn first.
      for (let i = 0; i < 50 && !cancelled(); i++) await sleep(20);
      if (!cancelled()) say(s, 'Commande refusée.');
    }
  } else if (words.includes('fichier')) {
    const outside = words.includes('dehors');
    const file = outside ? path.resolve(s.cwd, '..', 'vibe-dehors.txt') : path.join(s.cwd, 'notes.txt');
    const named = outside ? file : 'notes.txt';
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const after = (before ?? '') + 'note de Vibe\n';
    const id = callId();
    const meta = { tool_name: 'write_file', effect_kind: 'file_write' };
    const diff = (p) => [{ type: 'diff', path: p, ...(before === null ? {} : { oldText: before }), newText: after }];
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: id,
      title: `Writing ${path.basename(file)}`,
      kind: 'edit',
      status: 'in_progress',
      content: diff(named),
      locations: [{ path: file }],
      rawInput: { filePath: named, content: after },
      _meta: meta,
    });
    let ok = s.mode !== 'ask';
    if (!ok) ok = (await permission(s, id)).startsWith('allow');
    if (ok) {
      fs.writeFileSync(file, after);
      update(s, {
        sessionUpdate: 'tool_call_update',
        toolCallId: id,
        kind: 'edit',
        status: 'completed',
        content: [...diff(file), { type: 'content', content: { type: 'text', text: `Wrote ${path.basename(file)}` } }],
        rawOutput: { filePath: file, content: after, fileExisted: before !== null },
        _meta: meta,
      });
      say(s, `J’ai modifié ${path.basename(file)}.`);
    } else {
      denied(s, id, meta);
      for (let i = 0; i < 50 && !cancelled(); i++) await sleep(20);
    }
  } else if (words.includes('question')) {
    if (!elicitation) return say(s, 'Je n’ai pas d’outil pour te poser une question.');
    const id = callId();
    const meta = { tool_name: 'ui.ask_user_question', effect_kind: 'user_question' };
    const question = 'Quelle couleur préfères-tu ?';
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: id,
      title: `Asking: ${question}`,
      kind: 'other',
      status: 'in_progress',
      rawInput: {
        questions: [{ question, header: '', options: [{ label: 'rouge' }, { label: 'bleu' }], multiSelect: false, hideOther: false }],
      },
      _meta: meta,
    });
    const r = await ask('elicitation/create', {
      sessionId: s.id,
      toolCallId: 'PGrEErflE',
      message: 'User input required',
      mode: 'form',
      requestedSchema: {
        properties: {
          q0: {
            description: question,
            oneOf: [
              { const: 'rouge', title: 'rouge' },
              { const: 'bleu', title: 'bleu' },
            ],
            type: 'string',
          },
        },
        required: ['q0'],
      },
    });
    const answer = r?.action === 'accept' ? r.content?.q0 : null;
    update(s, {
      sessionUpdate: 'tool_call_update',
      toolCallId: id,
      kind: 'other',
      status: answer ? 'completed' : 'failed',
      rawOutput: { answers: answer ? [{ question, answer, isOther: false }] : [], cancelled: !answer },
      _meta: meta,
    });
    say(s, answer ? `Tu as choisi ${answer}.` : 'Pas de réponse.');
  } else if (words.includes('propose un plan')) {
    const todos = ['Ajouter la fonction sub', 'Écrire son test'];
    update(s, { sessionUpdate: 'plan', entries: todos.map((content) => ({ content, priority: 'medium', status: 'pending' })) }, false);
    think(s, 'Je regarde le code avant de proposer.');
    say(s, '# Ajouter sub\n\n1. Ajouter la fonction sub.\n2. Écrire son test.');
  } else if (words.includes('approved')) {
    say(s, 'Plan approuvé, je le mets en œuvre.');
  } else if (words.includes('sous-agent')) {
    const todo = callId();
    const tasks = [
      { id: '1', content: 'Lire le README', status: 'in_progress', priority: 'medium' },
      { id: '2', content: 'Résumer', status: 'pending', priority: 'medium' },
    ];
    const todoMeta = { tool_name: 'vibe.todo', effect_kind: 'todo' };
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: todo,
      title: 'Writing 2 todos',
      kind: 'other',
      status: 'in_progress',
      rawInput: { action: 'write', todos: tasks },
      _meta: todoMeta,
    });
    update(s, { sessionUpdate: 'plan', entries: tasks.map(({ content, priority, status }) => ({ content, priority, status })) }, false);
    update(s, { sessionUpdate: 'tool_call_update', toolCallId: todo, kind: 'other', status: 'completed', _meta: todoMeta });
    const task = callId();
    const meta = { tool_name: 'agents.spawn', effect_kind: 'subagent', agent: 'generic', task: 'Résumer le README' };
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: task,
      title: 'Starting readme_reader',
      kind: 'think',
      status: 'in_progress',
      rawInput: { task: 'Résumer le README', agent: 'generic' },
      _meta: meta,
    });
    await sleep(30);
    update(s, {
      sessionUpdate: 'tool_call_update',
      toolCallId: task,
      kind: 'think',
      status: 'completed',
      title: 'Starting readme_reader',
      content: [{ type: 'content', content: { type: 'text', text: 'Le README présente le projet.' } }],
      _meta: { ...meta, child_session_id: `child-${crypto.randomBytes(12).toString('hex')}` },
    });
    update(
      s,
      { sessionUpdate: 'plan', entries: tasks.map(({ content, priority }) => ({ content, priority, status: 'completed' })) },
      false,
    );
    say(s, 'Tâches faites, le sous-agent a résumé le README.');
  } else if (words.includes('lent')) {
    say(s, 'Je commence un long travail…');
    const id = callId();
    const long = /lent (\d+)s/.exec(words)?.[1];
    update(s, {
      sessionUpdate: 'tool_call',
      toolCallId: id,
      title: 'bash: sleep 4',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { command: 'sleep 4' },
      _meta: { tool_name: 'bash', effect_kind: 'shell' },
    });
    const tenths = Number(long ?? 4) * 10;
    for (let i = 0; i < tenths && !cancelled(); i++) await sleep(100);
    if (cancelled()) return;
    update(s, {
      sessionUpdate: 'tool_call_update',
      toolCallId: id,
      status: 'completed',
      rawOutput: { stdout: '', stderr: '', returncode: 0 },
      _meta: { tool_name: 'bash', effect_kind: 'shell' },
    });
    say(s, 'Long travail fini.');
  } else if (words.includes('modèle')) {
    say(s, `Je tourne sur ${s.model}, réflexion ${s.thinking}, agent ${s.mode}.`);
  } else if (words.includes('confiance')) {
    say(s, trusted(s.cwd) ? 'Dossier de confiance.' : 'Dossier sans confiance.');
  } else {
    say(s, `Vibe a reçu : ${words}`);
  }
}

// ----- the protocol -----
let running = null;
function newSession(cwd, mcp, from) {
  const s = {
    id: crypto.randomUUID(),
    cwd,
    history: from ? [...from.history] : [],
    mode: 'accept-edits',
    model: from?.model ?? 'mistral-medium-3.5',
    thinking: from?.thinking ?? 'high',
    mcp: mcp ?? [],
  };
  sessions.set(s.id, s);
  save(s);
  // Its usage first, as Vibe sends it (a copy's what its original spent).
  s.spent = from?.spent ?? NONE_SPENT;
  usage(s);
  return s;
}
function loaded(id, cwd, mcp) {
  if (sessions.has(id)) return sessions.get(id);
  if (!fs.existsSync(fileOf(id))) return null;
  const kept = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
  const s = { ...kept, cwd, mode: 'accept-edits', mcp: mcp ?? [] };
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
      elicitation = !!p.clientCapabilities?.elicitation?.form;
      return result(msg.id, {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, audio: false, embeddedContext: true },
          sessionCapabilities: { list: {}, fork: {}, close: {} },
        },
        authMethods: [{ id: 'browser-auth', name: 'Sign in through Mistral AI Studio' }],
        agentInfo: { name: '@mistralai/mistral-vibe', title: 'Mistral Vibe', version: '3.0.3' },
      });
    case 'session/new': {
      const s = newSession(p.cwd, p.mcpServers);
      return result(msg.id, { sessionId: s.id, ...opened(s) });
    }
    case 'session/load': {
      const s = loaded(p.sessionId, p.cwd, p.mcpServers);
      if (!s) return error(msg.id, `Session not found: ${p.sessionId}`);
      for (const u of s.history) write({ method: 'session/update', params: { sessionId: s.id, update: u } });
      usage(s);
      return result(msg.id, opened(s));
    }
    case 'session/fork': {
      const from = loaded(p.sessionId, p.cwd, p.mcpServers);
      if (!from) return error(msg.id, `Session not found: ${p.sessionId}`);
      const s = newSession(p.cwd, p.mcpServers, from);
      return result(msg.id, { sessionId: s.id, ...opened(s) });
    }
    case 'session/close':
      sessions.delete(p.sessionId);
      return result(msg.id, {});
    case 'session/set_mode':
    case 'session/set_config_option': {
      const s = sessions.get(p.sessionId);
      if (!s) return error(msg.id, 'Session not found');
      const key = msg.method === 'session/set_mode' ? 'mode' : p.configId;
      const value = msg.method === 'session/set_mode' ? p.modeId : p.value;
      if (key === 'mode') {
        if (!MODES.some((m) => m.id === value)) return error(msg.id, `Unknown mode ${value}`);
        s.mode = value;
        update(s, { sessionUpdate: 'current_mode_update', currentModeId: value }, false);
      } else if (key === 'model') {
        if (!MODELS.some((m) => m.value === value)) return error(msg.id, `Unknown model ${value}`);
        s.model = value;
      } else if (key === 'thinking') {
        if (!['off', 'high'].includes(value)) return error(msg.id, `Unknown thinking ${value}`);
        s.thinking = value;
      }
      save(s);
      return result(msg.id, msg.method === 'session/set_mode' ? {} : { configOptions: opened(s).configOptions });
    }
    case 'session/list':
      return result(msg.id, { sessions: [...sessions.values()].map((s) => ({ sessionId: s.id, cwd: s.cwd })) });
    case 'session/cancel':
      if (running?.session === p.sessionId) running.cancelled = true;
      return;
    case 'session/prompt': {
      const s = sessions.get(p.sessionId);
      if (!s) return error(msg.id, 'Session not found');
      if (apiKey?.startsWith('cle-refusee'))
        return error(msg.id, 'Invalid API key (from env var MISTRAL_API_KEY). Please check your API key and try again.', -31002);
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
      const own = text.replace(/<(instructions|escouade_plan_mode)>[\s\S]*?<\/\1>\n?/g, '').trim();
      if (own.includes('limite')) {
        running = null;
        save(s);
        return error(msg.id, `Rate limit exceeded for mistral (model: ${s.model}).`, -31001);
      }
      try {
        await turn(s, own, () => run.cancelled);
      } finally {
        running = null;
        spend(s);
        save(s);
      }
      const t = s.spent;
      return result(msg.id, {
        stopReason: run.cancelled ? 'cancelled' : 'end_turn',
        usage: { totalTokens: t.prompt + t.completion, inputTokens: t.prompt, outputTokens: t.completion, cachedReadTokens: t.cached },
      });
    }
    default:
      if (msg.id !== undefined) error(msg.id, `Method not found: ${msg.method}`, -32601);
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
