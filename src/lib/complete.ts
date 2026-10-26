// Autocomplete triggers of the composer: "@path" mentions and "/command"s, each at the start of the text or after a
// space or a line break (never in a word, a path or an address). Completed further on, a command goes as typed: its
// harness runs one at the head of a message alone, and reads the rest as text (ESC-205).

export interface Trigger {
  kind: 'file' | 'command';
  query: string;
  /** Index of the "@" or "/" character. */
  start: number;
  /** Index right after the token. */
  end: number;
}

export function detectTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const cmd = before.match(/(^|\s)\/([\w:.-]*)$/);
  if (cmd) return { kind: 'command', query: cmd[2], start: caret - cmd[2].length - 1, end: caret };
  const at = before.match(/(^|\s)@([^\s@]*)$/);
  if (at) {
    const start = caret - at[2].length - 1;
    return { kind: 'file', query: at[2], start, end: caret };
  }
  return null;
}

export function applyCompletion(text: string, t: Trigger, value: string): { text: string; caret: number } {
  const token = t.kind === 'command' ? `/${value} ` : `@${value} `;
  const after = text.slice(t.end).replace(/^\S*/, '');
  const next = text.slice(0, t.start) + token + after.replace(/^ /, '');
  return { text: next, caret: t.start + token.length };
}

export function filterCommands<T extends { name: string; description?: string }>(cmds: T[], query: string, limit = 12): T[] {
  const q = query.toLowerCase();
  const starts = cmds.filter((c) => c.name.toLowerCase().startsWith(q));
  const contains = cmds.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
