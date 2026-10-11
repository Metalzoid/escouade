# Escouade 1.8 — à faire

Deux chantiers. Le gros : Codex et OpenCode comme moteurs d'agents, à côté de Claude Code. Le petit : une seule forme d'infobulle dans toute l'app.

- L'avancée d'un agent qui exécute un plan (tâches, sous-agents, ce qui est en cours, essai avec superpowers), d'abord notée ici, est passée dans la 1.7 : voir `docs/TODO-1.7.md`, chantier 5.

## Ampleur (estimation du 2026-10-11)

Repère : la 1.7 (cinq chantiers) a fait 266 commits et environ 78 000 lignes ajoutées, tests compris.

| Lot | Part de la 1.7 | Ce qui pèse |
|---|---|---|
| Essais réels (point 0) | ~5 % | Il faut l'utilisateur pour les connexions (compte ChatGPT, clé d'un fournisseur pour OpenCode). |
| Extraction d'une interface « moteur », avec Claude seul | ~10 % | Refacto de `claude.rs`, `agent.rs` et `core.rs` (lancement, reprise, copie, one-shots), sans changement de comportement. |
| Codex | ~30 % | Client JSON-RPC, traduction du flux, permissions, modes, comptes `CODEX_HOME`, quota, faux `codex`. |
| OpenCode | ~25 % | Serveur HTTP + SSE par agent, traduction, règles de permission, faux `opencode`. Il reste bâti sur l'interface et l'expérience de Codex. |
| Reste commun | ~10 % | Choix du moteur dans l'interface, textes à paramétrer (~100 « Claude » par langue), stats par moteur, one-shots, serveur MCP, docs, site. |
| Infobulles | ~5 % | Mécanique, et 172 attributs `title=` dans 53 composants à remplacer. |

Total : environ 80 % de la 1.7, avec plus d'incertitude qu'elle sur les deux protocoles externes, qui bougent vite. Le protocole de Codex est marqué « expérimental » et OpenCode est à cheval entre une v1 et une v2. En quota, avec le mode économe (Sonnet pour implémenter et relire), compter de la moitié aux trois quarts d'une semaine d'abonnement Max. C'est une extrapolation de la 1.7, à revoir après les essais.

Si la 1.8 doit être plus courte, garder Codex et repousser OpenCode en 1.9. Codex ressemble davantage au modèle d'Escouade (abonnement avec quota, bac à sable du système, un exécutable natif sous Windows), et l'API d'OpenCode se stabilise en v2.

## 0. À vérifier avant de concevoir (essais jetables, avec les vrais CLI)

Rien de ce qui suit n'a été lancé : les faits viennent du code source et des docs des deux projets, lus le 2026-10-11 (Codex 0.162.1, OpenCode 1.19.0 et 2.0.26). Chaque essai enregistre ses flux réels dans `tests/fixtures/` (comme `real-run-inline.jsonl`), pour les rejouer dans les tests.

### Codex (`codex app-server`, JSON-RPC sur stdio)
- [ ] **Un tour complet enregistré** : texte, raisonnement, commande, modification de fichier, demande d'approbation, interruption, `update_plan`, un sous-agent (`collabToolCall`), une compaction, la fin d'un tour arrêté par la limite.
- [ ] **Méthodes expérimentales** : environ 40 % des méthodes demandent `capabilities.experimentalApi`. Lister celles dont Escouade a besoin (`thread/fork` ? `item/tool/requestUserInput` ? mode Plan ? `approvalsReviewer` ?), et n'en garder que le strict nécessaire.
- [ ] **Bac à sable, worktree et commit** : en `workspace-write`, dans `<projet>/.claude/worktrees/<agent>`, l'agent peut-il commiter ? Un commit écrit dans `<projet>/.git`, hors du worktree, et Codex protégerait `.git` en lecture seule dans ses dossiers inscriptibles (à vérifier). Faut-il `sandbox_workspace_write.writable_roots` ? Mêmes questions avec le bac à sable Windows (`elevated` / `unelevated` : faut-il une installation avec les droits d'admin ?).
- [ ] **MCP par process** : `-c mcp_servers.escouade.url=…` avec `bearer_token_env_var` (le jeton dans l'environnement, jamais sur la ligne de commande, que la liste des process montre). `-c mcp_servers.escouade.enabled=false` doit écraser une entrée `escouade` de l'utilisateur. Autre piste : la `config` de `thread/start`.
- [ ] **Consignes ajoutées** (protocole du ticket, aujourd'hui `--append-system-prompt`) : `developerInstructions` de `thread/start` ou `-c developer_instructions=…`. Survivent-elles à une reprise ?
- [ ] **Second compte** : un `CODEX_HOME` à part, connexion (`codex login`, ChatGPT ou code d'appareil), entrée du trousseau propre à chaque dossier. Lire le quota par `account/rateLimits/read` sans lancer de tour, et voir ce qu'un app-server lancé pour ça seulement coûte.
- [ ] **Reprise sur un autre compte** : un `rollout-*.jsonl` copié dans un autre `CODEX_HOME` se reprend-il par `thread/resume` ?
- [ ] **Windows** : lancer le binaire natif, pas le `codex.cmd` de npm (comme `resolve_binary` le fait pour `claude`). Le process et ses enfants restent dans le Job de l'agent.

### OpenCode (`opencode serve`, HTTP + SSE)
- [ ] **Quelle ligne** : la v1.19 (`opencode-ai`, l'API documentée) ou la v2 (`@opencode/cli`, API refaite sous `/api/*`, « Experimental HttpApi surface »). Les deux prennent la commande `opencode` et ne coexistent pas. Regarder ce que donne aujourd'hui l'installation officielle, puis décider. Escouade supporte une ligne en 1.8 et reconnaît l'autre pour dire qu'elle n'est pas prise en charge.
- [ ] **Un serveur par agent ou par projet** : un serveur par agent garde le CPU et la RAM par agent, l'arbre de process tué d'un coup et l'environnement propre au compte. Mesurer la mémoire d'un serveur inactif et son temps de démarrage. Vérifier le port libre (`--port 0` ?) et le mot de passe (`OPENCODE_SERVER_PASSWORD`).
- [ ] **Un tour complet enregistré** : deltas, outils, `patch`, permission, question, `todo.updated`, sous-agent (outil `task`, session enfant), `abort`, erreur.
- [ ] **Message pendant un tour** (v1) : mis en file, refusé, ou il interrompt ?
- [ ] **Config par process** : `OPENCODE_CONFIG_CONTENT` se fusionne-t-il avec la config de l'utilisateur ? `{env:ESCOUADE_MCP_TOKEN}` marche-t-il dans un en-tête ? `enabled:false` écrase-t-il une entrée de l'utilisateur ?
- [ ] **Consignes ajoutées** : le champ `system` d'un prompt, ou un agent déclaré dans la config du process.
- [ ] **Windows natif** : dossier des données, shell de l'outil `bash` (Git Bash ?), marche sans WSL (la doc recommande WSL).
- [ ] **Pas de bac à sable** du système (rien trouvé dans la doc) : à confirmer dans le code. Sans lui, seules les règles de permission protègent.
- [ ] **Modèles** : liste des seuls fournisseurs connectés, fenêtre de contexte de chaque modèle, `variant` (effort) quand le modèle en a.

## 1. Codex et OpenCode, à côté de Claude Code

But : un agent tourne sur Claude Code, Codex ou OpenCode. Le reste d'Escouade ne change pas pour autant : conversation, Kanban et pilote auto, worktrees, git, lancements de test, stats, serveur MCP.

### Ce qu'on sait (2026-10-11, sans essai réel)

| | Claude Code (aujourd'hui) | Codex 0.162 `app-server` | OpenCode 1.19 `serve` |
|---|---|---|---|
| Transport | JSONL sur stdio | JSON-RPC (JSONL) sur stdio, « expérimental » | HTTP + SSE, OpenAPI 3.1 |
| Deltas | `stream_event` | `item/agentMessage/delta`, `item/reasoning/*Delta`, `outputDelta` | `message.part.delta` |
| Permissions | `can_use_tool` | `item/commandExecution\|fileChange\|permissions/requestApproval` | `permission.asked` → `once` / `always` / `reject` |
| Question à l'utilisateur | `AskUserQuestion` | `item/tool/requestUserInput` (mode Plan seulement, sauf drapeau) | `question.asked` |
| Modes | 5 modes | politique d'approbation × bac à sable, `auto_review`, mode Plan | agents `plan` / `build`, règles par outil |
| Bac à sable du système | non | oui (3 niveaux, Windows compris) | non trouvé |
| Interruption / message en cours de tour | `interrupt` / file | `turn/interrupt` / `turn/steer` | `abort` / file en v2 seulement |
| Modèle, effort à chaud | `set_model` | au `turn/start` suivant | par prompt (`model`, `variant`) |
| Reprise / copie | `--resume` / `--fork-session` à une entrée | `thread/resume` / `thread/fork` à un tour | session / `fork` à un message |
| Coût | `total_cost_usd` | aucun | `cost` par message |
| Quota d'abonnement | `rate_limit_event`, `get_usage` | `account/rateLimits/*` (deux fenêtres en %, durée en minutes) | aucun |
| Comptes | `CLAUDE_CONFIG_DIR` | `CODEX_HOME` | une config (XDG, `OPENCODE_CONFIG_DIR`, non vérifié) |
| Tâches / sous-agents | outils de tâches, `Task` | `turn/plan/updated` / `collabToolCall` | `todo.updated` / outil `task`, sessions enfants |
| Transcripts | `~/.claude/projects/…/*.jsonl` | `$CODEX_HOME/sessions/…/rollout-*.jsonl` (format interne) | SQLite, schéma non public |

Escouade tient déjà son propre journal normalisé de chaque conversation (`conv.rs`). La recherche, la relecture, les cartes et les stats lisent ce journal, pas les transcripts des CLI, donc les transcripts de Codex et d'OpenCode n'ont pas à être lus.

### Un moteur par agent
- [ ] `AgentMeta.engine` vaut `claude`, `codex` ou `opencode`. Par défaut, `claude` (les agents d'avant la 1.8). Un agent garde son moteur toute sa vie : une conversation ne change pas de moteur, et sa copie garde le même.
- [ ] Ce qui est propre à Claude passe derrière une interface « moteur ». C'est aujourd'hui le process stdio et ses requêtes de contrôle (`claude.rs`), et la traduction des frames en éléments de conversation (`AgentRt::handle_frame`). L'interface couvre : lancer, reprendre, copier, envoyer un message avec ses pièces jointes, interrompre, changer de modèle, d'effort ou de mode, répondre à une permission ou une question, lire l'usage, arrêter.
- [ ] Chaque moteur traduit son flux dans les mêmes éléments de conversation (`user`, `text`, `thinking`, `tool`, `question`, `permission`, `turn`, `notice`, `event`) et les mêmes changements du bandeau « Plan ».
- [ ] **D'abord une extraction pure**, avec Claude seul et sans aucun changement de comportement : les tests existants (`core_tests`, `agent.rs`, e2e) passent tels quels.
- [ ] **Outils** : le backend donne aux outils des autres moteurs le nom que leur donne Claude Code. `tools.ts`, la ligne d'activité, `convsearch.rs` et les cartes ne changent donc pas. Un outil inconnu s'affiche sous son propre nom.

  | Moteur | Outil d'origine | Nom pris dans Escouade |
  |---|---|---|
  | Codex | `commandExecution` | `Bash` |
  | Codex | `fileChange` | `Edit` ou `Write`, avec ses +N −M et le fichier touché |
  | Codex | `mcpToolCall` | `mcp__<serveur>__<outil>` |
  | Codex | `webSearch` | `WebSearch` |
  | OpenCode | `bash`, `edit`, `write`, `read`, `grep`, `glob`, `list`, `patch`, `webfetch`, `todowrite`, `task` | leur équivalent chez Claude Code |
- [ ] **Process** :
  - Codex : un `codex app-server` par agent.
  - OpenCode : un `opencode serve` par agent, sur `127.0.0.1`, avec un port libre et un mot de passe tiré au hasard, sauf si l'essai du point 0 le montre trop coûteux. Le backend lit son flux SSE `/event`.
  - Dans les deux cas, le process est dans le Job de l'agent, ce qui garde le CPU et la RAM par agent et tue tout l'arbre d'un coup.
  - L'arrêt pour inactivité et la reprise restent ceux d'aujourd'hui (`thread/resume`, ou session rouverte par son id).
- [ ] **Versions** :
  - Chaque moteur a une plage de versions testées. Une version plus ancienne est refusée avec sa raison. Une plus récente est acceptée avec un avertissement (« Codex 0.170 n'a pas été testé avec Escouade »).
  - La lecture tolère l'inconnu : champs ignorés, et une notification ou un élément inconnu est écarté sans casser le tour.
  - Le schéma de la version testée de Codex (`codex app-server generate-json-schema`) est gardé dans le dépôt. Un test vérifie que les champs lus par Escouade y sont.

### Choisir le moteur
- [ ] **Réglages › « Moteurs »** (aujourd'hui l'onglet « Claude ») : pour chaque moteur, l'exécutable (comme `claude_path`), la version trouvée, son état (absent, non connecté, prêt, version non testée) et « Se connecter… » (un terminal intégré avec la commande de connexion). Un moteur absent n'apparaît nulle part ailleurs.
- [ ] **Premier lancement** : Escouade marche dès qu'un moteur est installé. « Claude Code introuvable » devient « Aucun moteur trouvé », avec la commande d'installation de chacun.
- [ ] **Projet** : « Moteur par défaut ». Par défaut, Claude Code, ou le seul moteur installé.
- [ ] **Nouvel agent** : un menu « Moteur », réglé d'abord sur celui du projet.
- [ ] **Ticket** : un champ « Moteur » (par défaut, celui du projet), que le pilote auto suit.
- [ ] **Marque du moteur** sur la carte de l'agent, dans la barre latérale, la vue d'ensemble et l'onglet, dès que plus d'un moteur sert.

### Composer : modèles, effort, modes
- [ ] **Modèles** : le menu liste ceux du moteur de l'agent.
  - Claude : les alias, comme aujourd'hui.
  - Codex : `model/list`, avec `supportedReasoningEfforts` et `inputModalities`.
  - OpenCode : les modèles des seuls fournisseurs connectés, avec une recherche et des favoris dans les réglages, car la liste peut être longue.
- [ ] **Effort** : celui du modèle choisi (efforts de raisonnement de Codex, `variant` d'OpenCode). Le menu est masqué si le modèle n'en a pas.
- [ ] **Modes** : Escouade garde ses cinq modes. Chaque moteur dit lesquels il prend et comment. Le titre du mode dans le menu explique ce qu'il veut dire pour ce moteur, bac à sable compris. À confirmer par les essais :

  | Escouade | Codex | OpenCode |
  |---|---|---|
  | Plan | mode Plan, bac à sable `read-only` | agent `plan` |
  | Demander | `on-request`, `workspace-write` | agent `build`, `edit` et `bash` en `ask` |
  | Accepter les modifications | `workspace-write` : les écritures du bac à sable passent, une commande qui en sort demande | `edit` en `allow`, `bash` en `ask` |
  | Auto | `on-request` + `approvalsReviewer: auto_review` | absent (masqué) |
  | Sans permissions | `never`, `danger-full-access` | tout en `allow` |
- [ ] **Changement à chaud** : avec Codex, il vaut à partir du tour suivant (`turn/start`) ; avec OpenCode, à chaque prompt. Le menu le dit quand un tour est en cours.
- [ ] **Commandes `/`** :
  - Claude : comme aujourd'hui.
  - Codex : ses skills (`skills/list`), envoyés comme élément `skill`.
  - OpenCode : `/command` et `/skill`.
- [ ] **Suggestions `@`** : l'index de fichiers d'Escouade (celui de « Ouvrir un fichier ») pour Codex et OpenCode.
- [ ] **Pièces jointes** :
  - Images : quand les modalités du modèle les acceptent.
  - PDF : Codex ne les lit pas. Le bouton le dit et les refuse. Avec OpenCode, ça dépend du modèle.
  - Documents texte : collés comme texte.
- [ ] **Message pendant un tour** : avec Codex, « maintenant » passe par `turn/steer`. Sinon, Escouade met le message en file jusqu'à la fin du tour, et c'est le cas pour OpenCode v1 si l'essai le demande.

### Permissions et questions
- [ ] **Codex** :
  - Une commande donne une carte « Codex veut lancer : <commande> », avec son dossier et sa raison.
  - Une modification de fichier donne une carte avec son diff.
  - `item/permissions/requestApproval` donne une carte qui dit ce qui est demandé.
  - Boutons : « Autoriser » (`accept`), « Pour cette session » (`acceptForSession`), « Refuser » (`decline`).
- [ ] **OpenCode** : `permission.asked` donne une carte. Boutons : « Autoriser » (`once`), « Toujours » (`always`, qui écrit le motif retenu, `patterns`), « Refuser » (`reject`, avec le message saisi).
- [ ] **Questions** : `item/tool/requestUserInput` (options, « Autre », champ secret masqué) et `question.asked` deviennent la carte de question existante. Chez Codex, elles n'arrivent qu'en mode Plan : le dire dans la doc.
- [ ] Les notifications, la liste « À répondre » de la vue d'ensemble et le pilote auto ne changent pas : ils lisent les demandes normalisées.

### Plan, tâches, sous-agents (bandeau « Plan » de la 1.7)
- [ ] **Codex** : `turn/plan/updated` (les étapes d'`update_plan` et leur statut) donne les tâches, `collabToolCall` les sous-agents.
- [ ] **OpenCode** : `todo.updated` (`pending`, `in_progress`, `completed`, `cancelled`) donne les tâches. L'outil `task` et les sessions enfants donnent les sous-agents, avec leurs tokens et leurs outils.
- [ ] Les fichiers de plan (superpowers) se lisent sur le disque comme aujourd'hui, quel que soit le moteur. Faire un essai réel avec superpowers sous Codex.

### Comptes et quotas
- [ ] « Comptes Claude » devient « Comptes », groupés par moteur.
- [ ] **Comptes Codex** : un compte est un `CODEX_HOME`.
  - Principal est `~/.codex`, lancé sans toucher à la variable, comme pour Claude.
  - Les autres sont dans `~/.escouade/codex/<nom>`. « Ajouter un compte » ouvre un terminal intégré avec `codex login`.
  - Ce qui se partage (`config.toml`, `AGENTS.md`, skills) est proposé par lien ou par copie. `auth.json` n'est jamais copié.
- [ ] **Quota de Codex** :
  - Source : `account/rateLimits/updated` sur un agent vivant. Sinon, `account/rateLimits/read` toutes les 5 min, par un app-server du compte lancé pour ça (voir point 0).
  - Les fenêtres prennent un libellé selon leur durée (`windowDurationMins` 300 → « 5h », 10080 → « 7j » / « W »), avec `usedPercent` et `resetsAt`.
  - Un tour arrêté par la limite (`rateLimitReachedType`) attend la remise à zéro, puis reprend seul, comme chez Claude.
- [ ] **Bascule automatique** : entre comptes du même moteur seulement. Les nouveaux agents et tickets partent sur le compte suivant sous le seuil. Reprendre un agent Codex sur un autre compte ne se fait que si l'essai du point 0 l'a permis.
- [ ] **OpenCode** : il n'a pas de quota d'abonnement (il passe par les API des fournisseurs).
  - Un seul compte en 1.8 : sa config par défaut.
  - Pas de barre de quota : la barre d'état montre seulement le coût du jour.
  - Pas de pause au quota pour le pilote auto (voir « Décisions »).
- [ ] **Barre d'état** : le groupe des quotas montre les comptes du moteur de l'agent affiché (sinon, du moteur par défaut du projet). Le panneau des comptes les liste tous, groupés par moteur.

### Coût, tokens, stats
- [ ] **Codex** : les tokens d'un tour sont le `last` de `thread/tokenUsage/updated` (entrée, cache lu, cache écrit, sortie, raisonnement). Codex ne donne aucun coût en dollars : il est estimé avec une grille des modèles OpenAI dans `pricing.rs` et marqué « estimé ». Avec un abonnement ChatGPT, c'est un coût théorique, comme celui de Claude avec Max.
- [ ] **OpenCode** : `cost` et `tokens` de chaque message, additionnés par tour.
- [ ] **Fenêtre de contexte** : `modelContextWindow` chez Codex, la limite du modèle chez OpenCode.
- [ ] **Stats** :
  - Une colonne `engine` dans la table des tours (les tours d'avant valent `claude`).
  - Un filtre « Tous les moteurs / Claude Code / Codex / OpenCode », qui se combine avec celui des comptes.
  - Une vue « Par moteur ».

### Serveur MCP d'Escouade
- [ ] **Agents d'Escouade** (réglage « Les agents peuvent utiliser Escouade ») : même jeton par lancement et même oubli qu'aujourd'hui.
  - Codex : `-c mcp_servers.escouade.url=…` et `bearer_token_env_var`, avec le jeton dans l'environnement du process. Réglage désactivé : `-c mcp_servers.escouade.enabled=false`.
  - OpenCode : `OPENCODE_CONFIG_CONTENT`, avec une entrée `remote` et l'en-tête `Authorization: Bearer {env:ESCOUADE_MCP_TOKEN}`. Réglage désactivé : `enabled:false`.
- [ ] Leurs appels prennent le nom `mcp__escouade__<outil>` dans la conversation, donc la carte de permission et les libellés des outils d'Escouade marchent tels quels.
- [ ] **« <Moteur> peut piloter Escouade »** (déclaration pour l'utilisateur, après tout le reste) :
  - Codex : une entrée dans le `config.toml` de chaque compte, par `codex mcp add` s'il prend une URL et un en-tête, sinon par une édition qui garde les commentaires (`toml_edit`).
  - OpenCode : une entrée dans sa config globale (JSONC, commentaires gardés).
  - Le jeton reste en clair dans ces fichiers : le dire, comme pour Claude.

### Textes rédigés par un modèle (one-shots)
- [ ] Aujourd'hui, ces textes passent par Haiku via `claude -p` : nom d'un agent, message de commit proposé, et les autres questions de `ask_claude`. Un utilisateur sans Claude Code doit aussi les avoir.
- [ ] Réglage « Modèle des textes rédigés », avec trois choix. Mêmes limites qu'aujourd'hui : 90 s, lecture bornée.
  - Claude Haiku : par défaut quand Claude Code est installé.
  - Codex : `codex exec`, petit modèle, bac à sable `read-only`, éphémère.
  - OpenCode : `opencode run`, avec le modèle choisi.

### Ce qui reste propre à Claude Code
- [ ] Ces fonctions sont masquées pour les autres moteurs, pas grisées :
  - Remote Control.
  - L'avertissement « Claude Code refuserait par défaut ».
  - Les tâches de fond et les workflows.
  - `CLAUDE_CODE_ENABLE_TODO_TOOLS`.
- [ ] La copie d'un agent se fait au dernier tour (Codex) ou au dernier message (OpenCode), qui est le même point que celui de Claude.

### Textes
- [ ] Environ 100 « Claude » par catalogue (fr et en).
  - Ceux qui parlent de l'agent prennent le nom du moteur : « {engine} attend ta réponse ».
  - Ceux qui parlent de Claude lui-même restent (comptes Claude, Remote Control).
  - « Langue des textes rédigés par Claude » devient « … par les agents ».
- [ ] Consignes ajoutées et invites du pilote auto :
  - Codex : `developerInstructions`.
  - OpenCode : le `system` du prompt.
  - Leur texte ne nomme plus d'outil propre à Claude Code.

### Tests
- [ ] **Faux moteurs** : `fake-codex.mjs` (app-server JSON-RPC) et `fake-opencode.mjs` (serveur HTTP + SSE), avec leurs `.cmd`. Mêmes scénarios que le faux `claude` : texte, raisonnement, commande avec approbation, modification de fichier, question, interruption, plan, limite, reprise, copie, quota.
- [ ] **Tests unitaires** : chaque traduction (flux réel enregistré → éléments de conversation), la correspondance des modes, l'estimation du coût, le libellé des fenêtres de quota.
- [ ] **e2e** :
  - Un agent sur Codex : message, approbation d'une commande, diff, fin de tour.
  - Le même sur OpenCode.
  - Un ticket lancé sur Codex par le pilote auto.
  - Les stats filtrées par moteur.
- [ ] **Avant la release, un essai réel par moteur** : un vrai compte, un ticket en worktree jusqu'au commit et au merge, un plan avec sous-agents.

### Docs
- [ ] PROTOCOL.md : sections « Codex app-server » et « OpenCode serve » (versions testées, méthodes et événements utilisés, correspondance des modes et des outils).
- [ ] SPEC : section « Moteurs ».
- [ ] README (installation de chaque moteur) et CHANGELOG.
- [ ] Site, en français et en anglais : Escouade pilote Claude Code, Codex et OpenCode, avec des captures.

### Décisions à prendre
- [ ] **Ligne d'OpenCode** : v1 ou v2, après l'essai du point 0.
- [ ] **Mot de l'interface** : « Moteur » (proposé) ? « Agent » est déjà pris.
- [ ] **Repli sur un autre moteur** : quand tous les comptes du moteur d'un ticket ont passé le seuil, partir sur un moteur de secours ? Proposé : oui, en option, désactivée par défaut.
- [ ] **Garde-fou d'OpenCode**, qui n'a pas de quota : un budget par jour en dollars, au-delà duquel le pilote auto se met en pause ?

## 2. Infobulles : une seule forme partout

But : toutes les infobulles de l'app ont l'allure de celle du quota (fond `--elev`, bordure `--line2`, ombre, 11,5 px), apparaissent après le même délai, et le clavier y accède.

### Aujourd'hui
- **Trois infobulles faites à la main**, chacune avec son code et son CSS : la barre de quota (`QuotaMeter.svelte`), le groupe des quotas de la barre d'état (`StatusBar.svelte`) et les barres du graphique des stats (`Stats.svelte`).
- **Partout ailleurs, l'infobulle native du navigateur** (`title=`) : 172 attributs dans 53 composants (Sidebar 12, AppTab 10, Board 9, TitleBar 9, Conversation 9…).
  - On y trouve les ressources (CPU et RAM par agent, sur plusieurs lignes), l'estimation du coût, la branche, et les boutons ⚙ et son.
  - Style du système (blanc sous Windows), délai d'environ 1 s, jamais au focus du clavier.

### À faire
- [ ] **Un composant d'infobulle et une action `use:tip`** (comme `use:trapFocus`). Elle prend un texte ou un snippet : plusieurs lignes, un tableau aligné pour les ressources, un raccourci en `kbd` à droite (« Réglages  Ctrl+, »).
- [ ] **Comportement** :
  - Affichage après ~500 ms de survol, tout de suite au focus du clavier (`:focus-visible`), jamais au focus d'un clic.
  - Une fois une infobulle affichée, passer sur un voisin montre la sienne sans délai pendant ~300 ms.
  - Elle se cache au clic, au défilement et quand la fenêtre perd le focus.
  - Échap la cache jusqu'au prochain survol ou focus, comme celle du quota aujourd'hui.
  - Une seule infobulle à la fois.
- [ ] **Placement** : au-dessus par défaut, en dessous s'il n'y a pas la place (barre de titre), recentrée dans la fenêtre. Elle est rendue dans une couche à la racine, car la barre d'état et les listes coupent ce qui dépasse.
- [ ] **Accessibilité** : l'élément reçoit `aria-describedby` vers l'infobulle. Un bouton-icône dont le `title` était le seul nom (⚙, ×, ↻…) reçoit un `aria-label`, sinon retirer le `title` le laisserait sans nom pour un lecteur d'écran. Un test les liste.
- [ ] **Texte coupé** : un libellé coupé par des points de suspension (résumés du Kanban, titre d'un ticket, nom d'un compte) n'a d'infobulle que s'il est vraiment coupé (option de l'action).
- [ ] **Thèmes sombre et clair.**
- [ ] **Remplacer les trois infobulles faites à la main** par celle-ci. Le quota garde son `role="meter"` et son Échap. Celle des stats, qui suit le pointeur, prend la même allure et peut garder son placement.
- [ ] **Éditeur et terminal** : les infobulles de CodeMirror (navigation de code, diagnostics) et du terminal prennent la même allure, par thème.
- [ ] **Plus aucun `title=` dans les composants Svelte**, hors `<svg><title>`. Un test échoue sur un nouveau, comme celui des textes écrits en dur de la 1.7.
- [ ] **Tests** :
  - Composant : délai (horloge simulée), focus, Échap, placement près des bords, `aria-describedby`, noms des boutons-icônes.
  - e2e : le survol des ressources dans la barre d'état montre l'infobulle stylée, avec une ligne par agent.
- [ ] **Design** : voir si le design en ligne (DesignSync) a une infobulle. Sinon, suivre celle du quota.
- [ ] **Docs** : SPEC (règle générale), CHANGELOG.

## Ordre proposé

1. Infobulles : petit chantier indépendant, qui peut avancer en parallèle de tout le reste.
2. Essais du point 0 sur les deux moteurs. Ils décident de la ligne d'OpenCode, du commit sous le bac à sable de Codex et de la façon de passer le serveur MCP.
3. Extraction de l'interface « moteur », avec Claude seul, sans changement de comportement.
4. Codex, en deux temps :
   - Lancement, conversation, permissions, questions, modèles et modes, plan.
   - Comptes, quota, stats, serveur MCP.
5. Commun : choix du moteur dans l'interface, textes, one-shots.
6. OpenCode, dans le même ordre que Codex.
7. Déclaration du serveur MCP dans les configs de Codex et d'OpenCode, puis docs et site.
