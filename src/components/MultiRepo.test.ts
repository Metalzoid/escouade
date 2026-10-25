// A project of several git repositories (ESC-169) in the window: the files panel grouped by repository, the merge
// checked repository by repository, the commit with one message each, the status bar's branches.
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../lib/state.svelte';
import type { FileChange, GitInfo, RepoGit, RepoMerge } from '../lib/types';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import FilesPanel from './FilesPanel.svelte';
import MergeReposModal from './modals/MergeReposModal.svelte';
import CommitReposModal from './modals/CommitReposModal.svelte';
import StatusBar from './StatusBar.svelte';

const REPOS = ['api', 'docs', 'front'];
const multi = () => project({ repos: REPOS });
const WT = {
  path: 'C:\\dev\\acme\\.claude\\worktrees\\pagination',
  branch: 'escouade/pagination',
  baseBranch: 'main',
  repos: REPOS.map((repo) => ({ repo, baseBranch: 'main' })),
};
const change = (path: string, repo: string, inWorktree = true): FileChange => ({
  path,
  status: 'M',
  add: 3,
  del: 1,
  agentId: 'a1',
  inWorktree,
  repo,
});
const repoGit = (repo: string, branch: string, over: Partial<RepoGit> = {}): RepoGit => ({
  repo,
  branch,
  upstream: null,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  hasCommit: true,
  modified: 0,
  added: 0,
  deleted: 0,
  gone: false,
  ...over,
});
const gitInfo = (repos: RepoGit[], branch: string): GitInfo => ({
  isRepo: true,
  branch,
  upstream: null,
  upstreamGone: false,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  lastFetch: null,
  modified: 2,
  added: 0,
  deleted: 0,
  total: 2,
  agents: {},
  repos,
});

describe('the files panel of a project of several repositories', () => {
  beforeEach(() => resetApp({ projects: [multi()], agents: [agent({ worktree: WT })] }));

  it('groups the files by repository, says the others unchanged, and folds a group', async () => {
    fakeBackend({
      git_files: () => [change('front/src/List.svelte', 'front'), change('api/src/users.ts', 'api'), change('api/src/db.ts', 'api')],
    });
    render(FilesPanel, { project: multi(), agent: app.agents.a1 });
    const api = await screen.findByRole('button', { name: 'Replier api' });
    expect(within(api).getByText('escouade/pagination')).toBeInTheDocument();
    expect(within(api).getByText('+6')).toBeInTheDocument();
    // Its paths from the repository: « users.ts src », not « api/src ».
    expect(screen.getByText('users.ts')).toBeInTheDocument();
    expect(screen.getAllByText('src').length).toBeGreaterThan(0);
    expect(screen.queryByText('api/src')).not.toBeInTheDocument();
    expect(screen.getByText('Sans changement : docs')).toBeInTheDocument();
    // The groups follow the folder's order: api, then front.
    const heads = screen.getAllByRole('button', { name: /^Replier / }).map((b) => b.getAttribute('aria-label'));
    expect(heads).toEqual(['Replier api', 'Replier front']);
    await userEvent.click(api);
    expect(screen.queryByText('users.ts')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplier api' })).toHaveAttribute('aria-expanded', 'false');
    // The merge goes to the repositories it changed, in its window.
    await userEvent.click(screen.getByRole('button', { name: 'Merger dans api, front…' }));
    expect(app.modal).toEqual({ kind: 'mergeRepos', agentId: 'a1' });
  });

  it('keeps the list of a project of one repository as it was', async () => {
    resetApp({ projects: [project()], agents: [agent()] });
    fakeBackend({ git_files: () => [{ path: 'src/auth.ts', status: 'M', add: 1, del: 0, agentId: 'a1', inWorktree: false }] });
    render(FilesPanel, { project: project(), agent: app.agents.a1 });
    expect(await screen.findByText('auth.ts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Replier / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sans changement/)).not.toBeInTheDocument();
  });
});

describe('the merge of an agent of several repositories', () => {
  beforeEach(() => resetApp({ projects: [multi()], agents: [agent({ worktree: WT })] }));
  const check = (over: Partial<RepoMerge>[]): RepoMerge[] =>
    over.map((o) => ({ repo: 'api', base: 'main', commits: 1, add: 3, del: 1, problem: null, conflicts: [], ...o }));

  it('merges nothing while a repository conflicts, offers the other alone, and hands the conflict to the agent', async () => {
    const backend = fakeBackend({
      agent_merge_check: () =>
        check([
          { repo: 'api' },
          { repo: 'docs', commits: 0 },
          { repo: 'front', problem: 'conflit avec main', conflicts: ['front/src/List.svelte'] },
        ]),
      merge_agent_repos: () => 'Mergé dans api',
    });
    render(MergeReposModal, { agentId: 'a1' });
    expect(await screen.findByText('front/src/List.svelte')).toBeInTheDocument();
    expect(screen.getByText('rien à merger')).toBeInTheDocument();
    expect(screen.getByText(/Rien n’est mergé tant que front ne peut pas l’être/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merger' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'L’agent résout le conflit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merger api seul' }));
    await waitFor(() => expect(backend.called('merge_agent_repos').at(-1)?.args).toMatchObject({ id: 'a1', repos: ['api'] }));
  });

  it('merges every repository its branch changed once all of them may be', async () => {
    const backend = fakeBackend({
      agent_merge_check: () => check([{ repo: 'api' }, { repo: 'front' }]),
      merge_agent: () => 'Mergé dans api, front',
    });
    render(MergeReposModal, { agentId: 'a1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Merger' }));
    await waitFor(() => expect(backend.called('merge_agent').at(-1)?.args).toMatchObject({ id: 'a1', squash: true }));
  });
});

describe('the commit of a project of several repositories', () => {
  beforeEach(() => resetApp({ projects: [multi()], agents: [agent({ worktree: WT })] }));

  it('proposes and commits one message per repository changed', async () => {
    const backend = fakeBackend({
      commit_preview: () => ({ files: [change('api/a.ts', 'api'), change('front/b.ts', 'front')], leftOut: [] }),
      commit_propose: (a: { paths: string[] }) => (a.paths[0].startsWith('api') ? 'feat(api): a' : 'feat(front): b'),
      commit_direct: (a: { paths: string[] }) => (a.paths[0].startsWith('api') ? 'abc1234' : 'def5678'),
    });
    render(CommitReposModal, { projectId: 'p1', agentId: 'a1' });
    expect(await screen.findByDisplayValue('feat(api): a')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('feat(front): b')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Commiter les 2 dépôts' }));
    await waitFor(() => expect(backend.called('commit_direct')).toHaveLength(2));
    expect(backend.called('commit_direct').map((c) => [c.args.paths, c.args.message])).toEqual([
      [['api/a.ts'], 'feat(api): a'],
      [['front/b.ts'], 'feat(front): b'],
    ]);
  });
});

describe('the status bar of a project of several repositories', () => {
  it('says the branch they share and how many they are, else how many branches', async () => {
    resetApp({ projects: [multi()], agents: [] });
    fakeBackend();
    app.ui.view = 'project';
    app.ui.activeProject = 'p1';
    app.git.p1 = gitInfo([repoGit('api', 'main'), repoGit('docs', 'main'), repoGit('front', 'main')], 'main');
    const { unmount } = render(StatusBar);
    expect(await screen.findByText('· 3 dépôts')).toBeInTheDocument();
    unmount();
    app.git.p1 = gitInfo([repoGit('api', 'main'), repoGit('docs', 'draft'), repoGit('front', 'main')], '');
    render(StatusBar);
    expect(await screen.findByText('2 branches · 3 dépôts')).toBeInTheDocument();
  });
});
