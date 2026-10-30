---
title: "Publier sur le store, la sécurité des plugins et l'essai réel"
subject: "store"
sources: ["docs/STORE.md","website/content/docs/fr/plugins/publishing.md","website/content/docs/fr/plugins/security.md","store/server/utils/checks.ts","store/tests/unit/trial.test.ts"]
tickets: ["ESC-237"]
decisions: []
compared: null
---

# Publier sur le store, la sécurité des plugins et l'essai réel

Détail : `docs/STORE.md` §3, §4, §7 et §9.1 (il fait foi).

## Un plugin par dépôt
- Le store lit **un plugin à la racine d'un dépôt public** : `escouade-plugin.json`, `README.md` (ou `README.fr.md` / `README.en.md`) et `LICENSE` (ou `COPYING`) au premier niveau, `repository` du manifeste égal au dépôt soumis.
- Un dépôt qui range plusieurs plugins en sous-dossiers (comme `plugin-examples/` du dépôt d'Escouade) est refusé tel quel : pas de manifeste à la racine. Chaque plugin a son dépôt.
- Les sous-dossiers ne sont pas pris en charge. S'ils le sont un jour : un `path` choisi à la soumission, gardé dans `version.json` et vérifié par l'app (un changement de format, un ticket à part).

## La documentation des auteurs (site, fr et en)
- « Publier sur le store » (`plugins/publishing`) : un plugin par dépôt, soumettre une version, les dix contrôles, la page du plugin, les binaires attestés, **préparer la revue** (permissions exactes, code lisible avec sa source, dépendances épinglées sans `postinstall`, binaires attestés, mises à jour courtes), corriger un refus, les nouvelles étiquettes, gérer ses plugins.
- « La sécurité des plugins » (`plugins/security`) : ce que l'app vérifie (empreintes, signature avec ses clés embarquées, clé secrète jamais sur le serveur ni dans la CI), ce que le sceau couvre (une version) et ne promet pas, **ce que la revue refuse** :
  - refusé d'office : une empreinte qui ne tient pas, une version qui n'est plus celle que le store a figée ;
  - pas de sceau tant que ce n'est pas corrigé : hôte non déclaré, secrets ou dossiers personnels lus, fichiers hors du dossier, programme non annoncé, code dynamique, code illisible, dépendances non épinglées ou `postinstall`, consignes qui détournent les agents, binaire sans attestation, étiquette déplacée, entrée d'archive refusée, banc qui échoue ;
  - retiré : un comportement malveillant ;
  - puis la liste de révocation (retirer le sceau, retrait d'urgence), les signalements, un plugin hors du store « non vérifié ».

## L'essai réel
- Joué sans l'utilisateur contre les faux stores, avec des clés de test : soumission des quatre exemples (chacun passe les dix contrôles dans un dépôt à lui), revue, signature, installation dans l'app sous Windows, révocation.
- L'essai réel avec l'utilisateur (ses clés minisign, sa GitHub App, store.escouade.dev, Windows, macOS et Linux) suit la liste pas à pas de `docs/STORE.md` §9.1 ; les exemples y sont publiés depuis quatre dépôts publics, un par exemple.
