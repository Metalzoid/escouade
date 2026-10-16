import type { Tree } from '../types';

// The subagents of an agent (ESC-13): their list under its card in the sidebar, and each one's conversation in its
// own view, with its breadcrumb, its head and its report. Their titles, what they do, their prompts and their reports
// are the agent's own words: shown as they come, never translated.
export default {
  /** The fold under an agent's card. */
  title: 'Sous-agents',
  /** Its button, for a screen reader. */
  toggle: 'Sous-agents de {name}',
  runningCount: { one: '{count} en cours', other: '{count} en cours' },
  finishedCount: { one: '{count} fini', other: '{count} finis' },
  /** The button that unfolds the finished ones. */
  finishedToggle: { one: '{count} sous-agent fini', other: '{count} sous-agents finis' },
  /** Under the first five subagents running: the button that unrolls the others, and the one that folds them back. */
  moreRunning: { one: '{count} autre en cours', other: '{count} autres en cours' },
  /** Under the first ten subagents finished. */
  moreFinished: { one: '{count} de plus', other: '{count} de plus' },
  lessList: 'Réduire',
  /** A row of the list, for a screen reader: it opens the subagent's conversation. */
  openRow: 'Ouvrir la conversation du sous-agent {name}',
  /** The stack of dots of the plan's banner when several run: it opens a menu of them, to pick one. */
  openAny: 'Ouvrir la conversation d’un sous-agent',
  /** How it is going, in words. `unknown`: launched in the background, nothing kept of its end. */
  status: {
    running: 'En cours',
    done: 'Terminé',
    failed: 'Échoué',
    stopped: 'Arrêté',
    interrupted: 'Interrompu',
    unknown: 'Lancé',
  },

  /** The view of a subagent's conversation. */
  crumbs: 'Fil d’Ariane',
  /** The agent's name in the breadcrumb: its tooltip. */
  back: 'Revenir à la conversation de {name}',
  facts: { kind: 'Type', model: 'Modèle', tokens: 'Tokens', tools: 'Outils', duration: 'Durée' },
  /** The prompt of its call. */
  prompt: 'Consigne',
  promptMore: 'Voir toute la consigne',
  promptLess: 'Réduire la consigne',
  report: 'Rapport',
  noReport: 'Ce sous-agent n’a pas rendu de rapport.',
  empty: 'Pas encore de message de ce sous-agent.',
  working: 'Le sous-agent travaille…',
  /** Its thread is no longer in the conversation (a subagent the plan still lists, its conversation gone). */
  gone: 'Ce sous-agent n’est plus dans la conversation de l’agent.',
  /** « Vue Claude Code »: its thread is read from Claude Code's own transcript of it, and only read. */
  terminal: 'Lecture seule : son transcript, tel que Claude Code l’écrit. On agit sur ce sous-agent dans l’interface de Claude Code.',
  /** That transcript could not be read. */
  terminalError: 'Le transcript de ce sous-agent n’a pas pu être lu : {error}',
  stop: 'Arrêter',
  stopHint: 'Arrêter ce sous-agent seul : l’agent continue.',
  /** Running, but Claude Code has not told its task yet. */
  stopLater: 'Claude Code n’a pas encore donné la tâche de ce sous-agent : il ne peut pas encore être arrêté seul.',
  /** The field to write to it, through the agent. */
  write: 'Lui écrire, par {name}',
  writePlaceholder: 'Message pour le sous-agent…',
  writeHint:
    'Claude Code ne permet pas d’écrire directement à un sous-agent : ton message va à {name}, qui le lui transmet avec l’outil SendMessage.',
  writeSend: 'Envoyer à {name}',
  writeSent: 'Message envoyé à {name}, qui le transmet au sous-agent.',
  /** Under a draft kept for a subagent that ended: it cannot be sent any more. */
  writeEnded: 'Ce sous-agent a fini : ton brouillon est gardé, mais il ne peut plus lui être envoyé.',
  /** Above a request in the agent's conversation: the subagent that made it. */
  asks: 'Demande du sous-agent « {name} »',
  /** The button on the line of a subagent's call, and on the request it made. */
  open: 'Ouvrir sa conversation',
} as const satisfies Tree;
