# Le serveur MCP

Le serveur MCP d’Escouade laisse Claude (dans un terminal, un autre outil ou un agent d’Escouade) lire tes projets, tes agents et tes tickets, créer, modifier et lancer des tickets, régler le Kanban d’un projet et piloter des agents, y compris répondre à leurs demandes, sous les mêmes garde-fous que le pilote auto.

## À quoi il sert

MCP (Model Context Protocol) est le protocole par lequel Claude Code appelle des outils. Escouade embarque un serveur MCP : une fois déclaré dans Claude Code, il donne à Claude les outils de la liste plus bas.

- **Claude dans un terminal** : tu lances `claude` où tu veux et tu lui parles d’Escouade (« liste les tickets à tester du projet api », « crée un ticket pour limiter les tentatives de connexion, puis lance-le »).
- **Un autre outil** qui parle MCP peut se connecter de la même façon (voir [Jeton et réseau](#jeton-et-reseau)).
- **Un agent d’Escouade**, de n’importe quel projet, avec un jeton à lui (voir [Les agents d’Escouade et le serveur](#les-agents-d-escouade-et-le-serveur)).

Le serveur tourne sur ta machine seule. Il ne sert qu’à lire et à commander ; il ne lance aucune commande, ne merge rien et ne supprime rien. Il peut répondre à la demande d’un agent à ta place, mais jamais par « Toujours autoriser » : une règle de permission qui dure reste ta décision, dans la fenêtre.

## Activer « Claude et les agents peuvent piloter Escouade »

Un seul interrupteur donne le serveur à Claude hors d’Escouade et aux agents d’Escouade de tous les projets.

1. Ouvre Réglages › Claude Code. Le groupe « Escouade dans Claude » a l’interrupteur « Claude et les agents peuvent piloter Escouade ».
2. Allume-le. Il s’enregistre tout de suite, sans « Enregistrer » : la déclaration écrit dans la config de Claude Code de chaque compte, ce qu’« Annuler » ne pourrait pas défaire.

Escouade démarre alors le serveur et le déclare dans Claude Code pour chaque compte actif, avec la commande `claude mcp add --scope user --transport http escouade <adresse> --header "Authorization: Bearer <jeton>"`, lancée comme le compte lance Claude Code (son exécutable, son dossier de configuration). L’entrée se range dans le `.claude.json` du compte (`~/.claude.json` pour « Principal »). L’onglet dit « Déclaré dans Claude · compte Principal, compte Pro ».

- Une entrée déjà à jour est laissée telle quelle. Une entrée différente (un autre port, un autre jeton) est remplacée. Un compte ajouté ou réactivé plus tard reçoit la déclaration.
- Si elle échoue pour un compte, l’onglet le dit (« Pas déclaré pour le compte Pro : … ») et affiche la commande à lancer à la main (« À lancer à la main dans PowerShell : »), écrite pour PowerShell sous Windows et pour `sh` ailleurs. Le jeton y est masqué à l’écran ; « Copier la commande » copie la vraie.
- Éteindre l’interrupteur change le jeton tout de suite, puis retire l’entrée de chaque compte. Les agents déjà lancés perdent les outils tout de suite eux aussi (leurs jetons sont oubliés) : rallumé, l’interrupteur les leur rend au prochain démarrage de leur processus (« Relancer »). Supprimer un compte retire la sienne.
- Si le serveur ne démarre pas, l’onglet le dit (« Le serveur n’a pas démarré : … »).

Claude Code connaît le serveur sous le nom `escouade` : ses outils s’appellent `mcp__escouade__<outil>` (par exemple `mcp__escouade__list_tickets`).

> [!NOTE]
> Sous Windows avec Claude Code dans WSL, les outils MCP d’Escouade demandent le réseau miroir de WSL : `networkingMode=mirrored` sous `[wsl2]` dans `%UserProfile%\.wslconfig`, puis `wsl --shutdown`. Réglages › Claude Code le rappelle quand le réseau de WSL est en NAT.

## Les outils

Dans les arguments, un projet se nomme par son id ou son nom (casse libre), un agent par son id ou son nom, un ticket par sa clé (`ATL-12`, casse libre) ou son id. Les réponses sont en JSON.

### Lire

Ces huit outils ne changent rien.

| Outil | Arguments | Ce qu’il rend |
|---|---|---|
| `list_projects` | aucun | Les projets, dans l’ordre de l’app : id, nom, dossier, branche git courante, nombre d’agents (archivés exclus) et nombre de tickets dans chaque colonne. |
| `list_agents` | `project` (facultatif) | Les agents non archivés, du plus ancien au plus récent, de tous les projets ou d’un seul : id, nom, projet, état (`idle`, `running`, `waiting`, `done` ou `error`), si une question ou une autorisation attend ta réponse et combien, clé de leur ticket, modèle, compte Claude et coût en dollars. |
| `list_tickets` | `project`, `column` (facultatif : `todo`, `doing`, `review` ou `done`) | Les tickets d’un projet dans l’ordre du Kanban : id, clé, titre, colonne, clés des tickets qu’ils attendent, nom de leur agent et motif du blocage. |
| `get_ticket` | `ticket` | Un ticket entier : titre, description, critères (atteints ou non, avec la note de l’agent), boucles (la courante et le maximum), colonne, tickets attendus, avancement, ticket externe d’origine (Jira, Trello, GitHub ou Linear) et, quand il en a un à lui, son modèle et son effort. Un agent d’Escouade peut omettre `ticket` pour lire le sien. |
| `get_usage` | aucun | Le quota de chaque compte Claude : si les nouveaux agents y partent maintenant, l’usage de ses fenêtres de 5 h et hebdomadaire (`pct` de 0 à 100, `resetsAt`), et pourquoi le pilote auto retient les tickets (`reason` : `fiveHour`, `week` ou `limit`), jusqu’à quand. |
| `get_board` | `project` | Les réglages du Kanban d’un projet, ceux de l’onglet « Kanban » de ses réglages : `project` et `projectId` (le nom du projet et son id), `action` (ce que fait « Valider » : `merge`, `pr`, `push` ou `keep`), `target` (la branche cible ; la branche courante du projet tant que le Kanban n’en a pas), `strategy` (`merge`, `squash` ou `rebase`), `draft`, `cleanup`, `conventional`, `conflict` (`ask`, `agent` ou `abort`), `maxParallel`, `autopilot`, `model`, `effort` et `mode` des agents de tickets (vides : ceux de l’app, que `defaults` donne), `testsFirst` (vrai seulement si le Kanban a une commande de test), `testCommand` et `prefix`. Ouvert à tous les projets. La réponse redonnée telle quelle à `set_board` est acceptée et ne change rien. |
| `get_agent_summary` | `agent`, `project` (facultatif) | Un agent sans sa conversation : id, nom, état, clé du ticket, dernier message (2 000 caractères au plus ; un message plus long donne son début et sa fin) et fichiers modifiés (les 100 derniers au plus), avec le nombre et le type des demandes qui attendent une réponse. |
| `list_requests` | `agent` (facultatif), `project` (facultatif) | Les questions et les demandes d’autorisation qui attendent ta réponse, d’un agent, d’un projet ou de tous, dans l’ordre où elles sont venues : l’agent et la clé de son ticket, `request` (l’id que nomment les deux outils de réponse), `type` (`permission`, `question`, ou `plan` pour un plan à approuver), depuis quand, l’outil et ce sur quoi il agit (la commande, le fichier, le plan entier), tout ce que Claude Code a envoyé (le contenu d’un fichier à écrire, les chaînes d’un Edit, les options d’une commande), la raison, si Claude Code la refuserait par défaut, et pour une question ses questions avec leurs options et si plusieurs se choisissent. `cut` dit si un texte a été coupé : la demande entière est dans la conversation. Un agent en vue Claude Code n’a rien ici : ses demandes sont dans son terminal. |

### Agir

Ces outils font ce que tu ferais dans la fenêtre, par les mêmes fonctions : la fenêtre est prévenue, les tickets externes suivent et le Kanban se met à jour.

| Outil | Arguments | Ce qu’il fait |
|---|---|---|
| `create_ticket` | `project`, `title`, `description`, `criteria`, `after` | Crée un ticket « À faire » au bas de la colonne. `criteria` est une liste (deux critères par défaut sans elle), `after` les tickets qu’il attend, par clé ou id. Avec le pilote auto allumé, il part dès qu’une place est libre et que ses prédécesseurs sont terminés. Sa description se termine par « Créé par `<auteur>` via Escouade ». |
| `update_ticket` | `ticket`, `title`, `description`, `criteria`, `after` | Modifie un ticket « À faire », champ par champ : ce qui est omis reste. `criteria` et `after` remplacent la liste entière. Un ticket déjà parti ne se modifie pas, une dépendance qui ferait attendre deux tickets l’un l’autre est refusée. Si titre, description ou critères changent, la dernière ligne de la description devient « Modifié par `<auteur>` via Escouade ». |
| `move_ticket` | `ticket`, `position` (`top`, `bottom` ou `before`), `before` | Place un ticket « À faire » en tête, en bas, ou juste avant un autre ticket « À faire » du projet (`before`). Rend les clés de la colonne dans leur nouvel ordre. |
| `set_board` | `project`, et au choix `action`, `target`, `strategy`, `draft`, `cleanup`, `conventional`, `conflict`, `maxParallel`, `autopilot`, `model`, `effort`, `mode`, `testsFirst` | Règle le Kanban d’un projet, comme sa fenêtre de réglages : seuls les champs donnés changent, et `""` pour `model`, `effort` ou `mode` remet celui de l’app. Les contrôles sont ceux de la fenêtre : un modèle connu, un effort parmi `low`, `medium`, `high`, `xhigh` ou `max`, un mode parmi `auto`, `default`, `plan` ou `acceptEdits`, une branche cible locale du projet, de 1 à 6 tickets en parallèle. La fenêtre se met à jour et le Kanban se replanifie : allumer le pilote auto peut démarrer des tickets. Le changement vaut pour les prochains agents de tickets, pas pour ceux déjà lancés. Rend le Kanban après le changement, au format de `get_board`. Un agent qui mène le Kanban peut ainsi passer les agents de tickets sur Sonnet pour ménager le quota. La réponse de `get_board` redonnée telle quelle est toujours acceptée et ne change rien : une `target` égale à celle du Kanban (même vide) ou à celle que `get_board` montre est laissée telle quelle, sans contrôle, et `testsFirst` n’est refusé sans commande de test que pour l’allumer. Un agent d’Escouade règle ainsi le Kanban de son propre projet, mode compris. Avec Haiku, qui n’a ni effort ni mode Auto, les agents de tickets partent sans effort et, si le mode est `auto`, en mode « Demander ». |
| `start_ticket` | `ticket`, `model`, `effort` | Lance un ticket « À faire » comme le bouton « Lancer » : son agent démarre dès qu’une place est libre. Rend la main une fois le ticket en file ; suis-le avec `get_ticket`. `model` et `effort` ne valent que pour ce ticket et passent avant ceux du Kanban pour son agent (garder `opus` sur un ticket d’architecture quand le Kanban est sur `sonnet`) : `""` remet ceux du Kanban, omis ils ne changent pas, avec les mêmes contrôles que `set_board`. Rend `key`, `starting`, et le `model` et l’`effort` avec lesquels son agent partira (ceux du ticket, sinon du Kanban, sinon de l’app) ; l’`effort` manque quand ce modèle n’en prend pas (Haiku, dont l’agent part aussi en mode « Demander » si son mode serait `auto`). Le ticket garde les siens s’il est renvoyé puis relancé. Sa carte les montre, sans l’effort avec Haiku, à côté de sa clé (« Opus · Max »). |
| `create_agent` | `project`, `message`, `worktree`, `model` | Crée un agent dans un projet, avec son premier message, sans changer l’agent que tu regardes. `worktree` (vrai ou faux) dit s’il travaille dans un worktree à lui, sinon le projet décide ; `model` se nomme comme dans Claude Code (`sonnet`, `opus`, `haiku`…). Rend l’id et le nom de l’agent. |
| `send_message` | `agent`, `project`, `text` | Écrit à un agent. Un agent au travail lit le message après son tour en cours (la réponse dit `queued`). |
| `stop_agent` | `agent`, `project` | Interrompt le tour en cours d’un agent, comme le bouton stop de sa conversation. L’agent reste, et peut recevoir un message ensuite. |
| `answer_permission` | `agent`, `project`, `request`, `decision` (`allow` ou `deny`), `message` | Répond à une demande d’autorisation d’un agent comme « Autoriser » et « Refuser » de sa carte, ou approuve (`allow`) ou renvoie (`deny`) son plan. `message`, avec `deny`, dit à l’agent pourquoi, ou quoi faire à la place. « Toujours autoriser » n’est pas offert (`always` est refusé) : une règle durable reste ta décision, dans la fenêtre. La carte de la demande, dans la conversation de l’agent, dit qui a répondu (« Autorisé par `<auteur>` via Escouade »), et l’agent lit qui a refusé. |
| `answer_question` | `agent`, `project`, `request`, `answers` | Répond à une question d’un agent comme sa carte de question : pour chaque question (`question`, son texte, qu’on peut omettre quand il n’y en a qu’une), les libellés des options choisies (`choices`, plusieurs seulement quand la question l’accepte) ou un texte libre (`text`). Chaque question veut une réponse. La carte dit « Répondu par `<auteur>` via Escouade », et l’agent lit chaque réponse suivie de son auteur. |

Un titre fait 200 caractères au plus, une description 10 000, et un ticket 30 critères de 500 caractères au plus. Un ticket créé par le serveur a le nombre de boucles par défaut, 5, et sa propre branche.

### Réservés aux agents d’Escouade

Ces deux outils sont refusés à Claude hors Escouade.

| Outil | Arguments | Ce qu’il fait |
|---|---|---|
| `report_progress` | `line` | Publie une ligne d’état de 120 caractères au plus, sur ce que l’agent fait. Elle s’affiche sous son nom dans la barre latérale et la vue d’ensemble, et sur la carte de son ticket « En cours », jusqu’à son prochain appel. Une ligne vide l’efface. |
| `split_ticket` | `tickets`, `chain` | Découpe ce qui reste du ticket de l’agent en dix tickets « À faire » au plus, après le sien. Avec `chain` vrai (par défaut), chacun vient après le précédent et le premier après le ticket de l’agent ; faux, tous viennent après le ticket de l’agent seul et peuvent tourner en parallèle. Refusé à un agent sans ticket. Rend les clés des tickets créés. |

## Les garde-fous

Les outils qui agissent suivent les règles de la fenêtre et du pilote auto :

- **Quota.** Aucun ticket (`start_ticket`) ni agent (`create_agent`) ne démarre quand aucun compte n’est utilisable pour le projet : pause du pilote auto, fenêtre de quota au-dessus du seuil de « Pause au-delà du quota », limite d’usage, agent qui attend sa remise à zéro. Un seul compte libre suffit. Le refus dit jusqu’à quand (« Le pilote auto est en pause jusqu’à 14:30 : la fenêtre de 5 h est utilisée à 96 %. Réessaie à ce moment-là. »). `send_message` est refusé quand le compte de l’agent est retenu ainsi (les agents d’un autre compte peuvent encore recevoir un message).
- **En parallèle.** Le maximum de tickets « En parallèle » du projet n’est pas dépassé par `start_ticket`, ni son maximum d’agents qui travaillent en même temps par `create_agent`.
- **Dépendances.** Un ticket qui vient après des tickets non terminés n’est pas lancé sans eux : le refus dit lesquels, et `update_ticket` retire les dépendances. Une dépendance circulaire est refusée.
- **Régler le Kanban.** Le modèle et l’effort ont les contrôles de la fenêtre dans les deux outils, `set_board` et `start_ticket` : un modèle inconnu, ou un effort hors de la liste, est une erreur. Le reste ne vaut que pour `set_board` (`start_ticket` n’a pas de mode). Il refuse `bypassPermissions` : lancer des agents sans aucune demande de permission reste ta décision, dans la fenêtre, comme « Toujours autoriser » (il est accepté seulement s’il est déjà le mode du Kanban, pour changer autre chose sans le défaire) ; les autres modes (`auto`, `default`, `plan`, `acceptEdits`) se règlent comme dans la fenêtre, y compris par un agent d’Escouade pour le Kanban de son propre projet. Il refuse aussi `testsFirst` sans commande de test, pour l’allumer seulement : le serveur ne lance aucune commande et ne change pas celle du Kanban, qui se règle dans la fenêtre. Un mode hors de la liste, une branche cible qui n’est pas une branche locale du projet (sauf celle que le Kanban a déjà, même vide, ou celle que `get_board` montre : elle est laissée telle quelle), un « En parallèle » hors de 1 à 6, ou aucun champ à changer, est une erreur.
- **Le Kanban.** `start_ticket` est refusé quand le Kanban du projet ne démarre rien pour l’instant (la branche cible n’a aucun commit ou est introuvable, aucun compte actif ne sert le projet) ; le refus dit pourquoi.
- **Les agents d’Escouade** n’agissent que dans leur propre projet, Kanban compris (ils lisent les autres), ne s’écrivent pas à eux-mêmes, ne s’arrêtent pas eux-mêmes et ne répondent pas à leurs propres demandes. On n’écrit pas à un agent archivé.
- **Répondre à une demande.** Une fois « Claude et les agents peuvent piloter Escouade » allumé, tout client du serveur voit les demandes de tous les projets et peut y répondre, Claude hors Escouade comme les agents, sans réglage de plus ; un agent ne répond qu’à celles des agents de son propre projet, jamais aux siennes. `answer_permission` n’offre que `allow` et `deny` : « Toujours autoriser » reste ta décision, dans la fenêtre. Une demande qui n’attend plus de réponse (tu y as répondu dans la fenêtre, un autre client aussi, ou l’agent ne tourne plus) est refusée, et si deux réponses arrivent en même temps, une seule passe. Un agent en vue Claude Code n’a rien à répondre ici : ses demandes sont dans son terminal.
- **Aucun outil** ne lance une commande ou un test, ne merge, ni ne supprime (projet, agent ou ticket). Un agent poussé par un contenu piégé ne peut donc pas s’en servir pour monter en droits. L’exception est la réponse aux demandes des agents : avec l’interrupteur allumé, un agent peut autoriser, une demande à la fois et jamais pour de bon, ce qu’un autre agent de son projet demande.
- **Ce qui vient du serveur n’est jamais pris pour toi.** Un message envoyé à un agent (`send_message`, premier message de `create_agent`) est lu par l’agent et montré dans sa conversation sous « Message de `<auteur>` : », l’auteur étant le nom de l’agent qui l’envoie ou « Claude (hors Escouade) ». Un ticket créé ou découpé par le serveur se termine par « Créé par `<auteur>` via Escouade », un ticket modifié par « Modifié par `<auteur>` via Escouade », sur sa carte comme dans le protocole de son agent. La carte d’une demande à laquelle le serveur a répondu dit qui l’a fait (« Autorisé par `<auteur>` via Escouade », « Refusé par `<auteur>` via Escouade », « Répondu par `<auteur>` via Escouade »), et un refus, comme chaque réponse à une question, dit à Claude de qui il vient, pas que c’est toi (« Refusé par `<auteur>` via Escouade », « SQLite (réponse de `<auteur>` via Escouade) »).

Une demande d’autorisation d’un outil d’Escouade le nomme en clair (« Escouade · Créer un ticket », « Escouade · Lancer un agent »…) et montre ce que Claude lui donne, un argument par ligne. Une valeur de plus de 2 000 caractères est coupée : la carte dit combien ne sont pas montrés et renvoie à la conversation.

## Les agents d’Escouade et le serveur

L’interrupteur « Claude et les agents peuvent piloter Escouade » sert aussi les agents d’Escouade, ceux de tous les projets : il n’y a rien à permettre dans les réglages d’un projet.

- **Allumé**, chaque agent reçoit le serveur au démarrage de son processus, avec un jeton à lui : il agit en son nom, jamais comme Claude hors Escouade. Il lit les tickets et les agents, et peut créer des tickets ou lancer d’autres agents, ce qui dépense du quota. Il voit aussi les questions et les demandes d’autorisation des agents de tous les projets, et peut répondre à celles des agents de son propre projet.
- **Éteint**, les agents déjà lancés perdent les outils tout de suite, et Escouade tient son serveur à l’écart de chaque agent qui démarre, même si une entrée `escouade` reste dans ta config de Claude Code : ses outils sont refusés, et le serveur lui-même n’est pas chargé (Escouade démarre l’agent avec le réglage `deniedMcpServers` de Claude Code). L’agent ne reçoit donc ni les outils, ni les instructions du serveur.
- **Un agent déjà lancé** quand tu allumes l’interrupteur garde un processus sans les outils. Sa conversation affiche « Outils d’Escouade au prochain démarrage » avec « Relancer » : son processus s’arrête et le suivant reprend la même session : la conversation reste, une commande lancée en arrière-plan s’arrête. Le bouton attend qu’il ait fini ce qu’il fait (son tour, ta réponse, la préparation de son worktree, un sous-agent ou un workflow en arrière-plan). En vue Claude Code, « Relancer » redémarre son interface. Réglages › Claude Code dit combien d’agents sont dans ce cas.
- Ce n’est pas un cloisonnement : un agent n’agit que dans son propre projet, mais lit les autres.

Le serveur tourne tant que l’interrupteur est allumé, et s’arrête avec l’app.

> [!NOTE]
> Jusqu’à la 1.7, chaque projet avait son interrupteur « Les agents peuvent utiliser Escouade » (Réglages › Projets › Serveur MCP). Il n’existe plus : un projet qui l’avait allumé alors que « Claude peut piloter Escouade » était éteint ne donne plus le serveur à ses agents tant que tu n’allumes pas « Claude et les agents peuvent piloter Escouade ».

Dans une conversation, un appel à un outil d’Escouade porte l’étiquette « Escouade · » suivie de son nom (« Escouade · Lire un ticket », « Escouade · Régler le Kanban », « Escouade · Donner son avancement »).

## L’activité MCP

Réglages › Claude Code › « Activité MCP » garde les 200 derniers appels et refus, les plus récents en tête, mis à jour en direct. Chaque ligne donne :

- l’heure (au survol, la date) ;
- l’appelant : le nom de l’agent, « Claude (hors Escouade) », ou « Client inconnu » pour une requête refusée avant que son jeton dise d’où elle vient ;
- l’outil, et en bref ce qui lui a été demandé (jamais un jeton) ;
- le résultat : « Fait », « Refusé » ou « Erreur », avec la raison pour les deux derniers (colorés en alerte).

Pour un `set_board` réussi, la ligne garde ce qui a été demandé et dit aussi ce qui a changé : chaque champ changé avec sa valeur avant et après (« model: opus → sonnet · effort: (défaut) → medium »), ou « Aucun changement ».

« Effacer » vide la liste. Le journal n’est pas enregistré : il repart à zéro au prochain démarrage d’Escouade.

Sont aussi refusées, et notées : une requête sans jeton (« Requête refusée : pas de jeton »), avec un jeton inconnu, avec un en-tête `Host` inattendu, avec un en-tête `Origin` (une page web), ou vers un autre chemin que celui du serveur.

## Jeton et réseau

- Le serveur n’écoute que sur `127.0.0.1`, sur un port libre entre 47000 et 47999, choisi au premier démarrage puis gardé (il en change seulement quand le sien est pris, et la déclaration est alors refaite dans chaque compte).
- Chaque requête porte un jeton, dans l’en-tête `Authorization: Bearer`. Celui de Claude hors Escouade est gardé dans le trousseau du système ; quand il le refuse, et sous Linux, dans `~/.escouade/mcp-token.json`, lisible par toi seul. Il est aussi écrit en clair dans la config de Claude Code (`~/.claude.json` pour « Principal »). Celui d’un agent est propre à cet agent, vit en mémoire et dans un fichier de configuration sous `~/.escouade/mcp/` que l’app retire quand son processus s’arrête. Un agent sans les outils démarre avec `~/.escouade/mcp-refused.json`, qui écarte le serveur.
- Une requête envoyée par une page web (en-tête `Origin`) ou adressée à un autre nom que `127.0.0.1` ou `localhost` est refusée, même avec un jeton : un site que tu visites ne peut pas appeler le serveur.
- Un autre client MCP se connecte à `http://127.0.0.1:<port>/mcp` avec le même en-tête. L’adresse et le jeton se lisent dans l’entrée `escouade` du `.claude.json` du compte, ou dans la commande que l’onglet propose quand la déclaration échoue.

## Voir aussi

- [Le pilote auto](autopilot) : les règles que les outils reprennent.
- [Le Kanban](board) : les tickets que les outils créent et déplacent.
- [Réglages du Kanban](settings-board) : ce que `get_board` lit et que `set_board` change.
- [Réglages de Claude Code](settings-claude-code) : où se trouve l’interrupteur.
