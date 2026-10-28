import type { Tree } from '../types';

// « Index du code » (ESC-254): its setting in the project's settings and in « Nouveau projet », the model of the search by
// meaning, and what it saved in the statistics.
export default {
  what: 'Les agents trouvent le code plus vite et pour moins de tokens : en un appel, ils ont les fonctions, leurs appelants et ce qu’un changement toucherait, au lieu de lire des fichiers entiers.',
  local:
    'Tout reste sur cette machine : l’index est calculé ici et gardé dans le dossier d’Escouade, jamais dans le dépôt ; rien n’est envoyé en ligne.',
  privateNote:
    'Projet privé : son index ne sert qu’à ses propres agents ; ceux des autres projets n’y ont jamais accès. Les fichiers ignorés par git ne sont pas lus.',
  excluded: {
    one: 'Laissé hors de l’index : {list} (un autre projet dans son dossier).',
    other: 'Laissés hors de l’index : {list} (d’autres projets dans son dossier).',
  },
  settings: {
    title: 'Index du code',
    on: 'Indexer ce projet',
    onDesc:
      'Coupé par défaut. Allumé, le projet est lu une fois, puis tenu à jour aux commits, aux changements de branche et aux fins de tour. Le couper efface l’index.',
    reading: 'Lecture du projet…',
    status: '{files} fichiers · {symbols} symboles · {size} · lu {when}',
    turnedOn: 'Index du code allumé : {files} fichiers lus.',
    turnedOff: 'Index du code coupé : son index est effacé.',
  },
  vectors: {
    label: 'Recherche par le sens',
    desc: 'En plus des mots, la mémoire partagée et les docs se cherchent par le sens, avec un petit modèle multilingue ({model}, licence {license}) qui tourne sur cette machine. Un seul téléchargement de {size}, pour tous les projets ; ensuite, rien ne sort de la machine.',
    download: 'Télécharger ({size})',
    resume: 'Reprendre ({pct} %)',
    cancel: 'Annuler',
    downloaded: 'Téléchargé',
    delete: 'Effacer',
    deleteTitle: 'Effacer le modèle ({size}) : la recherche se fait par les mots seuls jusqu’au prochain téléchargement.',
    progress: 'Téléchargement du modèle',
  },
  wizard: {
    title: 'Indexer le code',
  },
  stats: {
    title: 'Économies de l’index du code',
    note: 'Ce que les agents n’ont pas eu à lire : les fichiers d’où viennent les réponses de l’index, moins ces réponses. En dollars, au prix d’entrée du modèle de chaque agent : une estimation.',
    project: 'Projet',
    calls: 'Réponses',
    tokens: 'Tokens économisés',
    cost: 'Dollars économisés',
    none: 'Aucune réponse de l’index sur la période.',
  },
} as const satisfies Tree;
