#!/usr/bin/env node
// A fake `codex app-server` (Codex 0.163.0's JSON-RPC over stdio, one message a line), as the real
// streams of tests/fixtures/codex/ show it: what the conformance bench (src-tauri/src/engine/codex/bench.rs)
// and the end-to-end tests drive instead of Codex.
//
// `codex --version` says its version; `codex app-server …` serves; anything else is its interface (« Vue Codex »,
// tests/fixtures/fake-codex-tui.mjs). The app-server lists the hooks of its `-c hooks.<Event>=…` options
// (`hooks/list`: their keys and hashes, trusted when a `-c hooks.state=…` option says so), and writes the
// rollout of a thread it starts or forks (its `session_meta`), where its interface finds it to resume it.
// It answers `initialize`, `thread/start`
// (a new thread `thr-<pid>-<n>`), `thread/resume` (any thread but one whose id starts with "perdu": refused),
// `thread/fork` (a new thread), `model/list`, `account/rateLimits/read`, `turn/start`, `turn/steer`,
// `turn/interrupt`, `thread/name/set`. What a turn plays is picked by its message (French words, as the
// scenarios of the fake `claude`):
// - "raisonnement": a reasoning (its summary by deltas), then a reply;
// - "commande": a command (`rm -rf build`) that asks its approval (item/commandExecution/requestApproval):
//   run once accepted, declined otherwise;
// - "git": `git add -A` asked the same way (the sandbox keeps `.git` out), in the agent's folder;
// - "fichier": a change of src/app.ts (written for real when it is there: `const a = 2;`), with its diff;
// - "question": a question (item/tool/requestUserInput), its answer said back;
// - "propose un plan", or the turn in the mode Plan: a plan (item `plan`), the turn over on it;
//   "Mets le plan en œuvre" / "Implement the plan": its work, a plain reply;
// - "étapes": the plan tool's three steps (turn/plan/updated), done one after the other;
// - "sous-agent": a subagent (subAgentActivity, its own thread and turn, its report), waited for;
// - "lent": a turn that lasts 30 s, unless interrupted (turn/interrupt) or steered (turn/steer: its message
//   said back, and the turn ends);
// - "limite": a turn stopped by the usage limit (usageLimitExceeded), the quota at 100 %;
// - a message said in a voice conversation (<escouade-voice>): a reply with its passage to be read aloud;
// - anything else: « Bonjour, tu as dit : <message> ».
// A thread started with `developerInstructions` (a ticket's protocol) plays the ticket's agent, as the fake
// `claude` does: <key>.txt written ("Boucle n"), and each turn ends with an ```escouade report; [ok] in the
// ticket's title meets every criterion at once, otherwise criterion n is met from loop n on.
// FAKE_CODEX_LOG: a file each launch appends to: {"launch": {argv, cwd, pid, codexHome, token}} (token: whether
// ESCOUADE_MCP_TOKEN was given), then {"in": <message>} for each message it is sent.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const VERSION = '0.163.0';
const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  process.stdout.write(`codex-cli ${VERSION}\n`);
  process.exit(0);
}
const LOG = process.env.FAKE_CODEX_LOG;
const log = (entry) => LOG && fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
log({
  launch: {
    argv,
    cwd: process.cwd(),
    pid: process.pid,
    codexHome: process.env.CODEX_HOME ?? null,
    token: !!process.env.ESCOUADE_MCP_TOKEN,
    tui: argv[0] !== 'app-server',
  },
});
const ui = await import('./fake-codex-tui.mjs');
if (argv[0] !== 'app-server') {
  ui.tui(argv, log);
  // The rest is the app-server's: never reached.
  await new Promise(() => {});
}

const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const notify = (method, params) => out({ method, params });
let serial = 0;
const id = (prefix) => `${prefix}-${process.pid}-${++serial}`;

// The thread of this process, and what it was started with.
let thread = null;
let instructions = '';
let cwd = process.cwd();
// The turn under way: its id, its mode, what it waits for.
let turn = null;
let mode = 'default';
// Requests of ours waiting for their answer, by id.
let nextRequest = 0;
const waiting = new Map();
// Ticket's agent: its asked question once.
let loopsDone = 0;

function threadObject(tid, extra = {}) {
  return {
    id: tid,
    sessionId: tid,
    forkedFromId: null,
    parentThreadId: null,
    preview: '',
    ephemeral: false,
    modelProvider: 'openai',
    model: 'gpt-6-luna',
    cwd,
    cliVersion: VERSION,
    status: { type: 'idle' },
    turns: [],
    ...extra,
  };
}

const MODELS = [
  {
    id: 'gpt-6-luna',
    model: 'gpt-6-luna',
    displayName: 'GPT-6-Luna',
    description: 'Fast and affordable model for easier tasks.',
    hidden: false,
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'].map((e) => ({ reasoningEffort: e, description: e })),
    defaultReasoningEffort: 'medium',
    inputModalities: ['text', 'image'],
    isDefault: true,
  },
  {
    id: 'gpt-5.6-terra',
    model: 'gpt-5.6-terra',
    displayName: 'GPT-5.6-Terra',
    description: 'Older balanced model for straightforward work.',
    hidden: false,
    supportedReasoningEfforts: ['low', 'medium', 'high'].map((e) => ({ reasoningEffort: e, description: e })),
    defaultReasoningEffort: 'medium',
    inputModalities: ['text'],
    isDefault: false,
  },
];

const RATE = (used) => ({
  limitId: 'codex',
  primary: { usedPercent: used, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
  secondary: { usedPercent: Math.min(used, 40), windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 86400 },
  credits: { hasCredits: false, unlimited: false, balance: null },
  planType: 'plus',
  rateLimitReachedType: used >= 100 ? 'rate_limit_reached' : null,
});

/** A request of ours to the client (an approval, a question): its answer. */
function ask(method, params) {
  const rid = nextRequest++;
  out({ method, id: rid, params });
  return new Promise((resolve) => waiting.set(rid, { resolve, method }));
}

/** Resolves when the turn is interrupted (or steered, with its input), else after `ms`. */
function pause(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true }), ms);
    turn.wake = (why) => {
      clearTimeout(timer);
      resolve(why);
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function at(params = {}) {
  return { threadId: thread, turnId: turn.id, ...params };
}

function item(started, it, tid = thread, turnId = turn.id) {
  notify(started ? 'item/started' : 'item/completed', { item: it, threadId: tid, turnId });
}

/** A message of the agent, by deltas, then whole. */
async function say(text, phase = 'final_answer', tid = thread, turnId = turn.id) {
  const mid = id('msg');
  item(true, { type: 'agentMessage', id: mid, text: '', phase }, tid, turnId);
  const words = text.match(/\S+\s*/g) ?? [text];
  for (const w of words) notify('item/agentMessage/delta', { threadId: tid, turnId, itemId: mid, delta: w });
  item(false, { type: 'agentMessage', id: mid, text, phase }, tid, turnId);
}

function tokens(tid, n) {
  const total = {
    totalTokens: 1200 * n,
    inputTokens: 1000 * n,
    cachedInputTokens: 400 * n,
    cacheWriteInputTokens: 0,
    outputTokens: 200 * n,
    reasoningOutputTokens: 0,
  };
  notify('thread/tokenUsage/updated', {
    threadId: tid,
    turnId: turn.id,
    tokenUsage: { total, last: { ...total, inputTokens: 1000 }, modelContextWindow: 258400 },
  });
}

let usage = 0;

function command(text, cmd) {
  return {
    type: 'commandExecution',
    id: id('exec'),
    command: `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '${cmd}'`,
    cwd,
    processId: null,
    source: 'agent',
    status: 'inProgress',
    commandActions: [{ type: 'unknown', command: cmd }],
    aggregatedOutput: null,
    exitCode: null,
    durationMs: null,
  };
}

async function approved(cmd, reason) {
  const it = command('', cmd);
  item(true, it);
  notify('thread/status/changed', { threadId: thread, status: { type: 'active', activeFlags: ['waitingOnApproval'] } });
  const answer = await ask(
    'item/commandExecution/requestApproval',
    at({
      kind: 'command',
      itemId: it.id,
      startedAtMs: Date.now(),
      environmentId: 'local',
      reason,
      command: it.command,
      cwd,
      commandActions: it.commandActions,
      proposedExecpolicyAmendment: cmd.split(' '),
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    }),
  );
  notify('thread/status/changed', { threadId: thread, status: { type: 'active', activeFlags: [] } });
  const accepted = answer?.decision === 'accept' || answer?.decision === 'acceptForSession';
  item(false, {
    ...it,
    status: accepted ? 'completed' : 'declined',
    aggregatedOutput: accepted ? `${cmd} : fait\n` : null,
    exitCode: accepted ? 0 : null,
    durationMs: 12,
  });
  return accepted;
}

function ticketReport(text) {
  const key = instructions.match(/ticket ([A-Z]+-\d+)/)?.[1] ?? 'TIC-0';
  const count = Number(instructions.match(/(?:Critères d'acceptation|Acceptance criteria) \((\d+)\)/)?.[1] ?? 1);
  const loop = Number(text.match(/(?:Boucle|Loop) (\d+)\//)?.[1] ?? ++loopsDone);
  const all = `${instructions}\n${text}`;
  const file = `${key.toLowerCase()}.txt`;
  fs.writeFileSync(path.join(cwd, file), `Boucle ${loop}\n`);
  const met = (n) => all.includes('[ok]') || n <= loop;
  const report = {
    criteres: Array.from({ length: count }, (_, i) => ({
      n: i + 1,
      ok: met(i + 1),
      note: met(i + 1) ? 'vérifié par Codex' : `reste le critère ${i + 1}`,
    })),
    avancement: [`Fichier ${file} écrit par Codex`, `Boucle ${loop} faite`],
  };
  return { file, text: `Boucle ${loop} faite.\n\n\`\`\`escouade\n${JSON.stringify(report)}\n\`\`\`` };
}

async function play(text) {
  const lower = text.toLowerCase();
  if (/Critères d'acceptation|Acceptance criteria/.test(instructions)) {
    const { file, text: reply } = ticketReport(text);
    const change = { path: path.join(cwd, file), kind: { type: 'add' }, diff: 'Boucle\n' };
    const pid = id('patch');
    item(true, { type: 'fileChange', id: pid, changes: [change], status: 'inProgress' });
    item(false, { type: 'fileChange', id: pid, changes: [change], status: 'completed' });
    await say(reply);
    return 'completed';
  }
  if (text.includes('<escouade-voice>')) {
    const said = text.split('<escouade-voice>')[0].trim();
    await say(
      `J'ai bien noté : « ${said} ».\n\n- détail technique : \`src/app.rs\`, ligne 42\n\n<spoken>C'est noté, je m'en occupe avec Codex.</spoken>`,
    );
    return 'completed';
  }
  if (lower.includes('en œuvre') || lower.includes('implement the plan')) {
    await say('Plan mis en œuvre.');
    return 'completed';
  }
  if (lower.includes('limite')) {
    usage = 100;
    notify('account/rateLimits/updated', { rateLimits: RATE(100) });
    const error = { message: "You've hit your usage limit.", codexErrorInfo: 'usageLimitExceeded', additionalDetails: null };
    notify('error', at({ error, willRetry: false }));
    return { status: 'failed', error };
  }
  if (lower.includes('raisonnement')) {
    const rid = id('rs');
    item(true, { type: 'reasoning', id: rid, summary: [], content: [] });
    notify('item/reasoning/summaryPartAdded', at({ itemId: rid, summaryIndex: 0 }));
    for (const d of ['**Deux pistes**', ' ; la seconde est la bonne.'])
      notify('item/reasoning/summaryTextDelta', at({ itemId: rid, delta: d, summaryIndex: 0 }));
    item(false, { type: 'reasoning', id: rid, summary: ['**Deux pistes** ; la seconde est la bonne.'], content: [] });
    await say('Réponse réfléchie.');
    return 'completed';
  }
  if (lower.includes('commande')) {
    await say('Je supprime le dossier build.', 'commentary');
    const ok = await approved('rm -rf build', 'Autorisez-vous la suppression du dossier build ?');
    await say(ok ? 'Commande exécutée.' : 'Compris, je ne la lance pas.');
    return 'completed';
  }
  if (/\bgit\b/.test(lower)) {
    const ok = await approved('git add -A', "Autorisez-vous l'écriture dans l'index Git partagé ?");
    await say(ok ? 'Fichiers ajoutés à git.' : 'git non lancé.');
    return 'completed';
  }
  if (lower.includes('fichier')) {
    const file = path.join(cwd, 'src', 'app.ts');
    if (fs.existsSync(file)) fs.writeFileSync(file, 'const a = 2;\n');
    const change = { path: file, kind: { type: 'update', move_path: null }, diff: '@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n' };
    const pid = id('patch');
    item(true, { type: 'fileChange', id: pid, changes: [change], status: 'inProgress' });
    item(false, { type: 'fileChange', id: pid, changes: [change], status: 'completed' });
    notify('turn/diff/updated', at({ diff: `diff --git a/src/app.ts b/src/app.ts\n${change.diff}` }));
    await say('Fichier modifié.');
    return 'completed';
  }
  if (lower.includes('question')) {
    const call = id('call');
    const answer = await ask(
      'item/tool/requestUserInput',
      at({
        itemId: call,
        questions: [
          {
            id: 'base',
            header: 'Base',
            question: 'Quelle base de données ?',
            isOther: true,
            isSecret: false,
            options: [
              { label: 'PostgreSQL', description: 'La plus complète.' },
              { label: 'SQLite', description: 'Un fichier, sans serveur.' },
            ],
          },
        ],
        isBlocking: true,
        autoResolutionMs: null,
      }),
    );
    await say(`Choix retenu : ${answer?.answers?.base?.answers?.join(', ') ?? '(aucun)'}`);
    return 'completed';
  }
  if (mode === 'plan' || lower.includes('propose un plan')) {
    const pid = `${turn.id}-plan`;
    const plan = '## Script de la date\n\n### Modifications\n- Ajouter `date.py`.\n\n### Vérification\n- Lancer le script.\n';
    item(true, { type: 'plan', id: pid, text: '' });
    for (const d of plan.match(/.{1,12}/gs)) notify('item/plan/delta', at({ itemId: pid, delta: d }));
    item(false, { type: 'plan', id: pid, text: plan });
    return 'completed';
  }
  if (lower.includes('étapes')) {
    const steps = ['Écrire le fichier', 'Le commiter', 'Vérifier'];
    for (let i = 0; i <= steps.length; i++) {
      notify(
        'turn/plan/updated',
        at({
          explanation: null,
          plan: steps.map((step, j) => ({ step, status: j < i ? 'completed' : j === i ? 'inProgress' : 'pending' })),
        }),
      );
      await sleep(20);
    }
    await say('Les trois étapes sont faites.');
    return 'completed';
  }
  if (lower.includes('sous-agent')) {
    const child = id('thr-child');
    const call = id('call');
    const started = {
      type: 'subAgentActivity',
      model: 'gpt-6-luna',
      reasoningEffort: 'medium',
      id: call,
      kind: 'started',
      agentThreadId: child,
      agentPath: '/root/cause_du_bug',
    };
    item(true, started);
    item(false, started);
    const childTurn = id('turn');
    notify('turn/started', { threadId: child, turn: { id: childTurn, rootTurnId: turn.id, items: [], status: 'inProgress' } });
    const wait = {
      type: 'collabAgentToolCall',
      id: id('call'),
      tool: 'wait',
      status: 'inProgress',
      senderThreadId: thread,
      receiverThreadIds: [],
      agentsStates: {},
    };
    item(true, wait);
    const cmd = command('', 'Get-Content src/filtre.ts');
    item(true, cmd, child, childTurn);
    item(false, { ...cmd, status: 'completed', aggregatedOutput: 'refuse(pdf)\n', exitCode: 0 }, child, childTurn);
    tokens(child, 1);
    await say('Cause trouvée : le filtre refuse les PDF.', 'final_answer', child, childTurn);
    const done = {
      type: 'subAgentActivity',
      model: null,
      reasoningEffort: null,
      id: `subagent-completed-${childTurn}`,
      kind: 'completed',
      agentThreadId: child,
      agentPath: '/root/cause_du_bug',
    };
    item(true, done);
    notify('turn/completed', {
      threadId: child,
      turn: { id: childTurn, rootTurnId: turn.id, items: [], status: 'completed', error: null, durationMs: 40 },
    });
    item(false, done);
    item(false, { ...wait, status: 'completed' });
    await say('Rapport reçu : le filtre refuse les PDF.');
    return 'completed';
  }
  if (lower.includes('lent')) {
    await say('Je commence…', 'commentary');
    const why = await pause(30_000);
    if (why?.steer) {
      await say(`J'ai bien reçu en cours de route : ${why.steer}`);
      return 'completed';
    }
    return why?.interrupt ? 'interrupted' : 'completed';
  }
  await say(`Bonjour, tu as dit : ${text}`);
  return 'completed';
}

async function startTurn(params) {
  const text = (params.input ?? [])
    .filter((i) => i.type === 'text')
    .map((i) => i.text)
    .join('\n');
  mode = params.collaborationMode?.mode ?? 'default';
  const tid = id('turn');
  turn = { id: tid, started: Date.now(), wake: null };
  notify('thread/settings/updated', {
    threadId: thread,
    threadSettings: {
      cwd,
      approvalPolicy: params.approvalPolicy ?? 'on-request',
      approvalsReviewer: params.approvalsReviewer ?? 'user',
      sandboxPolicy: params.sandboxPolicy ?? { type: 'workspaceWrite' },
      model: params.model ?? 'gpt-6-luna',
      effort: params.effort ?? null,
      collaborationMode: params.collaborationMode ?? { mode: 'default', settings: { model: params.model } },
    },
  });
  notify('thread/status/changed', { threadId: thread, status: { type: 'active', activeFlags: [] } });
  notify('turn/started', { threadId: thread, turn: { id: tid, rootTurnId: tid, items: [], status: 'inProgress', error: null } });
  item(true, { type: 'userMessage', id: id('user'), content: params.input ?? [] });
  setImmediate(async () => {
    const end = await play(text);
    tokens(thread, ++serial);
    notify('account/rateLimits/updated', { rateLimits: RATE(usage || 12) });
    const status = typeof end === 'string' ? end : end.status;
    const error = typeof end === 'string' ? null : end.error;
    notify('thread/status/changed', { threadId: thread, status: { type: 'idle' } });
    notify('turn/completed', {
      threadId: thread,
      turn: { id: tid, rootTurnId: tid, items: [], status, error, durationMs: Date.now() - turn.started },
    });
    turn = null;
  });
  return { turn: { id: tid, rootTurnId: tid, items: [], status: 'inProgress', error: null } };
}

function handle(msg) {
  log({ in: msg });
  // An answer to one of our requests.
  if (msg.method === undefined) {
    const w = waiting.get(msg.id);
    if (w) {
      waiting.delete(msg.id);
      notify('serverRequest/resolved', { threadId: thread, requestId: msg.id });
      w.resolve(msg.result ?? null);
    }
    return;
  }
  const p = msg.params ?? {};
  const reply = (result) => msg.id !== undefined && out({ id: msg.id, result });
  const refuse = (message) => msg.id !== undefined && out({ id: msg.id, error: { code: -32600, message } });
  switch (msg.method) {
    case 'initialize':
      return reply({
        userAgent: `escouade/${VERSION}`,
        codexHome: process.env.CODEX_HOME ?? '~/.codex',
        platformFamily: process.platform,
        platformOs: process.platform,
      });
    case 'initialized':
      return;
    case 'thread/start':
      cwd = p.cwd ?? cwd;
      instructions = p.developerInstructions ?? '';
      thread = id('thr');
      if (process.env.CODEX_HOME) ui.newRollout(process.env.CODEX_HOME, thread, cwd);
      reply({ thread: threadObject(thread) });
      return notify('thread/started', { thread: threadObject(thread) });
    case 'thread/resume':
      if (String(p.threadId).startsWith('perdu')) return refuse(`no rollout found for thread id ${p.threadId}`);
      cwd = p.cwd ?? cwd;
      thread = p.threadId;
      return reply({ thread: threadObject(thread) });
    case 'thread/fork': {
      cwd = p.cwd ?? cwd;
      const of = p.threadId;
      thread = id('thr-fork');
      if (process.env.CODEX_HOME) ui.newRollout(process.env.CODEX_HOME, thread, cwd, { forked_from_id: of });
      reply({ thread: threadObject(thread, { forkedFromId: of }) });
      return notify('thread/started', { thread: threadObject(thread, { forkedFromId: of }) });
    }
    case 'model/list':
      return reply({ data: MODELS, nextCursor: null });
    case 'account/rateLimits/read':
      return reply({ rateLimits: RATE(usage || 12), rateLimitsByLimitId: {} });
    case 'hooks/list': {
      const trust = ui.trustOf(argv);
      const hooks = ui.hooksOf(argv).map((h, i) => ({
        key: h.key,
        eventName: h.event.charAt(0).toLowerCase() + h.event.slice(1),
        handlerType: 'command',
        command: h.command,
        source: 'sessionFlags',
        displayOrder: i,
        enabled: true,
        currentHash: h.hash,
        trustStatus: trust[h.key] === h.hash ? 'trusted' : 'untrusted',
      }));
      return reply({ data: (p.cwds ?? [cwd]).map((c) => ({ cwd: c, hooks })) });
    }
    case 'thread/name/set':
      return reply({});
    case 'turn/start':
      if (turn) return refuse('a turn is already running');
      startTurn(p).then(reply);
      return;
    case 'turn/steer':
      if (!turn || p.expectedTurnId !== turn.id) return refuse('no such turn running');
      reply({ turnId: turn.id });
      turn.wake?.({ steer: (p.input ?? []).map((i) => i.text ?? '').join('\n') });
      return;
    case 'turn/interrupt':
      reply({});
      if (turn) {
        // What it waited for goes with the turn.
        for (const [rid, w] of waiting) {
          waiting.delete(rid);
          notify('serverRequest/resolved', { threadId: thread, requestId: rid });
          w.resolve(null);
        }
        turn.wake?.({ interrupt: true });
      }
      return;
    default:
      return refuse(`unknown method ${msg.method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch (e) {
    process.stderr.write(`fake codex: ${e.message}\n`);
  }
});
// Its input closed: it ends once the turn under way is over, as the app-server does.
rl.on('close', () => {
  const end = () => (turn ? setTimeout(end, 20) : process.exit(0));
  if (turn?.wake) turn.wake({ interrupt: true });
  end();
});
