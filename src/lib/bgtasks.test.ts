import { describe, expect, it } from 'vitest';
import {
  BG_FINISHED_SHOWN,
  BG_RUNNING_SHOWN,
  bgCount,
  bgDuration,
  bgRow,
  bgRows,
  cleanOutput,
  exitCode,
  hasOutput,
  isRunning,
  kindLabel,
  ownerOf,
  rowLine,
  rowTitle,
  sidebarBg,
  statusLabel,
} from './bgtasks';
import { setLang } from './i18n';
import type { BgTask, PlanState, SubAgent, WorkflowRun } from './types';

const task = (id: string, over: Partial<BgTask> = {}): BgTask => ({
  id,
  kind: 'command',
  title: `tâche ${id}`,
  status: 'running',
  startedAt: 1_000,
  ...over,
});
const flow = (id: string, over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id,
  title: `workflow ${id}`,
  status: 'running',
  tools: 0,
  tokens: 0,
  startedAt: 1_000,
  ...over,
});
const planOf = (bgTasks: BgTask[], workflows: WorkflowRun[] = [], agents: SubAgent[] = []): PlanState => ({
  source: null,
  tasks: [],
  agents,
  launched: agents.length,
  workflows,
  bgTasks,
});

describe('bgRows', () => {
  it('is empty without a plan, or a plan without any', () => {
    expect(bgRows(undefined)).toEqual([]);
    expect(bgRows(planOf([]))).toEqual([]);
  });

  it('joins the tasks and the workflows of the plan, a workflow keeping its phase, its tools and its tokens', () => {
    const rows = bgRows(
      planOf(
        [task('b1', { kind: 'monitor', command: 'tail -f app.log', summary: 'Monitor "Watch" stream ended', call: 'tu1', parent: 'x' })],
        [flow('w1', { name: 'review', now: 'Phase 1 : lecteur A', tools: 3, tokens: 1_200 })],
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'b1',
      kind: 'monitor',
      title: 'tâche b1',
      command: 'tail -f app.log',
      summary: 'Monitor "Watch" stream ended',
      call: 'tu1',
      parent: 'x',
    });
    expect(rows[1]).toMatchObject({ id: 'w1', kind: 'workflow', name: 'review', now: 'Phase 1 : lecteur A', tools: 3, tokens: 1_200 });
  });

  it('puts those running first, the oldest first as the subagents are, then the finished, the latest ended first', () => {
    const rows = bgRows(
      planOf(
        [
          task('b1', { status: 'done', startedAt: 100, endedAt: 5_000 }),
          task('b2', { startedAt: 3_000 }),
          task('b3', { status: 'failed', startedAt: 200, endedAt: 9_000 }),
          task('b4', { startedAt: 1_000 }),
        ],
        [flow('w1', { startedAt: 2_000 }), flow('w2', { status: 'stopped', startedAt: 300, endedAt: 7_000 })],
      ),
    );
    expect(rows.map((r) => r.id)).toEqual(['b4', 'w1', 'b2', 'b3', 'w2', 'b1']);
  });

  it('keeps the order it was given among equals, and never lists an id twice', () => {
    const rows = bgRows(planOf([task('b1'), task('b2'), task('b1', { title: 'doublon' })], [flow('b2'), flow('w1')]));
    expect(rows.map((r) => r.id)).toEqual(['b1', 'b2', 'w1']);
    expect(rows.find((r) => r.id === 'b1')?.title).toBe('tâche b1');
    expect(rows.find((r) => r.id === 'b2')?.kind).toBe('command');
  });

  it('reads a plan from a backend that does not send the tasks yet', () => {
    const old = { source: null, tasks: [], agents: [], launched: 0, workflows: [flow('w1')] } as unknown as PlanState;
    expect(bgRows(old).map((r) => r.id)).toEqual(['w1']);
  });

  it('finds a row by its id', () => {
    const plan = planOf([task('b1')], [flow('w1')]);
    expect(bgRow(plan, 'w1')?.kind).toBe('workflow');
    expect(bgRow(plan, 'nope')).toBeUndefined();
    expect(bgRow(undefined, 'b1')).toBeUndefined();
  });
});

describe('bgCount', () => {
  it('counts what runs: commands, monitors, remote agents, teammates and workflows, not the subagents', () => {
    const sub: SubAgent = { id: 's1', title: 'sa', status: 'running', background: true, tools: 0, startedAt: 1 };
    const plan = planOf(
      [
        task('b1'),
        task('b2', { kind: 'monitor' }),
        task('b3', { kind: 'remote' }),
        task('b4', { kind: 'teammate' }),
        task('b5', { status: 'done', endedAt: 2 }),
        task('b6', { status: 'interrupted', endedAt: 2 }),
      ],
      [flow('w1'), flow('w2', { status: 'failed', endedAt: 3 })],
      [sub],
    );
    expect(bgCount(plan)).toBe(5);
  });

  it('is zero without a plan or a task', () => {
    expect(bgCount(undefined)).toBe(0);
    expect(bgCount(planOf([]))).toBe(0);
    expect(bgCount(planOf([task('b1', { status: 'stopped', endedAt: 2 })]))).toBe(0);
  });
});

describe('sidebarBg', () => {
  const many = (count: number, over: Partial<BgTask> = {}, from = 1) =>
    Array.from({ length: count }, (_, i) => task(`b${from + i}`, { ...over, ...(over.status ? { endedAt: 100_000 - i } : {}) }));

  it('is nothing for an agent that never had a task', () => {
    expect(sidebarBg(undefined)).toBeNull();
    expect(sidebarBg(planOf([]))).toBeNull();
  });

  it('splits those running from those finished, with their totals', () => {
    const list = sidebarBg(
      planOf([task('b1'), task('b2', { status: 'done', endedAt: 5 })], [flow('w1', { status: 'failed', endedAt: 9 })]),
    )!;
    expect(list.running.map((r) => r.id)).toEqual(['b1']);
    expect(list.runningTotal).toBe(1);
    expect(list.finished.map((r) => r.id)).toEqual(['w1', 'b2']);
    expect(list.finishedTotal).toBe(2);
  });

  it('shows five of those running, then all of them once unrolled', () => {
    const plan = planOf(many(12));
    const folded = sidebarBg(plan)!;
    expect(BG_RUNNING_SHOWN).toBe(5);
    expect(folded.running.map((r) => r.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(folded.runningTotal).toBe(12);
    expect(sidebarBg(plan, { running: true })!.running).toHaveLength(12);
    // Unrolling the finished ones changes nothing of the running ones.
    expect(sidebarBg(plan, { finished: true })!.running).toHaveLength(5);
  });

  it('shows ten of those finished, then all of them once unrolled, the lists capped on their own', () => {
    const plan = planOf([...many(8), ...many(15, { status: 'done' }, 100)]);
    const folded = sidebarBg(plan)!;
    expect(BG_FINISHED_SHOWN).toBe(10);
    expect(folded.running).toHaveLength(5);
    expect(folded.finished).toHaveLength(10);
    expect(folded.finished[0].id).toBe('b100');
    expect(folded.finishedTotal).toBe(15);
    const all = sidebarBg(plan, { running: true, finished: true })!;
    expect(all.running).toHaveLength(8);
    expect(all.finished).toHaveLength(15);
  });

  it('has nothing to unroll for exactly the number shown', () => {
    const list = sidebarBg(planOf([...many(5), ...many(10, { status: 'done' }, 100)]))!;
    expect(list.running).toHaveLength(list.runningTotal);
    expect(list.finished).toHaveLength(list.finishedTotal);
  });
});

describe('a row, in words and numbers', () => {
  it('is running or it is not', () => {
    expect(isRunning({ status: 'running' })).toBe(true);
    for (const status of ['done', 'failed', 'stopped', 'interrupted'] as const) expect(isRunning({ status })).toBe(false);
  });

  it('is titled by its title, else the first line of its command, else what it is', () => {
    expect(rowTitle({ kind: 'command', title: '  Ticker ', command: 'sleep 1' })).toBe('Ticker');
    expect(rowTitle({ kind: 'command', title: '', command: '\n  npm run dev  \nsecond' })).toBe('npm run dev');
    expect(rowTitle({ kind: 'monitor', title: ' ' })).toBe('Surveillance');
    setLang('en');
    expect(rowTitle({ kind: 'workflow', title: '' })).toBe('Workflow');
  });

  it('lasts until now while it runs, until its end once it ended, and is not known without that end', () => {
    expect(bgDuration({ status: 'running', startedAt: 1_000 }, 61_000)).toBe(60_000);
    expect(bgDuration({ status: 'running', startedAt: 5_000 }, 1_000)).toBe(0);
    expect(bgDuration({ status: 'done', startedAt: 1_000, endedAt: 4_500 }, 99_000)).toBe(3_500);
    expect(bgDuration({ status: 'failed', startedAt: 1_000 }, 99_000)).toBeNull();
  });

  it('has the exit code Claude Code gave in its summary', () => {
    expect(exitCode({ summary: 'Background command "Ticker" completed (exit code 0)' })).toBe(0);
    expect(exitCode({ summary: 'Background command "X" failed with exit code 3' })).toBe(3);
    expect(exitCode({ summary: 'Background command "X" failed with exit code -1' })).toBe(-1);
    expect(exitCode({ summary: 'Monitor "Watch" stream ended' })).toBeNull();
    expect(exitCode({ summary: 'Ticker' })).toBeNull();
    expect(exitCode({})).toBeNull();
  });

  it('has an output to follow for commands and monitors only', () => {
    expect(hasOutput('command')).toBe(true);
    expect(hasOutput('monitor')).toBe(true);
    expect(hasOutput('workflow')).toBe(false);
    expect(hasOutput('remote')).toBe(false);
    expect(hasOutput('teammate')).toBe(false);
  });

  it('names its kind and its state in the language of the window', () => {
    expect(kindLabel('command')).toBe('Commande en fond');
    expect(kindLabel('monitor')).toBe('Surveillance');
    expect(kindLabel('workflow')).toBe('Workflow');
    expect(kindLabel('remote')).toBe('Agent distant');
    expect(kindLabel('teammate')).toBe('Coéquipier');
    expect(statusLabel('failed')).toBe('En échec');
    setLang('en');
    expect(kindLabel('command')).toBe('Background command');
    expect(statusLabel('done')).toBe('Done');
  });

  it('belongs to the subagent whose task launched it', () => {
    const sub: SubAgent = { id: 'c1', title: 'Chercher', status: 'running', background: true, tools: 0, startedAt: 1, taskId: 't9' };
    const plan = planOf([task('b1', { parent: 't9' }), task('b2', { parent: 'zzz' }), task('b3')], [], [sub]);
    expect(ownerOf(plan, { parent: 't9' })?.title).toBe('Chercher');
    expect(ownerOf(plan, { parent: 'zzz' })).toBeUndefined();
    expect(ownerOf(plan, {})).toBeUndefined();
    expect(ownerOf(undefined, { parent: 't9' })).toBeUndefined();
  });
});

describe('rowLine', () => {
  it('says what a task running is, and what it does: its command, or the phase of a workflow', () => {
    expect(rowLine({ kind: 'command', title: 'Ticker', status: 'running', command: 'node ticker.js\nsecond' })).toBe(
      'Commande en fond · node ticker.js',
    );
    expect(rowLine({ kind: 'monitor', title: 'Watch', status: 'running' })).toBe('Surveillance');
    expect(rowLine({ kind: 'workflow', title: 'Revue', status: 'running', now: 'Phase 1 : lecteur A' })).toBe(
      'Workflow · Phase 1 : lecteur A',
    );
  });

  it('does not say again as its command what its title said', () => {
    expect(rowLine({ kind: 'command', title: 'npm run dev', status: 'running', command: 'npm run dev' })).toBe('Commande en fond');
    expect(rowLine({ kind: 'command', title: '', status: 'running', command: 'npm run dev' })).toBe('Commande en fond');
  });

  it('says how a task ended, with the exit code Claude Code gave', () => {
    expect(rowLine({ kind: 'command', title: 'T', status: 'done', summary: 'Background command "T" completed (exit code 0)' })).toBe(
      'Commande en fond · Terminée (code 0)',
    );
    expect(rowLine({ kind: 'command', title: 'T', status: 'failed', summary: 'Background command "T" failed with exit code 3' })).toBe(
      'Commande en fond · En échec (code 3)',
    );
    expect(rowLine({ kind: 'monitor', title: 'W', status: 'stopped', summary: 'W' })).toBe('Surveillance · Arrêtée');
    expect(rowLine({ kind: 'remote', title: 'R', status: 'interrupted' })).toBe('Agent distant · Interrompue');
  });

  it('speaks English', () => {
    setLang('en');
    expect(rowLine({ kind: 'command', title: 'T', status: 'failed', summary: 'failed with exit code 3' })).toBe(
      'Background command · Failed (code 3)',
    );
  });
});

describe('cleanOutput', () => {
  const ESC = '\u001b';

  it('takes the colors, the cursor moves and the titles out, and keeps the text and its lines', () => {
    expect(cleanOutput(`${ESC}[1;31mErreur${ESC}[0m : ${ESC}[32mok${ESC}[39m\nsuite`)).toBe('Erreur : ok\nsuite');
    expect(cleanOutput(`${ESC}[2K${ESC}[1Gprogress${ESC}[?25h`)).toBe('progress');
    expect(cleanOutput(`${ESC}]0;titre de fenêtre\u0007texte`)).toBe('texte');
    expect(cleanOutput(`${ESC}]8;;https://exemple.fr${ESC}\\lien${ESC}]8;;${ESC}\\`)).toBe('lien');
  });

  it('takes the other escapes out too, those of a character set, a keypad, a reset', () => {
    expect(cleanOutput(`${ESC}(Bligne${ESC}=${ESC}>${ESC}c`)).toBe('ligne');
  });

  it('turns the line ends of Windows into lines', () => {
    expect(cleanOutput('a\r\nb\r\n')).toBe('a\nb\n');
  });

  it('keeps what a line says last when a carriage return redraws it, as a terminal shows it', () => {
    expect(cleanOutput('10%\r50%\r100%\nfini')).toBe('100%\nfini');
    // A line that ends on the return still shows what it said.
    expect(cleanOutput('a\nbarre 40%\r')).toBe('a\nbarre 40%');
    expect(cleanOutput('\r\r')).toBe('');
  });

  it('takes the control characters out but the tab and the line feed', () => {
    expect(cleanOutput('a\u0007b\u0008c\u0000d\te\nf\u007f')).toBe('abcd\te\nf');
  });

  it('leaves an escape cut at its start or its end, which a tail of the output can hold, not in the text', () => {
    expect(cleanOutput(`fin de ligne${ESC}[3`)).toBe('fin de ligne');
    expect(cleanOutput(`${ESC}`)).toBe('');
    // The start of an escape cut off by the tail reads as text: nothing can tell it.
    expect(cleanOutput('31mtexte')).toBe('31mtexte');
  });

  it('is empty for nothing, and does not change a clean text', () => {
    expect(cleanOutput('')).toBe('');
    expect(cleanOutput('héllo — 日本語 ✓\nligne 2')).toBe('héllo — 日本語 ✓\nligne 2');
  });
});
