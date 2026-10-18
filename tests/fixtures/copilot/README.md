# Flux réels de GitHub Copilot CLI 1.0.98 (ESC-23)

Enregistrés le 2026-10-18 sous Windows 11, avec le binaire natif du paquet npm `@github/copilot@1.0.98` (`node_modules/@github/copilot-win32-x64/copilot.exe`), sur un compte **Copilot Free** (200 crédits d'IA par mois, modèle choisi par « auto »). Le jeton était celui du GitHub CLI du poste, passé dans l'environnement du seul process d'essai ; chaque essai avait sa propre `COPILOT_HOME` jetable. Réponses et conséquences : `docs/TODO-1.8.md`, point 0, « Copilot CLI ». Les schémas du protocole (SDK 1.0.22, runtime 1.0.98) sont dans `tests/fixtures/engines/copilot-1.0.98.api.schema.json` et `copilot-1.0.98.session-events.schema.json`.

Anonymisés : jeton (`<jeton>`, y compris celui que rend `account.getAllUsers`), nom du compte (`user`), identifiant d'analyse, chemins (`C:\Users\user\AppData\Local\Temp\esc23\…` : un dépôt jetable `repo` et ses worktrees `wt-agent1` et `wt-agent2`, les `COPILOT_HOME` sous `homes\`). Copilot n'a listé que ses skills intégrés, aucun de l'utilisateur.

Allégés : les événements `model.*` (télémétrie hors du schéma public : `model.model_call_success`, `model.messages_snapshot`…) et `assistant.streaming_delta` (un simple compteur d'octets) sont retirés, et comptés sur la dernière ligne (`retiresDesFixtures`). Les blobs opaques (`reasoningOpaque`, `encryptedContent`, `apiCallId`, `api_id`) valent `<opaque>`. Le prompt système n'est entier que dans `first-turn.jsonl` ; ailleurs, coupé à 600 caractères.

## `copilot --server --stdio` (JSON-RPC 2.0, en-têtes `Content-Length`)

Le protocole du SDK (version 3), parlé par un client d'essai écrit à la main. Une ligne par message, dans l'ordre : `{"dir": "c2s" | "s2c" | "note" | "stderr", "t": <ms depuis le lancement>, "msg": {…}}`.

- `c2s` : un message du client d'essai (à la place d'Escouade) : requête, réponse à une requête du serveur ;
- `s2c` : un message du serveur : réponse, notification `session.event` (`{sessionId, event: {type, data, id, parentId, timestamp, ephemeral?, agentId?}}`), `session.lifecycle`, `host.event`, ou requête au client (`userInput.request`, `exitPlanMode.request`) ;
- `note` : un repère de l'essai (`{"turn": …}`, `{"step": …}`, un compte).

| Fichier | Contenu |
|---|---|
| `quota-models-tools.jsonl` | `connect` (protocole 3), `status.get`, `auth.getStatus` (`authType: env`), `account.getQuota` (`quotaSnapshots` : `chat`, `completions`, `premium_interactions`, `tokenBasedBilling`), `models.list` (vide sur Free), `tools.list` hors session |
| `first-turn.jsonl` | `session.create`, `session.model.list` (vide, avec `modelPriceCategories`), modes, `session.quota.get`, puis un tour : `view`, `apply_patch`, deux `powershell` ; `permission.requested` de type `read`, `write` (avec le diff et `fileEdits`) et `shell`, `assistant.usage`, `session.usage_checkpoint` (`totalNanoAiu`), `session.usage.getMetrics`. Le prompt système entier |
| `full-turn.jsonl` | une session, plusieurs tours : `ask_user` (`user_input.requested` et `userInput.request`), écriture approuvée pour la session ; tâches par l'outil `sql` (`session.todos_changed`, `session.plan.readSqlTodosWithDependencies`), sous-agent `explore` (`subagent.*`, événements avec `agentId`) ; `web_fetch` refusé (`url`, `denied-interactively-by-user`) ; deux outils MCP (`mcp`), un formulaire (`elicitation.requested`) ; `session.abort` pendant `Start-Sleep` (`abort`, `agent.interrupted`) ; mode plan, `exit_plan_mode.requested` refusé deux fois ; `session.history.compact` (`session.compaction_*`) |
| `full-turn-mcp-server.jsonl` | le même essai vu du serveur MCP d'essai (stdio) : capacités du client (`elicitation` `form` et `url`, `sampling`), `elicitation/create` et sa réponse |
| `instructions-modes-abort.jsonl` | `systemMessage` en `append` (consigne suivie), `session.permissions.setMode` `allow-all` (aucune demande), `assisted` refusé sans `--experimental`, `abort` qui tue la commande (compte des `Start-Sleep` avant, pendant, après) |
| `resume-fork.jsonl` | autre process, même `COPILOT_HOME` : `session.resume` sans `systemMessage` (consigne perdue), `sessions.readPersistedEvents`, `sessions.fork` avant le 2e message (`toEventId`), la copie ne connaît que le premier |
| `resume-instructions-again.jsonl` | `session.resume` avec le `systemMessage` repassé : consigne suivie |
| `assisted-autopilot.jsonl` | avec `--experimental` : mode `assisted` (le juge échoue, `assistedApproval.recommendation: error`, la demande revient au client), puis mode d'agent `autopilot` (`session.task_complete`) |
| `sandbox-server.jsonl` | `--disallow-temp-dir`, `settings.json` avec le bac à sable activé : `sandbox.getHostSupport` dit `supported`, mais chaque commande a `sandbox.decision` `backend: unsupported` et `sandboxApplied: false` ; commit depuis le worktree, écriture hors du worktree refusée |
| `mcp-additional-config.jsonl` | `--additional-mcp-config @<fichier>` (entrée HTTP, en-tête `Bearer ${ESCOUADE_MCP_TOKEN}` résolu), `--disable-mcp-server escouade` sans effet en mode serveur, `--disable-builtin-mcps`, `session.model.switchTo` |
| `mcp-session.jsonl` | `mcpServers` de `session.create` qui remplace l'entrée `escouade` de l'utilisateur, `session.mcp.disable` |
| `auth-token-env.jsonl` | `--auth-token-env <variable>` et `--no-auto-login` : authentifié par jeton (`authType: token`) |
| `auth-gh-fallback.jsonl` | ni jeton ni connexion : Copilot prend seul le compte du GitHub CLI (`authType: gh-cli`) ; `account.getAllUsers` rend le jeton (masqué ici) |
| `auth-no-auto-login.jsonl` | ni jeton ni connexion, avec `--no-auto-login` : non authentifié |
| `byok-ollama.jsonl` | `provider` de `session.create` (`type: openai`, `baseUrl` d'Ollama), sans compte GitHub (`--no-auto-login`) : `isByok: true`, coût 0, `aiCreditsStatus: unavailable` |
| `hooks-discover.jsonl` | `hooks.discover` : hooks du `settings.json` et du dossier `hooks/` d'une `COPILOT_HOME` |
| `tui-seed.jsonl` | la session de la vue terminal, créée par le SDK ; les hooks de fichier y tournent aussi |
| `tui-back.jsonl` | la même session reprise par le SDK après `copilot --resume` |

## `copilot -p … --output-format json` (une ligne JSON par événement)

| Fichier | Contenu |
|---|---|
| `sandbox-p-default-policy.jsonl` | `--sandbox` : la commande échoue, la politique par défaut demande `sandbox.userPolicy.network.allowLocalNetwork` sous Windows |
| `sandbox-p.jsonl` | bac à sable activé avec cette politique et `--disallow-temp-dir` : `git add` et `git commit` dans le worktree passent (`sandboxed: true`), l'écriture hors du worktree demande une permission, refusée faute d'utilisateur |

## `copilot --acp --stdio` (ACP, une ligne JSON par message)

| Fichier | Contenu |
|---|---|
| `acp.jsonl` | `{"dir", "t", "msg"}` : `initialize` (ACP v1, `loadSession`, `close` et `list`, méthode de connexion `copilot login` dans un terminal), `session/new` (`configOptions` `mode` et `allow_all`, sans modèle), `available_commands_update` (les commandes `/` de Copilot), un prompt avec l'outil `sql` et `session/request_permission` (`allow_once`, `allow_always`, `reject_once`), `plan` vide, `usage_update` (fenêtre de contexte), puis `session/cancel` pendant `Start-Sleep` (`stopReason: cancelled`) |

## Vue terminal (`copilot --resume <id>` dans un PTY)

| Fichier | Contenu |
|---|---|
| `tui-events.jsonl` | `session-state/<id>/events.jsonl`, écrit au fil de la session : le tour du SDK, `session.resume`, un appel à `gpt-4o-mini` lancé par l'interface (en échec), les `hook.start`/`hook.end`, `permission.requested` répondue dans l'interface (`decisionSource: human_response`), `abort` par Échap, `session.shutdown` |
| `tui-hooks.jsonl` | ce qu'ont reçu les hooks d'essai (`settings.json` et `hooks/escouade.json`) : `userPromptSubmitted`, `sessionStart` (`source: resume`), `preToolUse`, `permissionRequest`, `notification` (`permission_prompt`), `sessionEnd` ; `GH_TOKEN` est dans leur environnement |
| `tui-screen.txt` | ce qu'a affiché l'interface, sans les séquences d'échappement : « Confirm folder trust » au lancement, la demande de permission, l'interruption |
