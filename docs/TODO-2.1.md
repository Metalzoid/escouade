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
- [ ] L'adaptateur (ESC-42), puis ses comptes, son usage et son coût (ESC-43).
- [ ] Sa vue terminal (ESC-49).

## Demandés pendant le redesign (2026-10-24)

- [ ] **Wispr Flow** pour la transcription vocale, comme service en ligne et comme app de bureau (ESC-164).
- [ ] **GitLab Issues** comme source de synchro du Kanban, sur gitlab.com et les instances auto-hébergées (ESC-165).

## Restes du redesign

Notés par la revue finale (ESC-84, `design/app-redesign/final/REVUE.md`) :
- [ ] La vidéo, les captures du site et sa démonstration, qui montrent encore l'app de la 1.8 (ESC-85).
- [ ] Les anciens noms de jetons (`--ok`, `--accent`, `--line2`…), encore lus à une trentaine d'endroits : un renommage mécanique.
- [ ] À 1028 px en anglais, l'en-tête d'un lancement coupe sa commande avant son dossier.
- [ ] Sur une carte d'agent étroite, avec sous-agents et plan, le plan pourrait céder avant le modèle.
- [ ] macOS : vérifier sur un Mac que les feux tombent au milieu de la barre de titre de 44 px.
