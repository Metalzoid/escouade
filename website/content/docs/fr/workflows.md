# Les workflows d’un projet

Un workflow est la suite d’étapes que tes agents suivent dans un projet (GSD, Superpowers, une boucle `PROMPT.md`…). Escouade le lit sur ta machine, sans rien dépenser, et dit où en est chaque agent. Cette page dit ce qu’elle suit de chaque harness et ce que le serveur MCP en donne.

> [!NOTE]
> Le mot est « workflow ». Une « boucle » reste le tour d’un ticket (« boucle 2/5 »), et un retour en arrière dans un workflow s’appelle un retour.

## Ce qu’Escouade lit

Escouade ne demande rien à l’agent. Elle lit les commandes (`.claude/commands`), les skills, les sous-agents et les prompts de chaque harness, sous le dossier du projet et dans les dossiers propres des harness, puis les fichiers d’état que les étapes écrivent (`.planning/STATE.md`, `fix_plan.md`…). Un workflow, ce sont au moins deux étapes reliées, ou un prompt rejoué ; une commande seule (`/commit`) n’en est pas un.

Pour chaque workflow, elle garde :

- ses **portes d’entrée** : les commandes ou skills par où l’on entre ;
- ses **étapes**, chacune avec sa commande, ses sous-agents et les fichiers qu’elle lit et écrit ;
- ses **retours** : un retour vers une étape déjà passée, avec la ligne qui dit quand et le nombre de fois au plus ;
- ses **fichiers d’état**, et ce qu’ils disent (« phase 3 sur 6 », « 12 cases cochées sur 20 ») ;
- sa **condition de sortie**.

Un projet à plusieurs dépôts a le workflow de chaque dépôt. La lecture se refait quand un fichier lu change, et à la demande.

## Où en est chaque agent

Chaque agent est placé d’après ce qu’il fait : la porte qu’il a tapée, les sous-agents qu’il lance, les skills qu’il appelle, les fichiers d’état qu’il écrit, la fin de ses tours. Une étape commence au premier fait qui la signale et finit au premier fait d’une autre ; sa durée et son coût sont ceux des tours entre les deux.

Chaque passage dans une étape reste dans l’historique de l’agent : l’heure, la durée, le coût, ce qui s’y est fait, l’issue, et pour un retour, la raison que l’étape donne. L’historique est gardé après un redémarrage, avec l’agent. Un agent qui fait autre chose (son message ne vient d’aucune porte et ses outils ne signalent aucune étape) est « hors du workflow » jusqu’à la porte suivante.

## Ce que chaque harness permet de suivre

| Harness | L’étape | Le sous-agent en cours | Le coût par étape |
|---|---|---|---|
| Claude Code (conversation) | oui | oui | oui |
| Claude Code (vue Claude Code) | oui, par ses hooks | oui, par ses hooks | à la fin du tour |
| OpenCode | oui | oui | oui |
| Copilot CLI | oui | oui | en crédits |
| Codex | par ses prompts et les fichiers d’état | non | par tour |
| Cursor CLI | par ses commandes et les fichiers d’état | oui, selon ACP | non |
| Cursor CLI (vue Cursor) | par son transcript, à quelques secondes près | non | non |

Un suivi partiel est dit comme tel dans la fenêtre (« Suivi partiel »), avec ce qui manque. Rien n’est inventé : ce qu’un harness ne montre pas n’est pas deviné.

## Par le serveur MCP

Trois outils, tous en lecture seule (voir [le serveur MCP](mcp) pour les autres) :

- **`get_workflow`** (`project`) : les workflows du projet, comme l’onglet Workflow les montre. Pour chacun, ses portes, ses étapes (commande, sous-agents, fichiers lus et écrits), ses retours (`back`, avec leur `condition` et leur `max`) et, sur chaque étape, les agents qui y sont maintenant (`agentsHere` : id, nom, depuis quand, Nᵉ passage). Les agents qui suivent un workflow sans être sur une étape sont à part (`agentsElsewhere`).
- **`list_agents`** : chaque agent gagne `workflow`, son nom, son étape, son tour (celui d’un prompt rejoué, ou la boucle de son ticket) et depuis quand ; `null` quand il n’en suit aucun.
- **`get_agent_summary`** : le même `workflow`, et l’historique des étapes (`history`, les 100 derniers passages, du plus ancien au plus récent).

Un agent ne se met pas dans une étape par un outil : il y entre en faisant le travail, et c’est ce que ces outils lisent. Rien d’autre n’est exposé que ce que montre l’onglet : jamais un fichier du projet, ni une conversation.

### Projets privés

Un [projet privé](settings-projects) ne dit rien de ses workflows aux agents des autres projets : `get_workflow` ne le trouve pas (dans les mêmes mots qu’un projet qui n’existe pas), et ses agents, leur étape et leur historique n’apparaissent dans aucune liste des autres. Ses propres agents, eux, ne voient que lui.

## À lire aussi

- [Le serveur MCP](mcp) : tous les outils, et ce qu’un agent d’Escouade voit.
- [Le bandeau Plan](plan) : la liste de tâches et les sous-agents d’un agent, qui complètent son étape.
- [Les harness](harness) : ce que chacun sait faire.
