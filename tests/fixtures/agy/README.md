# Flux d'Antigravity CLI (`agy`) 1.4.9 (ESC-269)

Enregistrés le 2026-10-28 contre le vrai `agy -p`, avec `USERPROFILE`/`HOME` jetable (config isolée), modèle `gemini-3.8-flash-low` (ou `-medium`). Sortie brute de `--output-format stream-json`, **une ligne JSON par événement** (pas de `ms`/`dir` : `agy` n'écrit que sur stdout). Les `init.tools` sont la liste réelle des outils. Aucun jeton, aucune donnée de compte : ni journal (`cli.log` contient l'adresse du compte), ni `google_accounts.json`. Les chemins `C:\tmp\esc269\…` sont ceux de l'essai. Résultats commentés dans `docs/TODO-1.8.md`, section « Antigravity CLI ».

| Fichier | Contenu |
|---|---|
| `01-simple-turn.jsonl` | un tour sans outil : `init`, `step_update` (`user_input`, `agent_response` avec `text_delta` et `usage`), `result` |
| `02-stream-input-two-turns.jsonl` | `--input-format stream-json` : deux tours dans un même processus, un `result` par tour (`num_turns` cumulé) ; entrée dans `stdin-example.jsonl` |
| `03-permission-denied-print.jsonl` | `run_command` sans règle : `step` en `ERROR`, `denied_actions` dans le `result` |
| `04-write-denied-print.jsonl` | idem pour `write_file` (lecture `read_file` sans permission) |
| `05-tools-allowed-by-rules.jsonl` | règles `permissions.allow` du `settings.json` : écriture et commande passent |
| `06-hook-allow-not-enough.jsonl` | hook `PreToolUse` qui répond `allow` : le refus sans surveillance reste |
| `07-mcp-denied-print.jsonl` | outil MCP (`call_mcp_tool`) refusé sans règle `mcp(*)` |
| `08-mcp-allowed-project-config.jsonl` | `.agents/mcp_config.json` du projet, outil MCP autorisé et appelé |
| `09-ask-question-skipped-print.jsonl` | `ask_question` sautée d'office (`step_type: unknown`), pas de question remontée |
| `10-accept-edits-write.jsonl` | `--mode accept-edits` : écriture sans règle |
| `11-plan-mode-artifact.jsonl` | `--mode plan` : le plan est un artefact `plan_*.md` |
| `12-subagent-tasks.jsonl` | `invoke_subagent` : `step_type: subagent`, `subagent_info` (id, transcript) |
| `13-rule-hot-reload-two-turns.jsonl` | une règle écrite dans `settings.json` entre deux tours est prise au second tour |
| `hook-payloads.jsonl` | stdin d'un hook `PreToolUse` |
| `mcp_config.http-header.json` | ce que `agy mcp add -H` écrit (le `${…}` n'est **pas** développé) |
| `tui-permission-prompt.txt`, `tui-usage.txt` | texte de l'interface : demande d'autorisation, `/usage` |

## Interface (`agy` sans `-p`, ESC-272)

Enregistrés le 2026-10-28 contre la vraie interface d'`agy` 1.4.9 dans un pseudo-terminal, avec `USERPROFILE`/`HOME` jetable et `gemini-3.8-flash-low`. Ce que lit la « Vue Antigravity CLI » (`src-tauri/src/agent/agy_tui.rs`) ; résultats dans `docs/PROTOCOL.md`, « Vue Antigravity CLI ».

| Fichier | Contenu |
|---|---|
| `tui-transcript-command-resumed.jsonl` | `brain/<id>/.system_generated/logs/transcript_full.jsonl` : un `run_command` autorisé dans l'interface (« Yes, run command »), puis la conversation reprise par `--conversation` (un `SYSTEM_MESSAGE` de reprise, une réponse) |
| `tui-transcript-question-interrupted.jsonl` | un `ask_question` répondu dans l'interface (`A1: …`), puis un tour arrêté par Échap : sa réponse partielle, sans hook |
| `tui-hook-payloads.jsonl` | l'entrée des hooks de `.gemini/config/hooks.json` (l'événement ajouté en `event`) : `SessionStart` au premier message, `PreInvocation`/`PostInvocation`, `PreToolUse`/`PostToolUse` autour de la question, `Stop` (`NO_TOOL_CALL`) ; rien après Échap |
| `tui-transcript-write.jsonl` | un `write_file` (`Path`, `Content`, `Overwrite`) autorisé dans l'interface, son exécution (« Created file. ») et la réponse |
