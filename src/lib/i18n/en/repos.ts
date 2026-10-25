import { defineZone } from '../types';

// A project of several git repositories (ESC-169): see the French catalog.
export default defineZone('repos', {
  root: 'root',

  status: {
    count: { one: '{count} repository', other: '{count} repositories' },
    branches: { one: '{count} branch · {repos} repositories', other: '{count} branches · {repos} repositories' },
    menu: 'Branches of the repositories',
    menuTitle: { one: 'Branches of the repository', other: 'Branches of the {count} repositories' },
    upToDate: 'up to date',
    sync: '{branch} · {behind} to pull, {ahead} to push',
    detached: 'detached HEAD',
    gone: 'not found',
    noCommit: 'no commit',
    rescan: 'Look for the repositories again',
    rescanHint: 'A folder added or removed since the opening',
    foot: 'Pick a repository: its branch picker opens, the same as a project of one repository’s.',
  },

  delta: {
    quiet: { one: '{repos} unchanged', other: '{repos} unchanged' },
  },

  files: {
    folder: {
      one: 'Folder {path} · a worktree of {count} repository',
      other: 'Folder {path} · a worktree of each of the {count} repositories',
    },
    project: {
      one: 'Project folder · {count} repository, on its branch',
      other: 'Project folder · {count} repositories, on their branches',
    },
    quiet: 'Unchanged: {repos}',
    fold: 'Fold {repo}',
    unfold: 'Unfold {repo}',
    merge: 'Merge into {repos}…',
    mergeNone: 'Merge…',
  },

  history: {
    of: 'History of',
    pick: 'Repository of the history',
    caption: 'All the branches of {repo}',
  },

  commit: {
    title: { one: 'Commit in {count} repository', other: 'Commit in {count} repositories' },
    scope: 'One commit per repository, each with its message',
    files: { one: '{count} file', other: '{count} files' },
    proposing: 'Writing the message…',
    confirm: { one: 'Commit the repository', other: 'Commit the {count} repositories' },
    failedNote: 'A repository whose commit fails says so here; the others are committed all the same.',
  },

  merge: {
    title: 'Merge {name}',
    scope: '{branch} into each repository’s base branch',
    commits: { one: 'into {base} · {count} commit', other: 'into {base} · {count} commits' },
    nothing: 'nothing to merge',
    conflict: 'conflict',
    blocked: 'Nothing is merged while {repos} can’t be: the repositories stay in step.',
    squash: 'Squash',
    confirm: 'Merge',
    alone: 'Merge {repo} alone',
    resolve: 'The agent resolves the conflict',
    checking: 'Checking the repositories…',
  },

  pr: {
    button: { one: 'Open {count} {word}', other: 'Open {count} {word}s' },
    title: { one: 'Open {count} {word} on {host}', other: 'Open {count} {word}s on {host}' },
    scope: 'One {word} per repository changed',
    commits: { one: '{count} commit', other: '{count} commits' },
    into: '{remote} · into {base}',
    confirm: { one: 'Push and open the {word}', other: 'Push and open the {count} {word}s' },
  },

  card: {
    changed: 'Changed: {repos}',
  },

  wizard: {
    found: { one: '{count} git repository: {repos}', other: '{count} git repositories: {repos}' },
    foundHint: 'Found in the folder and one level down; node_modules, target, hidden folders and those git ignores are skipped.',
    noCommit: { one: '{repos} has no commit', other: '{repos} have no commit' },
    noCommitHint: 'A worktree starts from a commit: the agents get none of these repositories until they have one.',
  },

  settings: {
    title: 'Repositories',
    count: { one: '{count} git repository in the folder', other: '{count} git repositories in the folder' },
    hint: 'Looked for when the project opens and when the window comes back to the front, in the folder and one level down. A submodule stays with its repository.',
    rescan: 'Look again',
    gone: 'removed',
    forget: 'Forget {repo}',
    goneHint: 'Its worktrees stay where they are until the cleaning.',
    yml: '.escouade.yml is at the root of the folder, which is no repository: it is versioned nowhere until you put it in a repository yourself. A repository’s own is not read.',
  },

  agent: {
    note: {
      one: 'A folder of its own, with a worktree of {count} repository.',
      other: 'A folder of its own, with a worktree of each of the {count} repositories on one branch.',
    },
    bare: {
      one: 'At the project’s root: it sees its repository',
      other: 'At the project’s root: it sees the {count} repositories, each on its branch',
    },
  },
});
