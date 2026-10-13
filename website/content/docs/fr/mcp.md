# Le serveur MCP

Le serveur MCP d’Escouade laisse Claude (dans un terminal, un autre outil ou un agent d’Escouade) lire tes projets, tes agents et tes tickets, créer, modifier et lancer des tickets, et piloter des agents, sous les mêmes garde-fous que le pilote auto.

## À quoi il sert

MCP (Model Context Protocol) est le protocole par lequel Claude Code appelle des outils. Escouade embarque un serveur MCP : une fois déclaré dans Claude Code, il donne à Claude les outils de la liste plus bas.

- **Claude dans un terminal** : tu lances `claude` où tu veux et tu lui parles d’Escouade (« liste les tickets à tester du projet api », « crée un ticket pour limiter les tentatives de connexion, puis lance-le »).
- **Un autre outil** qui parle MCP peut se connecter de la même façon (voir [Jeton et réseau](#jeton-et-reseau)).
- **Un agent d’Escouade**, quand son projet le permet (voir [Les agents d’Escouade et le serveur](#les-agents-d-escouade-et-le-serveur)).

Le serveur tourne sur ta machine seule. Il ne sert qu’à lire et à commander ; il n’accepte aucune permission à ta place, ne lance aucune commande, ne merge rien et ne supprime rien.

## Activer « Claude peut piloter Escouade »

1. Ouvre Réglages › Claude Code. Le groupe « Escouade dans Claude » a l’interrupteur « Claude peut piloter Escouade ».
2. Allume-le. Il s’enregistre tout de suite, sans « Enregistrer » : la déclaration écrit dans la config de Claude Code de chaque compte, ce qu’« Annuler » ne pourrait pas défaire.

Escouade démarre alors le serveur et le déclare dans Claude Code pour chaque compte actif, avec la commande `claude mcp add --scope user --transport http escouade <adresse> --header "Authorization: Bearer <jeton>"`, lancée comme le compte lance Claude Code (son exécutable, son dossier de configuration). L’entrée se range dans le `.claude.json` du compte (`~/.claude.json` pour « Principal »). L’onglet dit « Déclaré dans Claude · compte Principal, compte Pro ».

- Une entrée déjà à jour est laissée telle quelle. Une entrée différente (un autre port, un autre jeton) est remplacée. Un compte ajouté ou réactivé plus tard reçoit la déclaration.
- Si elle échoue pour un compte, l’onglet le dit (« Pas déclaré pour le compte Pro : … ») et affiche la commande à lancer à la main (« À lancer à la main dans PowerShell : »), écrite pour PowerShell sous Windows et pour `sh` ailleurs. Le jeton y est masqué à l’écran ; « Copier la commande » copie la vraie.
- Éteindre l’interrupteur change le jeton tout de suite, puis retire l’entrée de chaque compte. Supprimer un compte retire la sienne.
- Si le serveur ne démarre pas, l’onglet le dit (« Le serveur n’a pas démarré : … »).

Claude Code connaît le serveur sous le nom `escouade` : ses outils s’appellent `mcp__escouade__<outil>` (par exemple `mcp__escouade__list_tickets`).

> [!NOTE]
> Sous Windows avec Claude Code dans WSL, les outils MCP d’Escouade demandent le réseau miroir de WSL : `networkingMode=mirrored` sous `[wsl2]` dans `%UserProfile%\.wslconfig`, puis `wsl --shutdown`. Réglages › Claude Code le rappelle quand le réseau de WSL est en NAT.

## Les outils

Dans les arguments, un projet se nomme par son id ou son nom (casse libre), un agent par son id ou son nom, un ticket par sa clé (`ATL-12`, casse libre) ou son id. Les réponses sont en JSON.

### Lire

Ces six outils ne changent rien.

| Outil | Arguments | Ce qu’il rend |
|---|---|---|
| `list_projects` | aucun | Les projets, dans l’ordre de l’app : id, nom, dossier, branche git courante, nombre d’agents (archivés exclus) et nombre de tickets dans chaque colonne. |
| `list_agents` | `project` (facultatif) | Les agents non archivés, du plus ancien au plus récent, de tous les projets ou d’un seul : id, nom, projet, état (`idle`, `running`, `waiting`, `done` ou `error`), si une question ou une autorisation attend ta réponse, clé de leur ticket, modèle, compte Claude et coût en dollars. |
| `list_tickets` | `project`, `column` (facultatif : `todo`, `doing`, `review` ou `done`) | Les tickets d’un projet dans l’ordre du Kanban : id, clé, titre, colonne, clés des tickets qu’ils attendent, nom de leur agent et motif du blocage. |
| `get_ticket` | `ticket` | Un ticket entier : titre, description, critères (atteints ou non, avec la note de l’agent), boucles (la courante et le maximum), colonne, tickets attendus, avancement et ticket externe d’origine (Jira, Trello, GitHub ou Linear). Un agent d’Escouade peut omettre `ticket` pour lire le sien. |
| `get_usage` | aucun | Le quota de chaque compte Claude : si les nouveaux agents y partent maintenant, l’usage de ses fenêtres de 5 h et hebdomadaire (`pct` de 0 à 100, `resetsAt`), et pourquoi le pilote auto retient les tickets (`reason` : `fiveHour`, `week` ou `limit`), jusqu’à quand. |
| `get_agent_summary` | `agent`, `project` (facultatif) | Un agent sans sa conversation : id, nom, état, clé du ticket, dernier message (2 000 caractères au plus ; un message plus long donne son début et sa fin) et fichiers modifiés (les 100 derniers au plus). |

### Agir

Ces outils font ce que tu ferais dans la fenêtre, par les mêmes fonctions : la fenêtre est prévenue, les tickets externes suivent et le Kanban se met à jour.

| Outil | Arguments | Ce qu’il fait |
|---|---|---|
| `create_ticket` | `project`, `title`, `description`, `criteria`, `after` | Crée un ticket « À faire » au bas de la colonne. `criteria` est une liste (deux critères par défaut sans elle), `after` les tickets qu’il attend, par clé ou id. Avec le pilote auto allumé, il part dès qu’une place est libre et que ses prédécesseurs sont terminés. Sa description se termine par « Créé par `<auteur>` via Escouade ». |
| `update_ticket` | `ticket`, `title`, `description`, `criteria`, `after` | Modifie un ticket « À faire », champ par champ : ce qui est omis reste. `criteria` et `after` remplacent la liste entière. Un ticket déjà parti ne se modifie pas, une dépendance qui ferait attendre deux tickets l’un l’autre est refusée. Si titre, description ou critères changent, la dernière ligne de la description devient « Modifié par `<auteur>` via Escouade ». |
| `move_ticket` | `ticket`, `position` (`top`, `bottom` ou `before`), `before` | Place un ticket « À faire » en tête, en bas, ou juste avant un autre ticket « À faire » du projet (`before`). Rend les clés de la colonne dans leur nouvel ordre. |
| `start_ticket` | `ticket` | Lance un ticket « À faire » comme le bouton « Lancer » : son agent démarre dès qu’une place est libre. Rend la main une fois le ticket en file ; suis-le avec `get_ticket`. |
| `create_agent` | `project`, `message`, `worktree`, `model` | Crée un agent dans un projet, avec son premier message, sans changer l’agent que tu regardes. `worktree` (vrai ou faux) dit s’il travaille dans un worktree à lui, sinon le projet décide ; `model` se nomme comme dans Claude Code (`sonnet`, `opus`, `haiku`…). Rend l’id et le nom de l’agent. |
| `send_message` | `agent`, `project`, `text` | Écrit à un agent. Un agent au travail lit le message après son tour en cours (la réponse dit `queued`). |
| `stop_agent` | `agent`, `project` | Interrompt le tour en cours d’un agent, comme le bouton stop de sa conversation. L’agent reste, et peut recevoir un message ensuite. |

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
- **Le Kanban.** `start_ticket` est refusé quand le Kanban du projet ne démarre rien pour l’instant (la branche cible n’a aucun commit ou est introuvable, aucun compte actif ne sert le projet) ; le refus dit pourquoi.
- **Les agents d’Escouade** n’agissent que dans leur propre projet (ils lisent les autres), ne s’écrivent pas à eux-mêmes et ne s’arrêtent pas eux-mêmes. On n’écrit pas à un agent archivé.
- **Aucun outil** n’accepte une permission, ne répond à ta place, ne lance une commande ou un test, ne merge, ni ne supprime (projet, agent ou ticket). Un agent poussé par un contenu piégé ne peut donc pas s’en servir pour monter en droits.
- **Ce qui vient du serveur n’est jamais pris pour toi.** Un message envoyé à un agent (`send_message`, premier message de `create_agent`) est lu par l’agent et montré dans sa conversation sous « Message de `<auteur>` : », l’auteur étant le nom de l’agent qui l’envoie ou « Claude (hors Escouade) ». Un ticket créé ou découpé par le serveur se termine par « Créé par `<auteur>` via Escouade », un ticket modifié par « Modifié par `<auteur>` via Escouade », sur sa carte comme dans le protocole de son agent.

Une demande d’autorisation d’un outil d’Escouade le nomme en clair (« Escouade · Créer un ticket », « Escouade · Lancer un agent »…) et montre ce que Claude lui donne, un argument par ligne. Une valeur de plus de 2 000 caractères est coupée : la carte dit combien ne sont pas montrés et renvoie à la conversation.

## Les agents d’Escouade et le serveur

Le groupe « Serveur MCP » des réglages d’un projet (Réglages › Projets) a l’interrupteur « Les agents peuvent utiliser Escouade », éteint par défaut.

- Allumé, les agents du projet reçoivent le serveur avec un jeton à chacun. Ils lisent les tickets et les agents, et peuvent créer des tickets ou lancer d’autres agents, ce qui dépense du quota. Le réglage s’applique au prochain démarrage de leur processus.
- Éteint, le projet refuse à ses agents tous les outils d’Escouade, même quand « Claude peut piloter Escouade » est allumé : sans cela, un agent hériterait de l’entrée de ta config de Claude Code et passerait pour Claude hors Escouade.
- Ce réglage retire des outils aux agents et protège ton quota, ce n’est pas un cloisonnement : un agent qui peut les utiliser n’agit que dans son propre projet, mais lit les autres.

Le serveur tourne dès que l’un des deux réglages le demande : « Claude peut piloter Escouade », ou un projet dont les agents peuvent l’utiliser. Il s’arrête avec l’app.

Dans une conversation, un appel à un outil d’Escouade porte l’étiquette « Escouade · » suivie de son nom (« Escouade · Lire un ticket », « Escouade · Donner son avancement »).

## L’activité MCP

Réglages › Claude Code › « Activité MCP » garde les 200 derniers appels et refus, les plus récents en tête, mis à jour en direct. Chaque ligne donne :

- l’heure (au survol, la date) ;
- l’appelant : le nom de l’agent, « Claude (hors Escouade) », ou « Client inconnu » pour une requête refusée avant que son jeton dise d’où elle vient ;
- l’outil, et en bref ce qui lui a été demandé (jamais un jeton) ;
- le résultat : « Fait », « Refusé » ou « Erreur », avec la raison pour les deux derniers (colorés en alerte).

« Effacer » vide la liste. Le journal n’est pas enregistré : il repart à zéro au prochain démarrage d’Escouade.

Sont aussi refusées, et notées : une requête sans jeton (« Requête refusée : pas de jeton »), avec un jeton inconnu, avec un en-tête `Host` inattendu, avec un en-tête `Origin` (une page web), ou vers un autre chemin que celui du serveur.

## Jeton et réseau

- Le serveur n’écoute que sur `127.0.0.1`, sur un port libre entre 47000 et 47999, choisi au premier démarrage puis gardé (il en change seulement quand le sien est pris, et la déclaration est alors refaite dans chaque compte).
- Chaque requête porte un jeton, dans l’en-tête `Authorization: Bearer`. Celui de Claude hors Escouade est gardé dans le trousseau du système ; quand il le refuse, et sous Linux, dans `~/.escouade/mcp-token.json`, lisible par toi seul. Il est aussi écrit en clair dans la config de Claude Code (`~/.claude.json` pour « Principal »). Celui d’un agent est propre à cet agent, vit en mémoire et dans un fichier de configuration sous `~/.escouade/mcp/` que l’app retire quand son processus s’arrête.
- Une requête envoyée par une page web (en-tête `Origin`) ou adressée à un autre nom que `127.0.0.1` ou `localhost` est refusée, même avec un jeton : un site que tu visites ne peut pas appeler le serveur.
- Un autre client MCP se connecte à `http://127.0.0.1:<port>/mcp` avec le même en-tête. L’adresse et le jeton se lisent dans l’entrée `escouade` du `.claude.json` du compte, ou dans la commande que l’onglet propose quand la déclaration échoue.

## Voir aussi

- [Le pilote auto](autopilot) : les règles que les outils reprennent.
- [Le Kanban](board) : les tickets que les outils créent et déplacent.
- [Réglages de Claude Code](settings-claude-code) et [Réglages des projets](settings-projects) : où se trouvent les interrupteurs.
