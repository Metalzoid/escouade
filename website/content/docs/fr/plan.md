# L’avancée d’un plan

Quand un agent suit une liste de tâches ou travaille avec des sous-agents, Escouade montre où il en est dans un bandeau « Plan » au-dessus de la conversation, sur sa carte et dans la liste de ses sous-agents. Cette page explique d’où vient la liste, ce que le bandeau affiche et comment lire un sous-agent.

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
| `↳ nom` et le modèle | Le sous-agent qui travaille sur cette tâche ; un clic sur `↳ nom` ouvre sa conversation (voir [la conversation d’un sous-agent](#la-conversation-d-un-sous-agent)) |
| Texte gris | Ce que la tâche fait en ce moment, dans les mots de l’agent (le dernier outil du sous-agent, sinon la forme « en cours » de la tâche) |
| « après 03, 05 » | Pour une tâche à faire, les numéros des tâches qu’elle attend et qui ne sont pas finies |
| Barre et pourcentage | L’avancement de la tâche : 100 % quand elle est faite, 0 % quand elle est à faire. Pour une tâche en cours dans un fichier de plan, il est calculé sur ses étapes cochées (survole le pourcentage pour voir « 2/3 étapes »). Tant qu’aucune étape n’est cochée, ou que rien ne les compte, la ligne affiche à la place le mot de l’état (« En cours », « Bloqué »). |

La liste se centre d’elle-même sur la ligne à regarder : la tâche bloquée, sinon la tâche en cours, sinon la première à faire. Si tu fais défiler la liste, elle ne se recentre pas avant six secondes.

## Une tâche bloquée

Quand l’agent attend une réponse à une question ou à une autorisation (statut « Question »), sa première tâche en cours passe à « Bloqué » : l’icône est un `!` et la ligne dit « En attente de ta réponse ». Le bandeau ne sait pas à quelle tâche la question se rapporte : il retient la première qui est en cours. Réponds à la carte dans la conversation (voir [la conversation](chat#questions-et-autorisations)).

## Les sous-agents

Un sous-agent est un agent que Claude lance lui-même pour une partie du travail. Tant qu’il tourne, il compte dans « N sous-agents actifs » et il a son point dans l’en-tête du bandeau (jusqu’à six points, empilés, les suivants sont seulement comptés). La pile de points est un seul bouton. Si un seul sous-agent tourne, un clic sur le bouton ouvre sa conversation (survole-le pour lire le titre du sous-agent), qu’il travaille sur une tâche ou non. Si plusieurs tournent, le bouton ouvre un menu qui les liste tous, y compris ceux dont le point n’est pas dessiné, chacun avec son titre et son modèle : choisis-en un pour ouvrir sa conversation. S’il travaille sur une tâche de la liste, la ligne de la tâche le nomme et dit ce qu’il fait.

Quand un agent n’a **pas** de liste de tâches mais que des sous-agents tournent, le bandeau s’appelle « Sous-agents » : il donne le titre, la pile de points et le compte, sans liste ni repli. Il disparaît quand le dernier sous-agent a fini.

Ce qu’un sous-agent dit et fait se lit dans sa propre conversation (voir plus bas), et en abrégé dans la conversation de l’agent, sur la ligne de l’outil `Agent` (voir [la conversation](chat#les-appels-d-outils)).

## Replier, déplier, redimensionner

- Un clic sur la ligne du haut (hors de la pile de points des sous-agents, qui ouvre leur conversation) replie ou déplie la liste. Par défaut, elle est dépliée quand la fenêtre fait au moins 800 px de haut, repliée sinon. Ton choix est gardé pour cet agent jusqu’à ce que tu fermes Escouade.
- Une poignée sous la liste se glisse vers le haut ou le bas pour changer sa hauteur ; un double-clic la remet à la hauteur par défaut. La hauteur choisie sert pour tous les plans et est gardée d’un démarrage à l’autre. Les messages gardent toujours au moins 160 px.

## La ligne de la carte

Dans la barre latérale, la carte d’un agent qui a des tâches affiche une barre fine et « Plan 2/7 » (ou « Plan 2/7 · 3 sous-agents » quand des sous-agents tournent). Elle permet de suivre plusieurs agents d’un coup d’œil, sans ouvrir leur conversation. Un agent qui n’a que des sous-agents, sans tâches, n’a pas cette ligne, mais ses sous-agents ont leur groupe sous la carte (voir plus bas).

## Les sous-agents dans la barre latérale

Sous la carte d’un agent qui a des sous-agents, un groupe « Sous-agents » les liste, même quand l’agent n’a aucune tâche. Un clic sur son titre le déplie ou le replie. Par défaut il est déplié tant qu’un sous-agent tourne et replié sinon ; ton choix est gardé jusqu’à ce que tu fermes Escouade.

Déplié, le groupe montre d’abord les sous-agents qui tournent, chacun avec son titre, son modèle et ce qu’il fait en ce moment (« Édite src/a.ts »). Il en montre cinq ; « N autres en cours » déroule les suivants. Dessous, une ligne « N sous-agents finis » déplie ceux qui ont fini, du dernier fini au premier, chacun avec son état (Terminé, Échoué, Arrêté ou Interrompu) : dix au plus, puis « N de plus » pour le reste. Un sous-agent lancé par un autre est décalé d’un cran. Le groupe ne défile pas : la barre défile déjà.

La barre ne garde que les 30 derniers sous-agents d’un agent : ceux qui tournent, puis les derniers finis. Le nombre de sous-agents finis compte ceux-là ; les plus anciens se lisent encore dans la conversation de l’agent (voir plus bas).

## La conversation d’un sous-agent

Chaque sous-agent a sa conversation, que tu lis en grand, à la place de celle de l’agent.

### L’ouvrir

Un clic suffit, sur l’un de ces éléments :

- la ligne du sous-agent dans la barre latérale ;
- la pile de points du bandeau « Plan » : d’un clic pour un seul sous-agent qui tourne, par un menu de tous ceux qui tournent pour plusieurs (qu’ils travaillent sur une tâche ou non) ;
- le `↳ nom` d’une tâche ;
- le bouton ↗ à droite de la ligne de son appel (l’outil `Agent`), dans la conversation de l’agent ;
- « Ouvrir sa conversation », au-dessus d’une demande de permission ou d’une question qu’il a posée.

En haut, un fil d’Ariane « agent › sous-agent » dit où tu es. Pour un sous-agent lancé par un autre, il montre toute la chaîne, et chaque maillon ouvre le sous-agent qu’il nomme. Un clic sur le nom de l’agent, ou `Échap`, te ramène à sa conversation, et le focus retourne là où tu avais cliqué (pour la pile de points du bandeau, sur son bouton, même si tu as choisi le sous-agent dans son menu) ; un clic sur la carte de l’agent dans la barre latérale y ramène aussi. `Échap` ne fait rien tant qu’un champ contient du texte que tu as tapé : un brouillon ne se perd pas pour une touche.

### Ce que la vue montre

- **L’état** du sous-agent, à côté du fil d’Ariane : En cours, Terminé, Échoué, Arrêté, Interrompu, ou « Lancé » quand rien n’en dit plus.
- **Sa fiche** : son type, son modèle, ses tokens, ses outils utilisés et sa durée (qui court tant qu’il tourne). Dessous, sa consigne, c’est-à-dire ce qu’on lui a demandé, repliée quand elle est longue (« Voir toute la consigne »).
- **Sa conversation** : ce qu’il dit, sa réflexion, ses appels d’outils (dépliables, comme dans la conversation de l’agent), puis les demandes de permission et les questions qu’il pose. Tu y réponds comme d’habitude, au bouton ou au clavier (voir [la conversation](chat#questions-et-autorisations)). Ces demandes restent aussi dans la conversation de l’agent, précédées de « Demande du sous-agent » et de son nom.
- **Sa fin** : « Le sous-agent travaille… » tant qu’il tourne, puis son rapport, rendu en Markdown, ou « Ce sous-agent n’a pas rendu de rapport. »

Les titres, les consignes et les rapports sont les mots de l’agent, tels quels : Escouade ne les traduit pas.

### L’arrêter

« Arrêter », en haut à droite, n’est proposé que pour un sous-agent qui tourne **en arrière-plan**. Il arrête ce sous-agent seul : l’agent continue. Claude Code fait ensuite faire un tour à l’agent pour constater l’arrêt, et ce tour compte comme les autres (tokens, coût). Tant que Claude Code n’a pas donné la tâche du sous-agent, le bouton reste là, grisé, et son infobulle dit pourquoi il ne peut pas encore agir.

Un sous-agent au premier plan n’a pas de bouton : l’agent l’attend, et « Arrêter » de l’agent l’arrête avec son tour. Arrêter seul un sous-agent au premier plan n’a jamais été essayé sur un vrai flux, Escouade ne le propose donc pas. Il n’y a pas non plus de bouton dans [la vue Claude Code](claude-code-view#les-sous-agents).

### Lui écrire

Claude Code ne permet pas d’écrire directement à un sous-agent. Pour un sous-agent qui tourne **en arrière-plan**, un champ « Lui écrire, par » suivi du nom de l’agent apparaît en bas de la vue. Ton message est envoyé à l’agent, avec la demande de le transmettre tel quel au sous-agent par l’outil `SendMessage` de Claude Code ; le champ le dit sous la zone de texte. `Ctrl+Entrée` envoie le message, et ne répond à aucune demande qui attend.

> [!NOTE]
> Le message passe par l’agent. Il paraît dans sa conversation sous la forme de cette demande, il lui coûte un tour, et le sous-agent ne le reçoit qu’à son prochain outil. L’agent est seulement prié de le transmettre : rien ne l’y oblige. Dans l’essai fait sur Claude Code 2.1.300, il l’a fait et le sous-agent en a tenu compte.

Le champ n’est pas proposé pour un sous-agent au premier plan (l’agent l’attend et ne pourrait lui passer le message qu’à sa fin), ni dans la vue Claude Code, ni pour un agent archivé. Ce que tu as tapé est gardé quand le sous-agent finit ou que tu changes de vue, tant qu’Escouade reste ouvert ; le champ reste alors, l’envoi grisé, avec la mention que le sous-agent a fini.

### Après coup

La conversation d’un sous-agent fini se lit encore. Escouade garde avec la conversation de l’agent la consigne, le rapport et le bilan de chaque sous-agent (état, tokens, outils, durée). La consigne et le rapport sont coupés à 16 000 octets, et le texte coupé se termine par « … ». Quand un sous-agent finit sans rendre de rapport en forme, son dernier message sert de rapport. Le rapport d’un sous-agent au premier plan est le résultat de son appel, coupé à 8 000 octets.

Sa conversation se lit donc après un redémarrage d’Escouade, et même quand la barre n’a plus sa ligne (au-delà de 30 sous-agents, ou quand le plan est reparti de zéro) : le bouton ↗ de la ligne de son appel, dans la conversation de l’agent, l’ouvre toujours. Un sous-agent qui tournait quand Escouade s’est fermé est dit « Interrompu ».

## Quand le plan disparaît

Quand toutes les tâches sont faites et que plus rien ne tourne, le bandeau reste affiché (« 7/7 tâches ») jusqu’à ton prochain message : ce message commence un nouveau plan, et le bandeau repart de zéro avec ce que l’agent liste ensuite. Le bandeau marche aussi quand l’agent tourne dans [la vue Claude Code](claude-code-view).
