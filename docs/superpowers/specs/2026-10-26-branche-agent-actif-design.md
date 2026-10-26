# La branche de l'agent ouvert, et ses PR — conception

Date : 2026-10-26. Sans ticket (contribution du fork Metalzoid). Fait foi pour les noms et les formes.

## But

Aujourd'hui la barre d'état montre la branche du **dossier du projet**, quel que soit l'agent ouvert, et les PR d'un
agent ne sont lues que sur la branche que son worktree avait à sa création : un agent passé sur une branche qui a déjà
une PR (récupérée, ouverte par quelqu'un d'autre, depuis un fork) ne la montre pas.

Désormais la barre d'état suit **l'agent ouvert** : sa branche réelle (lue par git dans son dossier), son avance et
son retard, et l'état de sa PR. Son sélecteur de branches bascule **le dossier de l'agent**, et la PR de la branche
reprise est trouvée, qui que soit son auteur.

## Décisions de l'utilisateur (2026-10-26, ne pas les rouvrir)

1. **Tous les cas** : agent en worktree (« Nouvel agent sur une branche… », ou qui change lui-même de branche par
   `git switch` / `gh pr checkout`), agent sans worktree (le dossier du projet), PR depuis un fork, autre remote
   qu'`origin`. Les agents non-Claude qui entrent seuls dans un worktree (ESC-161 pour Claude) : **second lot**, hors
   de celui-ci.
2. **Barre d'état** : la branche de l'agent ouvert (celui dont la conversation est affichée) ; un clic ouvre le sélecteur, qui **bascule le dossier de l'agent**
   sur une branche existante (locale, ou distante par la branche locale qui la suit). Sans agent, ou pour un agent sans
   worktree : le dossier du projet, comme avant.
3. **Bascule refusée** quand l'agent est au milieu d'un tour, ou quand son dossier a des changements non commités
   (aucun stash proposé).
4. **Branche reprise** Y : marquée `existing` (à l'utilisateur : jamais renommée, jamais supprimée avec l'agent).
   **Branche quittée** X, faite pour l'agent : supprimée si elle n'a aucun commit de plus que sa base, gardée sinon.
5. **L'agent est prévenu** : une ligne dans la conversation (« Branche : X → Y »), et une note jointe à **ton prochain
   message** (aucun tour lancé tout seul).
6. **PR dans la barre** : une pastille à part après la branche — icône d'état, numéro, couleur (`prIcon`, `prTone`),
   infobulle `prTip` ; un clic ouvre la PR dans le navigateur. Plusieurs : la première (`sort_prs`), puis « +n ».
7. **Agent de ticket** : sa branche et sa PR (lecture seule, pas de « Ouvrir une PR ») ; la bascule est refusée (le
   board compte sur `ticket/esc-N`), le sélecteur garde la synchronisation.
8. **Agent de plusieurs dépôts** (ESC-169) : le résumé (« feat · 3 dépôts ») et ses PR par dépôt ; la bascule est
   refusée dans ce lot.

## Conception

### La branche réelle (passe git)

- `GitInfo.agentGit: Record<agentId, AgentGit>` : `{ branch, upstream, upstreamGone, ahead, behind, repos }`, rempli
  par la passe git du projet (`compute_git`, `multi_git`) à partir du `git status` qu'elle fait déjà dans le worktree
  de chaque agent (et dans le worktree trouvé d'ESC-161). Un agent sans dossier à lui n'a pas d'entrée : la barre prend
  la branche du dossier du projet.
- **L'agent a changé lui-même de branche** (worktree d'un seul dépôt, agent ordinaire) : la passe voit HEAD sur une
  autre branche que `worktree.branch`. Elle la suit (`existing = true` par prudence, PR vidées, ligne dans la
  conversation, sans note : c'est lui qui l'a fait). Rien n'est supprimé. HEAD détaché : rien ne change. Jamais pendant
  qu'Escouade renomme la branche de l'agent (verrou `naming-<projet>`).

### La bascule (`agent_branch_switch`)

Refusée : agent archivé, de ticket, de plusieurs dépôts, sans worktree (le sélecteur du dossier du projet s'en
charge), au milieu d'un tour (vérifié encore les verrous pris), changements suivis non commités, merge/rebase en
cours, HEAD détachée qui porte des commits, cible du Kanban, branche prise par un autre worktree (`IN_WORKTREE`) ou
par le dossier du projet. Puis `git switch` (une branche distante : par la branche locale
qui la suit, faite au besoin), `worktree.branch = Y`, `existing = true`, X supprimée selon la décision 4, PR vidées et
relues, ligne dans la conversation, `branch_moved = { from: X, to: Y }` gardé jusqu'au prochain message.

La synchronisation du dossier de l'agent (fetch, pull, push) passe par `agent_git_sync`, comme `git_sync` pour le
dossier du projet.

### La note du prochain message

`send` joint, devant le texte que reçoit l'agent (pas devant celui que montre la conversation), une note dans la
langue des textes : la branche quittée, la branche prise, et sa PR quand elle est connue. Elle part avec le premier
message livré, puis `branch_moved` est effacé.

### La détection des PR

`agent_prs_refresh` lit les PR de la branche que l'agent a réellement :

- son worktree (ticket compris), son worktree trouvé, sinon **le dossier du projet** — sauf quand celui-ci est sur la
  cible du board ou la branche par défaut de son remote (sinon une PR `main → prod` irait à tous les agents) ;
- **sur plusieurs dépôts** : celui du remote de la cible (comme avant), celui du remote que suit la branche, et le
  parent de ce dernier quand c'est un fork (GitHub : `repository.parent`, gardé en mémoire) ;
- une PR d'un fork est gardée quand son dépôt de tête (`headRepository`) est celui de la branche de l'agent ; les
  autres forks qui ont une branche du même nom restent écartés ;
- une PR lue ailleurs que sur le dépôt de la cible garde son dépôt (`hostRepo`) : « L'agent corrige » y lit ses checks
  et ses retours.

« Ouvrir une PR » reste réservé à l'agent ordinaire qui a une branche à lui (`pr_word` inchangé).

## Tests

- Rust : bascule (refus, branche distante, X supprimée ou gardée, note jointe une fois), suivi d'un `git switch` de
  l'agent, `agentGit` de la passe git, PR d'un fork gardée par son dépôt de tête, PR lues sur le parent, agent du
  dossier du projet (et pas sur la cible), agent de ticket.
- Vitest : la barre d'état (branche de l'agent, pastille, repli sur le dossier du projet), le sélecteur en mode agent
  (bascule, refus, synchronisation du worktree).
