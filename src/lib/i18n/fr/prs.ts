import type { Tree } from '../types';

// The pull requests of an ordinary agent (ESC-64): « Ouvrir une PR » from the header of its conversation, the menu of
// its card and the branch picker; then their state on its card and in the header, and the two corrections handed to the
// agent on a click. `{word}`: the code host's word, « PR » or « MR » (GitLab), always feminine in French (« la PR »).
export default {
  /** The items of the menus and the button of the header. */
  open: 'Ouvrir une {word}…',
  openButton: 'Ouvrir une {word}',
  openHint: 'Pousse la branche {branch} et ouvre sa {word}, titre et description proposés.',
  /** The item of the menus once one is open. */
  see: 'Voir la {word} #{number}',

  modal: {
    title: 'Ouvrir une {word} sur {host}',
    /** Under the title: the agent and where its branch goes. */
    scope: '{agent} · {head} → {base}',
    titleLabel: 'Titre',
    bodyLabel: 'Description',
    baseLabel: 'Branche cible',
    draft: 'En brouillon',
    proposing: 'Rédaction du titre et de la description…',
    fallback: 'Le modèle des textes rédigés n’a pas répondu : titre et description tirés des commits.',
    uncommitted: {
      one: '{count} fichier non commité du worktree ne sera pas dans la {word}.',
      other: '{count} fichiers non commités du worktree ne seront pas dans la {word}.',
    },
    regenerate: 'Proposer à nouveau',
    submit: 'Pousser et ouvrir',
    opening: 'Ouverture…',
    opened: '{word} #{number} ouverte.',
  },

  /** What a pull request is, in its tooltip: its state, its CI, its reviews. */
  state: {
    open: 'ouverte',
    draft: 'brouillon',
    merged: 'mergée',
    closed: 'fermée',
  },
  checks: {
    pending: 'CI en cours',
    success: 'CI verte',
    failure: 'CI en échec',
    skipped: 'CI ignorée',
    none: 'pas de CI',
  },
  approvals: { one: '{count} approbation', other: '{count} approbations' },
  changesRequested: 'changements demandés',
  threads: { one: '{count} fil ouvert', other: '{count} fils ouverts' },
  conflict: 'conflit avec {base}',
  /** The tooltip's first line. */
  tipHead: '{word} #{number} · {title}',
  /** The number's label, for a screen reader: what a click does. */
  chipLabel: 'Ouvrir la {word} #{number} dans le navigateur ({state})',
  /** The group under the card. */
  group: 'Pull requests de {name}',

  /** The corrections, on a click only. */
  fixChecks: 'L’agent corrige',
  fixChecksHint: 'Envoie à {agent} les checks en échec de la {word} #{number}, avec la fin de leurs journaux.',
  fixReviews: 'L’agent corrige les retours',
  fixReviewsHint: 'Envoie à {agent} les demandes de changement et les fils non résolus de la {word} #{number}.',
  fixSent: 'Envoyé à {agent}.',
} as const satisfies Tree;
