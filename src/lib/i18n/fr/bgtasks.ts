import type { Tree } from '../types';

// The tasks Claude Code runs in the background for an agent (ESC-14): commands, monitors, workflows, remote agents,
// teammates. Their list under the card of the agent in the sidebar, the chip on the card, and each one's view with its
// output followed live. Their titles, commands, phases, summaries and output are the agent's and Claude Code's own words:
// shown as they come, never translated.
export default {
  /** The fold under an agent's card. */
  title: 'Tâches de fond',
  /** Its group, for a screen reader. */
  toggle: 'Tâches de fond de {name}',
  runningCount: { one: '{count} en cours', other: '{count} en cours' },
  finishedCount: { one: '{count} finie', other: '{count} finies' },
  /** The button that unfolds the finished ones. */
  finishedToggle: { one: '{count} tâche finie', other: '{count} tâches finies' },
  /** Under the first five tasks running: the button that unrolls the others, and the one that folds them back. */
  moreRunning: { one: '{count} autre en cours', other: '{count} autres en cours' },
  /** Under the first ten tasks finished. */
  moreFinished: { one: '{count} de plus', other: '{count} de plus' },
  lessList: 'Réduire',
  /** The chip on the card of an agent that has some running; its label in full, for a screen reader and its tooltip. */
  chip: { one: '{count} en fond', other: '{count} en fond' },
  chipLabel: { one: '{count} tâche de fond en cours', other: '{count} tâches de fond en cours' },

  /** What a task is. */
  kind: {
    command: 'Commande en fond',
    monitor: 'Surveillance',
    workflow: 'Workflow',
    remote: 'Agent distant',
    teammate: 'Coéquipier',
  },
  /** How it is going, in words. */
  status: {
    running: 'En cours',
    done: 'Terminée',
    failed: 'En échec',
    stopped: 'Arrêtée',
    interrupted: 'Interrompue',
  },
  /** « code 3 »: how a command ended, after its state. */
  exitShort: 'code {code}',

  /** The view of a task. */
  crumbs: 'Fil d’Ariane',
  /** The agent's name in the breadcrumb: its tooltip. */
  back: 'Revenir à la conversation de {name}',
  facts: {
    kind: 'Type',
    status: 'État',
    duration: 'Durée',
    exit: 'Code de sortie',
    by: 'Lancée par',
    phase: 'Phase en cours',
    tools: 'Outils',
    tokens: 'Tokens',
  },
  /** The command line of a task, or its description when it has none. */
  command: 'Commande',
  description: 'Description',
  commandMore: 'Voir toute la commande',
  commandLess: 'Réduire la commande',
  /** What Claude Code last said of it, once it ended. */
  summary: 'Résumé',
  /** The task is no longer in the agent's list (a new session, or too many ended since). */
  gone: 'Cette tâche n’est plus dans la liste de l’agent.',

  /** The output, followed live. */
  output: 'Sortie',
  /** The output area, for a screen reader. */
  outputLabel: 'Sortie de {name}, en lecture seule',
  follow: 'Suivre la fin',
  reading: 'Lecture de la sortie…',
  emptyRunning: 'Rien n’a encore été écrit.',
  emptyDone: 'Cette tâche n’a rien écrit.',
  /** No output to follow for this type of task (a workflow, a remote agent, a teammate). */
  noOutputType: 'Pas de sortie à suivre pour ce type de tâche.',
  /** No output file to read (a task whose file is gone, or never was). */
  noOutputFile: 'Aucune sortie disponible : le fichier de sortie est introuvable.',
  /** No size: the end read is 8 KiB while the task runs, 256 KiB once it ended. */
  truncated: 'Début tronqué : seule la fin de la sortie est montrée.',
  fromFile: 'lue dans le fichier de sortie',
  /** A read failed: the next one tries again. */
  readError: 'La sortie n’a pas pu être lue : {error}',
  readRetry: 'Nouvel essai à la prochaine lecture.',

  stop: 'Arrêter',
  stopHint: 'Arrêter cette tâche. Claude Code l’annonce ensuite à l’agent, ce qui lui coûte un tour.',
  /** In the Claude Code view, the window acts on nothing. */
  stopInTerminal: 'Cette tâche s’arrête depuis l’interface de Claude Code.',

  /** ESC-138: the card of an agent whose turn is over while something it left goes on, instead of « Terminé ». */
  later: {
    /** Its status, and when the next wake-up is all there is. */
    awaits: 'Attend',
    wakeShort: 'Réveil {when}',
    /** Its tooltip: the first line, then one per thing that goes on. */
    intro: 'Son tour est fini, mais il attend :',
    subagents: { one: '{count} sous-agent en cours', other: '{count} sous-agents en cours' },
    background: { one: '{count} tâche de fond en cours', other: '{count} tâches de fond en cours' },
    driven: { one: '{count} agent piloté au travail : {names}', other: '{count} agents pilotés au travail : {names}' },
    wake: 'Claude Code le relance {when}',
    wakeRecurring: 'Claude Code le relance selon « {schedule} »',
    /** The fold under the card that lists the agents it drives at work, its count, its group for a screen reader. */
    drivenTitle: 'Agents pilotés',
    drivenCount: { one: '{count} au travail', other: '{count} au travail' },
    drivenToggle: 'Agents pilotés par {name}',
    drivenOpen: 'Ouvrir {name}',
  },
} as const satisfies Tree;
