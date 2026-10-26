// What the Workflow tab shows (ESC-194, choices 141 to 154), worked out from the reading of a project's workflows
// (ESC-192) and the tracks of its agents (ESC-193): the rail of steps and its ways back, the doors, where each agent is,
// one agent's history. Pure: the tab draws what these give.

import { t } from './i18n';
import type { Workflow, WorkflowPassage, WorkflowScan, WorkflowStep, WorkflowTrack } from './types';

/** A step's name as the rail writes it: `gsd:discuss-phase` → « Discuss phase » (the corrections rename it). */
export function stepLabel(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf(':'), name.lastIndexOf('/')) + 1).replace(/\.md$/i, '');
  const words = base.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toLocaleUpperCase() + words.slice(1) : name;
}

/** The label of a step of `w` by its name: the user's own name as is, a step as read by its command (a step gone keeps its name). */
export function labelIn(w: Workflow | null, name: string | null): string {
  if (!name) return '';
  const loop = w?.promptLoop?.steps.find((s) => String(s.n) === name || s.text === name);
  if (loop) return loop.text;
  // Named by the user (Réglages › Projets › Workflow): as they wrote it.
  return w?.steps.find((s) => s.name === name)?.named ? name : stepLabel(name);
}

/** The workflow's name in the menu: a repository's own carries the repository's (choice 155). */
export const workflowTitle = (w: Workflow) => (w.repo ? t('workflow.inRepo', { repo: w.repo, name: w.name }) : w.name);

/**
 * The workflow the tab shows: the one chosen in its menu, else the open agent's, else the one most agents follow, else
 * the first read.
 */
export function pickWorkflow(scan: WorkflowScan | null, tracks: WorkflowTrack[], openAgent: string | null, chosen: string | null) {
  const all = scan?.workflows ?? [];
  if (!all.length) return null;
  const byId = (id: string | null | undefined) => (id ? all.find((w) => w.id === id) : undefined);
  const mine = byId(tracks.find((tr) => tr.agentId === openAgent)?.workflow);
  if (byId(chosen)) return byId(chosen)!;
  if (mine) return mine;
  const count = (w: Workflow) => tracks.filter((tr) => tr.workflow === w.id).length;
  return [...all].sort((a, b) => count(b) - count(a))[0];
}

/** « phase 3 sur 6 », as a state file of the workflow says it. */
export function phaseOf(w: Workflow): { done: number; total: number; file: string } | null {
  for (const f of w.stateFiles) if (f.says?.phase) return { ...f.says.phase, file: f.path };
  return null;
}

/** The steps in their order on the rail. */
export const stepsOf = (w: Workflow) => [...w.steps].sort((a, b) => a.order - b.order);

/** The doors in the head of the tab: those that are no step of the rail, the most launched first, the entries before the rest. */
export function doorsOf(w: Workflow, tracks: WorkflowTrack[]) {
  const steps = new Set(w.steps.map((s) => s.command));
  const launched = (cmd: string) => tracks.reduce((n, tr) => n + tr.passages.filter((p) => p.door?.split(/\s/)[0] === cmd).length, 0);
  const rank = { entry: 0, step: 1, other: 2 } as const;
  return w.doors
    .filter((d) => !steps.has(d.command) && d.command)
    .map((d) => ({ door: d, n: launched(d.command) }))
    .sort((a, b) => b.n - a.n || rank[a.door.role] - rank[b.door.role] || a.door.command.localeCompare(b.door.command))
    .map((x) => x.door);
}

/** A file by its name alone: `.planning/phases/{phase}/PLAN.md` → `PLAN.md`. */
export const fileName = (p: string) => p.split(/[\\/]/).pop() || p;

/** A line the workflow wrote (its exit), without the backticks of its Markdown. */
export const plainLine = (line: string) => line.replace(/`([^`]*)`/g, '$1');

/** How many doors the head shows before « +n ». */
export const DOORS_SHOWN = 3;

/** What a step of the rail says under its name: its subagents and their rounds, the files it writes, its ways back. */
export function stepDetail(w: Workflow, s: WorkflowStep) {
  const self = w.transitions.find((tr) => tr.back && tr.from === s.name && tr.to === s.name);
  const back = w.transitions
    .filter((tr) => tr.back && tr.from === s.name && tr.to !== s.name)
    .map((tr) => ({ to: tr.to, condition: tr.condition }));
  return {
    agents: s.agents.map((a) => a.name),
    rounds: self?.max ?? null,
    writes: [...new Set(s.writes.map(fileName))].slice(0, 2),
    back,
  };
}

/**
 * The ways back drawn in the gutter, by the index of their steps on the rail: from a later step to an earlier one
 * (a step back to itself is said in its detail, « jusqu'à 3 tours »).
 */
export function backArcs(w: Workflow, names: string[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const tr of w.transitions) {
    const from = names.indexOf(tr.from);
    const to = names.indexOf(tr.to);
    if (!tr.back || from < 0 || to < 0 || to >= from || seen.has(`${from},${to}`)) continue;
    seen.add(`${from},${to}`);
    out.push([from, to]);
  }
  return out;
}

/** The tracks of the agents that follow `w`, in the workflow now or out of it for a while. */
export const tracksIn = (w: Workflow, tracks: WorkflowTrack[]) => tracks.filter((tr) => tr.workflow === w.id);

/** The passages of one workflow, the current phase only: since the last time the agent came in by the first step. */
export function currentPhase(w: Workflow, passages: WorkflowPassage[]): WorkflowPassage[] {
  const mine = passages.filter((p) => p.workflow === w.id);
  const first = stepsOf(w)[0]?.name;
  let start = 0;
  for (let i = mine.length - 1; i > 0; i--)
    if (mine[i].step === first && mine[i - 1].step !== first) {
      start = i;
      break;
    }
  return mine.slice(start);
}

/** The barrettes of an agent's row: one per step, done before its own, on for its own. */
export function pipsOf(w: Workflow, tr: WorkflowTrack): ('done' | 'on' | '')[] {
  const steps = stepsOf(w);
  const passed = new Set(
    currentPhase(w, tr.passages)
      .filter((p) => p.outcome !== 'running')
      .map((p) => p.step),
  );
  const at = steps.findIndex((s) => s.name === tr.step);
  return steps.map((s, i) => (i === at && !tr.outside ? 'on' : (at >= 0 ? i < at : passed.has(s.name)) ? 'done' : ''));
}

/** How long a passage took, or has taken so far. */
export const passageMs = (p: WorkflowPassage, now: number) => (p.outcome === 'running' ? Math.max(p.ms, now - p.at) : p.ms);

/** The strip in time of an agent's history: a shade of ink per step, red for a failure or a way back, green for now. */
export function stripOf(w: Workflow, passages: WorkflowPassage[], now: number) {
  const names = stepsOf(w).map((s) => s.name);
  return passages.map((p) => {
    const i = p.step ? names.indexOf(p.step) : -1;
    const cls =
      p.outcome === 'running'
        ? 'on'
        : p.outcome === 'back' || p.outcome === 'failed'
          ? 'bad'
          : p.step === null
            ? 'out'
            : `s${(Math.max(i, 0) % 4) + 1}`;
    return { cls, flex: Math.max(passageMs(p, now) / 60_000, 0.4), step: p.step };
  });
}

/** A piece of a line of the history: in mono (a name of the workflow's own) or not. */
export interface Bit {
  text: string;
  mono?: boolean;
}

/** What was done in a passage, said short: « 2 gsd-executor », « skill brainstorming », « STATE.md écrit ». */
export function didOf(p: WorkflowPassage): Bit[] {
  const agents = new Map<string, number>();
  const out: Bit[] = [];
  if (p.door) out.push({ text: p.door, mono: true });
  for (const d of p.did) {
    const [kind, ...rest] = d.split(':');
    const what = rest.join(':');
    if (kind === 'agent') agents.set(what, (agents.get(what) ?? 0) + 1);
  }
  for (const [name, n] of agents) out.push({ text: n > 1 ? `${n} ${name}` : name, mono: true });
  for (const d of p.did) {
    const [kind, ...rest] = d.split(':');
    const what = rest.join(':');
    if (kind === 'skill') out.push({ text: what, mono: true });
    if (kind === 'file') out.push({ text: t('workflow.written', { file: what.split('/').pop() ?? what }) });
  }
  return out;
}

/** One line of an agent's history. */
export interface HistoryRow {
  key: string;
  at: number;
  cls: '' | 'on' | 'bad' | 'back' | 'out';
  /** The line of a way back: the restart icon in place of the dot. */
  backLine: boolean;
  what: string;
  sub: Bit[];
  ms: number | null;
  cost: number | null;
}

/** The lines of an agent's history in `w`, oldest first: a line per passage, and one more for each way back. */
export function historyRows(w: Workflow, passages: WorkflowPassage[], now: number, costKnown = true): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const p of passages) {
    const label = p.step ? labelIn(w, p.step) : t('workflow.outside');
    const num = { ms: passageMs(p, now), cost: costKnown ? p.cost : null };
    if (p.step === null) {
      rows.push({ key: `${p.n}`, at: p.at, cls: 'out', backLine: false, what: label, sub: p.doing ? [{ text: p.doing }] : [], ...num });
      continue;
    }
    const cls = p.outcome === 'running' ? 'on' : p.outcome === 'back' || p.outcome === 'failed' ? 'bad' : '';
    const what =
      p.outcome === 'failed'
        ? t('workflow.failed', { step: label })
        : p.outcome === 'stopped'
          ? t('workflow.stopped', { step: label })
          : label;
    const sub = p.outcome === 'back' && p.reason ? [{ text: p.reason }] : didOf(p);
    rows.push({ key: `${p.n}`, at: p.at, cls, backLine: false, what, sub, ...num });
    if (p.outcome === 'back' && p.backTo) {
      const by: Bit[] = p.decidedBy ? [{ text: p.decidedBy.split('/').pop() ?? p.decidedBy, mono: true }] : [];
      rows.push({
        key: `${p.n}-back`,
        at: p.ended ?? p.at,
        cls: 'back',
        backLine: true,
        what: t('workflow.backLine', { step: labelIn(w, p.backTo) }),
        sub: by.length ? [{ text: t('workflow.decidedBy', { file: by[0].text }), mono: false }] : [],
        ms: null,
        cost: null,
      });
    }
  }
  return rows;
}

/** The turns of a prompt loop, for its grid: done (ticked or not), now, and to come up to its maximum. */
export function turnsGrid(tr: WorkflowTrack | null, max: number | null): { n: number; cls: 'ok' | 'bad' | 'on' | 'todo' }[] {
  const done = (tr?.turns ?? []).map((u) => ({
    n: u.n,
    cls: u.outcome === 'running' ? ('on' as const) : u.ticked === false || u.outcome === 'failed' ? ('bad' as const) : ('ok' as const),
  }));
  const last = done.length ? done[done.length - 1].n : 0;
  const todo = Array.from({ length: Math.max(0, (max ?? 0) - last) }, (_, i) => ({ n: last + i + 1, cls: 'todo' as const }));
  return [...done, ...todo];
}

/** The boxes of a prompt loop's list: from the last turn that read them, else from the reading. */
export function checkedOf(w: Workflow, tr: WorkflowTrack | null) {
  const turn = [...(tr?.turns ?? [])].reverse().find((u) => u.checked);
  return turn?.checked ?? w.promptLoop?.list?.says?.checked ?? null;
}

/** The count of the Workflow tab: the agents that follow a workflow of the project. */
export const followers = (tracks: WorkflowTrack[]) => tracks.filter((tr) => tr.workflow !== null).length;
