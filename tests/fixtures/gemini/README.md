# Flux de Gemini CLI (`gemini` 0.66.0, ACP) (ESC-273)

Étude **sans compte** : l'utilisateur n'a pas de compte Gemini à y consacrer. Deux statuts, dits pour chaque fichier :

- **essayé** : enregistré le 2026-10-28 contre le vrai `gemini --acp` (ou `gemini -p`, ou l'interface) 0.66.0 sous Windows 11, avec un `GEMINI_CLI_HOME` jetable et **sans compte** : soit la vraie erreur d'une session sans compte (`01`), soit un **faux serveur d'API Gemini local** (scripté, `GOOGLE_GEMINI_BASE_URL` + une fausse clé, jamais le réseau) qui répond ce que la doc ou le code prévoient. Les en-têtes de ces flux (`dir` : `c2s` = le client, `s2c` = Gemini) sont ceux **du vrai binaire** ; le **contenu des réponses du modèle est factice** (« ok », « Terminé : … ») et les jetons aussi (1 200 / 20 par appel). Le routeur (`auto`) échoue sur la réponse factice du classificateur, sans conséquence.
- **d'après la doc / le code, à vérifier avec un compte** : écrit à la main d'après `bundle/docs/` et le code de `@google/gemini-cli` ; chaque fichier a une ligne `note` ou `_source` qui dit ce qui reste à voir avec un compte (liste dans `docs/TODO-2.1.md`, « Gemini CLI »).

Aucun jeton, aucune adresse de compte, aucune clé (la fausse clé de l'essai n'est écrite nulle part). Les chemins `C:\tmp\esc273\…` sont ceux de l'essai. La liste des commandes `/` de `available_commands_update` est raccourcie à 3 (`_tronque`). Résultats commentés dans `docs/TODO-1.8.md`, section « Gemini CLI ».

| Fichier | Statut | Contenu |
|---|---|---|
| `01-no-account-session-new.jsonl` | **essayé, vrai** | `initialize` (4 méthodes de connexion), puis `session/new` **sans compte** : erreur `-32000` « Gemini API key is missing or not configured. » ; un `session/prompt` sans `sessionId` : `-32603` |
| `02-simple-turn.jsonl` | essayé (faux serveur) | un tour : `session/new` rend `modes` et `models`, `agent_message_chunk`, `usage_update`, réponse `end_turn` avec `usage` et `_meta.quota` |
| `03-permission-write.jsonl` | essayé (faux serveur) | une écriture en mode `default` : `tool_call` `pending` avec le `diff`, `session/request_permission` (options `proceed_always`, `proceed_once`, `cancel`), `tool_call_update` `completed` |
| `04-permission-reject.jsonl` | essayé (faux serveur) | même demande, réponse `{outcome: cancelled}` : `tool_call_update` `failed` « was canceled by the user », le tour continue |
| `05-permission-shell.jsonl` | essayé (faux serveur) | `run_shell_command` : la permission, `kind: execute`, titre = la commande ; la sortie de la commande **n'est pas** dans `tool_call_update` |
| `06-question-unavailable.jsonl` | essayé (faux serveur) | **pas de question en ACP** : l'outil `ask_user` est exclu (« not found in registry ») |
| `07-tasks-unavailable.jsonl` | essayé (faux serveur) | pas de `write_todos` non plus, et aucun `plan` ACP |
| `08-plan-enter.jsonl` | essayé (faux serveur) | `enter_plan_mode` : permission, puis un `agent_message_chunk` « [MODE_UPDATE] plan » (pas de `current_mode_update`) |
| `09-plan-exit-approval.jsonl` | essayé (faux serveur) | en mode `plan`, `exit_plan_mode` : permission « Requesting plan approval for: <chemin du plan> » (options Allow / Reject, **sans le texte du plan**), « [MODE_UPDATE] default » ; une écriture hors du dossier des plans est refusée |
| `10-cancel.jsonl` | essayé (faux serveur) | `session/cancel` en plein tour : `stopReason: cancelled` (sans `usage`), le prompt suivant marche |
| `11-load-replay.jsonl` | essayé (faux serveur) | `session/load` dans un autre processus : rejoue l'historique (`user_message_chunk`, dont le **contexte de session**, `agent_message_chunk`, `tool_call`), la réponse n'a **pas** de `sessionId` |
| `12-mcp-session-new.jsonl` | essayé (faux serveur MCP) | `mcpServers` de `session/new` (HTTP + en-tête `Authorization`), nom d'outil `mcp_<serveur>_<outil>`, permission MCP (`proceed_always_server`, `proceed_always_tool`, `proceed_once`, `cancel`) ; **seulement avec `GEMINI_CLI_TRUST_WORKSPACE=true`** ; les requêtes reçues par le faux serveur : `mcp-server-requests.jsonl` |
| `13-rate-limit-429.jsonl` | essayé (faux serveur) | un 429 du serveur : erreur JSON-RPC `{code: 429, message}` |
| `14-modes-model-and-missing-methods.jsonl` | essayé (faux serveur) | `session/set_mode` (`yolo` : plus de permission), `session/set_model`, et **`-32601`** pour `session/list`, `session/fork`, `session/close`, `session/set_config_option` |
| `15-fs-proxy.jsonl` | essayé (faux serveur) | client qui annonce `fs` : Gemini demande `fs/read_text_file` / `fs/write_text_file` pour les fichiers du dossier de la session |
| `16-policy-fence-deny.jsonl`, `fence.toml` | essayé (faux serveur) | `--policy fence.toml` : lecture d'un fichier interdit « denied by policy » (idem en `yolo`) |
| `17-thoughts-and-chunks.jsonl` | essayé (faux serveur) | parties `thought` du modèle → `agent_thought_chunk` « **sujet**\ndescription » |
| `18-subagent-yolo.jsonl` | essayé (faux serveur) | `invoke_agent` : `tool_call` « Delegating to agent 'generalist' », `kind: think`, sans les outils du sous-agent (en mode `default` : « denied by policy », sans permission) |
| `hook-payloads-acp.jsonl` | essayé (faux serveur) | stdin des hooks `BeforeAgent`, `AfterAgent`, `SessionEnd` d'une session ACP (**ni `SessionStart` ni `BeforeTool`/`AfterTool`** en ACP) |
| `headless-stream-json.jsonl`, `headless-json.json`, `headless-no-account.txt` | essayé (faux serveur ; l'erreur sans compte est vraie) | `gemini -p -o stream-json` / `-o json`, et l'erreur sans compte (code de sortie 41) |
| `settings.mcp-http-header.json` | essayé | ce que `gemini mcp add -s user -t http -H 'Authorization: Bearer $ESC_TOKEN'` écrit : la variable **n'est pas développée à l'écriture** (littérale dans le fichier), **développée au lancement** |
| `tui-resume.txt` | essayé (faux serveur) | `gemini --resume latest` (pty) reprend une session créée par ACP |
| `20-authenticate-oauth-expected.jsonl` | **doc / code, à vérifier avec un compte** | `authenticate` par `oauth-personal` |
| `21-turn-streaming-expected.jsonl` | **doc / code, à vérifier avec un compte** | un tour avec réflexion, un outil et plusieurs `usage_update`, deux modèles dans `_meta.quota` |
| `22-user-quota-buckets-expected.json` | **doc / code, à vérifier avec un compte** | réponse de `retrieveUserQuota` (connexion Google seulement) |
| `23-rate-limit-real-expected.json` | **doc / code, à vérifier avec un compte** | le vrai message d'un quota atteint |
