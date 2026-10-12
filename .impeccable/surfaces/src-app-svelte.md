---
version: 1
slug: "src-app-svelte"
primary_target: "src/App.svelte"
related_targets: ["src/app.css","src/lib/theme.ts"]
---

# L'app Escouade, redessinée dans la langue du site (2.0)

## Scope

Toute l'interface de l'app (Tauri 2 + Svelte 5, `src/`) : barre de titre, barre latérale, conversation, plan, Kanban, git, terminaux et lancements, test, éditeur, vue d'ensemble, statistiques, fenêtres et réglages. Mode : Operate. Refonte complète du monde visuel : l'ancien (brun chaud #1b1917, Hanken Grotesk, accent orange, cadres partout, mono pour toutes les métadonnées) est jugé « très AI slop » par l'utilisateur (2026-10-12) ; il sert de preuve de ce que l'app fait, pas d'autorité visuelle. Prévu pour la 2.0 : voir `docs/TODO-2.0.md`.

## Audience, job, action

- Le développeur qui fait travailler plusieurs agents Claude Code en parallèle, toute la journée, sur un écran de bureau (fenêtre 1440×900 par défaut, 1000×600 au minimum).
- Le travail : lancer, puis ne revenir que quand un agent attend (question, autorisation, ticket à tester) ; lire une conversation, un diff, un log ; régler un projet.
- Ce qui se lit d'abord : qui attend, qui travaille et sur quoi, ce que ça coûte.

## Constraints

- Choix de l'utilisateur : la même langue visuelle que le site (`website/app/assets/main.css` : #08090A, Inter, filets blancs, teal #35C1BD du logo) ; le teint de toute l'interface par la couleur du projet actif reste (« c'est cool »).
- Référence approuvée : l'aperçu `design/app-redesign/index.html` (« la direction me plaît bien », « implémente le redesign comme ça ») et ses captures `design/app-redesign/*.png`. Pas de génération d'image : chemin code-led, l'aperçu tient lieu de comp de référence pour la revue de fin.
- Rien ne change dans ce que l'app fait, sauf deux ajouts vus sur l'aperçu, à coder en TDD : ce que fait l'agent en ce moment sur sa carte, et la réponse à sa question depuis la liste des agents.
- Français et anglais (les libellés anglais doivent tenir), Windows et macOS (feux de macOS à gauche, pas les boutons de Windows), `prefers-reduced-motion`, texte ≥ 4,5:1, tout au clavier avec un focus visible.
- Une seule forme d'infobulle (`use:tip`, `src/lib/tip.ts`) ; pas de `title` natif.

## Direction contract

THESIS: L'app au niveau de finition de Linear et Raycast, dans la langue du site : un cadre presque noir teinté par le projet ouvert, le travail posé sur un panneau en relief, et l'agent qui attend toujours en tête, auquel on répond sur place. Elle refuse l'ancien monde : brun chaud, cadres autour de chaque appel d'outil, mono pour toutes les métadonnées, caractères Unicode en guise d'icônes.

OWN-WORLD: Cadre `color-mix(in oklch, var(--p) 8%, #08090a)`, panneau 4,5 % sur #0e0f11, reliefs 6 % sur #15161a et #1b1c20, puits 2 % sur #0a0b0d ; filets blancs à 7,5, 12 et 20 % ; texte #F7F8F8, #D0D3D8, #8A8F98, #7B8089 ; `--p` est la couleur du projet (oklch 0.72 0.12 h), animée par `@property` en 0,7 s ; une lumière du projet tombe de la barre de titre ; la vue d'ensemble et les stats prennent le teal d'Escouade. États : en cours vert oklch(0.79 0.15 155), attente ambre oklch(0.84 0.14 82), erreur oklch(0.74 0.14 22). Inter variable (cv11, ss03, chiffres tabulaires), 13px ; JetBrains Mono seulement pour le code, les chemins, les branches et les commandes. Coins de 7 à 14px, icônes SVG tracées en 1,5px sur une grille de 16. Bouton principal blanc.

STORY: On ouvre la fenêtre et la couleur dit le projet ; la barre latérale dit qui attend (en tête, ambre, avec sa question et ses réponses 1, 2), qui travaille et sur quoi, ce que ça coûte ; on répond sans quitter ce qu'on lisait ; on lit une conversation en colonne de 780px, un plan déplié, un diff, un log ; on valide un ticket ; on règle un projet.

FIRST VIEWPORT: 1440×900, d'après `design/app-redesign/agents.png`. Barre de titre de 44px sur le cadre : logo, « Vue d'ensemble », onglets de projet (pastille, nom, ambre du nombre d'agents qui attendent, Δ), recherche Ctrl K, Éditeur, Stats, boutons de fenêtre. Barre latérale de 276px sur le cadre : Agents/Kanban, « Nouvel agent Ctrl N », agents (l'agent qui attend en tête), puis Lancement, Terminaux, dossier et branche. À droite, le panneau en relief (rayon 12px, marge de 8px) : en-tête de 60px (nom, état, chemin, chiffres, actions), plan déplié, conversation centrée, zone de saisie flottante. Barre d'état de 30px sur le cadre.

FORM: Monde imposé par l'utilisateur (la langue du site, choisie au standard de la catégorie, références Linear et Raycast) ; pas de tirage, l'aperçu a été validé à la place. Signature : « qui attend passe devant », l'agent qui attend en tête de liste, ambre, avec sa question et ses réponses cliquables ou au clavier (1, 2), Ctrl+J pour y aller ; mouvement : le teint qui glisse d'un projet à l'autre, l'anneau de l'agent qui attend, le reflet de « Claude travaille… ».

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Changer d'onglet de projet et voir toute la fenêtre prendre sa couleur ; répondre « Oui » à tests-e2e depuis la liste, sans quitter la conversation qu'on lisait.

## Unresolved

- Boutons de fenêtre sous macOS (l'aperçu dessine ceux de Windows).
- Sections Lancement et Terminaux repliables : à 779px de haut, il ne reste que deux ou trois agents visibles.
- Couleurs de projet dans les stats : elles échouent au validateur de daltonisme (couleurs du produit), d'où un nom sur chaque barre.
