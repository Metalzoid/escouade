// The agents' sidebar of the 2.0 design (lot 3): the order of its cards, what each card says the agent does, and the
// question an agent waits on, answered from the list without leaving the conversation open (docs/TODO-2.0.md,
// « Nouveautés »).

import { capsOf, showsCost } from './engines';
import { fInt, fTok } from './format';
import { t } from './i18n';
import { fSpentUsd, spent } from './spend';
import type { Pending } from './later';
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

/** A question to answer from the list: one question, its choices, and the request the answer names. */
export interface ListQuestion {
  requestId: string;
  question: string;
  options: string[];
}

/**
 * The question `a` waits on, when it can be answered from its card: a single question with choices, read whole. Several
 * questions, one to write, one cut short, a permission: answered in the conversation, where they are whole.
 */
export function listQuestion(a: Agent): ListQuestion | null {
  const req = a.status === 'waiting' ? a.requests?.[0] : undefined;
  if (!req || req.kind !== 'question' || req.cut || req.questions.length !== 1) return null;
  const [q] = req.questions;
  return q.options.length ? { requestId: req.id, question: q.question, options: q.options } : null;
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
