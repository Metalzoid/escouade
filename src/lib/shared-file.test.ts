import { describe, expect, it } from 'vitest';
import { hasPending, keptKeys, pendingGroups, sharedFile, sharedState } from './shared-file';
import type { Project, SharedFile } from './types';

function project(file: Partial<SharedFile> | null, local: string[] = []): Project {
  return {
    id: 'p',
    shared: {
      local,
      trusted: '',
      file: file && { keys: [], values: {}, warnings: [], error: null, version: 1, pending: null, ...file },
    },
  } as unknown as Project;
}

describe('.escouade.yml in the window', () => {
  it('says where each setting comes from', () => {
    const p = project(
      {
        keys: ['board.merge_strategy', 'worktrees.setup', 'git.commit_mode'],
        pending: { hash: 'h', commands: { 'worktrees.setup': [{ command: 'npm ci' }] } },
      },
      ['git.commit_mode'],
    );
    expect(sharedState(p, 'board.merge_strategy')).toBe('file');
    expect(sharedState(p, 'worktrees.setup')).toBe('pending');
    expect(sharedState(p, 'git.commit_mode')).toBe('local');
    expect(sharedState(p, 'board.draft_pr')).toBeNull();
    // A row of several settings: the first the file sets.
    expect(sharedState(p, ['board.draft_pr', 'board.merge_strategy'])).toBe('file');
    expect(keptKeys(p, ['git.commit_mode', 'board.merge_strategy'])).toEqual(['git.commit_mode']);
  });

  it('marks nothing without a file, or with one that cannot be read', () => {
    expect(sharedState(project(null), 'board.merge_strategy')).toBeNull();
    expect(sharedState(project({ keys: ['board.merge_strategy'], error: { line: 2, text: 'x' } }), 'board.merge_strategy')).toBeNull();
    // A project of before ESC-146.
    expect(sharedFile({ id: 'p' } as Project)).toBeNull();
    expect(sharedState({ id: 'p' } as Project, 'launch')).toBeNull();
  });

  it('lists the commands waiting, by group, in their order', () => {
    const p = project({
      keys: ['launch', 'board.test_command', 'worktrees.teardown', 'worktrees.setup'],
      pending: {
        hash: 'h',
        commands: {
          'board.test_command': 'npm test',
          launch: [{ name: 'web', command: 'npm run dev', cwd: 'web', shell: '' }],
          'worktrees.setup': [{ command: 'npm ci', cwd: '', shell: 'bash' }],
          'worktrees.teardown': [],
        },
      },
    });
    expect(hasPending(p)).toBe(true);
    expect(pendingGroups(p)).toEqual([
      { kind: 'setup', commands: [{ name: '', command: 'npm ci', cwd: '', shell: 'bash' }] },
      { kind: 'teardown', commands: [] },
      { kind: 'launch', commands: [{ name: 'web', command: 'npm run dev', cwd: 'web', shell: '' }] },
      { kind: 'test', commands: [{ name: '', command: 'npm test', cwd: '', shell: '' }] },
    ]);
    expect(pendingGroups(project({ keys: [] }))).toEqual([]);
    expect(hasPending(project(null))).toBe(false);
  });
});
