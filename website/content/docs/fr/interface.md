# L’interface

Un tour de la fenêtre d’Escouade, région par région : la barre de titre et les onglets des projets, la barre latérale des agents, l’en-tête et la conversation, le panneau latéral, les deux dispositions, la barre d’état, les réglages et ce qui change sous macOS.

## La fenêtre d’un coup d’œil

![La fenêtre d’Escouade : les onglets des projets en haut, la liste des agents à gauche, la conversation de l’agent choisi au centre et la barre d’état en bas](/images/agents.jpg)

La fenêtre a cinq zones :

- **la barre de titre**, en haut : les onglets des projets et quelques boutons ;
- **la barre latérale**, à gauche : les agents du projet affiché, le lancement du projet et ses terminaux ;
- **la zone principale**, au centre : la conversation de l’agent choisi, ou une autre vue du projet (Kanban, éditeur, terminal, journal d’une commande de lancement) ;
- **le panneau latéral**, à droite, quand il est ouvert : les fichiers non commités et l’historique git ;
- **la barre d’état**, en bas : les agents actifs, les quotas, le coût du jour et la branche.

La fenêtre s’ouvre en 1440 × 900 et ne descend pas sous 1000 × 600. Escouade retient sa taille et sa position d’un lancement à l’autre.

Les messages brefs (une confirmation, une erreur) s’affichent en bas à droite, au-dessus de la barre d’état, et disparaissent seuls : au bout de 3 secondes et demie, de 7 secondes pour une erreur, de 12 pour un message qui porte un bouton.

Fermer la fenêtre ne quitte pas Escouade et ne coupe pas les agents : elle se range dans la zone de notification (la barre des menus sous macOS). Un clic sur l’icône, « Afficher » dans son menu, ou le lancement d’Escouade une seconde fois la ramène. « Quitter » dans le menu de l’icône arrête l’application ; si des fichiers de l’éditeur ne sont pas enregistrés, la fenêtre revient d’abord et demande « Quitter Escouade ? » (bouton « Quitter quand même »). L’infobulle de l’icône dit combien d’agents attendent une réponse.

## La barre de titre et les onglets des projets

De gauche à droite : le logo, le bouton « Vue d’ensemble », un onglet par projet suivi du bouton `+` (« Ajouter un projet »), puis « Éditeur » (quand un projet est affiché) et « Stats ». Sous Windows et Linux, Escouade dessine elle-même les boutons de la fenêtre (« Réduire », « Agrandir » ou « Restaurer », « Fermer »). Les parties vides de la barre servent à déplacer la fenêtre.

Quand les onglets ne tiennent pas dans la barre, ils défilent : à la molette, au pavé tactile, ou par la fine barre de défilement qui paraît sous eux au survol. Le bouton `+` reste visible à leur droite, et la partie vide qui déplace la fenêtre aussi. Un fondu au bord dit qu’il y a des onglets cachés de ce côté ; il clignote dans la couleur de l’alerte quand l’un d’eux clignote. L’onglet du projet affiché revient de lui-même dans la barre, quelle que soit la façon de l’afficher (clic, notification, raccourci, « Vue d’ensemble »).

### Un onglet de projet

Un onglet montre un carré de la couleur du projet, son nom, puis des signes qui ne s’affichent que s’ils ont lieu d’être :

| Signe | Ce qu’il veut dire |
|---|---|
| Point vert | Un agent du projet travaille et aucun n’attend ta réponse. |
| « Δ 7 » | Le nombre de modifications git non commitées du projet (infobulle « Modifications git non commitées »). |
| Pastille ambre avec un nombre | Autant d’agents du projet attendent ta réponse (infobulle « Agents en attente de réponse »). |
| Onglet qui clignote | Un agent du projet a posé une question, a terminé ou a échoué pendant que tu regardais ailleurs. L’infobulle liste les agents (« À voir : … »). Le clignotement est rouge pour une erreur, ambre pour une question, vert pour une fin, la plus pressante l’emportant. Il s’arrête quand tu affiches l’agent, la fenêtre au premier plan. |

L’infobulle d’un onglet donne aussi le chemin du dossier du projet.

- Un clic affiche le projet. `Ctrl+1` à `Ctrl+9` affichent le projet n.
- Glisse un onglet pour changer l’ordre des projets ; l’ordre est gardé. Près d’un bord de la barre, les onglets défilent, pour le déposer parmi ceux qui étaient cachés.
- Un clic droit, ou un clic du milieu, ouvre le menu du projet :

| Entrée | Ce qu’elle fait |
|---|---|
| « Renommer… » | Ouvre la fenêtre « Renommer le projet ». |
| « Couleur » | Une rangée de pastilles : la couleur du projet, qui teinte l’interface quand il est affiché. |
| « Activer le worktree par agent » ou « Désactiver le worktree par agent » | Bascule l’option pour les nouveaux agents du projet. Voir les [worktrees](worktrees). |
| « Réglages du projet… » | Ouvre les réglages, onglet Projets, sur ce projet. |
| « Ouvrir le dossier » | Ouvre le dossier du projet dans le gestionnaire de fichiers du système. |
| « Fermer le projet… » | Retire le projet de l’application après confirmation : ses agents, ses terminaux et ses lancements s’arrêtent. Son historique (conversations, tickets, réglages) est gardé, et ajouter un projet dans le même dossier le retrouve ; une case de la confirmation permet de l’effacer aussi. Les fichiers et les worktrees sur le disque ne sont pas touchés. Voir [Réglages : Projets](settings-projects#projets-fermes). |

### Les boutons de la barre

- **« Vue d’ensemble »** (`Ctrl+Maj+A`) affiche les agents de tous les projets sur une page ; le même bouton, ou le même raccourci, la referme. Voir [suivre ses agents](overview).
- **« Éditeur »** ouvre l’éditeur sur le dossier du projet (« Parcourir et éditer les fichiers du projet »). Voir [l’éditeur](editor).
- **« Stats »** affiche les statistiques de consommation. Voir les [statistiques](stats).

## La barre latérale

### Agents et Kanban

En haut, un sélecteur à deux boutons : « Agents » affiche la conversation d’un agent, « Kanban » le tableau de tickets du projet. Quand des tickets attendent ton test, un badge sur « Kanban » donne leur nombre (« N à tester »). Voir [le Kanban](board).

### La liste des agents

L’en-tête « Agents » porte le nombre d’agents du projet et le bouton « + Nouvel agent » (`Ctrl+N`). La flèche ▾ à sa droite ouvre « Nouvel agent sur une branche… ». Sans agent, la liste dit « Aucun agent. » avec un bouton « Créer un agent ».

Chaque agent est une carte :

- son **nom** (double-clic pour le renommer sur place : `Entrée` valide, `Échap` annule), une icône d’ondes quand le [remote control](remote-control) est activé (bleue une fois connecté), et son **statut** ;
- ce que l’agent annonce faire, quand il l’a dit par le [serveur MCP](mcp) ;
- son **modèle**, le temps pendant lequel il a travaillé et, s’il a un worktree, sa branche (`⎇ …`) ;
- ses **tokens**, son **coût** (précédé de « ≈ » tant qu’un tour tourne : c’est alors une estimation) et le nombre de ses fichiers modifiés (« N fich. ») ;
- une mini-barre « Plan 2/7 » quand l’agent suit un plan (voir [l’avancée d’un plan](plan)) ;
- pour l’agent d’un ticket, une étiquette `▸ DEM-3 · boucle 1/5`, ou `▸ DEM-3 · à tester`.

Un clic sur une carte affiche l’agent. `Ctrl+Tab` et `Ctrl+Maj+Tab` passent à l’agent suivant ou précédent du projet, sans les agents archivés.

### Les statuts et leurs couleurs

| Statut | Point | Texte |
|---|---|---|
| « Prêt » | Gris | Gris |
| « En cours » | Vert, avec un halo qui pulse | Vert |
| « Question » | Ambre, qui pulse | Pastille ambre « Question » |
| « Terminé » | Coche verte | Vert |
| « Erreur » | Rouge | Rouge |

À la place du statut, la carte peut dire « Préparation… » (le worktree de l’agent se prépare) ou « Reprise » suivi d’une heure (l’agent, arrêté par la limite d’usage, reprend alors tout seul), en ambre.

Une carte dont l’agent a posé une question, a terminé ou a échoué pendant qu’il n’était pas affiché clignote, en ambre, en vert ou en rouge, jusqu’à ce que tu l’ouvres. `Ctrl+J` va à l’agent suivant qui attend ta réponse ou qui est à voir.

### Le menu d’un agent

Un clic droit sur une carte ouvre son menu :

| Entrée | Ce qu’elle fait |
|---|---|
| « Renommer » | Renomme l’agent. |
| « Dupliquer la conversation » | Crée une copie de l’agent qui reprend tout son contexte dans une nouvelle session, sans toucher à l’original. Grisée pendant un tour (« Attends la fin de son tour. »). |
| « Archiver » ou « Restaurer » | Range l’agent dans la liste « Archivés (N) » en gardant sa conversation, ou l’en ressort. Si son ticket est en cours ou à tester, une confirmation prévient qu’il repart « À faire ». |
| « Préparer le lancement » | Pour un agent dans un worktree, sans ticket en cours : lui demande comment lancer son worktree, sur ses propres ports. |
| « Intégrer … » | Pour un agent dans un worktree : fait entrer la branche de base du projet dans la sienne. |
| « Ouvrir dans l’éditeur » | Ouvre l’éditeur sur son worktree, sinon sur le dossier du projet. |
| « Ouvrir un terminal » | Ouvre un terminal dans son worktree, sinon dans le dossier du projet. |
| « Vue Claude Code » ou « Vue Escouade » | Change de vue, comme le bouton de l’en-tête de sa conversation. Absente pour un agent de ticket et pour un agent archivé. Voir [la vue Claude Code](claude-code-view). |
| « Activer le remote control » ou « Désactiver le remote control » | Rend la session accessible depuis claude.ai et l’app Claude (« claude.ai, mobile »). Quand le lien est disponible, « Ouvrir sur claude.ai » et « Copier le lien claude.ai » apparaissent. Absente en [vue Claude Code](claude-code-view), où c’est la commande `/remote-control` de Claude Code qui le fait. |
| « Supprimer… » | Arrête le processus Claude et retire la conversation de l’application ; la session Claude Code reste sur le disque. Pour un agent avec un worktree, une case propose de supprimer aussi le worktree, et sa branche si elle a été créée pour l’agent. |

Les agents archivés sont sous « Archivés (N) », un titre que tu déplies d’un clic ; leur carte ne montre que le nom et le coût.

### Lancement

La section « Lancement » liste les commandes de lancement du projet (serveur de développement, watchers…) avec leur état. ▶ lance une commande, ⟳ la relance, ■ la stoppe ; « Tout lancer » et « Tout arrêter » agissent sur toutes. Un clic sur une commande affiche son journal dans la zone principale. L’engrenage ouvre « Commandes de lancement… » ; sans commande, « Configurer » ouvre leurs réglages et « ✦ Proposer des commandes » laisse Claude en proposer. Voir [lancer le projet](launch).

### Terminaux

La section « Terminaux » liste les terminaux ouverts du projet. Le bouton `+` (« Nouveau terminal ») propose les shells détectés sur la machine, puis « Dans le worktree de… », qui liste les agents du projet ayant un worktree (pas les archivés) pour y ouvrir un terminal ; l’entrée n’existe pas quand aucun agent n’en a. `Ctrl+T` en ouvre un tout de suite. Un clic sur un terminal l’affiche dans la zone principale, le × le ferme, et un terminal dont le shell s’est arrêté est marqué « terminé ». Voir [les terminaux](terminals).

### Le pied de la barre

Le pied rappelle le dossier du projet, sa branche git et le décompte de ses fichiers modifiés : `~N modifiés`, `+N ajoutés`, `−N supprimés` (ou « Pas de dépôt git »). Le bouton « Parcourir » ouvre l’éditeur sur le dossier du projet.

## L’en-tête et la conversation

![L’en-tête d’un agent, avec ses boutons et ses chiffres, au-dessus de sa conversation et du champ de message](/images/chat.jpg)

L’en-tête de la conversation d’un agent montre, de gauche à droite :

| Élément | Ce qu’il montre ou fait |
|---|---|
| Nom et statut | Le nom de l’agent (double-clic pour le renommer) et son statut. |
| `projet / branche` | Le projet, et la branche de l’agent s’il a un worktree, sinon celle du dossier du projet. |
| « Éditeur » | Ouvre l’éditeur sur les fichiers de l’agent. |
| « Terminal » | Pour un agent dans un worktree (pas archivé) : ouvre un [terminal](terminals) dans ce worktree. |
| « ▶ Tester » ou « Préparer le lancement » | Pour un agent dans un worktree : lancer son travail pour l’essayer, ou demander à l’agent comment le lancer. Voir [tester et valider](testing). |
| « Vue Claude Code » ou « Vue Escouade » | Fait tourner l’agent dans l’interface de Claude Code elle-même, ou le ramène dans la conversation d’Escouade. Absent pour un agent de ticket. Voir [la vue Claude Code](claude-code-view). |
| Le modèle | Le modèle de l’agent, avec sa version. |
| « Contexte » | Les tokens du contexte sur la taille de la fenêtre du modèle (« 76,2 k / 200 k »). Le chiffre devient ambre à partir de 80 %, quand le contexte est presque plein. |
| « Tokens », « Coût », « Durée » | Ce que l’agent a consommé et le temps qu’il a travaillé. |
| « Fichiers » | Le nombre de fichiers non commités de l’agent. |
| Deux boutons | Le choix de la disposition (voir plus bas). |

Sous l’en-tête, la conversation montre tes messages, les réponses de Claude en markdown, ses réflexions repliables, ses appels d’outils en lignes compactes dépliables, les cartes de questions et d’autorisations, et une ligne ou une carte à la fin de chaque tour. Quand l’agent suit un plan, un bandeau « Plan » s’intercale entre l’en-tête et les messages : voir [l’avancée d’un plan](plan). Une longue conversation n’affiche que ses 80 derniers éléments : « Afficher les N précédents » en ajoute. Si de nouveaux messages arrivent pendant que tu lis plus haut, le bouton « ↓ Nouveaux messages » te ramène en bas. `Ctrl+K` cherche dans les conversations.

Le champ de message est en bas : ses menus « Modèle », « Effort » et « Mode », le trombone, « Envoyer », et « ■ Stop » pendant un tour. Un agent archivé affiche à la place « Agent archivé. » avec un bouton « Restaurer ». Un agent en erreur le dit (« L’agent s’est arrêté. ») : un nouveau message relance Claude sur la même session. Voir [la conversation](chat) et [les agents](managing-agents).

## Le panneau latéral

Le panneau latéral a deux onglets : « Non commités », suivi du nombre de fichiers, et « Historique ».

### Non commités

- Le sélecteur « Cet agent » et « Tout le projet » choisit la portée de la liste. Sous lui, une ligne dit d’où viennent les fichiers : le worktree de l’agent (« isolé des autres agents »), ses éditions, ou tous les agents du projet.
- Chaque ligne est un fichier : sa lettre (M, A ou D), son nom, son dossier, ses lignes ajoutées et retirées, et pour « Tout le projet » le nom de l’agent. Le bouton `</>` d’une ligne ouvre le fichier dans l’éditeur. Un clic droit propose « Ouvrir dans l’éditeur » puis, selon la lettre du fichier, « Abandonner les modifications… » (M) ou « Supprimer le fichier… » (A), toujours après confirmation, ou « Restaurer le fichier » (D).
- En bas : « Voir le diff », « Commit… » (« Commit tout… » pour « Tout le projet ») et, pour un agent dans un worktree, « Merger … → … » et « Intégrer … ».

La liste n’affiche que 500 fichiers ; le diff et le commit les prennent tous. Voir [Git et commits](git).

### Historique

L’onglet « Historique » montre le graphe git de tout le dépôt, avec la branche de l’agent mise en avant. Un clic sur un commit ouvre son diff ; un clic droit propose des actions sur les branches. Voir [les branches](branches).

## Les deux dispositions

Le choix se fait avec les deux boutons à droite de l’en-tête, « Disposition classique » et « Conversation et fichiers côte à côte », ou avec `Ctrl+Maj+L`. Escouade garde ton choix d’un lancement à l’autre.

| Élément | Classique | Côte à côte |
|---|---|---|
| Panneau latéral | Optionnel, large de 330 px : « Fichiers ▸ » dans l’en-tête ou `Ctrl+Maj+B` l’ouvre, le × le ferme. | Toujours affiché, sur la moitié droite de la zone principale. `Ctrl+Maj+B` ne fait rien. |
| Clic sur un fichier | Le diff s’ouvre dans une grande fenêtre. | Le diff s’affiche sous la liste, dans le panneau. |
| « Fichiers » dans l’en-tête | Un bouton qui ouvre le panneau. | Un simple chiffre. |

![La disposition côte à côte : la conversation à gauche, les fichiers non commités et le diff du fichier choisi à droite](/images/git.jpg)

Quand la conversation est étroite, ce qui arrive en disposition côte à côte, l’en-tête retire d’abord « Tokens » et « Durée » ainsi que le texte de ses boutons, puis « Coût » et « Fichiers ». Les cartes de la barre latérale montrent les mêmes chiffres.

## La barre d’état

De gauche à droite :

| Élément | Ce qu’il montre |
|---|---|
| `● N actifs` | Le nombre d’agents « En cours ». |
| `● N en attente` | Le nombre d’agents « Question », en ambre quand il y en a. Un clic va à l’agent suivant qui attend ou qui est à voir (`Ctrl+J`). |
| `✓ N terminés` | Le nombre d’agents « Terminé ». |
| `N Claude · mémoire · CPU` | Les processus Claude en cours, avec les outils et les serveurs MCP qu’ils lancent ; l’infobulle détaille agent par agent. |
| `5h … reset 3h01` et `7j … reset 4j 12h` | Les quotas du compte en cours, fenêtre de 5 heures et de 7 jours : une barre (qui vire à l’ambre au-delà de 80 %) et le temps avant la remise à zéro. Le pourcentage est dans l’infobulle. Avec plusieurs comptes, le nom du compte en cours précède les barres et un clic ouvre le panneau « Quotas des comptes Claude ». |
| `Aujourd'hui 3,48 $` | Ce que tes agents ont coûté aujourd’hui, précédé de « ≈ » tant qu’un tour tourne. |
| `⎇ main ↑1 ↓3` | La branche du projet affiché, avec les commits à pousser (↑) et à tirer (↓). Un clic ouvre le sélecteur de branches. « non publiée » ou « distante supprimée » remplace les flèches quand la branche n’a pas de suivi. |
| Mise à jour | « Mise à jour X prête · Redémarrer » quand une mise à jour est téléchargée : un clic ouvre la fenêtre de la mise à jour. Pendant le téléchargement, la barre dit « Mise à jour X… » ; quand un redémarrage automatique est prévu, « Redémarrage dans N s » et le bouton « Plus tard » prennent la place. Voir les [mises à jour](updates). |
| `♪ On` ou `♪ Off` | Active ou coupe le son des notifications. |
| `⚙` | Ouvre les réglages (`Ctrl+,`). |

Voir [les quotas et le coût](usage) et [les branches](branches).

## Les réglages

`Ctrl+,` ou le bouton ⚙ de la barre d’état ouvre la fenêtre des réglages : les onglets à gauche, le contenu à droite. Un onglet modifié est marqué ; « Enregistrer » enregistre tous les onglets d’un coup et « Annuler » (ou `Échap`) ferme la fenêtre sans enregistrer. L’onglet « Comptes Claude » fait exception : il enregistre à chaque changement. Les onglets « Projets », « Kanban » et « Intégrations » règlent un projet à la fois, choisi en haut ; « Réglages du projet… » dans le menu d’un onglet de projet ouvre la fenêtre sur ce projet.

| Onglet | Page |
|---|---|
| « Application » | [Réglages de l’application](settings-application) |
| « Claude Code » | [Réglages de Claude Code](settings-claude-code) |
| « Comptes Claude » | [Réglages des comptes Claude](settings-accounts) |
| « Notifications » | [Réglages des notifications](settings-notifications) |
| « Projets » | [Réglages des projets](settings-projects) |
| « Kanban » | [Réglages du Kanban](settings-board) |
| « Intégrations » | [Réglages des intégrations](settings-integrations) |
| « Terminaux » | [Réglages des terminaux](settings-terminals) |
| « Réseau » | [Réglages du réseau](settings-network) |
| « À propos » | [Réglages « À propos »](settings-about) |

## Sous macOS

- **Barre de titre native.** macOS dessine lui-même les boutons de la fenêtre (rouge, jaune, vert) à gauche de la barre de titre, avant les onglets ; Escouade n’affiche pas les siens. Le bouton rouge range la fenêtre dans la barre des menus, comme sous Windows et Linux, et `⌘Q` ou « Quitter Escouade » arrête l’application.
- **`⌘` à la place de `Ctrl`.** Tous les raccourcis de cette page prennent `⌘` (`⌘N`, `⌘,`, `⌘K`, `⇧⌘L`…), sauf `Ctrl+Tab` et `Ctrl+Maj+Tab`, parce que `⌘Tab` change d’application. Dans les terminaux, `⌘C` et `⌘V` copient et collent, et les touches `Ctrl` vont au shell.
- **Barre des menus.** Escouade a ses menus macOS : le sien (« À propos d’Escouade », « Masquer Escouade », « Quitter Escouade »…), « Édition », « Présentation », « Fenêtre » et « Aide », dans la langue de l’interface.
- **Notifications.** L’icône du Dock rebondit quand un agent a besoin de toi, là où la barre des tâches clignote sous Windows. Voir [les notifications](notifications).
