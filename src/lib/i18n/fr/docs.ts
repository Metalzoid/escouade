import type { Tree } from '../types';

// The Docs tab (ESC-258): its spaces, the spec (map of the subjects, tree, page, import), sharing, the docs branch.
export default {
  tab: 'Docs',
  side: {
    spaces: 'Espaces',
    spacesLabel: 'Espaces des docs',
  },
  spaces: { spec: 'Spécification', decisions: 'Décisions', documents: 'Documents' },
  count: {
    gaps: { one: '{count} écart', other: '{count} écarts' },
    pages: { one: '{count} page', other: '{count} pages' },
    tickets: { one: '{count} ticket', other: '{count} tickets' },
    decisions: { one: '{count} décision', other: '{count} décisions' },
  },
  states: { ok: 'À jour', draft: 'Brouillon' },

  spec: {
    upToDate: { one: '{n} page à jour', other: '{n} pages à jour' },
    gaps: { one: '{n} écart avec le code', other: '{n} écarts avec le code' },
    drafts: { one: '{n} brouillon', other: '{n} brouillons' },
    compared: 'comparée au code {when}',
    neverCompared: 'pas encore comparée au code',
    newPage: 'Nouvelle page',
    treeLabel: 'Pages de la spécification',
    mapLabel: 'Sujets de la spécification',
    fold: 'Replier {name}',
    unfold: 'Déplier {name}',
    gapMark: 'écart',
    draftMark: 'brouillon',
    unsharedMark: 'à partager',
    unsharedTip: 'Modifiée ici, pas encore partagée avec l’équipe',
    openSubject: 'Ouvrir le sujet {name}',
  },

  moved: {
    title: 'Ce qui a bougé',
    line: '{who} a modifié {what} · {when}',
    unshared: { one: '{count} page modifiée ici, pas encore partagée', other: '{count} pages modifiées ici, pas encore partagées' },
    none: 'Les changements partagés de la spec apparaîtront ici.',
  },

  page: {
    back: 'Carte des sujets',
    edit: 'Modifier',
    inEditor: 'Ouvrir dans l’éditeur',
    inEditorTip: 'Ouvrir le fichier de la page dans l’éditeur d’Escouade',
    save: 'Enregistrer',
    cancel: 'Annuler',
    saved: 'Page enregistrée : elle fait partie des changements à partager.',
    titleField: 'Titre de la page',
    bodyField: 'Texte de la page, en Markdown',
    empty: 'Cette page est vide. « Modifier » pour l’écrire.',
    gaps: { one: 'Un écart avec le code', other: '{count} écarts avec le code' },
    openTicket: 'Ouvrir un ticket pour le code',
    seeCode: 'Voir le code',
    noCode: 'La comparaison n’a pas dit quels fichiers',
    ticketTitle: 'Aligner le code sur la spec : {page}',
    ticketDescription:
      'La page « {page} » de la spécification (.escouade/spec/{path}.md) et le code ne disent pas la même chose :\n\n{gap}\n\nFichiers concernés : {files}',
    noFiles: 'à trouver',
    sources: 'Sources',
    noSources: 'Aucune source citée',
    tickets: 'Tickets',
    decisions: 'Décisions',
    compared: 'Comparée au code {when}',
    neverCompared: 'Pas encore comparée au code',
    draft: 'Brouillon : pas encore arrêtée',
    notFound: 'Cette page n’est plus dans la spécification.',
  },

  newPage: {
    title: 'Nouvelle page',
    subject: 'Sujet',
    subjectHint: 'Paiement, Espace adhérent…',
    name: 'Titre',
    nameHint: 'En plusieurs fois',
    create: 'Créer la page',
    exists: 'La page « {path} » existe déjà.',
  },

  empty: {
    title: 'Pas encore de spécification',
    text: 'La spec de ce projet vivra ici, rangée par sujet, dans .escouade/spec de la branche des docs. Commence par une page, ou importe la spec que le projet a déjà.',
    found: 'Escouade a trouvé une spec dans ce projet :',
    file: '{path} · {size}',
    folder: { one: '{path} · {count} fichier Markdown', other: '{path} · {count} fichiers Markdown' },
    look: 'Voir le découpage',
    firstPage: 'Écrire une première page',
  },

  import: {
    title: 'Importer {path}',
    intro:
      'Escouade découpe la spec par ses titres : un sujet par grand titre, une page par section. Rien n’est écrit avant « Importer », et une page déjà là reste telle quelle.',
    lines: { one: '{count} ligne', other: '{count} lignes' },
    exists: 'déjà là, gardée',
    pageLabel: 'Importer la page {name}',
    go: { one: 'Importer {count} page', other: 'Importer {count} pages' },
    done: { one: '{count} page importée dans la spécification.', other: '{count} pages importées dans la spécification.' },
    nothing: 'Rien à importer dans ce fichier.',
    loading: 'Découpage…',
  },

  share: {
    on: 'Docs sur la branche {branch}',
    pending: { one: '{count} changement à partager', other: '{count} changements à partager' },
    none: 'rien à partager',
    go: 'Partager',
    withCodeTitle: 'Partager aussi le code ?',
    goAll: 'Tout partager',
    going: 'Partage…',
    tip: 'Les changements des docs (spec, décisions, documents) pas encore partagés avec l’équipe. « Partager » récupère d’abord ce que les autres ont partagé, puis enregistre et envoie les docs, et elles seules.',
    done: { one: '{count} changement des docs partagé.', other: '{count} changements des docs partagés.' },
    nothing: 'Rien à partager.',
    withCode: {
      one: 'Cette branche a aussi {count} commit de code pas encore partagé : « Partager » le publierait avec les docs. Tout partager ?',
      other:
        'Cette branche a aussi {count} commits de code pas encore partagés : « Partager » les publierait avec les docs. Tout partager ?',
    },
    conflict: 'Deux personnes ont modifié les mêmes pages : {files}.',
    resolve: 'L’agent résout',
    cancel: 'Annuler',
    resolving: 'L’agent rédacteur résout le conflit',
  },

  decisions: {
    empty: 'Aucune décision pour l’instant.',
    states: { proposed: 'proposée', accepted: 'acceptée', superseded: 'remplacée' },
  },
  documents: {
    empty: 'Aucun document pour l’instant.',
  },

  branch: {
    label: 'Branche des docs',
    desc: 'Où vivent la spec, les décisions et les documents (.escouade/). La branche courante : la spec suit le code de chaque branche. Une branche fixe : Escouade la tient dans un worktree à part et ne la fusionne jamais.',
    current: 'La branche courante',
    fixed: 'Une branche fixe',
    name: 'Nom de la branche des docs',
    currentAt: 'Les docs suivent la branche de chaque dossier : celle du projet, celle de chaque agent.',
    fixedAt: 'Les docs vivent sur {branch}, dans un worktree tenu par Escouade.',
  },
} as const satisfies Tree;
