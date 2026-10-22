import { beforeEach, describe, expect, it } from 'vitest';
import { drivenAgents, pendingFor, pendingLabel, pendingText, pendingWakes } from './later';
import { setLang } from './i18n';
import { agent, ticket } from '../test/ipc';
import type { Agent, PlanState, Ticket, Wake } from './types';

const NOW = new Date(2026, 9, 22, 8, 16).getTime();
const plan = (over: Partial<PlanState> = {}): PlanState => ({
  source: null,
  tasks: [],
  agents: [],
  launched: 0,
  workflows: [],
  bgTasks: [],
  ...over,
});
const wake = (over: Partial<Wake> = {}): Wake => ({ id: 'j1', kind: 'cron', at: NOW + 60_000, recurring: false, durable: false, ...over });
const byId = (...list: Agent[]) => Object.fromEntries(list.map((a) => [a.id, a]));
const tickets = (...list: Ticket[]) => Object.fromEntries(list.map((t) => [t.id, t]));

beforeEach(() => setLang('fr'));

describe('pendingWakes', () => {
  it('keeps those to come, the next first, and a recurring job past its first time', () => {
    const p = plan({
      wakes: [
        wake({ id: 'late', at: NOW + 120_000 }),
        wake({ id: 'fired', at: NOW - 1 }),
        wake({ id: 'soon', at: NOW + 1_000 }),
        wake({ id: 'daily', at: NOW - 5, recurring: true }),
      ],
    });
    expect(pendingWakes(p, NOW).map((w) => w.id)).toEqual(['daily', 'soon', 'late']);
    expect(pendingWakes(undefined, NOW)).toEqual([]);
  });
});

describe('drivenAgents', () => {
  const chef = agent({ id: 'chef', name: 'deploiement-socle' });
  const a7 = agent({ id: 'a7', name: 'pr-148', status: 'running' });
  const a9 = agent({ id: 'a9', name: 'issue-53', status: 'waiting' });
  const idle = agent({ id: 'a3', name: 'fini', status: 'done' });
  const gone = agent({ id: 'a4', name: 'archivé', status: 'running', archived: true });
  const t148 = ticket({ id: 't148', key: 'SOC-148', agentId: 'a7' });
  const t53 = ticket({ id: 't53', key: 'SOC-53', agentId: 'a9' });

  it('gives those at work, by their id or their ticket (key or id), the latest driven first, once', () => {
    const p = plan({
      driven: [
        { agent: 'a7', at: 1 },
        { ticket: 'SOC-53', at: 2 },
        { ticket: 't148', at: 3 },
        { agent: 'a3', at: 4 },
        { agent: 'a4', at: 5 },
        { agent: 'nobody', at: 6 },
        { ticket: 'SOC-999', at: 7 },
        { agent: 'chef', at: 8 },
      ],
    });
    const agents = byId(chef, a7, a9, idle, gone);
    expect(drivenAgents(p, agents, tickets(t148, t53), 'chef').map((a) => a.id)).toEqual(['a7', 'a9']);
    expect(drivenAgents(undefined, agents, {}, 'chef')).toEqual([]);
  });
});

describe('pendingFor', () => {
  const worker = agent({ id: 'w', name: 'pr-148', status: 'running' });

  it('is nothing while its turn runs, or when nothing goes on', () => {
    expect(pendingFor(agent({ status: 'running', plan: plan({ wakes: [wake()] }) }), {}, {}, NOW)).toBeNull();
    expect(pendingFor(agent({ status: 'done', plan: plan() }), {}, {}, NOW)).toBeNull();
    expect(pendingFor(agent({ status: 'done' }), {}, {}, NOW)).toBeNull();
    // A wake-up that fired, and a driven agent that is done: nothing.
    const a = agent({ status: 'done', plan: plan({ wakes: [wake({ at: NOW - 1 })], driven: [{ agent: 'x', at: 1 }] }) });
    expect(pendingFor(a, byId(agent({ id: 'x', status: 'done' })), {}, NOW)).toBeNull();
  });

  it('counts what it left running, its next wake-up and the agents it drives, once its turn is over', () => {
    const a = agent({
      status: 'idle',
      plan: plan({
        agents: [
          { id: 's1', title: 'sous', status: 'running', background: true, tools: 0, startedAt: 1 },
          { id: 's2', title: 'fini', status: 'done', background: true, tools: 0, startedAt: 1 },
        ],
        bgTasks: [{ id: 'b1', kind: 'command', title: 'Wait until PR 148 checks finish', status: 'running', startedAt: 1 }],
        wakes: [wake({ prompt: 'Vérifie les checks de la PR 148' })],
        driven: [{ agent: 'w', at: 1 }],
      }),
    });
    const p = pendingFor(a, byId(a, worker), {}, NOW)!;
    expect(p.subagents).toBe(1);
    expect(p.background).toBe(1);
    expect(p.wake?.id).toBe('j1');
    expect(p.driven.map((d) => d.name)).toEqual(['pr-148']);
    expect(pendingLabel(p, NOW)).toBe('Attend');
    expect(pendingText(p, NOW)).toBe(
      [
        'Son tour est fini, mais il attend :',
        '1 sous-agent en cours',
        '1 tâche de fond en cours',
        '1 agent piloté au travail : pr-148',
        'Claude Code le relance à 08:17 (Vérifie les checks de la PR 148)',
      ].join('\n'),
    );
    // The background tasks of a harness that has none are not counted.
    expect(pendingFor(a, byId(a, worker), {}, NOW, false)!.background).toBe(0);
  });

  it('says the wake-up itself when that is all there is', () => {
    const a = agent({ status: 'done', plan: plan({ wakes: [wake({ kind: 'loop', id: 'loop' })] }) });
    const p = pendingFor(a, {}, {}, NOW)!;
    expect(pendingLabel(p, NOW)).toBe('Réveil à 08:17');
    // A recurring job past its first time: its schedule, no time.
    const daily = pendingFor(
      agent({ status: 'done', plan: plan({ wakes: [wake({ at: NOW - 1, recurring: true, schedule: '0 9 * * *' })] }) }),
      {},
      {},
      NOW,
    )!;
    expect(pendingLabel(daily, NOW)).toBe('Attend');
    expect(pendingText(daily, NOW)).toContain('Claude Code le relance selon « 0 9 * * * »');
  });

  it('speaks English', () => {
    setLang('en');
    const a = agent({ status: 'done', plan: plan({ wakes: [wake()], driven: [{ agent: 'w', at: 1 }] }) });
    const p = pendingFor(a, byId(a, worker), {}, NOW)!;
    expect(pendingLabel(p, NOW)).toBe('Awaiting');
    expect(pendingText(p, NOW)).toContain('1 driven agent at work: pr-148');
    expect(pendingLabel(pendingFor(agent({ status: 'done', plan: plan({ wakes: [wake()] }) }), {}, {}, NOW)!, NOW)).toMatch(/^Wakes /);
  });
});
