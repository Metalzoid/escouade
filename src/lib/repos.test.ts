import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { agentRepos, branchSummary, deltaDetail, groupByRepo, inRepo, isMulti, quietRepos, repoLabel, repoOf, touchedRepos } from './repos';
import type { FileChange, Project, RepoGit } from './types';
import { agent, project } from '../test/ipc';

const file = (path: string, repo: string | undefined, add = 1, del = 0): FileChange => ({
  path,
  status: 'M',
  add,
  del,
  agentId: null,
  inWorktree: false,
  repo,
});

const repo = (name: string, branch: string, changes: [number, number, number] = [0, 0, 0], gone = false): RepoGit => ({
  repo: name,
  branch,
  upstream: null,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  hasCommit: true,
  modified: changes[0],
  added: changes[1],
  deleted: changes[2],
  gone,
});

describe('a project of several repositories', () => {
  afterEach(() => setLang('fr'));

  it('is one only when the backend found its repositories', () => {
    expect(isMulti({ repos: ['api', 'front'] })).toBe(true);
    expect(isMulti({ repos: [] })).toBe(false);
    expect(isMulti({})).toBe(false);
    expect(isMulti(null)).toBe(false);
  });

  it('names a repository by its folder, the root as « racine »', () => {
    expect(repoLabel('services/billing')).toBe('services/billing');
    expect(repoLabel('')).toBe('racine');
    setLang('en');
    expect(repoLabel('')).toBe('root');
  });

  it('finds the repository of a path, the deepest first, and the path from it', () => {
    const repos = ['', 'api', 'services/billing'];
    expect(repoOf(repos, 'api/src/a.ts')).toBe('api');
    expect(repoOf(repos, 'services/billing/x.rs')).toBe('services/billing');
    expect(repoOf(repos, 'README.md')).toBe('');
    expect(repoOf(['api'], 'apiary/x')).toBeNull();
    expect(inRepo('api/src/a.ts', 'api')).toBe('src/a.ts');
    expect(inRepo('a.ts', '')).toBe('a.ts');
  });

  it('groups the changed files by repository in the folder’s order, the others said unchanged', () => {
    const groups = groupByRepo(
      [file('front/a.ts', 'front', 3, 1), file('api/b.ts', 'api', 2), file('api/c.ts', undefined, 4, 2)],
      ['api', 'docs', 'front'],
    );
    expect(groups.map((g) => [g.repo, g.files.length, g.add, g.del])).toEqual([
      ['api', 2, 6, 2],
      ['front', 1, 3, 1],
    ]);
    expect(quietRepos(['api', 'docs', 'front'], groups)).toEqual(['docs']);
  });

  it('takes an agent’s repositories from its worktrees, else the project’s, and those it touched', () => {
    const p: Project = project({ id: 'p1', repos: ['api', 'docs', 'front'] });
    const a = agent({
      id: 'a1',
      projectId: 'p1',
      worktree: {
        path: 'C:\\wt\\x',
        branch: 'escouade/x',
        baseBranch: 'main',
        repos: [
          { repo: 'api', baseBranch: 'main' },
          { repo: 'front', baseBranch: 'develop' },
        ],
      },
      touchedFiles: ['front/src/a.ts', 'api/x.ts', 'README.md'],
    });
    expect(agentRepos(p, a)).toEqual(['api', 'front']);
    expect(agentRepos(p, null)).toEqual(['api', 'docs', 'front']);
    expect(touchedRepos(p, a)).toEqual(['api', 'front']);
  });

  it('says one branch when all share it, else how many', () => {
    const same = branchSummary({ branch: 'main', repos: [repo('api', 'main'), repo('front', 'main')] });
    expect(same).toEqual({ branch: 'main', text: '2 dépôts' });
    const apart = branchSummary({ branch: '', repos: [repo('api', 'main'), repo('front', 'feat'), repo('docs', 'main')] });
    expect(apart).toEqual({ branch: null, text: '2 branches · 3 dépôts' });
    setLang('en');
    expect(branchSummary({ branch: 'main', repos: [repo('api', 'main'), repo('front', 'main')] }).text).toBe('2 repositories');
  });

  it('details the Δ repository by repository, the unchanged ones together', () => {
    const git = { repos: [repo('api', 'main', [2, 1, 0]), repo('docs', 'main'), repo('front', 'main', [3, 0, 1]), repo('infra', 'main')] };
    expect(deltaDetail(git)).toBe('api ~2 +1 −0 · front ~3 +0 −1 · docs, infra sans changement');
    expect(deltaDetail({ repos: [repo('api', 'main', [1, 0, 0])] })).toBe('api ~1 +0 −0');
  });
});
