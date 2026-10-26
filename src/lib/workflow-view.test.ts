import { describe, expect, it } from 'vitest';
import { GSD_ID, gsd, paginationUsers, passage, ralph, scanOf, track } from '../test/workflows';
import {
  backArcs,
  checkedOf,
  currentPhase,
  didOf,
  doorsOf,
  historyRows,
  labelIn,
  phaseOf,
  pickWorkflow,
  pipsOf,
  plainLine,
  stepDetail,
  stepLabel,
  stepsOf,
  stripOf,
  turnsGrid,
  workflowTitle,
} from './workflow-view';

const NOW = new Date(2026, 9, 26, 10, 49).getTime();

describe('the Workflow tab, worked out', () => {
  it('writes a step by its command, without its family', () => {
    expect(stepLabel('gsd:discuss-phase')).toBe('Discuss phase');
    expect(stepLabel('brainstorming')).toBe('Brainstorming');
    expect(stepLabel('superpowers/writing-plans.md')).toBe('Writing plans');
    expect(labelIn(ralph(), '2')).toBe('Implement it, and only it.');
  });

  it('names a repository’s workflow by its repository too', () => {
    expect(workflowTitle({ ...gsd(), repo: 'api' })).toBe('api · GSD');
    expect(workflowTitle(gsd())).toBe('GSD');
  });

  it('shows the workflow chosen, else the open agent’s, else the one most agents follow', () => {
    const scan = scanOf(ralph(), gsd());
    const tracks = [track('a1'), track('a2'), track('a3', { workflow: ralph().id })];
    expect(pickWorkflow(scan, tracks, null, null)?.name).toBe('GSD');
    expect(pickWorkflow(scan, tracks, 'a3', null)?.name).toBe('Ralph');
    expect(pickWorkflow(scan, tracks, 'a3', GSD_ID)?.name).toBe('GSD');
    expect(pickWorkflow(scan, tracks, 'a3', 'gone')?.name).toBe('Ralph');
    expect(pickWorkflow(scanOf(), tracks, null, null)).toBeNull();
  });

  it('says the phase from its state file', () => {
    expect(phaseOf(gsd())).toEqual({ done: 3, total: 6, file: '.planning/STATE.md' });
  });

  it('puts in the head the doors that are no step, the most launched first, the entries before the rest', () => {
    const tracks = [track('a1', { passages: [passage(1, 'gsd:plan-phase', 0, 1, { door: '/gsd:quick fix' })] })];
    expect(doorsOf(gsd(), []).map((d) => d.command)).toEqual(['/gsd:autonomous', '/gsd:next', '/gsd:progress', '/gsd:help', '/gsd:quick']);
    expect(doorsOf(gsd(), tracks)[0].command).toBe('/gsd:quick');
  });

  it('details a step: its subagents and their rounds, the files it writes, its ways back', () => {
    const w = gsd();
    const [discuss, plan, , verify] = stepsOf(w);
    expect(stepDetail(w, plan)).toEqual({
      agents: ['gsd-phase-researcher', 'gsd-planner', 'gsd-plan-checker'],
      rounds: 3,
      writes: [],
      back: [],
    });
    expect(stepDetail(w, discuss).writes).toEqual(['CONTEXT.md']);
    expect(plainLine('Update `STATE.md` to the next phase.')).toBe('Update STATE.md to the next phase.');
    expect(stepDetail(w, verify).back).toEqual([{ to: 'gsd:plan-phase', condition: 'If gaps are found, run /gsd:plan-phase --gaps' }]);
  });

  it('draws in the gutter the ways back to an earlier step only', () => {
    const w = gsd();
    expect(
      backArcs(
        w,
        stepsOf(w).map((s) => s.name),
      ),
    ).toEqual([[3, 1]]);
    const r = ralph();
    expect(backArcs({ ...r, transitions: r.promptLoop!.returns }, ['1', '2', '3', '4'])).toEqual([[2, 1]]);
  });

  it('keeps the current phase: since the agent came in again by the first step', () => {
    const w = gsd();
    const old = [passage(1, 'gsd:discuss-phase', 0, 1), passage(2, 'gsd:plan-phase', 1, 1), passage(3, 'gsd:discuss-phase', 2, 1)];
    expect(currentPhase(w, old).map((p) => p.n)).toEqual([3]);
    expect(currentPhase(w, paginationUsers().passages)).toHaveLength(7);
    expect(currentPhase(w, [{ ...passage(9, 'x', 0, 1), workflow: 'other' }])).toEqual([]);
  });

  it('fills an agent’s barrettes: done before its step, on for its step', () => {
    const w = gsd();
    expect(pipsOf(w, paginationUsers())).toEqual(['done', 'done', 'done', 'on']);
    const out = track('a2', {
      outside: 'lance la suite e2e',
      passages: [passage(1, 'gsd:discuss-phase', 0, 1), passage(2, null, 1, 1, { outcome: 'running' })],
    });
    expect(pipsOf(w, out)).toEqual(['done', '', '', '']);
  });

  it('lays the strip in time: a shade per step, red for the way back, green for now', () => {
    const strip = stripOf(gsd(), paginationUsers().passages, NOW);
    expect(strip.map((s) => s.cls)).toEqual(['s1', 's2', 's3', 'bad', 's2', 's3', 'on']);
    expect(strip[2].flex).toBe(21);
    // The passage running lasts until now.
    expect(strip[6].flex).toBe(2);
  });

  it('says short what was done: the door, the subagents counted, the files written', () => {
    expect(
      didOf(
        passage(1, 's', 0, 1, {
          door: '/gsd:execute-phase 3',
          did: ['agent:gsd-executor', 'agent:gsd-executor', 'file:.planning/STATE.md'],
        }),
      ),
    ).toEqual([{ text: '/gsd:execute-phase 3', mono: true }, { text: '2 gsd-executor', mono: true }, { text: 'STATE.md écrit' }]);
  });

  it('writes the history: a line a passage, the way back with its reason and what decided it, outside in grey', () => {
    const w = gsd();
    const rows = historyRows(
      w,
      [...paginationUsers().passages.slice(3, 5), passage(8, null, 50, 2, { outcome: 'left', doing: 'lance la suite e2e' })],
      NOW,
    );
    expect(rows.map((r) => [r.cls, r.what])).toEqual([
      ['bad', 'Verify work'],
      ['back', 'Retour à Plan phase'],
      ['', 'Plan phase'],
      ['out', 'Hors du workflow'],
    ]);
    expect(rows[0].sub).toEqual([{ text: '2 écarts : le curseur n’est pas validé' }]);
    expect(rows[1].sub).toEqual([{ text: 'prévu par verify-work.md', mono: false }]);
    expect(rows[1].ms).toBeNull();
    expect(rows[3].sub).toEqual([{ text: 'lance la suite e2e' }]);
    expect(historyRows(w, [passage(1, 'gsd:plan-phase', 0, 1, { outcome: 'failed' })], NOW)[0].what).toBe('Plan phase : le tour a échoué');
    expect(historyRows(w, [passage(1, 'gsd:plan-phase', 0, 1)], NOW, false)[0].cost).toBeNull();
  });

  it('lays out a prompt loop’s turns: done, red when no box was checked, now, and to come', () => {
    const turn = (n: number, ticked: boolean | null, outcome: 'done' | 'running' = 'done') => ({
      n,
      at: 0,
      ended: null,
      ms: 0,
      cost: 0,
      checked: n === 2 ? { done: 4, total: 6 } : null,
      ticked,
      outcome,
    });
    const tr = track('a1', { workflow: ralph().id, turns: [turn(1, true), turn(2, false), turn(3, null, 'running')] });
    expect(turnsGrid(tr, 5).map((u) => u.cls)).toEqual(['ok', 'bad', 'on', 'todo', 'todo']);
    expect(checkedOf(ralph(), tr)).toEqual({ done: 4, total: 6 });
    expect(checkedOf(ralph(), null)).toEqual({ done: 3, total: 6 });
  });
});
