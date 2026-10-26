// Readings of workflows for the tests. First (ESC-195), a reading of a project's workflows (`WorkflowScan`) as the
// backend gives it for the frozen copy of GSD (tests/fixtures/workflows/gsd): four steps, their subagents, the way back
// from verifying, a command alone.
import type { Workflow, WorkflowPassage, WorkflowScan, WorkflowStep, WorkflowTrack } from '../lib/types';

const step = (name: string, order: number, agents: string[] = [], over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  name,
  command: `/${name}`,
  order,
  description: '',
  path: `~/.claude/commands/${name.replace(':', '/')}.md`,
  agents: agents.map((a) => ({ name: a, path: `~/.claude/agents/${a}.md`, description: '' })),
  reads: [],
  writes: [],
  ...over,
});

export function gsdWorkflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: '|claude|gsd',
    name: 'GSD',
    kind: 'cycle',
    harness: 'claude',
    repo: '',
    doors: ['discuss-phase', 'plan-phase', 'execute-phase', 'verify-work', 'autonomous', 'help'].map((n) => ({
      name: `gsd:${n}`,
      command: `/gsd:${n}`,
      kind: 'command' as const,
      scope: 'user' as const,
      path: `~/.claude/commands/gsd/${n}.md`,
      description: '',
      role: 'step' as const,
      enters: [],
    })),
    steps: [
      step('gsd:discuss-phase', 0),
      step('gsd:plan-phase', 1, ['gsd-planner', 'gsd-plan-checker']),
      step('gsd:execute-phase', 2, ['gsd-executor']),
      step('gsd:verify-work', 3, ['gsd-verifier']),
    ],
    transitions: [
      { from: 'gsd:discuss-phase', to: 'gsd:plan-phase', back: false, condition: null, max: null },
      { from: 'gsd:plan-phase', to: 'gsd:execute-phase', back: false, condition: null, max: null },
      { from: 'gsd:execute-phase', to: 'gsd:verify-work', back: false, condition: null, max: null },
      { from: 'gsd:verify-work', to: 'gsd:plan-phase', back: true, condition: 'gaps found', max: null },
      { from: 'gsd:plan-phase', to: 'gsd:plan-phase', back: true, condition: 'max 3 iterations', max: 3 },
    ],
    stateFiles: [{ path: '.planning/STATE.md', exists: true, writtenBy: [], readBy: [], says: null }],
    exit: null,
    promptLoop: null,
    ...over,
  };
}

export function gsdScan(over: Partial<WorkflowScan> = {}): WorkflowScan {
  const src = (path: string, kind: string) => ({ path, kind, modified: 1, len: 10 });
  return {
    readAt: new Date(2026, 9, 26, 10, 12).getTime(),
    workflows: [gsdWorkflow()],
    alone: [{ name: 'commit', command: '/commit', harness: 'claude', repo: '', path: '.claude/commands/commit.md', description: '' }],
    untraced: [],
    sources: [
      ...['discuss-phase', 'plan-phase', 'execute-phase', 'verify-work'].map((n) => src(`~/.claude/commands/gsd/${n}.md`, 'command')),
      ...['gsd-planner', 'gsd-plan-checker', 'gsd-executor'].map((n) => src(`~/.claude/agents/${n}.md`, 'agent')),
      ...['plan-phase', 'execute-phase'].map((n) => src(`~/.claude/get-shit-done/workflows/${n}.md`, 'include')),
      src('.planning/STATE.md', 'state'),
      src('CLAUDE.md', 'instruction'),
      { path: '.planning/GONE.md', kind: 'state', modified: 0, len: 0 },
    ],
    searched: [],
    ...over,
  };
}

// ---------- The Workflow tab (ESC-194): GSD and Ralph as the rules read them (tests/fixtures/workflows), agents in them ----------

const tabDoor = (name: string, role: 'entry' | 'step' | 'other', enters: string[] = []) => ({
  name,
  command: `/${name}`,
  kind: 'command' as const,
  scope: 'user' as const,
  path: `~/.claude/commands/${name.replace(':', '/')}.md`,
  description: '',
  role,
  enters,
});

const tabStep = (name: string, order: number, agents: string[] = [], writes: string[] = []) => ({
  name,
  command: `/${name}`,
  order,
  description: '',
  path: `~/.claude/commands/${name.replace(':', '/')}.md`,
  agents: agents.map((a) => ({ name: a, path: `~/.claude/agents/${a}.md`, description: '' })),
  reads: [],
  writes,
});

export const GSD_ID = '|claude|gsd';

export function gsd(): Workflow {
  return {
    id: GSD_ID,
    name: 'GSD',
    kind: 'cycle',
    harness: 'claude',
    repo: '',
    doors: [
      tabDoor('gsd:discuss-phase', 'entry'),
      tabDoor('gsd:plan-phase', 'step'),
      tabDoor('gsd:execute-phase', 'step'),
      tabDoor('gsd:verify-work', 'step'),
      tabDoor('gsd:autonomous', 'entry', ['gsd:discuss-phase', 'gsd:plan-phase']),
      tabDoor('gsd:progress', 'entry'),
      tabDoor('gsd:help', 'other'),
      tabDoor('gsd:quick', 'other'),
      tabDoor('gsd:next', 'entry'),
    ],
    steps: [
      tabStep('gsd:discuss-phase', 0, [], ['.planning/CONTEXT.md']),
      tabStep('gsd:plan-phase', 1, ['gsd-phase-researcher', 'gsd-planner', 'gsd-plan-checker']),
      tabStep('gsd:execute-phase', 2, ['gsd-executor'], ['.planning/STATE.md']),
      tabStep('gsd:verify-work', 3, ['gsd-verifier']),
    ],
    transitions: [
      { from: 'gsd:discuss-phase', to: 'gsd:plan-phase', back: false, condition: null, max: null },
      { from: 'gsd:plan-phase', to: 'gsd:execute-phase', back: false, condition: null, max: null },
      { from: 'gsd:execute-phase', to: 'gsd:verify-work', back: false, condition: null, max: null },
      { from: 'gsd:plan-phase', to: 'gsd:plan-phase', back: true, condition: 'iteration_count < 3', max: 3 },
      { from: 'gsd:verify-work', to: 'gsd:plan-phase', back: true, condition: 'If gaps are found, run /gsd:plan-phase --gaps', max: null },
    ],
    stateFiles: [
      {
        path: '.planning/STATE.md',
        exists: true,
        writtenBy: ['gsd:execute-phase'],
        readBy: ['gsd:plan-phase'],
        says: { phase: { done: 3, total: 6 }, checked: null, status: 'executing' },
      },
    ],
    exit: 'The milestone is complete when all phases are complete.',
    promptLoop: null,
  };
}

export const RALPH_ID = '|prompt|ralph';

export function ralph(): Workflow {
  return {
    id: RALPH_ID,
    name: 'Ralph',
    kind: 'prompt',
    harness: null,
    repo: '',
    doors: [{ ...tabDoor('PROMPT.md', 'entry'), command: 'PROMPT.md', kind: 'command' }],
    steps: [],
    transitions: [],
    stateFiles: [],
    exit: null,
    promptLoop: {
      via: 'file',
      prompt: 'PROMPT.md',
      list: {
        path: 'fix_plan.md',
        exists: true,
        writtenBy: [],
        readBy: [],
        says: { phase: null, checked: { done: 3, total: 6 }, status: null },
      },
      steps: [
        { n: 1, text: 'Pick the most important unchecked item' },
        { n: 2, text: 'Implement it, and only it.' },
        { n: 3, text: 'Run the tests' },
        { n: 4, text: 'Check the box and commit' },
      ],
      returns: [{ from: '3', to: '2', back: true, condition: 'If they are red', max: 3 }],
      maxTurns: 20,
    },
  };
}

export function scanOf(...ws: Workflow[]): WorkflowScan {
  return {
    readAt: new Date(2026, 9, 26, 10, 12).getTime(),
    workflows: ws,
    alone: [],
    untraced: [],
    sources: [],
    searched: ['.claude/commands', '.claude/skills', '.claude/agents', '~/.claude/commands'],
  };
}

const T0 = new Date(2026, 9, 26, 10, 0).getTime();
const MIN = 60_000;

/** A passage `min` minutes after 10:00, lasting `len` minutes. */
export function passage(
  n: number,
  stepName: string | null,
  min: number,
  len: number,
  more: Partial<WorkflowPassage> = {},
): WorkflowPassage {
  return {
    n,
    workflow: GSD_ID,
    step: stepName,
    version: 'v1',
    pass: 1,
    door: null,
    at: T0 + min * MIN,
    ended: more.outcome === 'running' ? null : T0 + (min + len) * MIN,
    ms: len * MIN,
    cost: len * 0.05,
    did: [],
    outcome: 'done',
    reason: null,
    decidedBy: null,
    backTo: null,
    doing: null,
    ...more,
  };
}

export function track(agentId: string, more: Partial<WorkflowTrack> = {}): WorkflowTrack {
  return {
    agentId,
    projectId: 'p1',
    workflow: GSD_ID,
    step: null,
    version: 'v1',
    outside: null,
    subagents: [],
    passages: [],
    turns: [],
    support: { partial: false, missing: [] },
    since: T0,
    ms: 0,
    cost: 0,
    ticketLoop: null,
    updated: T0,
    behind: false,
    ...more,
  };
}

/** pagination-users as the preview draws it: through a phase, back from Verify to Plan, on Verify again. */
export function paginationUsers(agentId = 'a1'): WorkflowTrack {
  const passages = [
    passage(1, 'gsd:discuss-phase', 0, 4, { door: '/gsd:discuss-phase 3', did: ['file:.planning/CONTEXT.md'] }),
    passage(2, 'gsd:plan-phase', 4, 9, { did: ['agent:gsd-planner', 'agent:gsd-plan-checker'] }),
    passage(3, 'gsd:execute-phase', 13, 21, { did: ['agent:gsd-executor', 'agent:gsd-executor', 'agent:gsd-executor'] }),
    passage(4, 'gsd:verify-work', 34, 3, {
      outcome: 'back',
      reason: '2 écarts : le curseur n’est pas validé',
      decidedBy: '~/.claude/get-shit-done/workflows/verify-work.md',
      backTo: 'gsd:plan-phase',
    }),
    passage(5, 'gsd:plan-phase', 37, 4, { pass: 2, door: '/gsd:plan-phase 3 --gaps' }),
    passage(6, 'gsd:execute-phase', 41, 6, { pass: 2, did: ['agent:gsd-executor'] }),
    passage(7, 'gsd:verify-work', 47, 1, { pass: 2, outcome: 'running', did: ['agent:gsd-verifier'] }),
  ];
  return track(agentId, { step: 'gsd:verify-work', subagents: ['gsd-verifier'], passages, ms: 48 * MIN, cost: 3.91 });
}
