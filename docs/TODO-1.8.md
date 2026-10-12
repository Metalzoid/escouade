# Escouade 1.8 — à faire

Un chantier : Codex, OpenCode et GitHub Copilot CLI comme moteurs d'agents, à côté de Claude Code.

- L'avancée d'un agent qui exécute un plan (tâches, sous-agents, ce qui est en cours, essai avec superpowers), d'abord notée ici, est passée dans la 1.7 : voir `docs/TODO-1.7.md`, chantier 5.
- Une seule forme d'infobulle dans toute l'app, d'abord notée ici, est passée dans la 1.7.1 : voir `CHANGELOG.md`.

Fait pour la 1.8 :
- [x] **Vue Claude Code** (2026-10-12) : un agent peut tourner dans l'interface de Claude Code elle-même, dans un terminal, à la place de la conversation d'Escouade (bouton de l'en-tête, réglage pour les nouveaux agents). Escouade le suit par ses hooks HTTP et son transcript. Voir `docs/PROTOCOL.md`, « Vue Claude Code ».
  - [ ] À essayer sous Windows (ConPTY, `claude.exe` natif) et macOS avec un vrai compte : collage d'un message, Échap, `/clear`, une compaction, un sous-agent.
  - [ ] Le jour où Codex ou Copilot arrivent : leur propre interface en vue terminal, sur le même modèle (hooks ou journal de session).

Aussi pour la 1.8 :
- [ ] **Intégration Linear**, à côté de Jira, Trello et GitHub Issues (`src-tauri/src/integrations/`, sur le modèle de `jira.rs` et `github.rs`) :
  - connexion par clé d'API personnelle (en-tête `Authorization`), gardée dans le trousseau comme les autres (`secrets.rs`) ;
  - lien d'un projet vers une équipe Linear, et éventuellement un projet ou un cycle ;
  - import des issues dans le Kanban, avec leurs critères d'acceptation extraits de la description (`text.rs`), import par étiquette compris (« claude-ready ») ;
  - suivi du statut (les états du workflow de l'équipe : « In Progress », « In Review », « Done ») et commentaires au passage « À tester » puis « Terminé » (`sync.rs`) ;
  - API GraphQL (`https://api.linear.app/graphql`) : un faux serveur pour les tests, comme `fake.rs`, et le réglage de proxy appliqué ;
  - interface : Linear dans Réglages › Intégrations et dans « Importer des tickets », textes fr et en ; site, README et journal.

## Ampleur (estimation du 2026-10-11)

Repère : la 1.7 (cinq chantiers) a fait 266 commits et environ 78 000 lignes ajoutées, tests compris.

| Lot | Part de la 1.7 | Ce qui pèse |
|---|---|---|
| Essais réels (point 0) | ~7 % | Il faut l'utilisateur pour les connexions : compte ChatGPT, clé d'un fournisseur pour OpenCode, compte GitHub avec Copilot. |
| Extraction d'une interface « moteur », avec Claude seul | ~10 % | Refacto de `claude.rs`, `agent.rs` et `core.rs` (lancement, reprise, copie, one-shots), sans changement de comportement. |
| Codex | ~30 % | Client JSON-RPC, traduction du flux, permissions, modes, comptes `CODEX_HOME`, quota, faux `codex`. Le premier moteur essuie les plâtres de l'interface. |
| Copilot CLI | ~20 % | SDK Rust ou client JSON-RPC, traduction de ses 150 types d'événements, permissions typées, comptes `COPILOT_HOME`, crédits d'IA, faux `copilot`. |
| OpenCode | ~25 % | Serveur HTTP + SSE par agent, traduction, règles de permission, faux `opencode`. Deux lignes d'API (v1, v2) à départager. |
| Reste commun | ~12 % | Choix du moteur dans l'interface, textes à paramétrer (~100 « Claude » par langue), stats par moteur, one-shots, serveur MCP, docs, site. |

Total : environ la taille de la 1.7, avec plus d'incertitude qu'elle, car les trois protocoles externes bougent vite :
- le protocole de Codex est marqué « expérimental » ;
- une partie des appels de Copilot l'est aussi, et son CLI sort une version tous les deux ou trois jours ;
- OpenCode est à cheval entre une v1 et une v2.

En quota, avec le mode économe (Sonnet pour implémenter et relire), compter les trois quarts d'une semaine d'abonnement Max ou un peu plus. C'est une extrapolation de la 1.7, à revoir après les essais.

**Ordre conseillé et découpe possible** : Codex, puis Copilot, puis OpenCode. Si la 1.8 doit être plus courte, Codex et Copilot d'abord, OpenCode en 1.9.
- Codex et Copilot ressemblent davantage au modèle d'Escouade : un abonnement avec un quota, un bac à sable du système, un exécutable natif sous Windows.
- Copilot lit déjà `CLAUDE.md` et `.claude/skills` : superpowers a des chances d'y marcher tel quel.
- L'API d'OpenCode se stabilise en v2, et sa doc conseille WSL sous Windows.

## 0. À vérifier avant de concevoir (essais jetables, avec les vrais CLI)

Rien de ce qui suit n'a été lancé. Les faits viennent du code source et des docs des trois projets, lus le 2026-10-11 :
- Codex 0.162.1 ;
- OpenCode 1.19.0 et 2.0.26 ;
- Copilot CLI 1.0.95, avec le Copilot SDK 1.0.19.

Chaque essai enregistre ses flux réels dans `tests/fixtures/` (comme `real-run-inline.jsonl`), pour les rejouer dans les tests.

### Codex (`codex app-server`, JSON-RPC sur stdio)
- [ ] **Un tour complet enregistré** : texte, raisonnement, commande, modification de fichier, demande d'approbation, interruption, `update_plan`, un sous-agent (`collabToolCall`), une compaction, la fin d'un tour arrêté par la limite.
- [ ] **Méthodes expérimentales** : environ 40 % des méthodes demandent `capabilities.experimentalApi`. Lister celles dont Escouade a besoin (`thread/fork` ? `item/tool/requestUserInput` ? mode Plan ? `approvalsReviewer` ?), et n'en garder que le strict nécessaire.
- [ ] **Bac à sable, worktree et commit** : en `workspace-write`, dans `<projet>/.claude/worktrees/<agent>`, l'agent peut-il commiter ?
  - Un commit écrit dans `<projet>/.git`, hors du worktree, et Codex protégerait `.git` en lecture seule dans ses dossiers inscriptibles (à vérifier).
  - Faut-il `sandbox_workspace_write.writable_roots` ?
  - Mêmes questions avec le bac à sable Windows (`elevated` / `unelevated` : faut-il une installation avec les droits d'admin ?).
- [ ] **MCP par process** : `-c mcp_servers.escouade.url=…` avec `bearer_token_env_var`. Le jeton passe par l'environnement, jamais par la ligne de commande, que la liste des process montre.
  - `-c mcp_servers.escouade.enabled=false` doit écraser une entrée `escouade` de l'utilisateur.
  - Autre piste : la `config` de `thread/start`.
- [ ] **Consignes ajoutées** (protocole du ticket, aujourd'hui `--append-system-prompt`) : `developerInstructions` de `thread/start` ou `-c developer_instructions=…`. Survivent-elles à une reprise ?
- [ ] **Second compte** : un `CODEX_HOME` à part, connexion (`codex login`, ChatGPT ou code d'appareil), entrée du trousseau propre à chaque dossier. Lire le quota par `account/rateLimits/read` sans lancer de tour, et voir ce qu'un app-server lancé pour ça seulement coûte.
- [ ] **Reprise sur un autre compte** : un `rollout-*.jsonl` copié dans un autre `CODEX_HOME` se reprend-il par `thread/resume` ?
- [ ] **Windows** : lancer le binaire natif, pas le `codex.cmd` de npm (comme `resolve_binary` le fait pour `claude`). Le process et ses enfants restent dans le Job de l'agent.

### Copilot CLI (Copilot SDK, JSON-RPC sur stdio)
- [ ] **SDK Rust ou client maison** : la crate `github-copilot-sdk` (1.0.19, « generally available », Rust 1.94 au moins) parle à `copilot --server --stdio` en JSON-RPC 2.0, avec des en-têtes `Content-Length` comme LSP.
  - Ces options du CLI sont internes au SDK : elles ne sont pas dans sa référence publique.
  - Questions pour la crate : laisse-t-elle Escouade lancer le process elle-même (Job de l'agent, environnement du compte, CPU et RAM par agent) ? Et la désactivation de sa fonction `bundled-cli` (qui télécharge le CLI à la compilation), pour pointer vers le `copilot` installé ?
  - Sinon, un client JSON-RPC maison écrit d'après son schéma.
  - Le `rust-version` du `Cargo.toml` passerait de 1.88 à 1.94 (la toolchain épinglée, 1.98, suffit).
- [ ] **Pipes sous Windows** : l'issue github/copilot-cli#3188 (sortie en code 1, flux vides quand stdout est un tube, vue en 1.0.44) est-elle réglée en 1.0.95 ? Le SDK passe par des tubes.
- [ ] **Un tour complet enregistré** :
  - texte et raisonnement (`assistant.message_delta`, `assistant.reasoning_delta`) ;
  - outils (`tool.execution_*`, `tool.shell_output`) et diff d'une écriture ;
  - `permission.requested` pour un shell, une écriture, une URL, un outil MCP ;
  - une question (`user_input.requested`, `elicitation.requested`) ;
  - le mode plan et `exit_plan_mode.requested` ;
  - un sous-agent (`subagent.*`), `session.todos_changed` puis la lecture des tâches, une compaction, `abort`, `assistant.usage`.
- [ ] **Noms des outils** de Copilot (shell, écriture, lecture…), relevés dans ces flux, pour leur correspondance avec ceux de Claude Code.
- [ ] **Modes** : ce que font vraiment les modes de permission `manual`, `assisted` (un modèle recommande) et `allow-all`, et les modes d'agent `interactive`, `plan` et `autopilot`. Lequel correspond au mode « Auto » d'Escouade ?
- [ ] **Bac à sable** (`--sandbox`, ouvert à tous depuis la 1.0.93, Windows compris) : même question que pour Codex sur le commit depuis un worktree.
- [ ] **Consignes ajoutées** : un message système à ajouter à la création de session (à trouver dans le SDK). Survit-il à `resume_session` ?
- [ ] **Quota** : depuis le 2026-06-01, Copilot facture en crédits d'IA (1 crédit = 0,01 $, au tarif des API), sauf les abonnements annuels d'avant, qui gardent les requêtes premium.
  - Lire `account.getQuota` (expérimental) et les `quotaSnapshots` d'`assistant.usage` sur un vrai compte : unités, `remainingPercentage`, `resetDate`, drapeau `token_based_billing`.
  - Les limites par session et par semaine (Pro et Pro+, depuis le 2026-04-20) ont-elles une API, ou seulement `/usage` ?
- [ ] **Coût d'un tour** : la conversion des nano-AIU (`copilotUsage.totalNanoAiu`) en dollars, que la doc dit de vérifier avant de l'afficher.
- [ ] **Second compte** : un `COPILOT_HOME` à part et `copilot login`. La connexion va dans le trousseau du système : chaque dossier y a-t-il son entrée ? Autre piste : un jeton par session (`github_token` du SDK, `COPILOT_GITHUB_TOKEN`).
- [ ] **MCP par process** : `--additional-mcp-config @<fichier privé>` (vaut pour la session, remplace une entrée du même nom) et `--disable-mcp-server escouade` ; ou `mcpServers` à la création de session.
- [ ] **Reprise et copie** : `resume_session` ; la copie à un événement donné (`sessions().fork(id, to_event_id)`, expérimental) ; `history.truncate`.

### OpenCode (`opencode serve`, HTTP + SSE)
- [ ] **Quelle ligne** : la v1.19 (`opencode-ai`, l'API documentée) ou la v2 (`@opencode/cli`, API refaite sous `/api/*`, « Experimental HttpApi surface »).
  - Les deux prennent la commande `opencode` et ne coexistent pas.
  - Regarder ce que donne aujourd'hui l'installation officielle, puis décider.
  - Escouade supporte une ligne en 1.8 et reconnaît l'autre pour dire qu'elle n'est pas prise en charge.
- [ ] **Un serveur par agent ou par projet** : un serveur par agent garde le CPU et la RAM par agent, l'arbre de process tué d'un coup et l'environnement propre au compte. Mesurer la mémoire d'un serveur inactif et son temps de démarrage. Vérifier le port libre (`--port 0` ?) et le mot de passe (`OPENCODE_SERVER_PASSWORD`).
- [ ] **Un tour complet enregistré** : deltas, outils, `patch`, permission, question, `todo.updated`, sous-agent (outil `task`, session enfant), `abort`, erreur.
- [ ] **Message pendant un tour** (v1) : mis en file, refusé, ou il interrompt ?
- [ ] **Config par process** :
  - `OPENCODE_CONFIG_CONTENT` se fusionne-t-il avec la config de l'utilisateur ?
  - `{env:ESCOUADE_MCP_TOKEN}` marche-t-il dans un en-tête ?
  - `enabled:false` écrase-t-il une entrée de l'utilisateur ?
- [ ] **Consignes ajoutées** : le champ `system` d'un prompt, ou un agent déclaré dans la config du process.
- [ ] **Windows natif** : dossier des données, shell de l'outil `bash` (Git Bash ?), marche sans WSL (la doc recommande WSL).
- [ ] **Pas de bac à sable** du système (rien trouvé dans la doc) : à confirmer dans le code. Sans lui, seules les règles de permission protègent.
- [ ] **Modèles** : liste des seuls fournisseurs connectés, fenêtre de contexte de chaque modèle, `variant` (effort) quand le modèle en a.

## 1. Codex, Copilot CLI et OpenCode, à côté de Claude Code

But : un agent tourne sur Claude Code, Codex, Copilot CLI ou OpenCode. Le reste d'Escouade ne change pas pour autant : conversation, Kanban et pilote auto, worktrees, git, lancements de test, stats, serveur MCP.

### Ce qu'on sait (2026-10-11, sans essai réel)

| | Claude Code (aujourd'hui) | Codex 0.162 `app-server` | Copilot CLI 1.0.95 (SDK) | OpenCode 1.19 `serve` |
|---|---|---|---|---|
| Transport | JSONL sur stdio | JSON-RPC (JSONL) sur stdio, « expérimental » | JSON-RPC à en-têtes `Content-Length` sur stdio ; SDK Rust « GA », une partie des appels expérimentale | HTTP + SSE, OpenAPI 3.1 |
| Deltas | `stream_event` | `item/agentMessage/delta`, `item/reasoning/*Delta`, `outputDelta` | `assistant.message_delta`, `assistant.reasoning_delta`, `tool.shell_output` | `message.part.delta` |
| Permissions | `can_use_tool` | `item/commandExecution\|fileChange\|permissions/requestApproval` | `permission.requested` typé (shell, write avec diff, read, mcp, url…), 7 réponses | `permission.asked` → `once` / `always` / `reject` |
| Question à l'utilisateur | `AskUserQuestion` | `item/tool/requestUserInput` (mode Plan seulement, sauf drapeau) | `user_input.requested`, `elicitation.requested` (formulaire) | `question.asked` |
| Modes | 5 modes | politique d'approbation × bac à sable, `auto_review`, mode Plan | `manual` / `assisted` / `allow-all`, modes `plan` et `autopilot` | agents `plan` / `build`, règles par outil |
| Bac à sable du système | non | oui (3 niveaux, Windows compris) | oui (`--sandbox`, Windows compris) | non trouvé |
| Interruption / message en cours de tour | `interrupt` / file | `turn/interrupt` / `turn/steer` | `abort` / `immediate` ou `enqueue` | `abort` / file en v2 seulement |
| Modèle, effort à chaud | `set_model` | au `turn/start` suivant | `model.switchTo` (effort compris) ; modèles Claude, GPT, Gemini | par prompt (`model`, `variant`) |
| Reprise / copie | `--resume` / `--fork-session` à une entrée | `thread/resume` / `thread/fork` à un tour | `resume_session` / `fork` à un événement (expérimental) | session / `fork` à un message |
| Coût | `total_cost_usd` | aucun | tokens et nano-AIU par appel | `cost` par message |
| Quota d'abonnement | `rate_limit_event`, `get_usage` | `account/rateLimits/*` (deux fenêtres en %, durée en minutes) | crédits d'IA du mois (`account.getQuota`, expérimental) ; limites de session et hebdo sans API connue | aucun |
| Comptes | `CLAUDE_CONFIG_DIR` | `CODEX_HOME` | `COPILOT_HOME`, ou un jeton par session | une config (XDG, `OPENCODE_CONFIG_DIR`, non vérifié) |
| MCP par process | `--mcp-config` | `-c mcp_servers.…` | `--additional-mcp-config`, `--disable-mcp-server` | `OPENCODE_CONFIG_CONTENT` |
| Tâches / sous-agents | outils de tâches, `Task` | `turn/plan/updated` / `collabToolCall` | `session.todos_changed` puis lecture par appel / `subagent.*` | `todo.updated` / outil `task`, sessions enfants |
| Instructions lues | `CLAUDE.md`, `.claude/` | `AGENTS.md` | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.claude/skills` | `AGENTS.md` |
| Commandes `/` pour un client | `initialize` | `skills/list` | aucune (réservées à l'interface du terminal) | `/command`, `/skill` |
| Transcripts | `~/.claude/projects/…/*.jsonl` | `$CODEX_HOME/sessions/…/rollout-*.jsonl` (format interne) | `~/.copilot/session-state/<id>/events.jsonl` | SQLite, schéma non public |

Escouade tient déjà son propre journal normalisé de chaque conversation (`conv.rs`). La recherche, la relecture, les cartes et les stats lisent ce journal, pas les transcripts des CLI, donc les transcripts des autres moteurs n'ont pas à être lus.

### Un moteur par agent
- [ ] `AgentMeta.engine` vaut `claude`, `codex`, `copilot` ou `opencode`. Par défaut, `claude` (les agents d'avant la 1.8). Un agent garde son moteur toute sa vie : une conversation ne change pas de moteur, et sa copie garde le même.
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
  | Copilot | shell, écriture, lecture… (noms relevés au point 0) | leur équivalent chez Claude Code ; les diffs viennent de `detailedContent` et des `fileEdits` des permissions |
  | Copilot | outil MCP (`serverName`, `toolName`) | `mcp__<serveur>__<outil>` |
  | OpenCode | `bash`, `edit`, `write`, `read`, `grep`, `glob`, `list`, `patch`, `webfetch`, `todowrite`, `task` | leur équivalent chez Claude Code |
- [ ] **Process** :
  - Codex : un `codex app-server` par agent.
  - Copilot : un `copilot --server --stdio` par agent (par la crate du SDK si elle laisse Escouade lancer le process, voir point 0).
  - OpenCode : un `opencode serve` par agent, sur `127.0.0.1`, avec un port libre et un mot de passe tiré au hasard, sauf si l'essai du point 0 le montre trop coûteux. Le backend lit son flux SSE `/event`.
  - Dans tous les cas, le process est dans le Job de l'agent, ce qui garde le CPU et la RAM par agent et tue tout l'arbre d'un coup.
  - L'arrêt pour inactivité et la reprise restent ceux d'aujourd'hui (`thread/resume`, `resume_session`, ou session rouverte par son id).
- [ ] **Versions** :
  - Chaque moteur a une plage de versions testées. Une version plus ancienne est refusée avec sa raison. Une plus récente est acceptée avec un avertissement (« Codex 0.170 n'a pas été testé avec Escouade »).
  - La lecture tolère l'inconnu : champs ignorés, et une notification ou un élément inconnu est écarté sans casser le tour.
  - Les schémas des versions testées sont gardés dans le dépôt, et un test vérifie que les champs lus par Escouade y sont : `codex app-server generate-json-schema` pour Codex, le schéma du protocole du SDK pour Copilot.

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
  - Copilot : `models.list`, avec ses efforts, ses capacités et son multiplicateur de facturation (écrit à côté du modèle : un modèle qui coûte trois fois plus le dit).
  - OpenCode : les modèles des seuls fournisseurs connectés, avec une recherche et des favoris dans les réglages, car la liste peut être longue.
- [ ] **Effort** : celui du modèle choisi (efforts de raisonnement de Codex et de Copilot, `variant` d'OpenCode). Le menu est masqué si le modèle n'en a pas.
- [ ] **Modes** : Escouade garde ses cinq modes. Chaque moteur dit lesquels il prend et comment. Le titre du mode dans le menu explique ce qu'il veut dire pour ce moteur, bac à sable compris. À confirmer par les essais :

  | Escouade | Codex | Copilot | OpenCode |
  |---|---|---|---|
  | Plan | mode Plan, bac à sable `read-only` | mode `plan` | agent `plan` |
  | Demander | `on-request`, `workspace-write` | `manual` | agent `build`, `edit` et `bash` en `ask` |
  | Accepter les modifications | `workspace-write` : les écritures du bac à sable passent, une commande qui en sort demande | `manual`, les demandes `write` du dossier de l'agent acceptées d'office (ou `--allow-tool write`) | `edit` en `allow`, `bash` en `ask` |
  | Auto | `on-request` + `approvalsReviewer: auto_review` | `assisted` ou `autopilot` (voir point 0) | absent (masqué) |
  | Sans permissions | `never`, `danger-full-access` | `allow-all` | tout en `allow` |
- [ ] **Changement à chaud** : avec Codex, il vaut à partir du tour suivant (`turn/start`). Avec Copilot, tout de suite (`model.switchTo`, `mode.set`). Avec OpenCode, à chaque prompt. Le menu le dit quand un tour est en cours.
- [ ] **Commandes `/`** :
  - Claude : comme aujourd'hui.
  - Codex : ses skills (`skills/list`), envoyés comme élément `skill`.
  - Copilot : aucune n'est offerte à un client (celles de son terminal restent dans son terminal). Celles qui ont un appel à elles (compacter, par exemple) deviennent des actions d'Escouade.
  - OpenCode : `/command` et `/skill`.
- [ ] **Suggestions `@`** : l'index de fichiers d'Escouade (celui de « Ouvrir un fichier ») pour les autres moteurs.
- [ ] **Pièces jointes** :
  - Images : quand les modalités du modèle les acceptent (pièce jointe `file` ou `blob` chez Copilot).
  - PDF : Codex ne les lit pas. Le bouton le dit et les refuse. Avec Copilot et OpenCode, ça dépend du modèle (à vérifier).
  - Documents texte : collés comme texte.
- [ ] **Message pendant un tour** :
  - Codex : « maintenant » passe par `turn/steer`.
  - Copilot : « maintenant » passe par `immediate`, « ensuite » par `enqueue`.
  - Ailleurs, Escouade met le message en file jusqu'à la fin du tour, et c'est le cas pour OpenCode v1 si l'essai le demande.

### Permissions et questions
- [ ] **Codex** :
  - Une commande donne une carte « Codex veut lancer : <commande> », avec son dossier et sa raison.
  - Une modification de fichier donne une carte avec son diff.
  - `item/permissions/requestApproval` donne une carte qui dit ce qui est demandé.
  - Boutons : « Autoriser » (`accept`), « Pour cette session » (`acceptForSession`), « Refuser » (`decline`).
- [ ] **Copilot** : `permission.requested` donne une carte selon son `kind`.
  - Shell : la commande entière et les chemins qu'elle touche.
  - Écriture : le diff.
  - Lecture et URL : le chemin ou l'adresse.
  - MCP : le serveur, l'outil, et s'il ne fait que lire.
  - Boutons : « Autoriser » (`approve-once`), « Pour cette session » (`approve-for-session`), « Refuser » (`reject`).
  - `approve-permanently` et `approve-for-location` (écrits dans la config de Copilot) : à proposer ou non, voir « Décisions ».
- [ ] **OpenCode** : `permission.asked` donne une carte. Boutons : « Autoriser » (`once`), « Toujours » (`always`, qui écrit le motif retenu, `patterns`), « Refuser » (`reject`, avec le message saisi).
- [ ] **Questions** : la carte de question existante reçoit :
  - Codex : `item/tool/requestUserInput` (options, « Autre », champ secret masqué). Ces questions n'arrivent qu'en mode Plan : le dire dans la doc.
  - Copilot : `user_input.requested` (choix et réponse libre) et `elicitation.requested` (un formulaire de plusieurs champs, qui demande une carte un peu plus riche).
  - OpenCode : `question.asked`.
- [ ] **Fin d'un plan** : chez Copilot, `exit_plan_mode.requested` (résumé, plan, actions proposées) devient la carte « Plan à approuver » qu'Escouade montre déjà pour Claude.
- [ ] Les notifications, la liste « À répondre » de la vue d'ensemble et le pilote auto ne changent pas : ils lisent les demandes normalisées.

### Plan, tâches, sous-agents (bandeau « Plan » de la 1.7)
- [ ] **Codex** : `turn/plan/updated` (les étapes d'`update_plan` et leur statut) donne les tâches, `collabToolCall` les sous-agents.
- [ ] **Copilot** : `session.todos_changed` dit que les tâches ont changé, puis Escouade les lit (`plan.readSqlTodosWithDependencies`, dépendances comprises). Les sous-agents viennent de `subagent.*` et de l'`agentId` de chaque événement.
- [ ] **OpenCode** : `todo.updated` (`pending`, `in_progress`, `completed`, `cancelled`) donne les tâches. L'outil `task` et les sessions enfants donnent les sous-agents, avec leurs tokens et leurs outils.
- [ ] Les fichiers de plan (superpowers) se lisent sur le disque comme aujourd'hui, quel que soit le moteur. Faire un essai réel avec superpowers sous Codex et sous Copilot (qui lit `.claude/skills`).

### Comptes et quotas
- [ ] « Comptes Claude » devient « Comptes », groupés par moteur.
- [ ] **Comptes Codex** : un compte est un `CODEX_HOME`.
  - Principal est `~/.codex`, lancé sans toucher à la variable, comme pour Claude.
  - Les autres sont dans `~/.escouade/codex/<nom>`. « Ajouter un compte » ouvre un terminal intégré avec `codex login`.
  - Ce qui se partage (`config.toml`, `AGENTS.md`, skills) est proposé par lien ou par copie. `auth.json` n'est jamais copié.
- [ ] **Comptes Copilot** : un compte est un `COPILOT_HOME`.
  - Principal est `~/.copilot`, lancé sans la variable.
  - Les autres sont dans `~/.escouade/copilot/<nom>`, avec `copilot login` dans un terminal intégré.
  - Ce qui se partage : `mcp-config.json`, `copilot-instructions.md`, agents, skills. La connexion n'est jamais copiée.
  - Si le trousseau ne sépare pas les dossiers (point 0) : un jeton par compte, gardé dans le trousseau d'Escouade et passé à la session.
- [ ] **Quota de Codex** :
  - Source : `account/rateLimits/updated` sur un agent vivant. Sinon, `account/rateLimits/read` toutes les 5 min, par un app-server du compte lancé pour ça (voir point 0).
  - Les fenêtres prennent un libellé selon leur durée (`windowDurationMins` 300 → « 5h », 10080 → « 7j » / « W »), avec `usedPercent` et `resetsAt`.
  - Un tour arrêté par la limite (`rateLimitReachedType`) attend la remise à zéro, puis reprend seul, comme chez Claude.
- [ ] **Quota de Copilot** :
  - Une barre « crédits du mois » (`remainingPercentage`, remise à zéro à `resetDate`), lue dans les `quotaSnapshots` de chaque appel, sinon par `account.getQuota`.
  - Les limites par session et par semaine en plus, si le point 0 leur trouve une source.
  - Un tour arrêté parce que les crédits sont épuisés attend la remise à zéro ou le dit (dépassement payant possible selon le plan). Si la session a un plafond (`--max-ai-credits`), son événement `session_limits_exhausted.requested` devient une carte.
- [ ] **Bascule automatique** : entre comptes du même moteur seulement. Les nouveaux agents et tickets partent sur le compte suivant sous le seuil. Reprendre un agent Codex ou Copilot sur un autre compte ne se fait que si l'essai du point 0 l'a permis.
- [ ] **OpenCode** : il n'a pas de quota d'abonnement (il passe par les API des fournisseurs).
  - Un seul compte en 1.8 : sa config par défaut.
  - Pas de barre de quota : la barre d'état montre seulement le coût du jour.
  - Pas de pause au quota pour le pilote auto (voir « Décisions »).
- [ ] **Barre d'état** : le groupe des quotas montre les comptes du moteur de l'agent affiché (sinon, du moteur par défaut du projet). Le panneau des comptes les liste tous, groupés par moteur.

### Coût, tokens, stats
- [ ] **Codex** : les tokens d'un tour sont le `last` de `thread/tokenUsage/updated` (entrée, cache lu, cache écrit, sortie, raisonnement). Codex ne donne aucun coût en dollars : il est estimé avec une grille des modèles OpenAI dans `pricing.rs` et marqué « estimé ». Avec un abonnement ChatGPT, c'est un coût théorique, comme celui de Claude avec Max.
- [ ] **Copilot** : les tokens de chaque appel (`assistant.usage`) additionnés par tour. Le coût vient des nano-AIU convertis en dollars (conversion à vérifier au point 0), sinon des prix par token de `models.list`.
- [ ] **OpenCode** : `cost` et `tokens` de chaque message, additionnés par tour.
- [ ] **Fenêtre de contexte** : `modelContextWindow` chez Codex, `session.usage_info` chez Copilot, la limite du modèle chez OpenCode.
- [ ] **Stats** :
  - Une colonne `engine` dans la table des tours (les tours d'avant valent `claude`).
  - Un filtre « Tous les moteurs / Claude Code / Codex / Copilot / OpenCode », qui se combine avec celui des comptes.
  - Une vue « Par moteur ».

### Serveur MCP d'Escouade
- [ ] **Agents d'Escouade** (réglage « Les agents peuvent utiliser Escouade ») : même jeton par lancement et même oubli qu'aujourd'hui.
  - Codex : `-c mcp_servers.escouade.url=…` et `bearer_token_env_var`, avec le jeton dans l'environnement du process. Réglage désactivé : `-c mcp_servers.escouade.enabled=false`.
  - Copilot : `--additional-mcp-config @<fichier privé>` (comme le `--mcp-config` de Claude : un fichier 0600, oublié à la fin du process), ou `mcpServers` à la création de session. Réglage désactivé : `--disable-mcp-server escouade`.
  - OpenCode : `OPENCODE_CONFIG_CONTENT`, avec une entrée `remote` et l'en-tête `Authorization: Bearer {env:ESCOUADE_MCP_TOKEN}`. Réglage désactivé : `enabled:false`.
- [ ] Leurs appels prennent le nom `mcp__escouade__<outil>` dans la conversation, donc la carte de permission et les libellés des outils d'Escouade marchent tels quels.
- [ ] **« <Moteur> peut piloter Escouade »** (déclaration pour l'utilisateur, après tout le reste) :
  - Codex : une entrée dans le `config.toml` de chaque compte, par `codex mcp add` s'il prend une URL et un en-tête, sinon par une édition qui garde les commentaires (`toml_edit`).
  - Copilot : une entrée dans le `mcp-config.json` de chaque `COPILOT_HOME`.
  - OpenCode : une entrée dans sa config globale (JSONC, commentaires gardés).
  - Le jeton reste en clair dans ces fichiers : le dire, comme pour Claude.

### Textes rédigés par un modèle (one-shots)
- [ ] Aujourd'hui, ces textes passent par Haiku via `claude -p` : nom d'un agent, message de commit proposé, et les autres questions de `ask_claude`. Un utilisateur sans Claude Code doit aussi les avoir.
- [ ] Réglage « Modèle des textes rédigés », avec quatre choix. Mêmes limites qu'aujourd'hui : 90 s, lecture bornée.
  - Claude Haiku : par défaut quand Claude Code est installé.
  - Codex : `codex exec`, petit modèle, bac à sable `read-only`, éphémère.
  - Copilot : `copilot -p … --output-format json`, petit modèle, sans outil (`--available-tools` vide, à vérifier). Le schéma de sa sortie n'est pas documenté : lire la seule réponse finale.
  - OpenCode : `opencode run`, avec le modèle choisi.

### Ce qui reste propre à Claude Code
- [ ] Ces fonctions sont masquées pour les autres moteurs, pas grisées :
  - Remote Control (Copilot envoie à son agent dans le cloud par `/delegate`, une autre fonction, hors de ce chantier).
  - L'avertissement « Claude Code refuserait par défaut ».
  - Les tâches de fond et les workflows.
  - `CLAUDE_CODE_ENABLE_TODO_TOOLS`.
- [ ] La copie d'un agent se fait au dernier tour (Codex), au dernier événement (Copilot) ou au dernier message (OpenCode), qui est le même point que celui de Claude.

### Textes
- [ ] Environ 100 « Claude » par catalogue (fr et en).
  - Ceux qui parlent de l'agent prennent le nom du moteur : « {engine} attend ta réponse ».
  - Ceux qui parlent de Claude lui-même restent (comptes Claude, Remote Control).
  - « Langue des textes rédigés par Claude » devient « … par les agents ».
- [ ] Consignes ajoutées et invites du pilote auto :
  - Codex : `developerInstructions`.
  - Copilot : le message système de la session (point 0).
  - OpenCode : le `system` du prompt.
  - Leur texte ne nomme plus d'outil propre à Claude Code.

### Tests
- [ ] **Faux moteurs** : `fake-codex.mjs` (app-server JSON-RPC), `fake-copilot.mjs` (JSON-RPC à en-têtes `Content-Length`) et `fake-opencode.mjs` (serveur HTTP + SSE), avec leurs `.cmd`. Mêmes scénarios que le faux `claude` : texte, raisonnement, commande avec approbation, modification de fichier, question, interruption, plan, limite, reprise, copie, quota.
- [ ] **Tests unitaires** : chaque traduction (flux réel enregistré → éléments de conversation), la correspondance des modes, l'estimation du coût, le libellé des fenêtres de quota.
- [ ] **e2e** :
  - Un agent sur Codex : message, approbation d'une commande, diff, fin de tour.
  - Le même sur Copilot, puis sur OpenCode.
  - Un ticket lancé sur Codex par le pilote auto.
  - Les stats filtrées par moteur.
- [ ] **Avant la release, un essai réel par moteur** : un vrai compte, un ticket en worktree jusqu'au commit et au merge, un plan avec sous-agents.

### Docs
- [ ] PROTOCOL.md : sections « Codex app-server », « Copilot SDK » et « OpenCode serve » (versions testées, méthodes et événements utilisés, correspondance des modes et des outils).
- [ ] SPEC : section « Moteurs ».
- [ ] README (installation de chaque moteur) et CHANGELOG.
- [ ] Site, en français et en anglais : Escouade pilote Claude Code, Codex, Copilot CLI et OpenCode, avec des captures.

### Décisions à prendre
- [ ] **Ligne d'OpenCode** : v1 ou v2, après l'essai du point 0.
- [ ] **Copilot par la crate du SDK ou par un client maison** : après l'essai du point 0 (lancement du process par Escouade, version épinglée).
- [ ] **« Toujours » chez Copilot** : proposer `approve-permanently` et `approve-for-location`, qui écrivent dans la config de Copilot, ou seulement l'accord pour la session ?
- [ ] **Mot de l'interface** : « Moteur » (proposé) ? « Agent » est déjà pris.
- [ ] **Repli sur un autre moteur** : quand tous les comptes du moteur d'un ticket ont passé le seuil, partir sur un moteur de secours ? Proposé : oui, en option, désactivée par défaut.
- [ ] **Garde-fou d'OpenCode**, qui n'a pas de quota : un budget par jour en dollars, au-delà duquel le pilote auto se met en pause ?

## Ordre proposé

1. Essais du point 0 sur les trois moteurs. Ils décident de la ligne d'OpenCode, de la voie de Copilot (crate ou client maison), du commit sous les bacs à sable de Codex et de Copilot, et de la façon de passer le serveur MCP.
2. Extraction de l'interface « moteur », avec Claude seul, sans changement de comportement.
3. Codex, en deux temps :
   - Lancement, conversation, permissions, questions, modèles et modes, plan.
   - Comptes, quota, stats, serveur MCP.
4. Commun : choix du moteur dans l'interface, textes, one-shots.
5. Copilot, dans le même ordre que Codex.
6. OpenCode, dans le même ordre.
7. Déclaration du serveur MCP dans les configs des trois moteurs, puis docs et site.
