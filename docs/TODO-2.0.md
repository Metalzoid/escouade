# Escouade 2.0 — à faire

Un chantier : le nouveau design de l'app, dans la langue visuelle du site.

Tickets du Kanban d'Escouade, créés le 2026-10-14 : ESC-71 à ESC-85 (les 11 lots, les deux nouveautés, la revue finale, puis la vidéo et le site). Le premier attend la fin de la 1.8.

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
  - Éditeur, Vue d'ensemble, Stats, réglages (Ctrl+,).
- **Chaque écran par son adresse** : `index.html#board`, `#plan-closed`, `#git`, `#history`, `#terminal`, `#run`, `#test`, `#test-run`, `#editor`, `#overview`, `#stats`, `#settings`, `#settings-<onglet>` (`app`, `claude`, `accounts`, `notifications`, `projects`, `board`, `integrations`, `terminals`, `network`, `about`).
- **Les captures** : `design/app-redesign/*.png`, refaites par `node design/app-redesign/render.mjs [nom…]`. Elles sont prises à 1440×900, la taille par défaut de l'app ; celles en `-small` à 1028×779, la fenêtre de la CI.
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
2. **Coque** : `App.svelte`, `TitleBar`, `StatusBar`, `QuotaMeter`, `AccountsPanel`, `Toasts`, `Welcome`.
3. **Barre latérale** : `Sidebar`, `RunsSection`, terminaux, `StatusDot`, et les deux nouveautés.
4. **Conversation** : `Conversation`, `Composer`, `conv/*` (`TurnCard`, `ToolRow`, `PatchView`, `UserMessage`, `Thinking`, `Markdown`, `EventMessage`, `Notice`, `SetupProgress`, `CriteriaReport`, `PermissionCard`, `QuestionCard`).
5. **Plan** : `PlanBanner`.
6. **Kanban** : `board/*`, `ImportModal`.
7. **Git** : `SidePanel`, `FilesPanel`, `FileDiff`, `DiffView`, `DiffModal`, `GitGraph`, `branches/*`, `CommitModal`.
8. **Terminaux et lancements** : `TerminalView`, `RunView`, `AgentTerminal` (thème xterm), `TestLaunchModal`.
9. **Éditeur et recherches** : `editor/*`, thème de CodeMirror (`src/lib/editor/theme.ts`), `QuickOpen`, `ConvSearch`.
10. **Vue d'ensemble et stats** : `Overview`, `Stats`.
11. **Fenêtres et réglages** : `Modal`, `ConfirmModal`, `UpdateModal`, `NewProjectModal`, `AccountModal`, `SettingsModal`, `settings/*`, `ContextMenu`, `Dropdown`, `Splitter`.

**Méthode.**
- Impeccable, chemin code-led : le contrat de direction est déjà écrit et l'aperçu tient lieu de comp de référence. Relire le contrat et les captures avant chaque lot.
- Détecteur sur les fichiers changés. Revue de fin (`impeccable-finish-reviewer`) avec les captures de l'app réelle et celles de l'aperçu.
- Puis le documenteur, qui écrit le `DESIGN.md` de l'app et `.impeccable/design.json`.
- Qualité comme d'habitude : TDD pour les deux nouveautés, Vitest, `svelte-check`, build, e2e sur l'app réelle (`npx tauri build --debug --no-bundle`).
- Les captures de l'app réelle passent par le banc e2e (CDP), à 1440×900 et 1028×779.

## À décider ou à vérifier pendant le chantier

- [ ] **macOS** : l'aperçu dessine les boutons de fenêtre de Windows ; sous macOS, les feux restent à gauche, et la barre de titre doit leur laisser la place.
- [ ] **Anglais** : l'aperçu n'existe qu'en français. Les libellés anglais doivent tenir dans l'en-tête, la barre d'état et les réglages.
- [ ] **Hauteur** : à 779px, les sections Lancement et Terminaux ne laissent que deux ou trois agents visibles. Les rendre repliables ou les réduire quand elles sont vides.
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
