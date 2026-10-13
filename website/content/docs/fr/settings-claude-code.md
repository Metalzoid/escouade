# Réglages : Claude Code

L’onglet « Claude Code » règle l’exécutable de Claude Code, le modèle, l’effort et le mode de permission des nouveaux agents, la vie des processus Claude, et le serveur qui laisse Claude piloter Escouade.

## Exécutable

Le groupe « Exécutable » n’a qu’un champ.

| Réglage | Effet | Par défaut |
|---|---|---|
| « Chemin de l’exécutable » (vide = détection automatique) | Le `claude` qu’Escouade lance pour les agents. Un compte qui a son propre exécutable, dans l’onglet [« Comptes Claude »](settings-accounts), lance le sien. | Vide |

### Où Escouade cherche

Champ vide, Escouade cherche `claude` dans le `PATH`, puis aux emplacements habituels des installeurs :

- sous Windows : `~\.local\bin\claude.exe`, `~\.claude\local\claude.exe` et `~\AppData\Roaming\npm\claude.cmd` ;
- sous macOS et Linux : `~/.local/bin/claude`, `~/.claude/local/claude`, `/opt/homebrew/bin/claude` et `/usr/local/bin/claude`.

Sous Windows, s’il n’en trouve aucun, Escouade cherche un Claude Code installé dans WSL, dans la distribution que nomme « Distribution WSL » dans l’onglet [« Terminaux »](settings-terminals) (vide = la distribution par défaut).

Champ rempli, tu peux écrire :

- un chemin complet ;
- un chemin qui commence par `~`, le dossier personnel (Windows, macOS et Linux) ;
- sous Windows, un chemin sans son `.exe` ni son `.cmd` ;
- sous Windows, un Claude Code installé dans WSL : `~/.local/bin/claude`, `/home/<utilisateur>/.local/bin/claude` ou `\\wsl.localhost\<distribution>\home\<utilisateur>\.local\bin\claude` (`\\wsl$\<distribution>\…` marche aussi).

### La ligne sous le champ

Un quart de seconde après que tu as fini de taper, Escouade cherche le `claude` du champ et dit ce qu’elle a trouvé sous le champ :

- « Trouvé : » suivi du chemin ;
- « Trouvé dans WSL (Ubuntu) : » suivi du chemin Linux, pour un Claude Code de WSL ;
- « Introuvable. » : sous Windows, la ligne rappelle alors les formes de chemin acceptées, celles de WSL comprises ; ailleurs elle dit « Introuvable. Indique le chemin de claude. ».

Champ vide, le texte grisé dit déjà si `claude` est trouvé : « claude (trouvé dans le PATH) » ou « introuvable — indique le chemin de claude.exe ». Après « Enregistrer », un nouveau chemin ou une nouvelle distribution WSL fait chercher à nouveau, pour mettre à jour le bandeau du [Kanban](board) et le texte du champ.

> [!WARNING]
> Si le `claude` trouvé est dans WSL et que le réseau de WSL est en NAT, un avertissement s’ajoute : le serveur MCP d’Escouade et le suivi de la [vue Claude Code](claude-code-view) n’atteignent pas l’app. Passe WSL en mode miroir (`networkingMode=mirrored` sous `[wsl2]` dans `%UserProfile%\.wslconfig`), puis lance `wsl --shutdown`.

## Nouveaux agents

Les trois choix valent pour chaque [agent](managing-agents) créé ensuite. Dans le champ de message d’un agent, tu peux les changer pour cet agent seul. Les tickets du Kanban les reprennent quand l’onglet [« Kanban »](settings-board) du projet ne choisit pas les siens.

| Réglage | Effet | Par défaut |
|---|---|---|
| « Modèle par défaut » | Un des alias de Claude Code : « Fable », « Opus », « Sonnet » ou « Haiku ». Une fois que Claude Code a dit quelle version il fait tourner pour un alias, la puce l’affiche (« Sonnet 5.5 », par exemple). | « Sonnet » |
| « Effort par défaut » | Combien le modèle réfléchit avant de répondre. | « Moyen » |
| « Mode de permission par défaut » | Ce que Claude peut faire sans te demander. | « Auto » |

### Les niveaux d’effort

| Niveau | Sens |
|---|---|
| « Bas » | Réponses rapides, peu de réflexion |
| « Moyen » | Équilibré |
| « Élevé » | Réflexion approfondie |
| « Très élevé » | Réflexion très approfondie |
| « Max » | Réflexion maximale, plus de tokens |

### Les modes de permission

| Mode | Sens |
|---|---|
| « Auto » | Un classifieur approuve les actions sûres et demande pour le reste |
| « Demander » | Claude demande ton accord avant chaque action sensible |
| « Plan » | Claude analyse et propose un plan sans rien modifier |
| « Édits auto » | Les modifications de fichiers sont acceptées sans demander |
| « Bypass » | Aucune demande de permission (à réserver aux environnements sûrs) |

Les demandes d’autorisation et leur traitement sont décrits dans [la conversation](chat), et le mode « Plan » dans [le plan](plan).

> [!NOTE]
> Avec Haiku, le choix de l’effort est grisé dans le champ de message de l’agent (« Haiku ne gère pas l’effort »), comme le mode « Auto » (« indisponible avec Haiku »).

## Processus

| Réglage | Effet | Par défaut |
|---|---|---|
| « Reprise automatique après la limite d’usage » | « continue » est envoyé à l’agent une fois le quota réinitialisé. | Activé |
| « Reprendre sur un autre compte un agent de ticket arrêté par la limite » | Sinon il attend la remise à zéro de son compte. Absent tant qu’il n’y a qu’un compte. | Désactivé |
| « Ouvrir les nouveaux agents dans l’interface de Claude Code » | Un nouvel agent tourne dans la vue Claude Code plutôt que dans la conversation d’Escouade. | Désactivé |
| « Les agents tiennent une liste de tâches » | Les agents reçoivent l’outil de liste de tâches de Claude Code. | Activé |
| « Arrêter les processus Claude inactifs après » (minutes, 0 = jamais) | Le processus Claude d’un agent inactif est arrêté après ce délai. | 30 |

### Reprise automatique

Quand un agent s’arrête sur la limite d’usage, Escouade prévoit de lui écrire « continue » à la remise à zéro du quota. Désactiver le réglage annule aussi les reprises déjà prévues. La limite et les quotas sont expliqués dans [l’usage](usage).

### Reprise sur un autre compte

Avec plusieurs comptes, un agent de ticket arrêté par la limite repart tout seul, avec sa session, sur le compte que choisirait Escouade, quand un autre est utilisable, au lieu d’attendre la remise à zéro de son compte. Voir [les comptes](accounts) et l’onglet [« Comptes Claude »](settings-accounts).

### Vue Claude Code

Chaque agent change de vue depuis son en-tête, et ce réglage ne fait que choisir la vue de départ. Les agents de ticket restent dans la vue d’Escouade. Voir [la vue Claude Code](claude-code-view).

### Liste de tâches

Si l’agent tient une liste, Escouade montre son avancée dans le bandeau « Plan » ; le modèle n’est pas obligé de s’en servir. Le réglage s’applique aux agents lancés ensuite. Voir [le plan](plan).

### Processus inactifs

Le champ est un nombre de minutes ; 0 veut dire jamais, et un champ vide vaut 0. La session d’un agent dont le processus a été arrêté reste reprenable. Un agent en remote control n’est jamais arrêté ainsi, pour rester joignable depuis claude.ai.

## Escouade dans Claude

Ce groupe laisse Claude Code, dans un terminal, dans un autre outil ou dans un agent d’Escouade, lire tes projets, tes agents et tes tickets, et créer des tickets ou lancer des agents, par le [serveur MCP](mcp) d’Escouade.

### Claude peut piloter Escouade

L’interrupteur est désactivé par défaut. Il s’enregistre tout de suite, sans passer par « Enregistrer » : l’activer déclare le serveur dans la config de Claude Code de chaque compte actif, ce qu’un « Annuler » ne pourrait pas défaire. Le désactiver change le jeton et retire le serveur de chaque compte.

Tant qu’un projet laisse ses agents utiliser Escouade (réglage « Les agents peuvent utiliser Escouade » dans l’onglet [« Projets »](settings-projects)), le serveur tourne même interrupteur éteint.

Interrupteur allumé, une ligne dessous dit où en est la déclaration :

- « Déclaration dans Claude… » pendant qu’Escouade écrit le serveur dans la config de Claude Code ;
- « Déclaré dans Claude · compte Principal, compte Pro » quand c’est fait pour les comptes listés ;
- « Pas déclaré pour le compte Pro : » suivi de la raison, quand ça a échoué pour un compte : la fenêtre montre alors la commande à lancer à la main (introduite par « À lancer à la main dans PowerShell : », ou « … dans sh : » sous macOS), avec le jeton masqué, et le bouton « Copier la commande » copie la vraie commande (« Commande copiée ») ;
- « Le serveur n’a pas démarré : » suivi de la raison, à la place des lignes précédentes.

> [!WARNING]
> Le jeton est écrit en clair dans la config de Claude Code (`~/.claude.json` pour le compte Principal). Désactiver change le jeton.

## Activité MCP

Le groupe « Activité MCP » liste ce que le serveur a reçu et répondu, les appels les plus récents en tête. Chaque ligne donne l’heure, qui a appelé (le nom d’un agent, « Claude (hors Escouade) » ou, pour une requête refusée avant de savoir qui l’envoie, « Client inconnu »), l’outil, le résultat (« Fait », « Refusé » ou « Erreur »), puis ce qui a été demandé et, pour un refus ou une erreur, pourquoi. Les 200 derniers appels sont gardés en mémoire, pas enregistrés. Le bouton « Effacer » vide la liste ; sans appel, elle dit « Aucun appel pour l’instant. ».
