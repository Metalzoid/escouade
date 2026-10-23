// The agents' sidebar of the 2.0 design (lot 3): the order of its cards, what each card says the agent does, and the
// question an agent waits on, answered from the list without leaving the conversation open (docs/TODO-2.0.md,
// « Nouveautés »).

import { capsOf, showsCost } from './engines';
import { fInt, fTok } from './format';
import { t } from './i18n';
import { fSpentUsd, spent } from './spend';
import type { Pending } from './later';
import { SUMMED_UP } from './tools';
import type { Agent } from './types';

/** The agents of the sidebar: who waits for an answer goes first, the others keep their order. */
export function sidebarOrder(agents: Agent[]): Agent[] {
  return [...agents.filter((a) => a.status === 'waiting'), ...agents.filter((a) => a.status !== 'waiting')];
}

/** The line of a card under its model: what the agent does during a turn, or what its last turns changed. */
export type CardActivity =
  { kind: 'doing'; verb: string; what: string } | { kind: 'thinking' } | { kind: 'result'; files: number } | { kind: 'over'; goes: string };

/**
 * What the card of `a` says it does: during a turn its activity (« Lit src/db.ts », a verb then what it acts on), or that
 * it thinks; after it, the files it changed (`files`, from git), none when it changed nothing. An agent waiting for an
 * answer says its question instead. Its turn over but some of its work going on (`pending`: « Attend »), it says what goes
 * on (« 1 sous-agent, 1 tâche de fond »); a wake-up alone is said by its status.
 */
export function cardActivity(
  a: Agent,
  files: number,
  pending?: Pick<Pending, 'subagents' | 'background' | 'driven'> | null,
): CardActivity | null {
  if (a.status === 'waiting') return null;
  if (pending && (pending.subagents || pending.background || pending.driven.length)) {
    const goes = [
      pending.subagents && t('nav.sidebar.goes.subagents', { count: pending.subagents }),
      pending.background && t('nav.sidebar.goes.background', { count: pending.background }),
      pending.driven.length && t('nav.sidebar.goes.driven', { count: pending.driven.length }),
    ].filter(Boolean);
    return { kind: 'over', goes: goes.join(', ') };
  }
  if (a.status === 'running') {
    if (!a.activity) return { kind: 'thinking' };
    const at = a.activity.indexOf(' ');
    return at < 0
      ? { kind: 'doing', verb: a.activity, what: '' }
      : { kind: 'doing', verb: a.activity.slice(0, at), what: a.activity.slice(at + 1) };
  }
  return files > 0 ? { kind: 'result', files } : null;
}

/** The most characters, and lines, of what a permission acts on that the card shows whole. */
export const LIST_ARG_MAX = 160;
export const LIST_ARG_LINES = 3;
/** The most characters of what the card says besides (why the harness asks, what « always » keeps, what a form is for). */
export const LIST_NOTE_MAX = 240;

/** Questions to answer from the list, one after the other: each with its choices. `note`: what a form is for. */
export interface ListQuestions {
  kind: 'question';
  requestId: string;
  questions: { question: string; options: string[] }[];
  note: string | null;
}

/**
 * A permission to answer from the list: the tool, what it acts on, what the harness says besides (`note`), and what
 * « always » stands for, if offered: `always` (rules kept, OpenCode's pattern told in the note) or `session`.
 */
export interface ListPermission {
  kind: 'permission';
  requestId: string;
  tool: string;
  arg: string;
  note: string | null;
  always: 'always' | 'session' | null;
}

export type ListRequest = ListQuestions | ListPermission;

/** What a permission's choice does: the decision sent. */
export type ListDecision = 'allow' | 'always' | 'session' | 'deny';

/**
 * The request `a` waits on, when it can be answered from its card: only what is read whole there (« Vue d’ensemble »'s
 * rule for permissions). Questions with choices, one or several, one choice each; a permission of a tool whose summary
 * says what it asks, short enough, that the harness would not refuse by default. A question to write, of several
 * choices ticked, a plan, anything cut short or too long: answered in the conversation, which a click on the card opens.
 */
export function listRequest(a: Agent): ListRequest | null {
  const req = a.status === 'waiting' ? a.requests?.[0] : undefined;
  if (!req || req.cut) return null;
  const note = [req.description, req.reason].filter((x): x is string => !!x?.trim()).join('\n') || null;
  if ((note?.length ?? 0) > LIST_NOTE_MAX) return null;
  if (req.kind === 'question') {
    if (!req.questions.length || req.questions.some((q) => !q.options.length || q.multi)) return null;
    return { kind: 'question', requestId: req.id, questions: req.questions.map(({ question, options }) => ({ question, options })), note };
  }
  const arg = req.arg;
  if (req.defaultNo || !SUMMED_UP.has(req.tool) || !arg.trim()) return null;
  if (arg.length > LIST_ARG_MAX || arg.split('\n').length > LIST_ARG_LINES) return null;
  const always = req.canAlways ? (req.alwaysScope === 'session' ? 'session' : 'always') : null;
  return { kind: 'permission', requestId: req.id, tool: req.tool, arg, note, always };
}

/** The question of `r` to answer now, by the choices already picked (`picks`, by question): -1 once all have one. */
export function listStep(r: ListQuestions, picks: Record<string, string[]>): number {
  return r.questions.findIndex((q) => !picks[q.question]?.length);
}

/** The choices the card shows, numbered 1, 2…: the options of the question to answer, or a permission's decisions. */
export function listChoices(r: ListQuestions, picks: Record<string, string[]>): string[];
export function listChoices(r: ListRequest, picks: Record<string, string[]>): string[] | ListDecision[];
export function listChoices(r: ListRequest, picks: Record<string, string[]>): string[] | ListDecision[] {
  if (r.kind === 'permission') return r.always ? ['allow', r.always, 'deny'] : ['allow', 'deny'];
  return r.questions[listStep(r, picks)]?.options ?? [];
}

/**
 * The choice a key picks on the list: 1, 2… (0, 1… here), by the digit typed or, without Shift, by the key of the digit
 * row (AZERTY types « & é " » there). Never with a modifier (Ctrl+1 goes to a project, Alt+1 answers in the
 * conversation), nor a key held down.
 */
export function listDigit(e: KeyboardEvent): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
  const d = /^[1-9]$/.exec(e.key)?.[0] ?? (!e.shiftKey ? /^Digit([1-9])$/.exec(e.code)?.[1] : undefined);
  return d ? Number(d) - 1 : null;
}

/**
 * The agent the keys of the list answer: the one whose card has the focus, else the first one that can be answered there.
 * A card with the focus that waits for what is answered in its conversation takes them: no other agent is answered.
 */
export function listTarget(order: Agent[], focused: string | null): Agent | null {
  const mine = order.find((a) => a.id === focused);
  if (mine?.status === 'waiting') return listRequest(mine) ? mine : null;
  return order.find((a) => listRequest(a)) ?? null;
}

/**
 * What `a` has spent, on its card: its tokens and its cost (« ≈ » when estimated), or its credits and their cost for a
 * harness whose limit is the month's credits (Copilot CLI, a credit costing $0.01): what it counts in. Tokens alone for a
 * harness that tells no cost.
 */
export function cardSpend(a: Agent): string {
  const s = spent(a);
  if (!showsCost(a)) return fTok(s.tokens);
  const credits = Math.round(s.cost * 100);
  const used = capsOf(a.engine)?.quota === 'credits' ? t('nav.sidebar.credits', { count: credits, n: fInt(credits) }) : fTok(s.tokens);
  return `${used} · ${fSpentUsd(s)}`;
}
