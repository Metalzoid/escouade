# Escouade 2.1 — à faire

La 2.0.0 est sortie le 2026-10-24 avec le nouveau design de l'app (voir `docs/TODO-2.0.md`). La 2.1 reprend les deux chantiers reportés de la 1.8 puis de la 2.0, et deux demandes venues pendant le redesign.

## Hébergeurs de code

GitHub, GitLab, Bitbucket et Gitea : les pull requests des tickets suivies jusqu'au merge, avec leur CI et leurs déploiements, sans quitter Escouade. Plan détaillé : `docs/TODO-1.8.md`, chapitre 2.

- [x] Interface commune, comptes par instance et analyse des remotes (ESC-54).
- [x] Client GitHub : github.com, GHE.com, GitHub Enterprise Server (ESC-55).
- [x] Ouvrir une PR depuis un agent ordinaire, et la suivre sur sa carte (ESC-64).
- [ ] Clients GitLab (ESC-56), Bitbucket Cloud (ESC-57), Gitea et Forgejo (ESC-58).
- [ ] PR des tickets : ouverture par l'API, colonne « En revue », suivi jusqu'au merge (ESC-59). Puis la CI en échec corrigée par l'agent (ESC-60), les retours de relecture et les conflits (ESC-61), le merge depuis Escouade (ESC-62).
- [ ] CI de la branche cible et des branches poussées (ESC-63).
- [ ] Vue « Pull requests » du projet (ESC-65), et la relecture d'une PR par un agent (ESC-66).
- [ ] Déploiements (ESC-67).
- [ ] Notifications, vue d'ensemble et outils MCP des PR (ESC-68).
- [ ] Docs, site et statistiques (ESC-69).
- [ ] Essais : parcours enregistrés (ESC-53) et essai réel par hébergeur avant la release (ESC-70).

## Cursor CLI

Un cinquième harness, par ACP, à côté de Claude Code, Codex, OpenCode et Copilot CLI. Plan : `docs/TODO-1.8.md`, chapitre 1.

- [x] Essais réels (ESC-24, 2026-10-25) : réponses dans `docs/TODO-1.8.md`, point 0, « Cursor CLI », flux dans `tests/fixtures/cursor/`.
- [x] L'adaptateur (ESC-42, 2026-10-25) : conversation, permissions (avec le diff d'une écriture soumise, et celui de chaque écriture faite), questions, plan à approuver, tâches et sous-agents dans le bandeau Plan, modes Demander, Plan, Accepter les modifications et Bypass, modèles du compte, file des messages, interruption et reprise. « Toujours » est « Pour cet agent » (un dossier de config par agent, décidé avec l'utilisateur). Faux agent au banc de conformité, e2e, essai réel.
- [x] Ses comptes, son usage et son coût (ESC-43, 2026-10-25) : un compte de plus par sa clé d'API (trousseau, `CURSOR_API_KEY`), Principal sans clé ni jeton de l'environnement ; pas de quota lu (ACP n'en dit rien, le tableau de bord demande le jeton de la connexion) mais « Usage sur cursor.com » ; une limite atteinte finit le tour « limité » sur la carte ambre ; coût « — », les stats comptent les tours. Le serveur MCP passe par sa session (vérifié de bout en bout sur le faux), les textes rédigés par `agent acp` en mode Ask (essai réel : 21 s). Une écriture refusée par un hook se dit en échec. `fs` d'ACP annoncé à `true` : sans effet (essai réel), d'où les textes des modes et de « Ses fichiers ». Reste : un essai avec une vraie clé d'API (aucune ici).
- [x] Sa vue terminal (ESC-49, 2026-10-25) : l'interface de Cursor (`agent --resume <id>`) dans un terminal, suivie par son transcript (messages, outils sans leur résultat, fin de chaque tour), dans le dossier de config de l'agent, sans `MSYSTEM`. Cursor tient les conversations de son interface à part de celles d'ACP : décidé avec l'utilisateur, chaque côté reçoit ce qui s'est dit dans l'autre (une règle `.cursor/rules/escouade-relais.mdc` dans le dossier de l'agent, hors de git, pour l'interface ; un préambule au message suivant pour la session). La bande « Suivi limité » dit ce qu'Escouade ne sait pas : permissions et questions en attente, résultats des outils, tokens. Essayé en vrai : ni la règle d'un plugin (`--plugin-dir`) ni celle d'un dossier `--add-dir` ne sont lues, et les hooks d'un plugin arrivent ou non selon le moment où il est chargé.

## Demandés pendant le redesign (2026-10-24)

- [ ] **Wispr Flow** pour la transcription vocale, comme service en ligne et comme app de bureau (ESC-164).
- [ ] **GitLab Issues** comme source de synchro du Kanban, sur gitlab.com et les instances auto-hébergées (ESC-165).

## Plugins (demandé le 2026-10-25)

« Pour la v2.1.0, planifie pour plus tard un système de plugins, permettant à tout le monde d'apporter des fonctionnalités à Escouade, fais une analyse poussée pour voir tout ce qu'on pourrait manipuler via ces plugins, et planifie une documentation étendue sur le sujet. »

- [x] **L'analyse et le plan** (ESC-170, 2026-10-25) : `docs/PLUGINS.md` (l'inventaire de ce qu'un plugin pourrait manipuler, depuis le code ; l'architecture comparée, avec trois expériences jetables ; le modèle de confiance et de distribution), et ce chapitre (le découpage en tickets, le plan de la documentation, les questions).
- [x] Les questions qui décident, répondues par l'utilisateur le 2026-10-25 (plus bas, « Les décisions »).
- [x] Les tickets, créés le 2026-10-25 : ESC-172 puis ESC-173 à ESC-184 (plus bas, « Les tickets »), pour plus tard.

### Ce qui est recommandé

Un protocole des plugins en JSON-RPC 2.0, servi en 2.1 par un **process à côté** (stdio, comme MCP et ACP), avec une **interface déclarée** (rendue par les composants d'Escouade, sans HTML d'un tiers dans la fenêtre) et un **niveau déclaratif sans code** (thèmes, harness ACP décrits, webhooks). Un runtime **WASM** du même protocole viendra après, pour les plugins sans droits qu'un projet peut proposer ; puis des **vues libres** en iframe isolée. Les raisons : `docs/PLUGINS.md`, §2.4.

### Le découpage

Les tickets proposés s'appellent ici PLG-1, PLG-2… ; le chef d'escouade leur donne leurs clés. Chacun a un faux plugin pour ses tests ; le **banc de conformité des plugins** (PLG-3) est l'équivalent de celui des harness (`engine/bench/`) : des scénarios joués par un faux plugin, jugés sur ce qu'Escouade en fait.

#### 2.1.0 : le socle et trois points d'extension

**PLG-1. Le manifeste et le chargement.** Dépend de : rien.
- Critères : `escouade-plugin.json` lu et validé par un schéma publié dans `schemas/` (champs du §3.1 de `docs/PLUGINS.md`) ; un plugin installé depuis un dossier local ou une URL git avec une étiquette, copié dans le dossier des plugins de `DataDir`, fixé par son empreinte (le commit) ; un dossier en développement chargé en place et relu quand il change ; une API ou une version d'Escouade hors de sa plage désactive le plugin, avec sa raison (comme `Tested`, `oldest_reason`) ; un manifeste invalide ne charge rien et dit pourquoi, champ par champ ; un champ inconnu est ignoré.
- Tests : unitaires du lecteur (manifestes valides, invalides, d'une API future, champs inconnus) ; un faux dépôt git de plugin dans le dossier temporaire du test ; un e2e qui installe un plugin déclaratif depuis un dossier.

**PLG-2. Le protocole et le runtime en process.** Dépend de PLG-1.
- Critères : un process par plugin avec `run`, lancé paresseusement (à sa première `activation`), dans un Job object (`job.rs`) qui tue son arbre ; `initialize` négocie la version du protocole et les capacités (comme ACP) ; JSON-RPC 2.0, une ligne par message ; chaque appel a un délai, au-delà duquel la réponse par défaut s'applique ; un plantage redémarre le plugin trois fois en cinq minutes, puis l'arrête ; son stderr et ses messages vont au journal du plugin ; à la fermeture d'Escouade, `shutdown` puis la fin du Job ; une mémoire au-delà d'une limite arrête le plugin (lue comme `resources.rs`). Les secrets par `secrets/get`, seulement les siens (§3.5).
- Tests : un faux plugin `tests/fixtures/fake-plugin.mjs` (avec son `.cmd` et son script sans extension, comme les faux harness) dont le message choisit le comportement : répondre, se taire (délai), planter, boucler, grossir, écrire sur stderr, demander un secret d'un autre ; tests Rust du runtime sur chacun.

**PLG-3. Le banc de conformité et le faux Escouade.** Dépend de PLG-2.
- Critères : `src-tauri/src/plugins/bench/` joue des scénarios (initialisation, version refusée, délai, plantage, un fait reçu, une décision, un secret) contre un plugin quelconque, et dit ce qui manque ; le même banc, publié en CLI (`escouade-plugin test <dossier>`) pour les auteurs ; un **faux Escouade** (le SDK, PLG-9) qui envoie les faits et reçoit les réponses sans l'app.
- Tests : le banc passe sur le faux plugin et sur les exemples de PLG-10 ; il échoue, avec la bonne raison, sur un plugin qui ignore `initialize` ou dépasse son délai.

**PLG-4. Réglages › Plugins.** Dépend de PLG-1, PLG-2. Aperçu d'abord, avec le skill `impeccable` (consigne de l'utilisateur pour l'UX d'une fonctionnalité), validé avant la construction.
- Critères : l'onglet décrit plus bas (« L'onglet Réglages › Plugins ») ; la fenêtre d'installation montre l'origine, l'empreinte, les contributions et les permissions en mots, la plus forte d'abord (§3.4 de `docs/PLUGINS.md`) ; activer pour l'app ou par projet, jamais d'office pour un projet privé ; retirer une permission ; désinstaller (dossier, réglages, secrets) ; le journal ; les mises à jour proposées, jamais installées seules, et l'accord redemandé si les permissions grandissent. Les deux langues.
- Tests : Vitest des composants (installation, activation par projet, retrait d'une permission) ; un e2e qui installe le faux plugin, l'active pour un projet, lit son journal, le désinstalle ; une capture comparée à l'aperçu (comme `settings-look.spec.ts`).

**PLG-5. Les événements.** Dépend de PLG-2.
- Critères : un bus de faits typé et versionné dans le cœur, appelé là où l'état change (pas dérivé des `UiEvent`) : `agent.created`, `agent.status` (dont `waiting`), `agent.stopped`, `agent.handover`, `turn.ended` (avec `Finished`, `Interrupted`, `Limited`, `Error`), `request.permission`, `request.question`, `request.answered`, `ticket.created`, `ticket.column`, `ticket.report`, `ticket.approved`, `ticket.rejected`, `ticket.merged`, `ticket.conflict`, `project.added`, `project.closed`, `worktree.created`, `worktree.removed`, `launch.started`, `launch.ready`, `launch.stopped`, `tests.result`, `app.started`. Chaque fait dit le projet, le ticket et l'agent par leurs ids et leurs noms, jamais la conversation entière. Un plugin ne reçoit que les faits qu'il a demandés et seulement des projets où il est activé ; une file bornée par plugin, sans attendre sa réponse. Une contribution déclarative `webhooks` (une URL, des faits, un gabarit de corps) pour notifier sans code ; une contribution `commands` qui lance une commande sur un fait (après l'accord, comme les commandes de `.escouade.yml`, ESC-146).
- Tests : chaque fait émis par un test du cœur (sur les faux harness) et reçu par le faux plugin ; un projet privé dont aucun fait ne sort vers un plugin non activé pour lui ; un faux serveur HTTP qui reçoit un webhook ; une file pleine qui perd les plus vieux faits et le dit au journal.

**PLG-6. Les harness ACP décrits.** Dépend de PLG-1. Peut avancer en parallèle de PLG-2 à PLG-5 (il n'a pas besoin du runtime : c'est du déclaratif).
- Critères : un adaptateur ACP générique tiré de celui de Cursor CLI (`engine/cursor/`, `agent/cursor.rs`), ce qui est propre à Cursor (`cursor/*`) gardé à part ; `EngineId` ouvert à un harness de plugin (`plugin:<id>:<harness>`), ses données gardées à sa désinstallation et l'agent montré « harness absent » ; la contribution `harnesses` du manifeste (programme et arguments, `locate`, versions testées, variable du dossier de config, modes et leur sens, modèles, `EngineCaps`, installation, textes) ; la clôture des projets privés tenue par les lectures et écritures qui passent par le client ACP, et dite manquante quand l'agent ne les y fait pas passer ; le serveur MCP d'Escouade donné sans jeton dans les arguments.
- Tests : le banc des harness (`engine/bench/`) joué sur un faux agent ACP décrit par un manifeste, sans une ligne de Rust à lui ; `fake-cursor.mjs` rejoué par l'adaptateur générique (les flux de `tests/fixtures/cursor/` passent encore) ; `no_engine_puts_the_token_on_the_command_line` sur le harness du plugin ; un e2e d'un agent sur ce harness (message, autorisation, diff, fin de tour) ; un essai réel sur un agent ACP du marché (Gemini CLI ou Goose), noté dans le ticket.

**PLG-7. Les thèmes.** Dépend de PLG-1, et du renommage des anciens jetons (`--ok`, `--accent`, `--line2`…, dans « Restes du redesign » : à faire avant).
- Critères : la contribution `themes` (des valeurs pour la liste publiée des jetons de `src/app.css`, clair et sombre, et une palette des couleurs de projet) ; des valeurs filtrées (couleurs, longueurs ; ni `url()` ni CSS libre) ; appliqué à chaud à la fenêtre, à xterm et à CodeMirror ; un jeton manquant prend la valeur d'Escouade ; choisi dans Réglages › Application.
- Tests : Vitest du filtre des valeurs ; un e2e qui applique un thème de plugin et compare la couleur calculée de quelques surfaces ; le thème retiré, la fenêtre revient au thème d'Escouade.

**PLG-8. Les règles d'autorisation** (si la 2.1.0 a la place ; sinon la première de la 2.1.x). Dépend de PLG-2, PLG-5.
- Critères : avant qu'une demande attende l'utilisateur (`add_pending`), les plugins qui ont la permission `permissions.decide` répondent, dans un délai court (500 ms ?) : `allow`, `deny` avec un message, ou `ask` ; un refus l'emporte ; sans réponse, la demande va à l'utilisateur comme aujourd'hui ; la réponse dit « Autorisé par <plugin> via Escouade » dans la conversation ; la permission montrée en rouge, jamais accordée par un `.escouade.yml` ; chaque décision au journal.
- Tests : le faux plugin qui autorise, refuse, se tait, plante ; deux plugins en désaccord ; le texte « via » dans la conversation ; les quatre faux harness (Claude Code, Codex, Copilot CLI, OpenCode) et le faux Cursor.

**PLG-9. Le SDK.** Dépend de PLG-2, PLG-3 ; suit chaque point d'extension de la 2.1.0.
- Critères : `@escouade/plugin` en TypeScript (les types du protocole, générés depuis un schéma unique, comme `schemas/` ; un client stdio ; les aides de chaque point) ; un gabarit (`npm create escouade-plugin`) ; `escouade-plugin` en CLI (`validate`, `test` : le banc, `dev` : le faux Escouade, `pack`) ; la compilation en un exécutable unique documentée (pour un utilisateur sans Node). Une crate Rust des mêmes types plus tard.
- Tests : le gabarit généré passe `validate` et `test` en CI ; les types générés comparés au schéma (un test qui échoue si l'un change sans l'autre).

**PLG-10. Les plugins d'exemple.** Dépend des points qu'ils montrent. Dans un dépôt à part (`escouade-plugins`), chacun avec ses tests au banc en CI :
1. **Thème « Contraste élevé »** : déclaratif seul (PLG-7).
2. **Webhook Discord** : déclaratif seul, les tickets à tester et les agents qui attendent (PLG-5).
3. **Slack** : en TypeScript, un salon par projet, un secret au coffre (PLG-5, PLG-9).
4. **Gemini CLI** : un harness ACP décrit (PLG-6).
5. **Règles de l'équipe** : en TypeScript, des autorisations lues dans un fichier du dépôt (PLG-8).

**PLG-11. La documentation du site.** Dépend de PLG-1 à PLG-10 ; écrite au fil des tickets (chaque ticket écrit sa page), relue ici. Voir « La documentation étendue ». Critères : l'arbre ci-dessous en français et en anglais, les tests du site (`generate` puis ses tests, les NBSP), chaque exemple de code tiré d'un plugin d'exemple qui passe le banc.

**PLG-12. Les docs internes et l'essai réel.** Dépend de tout le reste de la 2.1.0. Critères : `docs/PLUGINS.md` passé de l'analyse à la référence (ce qui a été construit), `docs/SPEC.md` (« Plugins »), `docs/PROTOCOL.md` si le protocole d'un ticket change, le CHANGELOG fr/en ; un essai réel des cinq exemples sur Windows, macOS et Linux.

Ordre : PLG-1 → PLG-2 → PLG-3 → (PLG-4, PLG-5, PLG-6, PLG-7 en parallèle ; PLG-6 et PLG-7 peuvent partir dès PLG-1) → PLG-8 → PLG-9 → PLG-10 → PLG-11 → PLG-12.

#### Après la 2.1.0

- **2.1.x** : les canaux de notification (ntfy, Pushover, Telegram, à côté de ceux du système, sur les réglages de ce qui notifie) ; l'interface déclarée (menus d'un agent, d'un ticket, d'un projet ; badges des cartes ; éléments de la barre d'état ; une section de réglages ; commandes et raccourcis), rendue par les composants d'Escouade, avec son aperçu par `impeccable`.
- **2.2** : les sources du Kanban (`integrations::Client` passé en trait, comme `Forge`) ; les environnements de lancement (isola généralisé), les étapes de mise en place, les modèles de projet de l'assistant et les clés `plugins.<id>.*` de `.escouade.yml` avec `plugins.recommended` ; les textes rédigés et les consignes ajoutées (dans `instructions_room`) ; les outils ajoutés au serveur MCP et le plugin client du serveur (un jeton par plugin, la vue `Sight`) ; les hébergeurs, déploiements et CI tierce (après ESC-56 à 69) ; les statistiques en lecture et leur export ; une source de Ctrl+K ; **le runtime WASM** du même protocole (wasmtime, carburant et époque, mémoire bornée, réseau par les hôtes déclarés, disque filtré par la clôture), et les plugins WASM proposés par un projet ; **le registre** (un dépôt public avec revue par PR, une CI qui passe le banc, la page sur escouade.dev, la signature de l'archive).
- **2.3 et plus tard** : les vues libres (un panneau, une page) dans une iframe isolée, après un essai sous WKWebView et WebKitGTK ; les services de voix (transcription et voix, puis le direct) ; les langues (`i18n::Lang` ouvert, les textes du cœur passés en catalogues) ; les harness en programme ; un bac à sable du système pour les process (AppContainer, Seatbelt, bubblewrap).

### La documentation étendue

Une section « Plugins » du site, dans `website/content/docs/fr/plugins/` et `website/content/docs/en/plugins/`, pages de même nom dans les deux langues (comme les 39 pages d'aujourd'hui), chacune écrite avec le ticket qui construit ce qu'elle décrit :

```
plugins/
  index.md                Présentation : ce qu'un plugin apporte, les niveaux (déclaratif, programme, plus tard WASM), ce qu'il peut et ne peut pas faire
  installer.md            Pour l'utilisateur : installer, activer par projet, permissions, journal, désinstaller, projets privés
  quick-start.md          Démarrage rapide : un premier plugin en 10 minutes (le webhook Discord, puis le même en TypeScript)
  manifest.md             Le manifeste, champ par champ, et son schéma
  permissions.md          Les permissions : ce que chacune ouvre, ce qu'Escouade applique, ce qu'il ne fait que déclarer
  extension-points/
    events.md             Les événements, fait par fait, et les webhooks déclarés
    harnesses.md          Un harness ACP décrit
    themes.md             Les thèmes et la liste des jetons
    permission-rules.md   Les règles d'autorisation
    notifications.md      (2.1.x) Les canaux de notification
    ui.md                 (2.1.x) Menus, badges, barre d'état, réglages, commandes
    kanban-sources.md     (2.2) Les sources du Kanban
    launch.md             (2.2) Environnements de lancement, étapes, modèles de projet, .escouade.yml
    texts.md              (2.2) Textes rédigés et consignes
    mcp-tools.md          (2.2) Outils MCP et plugin client du serveur
    forges.md             (2.2) Hébergeurs, déploiements, CI
    stats-search.md       (2.2) Statistiques, export, recherche
  api.md                  L'API : le protocole JSON-RPC, ses méthodes et ses types (générés depuis le schéma)
  sdk.md                  Le SDK TypeScript, le gabarit, la CLI escouade-plugin, un exécutable unique
  testing.md              Tester un plugin : le faux Escouade, le banc de conformité, la CI
  publishing.md           Publier : un dépôt git, les étiquettes, puis le registre (2.2)
  versioning.md           La politique de versions : l'API majeure, escouade.min et max, ce qui casse et ce qui ne casse pas, l'annonce d'un retrait
  security.md             La sécurité pour les auteurs : secrets, consignes et injection, projets privés, ce que la revue refuse
  faq.md                  FAQ
  examples/
    high-contrast.md      Thème « Contraste élevé » (déclaratif)
    discord-webhook.md    Webhook Discord (déclaratif)
    slack.md              Slack (TypeScript, un secret)
    gemini-cli.md         Gemini CLI (harness ACP décrit)
    team-rules.md         Règles de l'équipe (TypeScript, autorisations)
```

Chaque exemple montre son code entier, tiré du dépôt `escouade-plugins` (pas recopié à la main : un test du site vérifie qu'il est à jour). La navigation du site gagne une section « Plugins » après « Réglages » ; la page `mcp.md` et la page `harness.md` renvoient vers leurs pages de plugins.

**Le SDK** (PLG-9) : les types TypeScript du protocole générés depuis un schéma JSON unique (la même source pour le Rust du cœur, comme `schemas/` aujourd'hui) ; un client stdio et une aide par point d'extension (`onEvent('ticket.column', …)`, `decidePermission(…)`) ; un gabarit `npm create escouade-plugin` (un plugin déclaratif, ou un programme en TypeScript avec ses tests) ; une CLI `escouade-plugin` : `validate` (le manifeste), `test` (le banc de conformité, PLG-3), `dev` (le faux Escouade : il envoie des faits choisis, montre les réponses, simule un projet privé et un délai), `pack` (l'archive et son empreinte) ; la compilation en un exécutable (`bun build --compile` ou `deno compile`) pour un utilisateur sans Node. Une crate Rust des mêmes types, puis l'interface WIT du runtime WASM, en 2.2.

**L'onglet Réglages › Plugins** (PLG-4), à concevoir avec `impeccable`, sur aperçu validé avant la construction ; dans le groupe des réglages de l'app, à côté de « Serveur MCP » :

- **La liste des plugins installés** : nom, auteur, version, origine (dossier, dépôt git, plus tard registre ; « non vérifié » hors du registre), un interrupteur pour l'app, l'état (actif, arrêté, désactivé : API trop ancienne, planté trois fois…), une mise à jour proposée.
- **Installer** : depuis un dossier, depuis une URL git (et plus tard depuis le registre). La fenêtre d'installation : origine et empreinte, ce qu'il ajoute, ce qu'il pourra faire, permission par permission, la plus forte d'abord (« Lance un programme sur votre ordinateur, avec vos droits »).
- **La fiche d'un plugin** : sa description, ses contributions (les thèmes, harness, webhooks… qu'il ajoute, et où les trouver), ses réglages et ses secrets (les champs qu'il déclare), ses permissions (chacune retirable), son activation par projet (une ligne par projet ouvert, les projets privés éteints d'office et marqués), son journal (démarrages, plantages, appels, autorisations décidées, filtrable, copiable), désinstaller (avec une case pour garder ses données).
- **Les plugins proposés par un projet** (2.2, `plugins.recommended` de `.escouade.yml`) : une bande dans l'onglet Projet, qui renvoie à l'installation.
- **Le mode développeur** : charger un dossier en place, le relire quand il change, ouvrir son journal en direct.

### Les décisions (2026-10-25)

L'utilisateur a retenu chaque recommandation :
1. **L'architecture** : un process à côté en JSON-RPC en 2.1, avec une interface déclarée et un niveau déclaratif sans code ; le WASM du même protocole en 2.2 ; les vues libres en iframe isolée en 2.3.
2. **La 2.1.0** : le socle (PLG-1 à PLG-4, PLG-9), les événements (PLG-5), les harness ACP décrits (PLG-6) et les thèmes (PLG-7) ; PLG-8 en tête de la 2.1.x s'il retarde la 2.1.0.
3. **Le registre** : aucun en 2.1.0 ; un dépôt public avec revue par PR et signature par Escouade en 2.2 ; l'installation depuis un dépôt git toujours permise, marquée « non vérifié ».
4. **La licence** : le SDK et le schéma sous MIT, une licence libre exigée dans le registre (au choix de l'auteur), pas de vente par Escouade.
5. **Un projet qui propose un plugin** : il propose, il n'installe jamais seul ; en 2.2 avec le WASM.
6. **Les autorisations décidées par un plugin** : permises, comme une permission rouge (jamais donnée par un projet, journalisée), un refus qui l'emporte et un délai court qui rend la demande à l'utilisateur.

### Les tickets (créés le 2026-10-25, pour plus tard)

| Plan | Ticket | Dépend de |
| --- | --- | --- |
| Renommage des anciens jetons (avant PLG-7) | ESC-172 | — |
| PLG-1. Le manifeste et le chargement | ESC-173 | — |
| PLG-2. Le protocole et le runtime en process | ESC-174 | ESC-173 |
| PLG-3. Le banc de conformité et le faux Escouade | ESC-175 | ESC-174 |
| PLG-4. Réglages › Plugins | ESC-176 | ESC-173, ESC-174 |
| PLG-5. Les événements | ESC-177 | ESC-174 |
| PLG-6. Les harness ACP décrits | ESC-178 | ESC-173 |
| PLG-7. Les thèmes | ESC-179 | ESC-173, ESC-172 |
| PLG-8. Les règles d'autorisation | ESC-180 | ESC-174, ESC-177 |
| PLG-9. Le SDK | ESC-181 | ESC-174, ESC-175 |
| PLG-10. Les plugins d'exemple | ESC-182 | ESC-177, ESC-178, ESC-179, ESC-181 |
| PLG-11. La documentation du site | ESC-183 | PLG-1 à PLG-10 |
| PLG-12. Les docs internes et l'essai réel | ESC-184 | le reste de la 2.1.0 |

## Les loops d'un projet (demandé le 2026-10-26, avancé en 2.0.x)

« Pour la 2.1, réfléchis à une façon d'afficher les loops dans la colonne de droite : analyser la loop du projet dans les paramètres du projet, pour en extraire les portes d'entrées, les différents agents, etc, montrer dans l'UI le workflow et montrer en temps réel, pour chaque agent, l'avancée, où on est, et l'historique dans cette loop. »

- [x] **La conception** (ESC-191, 2026-10-26) : l'étude dans `docs/LOOPS.md`, l'aperçu (`#loops*` de `design/app-redesign/index.html`, captures `loops*.png`), les choix 131 à 159 d'`UX-NOTES.md`.
- [x] La validation des choix par l'utilisateur, sur les captures (2026-10-26) : « Ça me va parfaitement, implémente le directement en fait pour la v2.0 ». Construit en 2.0.x, sauf LOOP-8 (les plugins, 2.1).
- [x] Les tickets, créés le 2026-10-26 : LOOP-1 ESC-192, LOOP-2 ESC-193, LOOP-3 ESC-194, LOOP-4 ESC-195, LOOP-5 ESC-196, LOOP-6 ESC-197, LOOP-7 ESC-198, LOOP-9 ESC-199 ; LOOP-8 ESC-200 pour la 2.1 (après ESC-177).

### Les tickets proposés

Les tickets s'appellent ici LOOP-1, LOOP-2… ; le chef d'escouade leur donne leurs clés. Chacun a ses fixtures (copies figées de GSD, Superpowers, Ralph, d'un projet sans workflow et d'un projet à plusieurs dépôts dans `tests/fixtures/workflows/`) et un faux agent qui joue les faits.

| Plan | Ce qu'il fait | Choix | Modèle conseillé | Dépend de |
| --- | --- | --- | --- | --- |
| LOOP-1. La lecture par règles | Le modèle d'un workflow (portes, étapes, sous-agents, transitions, retours, fichiers d'état, sortie), la lecture des dossiers de chaque harness et des `@`, ce qui est un workflow, `~/.claude` compté par trace, plusieurs dépôts, la relecture au premier plan ; gardé dans `~/.escouade/` | 133, 135, 136, 138, 155 | Sonnet medium (back) | — |
| LOOP-2. Le suivi en temps réel | Les faits de chaque harness mis en regard des étapes, l'historique par agent (heure, durée, coût, issue, retours et leur raison), hors du workflow, version gardée par étape, suivi partiel par harness, la boucle d'un prompt (tours, liste cochée) | 146–151, 153, 154 | Sonnet medium (back) | LOOP-1 |
| LOOP-3. L'onglet Workflow | Le rail, les arcs, les pastilles, replié, la liste des agents, l'historique, la boucle d'un prompt, l'état vide, les cas limites, 1028 px, les deux thèmes, le français et l'anglais ; e2e | 132, 140–148, 150–154 | Opus medium (interface) | LOOP-2 |
| LOOP-4. Réglages › Projets › Workflow | La lecture et ses sources, « Relire », la relecture automatique, les workflows trouvés, les étapes corrigées (renommer, fusionner, ajouter, deviné), la clé `workflows` de `.escouade.yml` (schéma, `KEYS`) | 133, 137–139, 152 | Opus medium (interface) | LOOP-1 |
| LOOP-5. Affiner avec un agent | L'agent court, son schéma JSON validé par les règles, modèle, compte et coût dits avant, la clôture d'un projet privé | 134, 156 | Sonnet medium | LOOP-1, LOOP-4 |
| LOOP-6. La carte, la conversation et les tickets | L'étape sur la carte, le séparateur dans la conversation, le workflow « Tickets » d'Escouade, un agent de ticket dans deux workflows | 145, 159 | Opus medium (interface) | LOOP-2, LOOP-3 |
| LOOP-7. MCP et documentation | `get_workflow`, `workflow` dans `list_agents` et `get_agent_summary`, la vue `Sight` des projets privés ; `docs/PROTOCOL.md`, `docs/SPEC.md`, une page du site en deux langues | 156, 157 | Sonnet medium | LOOP-2 |
| LOOP-8. Les faits et le lecteur de workflow des plugins | Les faits `workflow.*` sur le bus, le point d'extension « lecteur de workflow » | 158 | Sonnet medium | LOOP-2, ESC-177 (PLG-5) |
| LOOP-9. Essais réels | GSD et Ralph sur Claude Code (chat et vue), un prompt de Codex, OpenCode, Copilot CLI, Cursor CLI (chat et vue) ; les tableaux de `docs/LOOPS.md` corrigés d'après ce qui est vu | 150 | Sonnet medium | LOOP-1 à LOOP-7 |

LOOP-3 et LOOP-4 peuvent avancer en même temps une fois LOOP-1 fait (LOOP-3 sur des faits joués par le faux agent en attendant LOOP-2). LOOP-8 attend le bus de faits des plugins ; s'il n'est pas dans la 2.1.0, il passe à la 2.1.x sans rien retarder.

## Restes du redesign

Notés par la revue finale (ESC-84, `design/app-redesign/final/REVUE.md`) :
- [x] Les captures du site, prises dans la vraie app 2.0 sur une démo fictive (`npm run site-shots`), et sa démonstration au design 2.0 (ESC-187).
- [ ] La vidéo et son affiche, qui montrent encore l'app de la 1.8 (ESC-85).
- [ ] Les anciens noms de jetons (`--ok`, `--accent`, `--line2`…), encore lus à une trentaine d'endroits : un renommage mécanique.
- [ ] À 1028 px en anglais, l'en-tête d'un lancement coupe sa commande avant son dossier.
- [ ] Sur une carte d'agent étroite, avec sous-agents et plan, le plan pourrait céder avant le modèle.
- [ ] macOS : vérifier sur un Mac que les feux tombent au milieu de la barre de titre de 44 px.
