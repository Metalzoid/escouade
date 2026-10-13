# Prise en main

Une première session pas à pas : ajouter un projet, créer un agent, choisir son modèle, son effort et son mode de permission, lui confier une demande, répondre à ses questions, relire ce qu’il a changé et commiter.

## Avant de commencer

Il te faut Claude Code installé et connecté à ton compte Claude, et git (voir l’[installation](installation)). Sous macOS, `Ctrl` devient `⌘` dans les raccourcis de cette page.

## Ajouter un projet

Un projet est un dossier de code. Sur l’écran d’accueil, clique sur « + Ajouter un projet ». Plus tard, le bouton `+` à droite des onglets de la barre de titre fait la même chose. La fenêtre « Nouveau projet » s’ouvre :

| Champ | Ce qu’il fait |
|---|---|
| « Dossier » | Le chemin du projet. « Parcourir… » ouvre le sélecteur de dossier. Sous le champ, une ligne dit ce qu’Escouade sait du dossier : « Dépôt git détecté · branche main · propre » (ou le nombre de fichiers modifiés), « Aucun dépôt git · un dépôt sera initialisé » ou « Dossier introuvable ». |
| « Nom » | Rempli avec le nom du dossier, que tu peux changer. « Aperçu de l’onglet » montre l’onglet tel qu’il sera. |
| « Couleur » | Une des 14 couleurs proposées ; la première qu’aucun projet n’utilise encore est choisie d’office. Elle teinte l’onglet et l’interface quand le projet est affiché. |
| « Créer un premier agent » | Activé par défaut : « Ouvre directement une conversation dans ce projet ». Des boutons « Fable », « Opus », « Sonnet » et « Haiku », chacun avec sa version, choisissent son modèle ; celui du réglage « Modèle par défaut » est déjà coché. |
| « Un worktree git par agent » | Désactivé par défaut : « Isole le travail de chaque agent et permet de voir ses fichiers modifiés séparément ». Tu pourras l’activer plus tard, voir les [worktrees](worktrees). |

Clique sur « Créer le projet » (le bouton reste grisé tant que le dossier n’existe pas). Le projet s’ouvre dans un nouvel onglet, avec son premier agent si tu l’as demandé.

> [!NOTE]
> Si le dossier n’est pas dans un dépôt git, Escouade lance `git init` pour en créer un : sans git, il n’y aurait ni diff ni commit à relire.

## Créer un agent

Un agent est une conversation avec Claude Code dans ce projet. Pour en créer un, appuie sur `Ctrl+N` ou clique sur « + Nouvel agent » en haut de la barre latérale : l’agent est créé sans rien te demander, et sa conversation s’affiche. Il s’appelle `agent-1`, `agent-2`… jusqu’à sa première demande ; Escouade lui donne alors un nom court tiré de ce que tu as écrit. Pour le renommer toi-même, double-clique sur son nom.

Son statut est « Prêt », et la conversation vide dit « Agent prêt », avec le dossier où il travaille. La flèche ▾ à droite de « + Nouvel agent » propose « Nouvel agent sur une branche… » (voir les [branches](branches)).

## Choisir le modèle, l’effort et le mode de permission

Sous le champ de message, trois menus règlent l’agent (un quatrième, « Compte », apparaît quand tu as plusieurs comptes Claude). Tu peux les changer en cours de conversation.

| Menu | Choix |
|---|---|
| « Modèle » | « Fable », « Opus », « Sonnet » et « Haiku ». Chacun lance le modèle le plus récent de sa famille que connaît Claude Code, et s’affiche avec sa version (par exemple « Sonnet 5.5 »). |
| « Effort » | « Bas » (réponses rapides, peu de réflexion), « Moyen » (équilibré), « Élevé » (réflexion approfondie), « Très élevé » (réflexion très approfondie), « Max » (réflexion maximale, plus de tokens). Haiku ne gère pas l’effort. |
| « Mode » | Le mode de permission, détaillé ci-dessous. |

Les modes de permission décident quand Claude te demande l’autorisation d’agir :

| Mode | Ce qui se passe |
|---|---|
| « Auto » | Un classifieur approuve les actions sûres et demande pour le reste. Indisponible avec Haiku. |
| « Demander » | Claude demande ton accord avant chaque action sensible. |
| « Plan » | Claude analyse et propose un plan sans rien modifier. |
| « Édits auto » | Les modifications de fichiers sont acceptées sans demander. |
| « Bypass » | Aucune demande de permission. |

Un nouvel agent démarre avec les valeurs de Réglages › Claude Code : « Modèle par défaut » (Sonnet), « Effort par défaut » (Moyen) et « Mode de permission par défaut » (Auto). Voir les [réglages de Claude Code](settings-claude-code) et [les agents](managing-agents).

> [!WARNING]
> En mode « Bypass », Claude agit sans aucune demande de permission : Escouade te le rappelle quand tu le choisis. Réserve-le aux environnements sûrs.

## Envoyer une première demande

Clique dans le champ de message, décris la tâche (« Décris la tâche à confier à Claude… »), puis appuie sur `Entrée` pour envoyer. `Maj+Entrée` va à la ligne.

- Tape `@` suivi d’un bout de nom de fichier pour choisir un fichier du projet, ou `/` pour choisir une commande.
- Colle ou glisse une image, un PDF ou un fichier texte dans le champ, ou clique sur le trombone, pour le joindre au message.

Dès l’envoi, le statut de l’agent passe à « En cours » et la conversation dit « Claude travaille… ». Ses appels d’outils apparaissent en lignes compactes que tu peux déplier. Tu peux lui écrire pendant qu’il travaille : il en tient compte dès sa prochaine étape. Pour l’arrêter, appuie sur `Échap` dans le champ de message ou clique sur « ■ Stop ».

## Répondre à une question ou à une autorisation

Quand Claude a besoin de toi, une carte à bordure ambre apparaît dans la conversation, le statut de l’agent devient « Question », et son onglet et sa carte clignotent si tu regardes ailleurs. Il y a deux cartes.

**« Claude demande une autorisation »** nomme l’outil et ce qu’il va faire. Trois boutons :

- « Autoriser » (`Ctrl+Entrée`) ;
- « Toujours autoriser » (`Ctrl+Maj+Entrée`), quand Claude Code propose de retenir ce choix ;
- « Refuser ».

Pour refuser en expliquant quoi faire à la place, écris-le dans le champ de message et envoie-le. Quand Claude Code refuserait la demande par défaut, « Refuser » est le bouton principal et seul un clic sur « Autoriser » l’accorde : les touches ne répondent pas. Quand Claude propose un plan, la carte s’appelle « Claude propose un plan » et les boutons sont « Approuver le plan », « Approuver et accepter les édits » et « Continuer à planifier ».

**« Claude attend ta réponse »** pose une question avec des options. Clique sur une option, ou appuie sur `Alt+1` à `Alt+9`, ou réponds librement dans le champ de message. Avec une seule question à choix unique, la réponse part dès ce clic ; avec plusieurs questions ou un choix multiple, « Valider » (`Ctrl+Entrée`) envoie les réponses.

> [!TIP]
> `Ctrl+J` ouvre le prochain agent qui attend ta réponse, le curseur dans son champ de message. Une carte qui vient d’arriver ignore les touches de réponse pendant une demi-seconde, pour qu’une frappe destinée à ton message ne réponde pas à sa place.

## Voir ce que l’agent a changé

Quand Claude a fini, le statut devient « Terminé » et une carte « Tâche terminée » donne la durée, les tokens, le coût et la liste des fichiers modifiés ; un clic sur un fichier l’ouvre dans l’éditeur.

Pour relire les changements, ouvre le panneau « Non commités » : clique sur « Fichiers ▸ » dans l’en-tête de la conversation, ou appuie sur `Ctrl+Maj+B`.

- Chaque ligne est un fichier, avec sa lettre (M pour modifié, A pour ajouté, D pour supprimé) et ses lignes ajoutées et retirées.
- Un clic sur un fichier ouvre son diff dans une grande fenêtre. « Unifié » et « Côte à côte » changent la présentation, `Échap` ferme la fenêtre. Quand il y a plusieurs fichiers, une colonne à gauche permet de passer de l’un à l’autre.
- « Voir le diff » ouvre le diff de tous les fichiers de la liste.
- « Cet agent » liste les fichiers de l’agent ; « Tout le projet » liste ceux de tous les agents du projet.

Pour garder la conversation et le diff sous les yeux ensemble, passe à la disposition côte à côte avec `Ctrl+Maj+L` : le panneau reste affiché à droite et montre le diff du fichier choisi sous la liste.

![Un agent dont le panneau « Non commités » liste trois fichiers, avec le diff du premier à droite de la conversation](/images/git.jpg)

## Commiter

Le bouton « Commit… » du panneau commite les changements de l’agent (« Commit tout… » quand « Tout le projet » est choisi). Ce qui se passe dépend du réglage « Commit » du projet, dans Réglages › Projets :

- **« Rédigé par l’agent »** (par défaut) : Escouade envoie à l’agent un message qui lui demande de commiter ses changements avec un message clair au format Conventional Commits. Un message éphémère confirme « Demande de commit envoyée à » suivi du nom de l’agent, puis l’agent commite comme pour n’importe quelle demande.
- **« Direct, avec un message proposé »** : la fenêtre « Commit » liste les fichiers, Haiku rédige un message que tu relis et modifies, « Régénérer » en demande un autre, et « Commiter » commite. Rien n’est commité sans ce clic.

Si l’agent travaille dans un worktree, le panneau propose aussi « Merger … → … », qui fusionne sa branche dans celle du projet. Voir [Git et commits](git) et [les worktrees](worktrees).

## Et ensuite

- [Les agents](managing-agents) et [la conversation](chat) : modes de permission, messages, images, recherche, historique.
- [Notifications](notifications) et [suivre ses agents](overview) : être prévenu, répondre sans ouvrir chaque conversation.
- [Git et commits](git), [les worktrees](worktrees) et [les branches](branches) : relire, commiter, isoler les agents.
- [L’éditeur](editor), [les terminaux](terminals) et [lancer le projet](launch).
- [Le Kanban](board) et [le pilote auto](autopilot) : confier des tickets à des agents.
- [Les comptes Claude](accounts) et [les quotas et le coût](usage).
- [Les raccourcis clavier](shortcuts) et [l’interface](interface) pour faire le tour de la fenêtre.
