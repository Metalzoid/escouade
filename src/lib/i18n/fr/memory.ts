import type { Tree } from '../types';

// The shared memory of a project's agents (ESC-255): its list in the project's settings, and the window that offers
// once what Claude Code remembers of the project.
export default {
  settings: {
    title: 'Mémoire partagée',
    note: 'Le carnet de travail des agents : ce qu’ils ont appris de la façon de travailler dans ce projet. Tous les harness la lisent et l’écrivent par les outils d’Escouade. Elle est dans {dir} du dossier du projet ; Escouade ne la commite jamais.',
    empty: 'Aucun souvenir pour l’instant : les agents en noteront au fil des tickets.',
    count: { one: '{count} souvenir', other: '{count} souvenirs' },
    forget: 'Oublier',
    forgetLabel: 'Oublier le souvenir {name}',
    forgotten: 'Souvenir « {name} » oublié.',
    confirm: 'Confirmer l’oubli',
    unreadable: 'La mémoire ne se lit pas : {error}',
  },
  kinds: {
    feedback: 'Façon de faire',
    project: 'Projet',
    reference: 'Référence',
    user: 'Utilisateur',
  },
  claude: {
    title: 'Reprendre la mémoire de Claude Code ?',
    body: 'Claude Code a retenu des choses sur ce projet. Coche celles que tous les agents du projet doivent connaître, quel que soit leur harness : elles iront dans sa mémoire partagée. Rien d’autre n’est lu ni copié, et cette question ne revient pas.',
    replaces: 'Remplace celui du projet',
    all: 'Tout cocher',
    none: 'Tout décocher',
    skip: 'Ne rien reprendre',
    take: { one: 'Reprendre {count} souvenir', other: 'Reprendre {count} souvenirs' },
    takeNone: 'Reprendre',
    taken: { one: '{count} souvenir repris dans la mémoire partagée.', other: '{count} souvenirs repris dans la mémoire partagée.' },
    show: 'Voir le texte',
  },
} as const satisfies Tree;
