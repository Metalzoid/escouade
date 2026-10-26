# Les loops d'un projet

Étude d'ESC-191 (2026-10-26), pour la 2.1 : ce qu'est « la loop d'un projet », ce qu'Escouade peut en lire, et d'où elle tire, agent par agent, où il en est. La conception (aperçu, captures, choix 131 à 159) est dans `design/app-redesign/UX-NOTES.md`, « Les loops d'un projet » ; les tickets de construction dans `docs/TODO-2.1.md`, « Les loops d'un projet ».

## Ce qu'on a regardé

En lecture seule : la doc de Claude Code (commandes, skills, sous-agents, hooks) et ce qu'Escouade sait déjà des autres harness (`docs/ENGINES.md`, le code des adaptateurs) ; trois workflows publics, GSD, Superpowers et Ralph ; les dossiers `agents/`, `commands/` et `skills/` de `~/.claude` de l'utilisateur. Ni identifiants, ni transcripts, ni autres projets.

## Ce qu'est une loop, en vrai

Personne ne l'écrit en un seul endroit. Un workflow se reconstitue de quatre sortes de fichiers :

- **Des portes d'entrée** : les commandes que l'on tape (`.claude/commands/**/*.md`, `/gsd:plan-phase`), les skills (`.claude/skills/*/SKILL.md`, que le modèle appelle seul ou qu'on nomme), les prompts des autres harness, un `PROMPT.md` relancé en boucle, un `/loop`.
- **Des agents** : les sous-agents (`.claude/agents/*.md`, avec `name`, `description`, `tools` en frontmatter), que les commandes lancent par l'outil `Task` (`subagent_type="gsd-planner"`).
- **Des étapes et des fichiers d'état** : l'ordre ne vit souvent que dans le texte d'une commande ou d'un fichier qu'elle inclut (`@~/.claude/get-shit-done/workflows/execute-phase.md`), et l'avancée dans un fichier que les étapes écrivent et relisent (`.planning/STATE.md`, `ROADMAP.md`, `fix_plan.md`).
- **Des consignes** : `CLAUDE.md`, `AGENTS.md`, les règles de Cursor ; elles disent comment travailler, rarement dans quel ordre.

### GSD (installé chez l'utilisateur)

- 49 commandes dans `~/.claude/commands/gsd/`, 16 sous-agents `gsd-*` dans `~/.claude/agents/`, et le vrai déroulé dans `~/.claude/get-shit-done/workflows/*.md`, que chaque commande inclut par `@`. Les règles doivent donc **suivre les `@`**, sinon une commande paraît vide.
- Le cycle d'une phase : `discuss-phase` (écrit `CONTEXT.md`) → `plan-phase` (`gsd-phase-researcher`, puis `gsd-planner` et `gsd-plan-checker` en aller-retour, « max 3 iterations ») → `execute-phase` (des `gsd-executor` par vagues, en parallèle, un commit par tâche) → `verify-work` (`gsd-verifier` ; des écarts renvoient à `plan-phase --gaps`). La phase finie, `STATE.md` passe à la suivante. `autonomous`, `next` et `quick` sont d'autres portes sur le même cycle.
- Les appels sont lisibles tels quels : `subagent_type="gsd-planner"` (6 fois dans les workflows), `gsd-executor` (4), `gsd-verifier` (2)… Le retour en arrière et son maximum aussi (« iteration_count < 3 »).
- Ce que GSD prévoit déjà pour les harness sans `Task` (Copilot : exécution en ligne, signal de fin par fichier) dit qu'un même workflow ne laisse pas les mêmes traces partout.

### Superpowers

Des skills qui s'enchaînent par leur texte : `brainstorming` → `writing-plans` → `executing-plans` ou `subagent-driven-development` → `requesting-code-review` → `finishing-a-development-branch`. Pas de fichier d'état commun ; le plan écrit (`docs/superpowers/plans/…`) est déjà lu par Escouade pour le bandeau Plan (1.7). Les étapes s'y reconnaissent par l'outil `Skill` et son nom.

### Ralph

Une boucle d'un seul prompt : `PROMPT.md` relancé à chaque tour (à l'origine par un `while` du shell, ici par `/loop` ou par Escouade), qui prend la première tâche de `fix_plan.md`, la fait, teste, coche et commite. Pas d'étapes nommées ni de sous-agents obligatoires : ce qui se suit, ce sont **les tours** et **la liste cochée**, d'où une vue à part dans le même onglet (choix 151).

### Les autres harness

| Harness | Portes d'entrée | Sous-agents | Fichiers |
| --- | --- | --- | --- |
| Claude Code | `.claude/commands/`, `.claude/skills/`, `~/.claude/…` | `.claude/agents/`, outil `Task`/`Agent` | `CLAUDE.md`, hooks dans `settings.json` |
| Codex | prompts et skills de `CODEX_HOME` (`prompts/`, `skills/`, partagés entre comptes, `accounts.rs`) | aucun | `AGENTS.md`, `rules/` |
| OpenCode | commandes de `.opencode/` et de sa config | ses agents, outil `task` et `subagent_type` (déjà lu, `agent/opencode.rs`) | `AGENTS.md` |
| Copilot CLI | prompts et agents de `.github/` | outil de tâche à `subagent_type` (déjà lu, `agent/copilot.rs`), skills | `AGENTS.md`, `.github/copilot-instructions.md` |
| Cursor CLI | `.cursor/commands/` | selon ce qu'ACP en dit (`agent/cursor.rs` lit `subagent_type`) | `.cursor/rules/*.mdc`, `AGENTS.md` |

Les chemins exacts des harness autres que Claude Code et Codex sont à vérifier sur leur version du moment au premier ticket (LOOP-1), comme les essais réels de la 1.8 l'ont fait pour le reste.

## Ce qu'Escouade sait déjà

- Les sous-agents et leur `subagent_type`, pour les quatre harness qui en ont (`agent.rs`, `plan.rs`, `mcp/background.rs`) : c'est la source la plus sûre d'une étape.
- Les outils `Skill` et `SlashCommand` (`agent.rs`, `agent/opencode.rs`, `agent/copilot.rs`), le message de l'utilisateur, la fin de chaque tour avec son coût.
- Le plan d'un agent (sa liste de tâches, le plan superpowers) : le bandeau Plan reste, le workflow ne le remplace pas.
- Les fichiers changés (Git) : un fichier d'état qui change se voit sans rien de plus.
- La vue Claude Code et la vue Codex par leurs hooks (`UserPromptSubmit`, sous-agents), la vue Cursor par son transcript.
- La boucle d'un ticket (« boucle 2/5 ») et le pilote auto.

Il manque : la lecture des commandes et de leurs `@`, le modèle d'un workflow, la mise en regard d'un fait et d'une étape, l'historique par agent.

## Comment reconnaître, comment suivre

**La lecture (règles)** : un graphe se fait de nœuds (portes, étapes, sous-agents, fichiers) et d'arêtes (« nomme », « lance », « écrit », « lit », « revient à … jusqu'à n fois »), tirées du frontmatter et du texte (les noms de commandes et de sous-agents connus, `subagent_type="…"`, les `@chemin`, les listes numérotées, les fichiers cités avec « écris » ou « mets à jour »). Les étapes sont les portes reliées entre elles ; un ensemble relié de deux étapes ou plus est un workflow. C'est déterministe et testable sur des copies figées de GSD, Superpowers et Ralph (`tests/fixtures/workflows/`).

**L'agent qui affine** : seulement à la demande ; il reçoit le graphe des règles et les fichiers en cause, et rend le même graphe, corrigé, dans un schéma JSON fixe, que les règles valident (un nœud inventé qui ne pointe sur aucun fichier est refusé).

**Le suivi** : chaque fait d'un agent (message tapé, sous-agent lancé ou fini, skill, fichier d'état écrit, fin de tour, boucle d'un ticket) est comparé aux signaux des étapes ; une étape commence au premier fait qui la signale, finit au premier fait d'une autre. L'historique garde, par passage, l'heure, la durée, le coût des tours, ce qui s'y est fait et l'issue (un retour en arrière, sa raison telle que l'agent l'a écrite). Rien n'est demandé au modèle.

| Harness | Étape | Sous-agent en cours | Coût par étape | Ce qui est dit dans l'interface |
| --- | --- | --- | --- | --- |
| Claude Code (chat) | oui | oui | oui | rien |
| Vue Claude Code | oui (hooks) | oui (hooks) | à la fin du tour | rien |
| OpenCode | oui | oui | oui | rien |
| Copilot CLI | oui | oui | crédits | rien |
| Codex | par ses prompts et les fichiers d'état | non | par tour | « Suivi partiel » |
| Cursor CLI | par ses commandes et les fichiers d'état | selon ACP | non | « Suivi partiel » |
| Vue Cursor | par le transcript, à quelques secondes près | non | non | « Suivi partiel » |

### Le suivi, tel que construit (ESC-193)

`workflow_track.rs` : tous les adaptateurs, et les vues des interfaces terminal, posent leurs messages et leurs outils dans la conversation ; `Core::apply` en tire les faits (`facts_of_ops`) et le coût et la fin des tours, et les compare aux étapes lues (`AgentTrack::apply`). Une porte tapée ou un skill mène à l'étape qui le porte ; un sous-agent ou un fichier écrit seulement à l'étape en cours si elle les a, ou à la seule étape qui les a. « Hors du workflow » : un message sans porte, puis un tour d'outils dont aucun ne signale d'étape. Chaque passage garde la version du workflow où il a commencé (`behind` dit que le workflow a changé depuis). L'historique (300 passages, 300 tours) est gardé par projet dans `~/.escouade/projects/<id>/workflow-tracks.json`, retiré avec l'agent ; l'événement `workflowTrack` ne part que si ce qui se voit a changé. Le faux `claude` joue des faits avec `faits-workflow: [{"agent":"gsd-planner"},{"write":".planning/STATE.md"}]` dans un message (voir l'en-tête de `tests/fixtures/fake-claude.mjs`).

Le lecteur n'ouvre que ce qui est sous le dossier du projet ou sous les dossiers propres des harness (liens suivis), en texte (`.md`, `.mdc`, `.txt`, `.yml`, `.yaml`, `.json`, `.toml`), jamais un secret (`.credentials.json`, `auth.json`, `.env*`) ni une conversation (`projects/`, `sessions/`) ; ce qui est refusé paraît dans `searched` en `ignored:<raison>:<chemin nommé>`, sans son contenu.

## Les risques

- **Une lecture fausse vaut moins que rien** : d'où l'étape devinée en pointillé, les corrections qui passent devant, et l'agent qui affine, plutôt qu'un graphe affirmé.
- **Un agent qui fait autre chose** : on ne décide « hors du workflow » que sur l'absence de tout signal, jamais sur une seule commande.
- **Les workflows globaux** (`~/.claude`) touchent tous les projets : ils ne comptent que pour un projet qui en a la trace.
- **La taille** : GSD a 49 portes. Le rail ne montre que celles du cycle ; les autres sont un « +38 ».
- **Le coût de la lecture** : des milliers de fichiers dans un monorepo. Les règles ne lisent que les dossiers connus des harness, les fichiers d'état et ce que les `@` désignent, jamais tout le dépôt.

## Ce qui reste ouvert

Rien qui bloque la construction ; les choix 131 à 159 attendent la validation de l'utilisateur sur les captures.
