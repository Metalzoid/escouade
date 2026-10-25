# Les plugins d'Escouade : analyse (ESC-170)

Demandé par l'utilisateur le 2026-10-25 : « pour la v2.1.0, planifie pour plus tard un système de plugins, permettant à tout le monde d'apporter des fonctionnalités à Escouade, fais une analyse poussée pour voir tout ce qu'on pourrait manipuler via ces plugins, et planifie une documentation étendue sur le sujet ».

Ce document est l'analyse. Il ne change pas l'app. Le découpage en tickets, le plan de la documentation et les questions qui décident sont dans `docs/TODO-2.1.md`, chapitre « Plugins ».

- §1 : l'inventaire de ce qu'un plugin pourrait manipuler, point d'extension par point d'extension, depuis le code ;
- §2 : l'architecture, comparée sur ce que font VS Code, Zed, Obsidian, Raycast, JetBrains, Claude Code, Tauri et MCP, et trois expériences jetables ;
- §3 : le modèle de confiance et de distribution ;
- §4 : la recommandation, en une page.

## En bref

- **Un plugin est un dossier avec un manifeste** (`escouade-plugin.json`). Il apporte des **contributions déclarées** : un thème, une langue, un harness ACP, un webhook, des modèles de projet, des entrées de menu… Escouade les lit et les montre avec ses propres composants. Il peut aussi apporter un **programme**, qui parle à Escouade en **JSON-RPC 2.0 sur stdio**, comme un serveur MCP ou un agent ACP : il réagit aux événements, décide d'une autorisation, fournit une source du Kanban.
- **Pas de HTML libre dans la fenêtre en 2.1** : l'interface d'un plugin est déclarée (manifeste et blocs), rendue par Escouade. Une vue libre viendra plus tard, dans une iframe isolée (le modèle de MCP Apps).
- **WASM plus tard, pour le même protocole** : un module WASM (wasmtime) servira les plugins sans droits, ceux qu'on peut installer depuis un `.escouade.yml` sans risque. Les mêmes messages, un autre transport.
- **La 2.1.0** : le socle (manifeste, chargement, Réglages › Plugins, permissions, journal, faux Escouade pour les tests), puis trois points : les **événements** (webhooks, Slack, Discord, commandes), les **harness ACP déclarés**, les **thèmes**. Les **règles d'autorisation** suivent, si la 2.1.0 a la place. Les sources du Kanban, les hébergeurs, les outils MCP, l'interface et les langues viennent après.

## 1. L'inventaire

Chaque point d'extension dit : **où** il vit aujourd'hui, **ce qu'un plugin y ferait**, **un exemple**, puis sa **valeur** pour un utilisateur, sa **difficulté** de construction et son **risque** (sécurité, stabilité, compatibilité). Valeur, difficulté et risque sont notés de 1 (faible) à 3 (fort). Le tableau du §1.13 les résume.

Ce qui rend un point facile, c'est un **trait ou un registre déjà là**, derrière lequel le cœur ne sait pas qui répond : les harness (`Engine`, `EngineProcess`, `registry`), les hébergeurs (`Forge`, `Provider`, `forge::Registry`) et le coffre (`SecretStore`) en ont un. Les sources du Kanban (`integrations::Client`, une énumération fermée), les services de voix (`voice::online::Provider`, une énumération fermée) et les langues (`i18n::Lang`, `Fr` et `En`) n'en ont pas : il faudra d'abord les ouvrir.

### 1.1 Les harness

**Où.** `src-tauri/src/engine/` : les traits `Engine` (sans état : `locate`, `tested`, `caps`, `models`, `efforts`, `spawn`, `message`, `translate`, `one_shot`, `grant_file`, `escouade_launch`, `fence_settings`, `user_config`…) et `EngineProcess` (le process vivant : `send_message`, `interrupt`, `set_model`, `set_mode`, `answer_permission`, `answer_question`, `read_usage`…), dans `engine/mod.rs` ; le registre `engine/registry.rs` (`EngineCaps`, `EngineDecl`, `Tested`, `Version`, `Range`, `EngineState`) ; un dossier par harness (`claude/`, `codex/`, `copilot/`, `cursor/`, `opencode/`, chacun avec `locate.rs`, `process.rs`, `bench.rs`, et `terminal.rs` pour une vue terminal) ; la traduction de leurs frames en conversation, `src-tauri/src/agent/<harness>.rs` ; le banc de conformité `engine/bench/` (scénarios, `replay`), et `engine/minimal/`, un faux moteur qui montre le moins qu'un moteur écrit. Le guide « Ajouter un moteur » de `docs/ENGINES.md` liste une quarantaine de cases.

**Ce qu'un plugin y ferait.** Deux niveaux :

1. **Un harness ACP décrit** : Cursor CLI parle déjà ACP v1 à un client d'Escouade (`engine/cursor/process.rs`, `agent/cursor.rs`). Généralisé en un **adaptateur ACP générique**, un plugin n'a plus qu'à _décrire_ son agent dans son manifeste : son programme et ses arguments (`agent acp`), comment le trouver (`locate` : noms, chemins, `--version`), ses versions testées, la variable de son dossier de config (`agent_home_var`), ses modes et leur sens (`ModeCap`), ses modèles, ce qu'il sait faire (`EngineCaps` : images, PDF, copie, message en cours de tour…), sa commande d'installation, ses textes (`speaker`, `writer`). Pas de code : Escouade fait le reste, banc compris. Ce que l'ACP ne dit pas (le quota, le coût, les comptes) reste « inconnu » (`QuotaKind`, `CostKind`), comme chez Cursor.
2. **Un harness en programme** : un plugin qui implémente `Engine` et `EngineProcess` lui-même, par le protocole du plugin (`engine/spawn`, `engine/translate`…). Pour un harness qui ne parle ni ACP ni rien de connu. La traduction doit produire les éléments normalisés (`user`, `text`, `thinking`, `tool`, `question`, `permission`, `turn`, `notice`, `event`) et les noms d'outils de Claude Code (`Bash`, `Edit`…), ce que le banc vérifie.

**Exemple.** « Gemini CLI » ou « Goose », qui parlent ACP : un manifeste de 40 lignes, sans code, et l'agent apparaît dans le menu « Harness » de la barre latérale, avec ses modèles, ses modes et sa vue de conversation.

**Valeur 3.** Chaque nouveau harness a coûté plusieurs tickets (Cursor : ESC-24, ESC-42, ESC-43, ESC-49). Les agents ACP se multiplient : la communauté suivrait leur rythme. **Difficulté 2** pour le niveau 1 (le client ACP existe ; il faut en retirer ce qui est propre à Cursor, `cursor/*`, et faire du registre une liste ouverte : `EngineId` est aujourd'hui une énumération de `model.rs`), **3** pour le niveau 2 (la traduction touche l'état de l'agent de près, `agent/<harness>.rs`). **Risque 3** : un harness lance un programme avec les droits de l'utilisateur, reçoit le jeton du serveur MCP d'Escouade (`grant_file`, jamais dans les arguments) et doit appliquer la clôture des projets privés (`fence_settings`) ; un harness qui l'ignore ouvre les projets privés. L'adaptateur ACP générique doit donc tenir la clôture lui-même (ce qu'ACP permet : les lectures et écritures de fichiers passent par le client, `fs/read_text_file`), et le dire quand l'agent ne passe pas par lui.

**La vue terminal** (`engine/terminal.rs`, `TerminalView`, `escouade-hook`) reste hors des plugins en 2.1 : chaque vue a demandé ses hooks, ses bandes de confiance et ses pièges (ESC-46 à 49).

### 1.2 Les sources du Kanban

**Où.** `src-tauri/src/integrations/` : `mod.rs` (`Client`, une énumération `Jira`, `Trello`, `Github`, `Linear` qui distribue chaque appel par `match` : `me`, `containers`, `states`, `issues`…, avec `Container`, `ExternalIssue`, `IssuePage`, `IssueFilter`, `Query`, `Bases`), un fichier par service, `sync.rs` (la synchro des colonnes et de l'état), `text.rs` (le texte d'un ticket importé), `secrets.rs` (le coffre), `fake.rs` (le faux service des tests, `tests/fixtures/fake-trackers.mjs`). Dans la fenêtre : `src/components/settings/IntegrationsTab.svelte`, `src/components/modals/ImportModal.svelte`, l'étape `wizard/IntegrationsStep.svelte`, `src/lib/integrations.ts`.

**Ce qu'un plugin y ferait.** Fournir un service de plus : se connecter (les champs du compte, déclarés), lister les conteneurs (projets, tableaux), leurs états, les tickets filtrés et paginés, et pousser l'état d'un ticket quand il change de colonne (`sync.rs`).

**Exemple.** YouTrack, Asana, ClickUp, Notion, Azure Boards, ou un CSV dans le dépôt.

**Valeur 3** : chaque équipe a son outil, et Escouade n'en couvrira jamais que quelques-uns (GitLab Issues est déjà demandé, ESC-165). **Difficulté 2** : remplacer l'énumération par un trait (comme `Forge`), puis un `Client` qui parle au plugin ; les types sont déjà sérialisables. **Risque 2** : le plugin a besoin du réseau et d'un secret ; il lit des tickets que l'utilisateur lui confie ; un plugin lent bloque l'import (il faut un délai par appel).

### 1.3 Les hébergeurs de code

**Où.** `src-tauri/src/forge/` : les traits `Forge` (`me`, `create_pr`, `pull_request`, les vérifications de CI `Check`, les relectures `Review`, `ReviewComment`, les déploiements `Deployment`, le merge `MergeStrategy`, la limite d'appels `RateLimit`, chaque méthode refusée par défaut `unsupported`) et `Provider` (`kind`, `name`, `request_word`, `capabilities`, `default_host`, `own_host`, `repo_of`, `probe`, `scopes`, `token_page`, `cli`, `client`), le registre `forge::Registry`, `remote.rs` (l'analyse des remotes), `accounts.rs`, `connect.rs` ; GitHub (`github.rs`, `github_api.rs`), GitLab, Bitbucket et Gitea en cours (ESC-56 à 58). Dans la fenêtre : `settings/ForgesSection.svelte`, `modals/PrModal.svelte`, `src/lib/prs.ts`, `src/lib/forges.ts`.

**Ce qu'un plugin y ferait.** Un hébergeur de plus (`Provider` + `Forge`) ; ou seulement une partie : les déploiements d'un service qui n'est pas l'hébergeur (Vercel, Netlify, Coolify, Fly.io), la CI d'un autre service (Jenkins, Buildkite), sur une PR déjà connue.

**Exemple.** « Déploiements Coolify » : sur la carte d'un ticket en revue, l'état du déploiement d'aperçu de sa branche, et son adresse.

**Valeur 2** (GitHub, GitLab, Bitbucket et Gitea couvrent la plupart ; les déploiements et la CI tierce valent plus). **Difficulté 1** pour un hébergeur entier (le trait et le registre existent, `unsupported` permet d'en faire une partie), **2** pour des déploiements découplés de l'hébergeur (le modèle les attache à `Forge`). **Risque 2** : un jeton d'hébergeur peut écrire dans les dépôts (`scopes`) ; il va au coffre et n'est donné qu'à son plugin.

### 1.4 Les services de voix

**Où.** `src-tauri/src/voice/` : la dictée locale (Whisper, `transcribe.rs`, `models.rs`, `vad.rs`, `audio.rs`), la transcription en ligne (`online.rs` : `Provider`, une énumération de cinq services, `PROVIDERS`, `Spec`, `Net`, et le catalogue `online_catalog.rs`), le direct (`live.rs`, par WebSocket), la voix en ligne (`online_speech.rs`), la conversation vocale (`conversation.rs`, `spoken.rs`). Dans la fenêtre : `settings/VoiceTab.svelte`, `SpeechSettings.svelte`, `OnlineKey.svelte`, `OnlineModel.svelte`, `src/lib/dictation.svelte.ts`, `src/lib/online-voice.svelte.ts`.

**Ce qu'un plugin y ferait.** Un service de transcription (un fichier audio, ou un flux en direct) ou de voix (un texte, un flux audio), avec son catalogue de modèles et de voix.

**Exemple.** Wispr Flow (déjà demandé, ESC-164), AssemblyAI, Azure Speech, ou un serveur Whisper de l'équipe.

**Valeur 2.** **Difficulté 2** pour le fichier entier (une requête, une réponse), **3** pour le direct (de l'audio en continu, des délais de quelques centaines de millisecondes mesurés en ESC-136 et ESC-137 : un process par stdio tient le débit, mais le passage par un plugin s'ajoute au délai). **Risque 2** : le plugin entend ce que l'utilisateur dicte ; il a besoin du réseau et d'une clé.

### 1.5 Les outils du serveur MCP d'Escouade

**Où.** `src-tauri/src/mcp/` : `tools.rs` (la liste et les descriptions des outils : `list_projects`, `get_board`, `create_ticket`, `start_ticket`, `answer_permission`, `create_agent`, `send_message`, `get_usage`… une quarantaine), `read.rs` et `act.rs` (ce qu'ils lisent et font), `resolve.rs` (`Sight`, `may_act_on` : ce qu'un agent voit et sur quoi il agit, les projets privés), `http.rs` (le serveur et son jeton), `install.rs` (la déclaration dans chaque harness), `activity.rs` (le journal des appels, `McpActivity`). Dans la fenêtre : `settings/McpSection.svelte`, `src/lib/mcp.svelte.ts`, les noms en mots des outils dans `src/lib/tools.ts` (`ESCOUADE_TOOLS`).

**Ce qu'un plugin y ferait.** Deux sens :

- **ajouter des outils** au serveur d'Escouade, que les agents appellent comme les autres (`mcp__escouade__<plugin>_<outil>`) : l'outil passe par le serveur d'Escouade, qui garde le jeton, la vue (`Sight`) et le journal, puis par le plugin ;
- **utiliser les outils** d'Escouade, comme un client : un plugin qui lit le Kanban, crée un ticket, lance un agent. Le plugin reçoit un jeton à lui, et ses droits sont ceux qu'il a demandés (lecture seule, ou actions), jamais plus que ceux d'un agent (`may_act_on`).

**Exemple.** « Sentry » : un outil `sentry_issue` que l'agent appelle pour lire l'erreur d'un ticket ; ou un plugin qui crée un ticket par alerte de production.

**Valeur 2** (un agent peut déjà avoir ses propres serveurs MCP ; l'intérêt est de les grouper avec le reste d'un plugin et de les donner à tous les harness d'un coup, par l'interrupteur unique d'ESC-119). **Difficulté 1** pour ajouter des outils (une table, un appel relayé), **2** pour le client (un jeton par plugin, sa portée). **Risque 3** : un outil d'agent est un chemin pour l'injection de consignes ; un plugin client peut agir sur les projets ; les projets privés doivent rester hors de sa vue, comme pour un agent d'un autre projet.

### 1.6 Les événements

**Où.** Il n'y a pas de bus d'événements interne. Le cœur (`src-tauri/src/core.rs`, 9 300 lignes) change l'état et envoie à la fenêtre un `UiEvent` par un seul canal (`hub.rs`, `model.rs` : `Agent`, `AgentRemoved`, `Conv`, `Git`, `Usage`, `Ticket`, `TicketRemoved`, `Project`, `BoardIssue`, `AutopilotPause`, `Toast`, `McpActivity`, `Voice`…) ; ces événements portent l'état entier, pour la fenêtre, pas le fait. Les faits vivent là où ils arrivent :

- **un agent** : son statut (`AgentStatus`, `set_status` dans `agent.rs`), sa création, son arrêt, son passage sur un autre harness (`handover.rs`), son changement de compte au seuil (`switching.rs`) ;
- **un tour** : sa fin (`Effects.turn_end`, `board::TurnEnd` : `Finished`, `Interrupted`, `Limited`, `Error`), la limite atteinte (`Effects.limited`), le quota (`Effects.rate`) ;
- **une demande** : une autorisation ou une question en attente (`add_pending`), sa réponse (`PermissionAnswer::Allow`, `Always`, `Deny` ; « Refusé par <client> via Escouade » dit déjà qui a répondu) ;
- **un ticket** : sa création, son passage d'une colonne à l'autre (`model::Column` : `Todo`, `Doing`, `Review`, `Done`), son lancement par le pilote auto, son rapport de critères (le bloc `escouade`), sa validation et son refus, son merge et ses conflits (`board.rs`) ;
- **un projet** : son ajout, sa fermeture (`closed.rs`), ses réglages, un worktree créé ou retiré (`worktrees.rs`) ;
- **un lancement** : un lancement de test démarré, prêt, arrêté (`testlaunch.rs`, `RunView.svelte`), les tests d'une validation passés ou non ;
- **l'app** : son démarrage, une mise à jour disponible (`updates.rs`).

**Ce qu'un plugin y ferait.** S'abonner aux faits qu'il a déclarés, et réagir : notifier ailleurs, lancer une commande, appeler une URL, ou, pour quelques-uns, **décider** (voir §1.7).

**Exemple.** « Slack » : « Ticket ESC-170 à tester, 3 critères sur 3 » dans le salon de l'équipe, avec le lien de la PR ; « Commande à la fin du tour » : `say "Claude a fini"` ; un webhook générique vers n8n ou Zapier.

**Valeur 3** (demandé de toutes les formes ; c'est le point d'entrée de la plupart des plugins). **Difficulté 2** : il faut un bus de faits, typé et versionné, appelé aux endroits du cœur qui changent l'état, et non dérivé des `UiEvent` (qui portent trop et changent avec l'interface). **Risque 2** : un fait dit le nom d'un ticket, d'un projet, d'une branche, parfois un extrait de conversation ; ceux d'un projet privé ne vont qu'aux plugins activés pour lui. Un plugin lent ne retarde rien : les faits partent dans une file, sans attendre de réponse.

### 1.7 Les autorisations et les questions

**Où.** `EngineProcess::answer_permission` et `answer_question` (`engine/mod.rs`), la réponse dans le cœur (`core.rs`, `answer_permission`), dans l'agent (`agent.rs`, `answer_permission_by` : qui a répondu), dans la fenêtre (`conv/PermissionCard.svelte`, `QuestionCard.svelte`, `src/lib/answer-keys.svelte.ts`), par la voix (`voice/conversation.rs`), et par un autre agent (`mcp__escouade__answer_permission`). Le refus par défaut de Claude Code (`caps.default_refusal`) et les règles « Toujours » de chaque harness (`PermissionAnswer::Always { rules }`).

**Ce qu'un plugin y ferait.** **Décider** d'une demande avant qu'elle n'arrive à l'utilisateur, selon une règle : autoriser, refuser avec un message, ou laisser l'utilisateur répondre. Avec un délai court au-delà duquel la demande va à l'utilisateur comme aujourd'hui. La réponse dit « Autorisé par <plugin> via Escouade ».

**Exemple.** « Règles de l'équipe » : `npm test`, `cargo nextest` et `git status` autorisés dans tous les worktrees ; `git push --force` et `rm -rf` hors du worktree refusés ; le reste à l'utilisateur. Ou une politique lue dans le dépôt.

**Valeur 3** (les demandes d'autorisation sont ce qui interrompt le plus ; un mode Bypass est souvent la seule issue). **Difficulté 2** (le chemin de réponse existe ; il faut une étape avant `add_pending`, et un ordre quand plusieurs plugins répondent : un refus l'emporte). **Risque 3** : un plugin qui autorise tout est un mode Bypass caché. Il faut une permission à part, montrée en rouge, jamais accordée à un plugin proposé par un projet, et le journal de chaque décision.

### 1.8 Les textes rédigés, les consignes et la passation

**Où.** Les textes que le modèle rédige : les one-shots (`engine/oneshot.rs`, `Engine::one_shot`, `Weight::Light` et `Reading`, « Modèle des textes rédigés ») pour le nom d'un agent (`core.rs`, `rename_agent`, le nom donné au premier message d'ESC-156), le message de commit et la description d'une PR (`board.rs`, `pr_body`, la forme conventionnelle), les étapes de mise en place d'un worktree et les commandes de lancement (`core.rs`, `suggest_worktree_steps`, `suggest_run_commands`). Les consignes : le protocole d'un ticket (`board.rs`, `protocol`, `protocol_prompt_for`, borné par `PROTOCOL_BUDGET` et `Engine::instructions_room`), le message transmis à un sous-agent (`subagent_relay`). La passation à un autre harness (`handover.rs`, le fichier écrit depuis le journal `conv.rs`).

**Ce qu'un plugin y ferait.** **Transformer** un texte avant qu'il serve : le message de commit, la description d'une PR (un gabarit d'équipe, un lien vers le ticket Jira), le nom d'un agent ; **ajouter des consignes** au protocole d'un ticket (les règles de l'équipe, la définition de « fini ») dans la place qui reste ; enrichir le fichier de passation.

**Exemple.** « Gabarit de PR » : la description suit le modèle `.github/pull_request_template.md` du dépôt, avec la case « Tests » cochée d'après le rapport de critères.

**Valeur 2.** **Difficulté 1** (des fonctions pures, appelées à quelques endroits). **Risque 2** : des consignes ajoutées sont une injection possible dans chaque agent ; leur taille doit rester dans `instructions_room` ; un plugin qui renvoie n'importe quoi ne doit pas casser un commit (le texte d'Escouade sert de repli, comme pour un one-shot raté).

### 1.9 L'interface

**Où.** Svelte 5, dans `src/components/` et `src/lib/` :

| Emplacement | Fichiers | Ce qu'un plugin y mettrait |
| --- | --- | --- |
| Panneau latéral | `SidePanel.svelte`, `FilesPanel.svelte`, `branches/`, `editor/` | un panneau de plus à côté de Git et des fichiers (« Sentry », « Docs de l'équipe ») |
| Barre latérale | `Sidebar.svelte`, `src/lib/sidebar.ts` | une section (« Revues en attente ») |
| Réglages | `modals/SettingsModal.svelte`, `settings/*Tab.svelte`, `Group.svelte`, `Row.svelte` | un onglet, ou une section d'un onglet, avec les champs de ses réglages |
| Menus | `ContextMenu.svelte`, `src/lib/menu.svelte.ts` (`MenuItem`), `agent-actions.ts`, `project-actions.ts`, `launch-actions.ts`, `term-actions.ts` | une entrée sur un agent, un ticket, un projet, un lancement |
| Commandes et raccourcis | `src/lib/shortcuts.ts`, `QuickOpen.svelte` | une commande nommée, avec un raccourci proposé |
| Carte dans la conversation | `conv/ToolRow.svelte`, `src/lib/tools.ts` (le résumé d'un outil), `conv/EventMessage.svelte` | le rendu d'un outil (le sien ou un autre) : une table, un lien, une image |
| Badge | `board/` (cartes des tickets), `Sidebar.svelte` (cartes des agents) | « CI verte », « Déployé », « Sentry : 3 erreurs » |
| Barre d'état | `StatusBar.svelte` | un élément (« Coolify : en ligne ») |
| Barre des projets | `ProjectRail.svelte`, `ProjectTile.svelte` | un badge sur la tuile d'un projet |
| Page plein cadre | `Stats.svelte`, `Overview.svelte` | une page à elle (« Coûts par client ») |
| Fenêtre | `modals/Modal.svelte` | une fenêtre de saisie (connexion, choix) |

**Ce qu'un plugin y ferait.** Ajouter un élément à un emplacement, dont **Escouade** fait le rendu à partir d'une description : un texte, une icône du jeu d'Escouade (`Icon.svelte`, `IconSprite.svelte`), une couleur de statut, une action (une méthode du plugin) ; pour un panneau ou une page, des blocs (liste, table, champs, boutons, markdown par `Markdown.svelte`). Plus tard, une vue libre en HTML dans une iframe isolée (voir §2.3).

**Exemple.** « Coûts par client » : une page plein cadre qui regroupe les statistiques par préfixe de ticket, une entrée « Facturer ce ticket » dans le menu d'un ticket.

**Valeur 3** pour les menus, badges, barre d'état et réglages (là où un plugin devient visible), **2** pour les panneaux et pages. **Difficulté 2** pour l'interface déclarée (un composant par type de bloc, aux règles de `DESIGN.md`, dans les deux langues), **3** pour une vue libre (isolation, thème, taille, focus, accessibilité, et les trois moteurs de rendu). **Risque 1** pour l'interface déclarée (Escouade fait le rendu), **3** pour une vue libre dans la fenêtre principale (une iframe qui atteindrait l'IPC de Tauri aurait les droits de l'app : CVE-2024-35222, voir §2.3).

### 1.10 Les thèmes et les langues

**Les thèmes. Où.** `src/app.css` (177 propriétés `--…` : surfaces, texte, filets, états, `@property --p`), `src/lib/theme.ts` (la teinte de la fenêtre par `--p`, la couleur du projet en oklch, `PROJECT_COLORS`, `BRAND`), `src/lib/appearance.ts`, le thème de xterm tiré des jetons (ESC-80, `TerminalView.svelte`), celui de CodeMirror (`src/lib/editor/`), les règles de `DESIGN.md`. **Ce qu'un plugin y ferait** : un jeu de valeurs pour les jetons, clair ou sombre, et une palette de couleurs de projet. **Exemple** : « Solarized », « Contraste élevé ». **Valeur 2**, **difficulté 1** (des données ; mais le renommage des anciens jetons, `--ok`, `--accent`, `--line2`…, encore lus à une trentaine d'endroits, est un préalable, noté dans les restes du redesign : un thème ne doit dépendre que des noms qui restent), **risque 1** (des valeurs CSS filtrées : couleurs, longueurs ; jamais `url()` ni du CSS libre, qui pourrait charger une ressource ou masquer une demande d'autorisation).

**Les langues. Où.** `src/lib/i18n/` : un catalogue par langue et par domaine (`fr/*.ts`, `en/*.ts`, 26 fichiers et près de 3 900 lignes en français), typé (`types.ts`, `type-checks.ts`), avec `GLOSSARY.md`, et un test qui refuse le texte écrit en dur (`hardcoded.test.ts`) ; côté Rust, `src-tauri/src/i18n.rs` (`Lang` : `Fr`, `En`) et des textes écrits dans le code par `match lang` (le protocole d'un ticket, les notifications, les refus). Le site, `website/content/docs/{fr,en}/`. **Ce qu'un plugin y ferait** : une langue de plus, ses catalogues complets. **Exemple** : « Español ». **Valeur 2** (Escouade est en deux langues), **difficulté 3** (`Lang` est fermé, les textes du cœur ne sont pas en catalogue ; une langue partielle doit retomber sur l'anglais clé par clé ; les consignes données aux agents dans une langue doivent rester dans leur budget), **risque 1** (des textes ; mais un texte de consigne traduit est une consigne, à borner comme au §1.8).

### 1.11 Les recettes, les worktrees, l'assistant et `.escouade.yml`

**Où.** Les lancements de test d'un worktree (`src-tauri/src/testlaunch.rs` : les ports réservés, les fichiers copiés, les tests d'une validation, la disponibilité d'un serveur ; `src/lib/recipe.ts`, `RunView.svelte`, `RunsSection.svelte`, `modals/TestLaunchModal.svelte`), isola, un outil externe déjà branché (`isola.rs` : `isola up`, `ls --json`, `down`, `destroy`), la mise en place et le retrait d'un worktree (`worktrees.rs`, `worktrees.setup`, `worktrees.teardown`), l'assistant « Nouveau projet » (`src/lib/wizard.ts`, `wizard-form.svelte.ts`, `components/wizard/*Step.svelte`), le fichier partagé du projet (`projectfile.rs`, `KEYS` : `agents.engine`, `board.*`, `git.*`, `worktrees.*`, et `schemas/`).

**Ce qu'un plugin y ferait.**

- **un environnement de lancement**, à la manière d'isola : prendre en charge `up`, l'adresse, `down` et `destroy` d'un worktree (Docker Compose, devcontainers, Tilt, un cluster de préproduction) ;
- **des étapes de mise en place** proposées selon ce qu'il reconnaît dans le dossier (un `pnpm-lock.yaml`, un `Cargo.toml`), en plus de celles que rédige le modèle ;
- **des modèles de projet** pour l'assistant (« Nuxt + Supabase » : la recette, les étapes, les réglages du Kanban) ;
- **des clés à lui** dans `.escouade.yml`, sous `plugins.<id>.*`, validées par le schéma qu'il déclare.

**Exemple.** « Docker Compose » : chaque worktree a ses conteneurs, sur ses ports réservés, retirés avec lui.

**Valeur 3** pour l'environnement de lancement (c'est là que les projets diffèrent le plus), **2** pour le reste. **Difficulté 2** (isola est déjà un cas particulier à généraliser ; `KEYS` est la seule liste de `.escouade.yml`, il faut un espace à part pour les plugins). **Risque 3** : une recette lance des commandes. Les commandes de `.escouade.yml` passent déjà par une approbation à empreinte stricte (ESC-146) ; celles d'un plugin aussi.

### 1.12 Les statistiques, les notifications et la recherche

**Les statistiques. Où.** `src-tauri/src/stats.rs` (SQLite : tokens et coût par agent, par compte, par jour), `src/lib/stats.ts` (les indicateurs), `Stats.svelte` et `Overview.svelte`, la grille des prix `pricing.rs`. Rien ne s'exporte aujourd'hui. **Ce qu'un plugin y ferait** : lire les statistiques (en lecture seule), les exporter (CSV, Grafana, un tableur), ajouter une page ou un indicateur. **Exemple** : « Export mensuel » en CSV par projet et par harness. **Valeur 2**, **difficulté 1**, **risque 1** (des chiffres, mais pour un projet privé seulement si le plugin y est activé). La **télémétrie** (`telemetry.rs`, Aptabase, envoyée seulement avec l'accord de l'utilisateur) n'est pas un point d'extension : un plugin ne lit ni n'envoie rien par elle.

**Les notifications. Où.** `src-tauri/src/notify.rs` (le son, la notification du système, la barre des tâches, le badge du plateau), `Toasts.svelte`, `settings/AppTab.svelte`. **Ce qu'un plugin y ferait** : un canal de plus (ntfy, Pushover, Telegram, la montre), à côté de ceux du système, avec les mêmes réglages de ce qui notifie ; et des notifications à lui. **Exemple** : « ntfy » pour être prévenu sur son téléphone qu'un agent attend. **Valeur 3** (avec les événements, c'est ce que demandent ceux qui laissent tourner l'autopilote), **difficulté 1**, **risque 1** (le texte d'une notification est borné, `MAX_BODY`).

**La recherche. Où.** `convsearch.rs` (Ctrl+K, dans les conversations), `search.rs` (`git grep` de l'éditeur), `QuickOpen.svelte` et `src/lib/editor/quick-open.ts`. **Ce qu'un plugin y ferait** : une source de résultats de plus dans Ctrl+K (les tickets Linear, la doc interne, les erreurs Sentry), chaque résultat avec son action. **Valeur 2**, **difficulté 2** (un délai, un nombre de résultats borné, comme `MAX_HITS` et `TIME_LIMIT`), **risque 1**.

### 1.13 Ce que j'ai trouvé en plus

- **Les comptes et le quota** (`accounts.rs`, `usage.rs`, `switching.rs`, `QuotaMeter.svelte`) : un plugin qui lit le quota d'un harness qui ne le dit pas (un tableau de bord de fournisseur), ou qui décide du changement de compte. Valeur 1, difficulté 2, risque 2. Après.
- **Le coffre** (`integrations/secrets.rs`, `SecretStore` : `get`, `set`, `delete`, le trousseau du système) : pas un point d'extension, mais le service que tous les plugins utilisent (§3.5).
- **Les fichiers joints et les images d'un ticket** (`attachfiles.rs`, `ticketfiles.rs`, `ticketimages.rs`) : un plugin qui joint une capture d'écran prise par un navigateur sans tête au rapport d'un ticket. Valeur 2, difficulté 2, risque 2. Après.
- **Le pilote auto** (`board.rs`, l'autopilote, `maxParallel`, `AutopilotPause`) : un plugin qui ordonne la file des tickets (par priorité Jira, par coût). Valeur 2, difficulté 2, risque 2. Après, sur les événements et les sources.
- **Les commandes locales et `/` des harness** (`agent/localcmd.rs`, `src/lib/localcmd.ts`, `caps.slash_commands`) : des commandes `/` d'Escouade apportées par un plugin, dans le composer. Valeur 2, difficulté 2, risque 2. Après.
- **Les mises à jour d'Escouade** (`updates.rs`, `selfupdate.rs`) : jamais par un plugin.

### 1.14 Le tableau

| Point d'extension | Valeur | Difficulté | Risque | Version proposée |
| --- | :-: | :-: | :-: | --- |
| Événements (notifier, commandes, webhooks) | 3 | 2 | 2 | **2.1.0** |
| Harness ACP décrit (adaptateur générique) | 3 | 2 | 3 | **2.1.0** |
| Thèmes | 2 | 1 | 1 | **2.1.0** |
| Autorisations décidées par une règle | 3 | 2 | 3 | 2.1.0 si la place, sinon 2.1.x |
| Notifications : un canal de plus | 3 | 1 | 1 | 2.1.x (sur les événements) |
| Interface déclarée : menus, badges, barre d'état, réglages | 3 | 2 | 1 | 2.1.x |
| Sources du Kanban | 3 | 2 | 2 | 2.2 |
| Environnements de lancement, étapes, modèles de projet | 3 | 2 | 3 | 2.2 |
| Textes rédigés et consignes | 2 | 1 | 2 | 2.2 |
| Outils MCP ajoutés, plugin client du serveur | 2 | 1–2 | 3 | 2.2 |
| Hébergeurs, déploiements, CI tierce | 2 | 1–2 | 2 | 2.2, après ESC-56 à 69 |
| Statistiques et export | 2 | 1 | 1 | 2.2 |
| Recherche (Ctrl+K) | 2 | 2 | 1 | 2.2 |
| Services de voix | 2 | 2–3 | 2 | 2.3 |
| Interface libre : panneau, page en iframe | 2 | 3 | 3 | 2.3 |
| Langues | 2 | 3 | 1 | 2.3 |
| Harness en programme, vue terminal | 2 | 3 | 3 | plus tard |

## 2. L'architecture

### 2.1 Ce que font les autres

| App | Où tourne le code | Isolation | Permissions | Compatibilité |
| --- | --- | --- | --- | --- |
| **VS Code** | un _extension host_, un process Node à part (ou un Web Worker dans le navigateur) ; les vues libres dans des _webviews_, des iframes servies d'une autre origine | un plantage ne fait pas tomber l'éditeur ; aucun bac à sable pour le code : une extension a les droits de l'utilisateur | aucune au niveau du code ; la _Workspace Trust_ (mode restreint) coupe ce qui exécute le code d'un dossier, et chaque extension déclare son support (`capabilities.untrustedWorkspaces`) ; « Workspace Trust can't prevent a malicious extension from executing code » | `engines.vscode` dans `package.json`, API stable et API proposée à part ; activation paresseuse (`activationEvents`) |
| **Zed** | des composants WebAssembly (WIT, wasmtime), écrits en Rust | un vrai bac à sable : l'extension n'a que ce que l'API lui donne (client HTTP, lancement d'un process, réglages) | par les fonctions exposées ; pas d'interface libre : les extensions ne peuvent pas modifier l'interface | une version du WIT par version de Zed : une extension garde l'API avec laquelle elle a été faite |
| **Obsidian** | du JS dans la fenêtre Electron, sans séparation | aucune : un plugin a accès aux fichiers, au réseau, et peut installer des programmes | aucune ; un mode restreint, actif par défaut, empêche tout code tiers ; une revue à la soumission, pas à chaque version | `minAppVersion` dans le manifeste |
| **Raycast** | TypeScript, React et Node ; un réconciliateur maison transforme l'arbre React en une interface native (AppKit) | l'interface est déclarée par des composants de Raycast, jamais en HTML | une revue de chaque extension par PR dans un dépôt public, une CI qui valide le manifeste ; licence MIT exigée | le manifeste est un `package.json` augmenté |
| **JetBrains** | du Java ou du Kotlin dans la JVM de l'IDE | aucune ; un plugin a l'IDE entier | aucune ; les plugins du Marketplace sont signés et vérifiés | `since-build` et `until-build`, et le _Plugin Verifier_ qui vérifie la compatibilité binaire sur une plage de versions |
| **Claude Code** | un dossier avec `.claude-plugin/plugin.json` : skills, commandes, agents, hooks (des commandes, du HTTP), serveurs MCP et LSP en process, thèmes, moniteurs | les hooks et serveurs sont des process avec les droits de l'utilisateur | `userConfig` : des valeurs demandées à l'activation, celles qui sont sensibles au trousseau ; un chemin hors du dossier du plugin est refusé | `claude plugin validate`, des places de marché qui sont des dépôts git (`marketplace.json`) ; `version` fixe la version installée |
| **Tauri** | des _capabilities_ (ACL) par fenêtre ou webview ; un modèle « isolation » | une webview sans capability n'a pas d'accès à l'IPC ; une iframe ajoutée à la page atteignait l'IPC (CVE-2024-35222, corrigée en 2.0.0-beta.20) | par commande et par fenêtre | — |
| **MCP** | des serveurs en process (stdio) ou en HTTP, JSON-RPC 2.0 ; MCP Apps (SEP-1865) : des vues HTML dans une iframe isolée, qui parlent JSON-RPC par `postMessage` | l'iframe n'atteint ni le DOM, ni le stockage, ni les scripts de la page hôte ; une CSP déclarée | l'hôte peut exiger un accord avant un appel d'outil venu d'une vue ; tout le trafic est journalisé | négociation des capacités à l'initialisation |

Ce qu'on en retient :

1. **Personne ne bac-à-sable le code et l'interface libre à la fois, sauf par la séparation.** VS Code sépare le code (un process) de l'interface (des iframes d'une autre origine) ; MCP Apps fait de même. Zed bac-à-sable le code et n'offre pas d'interface ; Raycast offre une interface riche mais _déclarée_.
2. **Sans bac à sable, la sécurité vient de la confiance et de la revue** (Obsidian, JetBrains, Raycast, Claude Code) : un mode restreint par défaut, une revue humaine, des signatures, et le droit de tout retirer.
3. **La compatibilité vient d'une version d'API déclarée et vérifiée** (`engines.vscode`, `minAppVersion`, `since-build`, le WIT par version de Zed), plus un outil qui le vérifie avant la publication (`claude plugin validate`, _Plugin Verifier_).
4. **Escouade parle déjà le langage des process** : ses harness sont des process (stream-json, JSON-RPC de Codex et de Copilot, ACP de Cursor, HTTP et SSE d'OpenCode), son serveur MCP aussi, et tout son outillage de tests repose sur des faux process (`tests/fixtures/fake-*.mjs`) et des Job objects qui tuent un arbre de process entier (`job.rs`).

### 2.2 Trois expériences jetables

Faites hors du dépôt, dans `%TEMP%\esc170`, le 2026-10-25, sur la machine de développement (Windows 11).

**Un module WASM chargé depuis Rust** (`wasm/`, wasmtime 38, Cranelift, un module en WAT avec une fonction de l'hôte) :

- compilation du module : 3,4 ms ; instanciation : 27 µs ; un million d'appels de l'hôte vers le module : 11,5 ms, **11 ns par appel** ;
- une boucle infinie arrêtée par le **carburant** (`consume_fuel`, 5·10⁷ unités) en 11 ms, ou par l'**époque** (`epoch_interruption`, incrémentée par un autre fil) en 200 ms, à la milliseconde : `Trap::OutOfFuel` et `Trap::Interrupt` ;
- une mémoire qui grossit sans fin arrêtée à la limite (`StoreLimits`, 16 Mio : 241 pages de 64 Kio accordées, puis `memory.grow` refusé) ;
- un plantage (`unreachable`) rendu en erreur, l'hôte toujours vivant, le module appelable à nouveau ;
- le coût : **11 Mo** de plus dans l'exécutable avec Cranelift, et 518 Mo de `target` à la compilation.

Le bac à sable de WASM tient ce qu'il promet, à un coût d'appel négligeable. Ce qu'il ne dit pas : le confort d'un auteur en TypeScript ou en Python (il faut embarquer un interpréteur compilé en WASM : QuickJS, StarlingMonkey, CPython, plusieurs Mo par plugin et un démarrage plus lent), le débogage (pas de débogueur pas à pas ordinaire dans l'hôte), et les appels asynchrones de l'hôte (le réseau) qui demandent les fonctions asynchrones de wasmtime.

**Une iframe isolée dans le moteur de WebView2** (`iframe/`, Edge sans tête par Playwright, une iframe `sandbox="allow-scripts"` en `srcdoc`, sans `allow-same-origin`, avec une CSP `default-src 'none'`, dans une page qui imite l'IPC de Tauri par `window.__TAURI_INTERNALS__`) :

- l'iframe a l'origine `null` ; lire le DOM de la page, appeler `parent.__TAURI_INTERNALS__.invoke()` et le `localStorage` : **refusés** (`SecurityError`) ; `fetch` vers l'extérieur : **refusé** par la CSP (`TypeError`) ;
- `postMessage` dans les deux sens fonctionne : un JSON-RPC entre la vue et la fenêtre est possible ;
- une boucle de 1,5 s dans l'iframe n'a pas gelé la page : son minuteur de 50 ms a eu au plus 65 ms d'écart. Chromium met l'iframe d'origine opaque dans un autre process de rendu.
- **Non essayé** : WKWebView (macOS) et WebKitGTK (Linux). Le navigateur WebKit de Playwright n'est pas installé sur cette machine. WebKit met les iframes dans le process de la page, sauf là où son isolation des sites est active : une boucle infinie gèlerait sans doute la fenêtre sous macOS et Linux. À vérifier sur un Mac et sous Linux avant d'offrir une vue libre.

**Un plugin en process à côté** (`proc/`, un hôte Node et un plugin Node en JSON-RPC sur stdio, une ligne par message, la forme du protocole de Codex et d'ACP) : premier échange 67 ms après le lancement (le démarrage de Node), puis **43 µs par aller-retour** sur 10 000 demandes d'autorisation. Assez pour un événement, une décision ou un texte ; trop pour un appel par image d'une animation, ce qu'aucun point d'extension ne demande.

### 2.3 Les quatre façons, comparées

**A. Un process à côté, en JSON-RPC sur stdio** (comme un serveur MCP, un agent ACP, l'_extension host_ de VS Code, un serveur LSP).

- **Isolation** : un plantage ne touche qu'un process ; Escouade le redémarre avec un budget (trois fois, puis le plugin est arrêté et le journal le dit). Une fuite de mémoire est mesurable (`resources.rs` lit déjà la mémoire et le CPU des process des agents) et bornable par le Job object (Windows : limite de mémoire du Job ; ailleurs, `setrlimit`). Une boucle infinie ne gèle rien : chaque appel a un délai, au-delà duquel la réponse par défaut s'applique. Le Job tue tout l'arbre du plugin à sa fin ou à celle de l'app (`job.rs`).
- **Permissions** : Escouade ne peut **appliquer** que ce qui passe par lui : les faits et les données qu'il envoie (rien d'un projet privé à un plugin non activé pour lui : la vue `Sight` du serveur MCP), les secrets qu'il donne (ceux du plugin seulement), les outils qu'il ouvre. Le réseau et le disque, il ne peut que les **déclarer** et les montrer : le process a les droits de l'utilisateur, comme chez VS Code, Obsidian, JetBrains et Claude Code. La clôture des projets privés (`fence.rs`) n'est pas tenue contre un plugin qui va lire le disque lui-même. Un bac à sable du système (AppContainer, Seatbelt, bubblewrap, ce que Codex fait pour ses commandes) le permettrait plus tard, à un coût élevé sur trois systèmes.
- **Performances** : 43 µs par aller-retour mesurés ; le démarrage d'un runtime (67 ms pour Node) ; la mémoire d'un process par plugin (quelques dizaines de Mo pour Node), d'où un démarrage paresseux, au premier fait auquel il est abonné, comme les `activationEvents` de VS Code.
- **Langages et débogage** : n'importe lesquels (TypeScript, Python, Go, Rust, un script shell pour un hook) ; un débogueur ordinaire s'attache au process (`--inspect` pour Node) ; le journal de stderr va dans Réglages › Plugins. Mais il faut un runtime : un plugin en TypeScript exige Node, que tous les utilisateurs n'ont pas (Claude Code a son installeur natif). Le SDK doit permettre de livrer un exécutable unique (`bun build --compile`, `deno compile`, Go, Rust).
- **Compatibilité** : la version du protocole est négociée à `initialize`, comme ACP et MCP (`protocolVersion`, les capacités de chaque côté) ; un champ inconnu est ignoré des deux côtés, comme la lecture des harness le fait déjà (« La lecture tolère l'inconnu », `docs/ENGINES.md`).
- **Coût dans Escouade** : faible. Le client JSON-RPC sur stdio, les Job objects, les faux process et le banc existent ; le cœur appelle un trait, comme pour les harness.

**B. Un module WASM chargé par le cœur** (wasmtime, ou Extism par-dessus ; ce que fait Zed).

- **Isolation** : la meilleure. Plantage, mémoire et boucle infinie bornés et rattrapés (essayé au §2.2), dans le process d'Escouade sans le mettre en danger.
- **Permissions** : **appliquées** : le module n'a que les fonctions que l'hôte lui donne. Le réseau passe par une fonction de l'hôte qui ne laisse sortir que vers les hôtes déclarés (le `allowed_hosts` d'Extism) ; le disque par des dossiers préouverts (WASI) que la clôture des projets privés peut filtrer ; les secrets par une fonction qui ne rend que ceux du plugin. C'est la seule façon de tenir `fence` contre un plugin.
- **Performances** : 11 ns par appel ; un démarrage en millisecondes ; mais un interpréteur embarqué pour JS ou Python, de plusieurs Mo, et un code JS bien plus lent qu'avec Node.
- **Langages et débogage** : Rust, C, Go (TinyGo), AssemblyScript sont naturels ; JS et Python passent par un interpréteur compilé en WASM, avec des limites (pas de modules natifs, pas de `npm` qui touche au système) ; le débogage se fait surtout au journal.
- **Compatibilité** : une interface WIT par version majeure, gardée côté hôte comme Zed le fait ; l'hôte peut charger des modules de plusieurs versions de l'API à la fois.
- **Coût dans Escouade** : moyen à fort. 11 Mo de plus, une interface WIT à tenir, les fonctions asynchrones de l'hôte, un SDK par langage. Et ce que les points d'extension de la 2.1.0 demandent d'abord (le réseau pour un webhook, un process pour un harness, une commande pour une notification) devrait de toute façon sortir du bac à sable, par des fonctions de l'hôte qui le réouvrent.

**C. Du JS dans la WebView, en iframe isolée ou en Web Worker** (les _webviews_ de VS Code, MCP Apps).

- **Isolation** : sous WebView2, une iframe d'origine opaque tourne dans un autre process (essayé) ; sous WKWebView et WebKitGTK, sans doute dans celui de la fenêtre, où une boucle la gèlerait (non essayé). Un Web Worker a son propre fil partout, mais pas de DOM. Une fuite de mémoire pèse sur la fenêtre.
- **Permissions** : sans `allow-same-origin`, avec une CSP `default-src 'none'`, l'iframe n'atteint ni l'IPC de Tauri, ni le DOM, ni le stockage, ni le réseau (essayé). Les capabilities de Tauri ne s'appliquent pas à une iframe : c'est l'origine opaque qui protège, et ce n'est sûr que si **aucune** iframe de plugin n'a `allow-same-origin` (CVE-2024-35222). La CSP d'Escouade (`tauri.conf.json`) devra ajouter `frame-src` pour les vues des plugins, servies par un protocole à part.
- **Performances** : bonnes pour une vue ; nulles pour la logique hors de la fenêtre (un plugin dans la WebView ne vit que tant que la fenêtre est ouverte, et Escouade tourne aussi fenêtre cachée, dans le plateau).
- **Langages et débogage** : JS et TypeScript, les outils du navigateur (les DevTools de WebView2 s'ouvrent déjà pour les e2e).
- **Compatibilité** : le thème (les jetons de `app.css` passés à la vue), la taille, le focus et les raccourcis sont à reprendre dans chaque vue ; trois moteurs de rendu à essayer.
- **Coût dans Escouade** : moyen ; le protocole `postMessage`, un composant hôte, le protocole qui sert les fichiers du plugin.

**D. Les mélanges.**

- **D1. Le code en process, l'interface déclarée** : le plugin décrit ses contributions (manifeste, puis blocs rendus par Escouade : texte, liste, table, champs, boutons, markdown), et le code tourne en process. C'est le modèle de Raycast pour l'interface et de VS Code pour le code (ses menus, commandes, réglages et barre d'état sont déclarés dans `package.json`). Pas de HTML d'un plugin dans la fenêtre.
- **D2. D1, plus des vues libres en iframe isolée plus tard**, pour ce que les blocs ne savent pas montrer (un graphe, un tableau de bord) : le modèle de MCP Apps, qui parle aussi JSON-RPC.
- **D3. Un seul protocole, deux runtimes** : les mêmes messages JSON-RPC, portés soit par stdio vers un process, soit par une fonction de l'hôte vers un module WASM. Un plugin qui n'a besoin d'aucun droit du système (une règle d'autorisation, un gabarit de PR, un ordre des tickets) se compile en WASM et devient installable sans crainte ; les autres restent des process.
- **D4. Le déclaratif seul**, sans code : thèmes, langues, harness ACP décrits, webhooks (une URL et un gabarit par fait), modèles de projet, recettes. Une bonne part de la valeur, sans aucun code tiers à faire tourner.

| | A. Process | B. WASM | C. JS en iframe | D1 + D3 + D4 |
| --- | --- | --- | --- | --- |
| Plantage, boucle, mémoire | redémarré, délai, Job | rattrapés, bornés | dépend du moteur de rendu | comme A, et B pour les modules |
| Réseau, disque, `fence` | déclarés, non appliqués | appliqués | appliqués (CSP, origine opaque) | appliqués pour le déclaratif et le WASM, déclarés pour le process |
| Secrets, projets privés | appliqués (ce qui passe par Escouade) | appliqués | appliqués | appliqués |
| Coût d'un appel | 43 µs | 11 ns | `postMessage` | — |
| Langages | tous | Rust, Go, C ; JS et Python avec un interpréteur | JS | tous |
| Débogage | ordinaire | au journal | DevTools | ordinaire |
| Vit sans fenêtre | oui | oui | non | oui |
| Coût pour Escouade | faible | moyen à fort | moyen | faible en 2.1, moyen ensuite |

### 2.4 La recommandation

**D : un protocole des plugins en JSON-RPC 2.0, servi en 2.1 par un process à côté (A), avec une interface déclarée (D1) et un niveau déclaratif sans code (D4) ; un runtime WASM du même protocole plus tard (D3), puis des vues libres en iframe isolée (D2).**

Pourquoi :

1. **C'est ce qu'Escouade sait déjà faire.** Ses cinq harness et son serveur MCP sont des process en JSON-RPC ou proches ; ses tests reposent sur des faux process et un banc de conformité ; ses Job objects tuent un arbre entier. Le socle coûte le moins, et le banc des plugins se calque sur celui des harness.
2. **Les points qui valent le plus ont besoin du système.** Un harness est un process ; un webhook, une source du Kanban, un hébergeur ont besoin du réseau ; une notification ou un environnement de lancement lancent des commandes. En WASM, il faudrait les rouvrir par des fonctions de l'hôte, et le bac à sable n'aurait plus grand-chose à garder.
3. **Les auteurs écrivent en TypeScript et en Python**, ceux des agents et des serveurs MCP. Un process les accueille sans interpréteur embarqué, avec leur débogueur.
4. **L'honnêteté plutôt qu'un faux bac à sable** : un plugin en process a les droits de l'utilisateur, comme chez VS Code, Obsidian, JetBrains et Claude Code. Escouade le dit avant l'installation, applique ce qu'il peut (les faits, les secrets, les projets privés, les outils MCP), et réserve le niveau « sans crainte » au déclaratif, puis au WASM.
5. **L'interface déclarée garde le design** : chaque contribution est rendue par les composants d'Escouade, dans les deux langues, aux règles de `DESIGN.md`, sans HTML d'un tiers dans la fenêtre qui a l'IPC. Les vues libres attendent d'avoir été essayées sous WebKit.
6. **Le WASM reste ouvert** : comme le protocole ne dépend pas du transport, un runtime WASM s'ajoutera sans changer l'API des plugins, pour ceux qu'un projet peut proposer sans risque.

## 3. Le modèle de confiance et de distribution

### 3.1 Le manifeste

Un fichier `escouade-plugin.json` à la racine du dossier du plugin (du JSON, comme `package.json`, `plugin.json` de Claude Code et les schémas de `schemas/` ; un schéma publié pour l'autocomplétion) :

```json
{
  "$schema": "https://escouade.dev/schemas/plugin-1.json",
  "id": "dev.exemple.slack",
  "name": "Slack",
  "version": "1.2.0",
  "description": { "fr": "Les tickets à tester et les agents qui attendent, dans un salon Slack.", "en": "…" },
  "author": { "name": "Exemple", "url": "https://exemple.dev" },
  "license": "MIT",
  "repository": "https://github.com/exemple/escouade-slack",
  "escouade": { "api": "1", "min": "2.1.0" },
  "run": { "command": "bin/escouade-slack", "windows": "bin/escouade-slack.exe" },
  "activation": ["event:ticket.column", "event:agent.waiting"],
  "permissions": {
    "events": ["ticket.*", "agent.waiting"],
    "network": ["hooks.slack.com"],
    "secrets": ["webhook"]
  },
  "contributes": {
    "settings": [{ "key": "channel", "type": "string", "title": { "fr": "Salon", "en": "Channel" } }],
    "secrets": [{ "key": "webhook", "title": { "fr": "Adresse du webhook", "en": "Webhook URL" } }]
  }
}
```

- `id` : unique, en nom de domaine inversé (pas de collision entre deux auteurs) ; `name` et `description` dans les deux langues, l'anglais par défaut ;
- `escouade.api` : la version **majeure** du protocole qu'il parle ; `min` (et `max` facultatif) : les versions d'Escouade où il a été essayé. Un plugin d'une API que l'app ne sert plus est désactivé, et la raison montrée, comme une version trop ancienne d'un harness (`Tested`, `oldest_reason`) ;
- `run` : facultatif. Sans lui, le plugin est **déclaratif** : rien ne s'exécute ;
- `activation` : ce qui le démarre (un fait, une commande, l'ouverture des réglages) ; sans activation, il ne tourne pas ;
- `permissions` : ce qu'il demande, montré avant l'installation (§3.4) ;
- `contributes` : ses points d'extension (`themes`, `harnesses`, `webhooks`, `menus`, `statusBar`, `badges`, `settings`, `secrets`, `commands`, `projectTemplates`, `escouadeYml`…), chacun avec son schéma.

### 3.2 L'installation, la signature, la mise à jour

- **2.1.0 : un dossier local, et un dépôt git** (une URL et une étiquette, `git clone --depth 1` dans le dossier des plugins de l'app, `DataDir`) ; le dossier d'un plugin en développement est chargé en place et rechargé à chaque changement (comme `--plugin-dir` de Claude Code).
- **Plus tard, un registre** : une liste dans un dépôt public (comme les places de marché de Claude Code, un `marketplace.json`, ou le dépôt d'extensions de Raycast, avec une revue par PR et une CI qui valide le manifeste), affichée sur escouade.dev et dans l'app.
- **L'intégrité** : chaque version installée est fixée par son empreinte (le commit git, ou le SHA-256 de l'archive) ; une mise à jour change l'empreinte et redemande l'accord si les permissions ont grandi.
- **La signature** : pas en 2.1.0. Avec le registre, une signature de l'archive par Escouade après la revue (minisign, comme `latest.json` de l'updater de Tauri, ou Sigstore), vérifiée à l'installation. Un plugin hors du registre reste installable, marqué « non vérifié ».
- **La mise à jour** : jamais en silence. Escouade cherche une nouvelle étiquette à son démarrage, la montre dans Réglages › Plugins, et l'installe sur un clic ; une version refusée laisse la précédente en place.

### 3.3 L'activation, les projets privés et `.escouade.yml`

- **Installé** n'est pas **activé**. Un plugin s'active pour toute l'app, ou projet par projet ; par défaut, pour tous les projets **sauf les projets privés**.
- **Un projet privé** (ESC-140) : un plugin ne l'atteint que s'il y est activé un par un. Ses faits, ses tickets, ses statistiques, ses textes ne vont pas aux autres plugins ; un plugin client du serveur MCP le voit comme un agent d'un autre projet (`Sight`), c'est-à-dire pas du tout. Ce qu'Escouade ne peut pas garantir (un process qui lit le disque), Réglages › Plugins le dit en face du projet privé.
- **Un projet qui propose un plugin** : `.escouade.yml` gagne une clé `plugins.recommended` (des identifiants et une source), comme les extensions recommandées de VS Code. Escouade le **propose**, n'installe ni n'active rien seul : un dépôt cloné ne doit pas pouvoir lancer un programme. Un plugin déclaratif (ou WASM, plus tard) peut s'activer après un clic ; un plugin avec un programme demande l'accord complet, comme une installation. Ses réglages propres vont sous `plugins.<id>.*` (§1.11), validés par son schéma, jamais un secret.

### 3.4 Ce que l'utilisateur voit, et ce qu'il retire

Avant l'installation, une fenêtre dit, en mots : qui l'a fait et d'où il vient (dépôt, empreinte, « non vérifié »), ce qu'il ajoute (ses contributions), et ce qu'il pourra faire, permission par permission, la plus forte d'abord :

- **« Lance un programme sur votre ordinateur, avec vos droits »** (tout plugin avec `run`) ;
- « Décide des autorisations de vos agents » (en rouge) ;
- « Ajoute des consignes à vos agents », « Ajoute des outils à vos agents » ;
- « Agit sur vos projets » (crée des tickets, lance des agents) ou « Lit vos projets » ;
- « Reçoit ces événements : … » ;
- « Se connecte à : hooks.slack.com » (déclaré) ;
- « Garde un secret : Adresse du webhook ».

Après : désactiver (pour l'app ou un projet), retirer une permission (le plugin continue sans elle, ou s'arrête s'il ne peut pas), désinstaller (son dossier, ses réglages et ses secrets effacés, avec une case pour garder ses données) ; et le **journal** de chaque plugin : ses démarrages, ses plantages, ses appels, les autorisations qu'il a décidées.

### 3.5 Les secrets

Les secrets d'un plugin vont au coffre d'Escouade (`integrations/secrets.rs`, `SecretStore` : le trousseau du système, un fichier dans le bac à sable des tests), sous un nom à lui (`plugin:<id>:<clé>`), saisis dans les champs qu'il déclare (`contributes.secrets`), jamais dans `.escouade.yml` ni dans ses réglages en clair. Il les obtient par le protocole, au moment où il en a besoin (`secrets/get`), seulement les siens ; jamais ceux d'un autre plugin, d'un compte, d'un harness ou d'une intégration. Le texte d'une erreur les masque, comme les déclarations du serveur MCP le font déjà (`add_declaration`, `secrets`).

### 3.6 La télémétrie

Rien de neuf sans accord. Si l'utilisateur a accepté les statistiques d'usage (`telemetry.rs`), Escouade compte les fonctions des plugins comme les autres (« un plugin installé », « un plugin activé », sans son nom tant qu'il n'est pas dans le registre). Un plugin n'a pas accès à la télémétrie d'Escouade ; s'il envoie ses propres statistiques, c'est une permission réseau qu'il déclare et que l'utilisateur voit.

## 4. Sources

- VS Code, _Workspace Trust_ : <https://code.visualstudio.com/docs/editor/workspace-trust> et le guide des extensions <https://code.visualstudio.com/api/extension-guides/workspace-trust>.
- VS Code, les _webviews_ (iframes d'une autre origine, service workers) : <https://blog.mattbierner.com/vscode-webview-web-learnings/>.
- Zed, les extensions en WebAssembly (WIT, wasmtime, une API par version) : <https://zed.dev/extensions/wit> et « Life of a Zed extension » (blog de Zed, résumé sur <https://www.plushcap.com/content/zed/blog/life-of-a-zed-extension-rust-wit-wasm>).
- Obsidian, la sécurité des plugins : <https://obsidian.md/help/plugin-security>.
- Raycast, le manifeste, la sécurité et la publication : <https://developers.raycast.com/information/manifest>, <https://developers.raycast.com/information/security>, <https://developers.raycast.com/basics/prepare-an-extension-for-store> ; le réconciliateur React vers AppKit : <https://developers.raycast.com/faq>.
- JetBrains, les plages de versions et le _Plugin Verifier_ : <https://plugins.jetbrains.com/docs/intellij/build-number-ranges.html> ; la signature : <https://blog.jetbrains.com/platform/2020/09/plugin-signing-in-marketplace/>.
- Claude Code, le manifeste des plugins : <https://code.claude.com/docs/en/plugins-reference>.
- Tauri, les capabilities : <https://v2.tauri.app/security/capabilities/> ; les iframes et l'IPC : CVE-2024-35222.
- MCP Apps (SEP-1865), des vues en iframe isolée : <https://modelcontextprotocol.io/extensions/apps/overview>, <https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/>.
- Extism, les limites de mémoire, de temps et les hôtes permis : <https://extism.org/docs/concepts/runtime-apis>.
- Escouade : `docs/ENGINES.md` (les traits, le registre, le banc, « Ajouter un moteur »), `docs/PROTOCOL.md`, `docs/SPEC.md`.
