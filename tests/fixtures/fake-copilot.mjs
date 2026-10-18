#!/usr/bin/env node
// A fake `copilot --server --stdio` for the tests (ESC-39): the protocol of the Copilot SDK
// (JSON-RPC 2.0 framed by `Content-Length` headers, protocol 3), as Copilot CLI 1.0.98 speaks it
// (tests/fixtures/copilot/). The words of each message pick what it plays:
//   bonjour (or anything else) — a reply;  raisonnement — a reasoning, then a reply;
//   commande — a command asking its permission (shell);  fichier — a file changed (write, its diff;
//   « fichier dehors »: beside the agent's folder);
//   lecture — a file read (read);  web — an address fetched (url);  mcp — a tool of an MCP server;
//   question — ask_user (the event and the request to the client, the first answer wins);
//   formulaire — a form of an MCP server (elicitation);  propose un plan — exit_plan_mode;
//   sous-agent — tasks (sql, session.todos_changed) and a subagent (task, subagent.*);
//   lent — a long turn: stopped by session.abort, or ended by a message sent `immediate`;
//   modèle — says the model it runs.
// Sessions are kept in $COPILOT_HOME/session-state/<id>.json (resume, fork). Each message received
// is written to $FAKE_COPILOT_LOG when set. FAKE_COPILOT_AUTH: `none` (not signed in) or `gh-cli`.
// FAKE_COPILOT_FREE=1: no model listed (a Free account).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

if (process.argv.includes('--version')) {
  console.log(`GitHub Copilot CLI ${process.env.FAKE_COPILOT_VERSION || '1.0.98'}.`);
  process.exit(0);
}
if (logFileOf()) fs.appendFileSync(logFileOf(), JSON.stringify({ launch: { argv: process.argv.slice(2), cwd: process.cwd() } }) + '\n');
function logFileOf() {
  return process.env.FAKE_COPILOT_LOG;
}

const home = process.env.COPILOT_HOME || path.join(process.cwd(), '.fake-copilot');
const states = path.join(home, 'session-state');
fs.mkdirSync(states, { recursive: true });
const logFile = process.env.FAKE_COPILOT_LOG;
const log = (dir, msg) => {
  if (logFile) fs.appendFileSync(logFile, JSON.stringify({ dir, msg }) + '\n');
};

// ----- framing -----
let buf = Buffer.alloc(0);
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep < 0) return;
    const m = /content-length:\s*(\d+)/i.exec(buf.slice(0, sep).toString());
    const len = m ? +m[1] : 0;
    if (buf.length < sep + 4 + len) return;
    const body = buf.slice(sep + 4, sep + 4 + len).toString('utf8');
    buf = buf.slice(sep + 4 + len);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }
    log('c2s', msg);
    onMessage(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

function write(msg) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
const result = (id, r) => write({ id, result: r });

// ----- sessions -----
const sessions = new Map();
function load(id) {
  if (sessions.has(id)) return sessions.get(id);
  const file = path.join(states, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const s = { ...JSON.parse(fs.readFileSync(file, 'utf8')), busy: false, queue: [] };
  sessions.set(id, s);
  return s;
}
function save(s) {
  fs.writeFileSync(path.join(states, `${s.id}.json`), JSON.stringify({ ...s, busy: undefined, queue: undefined }));
}
function open(params, id = crypto.randomUUID(), events = []) {
  const s = {
    id,
    cwd: params.workingDirectory || process.cwd(),
    model: params.model || 'auto',
    effort: params.reasoningEffort || null,
    mode: 'interactive',
    permissions: 'manual',
    events,
    todos: [],
    nano: 0,
    system: params.systemMessage?.content || null,
  };
  sessions.set(id, s);
  save(s);
  return s;
}

let last = null;
function emit(s, type, data, extra = {}) {
  const event = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    parentId: last,
    type,
    data,
    ...extra,
  };
  last = event.id;
  if (!event.ephemeral) {
    s.events.push(event);
    save(s);
  }
  write({ method: 'session.event', params: { sessionId: s.id, event } });
  return event;
}

// What waits for the client: the requests of the session (by requestId) and the client's.
const waiting = new Map();
const clientRequests = new Map();
let nextClientId = 1;
function ask(s, type, data, clientMethod, clientParams) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    let done = false;
    const finish = (answer, completed) => {
      if (done) return false;
      done = true;
      waiting.delete(requestId);
      emit(s, `${type}.completed`, { requestId, ...completed(answer) });
      resolve(answer);
      return true;
    };
    waiting.set(requestId, { finish, type });
    emit(s, `${type}.requested`, { requestId, ...data });
    if (clientMethod) {
      const id = nextClientId++;
      clientRequests.set(id, (answer) => finish(answer, (a) => a));
      write({ id, method: clientMethod, params: { sessionId: s.id, ...clientParams } });
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function say(s, text, agentId) {
  const messageId = crypto.randomUUID();
  const extra = agentId ? { agentId } : {};
  for (const part of text.match(/.{1,12}/gs) || [text]) {
    emit(s, 'assistant.message_delta', { messageId, deltaContent: part }, { ...extra, ephemeral: true });
  }
  emit(s, 'assistant.message', { messageId, content: text, toolRequests: [] }, extra);
}

async function tool(s, toolName, args, run, extra = {}) {
  const toolCallId = 'call_' + crypto.randomUUID().slice(0, 8);
  emit(s, 'tool.execution_start', { toolCallId, toolName, arguments: args }, extra);
  const done = await run(toolCallId);
  emit(s, 'tool.execution_complete', { toolCallId, ...done }, extra);
  return done;
}

async function permission(s, toolCallId, request, extra = {}) {
  if (s.permissions === 'allow-all') return { kind: 'approve-once' };
  return ask(s, 'permission', { permissionRequest: { toolCallId, ...request } }, null).then((a) => a);
}
const approved = (a) => a && String(a.kind).startsWith('approve');

async function turn(s, prompt, messageId) {
  s.busy = true;
  s.interjected = null;
  emit(s, 'user.message', { content: prompt, messageId });
  emit(s, 'assistant.turn_start', { turnId: '0' });
  const p = prompt.toLowerCase();
  try {
    if (p.includes('raisonnement')) {
      const reasoningId = crypto.randomUUID();
      emit(s, 'assistant.reasoning_delta', { reasoningId, deltaContent: 'Je réfléchis ' }, { ephemeral: true });
      emit(s, 'assistant.reasoning_delta', { reasoningId, deltaContent: 'à la question.' }, { ephemeral: true });
      emit(s, 'assistant.reasoning', { reasoningId, content: 'Je réfléchis à la question.' });
      await say(s, 'Voici ma réponse réfléchie.');
    } else if (p.includes('commande')) {
      const r = await tool(s, 'powershell', { command: 'npm test', description: 'Run the tests' }, async (id) => {
        const a = await permission(s, id, {
          kind: 'shell',
          fullCommandText: 'npm test',
          intention: 'Run the tests',
          commands: [{ identifier: 'npm test', readOnly: false }],
          possiblePaths: ['package.json'],
          possibleUrls: [],
          hasWriteFileRedirection: false,
          canOfferSessionApproval: true,
        });
        return approved(a)
          ? { success: true, shellExecution: { exitCode: 0 }, result: { content: 'tests ok', detailedContent: 'tests ok' } }
          : { success: false, error: { message: 'The user rejected this tool call.', code: 'denied' } };
      });
      await say(s, r.success ? 'La commande a marché.' : 'La commande a été refusée.');
    } else if (p.includes('fichier')) {
      // « dehors »: a file beside the agent's folder, which Escouade's rules never accept by themselves.
      const file = p.includes('dehors') ? path.join(path.dirname(s.cwd), 'copilot-dehors.txt') : path.join(s.cwd, 'notes.txt');
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const diff = `\ndiff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +1,1 @@\n+note de Copilot\n`;
      const r = await tool(s, 'apply_patch', `*** Begin Patch\n*** Update File: ${file}\n+note de Copilot\n*** End Patch\n`, async (id) => {
        const a = await permission(s, id, {
          kind: 'write',
          intention: 'Update file',
          fileName: file,
          diff,
          newFileContents: before + 'note de Copilot\n',
          canOfferSessionApproval: true,
        });
        if (!approved(a)) return { success: false, error: { message: 'The user rejected this tool call.', code: 'denied' } };
        fs.writeFileSync(file, before + 'note de Copilot\n');
        return {
          success: true,
          fileEdits: [{ path: file, kind: 'edit' }],
          result: { content: `Modified 1 file(s): ${file}`, detailedContent: diff },
        };
      });
      await say(s, r.success ? `J’ai modifié ${path.basename(file)}.` : 'Modification refusée.');
    } else if (p.includes('lecture')) {
      const file = path.join(s.cwd, 'README.md');
      await tool(s, 'view', { path: file }, async (id) => {
        const a = await permission(s, id, { kind: 'read', intention: `Read file: ${file}`, path: file });
        return approved(a) ? { success: true, result: { content: 'contenu' } } : { success: false, error: { message: 'denied' } };
      });
      await say(s, 'Fichier lu.');
    } else if (p.includes('web')) {
      const r = await tool(s, 'web_fetch', { url: 'https://example.com' }, async (id) => {
        const a = await permission(s, id, { kind: 'url', intention: 'Fetch content from this URL.', url: 'https://example.com' });
        return approved(a)
          ? { success: true, result: { content: 'Example Domain' } }
          : { success: false, error: { message: `The user rejected this tool call. User feedback: ${a.feedback || ''}` } };
      });
      await say(s, r.success ? 'Le titre est Example Domain.' : 'Accès au web refusé.');
    } else if (p.includes('mcp')) {
      await tool(s, 'essai-ping', { texte: 'bonjour' }, async (id) => {
        const a = await permission(s, id, {
          kind: 'mcp',
          serverName: 'essai',
          toolName: 'essai-ping',
          toolTitle: 'ping',
          args: { texte: 'bonjour' },
          readOnly: true,
        });
        return approved(a) ? { success: true, result: { content: 'pong bonjour' } } : { success: false, error: { message: 'denied' } };
      }).then(() => {});
      await say(s, 'Le ping a répondu.');
    } else if (p.includes('formulaire')) {
      const a = await ask(s, 'elicitation', {
        elicitationSource: 'essai',
        message: 'Qui es-tu ?',
        requestedSchema: {
          type: 'object',
          properties: {
            prenom: { type: 'string', title: 'Prénom' },
            age: { type: 'number', title: 'Âge' },
            abonne: { type: 'boolean', title: 'Abonné' },
          },
          required: ['prenom'],
        },
      });
      const c = a.content || {};
      await say(s, `Formulaire reçu : ${c.prenom}, ${c.age} ans, abonné : ${c.abonne}.`);
    } else if (p.includes('question')) {
      const toolCallId = 'call_' + crypto.randomUUID().slice(0, 8);
      emit(s, 'tool.execution_start', {
        toolCallId,
        toolName: 'ask_user',
        arguments: { question: 'Quelle couleur préfères-tu ?', choices: ['rouge', 'bleu'] },
      });
      const q = { question: 'Quelle couleur préfères-tu ?', choices: ['rouge', 'bleu'], allowFreeform: true };
      const a = await ask(s, 'user_input', { ...q, toolCallId }, 'userInput.request', q);
      emit(s, 'tool.execution_complete', { toolCallId, success: true, result: { content: `User selected: ${a.answer}` } });
      await say(s, `Tu as choisi ${a.answer}.`);
    } else if (p.includes('plan')) {
      const toolCallId = 'call_' + crypto.randomUUID().slice(0, 8);
      const plan = {
        summary: 'Plan en deux étapes',
        planContent: '# Plan\n\n1. Lire calc.js\n2. Ajouter sub',
        actions: ['interactive', 'autopilot', 'exit_only'],
        recommendedAction: 'interactive',
      };
      emit(s, 'tool.execution_start', { toolCallId, toolName: 'exit_plan_mode', arguments: { summary: plan.summary } });
      const a = await ask(s, 'exit_plan_mode', { ...plan }, 'exitPlanMode.request', {
        summary: plan.summary,
        planContent: plan.planContent,
        actions: plan.actions,
        recommendedAction: plan.recommendedAction,
      });
      emit(s, 'tool.execution_complete', {
        toolCallId,
        success: true,
        result: { content: a.approved ? 'Plan approved' : `Plan not approved. User feedback:\n\n${a.feedback || ''}` },
      });
      if (a.approved && s.mode === 'plan') {
        emit(s, 'session.mode_changed', { previousMode: 'plan', newMode: 'interactive' });
        s.mode = 'interactive';
      }
      await say(s, a.approved ? 'Plan approuvé, je commence.' : 'Je revois le plan.');
    } else if (p.includes('sous-agent')) {
      await tool(s, 'sql', { description: 'Créer deux tâches', query: 'INSERT INTO todos …' }, async () => {
        s.todos = [
          { id: 'lire', title: 'Lire README.md', status: 'in_progress' },
          { id: 'resumer', title: 'Résumer', status: 'pending' },
        ];
        emit(s, 'session.todos_changed', {});
        return { success: true, result: { content: '2 row(s) inserted.' } };
      });
      await tool(
        s,
        'task',
        { name: 'Résumé du README', description: 'Résumer README.md', prompt: 'Résume README.md', agent_type: 'explore' },
        async (toolCallId) => {
          const agentId = crypto.randomUUID();
          emit(
            s,
            'subagent.started',
            { toolCallId, agentName: 'explore', agentDisplayName: 'Résumé du README', model: 'gpt-5-mini' },
            { agentId },
          );
          await tool(s, 'view', { path: path.join(s.cwd, 'README.md') }, async () => ({ success: true, result: { content: '# essai' } }), {
            agentId,
          });
          await say(s, 'Le README présente un projet d’essai.', agentId);
          emit(
            s,
            'subagent.completed',
            { toolCallId, agentName: 'explore', totalToolCalls: 1, totalTokens: 1200, durationMs: 300 },
            { agentId },
          );
          return { success: true, result: { content: 'Le README présente un projet d’essai.' } };
        },
      );
      await tool(s, 'sql', { description: 'Marquer les tâches faites', query: 'UPDATE todos …' }, async () => {
        s.todos = s.todos.map((t) => ({ ...t, status: 'done' }));
        emit(s, 'session.todos_changed', {});
        return { success: true, result: { content: '2 row(s) updated.' } };
      });
      await say(s, 'Tâches faites, le sous-agent a résumé le README.');
    } else if (p.includes('lent')) {
      await say(s, 'Je commence un long travail…');
      const got = await new Promise((resolve) => {
        s.onAbort = () => resolve('abort');
        s.onInterject = (text) => resolve({ text });
        setTimeout(() => resolve('timeout'), 30000);
      });
      s.onAbort = null;
      s.onInterject = null;
      if (got === 'abort') {
        emit(s, 'abort', { reason: 'user_initiated' });
        emit(s, 'agent.interrupted', { activity: 'model_call', turn: 0, toolCallIds: [] });
        finish(s, true);
        return;
      }
      await say(s, got.text ? `Reçu pendant le tour : ${got.text}` : 'Fini.');
    } else if (p.includes('modèle') || p.includes('modele')) {
      await say(s, `Je tourne sur ${s.model}${s.effort ? ` (${s.effort})` : ''}.`);
    } else {
      await say(s, s.system ? `Copilot a reçu : ${prompt}` : `Copilot a reçu : ${prompt}`);
    }
  } catch (e) {
    emit(s, 'session.error', { errorType: 'fake', message: String(e) });
  }
  finish(s, false);
}

function finish(s, aborted) {
  emit(
    s,
    'assistant.usage',
    {
      model: s.model,
      inputTokens: 1200,
      outputTokens: 40,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      copilotUsage: { totalNanoAiu: 227227500 },
    },
    { ephemeral: true },
  );
  s.nano += 227227500;
  emit(s, 'session.usage_checkpoint', { totalNanoAiu: s.nano }, { ephemeral: true });
  emit(s, 'session.usage_info', { tokenLimit: 272000, currentTokens: 15000 }, { ephemeral: true });
  emit(s, 'assistant.idle', aborted ? { aborted: true } : {}, { ephemeral: true });
  emit(s, 'session.idle', aborted ? { aborted: true, mode: s.mode } : { mode: s.mode }, { ephemeral: true });
  s.busy = false;
  const next = (s.queue || []).shift();
  if (next) turn(s, next.prompt, next.messageId);
}

const MODELS = [
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    billing: { multiplier: 1 },
    supportedReasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    capabilities: { supports: { vision: true } },
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    billing: { multiplier: 3 },
    supportedReasoningEfforts: [],
    capabilities: { supports: { vision: true } },
  },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', billing: { multiplier: 0.33 }, capabilities: { supports: { vision: false } } },
];

function onMessage(msg) {
  if (msg.method === undefined) {
    // The client's answer to a request of the fake.
    const answer = clientRequests.get(msg.id);
    if (answer) {
      clientRequests.delete(msg.id);
      answer(msg.result);
    }
    return;
  }
  const { id, method, params = {} } = msg;
  const s = params.sessionId ? load(params.sessionId) : null;
  switch (method) {
    case 'connect':
      return result(id, { ok: true, protocolVersion: 3, version: '1.0.98' });
    case 'auth.getStatus': {
      const how = process.env.FAKE_COPILOT_AUTH;
      if (how === 'none') return result(id, { isAuthenticated: false, statusMessage: 'Not authenticated' });
      return result(id, { isAuthenticated: true, authType: how || 'user', host: 'https://github.com', login: 'user' });
    }
    case 'models.list':
      return result(id, { models: process.env.FAKE_COPILOT_FREE ? [] : MODELS });
    case 'session.model.list':
      return result(id, {
        list: [],
        modelPriceCategories: [
          { id: 'gpt-6-luna', priceCategory: 'low' },
          { id: 'gpt-5-mini', priceCategory: 'low' },
        ],
      });
    case 'session.create': {
      const n = open(params);
      emit(n, 'session.start', { sessionId: n.id, copilotVersion: '1.0.98', context: { cwd: n.cwd } });
      return result(id, { sessionId: n.id, workspacePath: path.join(states, n.id), mode: 'interactive' });
    }
    case 'session.resume': {
      if (!s) return write({ id, error: { code: -32603, message: `Session not found: ${params.sessionId}` } });
      if (params.model) s.model = params.model;
      s.system = params.systemMessage?.content || null;
      return result(id, { sessionId: s.id, workspacePath: path.join(states, s.id), mode: s.mode });
    }
    case 'sessions.fork': {
      if (!s) return write({ id, error: { code: -32603, message: 'Session not found' } });
      let events = s.events;
      if (params.toEventId) {
        const i = events.findIndex((e) => e.id === params.toEventId);
        if (i >= 0) events = events.slice(0, i);
      }
      const copy = open({ workingDirectory: s.cwd, model: s.model }, crypto.randomUUID(), [...events]);
      copy.forkedFrom = s.id;
      save(copy);
      return result(id, { sessionId: copy.id, name: params.name });
    }
    case 'sessions.readPersistedEvents':
      return result(id, { events: s ? s.events : [] });
    case 'session.permissions.setMode':
      if (s) s.permissions = params.mode === 'assisted' ? s.permissions : params.mode;
      return result(id, { success: params.mode !== 'assisted', mode: s?.permissions });
    case 'session.mode.set':
      if (s && s.mode !== params.mode) {
        emit(s, 'session.mode_changed', { previousMode: s.mode, newMode: params.mode });
        s.mode = params.mode;
      }
      return result(id, { status: 'unchanged', modelChanged: false, modeApplied: true });
    case 'session.model.switchTo':
      if (s) {
        const previousModel = s.model;
        s.model = params.modelId;
        s.effort = params.reasoningEffort || null;
        emit(s, 'session.model_change', { previousModel, newModel: s.model, reasoningEffort: s.effort, source: 'rpc' });
      }
      return result(id, { status: 'applied', modelId: params.modelId });
    case 'session.mcp.disable':
    case 'session.name.set':
      return result(id, {});
    case 'session.send': {
      if (!s) return write({ id, error: { code: -32603, message: 'Session not found' } });
      const messageId = crypto.randomUUID();
      result(id, { messageId });
      if (s.busy) {
        if (params.mode === 'immediate' && s.onInterject) {
          emit(s, 'user.message', { content: params.prompt, messageId });
          s.onInterject(params.prompt);
        } else (s.queue ||= []).push({ prompt: params.prompt, messageId });
        return;
      }
      turn(s, params.prompt || '', messageId);
      return;
    }
    case 'session.abort':
      result(id, { success: true });
      if (s?.onAbort) s.onAbort();
      for (const [, w] of waiting) w.finish({ kind: 'reject' }, () => ({ result: { kind: 'denied-interactively-by-user' } }));
      return;
    case 'session.permissions.handlePendingPermissionRequest': {
      const w = waiting.get(params.requestId);
      const ok =
        !!w &&
        w.finish(params.result, (a) => ({
          result: {
            kind:
              a.kind === 'approve-once'
                ? 'approved'
                : a.kind === 'approve-for-session'
                  ? 'approved-for-session'
                  : 'denied-interactively-by-user',
            ...(a.feedback ? { feedback: a.feedback } : {}),
          },
        }));
      return result(id, { success: ok });
    }
    case 'session.ui.handlePendingUserInput': {
      const w = waiting.get(params.requestId);
      return result(id, { success: !!w && w.finish(params.response, (a) => a) });
    }
    case 'session.ui.handlePendingElicitation': {
      const w = waiting.get(params.requestId);
      return result(id, { success: !!w && w.finish(params.result, (a) => a) });
    }
    case 'session.ui.handlePendingExitPlanMode': {
      const w = waiting.get(params.requestId);
      return result(id, { success: !!w && w.finish(params.response, (a) => a) });
    }
    case 'session.plan.readSqlTodosWithDependencies':
      return result(id, { rows: s ? s.todos : [], dependencies: [] });
    case 'runtime.shutdown':
      result(id, null);
      setTimeout(() => process.exit(0), 20);
      return;
    default:
      return write({ id, error: { code: -32601, message: `Unhandled method ${method}` } });
  }
}
