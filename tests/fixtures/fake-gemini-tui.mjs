// The fake `gemini` out of ACP (ESC-275), as Gemini CLI 0.66.0's code tells it (no account: never tried on a turn).
// Its home is $GEMINI_CLI_HOME/.gemini, as the fake `gemini --acp`'s.
//
// `gemini -p <text> -o json …` (a text Escouade writes): its question on its input, added before <text>. Each launch goes
// to $FAKE_GEMINI_LOG ({launch: {argv, cwd, home, policy, input, prompt: true}}). It answers in JSON: a name
// `<two words>-gemini` for a question with a <task>, the error of its daily quota for « limite », else « Texte de
// Gemini ». Without a sign-in (no key, no file of credentials) it says so and fails, as `gemini -p` does.
//
// `gemini [--resume <id> | --session-id <id>] [--model <m>] [--approval-mode <m>] [--policy <f>]` (its interface), in a
// pseudo-terminal:
// - Each launch is added to $GEMINI_CLI_HOME/fake-tui-launches.jsonl ({argv, cwd, home, settings, trust, credentials,
//   keyEnd}): what Escouade gave it in its variables and its home (a key by its last four characters alone).
// - Its sign-in first, when its settings say `oauth-personal` and it has none (its home's oauth_creds.json, nor the
//   file of GOOGLE_APPLICATION_CREDENTIALS): « Waiting for authentication… », then, a moment later, as if the browser
//   signed in, oauth_creds.json and google_accounts.json ({active: moi@exemple.fr}) written in its home.
// - Its session is `--resume <id>` when its store has it (the fake `gemini --acp`'s, .gemini/tmp/fake/chats/<id>.json);
//   else it says « Error resuming session: … » and quits (code 42), as `gemini` does. `--session-id <id>` starts one under
//   that id. It shows `fake-gemini-tui <id>`.
// - Each line it reads (pasted text, then Enter) is a prompt, kept in the session as the fake ACP keeps its own: the
//   answer « Fini : <prompt> ». "commande" runs `npm test` first (run_shell_command); "permission" asks its permission
//   first (a Notification) and waits for Enter; "lent" writes « esc to cancel » and waits for Escape, which ends the
//   turn without a hook. A line read during a turn waits for its end. Ctrl+C twice out of a turn ends the process.
// - Its hooks (`hooks` of its settings, when `hooksConfig.enabled`) run in a shell, their payload on their input, as
//   Gemini builds it: SessionStart, BeforeAgent, BeforeTool, AfterTool, Notification (ToolPermission), AfterAgent.
//   Each one run is added to $GEMINI_CLI_HOME/fake-tui-hooks.jsonl ({event, command}).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const flagOf = (argv) => (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function readInput() {
  if (process.stdin.isTTY) return '';
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** `gemini -p`: one answer in JSON. */
async function prompt(argv, root, gemini) {
  const flag = flagOf(argv);
  const input = await readInput();
  const policy = flag('--policy');
  const log = process.env.FAKE_GEMINI_LOG;
  if (log)
    fs.appendFileSync(
      log,
      JSON.stringify({
        launch: {
          argv,
          cwd: process.cwd(),
          home: root,
          policy: policy ? fs.readFileSync(policy, 'utf8') : null,
          input,
          prompt: true,
        },
      }) + '\n',
    );
  const signedIn =
    !!process.env.GEMINI_API_KEY ||
    fs.existsSync(path.join(gemini, 'oauth_creds.json')) ||
    (!!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  const out = (doc, code = 0) => {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
    process.exit(code);
  };
  if (!signedIn) out({ error: { type: 'Error', message: 'Please set an Auth method' } }, 41);
  const own = input.replace(/<(instructions|escouade)>[\s\S]*?<\/\1>\n*/g, '');
  if (/limite/i.test(own)) out({ error: { type: 'TerminalQuotaError', message: 'You have exhausted your daily quota on this model.' } }, 1);
  const task = own.match(/<(tache|task)>\s*([\s\S]*?)\s*<\/\1>/)?.[2];
  const response =
    task !== undefined ? `${(task.toLowerCase().match(/[a-z]+/g) ?? ['tache']).slice(0, 2).join('-')}-gemini` : 'Texte de Gemini';
  out({ session_id: crypto.randomUUID(), response, stats: {} });
}

/** Its interface. */
function tui(argv, root, gemini) {
  const cwd = process.cwd();
  const flag = flagOf(argv);
  const settingsFile = path.join(gemini, 'settings.json');
  const settings = readJson(settingsFile) ?? {};
  const key = process.env.GEMINI_API_KEY;
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(
    path.join(root, 'fake-tui-launches.jsonl'),
    JSON.stringify({
      argv,
      cwd,
      home: root,
      settings,
      trust: process.env.GEMINI_CLI_TRUST_WORKSPACE === 'true',
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
      keyEnd: key ? key.slice(-4) : null,
    }) + '\n',
  );
  const store = path.join(gemini, 'tmp', 'fake', 'chats');
  fs.mkdirSync(store, { recursive: true });
  const resume = flag('--resume');
  if (resume && !fs.existsSync(path.join(store, `${resume}.json`))) {
    process.stdout.write(`Error resuming session: Invalid session identifier "${resume}".\r\n`);
    process.exit(42);
  }
  const id = resume ?? flag('--session-id') ?? crypto.randomUUID();
  const kept = path.join(store, `${id}.json`);
  const conv = readJson(kept) ?? { id, cwd, history: [], model: 'auto' };
  const save = () => fs.writeFileSync(kept, JSON.stringify(conv));
  const transcriptPath = path.join(store, `session-fake-${id.slice(0, 8)}.jsonl`);
  const hooks = settings.hooksConfig?.enabled ? (settings.hooks ?? {}) : {};
  const runHooks = (event, more) =>
    Promise.all(
      (hooks[event] ?? [])
        .flatMap((d) => d.hooks ?? [])
        .map(
          (h) =>
            new Promise((resolve) => {
              fs.appendFileSync(path.join(root, 'fake-tui-hooks.jsonl'), JSON.stringify({ event, command: h.command }) + '\n');
              const child = spawn(h.command, { shell: true, cwd, stdio: ['pipe', 'ignore', 'ignore'] });
              child.on('error', resolve);
              child.on('exit', resolve);
              child.stdin.end(
                JSON.stringify({
                  session_id: id,
                  transcript_path: transcriptPath,
                  cwd,
                  hook_event_name: event,
                  timestamp: new Date().toISOString(),
                  ...more,
                }),
              );
            }),
        ),
    );

  // Raw before its first screen (ESC-125): a key typed as soon as that shows would else reach a terminal still cooked.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');

  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const signedIn = () => !!key || fs.existsSync(path.join(gemini, 'oauth_creds.json')) || (!!credentials && fs.existsSync(credentials));
  let ready = false;
  const show = async () => {
    ready = true;
    process.stdout.write(`\x1b[?2004hfake-gemini-tui ${id}\r\n`);
    await runHooks('SessionStart', { source: resume ? 'resume' : 'startup' });
  };
  if (settings.security?.auth?.selectedType === 'oauth-personal' && !signedIn()) {
    process.stdout.write('Waiting for authentication... (Press Esc or Ctrl+C to cancel)\r\n');
    setTimeout(() => {
      fs.mkdirSync(gemini, { recursive: true });
      fs.writeFileSync(path.join(gemini, 'oauth_creds.json'), JSON.stringify({ access_token: 'fake', refresh_token: 'fake' }));
      fs.writeFileSync(path.join(gemini, 'google_accounts.json'), JSON.stringify({ active: 'moi@exemple.fr', old: [] }));
      process.stdout.write('Authentication succeeded\r\n');
      show();
    }, 1500);
  } else show();

  let waiting = null;
  let queue = Promise.resolve();
  let ctrlC = 0;
  const wait = (kind) => new Promise((resolve) => (waiting = { resolve, kind }));
  const turn = async (prompt) => {
    await runHooks('BeforeAgent', { prompt });
    conv.history.push({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: prompt } });
    save();
    process.stdout.write(`fake-turn ${prompt}\r\n`);
    if (prompt.includes('commande') || prompt.includes('permission')) {
      const command = prompt.includes('permission') ? 'node --version' : 'npm test';
      const input = { command, description: 'Runs it' };
      if (prompt.includes('permission')) {
        await runHooks('Notification', {
          notification_type: 'ToolPermission',
          message: 'Tool Shell requires execution',
          details: { type: 'exec', title: 'Shell', command, rootCommand: command.split(' ')[0] },
        });
        process.stdout.write(`Allow execution of: '${command}'?\r\n`);
        await wait('permission');
      }
      await runHooks('BeforeTool', { tool_name: 'run_shell_command', tool_input: input });
      await runHooks('AfterTool', {
        tool_name: 'run_shell_command',
        tool_input: input,
        tool_response: { llmContent: 'ok', returnDisplay: 'ok', error: null },
      });
    }
    if (prompt.includes('lent')) {
      process.stdout.write('esc to cancel\r\n');
      await wait('turn');
      return;
    }
    const answer = `Fini : ${prompt}`;
    conv.history.push({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } });
    save();
    await runHooks('AfterAgent', { prompt, prompt_response: answer, stop_hook_active: false });
  };

  let line = '';
  let pasting = false;
  const draw = () => process.stdout.write(`\r\x1b[2K> ${line}`);
  process.stdin.on('data', (chunk) => {
    for (const _ of chunk.matchAll(/\x03/g)) {
      if (waiting) continue;
      if (++ctrlC >= 2) process.exit(0);
      process.stdout.write('\r\nPress Ctrl+C again to exit.\r\n');
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
        } else if (ready && line.trim() && !waiting) {
          const prompt = line.trim();
          line = '';
          ctrlC = 0;
          draw();
          // A message typed during a turn waits for its end.
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

export async function run(argv) {
  const root = process.env.GEMINI_CLI_HOME || path.join(process.cwd(), '.fake-gemini-home');
  const gemini = path.join(root, '.gemini');
  if (argv.includes('-p') || argv.includes('--prompt')) return prompt(argv, root, gemini);
  tui(argv, root, gemini);
  // Its terminal keeps it up until it quits.
  await new Promise(() => {});
}
