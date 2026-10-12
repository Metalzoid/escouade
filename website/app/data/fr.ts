// Everything the French page says. en.ts says the same, key for key.
// The French guillemets hold non-breaking spaces ( ), so that « Importer » never splits over two lines.
import type { Catalog } from './catalog';
import { DOWNLOAD } from './site';

export const fr: Catalog = {
  meta: {
    title: 'Escouade — le poste de pilotage de tes agents Claude Code',
    description:
      'Escouade, le poste de pilotage de tes agents Claude Code : une app Windows, macOS et Linux gratuite et open source pour piloter plusieurs agents en parallèle, dans une seule fenêtre, et leur confier des tickets, même ceux de Jira, Trello, GitHub ou Linear, qu’ils mènent jusqu’au but.',
    locale: 'fr_FR',
  },

  header: {
    sections: 'Sections',
    video: 'Vidéo',
    features: 'Fonctionnalités',
    install: 'Installer',
    roadmap: 'Feuille de route',
    faq: 'FAQ',
    github: 'GitHub',
    download: 'Télécharger',
    language: 'Langue',
  },

  anchors: { features: 'fonctionnalites', install: 'installer', roadmap: 'feuille-de-route' },

  hero: {
    line1: 'Une escouade de Claude.',
    line2: 'Une seule fenêtre.',
    lede: 'Toutes tes sessions Claude Code dans une seule fenêtre : autant d’agents que tu veux, en parallèle, et un signal dès que l’un d’eux a besoin de toi.',
    download: 'Télécharger pour Windows, macOS et Linux',
    github: 'Voir sur GitHub',
    meta: 'Version {version} · Windows 10 et 11, macOS 11 et plus, Linux · Gratuit et open source (MIT)',
    video: 'Voir la vidéo',
  },

  spotlight: {
    title: 'Celui qui a besoin de toi passe devant.',
    text: 'Une question, une autorisation, une tâche finie : l’agent le signale, et tu réponds sans chercher dans quel terminal il attend. Essaie : réponds à tests-e2e.',
    points: [
      'Ctrl+J saute au prochain agent qui attend',
      'La vue d’ensemble montre tous les agents, ceux qui attendent en tête',
      'Carillon, notification système, onglet qui clignote : tu choisis ce qui te prévient',
    ],
  },

  video: { title: 'Escouade à l’œuvre.' },

  features: {
    title: 'Dans la fenêtre.',
    lead: 'Chaque agent avance de son côté. Toi, tu gardes la vue d’ensemble et tu n’interviens que quand il le faut.',
    items: {
      agents: {
        title: 'Projets en onglets, agents en parallèle',
        text: 'Un onglet par projet, et dans chacun autant d’agents Claude Code que tu veux : chacun sa conversation, son modèle, son effort et, si tu veux, son worktree git. Statut, tokens, coût et fichiers touchés, en direct.',
        alt: 'La fenêtre d’Escouade : les projets en onglets, la liste des agents et la conversation de l’un d’eux',
      },
      chat: {
        title: 'Un vrai chat, ou l’interface de Claude Code : à toi de choisir',
        text: 'Markdown, code coloré, appels d’outils qui se déplient sur un diff, questions et autorisations en cartes auxquelles tu réponds d’un clic. Tu préfères l’interface de Claude Code ? Un bouton y fait passer l’agent, dans un terminal, sans perdre sa session, et Escouade le suit toujours : notifications, coût, plan.',
        alt: 'Une conversation : réponse de Claude en markdown, appel d’outil déplié sur son diff',
      },
      notifications: {
        title: 'Tu sais quand on t’attend',
        text: 'Une question, une tâche finie : l’onglet et la carte clignotent, un carillon sonne, une notification système dit ce qui est demandé. Ctrl+J saute au prochain agent qui attend, et fermer la fenêtre ne coupe rien.',
        alt: 'Un agent en attente de réponse, sa question et sa carte dans la barre latérale',
      },
      git: {
        title: 'Git sous les yeux',
        text: 'Fichiers non commités par agent, diffs côte à côte, git graph du dépôt. Un commit rédigé par l’agent ou un message proposé que tu relis, puis le merge ou le squash d’un worktree dans sa branche.',
        alt: 'La disposition moitié / moitié : la conversation, les fichiers non commités et leur diff côte à côte',
      },
      editeur: {
        title: 'Un éditeur, sans quitter l’app',
        text: 'Arborescence, onglets, coloration et lignes modifiées dans la marge. Ctrl+clic va à une définition sans serveur de langage, Ctrl+P ouvre un fichier par son nom, Ctrl+Maj+F cherche dans tous les fichiers.',
        alt: 'L’éditeur intégré : l’arborescence du worktree, des onglets et le code avec ses lignes modifiées',
      },
      tableau: {
        title: 'Des tickets, que des agents prennent seuls',
        text: 'Le Kanban de chaque projet : écris un ticket et ses critères d’acceptation. Pilote auto activé, des agents les prennent, chacun dans son worktree, et bouclent jusqu’à ce que chaque critère soit atteint.',
        alt: 'Le Kanban d’un projet : deux tickets en cours avec leur boucle et leurs critères, et les tickets terminés',
      },
      test: {
        title: 'Teste chaque ticket en un clic',
        text: 'Un ticket passe « À tester » : « Tester » te montre la recette écrite par l’agent, lance ses serveurs sur leurs ports réservés et ouvre ton navigateur sur la fonctionnalité.',
        alt: 'La fenêtre « Tester DEM-6 » : préparation, serveurs prêts et adresse ouverte dans le navigateur',
      },
      integrations: {
        title: 'Tes tickets Jira, Trello, GitHub et Linear, dans le Kanban',
        text: 'Lie une source à ton projet, « Importer », coche : les tickets arrivent avec leurs critères d’acceptation. Escouade tient leur statut à jour et commente le ticket d’origine quand il est prêt à tester, puis terminé.',
        alt: 'La fenêtre « Importer des tickets » : trois tickets Jira cochés, avec leurs critères d’acceptation détectés',
      },
      lancement: {
        title: 'Lance ton projet d’un clic',
        text: 'Les commandes qui lancent ton projet (front, API, worker…), écrites par toi ou proposées par Claude, chacune dans son terminal avec son statut en direct. Un plantage se voit tout de suite, avec son code.',
        alt: 'Trois commandes de lancement, dont une plantée, et le journal du serveur de développement',
      },
      stats: {
        title: 'Tokens, coût, quotas : en direct',
        text: 'La barre de statut suit ton quota de 5 h, ton quota de la semaine et le coût du jour, qui monte pendant que Claude travaille. Le détail par projet, par modèle, par agent et par ticket est dans les statistiques.',
        alt: 'La page des statistiques : tokens par jour, coût par projet et par modèle',
      },
      remote: {
        title: 'Et depuis ton téléphone',
        text: 'Active le remote control sur un agent : sa session s’ouvre sur claude.ai et dans l’app Claude sur mobile, et ce que tu y envoies s’affiche aussi dans Escouade.',
        alt: 'Un téléphone sur claude.ai et Escouade qui affichent la même conversation',
      },
    },
  },

  cards: [
    { title: 'De vrais terminaux', text: 'PowerShell, Git Bash et WSL, avec l’autocomplétion de ton shell.' },
    { title: 'Limite d’usage ? Il reprend', text: 'Un agent arrêté par sa limite d’usage reprend seul dès que ton quota revient.' },
    { title: 'Toujours là', text: 'Fenêtre fermée, Escouade reste dans la zone de notification et reprend chaque session au redémarrage.' },
    {
      title: 'Derrière un proxy',
      text: 'Proxy HTTP(S) pour Claude, les quotas, les mises à jour, les intégrations et, si tu veux, les terminaux.',
    },
    {
      title: 'Mises à jour automatiques',
      text: 'Signées, téléchargées en arrière-plan, installées sans fenêtre quand aucun agent ne travaille.',
    },
    { title: 'Au clavier', text: 'Ctrl+1…9 les projets, Ctrl+N un agent, Ctrl+J celui qui attend, Ctrl+K chercher, Échap interrompre.' },
  ],

  install: {
    title: 'Prêt en trois étapes.',
    steps: [
      {
        title: 'Installe Claude Code',
        text: 'Escouade pilote le Claude Code de ta machine : installe-le et connecte-toi une fois, avec ton abonnement Claude ou une clé API.',
        link: { label: 'Documentation de Claude Code', href: 'https://code.claude.com/docs/fr/overview' },
      },
      {
        title: 'Installe Escouade',
        text: 'Le .exe pour Windows 10 ou 11 (avec Git for Windows), le .dmg pour macOS 11 ou plus récent, sur Mac Apple Silicon ou Intel, l’AppImage ou le .deb pour Linux (x86-64).',
        link: { label: 'Dernière version', href: DOWNLOAD },
      },
      {
        title: 'Ouvre un projet',
        text: 'Choisis un dossier, crée un agent et écris ta première demande. Les suivants arrivent avec Ctrl+N (⌘N sur Mac).',
      },
    ],
  },

  roadmap: {
    title: 'Ce qui arrive ensuite.',
    lead: 'Escouade ne pilotera bientôt plus seulement Claude Code. Pas de date promise : le chantier est décrit en détail sur GitHub.',
    next: 'Version {version} · en préparation',
    items: [
      {
        title: 'Codex, Copilot CLI et OpenCode',
        text: 'Chaque agent tourne sur le moteur de ton choix : Claude Code, Codex d’OpenAI, GitHub Copilot CLI ou OpenCode. Même conversation, mêmes cartes, même Kanban, mêmes worktrees.',
      },
      {
        title: 'Un moteur par projet, agent ou ticket',
        text: 'Un moteur par défaut pour chaque projet, un autre pour un agent ou un ticket, et le pilote auto qui suit.',
      },
      {
        title: 'Les quotas de chacun',
        text: 'Les fenêtres de quota de Codex et les crédits du mois de Copilot dans la barre d’état, et des statistiques par moteur.',
      },
    ],
    plan: 'Le plan détaillé',
    changelog: 'Ce qui est déjà sorti',
  },

  faq: {
    title: 'Questions fréquentes.',
    items: [
      {
        q: 'C’est gratuit ?',
        a: 'Oui, et open source, sous licence MIT. Escouade utilise ton propre Claude Code : ton abonnement Claude ou ta clé API, sans intermédiaire.',
      },
      {
        q: 'Où vont mes données ?',
        a: 'Nulle part : projets, conversations et statistiques restent sur ta machine, dans ~/.escouade/. Le réseau ne sert qu’à Claude Code lui-même, à la lecture de tes quotas, aux mises à jour et, si tu les connectes, à Jira, Trello, GitHub ou Linear, où un ticket importé reçoit son statut et des commentaires.',
      },
      {
        q: 'Et mes jetons Jira, Trello, GitHub ou Linear ?',
        a: 'Ils restent sur ta machine : dans le trousseau du système (Gestionnaire d’identification Windows, Trousseau macOS), ou sous Linux dans le fichier des intégrations de ~/.escouade/, et ne servent qu’aux appels de ces services. Pour GitHub, Escouade peut aussi reprendre celui de gh.',
      },
      {
        q: 'Je préfère l’interface de Claude Code, je peux la garder ?',
        a: 'Oui. Le bouton « Vue Claude Code », dans l’en-tête d’un agent, le fait tourner dans l’interface de Claude Code elle-même, dans un terminal : tes commandes /, tes raccourcis, tes dialogues. « Vue Escouade » le ramène dans le chat, sans perdre la session. Un réglage ouvre directement les nouveaux agents dans l’interface de Claude Code. Les agents des tickets, que le pilote auto mène, restent dans le chat.',
      },
      {
        q: 'Ça marche sur Mac ou Linux ?',
        a: 'Oui. Sur Mac : macOS 11 ou plus récent, Apple Silicon comme Intel. Sous Linux (x86-64) : l’AppImage, qui se met à jour toute seule, ou le .deb pour Debian et Ubuntu.',
      },
      {
        q: 'Le pilote auto peut-il épuiser mon quota ?',
        a: 'Tu choisis combien d’agents travaillent en parallèle (de 1 à 6), combien de boucles chaque ticket a au plus, et à quel pourcentage de tes quotas le pilote auto se met en pause. Rien ne démarre tant qu’un agent attend la fin de sa limite d’usage, et un ticket arrivé à sa dernière boucle passe « À tester » avec « Objectif partiel ».',
      },
      {
        q: 'Mes fichiers .env partent-ils dans les commits ?',
        a: 'Non. Les fichiers du projet que git ignore (.env* par défaut) sont copiés dans le worktree de chaque agent pour que l’app s’y lance ; à la validation d’un ticket, Escouade refuse de les commiter, de les pousser ou de les merger.',
      },
      {
        q: 'Comment se font les mises à jour ?',
        a: 'L’app cherche une nouvelle version toutes les cinq minutes et la télécharge en arrière-plan. Elle s’installe sans fenêtre d’installeur, au redémarrage que tu choisis, ou d’elle-même quand aucun agent ne travaille et que tout est enregistré, après t’avoir prévenu 30 secondes avant.',
      },
      {
        q: 'C’est un produit Anthropic ?',
        a: 'Non. Escouade est un projet indépendant, non affilié à Anthropic. Claude et Claude Code sont des marques d’Anthropic.',
      },
    ],
  },

  close: { title: 'Lance ton escouade.' },

  footer: {
    github: 'GitHub',
    license: 'Licence MIT',
    note: 'Projet indépendant, non affilié à Anthropic. Claude et Claude Code sont des marques d’Anthropic.',
  },

  notFound: { title: 'Page introuvable', text: 'Cette adresse ne mène nulle part.', home: 'Retour à l’accueil' },
  failure: { title: 'Une erreur est survenue', home: 'Retour à l’accueil' },

  demo: {
    status: { ready: 'Prêt', running: 'En cours', question: 'Question', done: 'Terminé', totest: 'À tester' },
    agents: 'Agents',
    loop: 'boucle {loop}/{max}',
    criteria: { one: '{count} critère atteint sur {total}', other: '{count} critères atteints sur {total}' },
    tokens: 'tok',
    running: '{count} en cours',
    waiting: '{count} en attente',
    done: { one: '{count} terminé', other: '{count} terminés' },
    today: 'Aujourd’hui ≈ {amount}',
    pause: 'Mettre la démonstration en pause',
    caption: 'Démonstration animée · données fictives',
    description:
      ' : cinq agents Claude Code du projet demo-api travaillent en parallèle ; l’un pose une question à laquelle tu peux répondre, un agent de ticket boucle sur ses critères jusqu’à « À tester ».',
  },

  squad: {
    names: { auth: 'refacto-auth', e2e: 'tests-e2e', docs: 'docs-api', login: 'fix-login' },
    ticketSlugs: ['paginer-les-users', 'filtrer-par-role', 'exporter-en-csv'],
    question: { text: 'Lancer toute la suite e2e (38 tests) ?', options: ['Oui', 'Seulement auth'] },
    results: {
      files: { one: '{count} fichier modifié', other: '{count} fichiers modifiés' },
      tests: { one: '{count} test passé', other: '{count} tests passés' },
      met: 'Critères atteints · à tester',
    },
  },
};
