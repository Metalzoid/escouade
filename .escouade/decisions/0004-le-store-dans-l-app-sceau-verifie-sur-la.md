---
number: 4
title: "Le store dans l'app : sceau vérifié sur la machine, version compatible, révocation appliquée hors ligne"
date: "2026-10-30"
state: "accepted"
origin: "ticket"
origin_ref: "ESC-236"
pages: ["store/store-dans-l-app"]
tickets: ["ESC-236","ESC-287"]
documents: []
supersedes: []
superseded_by: null
changes: [{"page":"store/store-dans-l-app","added":30,"removed":0}]
accepted_at: "2026-10-30T04:13:52+01:00"
accepted_by: "Guillaume Gagnaire"
---

## Contexte

STORE-9 (ESC-236) met store.escouade.dev dans la vue Plugins. docs/STORE.md §5 et la revue du 2026-10-29 fixent le principe ; il restait à trancher en le construisant : ce qui se passe sans les clés du store dans l'app, où garder de quoi revérifier un sceau, comment proposer « Pour <projet> » sans rien envoyer, et le lien escouade:// que STORE-11 porte.

## Décision

- Le sceau n'est jamais pris du catalogue : la signature est vérifiée dans l'app avec ses clés (moins celles que la liste révoque), à l'installation puis à chaque lecture, contre le version.json gardé à part (plugins/.store/<id>/). Une signature annoncée qui ne tient pas arrête l'installation ; une app sans clés installe sans sceau.
- L'app propose et met à jour vers la dernière version compatible non retirée, une stable avant une préversion.
- La liste de révocation : démarrage, 6 h, « Relire maintenant » ; serial qui ne recule pas ; copie d'escouade.dev en secours ; gardée et appliquée hors ligne. disable arrête et désactive sans rien supprimer, unverify retire le sceau.
- « Pour <projet> » : deux signaux sûrs pour commencer (un programme de harness sur le PATH, des clés de tickets dans les commits), rien d'envoyé, « Pas maintenant » une semaine, « Ne plus proposer ».
- Les lignes du store gardent les lettres : la fenêtre ne charge aucune image du store (sa CSP reste fermée).
- Le faux store des e2e est signé par une clé tirée à chaque run, que seul un build debug lit (ESCOUADE_STORE_TEST_KEY).
- L'enregistrement de escouade://plugin/<id> reste à STORE-11 (ESC-287).

## Conséquences

Un store compromis ne peut ni fabriquer un sceau ni lever une révocation ; tant que l'utilisateur n'a pas donné les clés publiques (docs/STORE.md §4.5), aucune version n'est montrée vérifiée dans l'app. Le signal « 3 agents ont attendu plus d'une heure » de l'aperçu attend un historique des attentes qu'Escouade ne garde pas encore.
