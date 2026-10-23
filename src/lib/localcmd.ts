// What Claude Code writes of a local command, run by itself and not by the model (ESC-154): `/compact`, `/model opus`…
// (`<command-name>`, `<local-command-stdout>`, `-stderr>`, after a `<local-command-caveat>`) and the `!` mode's shell
// commands (`<bash-input>`, `<bash-stdout>`, `<bash-stderr>`). The backend reads them as they come
// (`src-tauri/src/agent/localcmd.rs`); conversations saved before kept them in the text of a message of the user's,
// shown here the same way.

import { cleanOutput } from './bgtasks';
import type { ConvItem } from './types';

export type LocalPart = { kind: 'typed' | 'output' | 'error'; text: string };

/** What is between `<name>` and `</name>` (to the end when it is not closed). */
function tag(text: string, name: string): string | null {
  const open = text.indexOf(`<${name}>`);
  if (open < 0) return null;
  const rest = text.slice(open + name.length + 2);
  const close = rest.indexOf(`</${name}>`);
  return close < 0 ? rest : rest.slice(0, close);
}

/** An output as shown: without its ANSI codes, its lines and their indent kept, without the blank lines around it. */
function output(body: string): string {
  const lines = cleanOutput(body)
    .split('\n')
    .map((l) => l.trimEnd());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

/** What `text` tells of a local command: null when it is no local command's, else its parts, none for what is not shown. */
export function parseLocalCommand(text: string): LocalPart[] | null {
  if (text.trimStart().startsWith('<local-command-caveat>')) return [];
  const name = tag(text, 'command-name');
  if (name !== null) {
    const args = (tag(text, 'command-args') ?? '').trim();
    return [{ kind: 'typed', text: args ? `${name.trim()} ${args}` : name.trim() }];
  }
  const input = tag(text, 'bash-input');
  if (input !== null) return [{ kind: 'typed', text: `! ${input.trim()}` }];
  const parts: LocalPart[] = [];
  let found = false;
  for (const [name, kind] of [
    ['local-command-stdout', 'output'],
    ['bash-stdout', 'output'],
    ['local-command-stderr', 'error'],
    ['bash-stderr', 'error'],
  ] as const) {
    const body = tag(text, name);
    if (body === null) continue;
    found = true;
    const shown = output(body);
    if (shown) parts.push({ kind, text: shown });
  }
  return found ? parts : null;
}

export type LocalView =
  | { kind: 'user'; text: string }
  | { kind: 'wake'; text: string }
  | { kind: 'notices'; notices: { level: 'output' | 'error'; text: string }[] };

/**
 * How the messages of the user's a conversation saved before kept with the tags of a local command show, by their id:
 * the command as typed, what it printed as notices (none: the caveat, an empty output), the wake-up of a loop (a `/loop`
 * Claude Code ran again, which the stream told as a message from claude.ai) as a wake-up. A command the app sent shows once.
 */
export function localCommandViews(items: ConvItem[]): Map<string, LocalView> {
  const views = new Map<string, LocalView>();
  let last: string | null = null;
  for (const item of items) {
    if (item.kind !== 'user') continue;
    const parts = parseLocalCommand(item.text);
    if (!parts) {
      last = item.text;
      continue;
    }
    const typed = parts.find((p) => p.kind === 'typed');
    if (typed && item.origin === 'remote' && /^\/loop(\s|$)/.test(typed.text)) {
      views.set(item.id, { kind: 'wake', text: typed.text });
    } else if (typed && typed.text === last) {
      views.set(item.id, { kind: 'notices', notices: [] });
    } else if (typed) {
      views.set(item.id, { kind: 'user', text: typed.text });
      last = typed.text;
    } else {
      const notices = parts.map((p) => ({ level: p.kind === 'error' ? ('error' as const) : ('output' as const), text: p.text }));
      views.set(item.id, { kind: 'notices', notices });
    }
  }
  return views;
}
