// A project of several git repositories (ESC-169): a folder that holds `front`, `api`, `infra`… each its own. The
// backend says them (`Project.repos`, `GitInfo.repos`, `FileChange.repo`, `Worktree.repos`); this is what the window
// makes of them. A project of one repository has none, and nothing here changes it.
import { t } from './i18n';
import type { Agent, FileChange, GitInfo, Project, RepoGit } from './types';

/** The project has several repositories. */
export const isMulti = (p: Pick<Project, 'repos'> | null | undefined): boolean => !!p?.repos?.length;

/** The name a repository goes by: its folder from the project's, « racine » for the root's own. */
export const repoLabel = (repo: string): string => (repo === '' ? t('repos.root') : repo);

/** The path of a file of `repo` from the repository, its prefix taken off. */
export function inRepo(path: string, repo: string): string {
  return repo && path.startsWith(repo + '/') ? path.slice(repo.length + 1) : path;
}

/** The repository a path from the project's folder is in, the deepest first; null for none. */
export function repoOf(repos: string[], path: string): string | null {
  let best: string | null = null;
  for (const r of repos) {
    if (r && path.startsWith(r + '/') && (best === null || r.length > best.length)) best = r;
  }
  return best ?? (repos.includes('') ? '' : null);
}

export interface RepoGroup {
  repo: string;
  files: FileChange[];
  add: number;
  del: number;
}

/** The files by repository, in the order of `repos`; a file of none (an older backend) under its own path's. */
export function groupByRepo(files: FileChange[], repos: string[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  for (const f of files) {
    const repo = f.repo ?? repoOf(repos, f.path) ?? '';
    let g = groups.get(repo);
    if (!g) groups.set(repo, (g = { repo, files: [], add: 0, del: 0 }));
    g.files.push(f);
    g.add += f.add;
    g.del += f.del;
  }
  const order = (r: string) => {
    const i = repos.indexOf(r);
    return i < 0 ? repos.length : i;
  };
  return [...groups.values()].sort((a, b) => order(a.repo) - order(b.repo));
}

/** Of `repos`, those `groups` leave out: no change there. */
export const quietRepos = (repos: string[], groups: RepoGroup[]): string[] => repos.filter((r) => !groups.some((g) => g.repo === r));

/** The repositories an agent's checkouts are: its worktrees, else the project's. */
export function agentRepos(project: Project, agent: Agent | null): string[] {
  const own = agent?.worktree?.repos;
  return own?.length ? own.map((r) => r.repo) : (project.repos ?? []);
}

/** The repositories an agent touched files in (its card's and its header's « api, front »), in the project's order. */
export function touchedRepos(project: Project, agent: Agent): string[] {
  const repos = agentRepos(project, agent);
  const hit = new Set<string>();
  for (const f of agent.touchedFiles ?? []) {
    const r = repoOf(repos, f);
    if (r !== null) hit.add(r);
  }
  return repos.filter((r) => hit.has(r));
}

/** What the status bar says of the branches: one when they share it (« main · 4 dépôts »), else how many. */
export function branchSummary(git: Pick<GitInfo, 'branch' | 'repos'>): { branch: string | null; text: string } {
  const repos = (git.repos ?? []).filter((r) => !r.gone);
  const count = git.repos?.length ?? 0;
  if (git.branch) return { branch: git.branch, text: t('repos.status.count', { count }) };
  const branches = new Set(repos.map((r) => r.branch)).size;
  return { branch: null, text: t('repos.status.branches', { count: branches, repos: count }) };
}

/** A repository's changes in one word: « ~2 +1 −0 ». */
const changes = (r: RepoGit) => `~${r.modified} +${r.added} −${r.deleted}`;

/** The detail of a project's Δ, repository by repository (the tooltip of its tile, its title bar and its sidebar). */
export function deltaDetail(git: Pick<GitInfo, 'repos'>): string {
  const repos = git.repos ?? [];
  const changed = repos.filter((r) => r.modified + r.added + r.deleted > 0);
  const quiet = repos.filter((r) => r.modified + r.added + r.deleted === 0 && !r.gone);
  const parts = changed.map((r) => `${repoLabel(r.repo)} ${changes(r)}`);
  if (quiet.length) parts.push(t('repos.delta.quiet', { repos: quiet.map((r) => repoLabel(r.repo)).join(', '), count: quiet.length }));
  return parts.join(' · ');
}
