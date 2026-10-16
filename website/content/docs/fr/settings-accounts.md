# Réglages : Comptes Claude

L’onglet « Comptes Claude » liste les comptes sur lesquels partent les agents, dans l’ordre où Escouade les essaie. Chaque changement y est enregistré tout de suite, sans passer par « Enregistrer ».

## Comment Escouade choisit un compte

Un compte est un Claude Code lancé avec son propre dossier de configuration, donc avec sa connexion, ses sessions et son quota. « Principal » est ton Claude Code habituel : il est lancé comme toujours, sans dossier à part, et il ne se supprime pas. Le fonctionnement des comptes et de leurs quotas est expliqué dans [les comptes](accounts) et dans [l’usage](usage).

La note sous le titre de la liste le résume : « Les nouveaux agents partent sur le premier compte actif sous le seuil de pause, dans cet ordre. » En détail :

- Un nouvel agent part sur le premier compte actif de la liste dont aucune fenêtre de quota (5 h ou hebdomadaire) n’a atteint le seuil de pause.
- Si tous les comptes actifs ont atteint le seuil, il part sur le premier compte actif, et le [pilote auto](autopilot) se met en pause.
- Le « Compte préféré » d’un projet, dans l’onglet [« Projets »](settings-projects), passe devant tant qu’il est actif.
- Un compte « Réservé aux projets » ne reçoit que les agents et les tickets de ces projets.

## La liste

Chaque compte a son bloc dans la liste.

| Réglage | Effet | Par défaut |
|---|---|---|
| Nom (champ « Nom ») | Le nom du compte, enregistré quand tu quittes le champ ou appuies sur `Entrée`. Un nom vide ou déjà pris par un autre compte est refusé : le champ retrouve l’ancien. | « Principal » pour le compte Principal ; le nom donné à la création pour les autres |
| « Actif » | Interrupteur. Un compte inactif ne reçoit aucun nouvel agent. Il en faut au moins un d’actif : l’interrupteur du dernier compte actif est grisé (« Il faut au moins un compte actif. »). | Activé |
| Flèches ↑ et ↓ | Montent ou descendent le compte : l’ordre de la liste est l’ordre de priorité. | — |
| « Dossier » | Le dossier de configuration du compte, affiché sans pouvoir être modifié. | — |
| « Exécutable » | Le `claude` de ce compte. Vide, c’est celui de l’onglet « Claude Code » (le champ dit « Celui des réglages »). Enregistré quand tu quittes le champ. | Vide |
| « Se connecter… » ou « Se reconnecter… » | Ouvre la connexion du compte. | — |
| « Supprimer » | Retire le compte de la liste (absent pour Principal). | — |
| « Réservé aux projets » | Une case par projet ouvert, plus une case cochée, marquée « (fermé) », pour chaque projet fermé auquel le compte reste réservé : le compte ne sert que les projets cochés. | Aucune case cochée : « Tous les projets » |

### Nom et état

Sous le nom, un point coloré et un texte disent où en est la connexion :

- « Vérification… » le temps de la lire ;
- « Connecté · » suivi de l’e-mail du compte claude.ai, ou « Connecté » seul quand l’e-mail n’est pas connu ;
- « Pas connecté » ;
- « Pas connecté par un compte claude.ai (clé d’API ?) » pour Principal, qui tourne alors sans doute avec une clé d’API ;
- « Inactif » pour un compte désactivé.

Quand la connexion existe mais n’est plus à jour, une ligne en dessous en donne la raison.

### Dossier et exécutable

Pour Principal, le dossier est celui de Claude Code lui-même (`~/.claude`, ou celui que désigne `CLAUDE_CONFIG_DIR`). Chaque autre compte a le sien, que crée Escouade dans `~/.escouade/claude/`, un sous-dossier par compte. Un compte peut faire tourner un autre `claude` que celui des réglages, par exemple un Claude Code de WSL pour l’un et un Claude Code de Windows pour l’autre.

### Se connecter

« Se connecter… » (« Se reconnecter… » quand le compte est déjà connecté, par exemple pour passer à un autre compte claude.ai) ouvre une fenêtre avec un terminal où tourne le `claude` du compte. Connecte-toi dedans, avec la commande `/login` si Claude Code ne la propose pas. Escouade guette la connexion toutes les 2 secondes : dès qu’elle est faite, la fenêtre affiche « Connecté au compte » suivi de l’e-mail, ferme le terminal et lit le quota du compte. Si tu fermes la fenêtre avant, le compte reste, pas connecté. Si Claude Code s’arrête avant la connexion, la fenêtre le dit et propose « Relancer ».

### Réservé aux projets

Les cases servent à garder un compte à ces projets seuls (ceux d’un client, par exemple) : les autres projets n’y partent jamais. Sans case cochée, le compte sert tous les projets, ce que la rangée dit par « Tous les projets ». Principal peut être réservé comme les autres.

Un projet fermé en gardant son historique reste réservé au compte : il apparaît dans la rangée, coché et marqué « (fermé) », par exemple « Client (fermé) ». Décoche-le pour le retirer de la liste du compte ; il en sort aussi tout seul quand son historique est effacé. Tant qu’il est coché, un compte réservé à ce seul projet ne sert aucun projet ouvert, et « Tous les projets » ne s’affiche pas. La rangée apparaît même s’il n’y a aucun projet ouvert, du moment que le compte est réservé à un projet fermé.

Si aucun compte actif ne sert un projet (tous sont réservés à d’autres, ou désactivés), une ligne sous la liste nomme le projet et dit que ses agents et ses tickets ne démarrent pas.

### Supprimer un compte

« Supprimer » demande confirmation. La fenêtre rappelle que les nouveaux agents ne partiront plus sur le compte, et que son dossier reste sur le disque, avec sa connexion et ses conversations. Tant que des agents non archivés tournent sur le compte, la suppression est refusée. Les projets qui le préféraient repassent sur « Automatique ».

## Ajouter un compte

« Ajouter un compte… », sous la liste, ouvre la fenêtre « Ajouter un compte Claude ».

1. « Nom » : le nom du nouveau compte (« Pro, Équipe… » en exemple). Deux comptes ne peuvent pas porter le même nom.
2. « Partager avec Principal » : des cases, toutes cochées au départ, pour les éléments du dossier de Principal que le compte reprend. Les fichiers sont `settings.json` et `CLAUDE.md`, les dossiers `skills`, `agents`, `commands`, `plugins`, `hooks` et `output-styles` ; seuls ceux que Principal possède sont proposés.
3. « Partage » : « Lier (un changement vaut pour les deux comptes) », par défaut, ou « Copier ». Sous Windows, les dossiers sont liés par une jonction, qui ne demande pas de droits d’administrateur, et les fichiers sont copiés, un lien de fichier en demandant. Sous macOS et Linux, dossiers et fichiers sont liés par des liens symboliques ; la mention « copiés (un lien de fichier demande des droits d’administrateur) » que la fenêtre affiche à côté des fichiers ne vaut que pour Windows, même si elle apparaît aussi sous Linux.
4. « Créer et se connecter » crée le compte, actif et en dernier dans la liste, avec son dossier dans `~/.escouade/claude/`, puis ouvre sa connexion.

La connexion (`.credentials.json`) et `.claude.json` ne sont jamais partagés : chaque compte a les siens.

## Le seuil de pause

Le seuil se règle dans l’onglet [« Kanban »](settings-board), pas ici, mais il décide quels comptes Escouade écarte.

| Réglage | Effet | Par défaut |
|---|---|---|
| « Pause au-delà du quota » (pour tous les projets) | Aucun ticket ne démarre tant que la fenêtre de 5 h ou la fenêtre hebdomadaire atteint ou dépasse ce seuil. Choix : 80 %, 90 %, 95 % ou 100 %. | 100 % |

Un compte dont une fenêtre a passé le seuil est écarté au profit du suivant dans la liste, et le panneau des quotas le marque « au-delà du seuil de pause ».

## Reprendre sur un autre compte

Quand un tour s’arrête sur la limite d’usage, la carte de l’agent propose « Reprendre sur » suivi d’un compte, ou « Reprendre sur un autre compte » avec un menu quand il y en a plusieurs : l’agent repart avec sa session sur l’autre compte. Sont proposés les comptes actifs, autres que celui de l’agent, qui servent son projet, sont connectés et restent sous le seuil de pause.

Pour un agent de ticket, le réglage « Reprendre sur un autre compte un agent de ticket arrêté par la limite » de l’onglet [« Claude Code »](settings-claude-code) le fait tout seul. Une session ne passe pas d’un compte qui fait tourner Claude Code sous Windows à un compte qui le fait tourner dans WSL, ni l’inverse.
