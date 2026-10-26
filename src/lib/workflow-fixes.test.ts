import { describe, expect, it } from 'vitest';
import { gsdScan, gsdWorkflow } from '../test/workflows';
import { shownPath, fixFrom, merge, move, removedBy, sourceGroups, stepRows, withFix, workflowName, agentsOf } from './workflow-fixes';

const w = gsdWorkflow();
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('the steps of a workflow as corrected (ESC-195)', () => {
  it('are the reading’s, with what tells each, while nothing is corrected', () => {
    const rows = stepRows(w, undefined);
    expect(names(rows)).toEqual(['gsd:discuss-phase', 'gsd:plan-phase', 'gsd:execute-phase', 'gsd:verify-work']);
    expect(rows[1].marks).toEqual(['/gsd:plan-phase', 'gsd-planner', 'gsd-plan-checker']);
    // As read, no correction.
    expect(fixFrom(w, rows, [])).toBeUndefined();
  });

  it('renamed, they are written with the steps read they stand for, and read back the same', () => {
    const rows = stepRows(w, undefined).map((r, i) => (i === 0 ? { ...r, name: 'Discuter' } : r));
    const fix = fixFrom(w, rows, [])!;
    expect(fix.workflow).toBe('|claude|gsd');
    expect(fix.steps?.[0]).toEqual({ name: 'Discuter', from: ['gsd:discuss-phase'] });
    expect(names(stepRows(w, fix))).toEqual(['Discuter', 'gsd:plan-phase', 'gsd:execute-phase', 'gsd:verify-work']);
  });

  it('merged with the next, two are one with what tells both', () => {
    const rows = merge(stepRows(w, undefined), 1);
    expect(rows).toHaveLength(3);
    expect(rows[1].from).toEqual(['gsd:plan-phase', 'gsd:execute-phase']);
    expect(rows[1].marks).toContain('gsd-executor');
    const fix = fixFrom(w, rows, removedBy(stepRows(w, undefined), rows, []))!;
    // Nothing taken out: both are in the step merged.
    expect(fix.removed).toBeUndefined();
    expect(stepRows(w, fix)[1].from).toEqual(['gsd:plan-phase', 'gsd:execute-phase']);
    // The last one has none to merge with.
    expect(merge(rows, 2)).toBe(rows);
  });

  it('removed, a step read is taken out and stays so after a new reading', () => {
    const before = stepRows(w, undefined);
    const after = before.filter((_, i) => i !== 3);
    const fix = fixFrom(w, after, removedBy(before, after, []))!;
    expect(fix.removed).toEqual(['gsd:verify-work']);
    // The rest as read: no steps written.
    expect(fix.steps).toBeUndefined();
    expect(names(stepRows(w, fix))).toEqual(['gsd:discuss-phase', 'gsd:plan-phase', 'gsd:execute-phase']);
  });

  it('reordered, they keep their new order, and a step read since comes after them', () => {
    const rows = move(stepRows(w, undefined), 3, 0);
    expect(names(rows)[0]).toBe('gsd:verify-work');
    const fix = fixFrom(w, rows, [])!;
    const later = gsdWorkflow({ steps: [...w.steps, { ...w.steps[0], name: 'gsd:ship', command: '/gsd:ship' }] });
    expect(names(stepRows(later, fix))).toEqual([
      'gsd:verify-work',
      'gsd:discuss-phase',
      'gsd:plan-phase',
      'gsd:execute-phase',
      'gsd:ship',
    ]);
    expect(move(rows, 0, 9)).toBe(rows);
  });

  it('added by hand, a step is told by what the user says signals it', () => {
    const rows = [
      ...stepRows(w, undefined),
      { key: '', name: 'Livrer', from: [], signals: [{ command: '/gsd:ship' }], marks: [], guessed: false, stale: false },
    ];
    const fix = fixFrom(w, rows, [])!;
    expect(fix.steps?.[4]).toEqual({ name: 'Livrer', signals: [{ command: '/gsd:ship' }] });
    const back = stepRows(w, fix);
    expect(back[4]).toMatchObject({ name: 'Livrer', marks: ['/gsd:ship'], key: 'new-0' });
  });

  it('guessed by the reading, a step stays guessed until kept, and is gone once removed', () => {
    const guessed = gsdWorkflow({ steps: [...w.steps, { ...w.steps[0], name: 'gsd:ship', command: '/gsd:ship', guessed: true }] });
    const rows = stepRows(guessed, undefined);
    expect(rows[4].guessed).toBe(true);
    // Another step renamed: the guessed one is not kept for it.
    const renamed = rows.map((r, i) => (i === 0 ? { ...r, name: 'Discuter' } : r));
    expect(stepRows(guessed, fixFrom(guessed, renamed, []))[4].guessed).toBe(true);
    // « Garder ».
    const kept = rows.map((r, i) => (i === 4 ? { ...r, guessed: false } : r));
    const fix = fixFrom(guessed, kept, [])!;
    expect(fix.steps?.map((s) => s.from?.[0])).toContain('gsd:ship');
    expect(stepRows(guessed, fix)[4].guessed).toBe(false);
    // « Retirer ».
    const dropped = rows.slice(0, 4);
    expect(fixFrom(guessed, dropped, removedBy(rows, dropped, []))).toEqual({ workflow: guessed.id, removed: ['gsd:ship'] });
  });

  it('a correction of a step the reading no longer has is said, not lost', () => {
    const rows = stepRows(w, { workflow: w.id, steps: [{ name: 'Ancienne', from: ['gsd:gone'] }] });
    expect(rows[0]).toMatchObject({ name: 'Ancienne', stale: true });
    expect(rows.slice(1).every((r) => !r.stale)).toBe(true);
  });

  it('are kept one correction per workflow', () => {
    const a = fixFrom(w, merge(stepRows(w, undefined), 0), [])!;
    const fixes = withFix([{ workflow: 'other', dismissed: true }], w, a);
    expect(fixes.map((f) => f.workflow)).toEqual(['other', w.id]);
    expect(withFix(fixes, w, undefined).map((f) => f.workflow)).toEqual(['other']);
    // « Ce n’est pas un workflow ».
    expect(fixFrom(w, stepRows(w, undefined), [], true)).toEqual({ workflow: w.id, dismissed: true });
  });
});

describe('what the reading found', () => {
  it('groups the files of the harnesses’ folders, the most first, those reached by @ apart, the rest one by one', () => {
    expect(sourceGroups(gsdScan())).toEqual([
      { path: '~/.claude/commands/gsd', count: 4, included: false },
      { path: '~/.claude/agents', count: 3, included: false },
      { path: '~/.claude/get-shit-done/workflows', count: 2, included: true },
      { path: '.planning/STATE.md', count: 1, included: false },
      { path: 'CLAUDE.md', count: 1, included: false },
    ]);
  });

  it('says a path from the project, from Claude Code’s folder or from the home folder', () => {
    const scan = gsdScan({ root: 'C:/dev/app', claude: 'C:/cfg/claude', home: 'C:/Users/me' });
    expect(shownPath(scan, 'C:/dev/app/.planning/STATE.md')).toBe('.planning/STATE.md');
    expect(shownPath(scan, 'c:/cfg/claude/commands/gsd/plan.md')).toBe('~/.claude/commands/gsd/plan.md');
    expect(shownPath(scan, 'C:/Users/me/.codex/prompts/x.md')).toBe('~/.codex/prompts/x.md');
    expect(shownPath(scan, 'D:/other/x.md')).toBe('D:/other/x.md');
    // Not a folder that only starts the same.
    expect(shownPath(scan, 'C:/dev/application/x.md')).toBe('C:/dev/application/x.md');
  });

  it('names a repository’s workflow by it, and counts its subagents once', () => {
    expect(workflowName(w)).toBe('GSD');
    expect(workflowName({ ...w, repo: 'api' })).toBe('api · GSD');
    expect(agentsOf(w)).toBe(4);
  });
});
