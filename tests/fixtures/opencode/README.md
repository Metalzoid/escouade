# Flux réels d'OpenCode 1.19.3 et 2.0.32 (ESC-25)

Enregistrés le 2026-10-17 sous Windows 11, avec le binaire natif du paquet npm `opencode-ai@1.19.3` (et `@opencode/cli@2.0.32` pour `v2-turn.jsonl`), Ollama 0.40.5 en local et ses modèles `qwen3-coder:30b` et `gpt-oss:20b`, recréés avec un contexte de 32 768 tokens (`qwen3-coder:30b-32k`, `gpt-oss:20b-32k`). Réponses et conséquences : `docs/TODO-1.8.md`, point 0, « OpenCode ». Le schéma OpenAPI de la 1.19.3 (`GET /doc`) est dans `tests/fixtures/engines/opencode-1.19.3.openapi.json`.

Anonymisés : chemins (`C:\Users\user\AppData\Local\Temp\esc25\repo`, un dépôt jetable avec ses worktrees `wt-agent1` et `wt-agent2`), nom d'utilisateur, et commandes et skills de l'utilisateur (listés par OpenCode, qui lit aussi `~/.claude/skills`).

## `opencode serve` (HTTP + SSE)

Une ligne par échange, dans l'ordre : `{"dir": "c2s" | "s2c" | "note", "t": <ms depuis le lancement>, "msg": {…}}`.
- `c2s` : une requête du client d'essai (à la place d'Escouade), `{"http": <méthode>, "path", "body"}` ;
- `s2c` : sa réponse, `{"status", "path", "body"}`, ou un événement du flux SSE, `{"event": {…}}` (`/event` du dossier du serveur, ou `/global/event`, dont l'enveloppe `{directory, payload}` est dépliée en `{…payload, directory}`) ;
- `note` : un repère de l'essai (`{"turn": …}` ou `{"step": …}`).

Le mot de passe du serveur (`OPENCODE_SERVER_PASSWORD`, Basic `opencode:<mot de passe>`) n'est pas enregistré.

| Fichier | Contenu |
|---|---|
| `full-turn.jsonl` | `qwen3-coder:30b-32k`, une session avec la règle `bash: ask`. Cinq tours : `todowrite` (`todo.updated`, statuts `pending`/`in_progress`/`completed`), `read`, `edit`, deux `bash` avec `permission.asked` (répondues `once` puis `always`), `system` dans le prompt ; l'outil `question` (`question.asked`, réponse) puis `write` et une part `patch` ; l'outil `task` (sous-agent `explore`, session enfant avec ses propres événements) ; `sleep 120` interrompu par `POST /session/:id/abort` (`session.error` `MessageAbortedError`, puis `idle`) ; un modèle inconnu (`session.error` `UnknownError`) |
| `full-turn-gpt-oss.jsonl` | le même scénario avec `gpt-oss:20b-32k` : des appels d'outils en erreur (schéma mal suivi, part `tool` en `status: error`), une permission `external_directory` d'un sous-agent, du raisonnement (`reasoning`) |
| `mid-turn.jsonl` | le shell de l'outil `bash` (Git Bash), une écriture hors du worktree sans demande, puis un second message envoyé pendant une commande du premier tour |
| `config-mcp.jsonl` | quatre serveurs lancés avec `OPENCODE_CONFIG_CONTENT` : une entrée MCP `escouade` dont l'en-tête vaut `Bearer {env:ESCOUADE_MCP_TOKEN}` (`GET /config`, `GET /mcp`), une entrée `escouade` de l'utilisateur écrasée par `enabled: false` (seul, ou avec une entrée complète), et `enabled: false` sans entrée de l'utilisateur |
| `instructions-multidir.jsonl` | `instructions` (un fichier de consignes) passé par `OPENCODE_CONFIG_CONTENT` ; un seul serveur pour deux worktrees (`?directory=`), suivi par `/global/event` |
| `attach.jsonl` | le serveur pendant qu'`opencode attach <url> --session <id> --dir <worktree>` y est branché : permission répondue dans l'interface, puis par l'API, puis un message tapé dans l'interface |
| `attach-tui.txt` | ce qu'a affiché l'interface pendant `attach.jsonl`, sans les séquences d'échappement |
| `models.jsonl` | `GET /config/providers` (fenêtre de contexte, `variants` de `gpt-oss`) et `GET /provider` (`connected`) |

## `opencode acp` (ACP sur stdio)

| Fichier | Contenu |
|---|---|
| `acp.jsonl` | `{"dir", "t", "msg"}`, un message JSON-RPC par ligne : `initialize` (ACP v1), `session/new` (`configOptions` : `model`, `effort`, `mode`), un prompt avec l'outil `task` (l'outil `question` n'existe pas en ACP), un prompt avec `todowrite` et `bash` (`session/request_permission`), `usage_update`, puis `session/cancel` pendant `sleep 60` |

## OpenCode 2 (`@opencode/cli`)

| Fichier | Contenu |
|---|---|
| `v2-turn.jsonl` | même format que `serve`, sur l'API `/api/*` de la 2.0.32 : `POST /api/session` (règle `shell: ask`), `POST /api/session/:id/prompt` (`delivery: steer`), flux `/api/event` (`session.*`, `permission.asked` avec `action`, `resources` et `save`), réponse `decision: once` |
