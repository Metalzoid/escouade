# L’avancée d’un plan

Quand un agent suit une liste de tâches ou travaille avec des sous-agents, Escouade montre où il en est dans un bandeau « Plan » au-dessus de la conversation, et dans une ligne de sa carte. Cette page explique d’où vient la liste, ce que le bandeau affiche et comment l’utiliser.

## Quand le bandeau apparaît

Le bandeau « Plan » apparaît entre l’en-tête de la conversation et les messages dès que l’agent a au moins une tâche, ou au moins un sous-agent au travail. Il n’y a rien à faire pour l’afficher : c’est l’agent qui décide de tenir une liste, et Escouade ne fait que la lire.

## D’où viennent les tâches

Escouade ne crée jamais de tâche et ne modifie aucun fichier de plan : il lit ce que l’agent fait. La liste vient de l’une de ces deux sources.

- **La liste de tâches de Claude Code.** L’agent la tient avec les outils de tâches de Claude Code (`TodoWrite`, ou `TaskCreate` et `TaskUpdate`). Le réglage « Les agents tiennent une liste de tâches » (Réglages › Claude Code, activé par défaut) donne cet outil aux agents lancés ensuite ; le modèle n’est pas obligé de s’en servir. Voir [les réglages de Claude Code](settings-claude-code).
- **Un plan superpowers.** Pour un agent qui n’a pas de liste de tâches, Escouade lit le plan que l’agent a écrit dans `docs/superpowers/plans/` (skills `writing-plans`, `executing-plans`, `subagent-driven-development`) et le journal d’avancement que ces skills tiennent dans `.superpowers/sdd/`, pour savoir quelles tâches sont faites. Cette lecture se fait seulement dans le dossier de l’agent (son worktree, ou le projet) et ne modifie rien. Si l’agent tient aussi sa propre liste, c’est elle qui sert de liste ; le fichier de plan n’en donne alors que le titre et le nom.

Le bandeau garde au plus 100 tâches.

## Ce que montre le bandeau

En haut, une ligne résume le plan :

- le badge « Plan » et le titre du plan : celui du fichier de plan s’il y en a un, sinon le titre du ticket de l’agent, sinon le nom de l’agent ;
- les sous-agents au travail, en petits points suivis de « 3 sous-agents actifs » (voir plus bas) ;
- le compte des tâches faites, « 2/7 tâches », et le pourcentage du plan entier, « 29 % » ;
- une flèche qui replie ou déplie la liste.

Sous cette ligne, une barre a un segment par tâche : plein pour une tâche faite, estompé pour une tâche à faire, rempli à hauteur de l’avancement pour une tâche en cours.

La liste dessous donne une ligne par tâche, numérotée (01, 02…) :

| Élément | Ce qu’il dit |
|---|---|
| Icône | ✓ pour « Terminé », un cercle qui tourne pour « En cours », `!` pour « Bloqué », un tiret pour « À faire » |
| Titre | Les mots de l’agent, tels quels |
| `↳ nom` et le modèle | Le sous-agent qui travaille sur cette tâche |
| Texte gris | Ce que la tâche fait en ce moment, dans les mots de l’agent (le dernier outil du sous-agent, sinon la forme « en cours » de la tâche) |
| « après 03, 05 » | Pour une tâche à faire, les numéros des tâches qu’elle attend et qui ne sont pas finies |
| Barre et pourcentage | L’avancement de la tâche : 100 % quand elle est faite, 0 % quand elle est à faire. Pour une tâche en cours dans un fichier de plan, il est calculé sur ses étapes cochées (survole le pourcentage pour voir « 2/3 étapes »). Tant qu’aucune étape n’est cochée, ou que rien ne les compte, la ligne affiche à la place le mot de l’état (« En cours », « Bloqué »). |

La liste se centre d’elle-même sur la ligne à regarder : la tâche bloquée, sinon la tâche en cours, sinon la première à faire. Si tu fais défiler la liste, elle ne se recentre pas avant six secondes.

## Une tâche bloquée

Quand l’agent attend une réponse à une question ou à une autorisation (statut « Question »), sa première tâche en cours passe à « Bloqué » : l’icône est un `!` et la ligne dit « En attente de ta réponse ». Le bandeau ne sait pas à quelle tâche la question se rapporte : il retient la première qui est en cours. Réponds à la carte dans la conversation (voir [la conversation](chat#questions-et-autorisations)).

## Les sous-agents

Un sous-agent est un agent que Claude lance lui-même pour une partie du travail. Tant qu’il tourne, il compte dans « N sous-agents actifs » et il a son point dans l’en-tête du bandeau (jusqu’à six points ; survole un point pour lire le titre du sous-agent). S’il travaille sur une tâche de la liste, la ligne de la tâche le nomme et dit ce qu’il fait.

Quand un agent n’a **pas** de liste de tâches mais que des sous-agents tournent, le bandeau s’appelle « Sous-agents » : il donne le titre, les points et le compte, sans liste ni repli. Il disparaît quand le dernier sous-agent a fini.

Le détail des appels d’un sous-agent se lit dans la conversation, dans la ligne de l’outil `Agent` (voir [la conversation](chat#les-appels-d-outils)).

## Replier, déplier, redimensionner

- Un clic sur la ligne du haut replie ou déplie la liste. Par défaut, elle est dépliée quand la fenêtre fait au moins 800 px de haut, repliée sinon. Ton choix est gardé pour cet agent jusqu’à ce que tu fermes Escouade.
- Une poignée sous la liste se glisse vers le haut ou le bas pour changer sa hauteur ; un double-clic la remet à la hauteur par défaut. La hauteur choisie sert pour tous les plans et est gardée d’un démarrage à l’autre. Les messages gardent toujours au moins 160 px.

## La ligne de la carte

Dans la barre latérale, la carte d’un agent qui a des tâches affiche une barre fine et « Plan 2/7 » (ou « Plan 2/7 · 3 sous-agents » quand des sous-agents tournent). Elle permet de suivre plusieurs agents d’un coup d’œil, sans ouvrir leur conversation. Un agent qui n’a que des sous-agents, sans tâches, n’a pas cette ligne.

## Quand le plan disparaît

Quand toutes les tâches sont faites et que plus rien ne tourne, le bandeau reste affiché (« 7/7 tâches ») jusqu’à ton prochain message : ce message commence un nouveau plan, et le bandeau repart de zéro avec ce que l’agent liste ensuite. Le bandeau marche aussi quand l’agent tourne dans [la vue Claude Code](claude-code-view).
