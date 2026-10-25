import type { Tree } from '../types';

// A project of several git repositories (ESC-169): a folder that holds `front`, `api`, `infra`… each its own. What the
// window says of them, wherever git speaks: the assistant, the settings, the files panel, the status bar, the merge,
// the pull requests, the board. A repository is named by its folder (`services/billing`), « racine » for the root's own.
export default {
  root: 'racine',

  status: {
    /** After the branch they share: « main · 4 dépôts ». */
    count: { one: '{count} dépôt', other: '{count} dépôts' },
    /** When they are not on one branch: « 3 branches · 4 dépôts ». */
    branches: { one: '{count} branche · {repos} dépôts', other: '{count} branches · {repos} dépôts' },
    menu: 'Branches des dépôts',
    menuTitle: { one: 'Branches du dépôt', other: 'Branches des {count} dépôts' },
    upToDate: 'à jour',
    /** A repository's line of the menu: its branch, then what there is to pull and to push. */
    sync: '{branch} · {behind} à tirer, {ahead} à pousser',
    detached: 'HEAD détaché',
    gone: 'introuvable',
    noCommit: 'aucun commit',
    rescan: 'Rechercher les dépôts à nouveau',
    rescanHint: 'Un dossier ajouté ou retiré depuis l’ouverture',
    foot: 'Choisis un dépôt : son sélecteur de branche s’ouvre, le même qu’un projet à un seul dépôt.',
  },

  delta: {
    /** The tooltip of the Δ, after the repositories changed. */
    quiet: { one: '{repos} sans changement', other: '{repos} sans changement' },
  },

  files: {
    /** The caption over the list, of an agent's folder. */
    folder: { one: 'Dossier {path} · un worktree de {count} dépôt', other: 'Dossier {path} · un worktree de chacun des {count} dépôts' },
    project: { one: 'Dossier du projet · {count} dépôt, sur sa branche', other: 'Dossier du projet · {count} dépôts, sur leurs branches' },
    quiet: 'Sans changement : {repos}',
    fold: 'Replier {repo}',
    unfold: 'Déplier {repo}',
    merge: 'Merger dans {repos}…',
    mergeNone: 'Merger…',
  },

  history: {
    of: 'Historique de',
    pick: 'Dépôt de l’historique',
    caption: 'Toutes les branches de {repo}',
  },

  commit: {
    title: { one: 'Commit dans {count} dépôt', other: 'Commit dans {count} dépôts' },
    scope: 'Un commit par dépôt, chacun avec son message',
    files: { one: '{count} fichier', other: '{count} fichiers' },
    proposing: 'Message en cours de rédaction…',
    confirm: { one: 'Commiter le dépôt', other: 'Commiter les {count} dépôts' },
    failedNote: 'Un dépôt dont le commit échoue le dit ici ; les autres sont commités quand même.',
  },

  merge: {
    title: 'Merger {name}',
    scope: '{branch} vers la branche de base de chaque dépôt',
    commits: { one: 'vers {base} · {count} commit', other: 'vers {base} · {count} commits' },
    nothing: 'rien à merger',
    conflict: 'conflit',
    blocked: 'Rien n’est mergé tant que {repos} ne peut pas l’être : les dépôts restent d’accord entre eux.',
    squash: 'Squash',
    confirm: 'Merger',
    alone: 'Merger {repo} seul',
    resolve: 'L’agent résout le conflit',
    checking: 'Vérification des dépôts…',
  },

  pr: {
    button: { one: 'Ouvrir {count} {word}', other: 'Ouvrir {count} {word}' },
    title: { one: 'Ouvrir {count} {word} sur {host}', other: 'Ouvrir {count} {word} sur {host}' },
    scope: 'Une {word} par dépôt changé',
    commits: { one: '{count} commit', other: '{count} commits' },
    into: '{remote} · vers {base}',
    confirm: { one: 'Pousser et ouvrir la {word}', other: 'Pousser et ouvrir les {count} {word}' },
  },

  card: {
    /** A ticket's card, a header: the repositories the branch changed. */
    changed: 'Changés : {repos}',
  },

  wizard: {
    found: { one: '{count} dépôt git : {repos}', other: '{count} dépôts git : {repos}' },
    foundHint:
      'Trouvés dans le dossier et un niveau plus bas ; node_modules, target, les dossiers cachés et ceux que git ignore sont passés.',
    noCommit: { one: '{repos} n’a aucun commit', other: '{repos} n’ont aucun commit' },
    noCommitHint: 'Un worktree part d’un commit : les agents n’en auront pas de ces dépôts tant qu’ils n’en ont pas.',
  },

  settings: {
    title: 'Dépôts',
    count: { one: '{count} dépôt git dans le dossier', other: '{count} dépôts git dans le dossier' },
    hint: 'Cherchés à l’ouverture du projet et quand la fenêtre revient au premier plan, dans le dossier et un niveau plus bas. Un sous-module reste dans son dépôt.',
    rescan: 'Rechercher à nouveau',
    gone: 'retiré',
    forget: 'Oublier {repo}',
    goneHint: 'Ses worktrees restent là où ils sont, jusqu’au nettoyage.',
    yml: '.escouade.yml est à la racine du dossier, qui n’est pas un dépôt : il n’est versionné nulle part tant que tu ne le mets pas toi-même dans un dépôt. Celui d’un dépôt n’est pas lu.',
  },

  agent: {
    /** The note of « Nouvel agent »'s worktree section. */
    note: {
      one: 'Un dossier à lui, avec un worktree de {count} dépôt.',
      other: 'Un dossier à lui, avec un worktree de chacun des {count} dépôts sous la même branche.',
    },
    bare: {
      one: 'À la racine du projet : il voit son dépôt',
      other: 'À la racine du projet : il voit les {count} dépôts, chacun sur sa branche',
    },
  },
} as const satisfies Tree;
