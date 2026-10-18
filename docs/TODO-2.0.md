# Escouade 2.0 — à faire

Le chantier principal : le nouveau design de l'app, dans la langue visuelle du site. Viennent ensuite deux chantiers reportés de la 1.8 (voir « Reportés de la 1.8 »).

Tickets du Kanban d'Escouade, créés le 2026-10-14 : ESC-71 à ESC-85 (les 11 lots, les deux nouveautés, la revue finale, puis la vidéo et le site). Le premier attend la fin de la 1.8, nouveau récit du site (ESC-86) compris.

## Reportés de la 1.8 (2026-10-19)

La 1.8.0 est sortie avec Codex, OpenCode et Copilot CLI à côté de Claude Code. Deux chantiers de son plan n'y sont pas entrés ; leur plan détaillé reste dans `docs/TODO-1.8.md` :
- **Hébergeurs de code** (GitHub, GitLab, Bitbucket, Gitea) : les pull requests des tickets suivies jusqu'au merge, avec leur CI et leurs déploiements. Plan : `docs/TODO-1.8.md`, chapitre 2 ; tickets ESC-53 à ESC-70, après le nouveau design.
- **Cursor CLI**, cinquième harness, par ACP : plan dans `docs/TODO-1.8.md`, chapitre 1 ; tickets ESC-24 (essais réels), ESC-42 et ESC-43 (l'adaptateur, ses comptes et son coût) et ESC-49 (sa vue terminal).

## D'où ça vient (2026-10-12)

L'utilisateur juge l'interface actuelle « très AI slop » et veut un design « plus sleek, sexy ». Pour lui, « sexy » veut dire fini et soigné, pas à thème : il a déjà écarté les directions à thème pour le site.

Ses réponses, à ne pas reposer :
- l'app parle la même langue visuelle que le site (`website/app/assets/main.css`) : fond presque noir #08090A, Inter, filets blancs, teal #35C1BD du logo ;
- le teint de toute l'interface par la couleur du projet actif reste (« c'est cool ») ;
- d'abord un aperçu dans un navigateur, sans implémenter ; sur cet aperçu : « la direction me plaît bien », puis, une fois tous les écrans ajoutés, « implémente le redesign comme ça ».

L'implémentation a ensuite été repoussée à la 2.0, avec ce fichier et les artefacts ci-dessous pour tout contexte.

## Les artefacts

- **L'aperçu** : `design/app-redesign/index.html`, à ouvrir dans Chrome depuis le dépôt (il charge Inter depuis `website/node_modules` et JetBrains Mono depuis `node_modules`). Données fictives. Il est interactif :
  - les onglets de projet changent le teint ;
  - Agents et Kanban ;
  - réponse à `tests-e2e` depuis la liste (clic, ou 1 et 2), Ctrl+J ;
  - plan qui se plie ;
  - Lancement › Front, Terminaux › PowerShell ;
  - Kanban › DEM-4 › Tester, puis Lancer ;
  - Éditeur, Vue d'ensemble, Stats, réglages (Ctrl+,) ;
  - depuis le lot 0 : la flèche de « Nouvel agent », le mode du champ, les jauges de la barre d'état, « … » de l'en-tête (ou clic droit sur une carte), le micro (ou Ctrl+Espace), la conversation, « + » d'une colonne du Kanban, Réglages › Comptes › Ajouter un compte (Codex), Réglages › Projets › Ouvrir l'assistant.
- **Chaque écran par son adresse** : `index.html#board`, `#plan-closed`, `#git`, `#history`, `#terminal`, `#run`, `#test`, `#test-run`, `#editor`, `#overview`, `#stats`, `#settings`, `#settings-<onglet>` (`app`, `claude` pour Harness, `accounts`, `voice`, `notifications`, `projects`, `board`, `integrations`, `mcp`, `terminals`, `network`, `about`).
- **Les écrans du lot 0** (ESC-116, les fonctionnalités venues après l'aperçu) : `#new-agent`, `#codex`, `#modes`, `#handover`, `#agent-menu`, `#quota`, `#account-codex`, `#terminal-view`, `#welcome`, `#dictation`, `#dictation-offer`, `#voice`, `#voice-question`, `#attachments`, `#drop`, `#ticket`, `#subagent`, `#task`, `#wizard`, `#wizard-summary`, `#telemetry`, `#update`, `#update-failed`, `#hosts`. Avec `?lang=en` avant le `#`, les libellés anglais (ceux du catalogue `src/lib/i18n/en` quand il les a), par exemple `index.html?lang=en#modes`.
- **Les notes d'UX du lot 0** : `design/app-redesign/UX-NOTES.md`. Pour chaque fonctionnalité, ce qui est mal pensé aujourd'hui et ce que l'aperçu propose ; les libellés anglais vérifiés ; les choix qui engagent le produit, tous validés par l'utilisateur le 2026-10-17.
- **Les captures** : `design/app-redesign/*.png`, refaites par `node design/app-redesign/render.mjs [nom…]` (le rendu échoue si un écran lève une erreur). Elles sont prises à 1440×900, la taille par défaut de l'app ; celles en `-small` à 1028×779, la fenêtre de la CI ; celles en `-en` en anglais.
- **Le contrat de direction** : `.impeccable/surfaces/src-app-svelte.md`. La commande `impeccable surface-brief read src/App.svelte` le relit.
- **Le produit** : `PRODUCT.md`.

## Le monde visuel (ce que l'aperçu fixe)

**Couleurs.** `--p` est la couleur du projet (`oklch(0.72 0.12 <teinte>)`, les teintes de `PROJECT_COLORS`). Elle est déclarée par `@property` et glisse en 0,7 s d'un projet à l'autre. Les surfaces s'en déduisent :

| Rôle | Valeur |
|---|---|
| Cadre (barre de titre, barre latérale, barre d'état) | `color-mix(in oklch, var(--p) 8%, #08090a)` |
| Panneau du travail | `color-mix(in oklch, var(--p) 4.5%, #0e0f11)` |
| Reliefs | 6 % sur #15161a et sur #1b1c20 |
| Puits (code, terminal) | 2 % sur #0a0b0d |
| Filets | blanc à 7,5 %, 12 % et 20 % |
| Survol | blanc à 4,5 % |
| Textes | #F7F8F8, #D0D3D8, #8A8F98, #7B8089 |

D'autres couleurs viennent compléter les surfaces :
- **Lumière du projet** : un dégradé radial du projet à 20 %, depuis le haut à gauche, sur 520 px.
- **Vue d'ensemble et stats** : elles prennent le teal d'Escouade, `oklch(0.74 0.115 190)`.
- **États** : en cours oklch(0.79 0.15 155), attente oklch(0.84 0.14 82) (fond à 7 %, filet à 32 %), erreur oklch(0.74 0.14 22), ajout oklch(0.8 0.13 155), git modifié oklch(0.82 0.11 75).
- **Bouton principal** : blanc (#F2F3F4, encre #08090A). Le teal reste au logo et aux vues globales. Le focus et la sélection prennent la couleur du projet.

**Graphiques.** Palettes validées par le script de dataviz (daltonismes compris) :
- tokens : Entrée #4c88d3, Cache #008b7a, Sortie #9555b0 ;
- modèles : Opus #ca723c, Sonnet #4682cc, Fable #339c6d, Haiku #9555b0.

Les couleurs de projet échouent au contrôle : ce sont celles du produit, donc chaque barre porte le nom du projet.

**Typographie.**
- Inter variable (`@fontsource-variable/inter`, réglages `cv11` et `ss03`), 13px de base, chiffres tabulaires pour les tokens, coûts et durées.
- JetBrains Mono seulement pour le code, les chemins, les branches et les commandes.

**Formes et mouvement.**
- Coins de 6 à 14px. Ombres seulement sous ce qui flotte (panneau, zone de saisie, fenêtres, notifications).
- Icônes SVG tracées en 1,5px sur une grille de 16, une seule famille. Elles remplacent les caractères Unicode qui servent d'icônes : 92 dans les gabarits (× ✓ ↑ ↓ ▾ ▶ ▸ ■ ⌕ ⟳ ⚙…), plus ceux des textes (« ▶ Tester », « ✦ Remplir automatiquement ») et des onglets de réglages (`SETTINGS_TABS`) ; les tracés sont dans l'aperçu (`<symbol id="i-…">`).
- Mouvement : courbe `cubic-bezier(0.16, 1, 0.3, 1)`. Trois moments seulement : le teint qui glisse, l'anneau de l'agent qui attend, le reflet de « Claude travaille… ». Tout s'arrête avec `prefers-reduced-motion`.

## Écran par écran

- **Coque.**
  - Cadre teinté. Le travail est posé sur un panneau en relief (rayon 12px, marge droite de 8px).
  - Barre de titre de 44px : logo, Vue d'ensemble, onglets de projet (pastille, nom, nombre d'agents qui attendent en ambre, Δ), recherche Ctrl K, Éditeur, Stats.
  - Barre d'état de 30px : « 1 en attente Ctrl J » cliquable, jauges de quota fines.
- **Barre latérale.**
  - Agents et Kanban en segments, puis « Nouvel agent Ctrl N ».
  - Cartes d'agent sans cadre. L'agent qui attend est en tête, ambre, avec sa question et ses réponses.
  - Sections Lancement (état de chaque commande, relancer et stopper au survol, groupe d'un test en cours) et Terminaux, puis le dossier et la branche.
- **Conversation.**
  - En-tête de 60px : nom, état en pastille, chemin, chiffres (étiquette au-dessus de la valeur), actions. Les libellés se replient en icônes quand la place manque (requêtes de conteneur).
  - Colonne de 780px. Appels d'outils en un fil, sans une boîte par appel. Le code et les diffs gardent un cadre.
  - Zone de saisie flottante : modèle, effort et mode en puces, Stop avec Échap, Envoyer en blanc. Sa barre passe à la ligne quand la place manque.
- **Plan.**
  - Aligné sur la colonne de la conversation : barre d'une case par tâche, titre, sous-agents actifs, nombre de tâches, pourcentage.
  - Chaque tâche montre son état, son sous-agent et son modèle, son étape (« 2/4 étapes ») et ses dépendances (« après 04, 05 »).
  - Poignée de redimensionnement.
- **Kanban.** Colonnes sans boîte. Cartes avec la clé, la boucle en cases, les critères cochés, l'activité de l'agent et le coût. Le ticket à tester est ambre, avec Valider et Tester.
- **Git, en disposition côte à côte.**
  - Onglets soulignés « Non commités » et « Historique ».
  - Portée « Cet agent / Tout le projet ». Fichiers avec M ou A et leurs compteurs, puis le diff.
  - Voir le diff, Commit…, Merger.
  - L'historique est un graphe des branches des agents.
- **Terminal et lancement.**
  - Log en vrai terminal, avec la palette ANSI de l'aperçu.
  - En-tête : nom, shell, état, « depuis 14:02 », commande et dossier, Effacer, Relancer, Stopper.
  - Une notification signale le plantage d'une commande, avec « Voir le log ».
- **Tester.**
  - Fenêtre qui dit d'abord qui a écrit les commandes et qu'elles tournent hors du mode de permission. Puis la préparation, les processus (dossier, variables, adresse) et l'ouverture.
  - Après « Lancer », les étapes s'enchaînent avec leur temps de démarrage.
- **Éditeur.** Arbre avec les dossiers modifiés marqués, onglets, recherche flottante, repères de changement dans la marge, ligne d'état.
- **Vue d'ensemble.** Plein cadre. Groupe « Attend ta réponse » en tête, avec Autoriser/Refuser ou Répondre sur place, puis un groupe par projet. Colonnes : activité, modèle, coût, contexte, depuis.
- **Statistiques.**
  - Une seule bande de quatre chiffres au lieu de quatre cartes.
  - Colonnes empilées, avec un écart de 2px entre les segments et le détail d'un jour au survol.
  - Barres par projet et par modèle, table par ticket.
- **Réglages.**
  - Navigation en trois groupes : général, « Par projet », « Système ». Un point de la couleur du projet marque un onglet modifié.
  - Lignes à filets : nom, explication, contrôle à droite. Interrupteurs, cases et boutons radio dans la couleur du projet.
  - Projet choisi par pastilles. Commandes de lancement sur une grille (nom, commande, sous-dossier, shell).

Puis les écrans du lot 0 (ESC-116), validés par l'utilisateur le 2026-10-17 avec les 13 choix de `design/app-redesign/UX-NOTES.md` (le détail et les raisons y sont) : c'est le design à suivre par les lots, pas une proposition. Les harness sont Claude Code et Codex, eux seuls ; aucun autre n'apparaît dans l'interface.

- **Harness.**
  - La marque d'un harness est un mot dans un filet (« Claude », « Codex »), la même sur la carte, l'en-tête (sur la ligne du chemin), le ticket, les menus et le Kanban ; jamais une couleur.
  - « Nouvel agent » en bouton divisé : `Ctrl N` sur le harness du projet ; la flèche ouvre le menu « Harness » (modèle, mode et raccourci de chacun ; Claude Code ou Codex pas installé, grisé avec où le régler ; « Harness par défaut du projet… »).
  - Un agent Codex porte « Bac à sable » dans son en-tête. Le menu des modes dit le sens de chaque mode sur son harness ; les cinq modes restent aux mêmes places.
  - Réglages › Harness : un groupe par harness (état, version, exécutable, nouveaux agents), puis « Tous les harness ». Ce qu'un harness ne fait pas est dit en une ligne, à l'endroit du réglage.
  - Premier démarrage sans harness : la fenêtre vide, les commandes d'installation à copier, « Chercher à nouveau ».
- **Passation (ESC-88).** La carte du quota épuisé, le séparateur « Suite sur Codex · … », le dossier de passation replié, les tours marqués de leur harness. « Revenir sur Claude Code » dans une bande au-dessus du champ, jamais pris seul. Le menu de l'agent s'ouvre aussi par « … » dans l'en-tête.
- **Comptes et quotas.**
  - Barre d'état : un groupe de jauges par harness qui travaille ; le total du jour prend « ≈ » dès qu'il contient de l'estimé.
  - Panneau des comptes groupé par harness : fenêtres de 5 h, 7 j, ou 30 j (offre gratuite de Codex), coût du jour « ≈ … estimé » pour Codex, seuil de pause.
  - Réglages › Comptes : un groupe par harness, puis « Quand un quota est épuisé » (autre compte, harness suivant, ordre, modèle de passation). Ajouter un compte : le harness d'abord, puis la connexion dans un terminal.
- **Vue terminal.** Deux segments « Escouade | Codex » dans l'en-tête. La question de confiance du dossier de Codex est dite au-dessus du terminal, et l'agent passe en tête de la liste.
- **Voix.**
  - Barre du champ : modèle, effort et mode à gauche ; joindre, dicter et converser en icônes à droite, avant Stop et Envoyer.
  - Dictée dans le champ (niveau, durée, touches) ; l'offre du modèle et sa progression au même endroit.
  - Conversation plein écran (direction A) : orbe, phase, sous-titres, choix d'une question tels qu'ils se disent, Pause, Arrêter. « Dit à voix haute » et « Lu à voix haute » dans la conversation.
  - Réglages › Voix : Dictée (micro, raccourci, langue, modèles) puis Conversation (voix par langue, licences, exception de Fuze, vitesse, délai).
- **Pièces jointes.** Une rangée de puces au message comme au ticket : vignette ou icône, taille, ce qui arrive au fichier, gros fichier en ambre, copie en cours. Glisser entoure le champ. Trombone et nombre sur la carte du Kanban ; champ « Harness » du ticket.
- **Sous-agents et tâches de fond.**
  - Deux compteurs sur la carte ; la liste n'est dépliée que pour l'agent ouvert.
  - Leurs vues : fil d'Ariane, faits, consigne ou sortie suivie, Arrêter, « Lui écrire, par … ».
  - À 820 px de haut et moins, Lancement et Terminaux se replient sur leur titre ; un plantage reste dit.
- **Assistant « Nouveau projet ».** Rail des étapes ; le récapitulatif met d'abord ce qui empêcherait la méthode de marcher, avec sa correction. Projets fermés dans Réglages › Projets.
- **Serveur MCP.** Un onglet « Serveur MCP » (Système) : interrupteur, déclaration, journal. « via Escouade » à côté de l'auteur dans la conversation.
- **Remote control, statistiques, mise à jour.**
  - Remote control « Claude Code seulement », icône teal quand une session est connectée.
  - Question des statistiques au premier démarrage.
  - Mise à jour prête dans la barre d'état ; son échec reste écrit dans À propos.
- **Après la 2.0.** La place des PR, de la CI et des déploiements : un onglet « PR et CI » du panneau git, et la ligne « PR → main » de la carte du ticket.

## Nouveautés (en TDD)

Ce qui suit ne se fait pas aujourd'hui :
- [ ] **Ce que fait l'agent, sur sa carte** de la barre latérale, par exemple `Edit src/auth/jwt.ts` et `184 k · 2,41 $`, ou bien le résultat (« 2 fichiers modifiés »). La donnée existe : c'est l'activité que montre déjà la vue d'ensemble.
- [ ] **Répondre à une question depuis la liste** : la question et ses options sur la carte de l'agent qui attend, cliquables ou au clavier (1, 2…) sans quitter la conversation ouverte. L'agent repart, puis reprend sa place dans la liste. Le comportement existant d'une autorisation lue en entier (Autoriser/Refuser depuis la vue d'ensemble) sert de modèle.

## Le chantier

**Ampleur** : 83 composants Svelte (22 100 lignes, dont 9 000 de styles), 35 fichiers de test qui citent ces caractères (flèches comprises), et les e2e Playwright. Estimation du 2026-10-12 en mode économe : 20 à 35 % d'un quota hebdomadaire Max. C'est une estimation grossière.

Organisation prévue :
- 11 lots implémentés par Sonnet, relus par paires ;
- une revue finale Opus ;
- la revue de fin d'Impeccable, puis son documenteur.

Lots, dans l'ordre :
1. **Fondations** : Inter (`@fontsource-variable/inter`), jetons de `src/app.css`, teint par projet et lumière dans `src/lib/theme.ts`, un composant d'icône, les contrôles communs (bouton, interrupteur, segments, champ, `kbd`), l'infobulle.
   - Nouveau : `EngineMark`, la marque du harness, partout.
2. **Coque** : `App.svelte`, `TitleBar`, `StatusBar`, `QuotaMeter`, `AccountsPanel`, `Toasts`, `Welcome`.
   - Lot 0 : jauges par harness (`StatusBar`), panneau des comptes groupé par harness (`AccountsPanel`), coût estimé, mise à jour prête dans la barre d'état, `Welcome` sans harness.
3. **Barre latérale** : `Sidebar`, `RunsSection`, terminaux, `StatusDot`, et les deux nouveautés.
   - Lot 0 : « Nouvel agent » et son menu « Harness », compteurs de sous-agents et de tâches de fond, liste dépliée de l'agent ouvert, icône du remote control, menu de l'agent, Lancement et Terminaux repliés en petite hauteur.
4. **Conversation** : `Conversation`, `Composer`, `conv/*` (`TurnCard`, `ToolRow`, `PatchView`, `UserMessage`, `Thinking`, `Markdown`, `EventMessage`, `Notice`, `SetupProgress`, `CriteriaReport`, `PermissionCard`, `QuestionCard`).
   - Nouveaux : `conv/Handover`, `AttachmentChip`, `MicButton`, `ConversationButton`, `ConversationOverlay`, `SubagentView`, `TaskView`.
   - Lot 0 : en-tête (marque, bac à sable, bascule de vue, « … »), barre du champ réordonnée, « via Escouade » dans `PermissionCard` et `QuestionCard`, « Dit à voix haute » dans `UserMessage`, harness des tours dans `TurnCard`.
5. **Plan** : `PlanBanner`, dont les sous-agents mènent à leur vue.
6. **Kanban** : `board/*`, `ImportModal`.
   - Lot 0 : marque et trombone sur `TicketCard` ; champ « Harness » et pièces jointes en une rangée dans `TicketForm`.
7. **Git** : `SidePanel`, `FilesPanel`, `FileDiff`, `DiffView`, `DiffModal`, `GitGraph`, `branches/*`, `CommitModal`.
   - Lot 0 : garder la place de l'onglet « PR et CI » (ESC-53 à 70, après la 2.0), sans le coder.
8. **Terminaux et lancements** : `TerminalView`, `RunView`, `AgentTerminal` (thème xterm), `TestLaunchModal`.
   - Lot 0 : la bande de confiance du dossier de Codex dans `AgentTerminal`.
9. **Éditeur et recherches** : `editor/*`, thème de CodeMirror (`src/lib/editor/theme.ts`), `QuickOpen`, `ConvSearch`.
10. **Vue d'ensemble et stats** : `Overview`, `Stats`, avec la marque du harness et les coûts estimés.
11. **Fenêtres et réglages** : `Modal`, `ConfirmModal`, `UpdateModal`, `NewProjectModal`, `AccountModal`, `SettingsModal`, `settings/*`, `ContextMenu`, `Dropdown`, `Splitter`.
    - Nouveaux : `modals/TelemetryModal`, `wizard/*` (`AccountStep`, `Checks`, `CopiedStep`, `IntegrationsStep`, `KanbanStep`, `LaunchStep`, `SummaryStep`, `WorktreesStep`), `settings/ClosedProjects`, `settings/VoiceTab`, `settings/SpeechSettings`.
    - Lot 0 : Réglages › Harness en un groupe par harness ; « Quand un quota est épuisé » dans Comptes ; un onglet « Serveur MCP » (`McpSection`) ; Voix ; Projets (harness par défaut, assistant, projets fermés) ; À propos (statistiques, échec de mise à jour).
    - Ce lot a presque doublé : le couper en deux (fenêtres, puis réglages) est à décider avec le Kanban.

**Méthode.**
- Impeccable, chemin code-led : le contrat de direction est déjà écrit et l'aperçu tient lieu de comp de référence. Relire le contrat et les captures avant chaque lot.
- Détecteur sur les fichiers changés. Revue de fin (`impeccable-finish-reviewer`) avec les captures de l'app réelle et celles de l'aperçu.
- Puis le documenteur, qui écrit le `DESIGN.md` de l'app et `.impeccable/design.json`.
- Qualité comme d'habitude : TDD pour les deux nouveautés, Vitest, `svelte-check`, build, e2e sur l'app réelle (`npx tauri build --debug --no-bundle`).
- Les captures de l'app réelle passent par le banc e2e (CDP), à 1440×900 et 1028×779.

## À décider ou à vérifier pendant le chantier

- [ ] **macOS** : l'aperçu dessine les boutons de fenêtre de Windows ; sous macOS, les feux restent à gauche, et la barre de titre doit leur laisser la place.
- [ ] **Anglais** : l'aperçu a un mode anglais (`?lang=en`) pour ce qui est serré, vérifié à 1028×779 pour le lot 0 (voir `UX-NOTES.md`). Le reste (Kanban, git, éditeur, vue d'ensemble, stats) reste à vérifier en anglais dans l'app.
- [ ] **Hauteur** : à 779px, les sections Lancement et Terminaux ne laissaient que deux ou trois agents visibles. Décidé avec le lot 0 (validé le 2026-10-17) : repliées sur leur titre à 820 px de haut et moins, un plantage toujours dit.
- [ ] **Signalements du détecteur** laissés sur l'aperçu, à rejuger dans l'app :
  - petits textes de métadonnées (11 à 11,5px) ;
  - points animés de l'activité ;
  - reflet en dégradé de « Claude travaille… » ;
  - cartes posées sur le panneau, vues comme imbriquées.
- [ ] **Ce qui montre l'app ailleurs**, à refaire une fois le design en place :
  - la vidéo, qui redessine l'app en React (`video/src/ui/*`, couleurs dans `video/src/theme.ts`) ;
  - les captures du site (`website/public/images/`, `en/` compris) ;
  - la démonstration du site (`SquadDemo`, `AgentCard`), qui garde aujourd'hui « les couleurs de l'app ».
- [ ] **Mettre à jour `PRODUCT.md`** : l'app suit désormais le site.
