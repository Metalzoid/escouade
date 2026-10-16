// The tasks Claude Code runs in the background for an agent, as the window shows them (ESC-14): the list under its card
// in the sidebar, the chip on the card, and each task's own view. The backend gives the facts: `PlanState.bgTasks`
// (commands, monitors, remote agents, teammates) and `PlanState.workflows`, which are drawn together as rows. The
// subagents (`PlanState.agents`) have their own list and are not among them.

import { t } from './i18n';
import type { BgKind, PlanState, RunStatus, SubAgent } from './types';

/** What a row is: a task of Claude Code, or one of the workflows of the plan. */
export type BgRowKind = BgKind | 'workflow';

/** A task or a workflow, as one row of the list and one view. */
export interface BgRow {
  /** Claude Code's id of the task. */
  id: string;
  kind: BgRowKind;
  title: string;
  command?: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  summary?: string;
  call?: string;
  /** The task id of the subagent that owns it. */
  parent?: string;
  outputFile?: string;
  /** A workflow's name, the phase and the agent running now, and what it used so far. */
  name?: string;
  now?: string;
  tools?: number;
  tokens?: number;
}

/** How many tasks a list shows before it asks to unroll the others: it never scrolls by itself, inside the list of the agents. */
export const BG_RUNNING_SHOWN = 5;
export const BG_FINISHED_SHOWN = 10;

export const isRunning = (row: { status: RunStatus }) => row.status === 'running';

/**
 * The tasks of a plan: those running first, the oldest first (the order they were launched in, as the subagents are
 * listed), then those ended, the latest ended first. An id is listed once: a workflow never shadows a task.
 */
export function bgRows(plan: PlanState | undefined): BgRow[] {
  if (!plan) return [];
  const seen = new Set<string>();
  const rows: BgRow[] = [];
  const add = (row: BgRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };
  // An older backend sends no `bgTasks`.
  for (const b of plan.bgTasks ?? []) {
    const { id, kind, title, status, startedAt } = b;
    add({
      id,
      kind,
      title,
      status,
      startedAt,
      ...(b.command !== undefined ? { command: b.command } : {}),
      ...(b.endedAt !== undefined ? { endedAt: b.endedAt } : {}),
      ...(b.summary !== undefined ? { summary: b.summary } : {}),
      ...(b.call !== undefined ? { call: b.call } : {}),
      ...(b.parent !== undefined ? { parent: b.parent } : {}),
      ...(b.outputFile !== undefined ? { outputFile: b.outputFile } : {}),
    });
  }
  for (const w of plan.workflows ?? []) {
    add({
      id: w.id,
      kind: 'workflow',
      title: w.title,
      status: w.status,
      startedAt: w.startedAt,
      tools: w.tools,
      tokens: w.tokens,
      ...(w.name !== undefined ? { name: w.name } : {}),
      ...(w.now !== undefined ? { now: w.now } : {}),
      ...(w.endedAt !== undefined ? { endedAt: w.endedAt } : {}),
    });
  }
  const ended = (r: BgRow) => r.endedAt ?? r.startedAt;
  // `sort` is stable: the rows that tie keep the order the backend gave.
  return [
    ...rows.filter(isRunning).sort((a, b) => a.startedAt - b.startedAt),
    ...rows.filter((r) => !isRunning(r)).sort((a, b) => ended(b) - ended(a)),
  ];
}

/** The row of the task `id`, if the plan has it. */
export const bgRow = (plan: PlanState | undefined, id: string): BgRow | undefined => bgRows(plan).find((r) => r.id === id);

/** How many tasks run in the background: commands, monitors, remote agents, teammates and workflows, not the subagents. */
export function bgCount(plan: PlanState | undefined): number {
  if (!plan) return 0;
  return (plan.bgTasks ?? []).filter(isRunning).length + (plan.workflows ?? []).filter(isRunning).length;
}

/** What the sidebar shows under the card of an agent: the rows shown, and how many there are in all. */
export interface BgList {
  running: BgRow[];
  runningTotal: number;
  finished: BgRow[];
  finishedTotal: number;
}

/**
 * The list under the card of an agent: five of the tasks running and ten of those ended, unless the reader unrolled the
 * list (`open`). Null for an agent that never had a task (or whose plan was reset since).
 */
export function sidebarBg(plan: PlanState | undefined, open: { running?: boolean; finished?: boolean } = {}): BgList | null {
  const rows = bgRows(plan);
  if (!rows.length) return null;
  const running = rows.filter(isRunning);
  const finished = rows.filter((r) => !isRunning(r));
  return {
    running: open.running ? running : running.slice(0, BG_RUNNING_SHOWN),
    runningTotal: running.length,
    finished: open.finished ? finished : finished.slice(0, BG_FINISHED_SHOWN),
    finishedTotal: finished.length,
  };
}

/** What a kind of row is, in the words of the window. */
export const kindLabel = (kind: BgRowKind) => t(`bgtasks.kind.${kind}`);

/** How a row is going, in the words of the window. */
export const statusLabel = (status: RunStatus) => t(`bgtasks.status.${status}`);

/** The title of a row: its own, else the first line of its command, else what it is. */
export function rowTitle(row: Pick<BgRow, 'kind' | 'title' | 'command'>): string {
  const title = row.title.trim();
  if (title) return title;
  const line = row.command?.split('\n').find((l) => l.trim());
  return line?.trim() || kindLabel(row.kind);
}

/**
 * The second line of a row in the sidebar: what it is, then what it does while it runs (the phase of a workflow, else the
 * command line when the title did not say it), or how it ended once over (with the exit code Claude Code gave).
 */
export function rowLine(row: Pick<BgRow, 'kind' | 'title' | 'status' | 'command' | 'now' | 'summary'>): string {
  const parts: string[] = [kindLabel(row.kind)];
  if (isRunning(row)) {
    const line =
      row.now?.trim() ||
      row.command
        ?.split('\n')
        .find((l) => l.trim())
        ?.trim();
    // A title that is the command itself says it already.
    if (line && line !== rowTitle(row)) parts.push(line);
  } else {
    const code = exitCode(row);
    parts.push(statusLabel(row.status) + (code !== null ? ` (${t('bgtasks.exitShort', { code })})` : ''));
  }
  return parts.join(' · ');
}

/** How long it ran, in ms: until `now` while it runs; null once it ended without telling when. */
export function bgDuration(row: Pick<BgRow, 'status' | 'startedAt' | 'endedAt'>, now: number): number | null {
  if (isRunning(row)) return Math.max(0, now - row.startedAt);
  return row.endedAt === undefined ? null : Math.max(0, row.endedAt - row.startedAt);
}

/** The exit code in Claude Code's words on a command ("completed (exit code 0)", "failed with exit code 3"), when they say one. */
export function exitCode(row: Pick<BgRow, 'summary'>): number | null {
  const m = row.summary?.match(/exit code (-?\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Whether a kind of row has an output to follow: a command and a monitor have, the others write to no stream of their own. */
export const hasOutput = (kind: BgRowKind) => kind === 'command' || kind === 'monitor';

/** The subagent that launched a row (its `parent` is that subagent's task id), if the plan still lists it. */
export function ownerOf(plan: PlanState | undefined, row: Pick<BgRow, 'parent'>): SubAgent | undefined {
  const parent = row.parent;
  return parent ? plan?.agents.find((a) => a.taskId === parent) : undefined;
}

// Escape sequences, from the longest forms to the shortest. The unfinished ones at the very end are what the tail of an
// output can hold when it is cut in the middle of one.
/** A title, a link… up to the bell or `ESC \`. */
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\][^\u0007\u001b]*$/g;
/** The device, privacy and application strings, up to `ESC \`. */
const STRING = /\u001b[PX^_][^\u001b]*(?:\u001b\\|$)/g;
/** Colors, cursor moves, erasures: `ESC [`, parameters, the final byte. */
const CSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\[[0-?]*[ -/]*$/g;
/** A character set (`ESC ( B`) and the like: intermediates, then a final byte. */
const NF = /\u001b[ -/]+[0-~]/g;
/** A keypad mode, a reset (`ESC =`, `ESC c`): one byte after the escape. */
const SHORT = /\u001b[0-~]/g;
/** The control characters (a stray escape included), but the line feed, the tab and the carriage return (a line's own). */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * An output as a reader wants it: without the escape sequences of a terminal (colors, titles, cursor moves) and the
 * control characters, with its lines as they are. The line ends of Windows are lines; a carriage return that redraws a
 * line (a progress bar) leaves what the line said last, as a terminal would show it.
 */
export function cleanOutput(text: string): string {
  return text
    .replace(OSC, '')
    .replace(STRING, '')
    .replace(CSI, '')
    .replace(NF, '')
    .replace(SHORT, '')
    .replace(CONTROL, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const parts = line.split('\r');
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i]) return parts[i];
      return '';
    })
    .join('\n');
}
