// What still goes on for an agent once its turn is over (ESC-138): what it left running in the background (its
// subagents, its commands, monitors and workflows), the times Claude Code will start a turn by itself (`PlanState.wakes`)
// and the agents of Escouade it set to work through the MCP server (`PlanState.driven`). The card says « Attend » instead
// of « Terminé » while any of it goes on, and the sidebar lists the agents it drives under its card.

import { bgCount } from './bgtasks';
import { fWhen } from './format';
import { t } from './i18n';
import type { Agent, PlanState, Ticket, Wake } from './types';

/** The wake-ups still to come at `now`, the next first: a one-shot one whose time passed has fired. */
export function pendingWakes(plan: PlanState | undefined, now: number): Wake[] {
  return (plan?.wakes ?? []).filter((w) => w.recurring || w.at > now).sort((a, b) => a.at - b.at);
}

/** An agent at work: its turn runs, or it waits for an answer. */
const working = (a: Agent) => a.status === 'running' || a.status === 'waiting';

/**
 * The agents of Escouade that `plan`'s agent drives and that are at work, the latest driven first: those it wrote to or
 * created, and the agents of the tickets it started, sent back or resumed (named by their key or their id). Never itself.
 */
export function drivenAgents(
  plan: PlanState | undefined,
  agents: Record<string, Agent>,
  tickets: Record<string, Ticket>,
  self?: string,
): Agent[] {
  const out: Agent[] = [];
  for (const d of [...(plan?.driven ?? [])].reverse()) {
    let id = d.agent;
    if (!id && d.ticket) {
      const ticket = tickets[d.ticket] ?? Object.values(tickets).find((x) => x.key === d.ticket);
      id = ticket?.agentId ?? undefined;
    }
    const a = id ? agents[id] : undefined;
    if (a && a.id !== self && !a.archived && working(a) && !out.includes(a)) out.push(a);
  }
  return out;
}

/** What still goes on for an agent whose turn is over: counts, the next wake-up, the agents it drives at work. */
export interface Pending {
  subagents: number;
  background: number;
  wake?: Wake;
  driven: Agent[];
}

/** What still goes on for `a` once its turn is over (`done` or `idle`); null while its turn runs, or when nothing does. */
export function pendingFor(
  a: Agent,
  agents: Record<string, Agent>,
  tickets: Record<string, Ticket>,
  now: number,
  background = true,
): Pending | null {
  if (a.status !== 'done' && a.status !== 'idle') return null;
  const plan = a.plan;
  const subagents = (plan?.agents ?? []).filter((s) => s.status === 'running').length;
  const p: Pending = {
    subagents,
    background: background ? bgCount(plan) : 0,
    wake: pendingWakes(plan, now)[0],
    driven: drivenAgents(plan, agents, tickets, a.id),
  };
  return p.subagents || p.background || p.wake || p.driven.length ? p : null;
}

/** What the card says of it, in full (its tooltip): each thing that goes on, one per line. */
export function pendingText(p: Pending, now: number): string {
  const lines = [t('bgtasks.later.intro')];
  if (p.subagents) lines.push(t('bgtasks.later.subagents', { count: p.subagents }));
  if (p.background) lines.push(t('bgtasks.later.background', { count: p.background }));
  if (p.driven.length) lines.push(t('bgtasks.later.driven', { count: p.driven.length, names: p.driven.map((a) => a.name).join(', ') }));
  if (p.wake) {
    // A recurring job past its first time: Claude Code does not tell its next one.
    const said =
      p.wake.at > now
        ? t('bgtasks.later.wake', { when: fWhen(p.wake.at, now) })
        : t('bgtasks.later.wakeRecurring', { schedule: p.wake.schedule ?? '' });
    lines.push(p.wake.prompt ? `${said} (${p.wake.prompt})` : said);
  }
  return lines.join('\n');
}

/** The card's word for it: the wake-up when that is all there is, else « Attend ». */
export function pendingLabel(p: Pending, now: number): string {
  const only = p.wake && !p.subagents && !p.background && !p.driven.length;
  return only && p.wake && p.wake.at > now ? t('bgtasks.later.wakeShort', { when: fWhen(p.wake.at, now) }) : t('bgtasks.later.awaits');
}
