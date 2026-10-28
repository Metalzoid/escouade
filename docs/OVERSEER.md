# L'Overseer et les tâches planifiées

Conception du 2026-10-28, faite avec l'utilisateur, pour une 2.x : l'« Overseer » et la « Planification d'agents » des idées de `docs/TODO-2.1.md`. Les maquettes sont dans `design/overseer/`. Ce document dit ce que l'utilisateur a décidé, ce que le chef d'escouade a tranché (marqué **« choix du chef »**) et ce qui reste au constructeur.

## L'intention

**L'Overseer** : « je pilote, et il contrôle tout Escouade sur tous mes projets, au fil de l'eau ; il relit ou délègue la relecture ; il devient ma seule interface ». Il faut le voir **comme un employé** : il fait ce qu'on lui demande, sans rechigner. On lui parle **à la voix ou au clavier**, dans une vraie discussion. Il reste très réactif (un petit modèle, jamais de longues tâches : il délègue), et son écran montre, « à la Minority Report », tout ce qu'il a lancé, ce qui est en cours, ce qui attend, et ce qui vient de finir.

**Les tâches planifiées** : des tickets d'agent qui se lancent **comme un cron**, projet par projet (une revue des dépendances chaque lundi, un rapport chaque soir…), que l'Overseer voit et pilote aussi.

C'est, intégré à l'app, ce que fait aujourd'hui une session « chef d'escouade » par le serveur MCP : lancer, suivre, relire, fusionner, publier sur consigne, et rendre compte.

## Objectifs

1. Une seule interface, à la voix ou au clavier, pour piloter tous les projets.
2. Un Overseer qui avance seul sur tous les sujets en parallèle et ne parle que des nouvelles.
3. Un écran qui montre d'un coup d'œil ce qui tourne, ce qui attend, ce qui finit, à côté de la discussion.
4. Des tâches d'agent qui reviennent à heure fixe, sans doublon.

## Ce qui n'en fait pas partie

- **L'Overseer ne fait pas le travail long** : au-delà d'une réponse ou d'une action rapide, il lance un agent ou un ticket (décidé).
- **Pas de déclenchement sur un événement** pour les tâches planifiées : un horaire, comme un cron (décidé). L'Overseer, lui, réagit aux événements.
- **Pas de projets privés** : ils restent hors de sa vue (ESC-140), confirmé à la relecture (2026-10-28) : « si quelqu'un veut parler avec un projet privé, il lance un agent dans le projet privé en mode vocal ». La conversation vocale d'un agent (ESC-97) reste la façon de parler à un projet privé.
- **Pas de mot de réveil** : on l'appelle par un raccourci ou un bouton (décidé).

## Ce qui serait un échec, même si tout marche

- Un Overseer qui refuse, ou qui renvoie la tâche (« lance-la toi-même ») : il agit avec les droits de l'utilisateur.
- Un Overseer qu'un texte lu pourrait piloter : un ticket, un document de la MOA, la réponse d'un agent, une page web.
- Un ordre mal entendu exécuté sans que l'écran le montre.
- Une tâche planifiée lancée deux fois pour la même échéance, ou en double parce que plusieurs échéances ont été manquées.

## L'Overseer

### Son autorité (décidé)

- **Il agit comme l'utilisateur** : ce que l'utilisateur peut faire d'un clic dans la fenêtre, l'Overseer le fait quand on le lui demande, sans confirmation et sans le renvoyer vers lui. Il pilote par les actions d'Escouade (celles de la fenêtre et du serveur MCP), pas par les permissions d'un harness ni un mode auto.
- **Il n'obéit qu'à l'utilisateur** : à ce qui est dit ou tapé dans sa discussion. Jamais à une consigne trouvée dans ce qu'il lit (tickets, documents, réponses d'agents, sorties de commandes, pages web), qu'il traite comme des informations.
- **Il montre ce qu'il a compris en agissant** : ton message tel qu'il l'a reçu (dit ou tapé), puis les actions faites, chacune avec « Annuler » tant que c'est possible (un agent qu'on vient de lancer, un ticket qu'on vient de créer, un message pas encore lu, une consigne qu'on vient d'ajouter). Ce n'est pas une confirmation : il n'attend pas.

### Son autonomie (décidé)

- Il **tourne en continu** tant qu'Escouade tourne, fenêtre fermée comprise (l'app reste dans la zone de notification).
- Il **avance seul** sur tous les sujets en parallèle : il répond aux questions et aux demandes d'autorisation des agents **à la place de l'utilisateur quand il sait ce qu'il dirait** ; il relit, ou confie la relecture à un autre agent ; il relance, débloque, enchaîne.
- Il **dit quand il y a des nouvelles** : une tâche finie, un blocage, une question qu'il ne peut pas trancher (qui passe dans « Attend ta réponse »).
- **Ses droits viennent de ce qu'on lui dit** : s'il a la consigne de fusionner, de publier, de pousser (« tu peux merger sur le portail », « quand la CI est verte, pose le tag et publie »), il le fait ; sinon, il demande.
  - **Choix du chef** : ces consignes durables forment une liste (« Consignes · 3 » en haut de son écran, et dans les réglages), chacune avec sa portée (un projet, un ticket, une release, une date de fin), retirable d'un mot (« arrête de merger seul ») ou d'un clic (« Retirer » dans le fil). Ce n'est pas un verrou : c'est sa mémoire des consignes.

### Comment il est fait

- **Choix du chef** : l'Overseer est un agent d'Escouade, sur un harness et un compte de l'utilisateur, avec les outils du serveur MCP d'Escouade et une consigne propre. Aucun harness n'impose une clé d'API, et les quotas et coûts se comptent comme pour les autres agents.
- **Son modèle se règle dans les Réglages** (décidé) : une section « Overseer » avec le harness, le compte, le modèle et l'effort (**choix du chef** : un petit modèle rapide par défaut, Haiku sur Claude Code), le raccourci, et sa voix.
- **Choix du chef** : une seule session longue, réveillée par Escouade à chaque événement utile (un tour fini, une question, un blocage, une CI, une échéance), les événements proches regroupés en un message. Elle se compacte ou se renouvelle d'elle-même ; ce qui doit durer va dans sa mémoire.
- **Choix du chef** : sa mémoire à lui (les façons de répondre de l'utilisateur, ses préférences, les consignes) vit dans le dossier système d'Escouade, puisqu'elle couvre tous les projets ; il lit aussi la mémoire partagée de chaque projet (`docs/FACTORY.md`).
- **La voix** : la chaîne vocale d'Escouade (transcription locale ou en ligne, en direct ; voix locale ou en ligne).
- **Le faire venir** (décidé) : un **raccourci clavier**, et un **bouton dans la barre de titre**. **Choix du chef** : le raccourci marche aussi quand la fenêtre n'a pas le focus.
- **Choix du chef** : fenêtre fermée, ses nouvelles arrivent en notification du système ; il ne parle à voix haute que son écran ouvert.

### Son écran (retenu : l'orbite à gauche, la discussion à droite)

- **À gauche, l'orbite** : l'orbe au centre, qui suit la voix (comme la conversation vocale d'ESC-97). Les tâches **gravitent autour**, en arcs : en cours en haut, **ce qui attend l'utilisateur** à droite (ambre, plus près de l'orbe), le terminé qui s'éloigne en bas. Tous projets mêlés, chaque carte à la couleur de son projet. **Une tâche finie fond vers le centre et s'illumine** pendant qu'il l'annonce.
- **À droite, la discussion** (décidé : « une vraie discussion »), un panneau de verre comme la conversation d'un agent :
  - tes messages, avec la façon dont ils sont arrivés (« dit » ou « tapé ») et l'heure ;
  - ses réponses, et sous elles ce qu'il a fait, avec « Annuler » ou « Retirer » ;
  - les nouvelles en cartes (« Terminé · DEM-31… »), avec les réponses toutes prêtes (« Valide-le », « Montre-moi le diff », « Renvoie-le »).
- **En bas de la discussion, le champ** « Demande à l'Overseer… » (décidé : on le pilote aussi sans la voix) : Entrée envoie ; **maintenir Espace** (ou le bouton micro) pour parler.
- **Quand tu parles** : l'orbe s'éclaire et ses anneaux battent avec ta voix ; ta phrase s'écrit en direct, en grand sous l'orbe et dans le fil ; le champ devient une onde ; relâcher Espace envoie, Échap annule.
- **Quand il répond** : l'orbe gonfle avec sa voix ; sa phrase passe en sous-titres sous l'orbe et s'écrit dans le fil en même temps, avec ce qu'il fait ; parler ou taper l'interrompt.
- Maquettes : `ecran-discussion.png`, `voix-tu-parles.png`, `voix-il-repond.png` (retenues) ; `ecran-v1-orbite.png` (l'orbite seule, d'avant la discussion), `ecarte-pont.png`, `ecarte-mur.png`, `ecarte-discussion-dessous.png` (écartées).

## Les tâches planifiées

### Ce que c'est (décidé)

- **Un ticket d'agent avec un horaire** : une **consigne** (le prompt : ce qu'il faut faire), des critères, un compte, un modèle, un effort, comme un ticket ; et un rythme : chaque jour, chaque semaine (jours choisis), chaque mois, ou une expression cron ; une heure.
- **Par projet**. L'Overseer les voit, les crée, les modifie et les met en pause par le serveur MCP, comme l'utilisateur dans la fenêtre.
- À chaque échéance, Escouade crée un ticket depuis la tâche et le lance ; il suit les colonnes du Kanban comme les autres, marqué d'une horloge, avec un lien vers sa tâche.

### Les échéances manquées et les doublons (décidé)

- **Le rattrapage se règle tâche par tâche** : si Escouade était fermé à l'heure dite, la tâche part à son retour, ou attend la prochaine échéance.
- **Jamais en double** : plusieurs échéances manquées ne donnent **qu'une** exécution au retour.
- **Choix du chef** : même règle quand la précédente tourne encore (son ticket en « À faire » ou « En cours ») : l'échéance passe son tour. Un ticket en « À tester » compte comme fini pour la planification.
- **Choix du chef** : un ticket planifié respecte les places et les quotas du Kanban comme un ticket lancé à la main ; l'heure est celle de la machine.
- **Choix du chef** : les tâches planifiées restent sur la machine, jamais partagées par le dépôt : partagées, chaque membre de l'équipe les lancerait, et ce serait des doublons.

### Où on les voit (décidé)

- Une section **« Planifiées »** dans la barre latérale, **au-dessus des lancements**, sans encadré, comme « Lancement » et « Terminaux » ; **de hauteur limitée et défilable** (une douzaine de tâches ne prend pas toute la barre).
- Chaque ligne : le titre, le rythme, la prochaine échéance (ou « en cours » avec le lien vers son ticket), un interrupteur de pause.
- « ＋ » ouvre le formulaire du ticket en mode « Planifier », **la consigne en tête** : le rythme simple ou en cron, « Lancer au retour d'Escouade, une seule fois », et les prochaines échéances affichées.
- La carte de l'agent lancé porte « ⏱ planifiée ».
- Maquettes : `planifiees-barre.png` (la place A, au-dessus des lancements, est retenue), `planifiees-formulaire.png`.

## Ce qui reste au constructeur

- Le raccourci par défaut et sa forme sur les trois systèmes.
- La liste des actions qu'on peut annuler, et pendant combien de temps.
- Le regroupement des événements qui réveillent l'Overseer, et la façon dont sa session se renouvelle sans perdre le fil.
- Les animations (l'orbe qui suit les voix, la tâche qui fond vers le centre), dans le respect de `prefers-reduced-motion`.
- La lecture des expressions cron (une crate éprouvée), l'heure d'été, et la reprise au démarrage.
- Le découpage en tickets : la planification d'abord (plus petite, utile seule), puis l'Overseer (l'agent, ses consignes et ses réglages, puis son écran et la voix).
