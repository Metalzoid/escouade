# Lot 0 du redesign 2.0 (ESC-116) : l'UX des fonctionnalités venues après l'aperçu

L'aperçu (`index.html`) a été validé le 2026-10-12 ; depuis, Escouade a gagné un deuxième harness, les comptes par harness, la passation, la voix, les pièces jointes, les sous-agents et tâches de fond, l'assistant « Nouveau projet », le serveur MCP, le remote control, les statistiques anonymes. Ce lot les dessine dans le même monde visuel, chacun à son adresse, avant tout code. Les harness étaient alors Claude Code et Codex, eux seuls (décidé le 2026-10-17 : l’app n’en connaissait pas d’autre) ; depuis le lot 0 bis (plus bas), ce sont les quatre que l’app connaît.

D'où vient l'état actuel décrit ici : les composants (`src/components`, `git diff 26b4d6c..main`), les catalogues `src/lib/i18n/{fr,en}`, et ce que Codex déclare (`src-tauri/src/engine/codex/mod.rs`, `caps()`). L'app réelle n'a pas été relancée pour ce lot.

Ce que l'aperçu suit partout :
- **Mêmes places, mêmes mots** d'un harness à l'autre : les cinq modes aux mêmes places, « Nouveaux agents » dans chaque groupe de Réglages › Harness, les comptes groupés par harness.
- **La différence dite là où elle compte**, et seulement là : le bac à sable de Codex (en-tête, menu des modes, réglages), son coût estimé (« ≈ … estimé »), ce qu'il ne fait pas (remote control, PDF, tâches de fond) dit en une ligne à l'endroit du réglage.
- **La marque du harness** est un mot (« Claude », « Codex ») dans un filet, la même sur la carte, l'en-tête, le ticket, les menus et le Kanban ; jamais une couleur : la couleur reste celle du projet.
- **Qui attend passe devant**, aussi pour les nouvelles attentes : la question de confiance de Codex met son agent en tête, ambre.

Adresses : `index.html#…` ; `?lang=en` avant le `#` pour les libellés anglais (`index.html?lang=en#modes`). Captures : `node design/app-redesign/render.mjs`.

## Fonctionnalité par fonctionnalité

### Harness : nouvel agent, marque, réglages, accueil (`#new-agent`, `#codex`, `#modes`, `#settings-claude`, `#welcome`)

- **Aujourd'hui.** Le menu « Nouvel agent sur … » n'apparaît qu'à partir de deux harness trouvés, sans raccourci pour l'autre. Les modes de Codex portent les mots de Claude Code ; leur sens propre (bac à sable) n'est que dans le détail du menu et l'infobulle : une fois choisi, plus rien ne le rappelle. Réglages › Harness mélange tout : exécutables, modèle par défaut, processus, vue, liste de tâches, pièces jointes, remote control et serveur MCP.
- **Aperçu.** Un bouton divisé : `Ctrl N` part sur le harness du projet, la flèche ouvre le menu « Harness » (chaque harness avec son modèle, son mode, son raccourci ; Claude Code ou Codex pas installé y reste, grisé, avec où le régler ; « Harness par défaut du projet… »). Le menu des modes dit le sens de chaque mode sur ce harness, et l'en-tête d'un agent Codex porte « Bac à sable » à côté de son chemin (icône seule quand la place manque). Réglages › Harness : un groupe par harness (état et version, exécutable, nouveaux agents), puis « Tous les harness » ; la différence en une ligne (« Claude Code seulement : Codex n'a pas de remote control », « Pas de PDF joint · pas de tâches de fond »).
- **États.** Prêt ; version non testée (ambre, avec la plage testée) ; introuvable (commande d'installation) ; aucun harness (`#welcome` : premier démarrage, fenêtre vide, les commandes à copier, « Chercher à nouveau »).

### Passation à un autre harness, ESC-88 (`#handover`, `#agent-menu`)

- **Aujourd'hui.** « Continuer sur un autre harness… » vit dans le menu contextuel de la carte (clic droit seulement) et sur la carte du tour arrêté par la limite. Ce qui se passe quand un quota est épuisé est réglé à deux endroits : l'ordre des harness dans Comptes, la passation automatique et la reprise sur un autre compte dans Harness.
- **Aperçu.** Le même menu de l'agent s'ouvre au clic droit et par « … » dans l'en-tête. La passation se lit dans la conversation : la carte du quota épuisé (répondue : « Continué sur Codex à 15:42 · choisi par toi »), un séparateur « Suite sur Codex · quota Claude Code épuisé jusqu'à 18:00 », le dossier de passation replié, puis les tours marqués « Codex · modèle · mode ». Le retour n'est jamais pris seul : une bande au-dessus du champ « Le quota Claude Code est revenu… Revenir sur Claude Code ». Réglages › Comptes réunit « Quand un quota est épuisé » : autre compte du même harness, puis harness suivant, ordre des harness, modèle de passation.
- **États.** Proposée (carte ambre, boutons) ; faite (carte répondue, séparateur) ; pendant un tour (« Attends la fin du tour ») ; impossible (harness sans compte actif, grisé avec la raison) ; retour possible (bande).

### Comptes et quotas par harness (`#quota`, `#settings-accounts`, `#account-codex`)

- **Aujourd'hui.** La barre d'état montre les jauges d'un seul harness à la fois (celui du compte où partiraient les nouveaux agents) ; le coût du jour mêle exact et estimé sans le dire ailleurs que dans une infobulle.
- **Aperçu.** Un groupe de jauges par harness qui fait travailler des agents (« Claude 5 h · 7 j », « Codex 5 h · 7 j ») ; un clic ouvre le panneau des comptes, groupé par harness, chaque compte avec ses fenêtres (5 h, 7 j, ou 30 j sur l'offre gratuite de Codex), son coût du jour (« ≈ … estimé » pour Codex), « compte en cours », « au-delà du seuil de pause ». Le total du jour prend « ≈ » dès qu'il contient de l'estimé. Ajouter un compte Codex : le harness d'abord (segments), ce qui se partage (config.toml, AGENTS.md…), puis la connexion `codex login` dans un terminal, avec l'attente dite. Le Principal se réserve à des projets comme les autres comptes.
- **États.** Connecté ; offre gratuite (ambre) ; au-delà du seuil ; inactif ; connexion en attente ; projet fermé encore réservé (« mobile-app (fermé) »).

### Vue terminal du harness (`#terminal-view`)

- **Aujourd'hui.** Un bouton unique dont le libellé nomme l'autre vue (« Vue Codex » quand on est dans celle d'Escouade, et inversement) : on lit où l'on irait, pas où l'on est. La question de confiance du dossier de Codex n'est visible que dans le terminal.
- **Aperçu.** Deux segments « Escouade | Codex » dans l'en-tête, l'actif nommé, l'autre en icône. Quand Codex demande la confiance du dossier, une bande ambre au-dessus du terminal le dit (« sans confiance, il s'arrête »), et l'agent passe en tête de la barre latérale avec « Confiance du dossier : réponds dans son terminal ».

### Voix : dictée, conversation, réglages (`#dictation`, `#dictation-offer`, `#voice`, `#voice-question`, `#settings-voice`)

- **Aujourd'hui.** Micro, « Conversation » et trombone sont dans la barre du champ, entre le mode et Envoyer ; avec le menu du compte, la barre déborde vite dans une colonne étroite. Réglages › Voix se présente comme « Dictée des messages » alors qu'il règle aussi la conversation.
- **Aperçu.** La barre du champ garde à gauche ce qui règle l'agent (modèle, effort, mode) et met à droite, en icônes, ce qui part avec le message (joindre, dicter, converser), puis Stop et Envoyer. La dictée s'écoute dans le champ (niveau, durée, `Ctrl Espace` pour finir, `Échap` pour annuler) ; la première fois, l'offre de télécharger le modèle et sa progression au même endroit. La conversation est plein écran (direction A) : l'orbe, la phase (« te répond », « te pose une question »), les sous-titres « Toi » / l'agent, ce qui reste à dire en plus pâle, les choix d'une question dits comme ils se prononcent (« Le premier · Plafonner »), Pause et Arrêter. Un message dit à voix haute le reste dans la conversation (« Dit à voix haute », « Lu à voix haute »). Réglages › Voix : Dictée (micro, raccourci, langue, modèles avec vitesse et qualité, téléchargé / à télécharger / en cours) puis Conversation (voix par langue, licences, l'exception de Fuze dite en ambre, vitesse, délai avant l'envoi).
- **États.** À l'écoute ; transcription ; rien entendu ; modèle à télécharger, en cours, téléchargé ; voix indisponible (moteur absent) ; conversation en pause.

### Pièces jointes (`#attachments`, `#drop`, `#ticket`, `#board`)

- **Aujourd'hui.** Dans le formulaire du ticket, les images et les autres fichiers sont deux listes. Sur la carte du Kanban, rien ne dit qu'un ticket a des fichiers.
- **Aperçu.** Une seule rangée de puces, au message comme au ticket : vignette pour une image, icône pour un fichier, nom, taille, et ce qui lui arrive (« dans le message », « copié », « Fichier d'origine, lu là où il est ») ; un gros fichier en ambre (« joint là où il est »), une copie en cours avec sa barre. Glisser sur le champ l'entoure de la couleur du projet et dit ce qui part dans le message et ce qui part par son chemin. Sur la carte du ticket, un trombone et le nombre. Codex ne lit pas de PDF : dit dans Réglages › Harness, le PDF lui part par son chemin.
- **États.** Lu ; copie en cours ; gros fichier ; refusé (format, taille : puce rouge) ; trop de fichiers pour un ticket.

### Sous-agents et tâches de fond (`#subagent`, `#task`)

- **Aujourd'hui.** Leurs listes se déplient sous la carte de l'agent dans la barre latérale ; à 779 px de haut, avec Lancement et Terminaux, il reste deux ou trois agents visibles.
- **Aperçu.** Sur la carte, deux compteurs à côté du nom (↳ sous-agents, horloge pour les tâches de fond) ; la liste ne se déplie que pour l'agent ouvert. La vue d'un sous-agent : fil d'Ariane jusqu'à son agent, faits (type, modèle, tokens, outils, durée, tâche du plan), consigne repliée, son fil, et le champ « Lui écrire, par … » avec la raison (Claude Code ne permet pas d'écrire directement à un sous-agent). La vue d'une tâche : faits, sortie suivie en direct (« Suivre la fin »), Arrêter. À 820 px de haut et moins, Lancement et Terminaux se replient sur leur titre, un plantage toujours dit (« 1 planté »).
- **États.** En cours, terminé, échoué, arrêté, interrompu ; sortie vide, tronquée, illisible ; sous-agent fini (brouillon gardé, plus envoyable). Codex n'a pas de tâches de fond : ni compteur ni liste.

### Assistant « Nouveau projet » et projets fermés (`#wizard`, `#wizard-summary`, `#settings-projects`)

- **Aujourd'hui.** L'assistant (forme A, ESC-94) est en place ; les projets fermés sont listés dans Réglages › Projets.
- **Aperçu.** Le rail des étapes à gauche (faites cochées, l'actuelle cerclée, « facultatif »), le contenu à droite, « Créer sans l'assistant » toujours là. Le récapitulatif met d'abord ce qui empêcherait la méthode de marcher, chacun avec sa correction en un clic, puis ce qui sera réglé, harness compris. Réglages › Projets : « Harness par défaut », « Assistant de configuration », et « Projets fermés » (historique gardé, Rouvrir, Effacer ; dossier introuvable dit).

### Serveur MCP (`#codex`, `#settings-mcp`)

- **Aujourd'hui.** L'interrupteur unique et le journal d'activité sont au bas de Réglages › Harness.
- **Aperçu.** Un onglet « Serveur MCP » (Système) : l'interrupteur, où il est déclaré (par harness et par compte), les agents qui n'auront les outils qu'au prochain démarrage, puis l'activité (heure, qui, quoi, Fait / Refusé / Erreur). Dans la conversation, ce qu'un autre agent a fait porte « via Escouade » à côté de son auteur (« Autorisé pour cette session par chef-escouade », « Répondu par Claude (hors Escouade) »).

### Remote control (`#settings-claude`, `#agent-menu`)

- **Aujourd'hui.** Global dans Réglages › Harness, par projet dans Réglages › Projets, par agent au clic droit ; son état n'est qu'une icône et une infobulle sur la carte.
- **Aperçu.** Même place, dit « Claude Code seulement » ; l'icône de la carte prend le teal quand une session est connectée ; dans le menu de l'agent, l'état est écrit sous l'action (« Connecté depuis claude.ai »).

### Statistiques anonymes, mise à jour, intégrations (`#telemetry`, `#update`, `#update-failed`, `#settings-about`, `#settings-integrations`)

- **Aperçu.** La question du premier démarrage en une fenêtre courte, le détail replié, les deux réponses de même poids. La mise à jour prête : un élément de la barre d'état (« Mise à jour 1.8.0 prête · Redémarrer ») et une fenêtre qui dit ce que le redémarrage fait aux agents ; l'échec derrière un proxy reste écrit dans À propos (« Télécharger dans le navigateur »), pas seulement dans une notification. Linear est un service comme les autres dans Intégrations.

### Après la 2.0 : PR, CI et déploiements (`#hosts`)

- Leur place, sans détail : un troisième onglet du panneau git, « PR et CI », marqué « après la 2.0 », et la ligne « PR #41 → main » de la carte du ticket qui prendra l'état de la CI.

## Libellés anglais vérifiés (1028×779, captures `-en`)

- « Reserved for » ne tenait pas dans la colonne de 70 px des comptes : passée à 90 px.
- L'en-tête du Kanban (« After approval: squash merge → main », « Autopilot ») passait à la ligne : sous 1240 px, « Every slot is taken » s'efface et les contrôles ne coupent plus.
- Le titre de Lancement replié (« Launch 2/3 · 1 crashed ») ne tient qu'en effaçant « Stop all » : le bouton reste dans la ligne survolée de chaque commande.
- Les jauges de la barre d'état gardent le nom du harness et perdent les pourcentages sous 1240 px (« Claude 5h · W », « Codex 5h · W ») ; le pourcentage reste dans le panneau et pour les lecteurs d'écran.
- L'en-tête d'un agent tient en ne gardant que l'étiquette de la vue active ; « Bac à sable » / « Sandbox » devient une icône sous 1000 px de conversation.
- Tiennent tels quels : « New agent on … » et « Ctrl Shift N », les cinq modes et leur sens, « Continued on Codex », « Handover file », « Back to Claude Code », « Codex part estimated », « Listening », « Said aloud », « Follow the end », « Add an account… », les onglets de réglages (« MCP server »).

## Choix validés par l'utilisateur le 2026-10-17

Tous les choix ci-dessous ont été validés sur les captures : c'est le design que suivent les lots ESC-71 à 85.

1. **Ctrl+Maj+N** ouvre le menu « Harness » du nouvel agent (raccourci nouveau) ; Claude Code ou Codex pas installé y est grisé avec où le régler, alors qu'aujourd'hui une fonction absente est cachée.
2. **Réglages réorganisés** : un onglet « Serveur MCP » (Système) prend l'interrupteur et le journal, qui quittent Réglages › Harness ; « Quand un quota est épuisé » réunit dans Comptes la reprise sur un autre compte, la passation automatique, l'ordre des harness et le modèle de passation (aujourd'hui partagés entre Harness et Comptes). Réglages › Harness devient un groupe par harness.
3. **Bascule de vue en deux segments** (« Escouade | Codex ») au lieu d'un bouton qui nomme l'autre vue.
4. **Barre du champ réordonnée** : joindre, dicter et converser passent à droite, en icônes ; « Conversation » perd son mot (infobulle et `Ctrl+Maj+Espace`, raccourci nouveau).
5. **« Éditeur » retiré de l'en-tête de l'agent** : il reste dans la barre de titre (doublon), la place va à la bascule de vue et au menu « … ».
6. **Menu de l'agent aussi par « … »** dans l'en-tête (aujourd'hui au clic droit seulement).
7. **Barre d'état : un groupe de jauges par harness** au lieu de celui du seul harness des nouveaux agents ; le total du jour prend « ≈ » dès qu'il contient de l'estimé.
8. **Bac à sable affiché** dans l'en-tête d'un agent Codex (mot nouveau dans l'interface : « Bac à sable » / « Sandbox »).
9. **Lancement et Terminaux repliés** sur leur titre dans une fenêtre de 820 px de haut ou moins.
10. **Sous-agents et tâches de fond** : deux compteurs sur la carte, la liste dépliée seulement pour l'agent ouvert.
11. **Pièces jointes du ticket** en une seule rangée (images et fichiers ensemble), et le trombone avec le nombre sur la carte du Kanban.
12. **Accueil sans harness** : « Chercher à nouveau » relance la détection sans redémarrer l'app.
13. **Échec de mise à jour** gardé dans Réglages › À propos tant qu'il dure, en plus de la notification.

# Lot 0 bis (ESC-150, 2026-10-23) : les fonctionnalités de la 1.8.0 à la 1.8.9

Ce lot étend l'aperçu à ce que la 1.8.0 à la 1.8.9 ont ajouté et qu'il ne dessinait pas, dans les deux thèmes (ESC-129), chaque surface à son adresse. Il part de `CHANGELOG.md` (1.8.0 à 1.8.9), puis des composants de `src/` et des catalogues `src/lib/i18n/{fr,en}` pour les vrais libellés et états ; rien n'a changé dans `src/`. Les vues « Pull requests » et « Environnements » du projet (ESC-65, ESC-67) n'y sont pas : elles se dessinent dans leurs tickets.

**La règle des harness change.** Celle du lot 0 (« Claude Code et Codex, eux seuls », 2026-10-17) devient : **les quatre harness que l'app connaît, Claude Code, Codex, OpenCode et Copilot CLI ; Cursor CLI reporté**, absent de l'aperçu. Leurs marques sont des mots dans un filet : « Claude », « Codex », « OpenCode », « Copilot ».

**Ce qui partage une surface avec le lot 0** (barre d'état, panneau des quotas, liste des agents) n'apparaît qu'aux adresses de ce lot : les captures des autres écrans restent celles validées, octet pour octet. Le design à suivre est celui des adresses ci-dessous.

## Adresses

Nouvelles (`index.html#…`, avec `?lang=en` ou `?theme=light` avant le `#`) :
- harness et comptes : `#harness-opencode`, `#accounts-copilot`, `#accounts-quotas`, `#account-machine`, `#no-account`, `#welcome-account` ;
- quotas : `#overage` (et `#quota`, changé) ;
- les nouveaux harness dans la conversation : `#opencode`, `#modes-opencode`, `#copilot`, `#models`, `#opencode-view`, `#copilot-view` ;
- agents : `#switch-account`, `#waiting`, `#run-worktree`, `#run-conflict`, `#worktree-kept` ;
- PR d'un agent : `#pr-open`, `#pr` ;
- voix : `#voice-live`, `#dictation-live`, `#settings-voice-online`, `#voice-online-voice` ;
- réglages : `#code-hosts`, `#private`, `#private-accounts`, `#escouade-yml`, `#escouade-yml-pending`, `#escouade-yml-board`, `#worktree-cleanup` ;
- assistant : `#wizard-private`.

Changées (écrans du lot 0 mis à jour à leur adresse) : `#new-agent`, `#agent-menu`, `#quota`, `#account-codex`, `#voice-question`, `#welcome`, `#settings-claude` (Harness), `#settings-accounts`, `#settings-app`, `#settings-voice`, `#settings-board`, `#settings-projects`, `#settings-integrations`, `#settings-mcp`, `#settings-about`.

Déjà dessiné, rien à changer : le modèle réel d'un sous-agent (1.8.9) est la ligne « Modèle » de `#subagent`.

## Libellés anglais vérifiés (1028×779, captures `-small-en`)

- Le menu « Harness » tient avec « The project’s · Main · Opus 5.5 · Auto » et « Add an account… » sur la ligne de Copilot CLI.
- Sous une carte, « Agent addresses the feedback » tient à côté du numéro de PR seulement si l'état passe dans l'infobulle : c'est le choix 26.
- « Wakes at 15:30 » tient à la place de l'état ; « Driven agents · 2 at work » comme le titre des sous-agents.
- Réglages › Comptes : « The harness’s (Sonnet 5.5) » tient dans le menu du modèle d'un compte.
- Sous 1240 px de large, la barre d'état perd aussi les projections et « extra usage », comme les pourcentages au lot 0 : ils restent dans le panneau.
- À 820 px de haut et moins, les lancements dans un worktree se replient avec Lancement (choix 9 du lot 0).

## Choix validés par l’utilisateur le 2026-10-23 (à la suite des 13 du lot 0)

14. **Quatre harness, mêmes règles** que le lot 0 : mêmes places, mêmes mots, la différence dite là où elle compte. Raison : l'app les fait tourner depuis la 1.8.0 ; le lot 0 n'en connaissait que deux. Adresses : `#new-agent`, `#opencode`, `#copilot`.
15. **Le menu « Harness » numérote ses harness** (`1` à `4` une fois ouvert par `Ctrl Maj N`) au lieu d'un raccourci global par harness, et garde un harness sans compte à sa place, avec « Aucun compte » et « Ajouter un compte… ». Raison : quatre raccourcis ne se retiennent pas ; l'absence de compte se voit avant de créer l'agent, pas à son démarrage. `#new-agent`.
16. **Le même menu porte l'agent sans worktree** (ou dans un worktree, l'inverse du réglage du projet), sous un titre « Worktree ». Raison : un seul menu à côté de « Nouvel agent », comme dans l'app 1.8.9. `#new-agent`.
17. **Ce qu'un harness n'a pas reste à sa place, grisé avec sa raison** (le mode Auto d'OpenCode : « OpenCode n'a pas de mode Auto »), alors que l'app 1.8.0 le masque. Raison : la règle du lot 0 « les cinq modes aux mêmes places » ; un mode qui disparaît fait chercher. `#modes-opencode`.
18. **Les réglages des nouveaux agents sont une ligne de la fiche de chaque compte** (modèle, effort, mode, toujours visibles), et « Compte de la machine » une marque sur la ligne du dossier. Réglages › Harness ne garde que l'exécutable, la version et ce qui vaut pour tous, sans « Se connecter… ». Raison : la 1.8.1 les a passés au compte ; les voir d'un coup d'œil évite d'ouvrir chaque compte. `#settings-accounts`, `#settings-claude`.
19. **Un harness sans compte reste visible partout où il compte** : son groupe dans Comptes avec un bouton principal « Ajouter un compte Copilot CLI… », l'accueil « Aucun compte » avec le compte trouvé sur la machine, et la carte ambre d'un agent créé sans compte, qui propose aussi « Continuer sur Claude Code » (le harness du projet). Raison : rien ne démarre en silence (1.8.1), et la sortie est à un clic. `#accounts-copilot`, `#welcome-account`, `#no-account`.
20. **« Changer de compte à » en segments** (80 %, 90 %, 95 %, « À la limite ») en tête de « Quand un quota est épuisé », et la projection dans un groupe « Quotas ». Raison : les deux seuils (pause, changement) se lisent ensemble. `#accounts-quotas`.
21. **La barre d'état ne montre une projection que quand elle passe 80 %** (orange, rouge au-delà de 100 %) ; le panneau les montre toutes. L'app 1.8.9 les montre toujours. Raison : avec quatre harness, la barre n'a pas la place, et une projection verte ne demande rien. `#quota`.
22. **L'usage supplémentaire facturé est un mot ambre dans le groupe du harness** (« usage supplémentaire »), sa phrase sous le compte dans le panneau. Raison : il coûte de l'argent, il doit se voir sans ouvrir le panneau. `#overage`.
23. **OpenCode montre son coût du jour sur son budget** (« 0,42 $ / 5 $ ») à la place des jauges, et Copilot CLI une jauge « crédits » remise à zéro le 1er du mois. Raison : ce sont leurs vraies limites. `#quota`.
24. **Un changement de compte au seuil se lit comme une passation** : un séparateur « Suite sur le compte Pro · Principal est à 90 % de sa fenêtre de 5 h », les tours suivants marqués de leur compte, et une notification. Raison : même geste que le changement de harness du lot 0. `#switch-account`.
25. **« Attend » et l'heure de relance** remplacent « Terminé », avec un anneau vide (le tour est fini, pas le travail), et l'infobulle dit quoi ; les agents pilotés se replient sous la carte comme les sous-agents. Raison : « Terminé » mentait (1.8.9). `#waiting`.
26. **Les PR d'un agent sous sa carte : un numéro avec le glyphe de son état et le seul bouton de correction utile** (« L'agent corrige », « L'agent corrige les retours »), l'état en mots dans l'infobulle ; la PR de l'agent ouvert à côté de sa branche dans l'en-tête. « Ouvrir une PR » prend la place de « Préparer le lancement » dans l'en-tête tant que la branche a des commits sans PR ; le lancement reste dans « … ». Raison : la colonne fait 250 px, et l'en-tête n'a qu'une place de bouton (choix 5). `#pr`, `#pr-open`.
27. **Les hébergeurs de code en tête de Réglages › Intégrations**, une ligne par instance : vert connecté, ambre droits manquants, rouge jeton expiré avec « Reconnecter… » en bouton principal ; un hébergeur sans compte est nommé avec le projet qui en a besoin. Raison : ils servent les PR de chaque agent, Jira et Trello seulement les tickets importés. `#code-hosts`.
28. **Un projet privé porte un cadenas sur son onglet** ; dans ses réglages, « Ses fichiers » est un tableau harness par harness (« Garde-fou » neutre, « Barrière » verte) et « Ses comptes » dit le compte réservé et, en ambre, le compte partagé avec de quoi y remédier. Ces deux parties n'apparaissent que pour un projet privé. Raison : dire honnêtement ce qui protège (ESC-140), sans charger les projets ordinaires. `#private`, `#private-accounts`.
29. **Trois marques pour l'origine d'un réglage** : teal « Défini par .escouade.yml », neutre « Réglage local de cette machine » (avec « Écrire dans .escouade.yml » et « Reprendre la valeur du fichier »), ambre « en attente de ton accord » ; les commandes à approuver se lisent en entier dans un bloc ambre, et le Kanban le rappelle par une bande « Les lire ». Raison : une commande venue du dépôt ne tourne jamais sans avoir été lue. `#escouade-yml`, `#escouade-yml-pending`, `#escouade-yml-board`.
30. **Le ▶ d'une commande ouvre « Dans le projet / Dans le worktree de … »** dès qu'un agent a un worktree, et le lancement tourne sous le nom de l'agent dans Lancement ; relancer ce qui tourne ailleurs demande, « Arrêter l'autre et lancer » en premier. Raison : le choix du dossier se fait au moment de lancer, sans réglage. `#run-worktree`, `#run-conflict`.
31. **Un worktree gardé se dit en ambre sous la carte archivée** (« worktree gardé : 2 commits ni mergés ni poussés ») et dans la notification de la validation ; « Nettoyer » liste ce qu'il garde et pourquoi. Raison : rien ne se perd sans qu'on le sache (ESC-143). `#worktree-kept`, `#worktree-cleanup`.
32. **En conversation vocale, une question à la fois** : « Question 1 sur 2 », les choix en touches numérotées sous les sous-titres, et « Dis le choix, son numéro, ou ta propre réponse ». Raison : les choix s'affichent sans être lus (1.8.2). `#voice-question`.
33. **La transcription en direct s'écrit en plus pâle**, suivie de « ElevenLabs · en direct » (point rouge), dans la dictée comme dans la conversation. Raison : on voit que le texte n'est pas fini et qu'il part en ligne. `#dictation-live`, `#voice-live`.
34. **Réglages › Voix : « Transcription » puis « Conversation », chacun avec « Local | En ligne » en segments** ; en ligne, service, modèle, clé, temps réel et ce qui part, écrit sous le choix ; la voix locale de secours dite en une ligne. Raison : la même question (sur ma machine ou en ligne ?) pour les deux sens de la voix. `#settings-voice`, `#settings-voice-online`, `#voice-online-voice`.
35. **Le zoom en segments** (90 à 150 %), le palier trop grand pour la fenêtre grisé, et « Modèle des textes rédigés » dans un groupe « Textes rédigés ». Raison : les paliers usuels d'un clic. `#settings-app`.
36. **Un long menu de modèles** : recherche, « Favoris » (étoile pleine à la couleur du projet), un groupe par famille ou éditeur, le coût ×N à droite. Raison : celui de l'app 1.8.1, dans le monde visuel de l'aperçu. `#models`.
37. **La vue OpenCode porte une bande verte « Escouade garde le fil »** au lieu de la bande ambre de confiance des vues Codex et Copilot CLI. Raison : c'est la seule vue terminal où la conversation reste à jour. `#opencode-view`, `#copilot-view`.
38. **Les nouvelles demandes de la conversation reprennent les cartes du lot 0** : « Toujours autoriser » d'OpenCode dit le motif gardé avant le clic ; le plafond de crédits de Copilot CLI est une carte ambre comme la limite d'usage (« Ajouter 50 crédits », « Lever le plafond », « Arrêter là ») ; le formulaire d'un serveur MCP, une carte à champs. Raison : une demande, une carte, quel que soit le harness. `#opencode`, `#copilot`.
