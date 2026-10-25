# Flux réels de Cursor CLI 2026.10.22-27dcf5f (ESC-24)

Enregistrés le 2026-10-25 sous Windows 11, avec le CLI installé par l'installeur de Cursor dans `%LOCALAPPDATA%\cursor-agent` (`versions\2026.10.22-27dcf5f\node.exe` et `index.js`, lancés directement, sans `agent.cmd`), sur un compte Cursor **Free** connecté par `agent login` et le modèle **Auto**. Sauf `init-session.jsonl`, chaque essai avait son propre dossier de config (`CURSOR_CONFIG_DIR` vers un dossier jetable) : la connexion, elle, reste celle de l'utilisateur (`%APPDATA%\Cursor\auth.json`, que `CURSOR_CONFIG_DIR` ne déplace pas). Réponses et conséquences : `docs/TODO-1.8.md`, point 0, « Cursor CLI ». Le relevé du protocole (méthodes, extensions `cursor/*`, `kind` des outils, hooks) est dans `tests/fixtures/engines/cursor-2026.10.22-27dcf5f.acp.json`.

Anonymisés : e-mail (`user@example.com`), nom, identifiants du compte, chemins (`C:\Users\user\AppData\Local\Temp\esc24\…` : un dépôt jetable `repo`, son worktree `wt-agent1` sur la branche `agent1`, le dossier de config `homes\h1`). Allégés : les skills et commandes personnels de l'utilisateur (venus de `~/.claude/skills` et de ses plugins de Claude Code) sont retirés de `available_commands_update` et comptés sur la dernière ligne (`retiresDesFixtures`) ; ceux de Cursor et le skill du dépôt d'essai (`essai-skill`, dans `.claude/skills`) restent.

Le dépôt d'essai avait un `AGENTS.md` (« Réponds toujours en français »), un `CLAUDE.md` (« termine chaque réponse par le mot BANANE ») et un skill dans `.claude/skills` : les trois sont lus.

## `agent acp` (ACP v1, une ligne JSON par message, sur stdio)

Parlé par un client d'essai écrit à la main. Une ligne par message, dans l'ordre : `{"dir": "c2s" | "s2c" | "note" | "stderr", "t": <ms depuis le lancement>, "msg": {…}}`.

- `c2s` : un message du client d'essai (à la place d'Escouade) : requête, réponse à une requête du CLI ;
- `s2c` : un message du CLI : réponse, notification `session/update`, ou requête au client (`session/request_permission`, `cursor/*`) ;
- `note` : un repère de l'essai (`{"turn": …}`, `{"step": …}`, un résultat).

| Fichier | Contenu |
|---|---|
| `init-session.jsonl` | `initialize` (ACP v1, `loadSession`, `list`, `subagents` annoncé parce que le client l'a demandé par `_meta.subagents`, méthode de connexion `cursor_login`), `session/new` (modes `agent`, `plan`, `ask` ; 46 modèles ; `configOptions` `mode` et `model`), `available_commands_update`, `cursor/list_available_models` (modèles et leurs options : contexte, effort, `fast`), `session/list`. Aucun tour. Seul essai fait dans la config de l'utilisateur (avant d'isoler par `CURSOR_CONFIG_DIR`) : remise à l'octet près après |
| `full-turn.jsonl` | un tour complet : `session_info_update` (titre), raisonnement, tâches (`tool_call` `updateTodos` puis `cursor/update_todos`, avec un id), shell (`kind: execute`, `session/request_permission` « Not in allowlist », `rawOutput` `exitCode`/`stdout`/`stderr`), écriture (`kind: edit`) **bloquée par un hook de Claude Code de l'utilisateur** (voir `tui-hook-git-bash.txt`), sous-agent (`tool_call` `task`, `subagent_spawned`, ses outils sous le même `sessionId`, `subagent_state_update`, `cursor/task`) ; le modèle n'a pas eu d'outil de question. Puis un tour annulé : `session/cancel` pendant `sleep 60`, `stopReason: cancelled` |
| `load-modes-model.jsonl` | autre process : `session/load` de la session de `full-turn.jsonl` (l'historique rejoué, `toolCallId` `replay-…`), un tour qui s'en souvient ; `session/set_mode` `plan` (`current_mode_update`), un tour en mode plan (toujours sans outil de question ni de plan) ; `session/set_config_option` `mode` puis `model` (`composer-2.5`) ; le tour suivant ne donne que le texte « Upgrade your plan to continue », avec `stopReason: end_turn` |
| `mcp-allow-always.jsonl` | `session/new` avec un serveur MCP HTTP (`mcpServers`, en-tête `Authorization`) ; le modèle remis à Auto par `set_config_option` (le choix de l'essai précédent était resté dans la config) ; appel de l'outil MCP (`title` `escouade: get_board`, `rawInput` `providerIdentifier`/`toolName`/`args`, permission de `kind: other`) ; « Toujours » (`allow-always`) sur l'outil MCP et sur `git branch` : `Mcp(escouade:get_board)` et `Shell(git branch)` ajoutés au `cli-config.json` du dossier de config |
| `mcp-allow-always-server.jsonl` | le même essai vu du serveur MCP d'essai : `initialize` (client `Cursor`, MCP `2025-11-25`, capacité `elicitation.form`), `GET` du flux, `tools/list`, `tools/call`, tous avec `Authorization: Bearer jeton-essai` |
| `sandbox-flag-commit.jsonl` | `agent --plugin-dir <plugin> --sandbox enabled acp` : `git add` et `git commit` depuis le worktree passent, `echo hors > ../hors-worktree.txt` aussi (rien de confiné) ; chaque commande demande une permission ; ni les hooks ni la règle du plugin (`plugin-hooks.json`) ne sont pris en ACP |
| `sandbox-config.jsonl` | `sandbox.mode: enabled` dans le `cli-config.json` du dossier de config : l'écriture hors du worktree passe encore |
| `midturn-ask.jsonl` | un second `session/prompt` pendant `sleep 20` : le premier finit aussitôt en `stopReason: cancelled`, le second fait son tour ; puis `session/set_mode` `ask` et une écriture demandée, refusée en texte par le modèle (aucun outil lancé) |
| `load-cli-chat.jsonl` | `session/load` d'une conversation ouverte hors ACP (le one-shot de `print-stream-json.jsonl`) : « Session not found » ; `session/list` ne liste que les sessions ACP |

## `agent -p --output-format stream-json` (une ligne JSON par événement)

| Fichier | Contenu |
|---|---|
| `print-stream-json.jsonl` | `--disable-auto-update -p --trust --mode ask --model auto` : `system`/`init` (`apiKeySource: login`, `session_id`, `permissionMode`), `user`, `assistant`, `tool_call` `started`/`completed` (`globToolCall`, `readToolCall`, dont la lecture du skill superpowers des plugins de Claude Code de l'utilisateur), `result` avec **`usage`** (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`). Sans `--trust`, le one-shot refuse un dossier non approuvé (« Workspace Trust Required ») |
| `transcript-print.jsonl` | le journal de ce one-shot, écrit par le CLI dans `~/.cursor/projects/<dossier>/agent-transcripts/<id>/<id>.jsonl` (format proche de celui de Claude Code : `role`, `message.content`, `tool_use`, puis `turn_ended`) |
| `transcript-subagent.jsonl` | le journal du sous-agent de `full-turn.jsonl` (`agent-transcripts/<session>/subagents/<id>.jsonl`) : la session ACP elle-même n'a pas de journal |

## Interface (`agent --resume <id>`, dans un PTY)

| Fichier | Contenu |
|---|---|
| `plugin-hooks.json` | le `hooks/hooks.json` du plugin d'essai (`--plugin-dir`), aussi copié en `.cursor/hooks.json` dans le worktree : une commande pour chacun des 19 événements, qui note son entrée |
| `tui-hooks.jsonl` | les hooks reçus pendant un tour dans l'interface, sans `MSYSTEM` dans l'environnement : `workspaceOpen`, `beforeSubmitPrompt` (`prompt`, `conversation_id`, `transcript_path`), `afterAgentThought` (avec le vrai modèle derrière Auto), `stop` (`status`, **`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`**) et `sessionEnd`. Chaque ligne : `{t, event, input, env}` (`env` : les variables `CURSOR_*` reçues). Les hooks du plugin portent `CURSOR_PLUGIN_ROOT` ; ceux du projet ne l'ont pas |
| `transcript-tui.jsonl` | le journal de ce tour : `agent --resume <id de la session ACP>` a ouvert une conversation **vide** sous le même id (dans `chats/`), sans l'historique d'ACP |
| `tui-hook-git-bash.txt` | l'écran quand `MSYSTEM` est dans l'environnement (Escouade lancé depuis Git Bash) : le CLI lance par Git Bash la commande PowerShell qui enveloppe le hook, le hook échoue et **bloque** le message (« Hook blocked with message ») |
| `tui-usage.txt` | l'écran de `/usage` : offre (Free), date de remise à zéro, part utilisée de l'inclus, d'Auto et de l'API, usage à la demande |
