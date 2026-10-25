// The interface of the fake `agent` (« Vue Cursor »): `agent [--resume <id>] [--model <m>] [--mode plan] [--force]`, in
// a pseudo-terminal, as Cursor CLI 2026.10.22's own was tried (docs/TODO-1.8.md, point 0, « Cursor CLI », ESC-24 and
// ESC-49). It needs ESCOUADE_CURSOR_PROJECTS, its folder of the workspaces (`~/.cursor/projects` for the real one).
//
// - Each launch is added to <CURSOR_CONFIG_DIR>/fake-tui-launches.jsonl ({argv, cwd, configDir, msystem, exepath,
//   relay}): `relay`, what the rule Escouade writes in the folder (.cursor/rules/escouade-relais.mdc) holds, or null.
// - On a folder with no <projects>/<key>/.workspace-trusted (key: the folder's path, each run of what is neither a
//   letter nor a digit a `-`), it first shows `fake-cursor-trust` and waits: `a` or Enter trusts it (the file
//   written, as Cursor does), `q` or Ctrl+C quits. Then it shows `fake-cursor-tui`.
// - Its conversation is `--resume <id>` (a new one under that id when it has none, as Cursor), else a new id; its
//   transcript is <projects>/<key>/agent-transcripts/<id>/<id>.jsonl, written as Cursor writes it
//   (tests/fixtures/cursor/transcript-tui.jsonl): each line it reads (pasted text, then Enter) is a prompt, written
//   wrapped in <timestamp> and <user_query>, then the reply « Fini : <prompt> » and {type: turn_ended, status:
//   success}. "commande" in the prompt runs a Shell tool first (`npm test`); "lent" makes the turn wait for Ctrl+C,
//   which stops it ({status: aborted}). Ctrl+C twice out of a turn ends the process.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The name of a workspace's folder, as Cursor makes it. */
const keyOf = (p) =>
  p
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

export function tui(argv) {
  const projects = process.env.ESCOUADE_CURSOR_PROJECTS;
  if (!projects) {
    process.stderr.write('fake cursor: ESCOUADE_CURSOR_PROJECTS is needed\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  const home = process.env.CURSOR_CONFIG_DIR || path.join(cwd, '.fake-cursor');
  fs.mkdirSync(home, { recursive: true });
  const rule = path.join(cwd, '.cursor', 'rules', 'escouade-relais.mdc');
  fs.appendFileSync(
    path.join(home, 'fake-tui-launches.jsonl'),
    JSON.stringify({
      argv,
      cwd,
      configDir: process.env.CURSOR_CONFIG_DIR ?? null,
      msystem: process.env.MSYSTEM ?? null,
      exepath: process.env.EXEPATH ?? null,
      relay: fs.existsSync(rule) ? fs.readFileSync(rule, 'utf8') : null,
    }) + '\n',
  );
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const id = flag('--resume') || crypto.randomUUID();
  const dir = path.join(projects, keyOf(cwd));
  const trustFile = path.join(dir, '.workspace-trusted');
  const transcript = path.join(dir, 'agent-transcripts', id, `${id}.jsonl`);
  const write = (entry) => {
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.appendFileSync(transcript, JSON.stringify(entry) + '\n');
  };

  let trusting = !fs.existsSync(trustFile);
  // Raw before its first screen (ESC-125): a key typed as soon as that shows would else reach a terminal still cooked.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdout.write(trusting ? '\x1b[?2004hfake-cursor-trust\r\n' : '\x1b[?2004hfake-cursor-tui\r\n');

  let running = null;
  let ctrlC = 0;
  const turn = async (prompt) => {
    write({
      role: 'user',
      message: {
        content: [
          { type: 'text', text: `<timestamp>Sunday, Oct 25, 2026, 3:07 PM (UTC+1)</timestamp>\n<user_query>\n${prompt}\n</user_query>` },
        ],
      },
    });
    process.stdout.write(`fake-turn ${prompt}\r\n`);
    if (prompt.includes('commande')) {
      write({
        role: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Je lance les tests.' },
            { type: 'tool_use', name: 'Shell', input: { command: 'npm test', description: 'Run the tests' } },
          ],
        },
      });
    }
    if (prompt.includes('lent')) {
      process.stdout.write('ctrl+c to stop\r\n');
      const stopped = await new Promise((resolve) => (running = resolve));
      running = null;
      if (stopped) {
        write({ type: 'turn_ended', status: 'aborted', error: 'User aborted/interrupted manually.' });
        return;
      }
    }
    write({ role: 'assistant', message: { content: [{ type: 'text', text: `Fini : ${prompt}` }] } });
    write({ type: 'turn_ended', status: 'success' });
  };

  let line = '';
  let pasting = false;
  const draw = () => process.stdout.write(`\r\x1b[2K→ ${line}`);
  process.stdin.on('data', (chunk) => {
    for (const _ of chunk.matchAll(/\x03/g)) {
      if (trusting) process.exit(0);
      if (running) running(true);
      else if (++ctrlC >= 2) process.exit(0);
      else process.stdout.write('\r\nPress Ctrl+C again to exit\r\n');
    }
    chunk = chunk.replaceAll('\x03', '');
    for (const part of chunk.split(/(\x1b\[20[01]~|\r)/)) {
      if (part === '\x1b[200~') pasting = true;
      else if (part === '\x1b[201~') {
        pasting = false;
        draw();
      } else if (part === '') continue;
      else if (trusting) {
        if (part === '\r' || part.startsWith('a')) {
          trusting = false;
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(trustFile, JSON.stringify({ trustedAt: new Date().toISOString(), workspacePath: cwd }, null, 2));
          process.stdout.write('\r\nfake-cursor-tui\r\n');
        } else if (part.startsWith('q')) process.exit(0);
      } else if (part === '\r') {
        if (line.trim() && !running) {
          const prompt = line.trim();
          line = '';
          ctrlC = 0;
          draw();
          turn(prompt);
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
