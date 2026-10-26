# Les harness

Un harness est le programme qui fait tourner un agent : Claude Code, Codex, OpenCode, GitHub Copilot CLI ou Cursor CLI. Cette page les compare, puis dit pour chacun son installation, son compte, ses modèles, ses modes et ce qui le protège, son coût et son quota, sa vue terminal et ce qu’il ne fait pas.

> [!NOTE]
> Codex, OpenCode et Copilot CLI sont là depuis Escouade 1.8, Cursor CLI depuis la 2.0.1 ; Claude Code depuis le début.

## Choisir un harness

Escouade lance le harness de ta machine, avec ton propre compte : installe-en au moins un et connecte-le une fois, comme pour t’en servir dans un terminal. Réglages › Harness liste chacun avec son exécutable, sa version et son état (voir [les réglages des harness](settings-claude-code)).

Puis ajoute-lui un compte dans Réglages › Comptes : aucun harness n’en a au départ, et rien ne démarre sur un harness sans compte. « Ajouter un compte… » propose le compte déjà connecté sur la machine, ou un nouveau (voir [plusieurs comptes](accounts#aucun-compte-au-depart)). Le modèle, l’effort et le mode des nouveaux agents se règlent dans la fiche de chaque compte, avec ceux de son harness.

Dès que deux harness sont installés :

- chaque projet a son « Harness par défaut » (Réglages › Projets), Claude Code sans réglage ;
- la flèche de « Nouvel agent », ou `Ctrl+Maj+N`, ouvre le menu « Harness », qui les numérote (voir [l’interface](interface#la-liste-des-agents)) ;
- la fenêtre d’un ticket a son champ « Harness », celui du projet par défaut, que le pilote auto suit ;
- la carte de chaque agent porte la marque de son harness, dès que des agents tournent sur deux harness.

Un agent garde son harness. Quand plus aucun compte du sien ne peut le prendre, il peut [continuer sur un autre harness](accounts#continuer-sur-un-autre-harness), avec sa conversation, son worktree et sa branche.

Quel que soit le harness, l’agent a la même conversation : la réponse et le raisonnement en direct, ses outils sous les mêmes noms (`Bash`, `Edit` avec son diff, `Read`, `Task`…), les mêmes cartes de permission, de question et de plan à approuver, le bandeau « Plan » avec ses tâches et ses sous-agents, la reprise au redémarrage et « Dupliquer la conversation ». Ce qu’un harness ne sait pas faire n’apparaît pas pour ses agents.

## Comparaison

| | Claude Code | Codex | OpenCode | Copilot CLI | Cursor CLI |
|---|---|---|---|---|---|
| Installation | script de Claude Code | `npm install -g @openai/codex` | `npm install -g opencode-ai` | `npm install -g @github/copilot` | script de Cursor |
| Testé avec | 2.1.283 à 2.1.301 | 0.163.0 | 1.19.3 | 1.0.98 | 2026.10.22 |
| Compte | abonnement Claude ou clé API | compte ChatGPT | les fournisseurs connectés à OpenCode, modèles locaux compris | compte GitHub avec Copilot, Free compris | compte Cursor (`agent login`, ou une clé d’API), Free compris |
| Plusieurs comptes | oui | oui | non | oui | oui, par clé d’API |
| Modèles | ceux que Claude Code liste pour chaque compte | ceux que Codex liste pour ton compte | ceux de tes fournisseurs, avec recherche et favoris | ceux que Copilot liste, avec leur multiplicateur | ceux de ton compte, Auto en tête |
| Modes | les cinq | les cinq | quatre (pas d’Auto) | les cinq | quatre (pas d’Auto) |
| Ce qui protège | ses permissions | son bac à sable | ses règles de permission | les règles d’Escouade | ses permissions, pour ses commandes |
| Message pendant un tour | attend la fin du tour | entre dans le tour | attend la fin du tour | entre dans le tour | attend la fin du tour |
| Coût | exact | estimé | exact (0 en local) | exact, en crédits d’IA | non donné |
| Quota | fenêtres 5 h et 7 jours | fenêtres 5 h et 7 jours (30 jours en offre gratuite) | aucun : budget par jour | crédits du mois | lien vers son tableau de bord |
| Vue terminal | « Vue Claude Code » | « Vue Codex » | « Vue OpenCode » | « Vue Copilot CLI » | « Vue Cursor CLI », suivi limité |
| PDF joints | oui | non | non | non | non |
| Remote control, tâches de fond | oui | non | non | non | non |

## Claude Code

### Installation et compte

Installe Claude Code avec son script (`irm https://claude.ai/install.ps1 | iex` sous Windows, `curl -fsSL https://claude.ai/install.sh | bash` sous macOS et Linux), puis connecte-le avec ton abonnement Claude ou une clé API. Escouade le trouve dans le `PATH` ou aux endroits habituels, même dans WSL (voir [l’installation](installation)). Ses comptes ont chacun leur dossier (`CLAUDE_CONFIG_DIR`) : voir [plusieurs comptes](accounts).

### Modèles et modes

Les modèles sont ceux que le Claude Code de chaque compte liste dans son `/model`, avec leur nom, leurs efforts et le mode « Auto » de chacun : un modèle qu’un compte a en plus (Mythos, par exemple) apparaît dans le Composer de ses agents, un modèle qu’il n’a pas n’y est pas. Escouade les lit au démarrage et à l’ajout d’un compte, sans rien consommer, puis à chaque démarrage d’agent. Le Kanban et les tickets proposent ceux des comptes actifs. Un agent qui passe sur un compte qui n’a pas son modèle prend le modèle par défaut, et sa conversation le dit. Avant la première lecture, la liste est Fable, Opus, Sonnet et Haiku. Les cinq modes ont leur sens d’origine : « Auto » (un classifieur accepte les actions sûres), « Demander », « Plan », « Édits auto » et « Bypass » (voir [les modes de permission](managing-agents#modes-de-permission)). Ce sont les permissions de Claude Code qui protègent.

### Coût, quota et vue

Le coût d’un tour est celui que donne Claude Code. Le quota, ce sont la fenêtre de 5 heures et la fenêtre hebdomadaire de ton compte, dans la barre d’état. La [vue Claude Code](claude-code-view) fait tourner l’agent dans l’interface de Claude Code elle-même. Il est seul à avoir le [remote control](remote-control), les tâches de fond et la lecture des PDF.

## Codex

### Installation et compte

`npm install -g @openai/codex`, puis `codex login` avec ton compte ChatGPT. Escouade lance le binaire natif du paquet npm (sous Windows, le `codex.exe` du paquet, pas son lanceur) : l’app de bureau de Codex installe souvent une version plus ancienne, que le `PATH` peut trouver d’abord. Chaque agent a son `codex app-server`. Ses comptes ont chacun leur `CODEX_HOME` : voir [les comptes Codex](accounts#comptes-codex).

### Modèles et modes

Les modèles et leurs efforts sont ceux que Codex liste pour chaque compte : Escouade les lit au démarrage et à l’ajout d’un compte, sans lancer d’agent ni rien consommer, les garde d’un démarrage à l’autre et les relit quand le menu « Modèle » s’ouvre sur une liste de plus d’un jour. Avant la première lecture, le menu ne propose que GPT-6-Luna, marqué « liste en cours de lecture ». Le modèle que choisit la `config.toml` du compte (`model = …`) y est aussi, marqué « de config.toml », même quand Codex ne le liste pas. Les modes passent par le bac à sable de Codex :

| Mode | Chez Codex |
|---|---|
| Plan | Le mode Plan de Codex : il étudie, peut te poser des questions, puis propose son plan, sans rien modifier (bac à sable en lecture seule). |
| Demander | Bac à sable : écriture dans le dossier de l’agent, réseau coupé. Une commande qui en sort demande, `git add` et `git commit` compris (Codex protège tout le dossier `.git`). |
| Édits auto | Pareil, et Escouade accepte d’office `git add` et `git commit` dans le worktree de l’agent, quand la commande n’est que cela et que ses hooks sont ceux du dépôt ; le réseau et le reste demandent. |
| Auto | Le relecteur automatique de Codex décide des demandes à ta place, et la conversation dit ce qu’il a approuvé. |
| Bypass | Codex ne demande rien et sort de son bac à sable. |

Une demande de Codex a trois boutons : « Autoriser », « Pour cette session » et « Refuser ». Un message envoyé pendant qu’il travaille entre dans son tour au lieu d’attendre.

### Coût, quota et vue

Codex ne donne pas le coût : Escouade l’estime d’après les tokens du tour et le tarif public d’OpenAI, et l’écrit « ≈ … estimé ». Le quota, ce sont les fenêtres de ton compte (5 heures et 7 jours, ou une seule de 30 jours avec l’offre gratuite). La « Vue Codex » fait tourner l’agent dans l’interface de Codex (voir [la vue terminal](claude-code-view#avec-codex)).

### Ce que Codex ne fait pas

Il ne lit pas les PDF (le bouton les refuse en le disant) et ne propose dans Escouade que la commande `/compact`, qui compacte le contexte de sa conversation. Un agent Codex ne reprend pas sur un autre compte : il attend la remise à zéro, ou continue sur un autre harness. Pas de remote control ni de tâches de fond.

## OpenCode

### Installation et compte

`npm install -g opencode-ai` installe OpenCode 1, le seul que pilote Escouade : OpenCode 2 (`@opencode/cli`) est reconnu et dit « Non pris en charge ». Connecte un fournisseur avec `opencode auth login` (« Se connecter… » dans Réglages › Harness le lance) ; les modèles locaux d’Ollama marchent aussi. OpenCode a un seul compte dans Escouade, sa config habituelle. Un seul `opencode serve` sert tous les agents OpenCode, protégé par un mot de passe tiré au hasard qui ne quitte pas Escouade ; chaque agent y est une session.

### Modèles et modes

Ses modèles, comme ceux de Codex, Copilot CLI et Cursor CLI, sont lus au démarrage et à l’ajout d’un compte, sans lancer d’agent, gardés d’un démarrage à l’autre et relus quand le menu s’ouvre sur une liste de plus d’un jour. Le menu « Modèle » liste les modèles des fournisseurs connectés, avec une recherche, leur fournisseur et des favoris (★) en tête, aussi réglables dans Réglages › Harness › OpenCode › « Modèles ». L’effort est la variante du modèle quand il en a. Escouade donne toujours le modèle, pour qu’OpenCode n’en choisisse pas un de lui-même.

OpenCode n’a pas de bac à sable : ce sont ses règles de permission qui suivent le mode, et une commande acceptée peut tout faire.

| Mode | Chez OpenCode |
|---|---|
| Demander | Les fichiers du dossier de l’agent changent sans demander ; les commandes (`git add` et `git commit` compris), le web et les chemins hors du dossier demandent. |
| Édits auto | Pareil, et `git add` et `git commit` passent sans demander. |
| Plan | L’agent `plan` d’OpenCode étudie sans rien modifier, puis te propose son plan à approuver. |
| Bypass | OpenCode ne demande rien. |

Une demande d’OpenCode a « Autoriser », « Toujours autoriser » (la carte dit le motif qu’OpenCode gardera pour la session, comme `git add *`) et « Refuser ». Un message envoyé pendant un tour attend sa fin.

### Coût, budget et vue

Le coût d’un tour est celui qu’OpenCode donne, au prix du fournisseur : 0 avec un modèle local. OpenCode n’a pas de quota : la barre d’état montre le coût du jour de son compte, et « Budget par jour ($) », dans Réglages › Comptes, met le pilote auto en pause jusqu’à minuit une fois atteint (voir [le compte OpenCode](accounts#compte-opencode)). La « Vue OpenCode » branche l’interface d’OpenCode sur la session de l’agent sans arrêter le suivi d’Escouade (voir [la vue terminal](claude-code-view#avec-opencode)).

### Ce qu’OpenCode ne fait pas

Pas de mode « Auto » (OpenCode n’a pas de relecteur), pas de bac à sable, un seul compte, pas de PDF joints, pas d’autre commande `/` que `/compact` dans Escouade, pas de remote control ni de tâches de fond.

## Copilot CLI

### Installation et compte

`npm install -g @github/copilot`, puis `copilot login` avec un compte GitHub qui a Copilot (Free compris). Chaque agent a son `copilot --server --stdio`, sans le serveur MCP GitHub que Copilot branche de lui-même, sans accès au dossier temporaire du système et sans les jetons GitHub dans l’environnement de ses commandes. Ses comptes ont chacun leur `COPILOT_HOME` : voir [les comptes Copilot CLI](accounts#comptes-copilot-cli).

### Modèles et modes

Le menu des modèles écrit le multiplicateur de chacun (`×3`), ou son coût relatif sur un compte Free ; `auto` n’est jamais proposé. Le modèle et le mode changent tout de suite, même pendant un tour.

Copilot n’a pas de bac à sable quand Escouade le pilote : ce sont les règles d’Escouade qui répondent sans carte aux demandes sûres.

| Mode | Chez Copilot CLI |
|---|---|
| Demander | Les lectures et écritures du dossier de l’agent passent ; les commandes (`git add` et `git commit` compris), le web, les outils MCP et les chemins hors du dossier demandent. |
| Édits auto | Pareil, et `git add` et `git commit` de son worktree passent. |
| Plan | Copilot étudie et propose un plan sans rien modifier ; ses lectures du dossier passent. |
| Auto | Copilot enchaîne seul jusqu’au bout de sa tâche (autopilot), avec les règles d’« Édits auto ». |
| Bypass | Copilot ne demande rien. |

Une demande de Copilot a « Autoriser », « Pour cette session » et « Refuser » ; pas de « Toujours », qui écrirait une règle durable dans la config de Copilot. Un formulaire d’un serveur MCP devient une carte à champs. Un message envoyé pendant un tour y entre aussitôt.

### Coût, crédits et vue

Le coût d’un tour vient des crédits d’IA de ses appels (un crédit vaut 0,01 $). La barre « crédits » dit ce qui est utilisé ce mois-ci, jusqu’à leur retour le 1ᵉʳ du mois ; le plafond de crédits d’une session atteint devient une carte. La « Vue Copilot CLI » fait tourner l’agent dans l’interface de Copilot (voir [la vue terminal](claude-code-view#avec-copilot-cli)).

### Ce que Copilot CLI ne fait pas

Pas de « Toujours autoriser », pas de mode `assisted` (expérimental), pas de PDF joints, pas d’autre commande `/` que `/compact` dans Escouade (suivie, si tu veux, de ce qu’il faut garder), pas de remote control ni de tâches de fond. Un agent Copilot ne reprend pas sur un autre compte.

## Cursor CLI

### Installation et compte

Installe Cursor CLI avec son script (`irm 'https://cursor.com/install?win32=true' | iex` sous Windows, `curl https://cursor.com/install -fsS | bash` sous macOS et Linux), puis connecte-le avec `agent login`. Escouade le trouve dans `%LOCALAPPDATA%\cursor-agent` sous Windows, même absent du `PATH`, et lance sa dernière version installée. Chaque agent a son `agent acp` et son propre dossier de configuration, retiré avec lui : ses règles, son modèle et ses sessions y sont gardés, jamais dans ta config de Cursor. La connexion de la machine (`agent login`) est « le compte de la machine ». Un autre compte Cursor s’ajoute par sa clé d’API (cursor.com, Settings › API Keys) dans Réglages › Comptes : elle est gardée dans le trousseau du système et donnée à ses agents par `CURSOR_API_KEY`, jamais dans un fichier ni sur une ligne de commande ; « Changer la clé… » la redonne.

### Modèles et modes

Le menu « Modèle » liste les modèles de ton compte, Auto en tête, avec leurs efforts. Une offre Free ne fait tourner qu’Auto : un autre modèle finit le tour en erreur, en le disant. Le modèle et le mode changent tout de suite.

Cursor n’a pas de bac à sable sous Windows. Il lit et modifie les fichiers sans demander, même hors du dossier de l’agent, et sans passer par Escouade, qui ne peut donc pas l’en empêcher ; ses commandes, le web et les outils MCP demandent. Pour un projet privé, Escouade refuse d’office ses commandes qui nomment les chemins des autres projets, mais pas ses lectures ni ses écritures.

| Mode | Chez Cursor CLI |
|---|---|
| Demander | Le mode Agent de Cursor : ses commandes, le web et les outils MCP demandent ; une écriture qu’il soumet passe dans le dossier de l’agent, et demande ailleurs, avec son diff. |
| Édits auto | Pareil, et `git add` et `git commit` du dossier de l’agent passent. |
| Plan | Le mode Plan de Cursor : il étudie et propose son plan à approuver, sans rien modifier. |
| Bypass | Escouade accepte tout ce que Cursor demande. |

Une demande de Cursor a « Autoriser », « Pour cet agent » et « Refuser » : « Pour cet agent » garde la règle (`Shell(git status)`, par exemple) dans le dossier de l’agent, pour lui seul et ses reprises. Ses questions, son plan, ses tâches et ses sous-agents passent dans la conversation et le bandeau « Plan ». Un message envoyé pendant un tour attend sa fin : Cursor arrêterait le tour en cours pour lui.

Les skills, commandes, agents et hooks de Claude Code de ton compte et du projet tournent aussi sous Cursor, comme pour les agents Claude Code ; Escouade les laisse comme tu les as réglés. Un hook qui refuse une écriture la bloque : l’outil finit en échec dans la conversation, « Cursor n’a rien écrit », Cursor n’en donnant pas la raison.

### Coût, quota et ce que Cursor ne fait pas

Cursor ne dit ni les tokens ni le coût d’un tour quand Escouade le pilote : la conversation n’en montre pas, et les statistiques comptent ses tours et leur durée. Il ne dit pas non plus son usage du mois : pas de barre dans la barre d’état, mais « Usage sur cursor.com » dans Réglages › Comptes et dans le panneau des quotas, qui ouvre son tableau de bord. Une limite atteinte (« Upgrade your plan to continue ») arrête le tour sur une carte ambre qui le dit, avec, s’il y en a, le compte ou le harness où continuer. Pas de « Dupliquer la conversation » (Cursor ne copie pas une session), pas de PDF joints, pas de commandes `/` dans Escouade (pour compacter son contexte, tape `/summarize` dans sa vue terminal), ni remote control ni tâches de fond. Il reçoit le serveur MCP d’Escouade par sa session ; l’interrupteur ne le déclare pas encore dans la config de Cursor. La « Vue Cursor CLI » fait tourner l’agent dans l’interface de Cursor, avec un suivi limité (voir [la vue terminal](claude-code-view#avec-cursor-cli)).

## Le serveur MCP

Quel que soit leur harness, les agents d’Escouade reçoivent son serveur MCP, chacun avec son propre jeton, quand « Les agents peuvent piloter Escouade » est allumé. Le même interrupteur le déclare dans chaque harness installé, pour que Claude Code, Codex, OpenCode ou Copilot CLI lancés hors d’Escouade, dans un terminal ou leur app, pilotent Escouade : voir [le serveur MCP](mcp).

## Textes rédigés

Le nom d’un nouvel agent, les messages de commit et les descriptions de pull request proposés sont écrits par le harness de Réglages › Application › « Modèle des textes rédigés » : « Claude Haiku », « Codex (GPT-6-Luna) », un modèle d’OpenCode , « Copilot (GPT-5 mini) » ou « Cursor (Auto) », parmi les harness installés (voir [les textes rédigés](settings-application#textes-rediges)).
