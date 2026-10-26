// A reading of a project's workflows (`WorkflowScan`) as the backend gives it for the frozen copy of GSD
// (tests/fixtures/workflows/gsd): four steps, their subagents, the way back from verifying, a command alone.
import type { Workflow, WorkflowScan, WorkflowStep } from '../lib/types';

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
      role: 'step' as const,
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
    stateFiles: [{ path: '.planning/STATE.md', exists: true }],
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
