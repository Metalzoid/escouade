---
version: 1
slug: "app-components-sitepage-vue"
primary_target: "app/components/SitePage.vue"
related_targets: ["app/components/HeroSection.vue","app/error.vue"]
---

# Site de présentation d'Escouade

## Scope

Toute la page unique du site (`website/`, français à la racine, anglais sous `/en/`), et sa page d'erreur. Mode : Persuade. Refonte complète : seuls le logo et son teal #35C1BD restent de l'ancien monde. Une première version dans le monde « cracktro » a été rejetée par l'utilisateur sur pièce ; il a choisi le standard de la catégorie, sur aperçu.

## Audience, job, action

- Le dev Claude Code saturé : il a déjà trois terminaux `claude` ouverts et passe son temps à vérifier lequel attend.
- Il doit repartir avec : « je lance cinq agents et je ne surveille plus rien ; la fenêtre me dit qui m'attend ».
- Action : « Télécharger pour Windows et macOS » (dernière release) ; secondaires : GitHub, la vidéo.
- Preuve : l'app au travail (vraie fenêtre de l'app, démonstration interactive aux données fictives dites comme telles, vidéo, captures). Aucun chiffre d'usage, témoignage ni benchmark.

## Constraints

- Garder : téléchargement, GitHub, version, plateformes, gratuit et open source (MIT), FR/EN avec leurs liens, vidéo et sous-titres, les 11 captures, le Kanban nommé ainsi, la mention d'indépendance.
- Texte : on peut couper, regrouper et réécrire, sans aucun fait nouveau ; les textes changés sont montrés à l'utilisateur avant tout commit.
- Nuxt 4 statique sous `/escouade/` ; polices servies par le site.
- `prefers-reduced-motion` : aucune entrée animée, démonstration à l'arrêt sur un état parlant ; sans JavaScript, tout est visible. Ce qui bouge seul a une pause (WCAG 2.2.2).
- Texte ≥ 4,5:1 sur le fond, focus visible, tout au clavier.
- Barre de qualité : linear.app et raycast.com (choisis par l'utilisateur).

## Direction contract

THESIS: Le standard des sites d'outils de dev, exécuté au niveau de Linear et Raycast : la vraie fenêtre de l'app en grand dès le premier écran, puis la preuve que celui qui t'attend se signale. Il refuse les gadgets de thème (palettes, tickets, pixels), les mockups génériques et les grilles de cartes à icône.

OWN-WORLD: Fond presque noir #08090A, surfaces #0F1012 et #141518 à filets blancs translucides (8 %, 14 %) ; texte #F7F8F8, secondaire #8A8F98, tertiaire #767B84 ; teal #35C1BD pour l'action principale, le focus et la lumière derrière le produit. Inter variable, titres serrés (−0,04em), corps 17px. Coins de 10 à 16px, ombres longues et douces réservées aux fenêtres de l'app. L'app garde ses propres couleurs (brun chaud, vert, ambre) là où elle est montrée.

STORY: Le visiteur lit la promesse, voit la vraie fenêtre de l'app, puis une démonstration où un agent pose une question à laquelle il répond lui-même ; il descend : vidéo, fonctionnalités en grille de captures, trois étapes, ce qui arrive, questions ; il télécharge.

FIRST VIEWPORT: 1440×900, d'après l'aperçu choisi (`.impeccable/mocks/decision/canon.png`). En-tête collant de 64px, flou, filet en bas : logo et « Escouade », liens, FR·EN, GitHub, bouton « Télécharger » blanc. Centré : pastille de version, titre sur deux lignes (74 à 80px, seconde ligne en gris), sous-titre gris sur trois lignes au plus, deux boutons (teal plein, fantôme). Dessous, la fenêtre de l'app recadrée sur elle-même, 1180px de large, coupée par le bas de l'écran, halo teal derrière.

FORM: Le standard de la catégorie (canon), choisi par l'utilisateur sur aperçu au deuxième tour ; clé de tirage a810dfcb ; références Linear et Raycast. Signature : la démonstration interactive de la fenêtre d'Escouade (cinq agents, une question à laquelle on répond, un ticket qui boucle), mise en scène comme un écran produit ; mouvement : une seule entrée orchestrée au chargement (décélération exponentielle), puis rien que la démonstration.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

La vraie fenêtre d'Escouade en grand sous le titre, puis plus bas une carte ambre « tests-e2e · Lancer toute la suite e2e (38 tests) ? » sur laquelle on clique « Oui » et l'agent repart.

## Unresolved

Aucune.
