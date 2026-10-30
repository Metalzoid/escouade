---
number: 11
title: "Le store lit un plugin à la racine d'un dépôt ; les exemples se publient depuis un dépôt chacun"
date: "2026-10-30"
state: "accepted"
origin: "ticket"
origin_ref: "ESC-237"
pages: ["store/publier-et-securite"]
tickets: ["ESC-237"]
documents: []
supersedes: []
superseded_by: null
changes: [{"page":"store/publier-et-securite","added":16,"removed":0}]
accepted_at: "2026-10-30T06:23:08+01:00"
accepted_by: "Guillaume Gagnaire"
---

## Contexte

STORE-10 demande de publier les plugins d'exemple sur le store. Ils vivent tous dans plugin-examples/ du dépôt d'Escouade (décision 10), alors que le store lit escouade-plugin.json, le README et la licence à la racine du dépôt soumis. L'essai contre le code du store le confirme : plugin-examples/ soumis tel quel est refusé (pas de manifeste), et le dossier d'un exemple seul manque de repository, d'un README et d'une licence.

## Décision

Le store garde la règle « un plugin à la racine d'un dépôt public », dite dans la documentation des auteurs. Pour l'essai réel, chaque exemple est copié (git subtree split) dans un dépôt public à lui, avec README, LICENSE et repository ; plugin-examples/ reste la source. Les sous-dossiers (un path choisi à la soumission) ne sont pas construits : ils changeraient le format de version.json, l'app et la revue, et feront un ticket si des auteurs le demandent. Les dépôts (compte de l'utilisateur ou organisation escouade-dev) se créent avec l'utilisateur.

## Conséquences

Quatre dépôts publics à créer avec l'utilisateur avant l'essai réel (docs/STORE.md §9.1) ; un workflow pourra plus tard y pousser chaque dossier. Aucun changement du store ni de l'app.
