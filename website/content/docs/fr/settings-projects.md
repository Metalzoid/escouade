# Réglages : Projets

L’onglet « Projets » règle un projet à la fois : son nom et sa couleur, ses worktrees, la façon dont ses commits sont rédigés, ses commandes de préparation, de démontage et de lancement, et l’accès de ses agents à Escouade.

## Choisir le projet

L’onglet agit sur le projet choisi dans la rangée « Projet », sous l’en-tête de la [fenêtre des réglages](settings-application) : un bouton par projet ouvert. Ce que tu changes sur un projet reste dans le brouillon quand tu passes à un autre, et tout s’enregistre ensemble avec « Enregistrer ».

## Identité

| Réglage | Effet | Par défaut |
|---|---|---|
| « Nom » | Le nom du projet, tel que le montrent son onglet et le sélecteur de projet. Il ne peut pas rester vide : « Enregistrer » est alors bloqué. | Le nom donné à la création, celui du dossier si tu n’en as pas donné |
| « Dossier » | Le dossier du projet, affiché sans pouvoir être modifié. Le bouton « Ouvrir » l’ouvre avec le gestionnaire de fichiers du système. | — |
| « Couleur » | Une pastille parmi 14 (13 teintes et un ton neutre). La couleur repère le projet et teinte l’interface quand il est affiché. | La première couleur qu’aucun projet n’a prise, à la création |
| « Compte préféré » | Le compte sur lequel partent les nouveaux agents et les tickets du projet. Visible seulement avec plusieurs comptes. Choix : « Automatique » (le premier compte actif sous le seuil de pause, dans l’ordre des comptes) ou un des comptes actifs qui servent ce projet. | « Automatique » |

Les comptes sont décrits dans [les comptes](accounts) et réglés dans l’onglet [« Comptes Claude »](settings-accounts). Un compte désactivé depuis qu’il a été choisi reste affiché avec « (inactif) » tant qu’il est choisi, et il est ignoré en attendant.

## Git

| Réglage | Effet | Par défaut |
|---|---|---|
| « Un worktree par agent » | Isole les modifications de chaque nouvel agent dans sa propre branche. | Choisi à la création du projet (désactivé tant que tu ne le coches pas) |
| « Dossier des worktrees » | Où vont les worktrees des agents du projet. | Vide : `.claude/worktrees` |
| « Préfixe des branches des agents » | Début du nom de la branche d’un nouvel agent : le préfixe suivi du nom de l’agent. Vide, la branche prend le nom de l’agent seul. | `escouade/` |
| « Préfixe des branches des tickets » | Début du nom de la branche d’un ticket, celle de sa pull request : le préfixe suivi de la clé du ticket. Vide, la branche prend la clé seule. | `ticket/` |
| « Fichiers copiés dans les worktrees » | Les fichiers copiés du projet dans chaque nouveau worktree, un motif par ligne. | `.env*` |
| « Commit » | Qui rédige les commits demandés depuis le panneau des fichiers. | « Rédigé par l’agent » |

Les worktrees sont expliqués dans [les worktrees](worktrees).

### Dossier des worktrees

Tu peux écrire un chemin relatif au dossier du projet (`../app-worktrees`, `.worktrees`), un chemin relatif à ton dossier personnel (`~/worktrees/app`) ou un chemin complet. Les guillemets qu’ajoute « Copier en tant que chemin » sont retirés. Laissé vide, le champ vaut `.claude/worktrees`, comme `claude --worktree`.

Sous le champ, une ligne dit où ira le prochain worktree (« Le prochain : » suivi du chemin, avec `<nom>` pour le nom de l’agent). Les worktrees déjà créés restent où ils sont. Hors du projet, la vue Claude Code demande d’abord ta confiance pour chacun.

Un dossier refusé remplace cette ligne par un message rouge et bloque « Enregistrer » :

- le dossier du projet lui-même ;
- un dossier qui contient celui du projet : choisis-en un à côté (`../app-worktrees`) ou dedans (`.worktrees`) ;
- un dossier situé dans un dossier `.git` ;
- sous Windows, un chemin qui n’est ni relatif ni complet, comme `D:wt` ou `\wt`.

### Préfixes de branche

Les noms de branche des agents et des tickets sont ceux qui partent sur le dépôt distant avec une pull request : les préfixes servent à suivre la convention d’un dépôt. Les [branches](branches) sont décrites à part. Sous chaque champ, une ligne montre la forme obtenue.

Un préfixe qui ne donnerait pas un nom de branche valide est refusé pendant que tu tapes, et bloque « Enregistrer ». Sont refusés : un espace, `..`, `~`, `^`, `:`, `?`, `*`, `[`, `\` et `@{` ; un `-` ou un `/` au début ; `//` ; une partie du nom qui commence par `.` ou finit par `.lock`.

### Fichiers copiés dans les worktrees

Le champ est une zone de texte, un motif par ligne : `.env*` copie les `.env` de la racine, `**/.env*` ceux de tous les dossiers. Seuls sont copiés les fichiers que git ignore, et ils ne sont jamais commités. Les lignes vides sont ignorées.

### Commit

Ce choix concerne les boutons « Commit… » et « Commit tout… » du panneau des fichiers, décrits dans [Git](git).

- « Rédigé par l’agent » : l’agent est invité à commiter ses modifications.
- « Direct, avec un message proposé » : Escouade propose un message, tu le relis et tu commites toi-même.

## Serveur MCP

| Réglage | Effet | Par défaut |
|---|---|---|
| « Les agents peuvent utiliser Escouade » | Les agents du projet lisent les tickets et les agents, et peuvent créer des tickets ou lancer d’autres agents, ce qui dépense du quota. Chaque agent reçoit un jeton à lui. S’applique au prochain démarrage de son processus. | Désactivé |

Le [serveur MCP](mcp) tourne dès qu’un projet laisse ses agents l’utiliser, même quand « Claude peut piloter Escouade » est éteint dans l’onglet [« Claude Code »](settings-claude-code).

## Worktrees

Ce groupe règle les commandes qu’Escouade lance quand un worktree du projet s’ouvre, et avant qu’il soit supprimé. Aucune commande n’est définie au départ.

| Réglage | Effet |
|---|---|
| « À l’ouverture d’un worktree » | La préparation. Les commandes tournent dans l’ordre, avant le premier message de l’agent : dépendances, code généré… Les messages attendent la fin. |
| « Avant sa suppression » | Le démontage. Ce que la préparation a créé hors du worktree (base de données, conteneurs…) ; souvent rien. |

Chaque commande est une ligne numérotée.

| Champ | Effet |
|---|---|
| « Shell » | Le shell qui la lance, parmi ceux que l’app détecte. Une nouvelle commande prend le premier trouvé. Un shell que la machine n’a pas s’affiche avec « (introuvable) ». |
| « Commande » | La ligne de commande, comme `npm ci`. |
| « Sous-dossier » | Le dossier du worktree où elle tourne. Vide : sa racine. |
| ↑ et ↓ | Montent ou descendent la commande. `Alt+↑` et `Alt+↓` (`⌥↑` et `⌥↓` sous macOS) font de même depuis n’importe quel champ de la ligne. |
| × | Supprime la commande. |

« + Ajouter une commande » ajoute une ligne à la liste. Une commande dont la ligne de commande est vide n’est pas enregistrée.

Ces variables sont disponibles : `ESCOUADE_PROJECT_DIR` (le projet), `ESCOUADE_WORKTREE_DIR`, `ESCOUADE_BRANCH`, et les ports réservés d’un ticket (`ESCOUADE_PORT_BASE`, `ESCOUADE_PORT_END`). Un échec est signalé dans la conversation de l’agent.

### Remplir automatiquement

Le bouton « ✦ Remplir automatiquement » (« Claude lit le projet… » pendant qu’il travaille) demande à Claude de proposer les commandes. Il lit le projet (manifestes, lockfiles, README…) avec des outils de lecture seule : il ne modifie rien et ne lance rien. Ses commandes sont écrites pour le premier shell détecté.

La proposition s’affiche en entier, avec le shell et le dossier de chaque commande, dans « Commandes de worktree proposées ». Relis chaque commande en entier : une fois enregistrées, elles tournent seules, la préparation à l’ouverture de chaque nouveau worktree et le démontage avant sa suppression.

- « Remplacer les commandes » met la proposition à la place des deux listes du brouillon.
- « Ignorer » la jette.

Rien n’est enregistré avant « Enregistrer ». Un message dit combien de commandes sont proposées, et combien Claude en a écarté (caractères invisibles ou ligne trop longue). Quand il n’en trouve aucune, il dit « Claude n’a trouvé aucune commande à lancer pour ce projet. ».

## Lancement

Les commandes de lancement démarrent les serveurs, les observateurs et les services du projet. Chacune tourne dans son propre terminal, en lecture seule, lancée depuis la section Lancement de la barre latérale. L’engrenage de cette section (« Commandes de lancement… ») ouvre cet onglet sur ce groupe. Quand la section est vide, ses liens « Configurer » et « ✦ Proposer des commandes » l’ouvrent aussi, le second lançant en plus le remplissage. Voir [le lancement](launch) et [les terminaux](terminals).

Sans commande, le groupe dit « Aucune commande pour l’instant. ». Chaque commande a quatre champs.

| Champ | Effet |
|---|---|
| « Nom » | Le nom affiché dans la section Lancement, comme « Front ». Obligatoire. |
| « Shell » | Le shell qui la lance. Une nouvelle commande prend le premier shell trouvé. |
| « Commande » | La ligne de commande, comme `npm run dev`. Obligatoire. |
| « Sous-dossier » (vide = dossier du projet) | Le dossier, sous celui du projet, où elle tourne, comme `apps/web`. |

La croix à droite supprime la commande, et « + Ajouter une commande » en ajoute une. Une commande sans nom ou sans ligne de commande bloque « Enregistrer ».

« ✦ Remplir automatiquement » fonctionne comme pour les worktrees. Claude lit le projet (manifestes, scripts, docker-compose, README…) et propose les commandes à lancer dans « Commandes de lancement proposées », que « Remplacer les commandes » met à la place de la liste.

## Zone sensible

| Réglage | Effet |
|---|---|
| « Fermer le projet » | Le bouton « Fermer le projet… » demande confirmation, puis retire le projet et ses agents de l’app, conversations comprises. Les fichiers et les worktrees sur le disque ne sont pas touchés. |

Fermer le projet agit tout de suite, sans attendre « Enregistrer », et ramène aux réglages avec le brouillon tel qu’il était.

## Les autres réglages d’un projet

Les liens d’un projet vers Jira, Trello, GitHub Issues et Linear se règlent dans l’onglet [« Intégrations »](settings-integrations). Son Kanban (pilote auto, agents, validation) se règle dans l’onglet [« Kanban »](settings-board).
