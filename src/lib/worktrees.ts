import { IS_MAC } from './platform';
import { tildify } from './format';

// Where a project's agents' worktrees go and how their branches are named, as the backend reads its settings
// (`paths::worktrees_root`, `git::branch_prefix_problem`): the settings check them as they are typed.

/** The « Dossier des worktrees » of a project that sets none: Claude Code's own (`claude --worktree`). */
export const DEFAULT_WORKTREES = '.claude/worktrees';
/** The « Préfixe des branches des agents » of a project that sets none. */
export const DEFAULT_AGENT_PREFIX = 'escouade/';
/** The « Préfixe des branches des tickets » of a project that sets none. */
export const DEFAULT_TICKET_PREFIX = 'ticket/';

/** Why a « Dossier des worktrees » cannot be: the project's folder, one holding it, in a `.git`, or a path neither relative nor whole. */
export type WorktreesProblem = 'itself' | 'contains' | 'git' | 'partial';

const windows = (p: string) => /^[A-Za-z]:|\\/.test(p);

/** A path cut into its root (`C:/`, `/`, `//server/share/`, `~/`, none for a relative one) and its names. */
function split(p: string, win: boolean): { root: string; names: string[] } {
  const s = win ? p.replace(/\\/g, '/') : p;
  const root = s.match(/^([A-Za-z]:\/|\/\/[^/]+\/[^/]+\/?|\/|~(\/|$))/)?.[0] ?? '';
  return { root: root === '~' ? '~/' : root, names: s.slice(root.length).split('/').filter(Boolean) };
}

/** Two names of a folder are the same one: case ignored on Windows and macOS. */
function same(a: string, b: string, win: boolean): boolean {
  return win || IS_MAC ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** A « Dossier des worktrees » as typed, trimmed, without the quotes around it (« Copier en tant que chemin »). */
function unquoted(setting: string): string {
  const s = setting.trim();
  return (s.length > 1 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s).trim();
}

/**
 * The root and the names of the folder `setting` from `project` (from the home folder after `~`, as is when whole),
 * `.` and `..` taken away.
 */
function resolve(project: string, setting: string): { root: string; names: string[] } {
  const win = windows(project);
  const s = unquoted(setting) || DEFAULT_WORKTREES;
  const own = split(s, win);
  const base = own.root ? own : split(project, win);
  const names: string[] = [];
  for (const n of own.root ? own.names : [...base.names, ...own.names]) {
    if (n === '..') names.pop();
    else if (n !== '.') names.push(n);
  }
  return { root: base.root, names };
}

/** The folder a project's new worktrees go to, written with the separator of the project's path. */
export function worktreesRoot(project: string, setting: string): string {
  const { root, names } = resolve(project, setting);
  const path = root + names.join('/');
  return windows(project) ? path.replace(/\//g, '\\') : path;
}

/** Why `setting` cannot be the « Dossier des worktrees » of the project at `project`, if it cannot. */
export function worktreesRootProblem(project: string, setting: string): WorktreesProblem | null {
  const win = windows(project);
  const s = unquoted(setting);
  // Under Windows, `D:wt` and `\wt` depend on what the app's process happens to be in.
  if (win && (/^[A-Za-z]:(?![\\/])/.test(s) || /^[\\/](?![\\/])/.test(s))) return 'partial';
  const dir = resolve(project, setting);
  const own = resolve(project, '.');
  if (same(dir.root, own.root, win) && dir.names.length <= own.names.length) {
    const holds = dir.names.every((n, i) => same(n, own.names[i], win));
    if (holds) return dir.names.length === own.names.length ? 'itself' : 'contains';
  }
  return dir.names.some((n) => n.toLowerCase() === '.git') ? 'git' : null;
}

/** How a worktree is shown: from the project's folder (`.claude/worktrees/x`, `../app-worktrees/x`), whole on another drive. */
export function worktreeLabel(project: string, worktree: string): string {
  const win = windows(project);
  const p = split(project, win);
  const w = split(worktree, win);
  if (!same(p.root, w.root, win)) return tildify(worktree);
  let k = 0;
  while (k < p.names.length && k < w.names.length && same(p.names[k], w.names[k], win)) k++;
  return [...p.names.slice(k).map(() => '..'), ...w.names.slice(k)].join('/');
}

/**
 * Whether `prefix` cannot start the names of branches: what follows it is a slug (`login`, `dem-1`), so a prefix is
 * good when git takes `<prefix>x` for a new branch.
 */
export function branchPrefixProblem(prefix: string): boolean {
  const name = `${prefix}x`;
  return (
    /^[-/]/.test(name) ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x20\x7f~^:?*[\\]/.test(name) ||
    ['..', '@{', '//'].some((s) => name.includes(s)) ||
    name.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))
  );
}
