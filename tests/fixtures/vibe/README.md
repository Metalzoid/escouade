# Flux de Mistral Vibe 3.0.3 (ESC-265)

Enregistrés le 2026-10-28 contre le vrai `vibe-acp` / `vibe-app-server`, avec un `VIBE_HOME` jetable. Une ligne JSON par message : `{ms, dir, msg}` où `dir` est `out` (client vers Vibe) ou `in` (Vibe vers le client), `ms` le temps depuis le premier message. Chemins remplacés par `<ESSAI>` et `<HOME>` ; stderr, jetons et données de compte absents ; `available_commands_update` vidé (`<omis>`). Les résultats sont commentés dans `docs/TODO-1.8.md`, section « Mistral Vibe ».

| Fichier | Contenu |
|---|---|
| `init-session.jsonl` | `initialize`, `session/new` (modes, `configOptions`), `session/list` |
| `full-turn.jsonl` | un tour : lecture, shell, écriture avec permission (mode `ask`), `usage_update` avec coût |
| `load-fork-reject.jsonl` | `session/load` dans un autre processus, refus de permission répété, `session/fork`, `session/close` |
| `permission-allow-always.jsonl` | options de permission, « Always allow » |
| `todo-subagent.jsonl` | `plan` (tâches), sous-agent `agents.spawn`, sans `elicitation` donc sans question |
| `question-elicitation.jsonl` | `elicitation/create` et sa réponse |
| `cancel-config-options.jsonl` | `session/set_config_option` (thinking, mode), `session/cancel`, tour suivant |
| `mcp-session-new.jsonl` | serveur MCP HTTP déclaré dans `session/new`, outil différé, permission |
| `hooks-deny.jsonl` | un hook `pre_tool` qui refuse un outil |
| `error-invalid-key.jsonl` | erreur -31002 d'une clé invalide (fausse clé) |
| `trust-project-hooks.jsonl` | dossier de confiance : `_trust/status`, hooks du projet |
| `app-server-turn.jsonl` | un tour par `vibe-app-server` (`initialize`, `initialized`, `session/start`, événements) |
