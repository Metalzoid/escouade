# Mises à jour

Escouade se met à jour seule depuis les releases GitHub : elle télécharge en arrière-plan, puis installe au redémarrage que tu choisis ou, si tu le permets, d’elle-même quand elle est au repos. Cette page dit comment, selon le système, et où lire les nouveautés.

## Comment ça marche

- Escouade cherche une nouvelle version peu après son démarrage, puis cinq minutes après la fin de chaque vérification. Elle lit le fichier `latest.json` de la dernière release publiée sur [GitHub](https://github.com/guillaume-gagnaire/escouade/releases).
- Quand une version plus récente existe, elle la télécharge aussitôt, sans rien te demander, et vérifie sa signature. Pendant le téléchargement, la barre d’état affiche « Mise à jour 1.8.0… » (avec le numéro de la version).
- Une fois téléchargée, la mise à jour attend : la barre d’état affiche « Mise à jour 1.8.0 prête · Redémarrer ». Elle s’installe quand tu redémarres l’app, quand l’app redémarre d’elle-même, ou quand tu la quittes.
- L’installation se fait sans fenêtre d’installeur. Le proxy et la vérification des certificats réglés dans Réglages › Réseau valent aussi pour les vérifications et les téléchargements.

## Installer une mise à jour

### Redémarrer toi-même

Un clic sur « Mise à jour 1.8.0 prête · Redémarrer » ouvre la fenêtre « Escouade 1.8.0 est prête », qui montre les notes de la version. Deux boutons : « Plus tard » et « Redémarrer maintenant ».

La fenêtre te prévient de ce qu’un redémarrage coupe :

- Des fichiers de l’éditeur ne sont pas enregistrés : « Enregistre d’abord tes fichiers ». Le bouton « Redémarrer maintenant » reste grisé tant qu’il en reste.
- Des agents travaillent ou attendent ta réponse : leur tour en cours est interrompu. Un agent de ticket reprend de lui-même ; les autres attendent ton prochain message.

Escouade s’arrête proprement avant d’installer : les processus des agents et les terminaux s’arrêtent, la session de chaque agent et l’état de l’app sont enregistrés. Après le redémarrage, la fenêtre revient comme elle était (devant, derrière une autre, réduite ou fermée dans la zone de notification), et un message dans la fenêtre dit « Escouade 1.8.0 est installée. », avec un bouton « Voir les nouveautés ».

### Redémarrer automatiquement

Le réglage « Installer les mises à jour automatiquement » (Réglages › À propos, activé par défaut) laisse Escouade redémarrer d’elle-même : « Escouade redémarre d’elle-même quand aucun agent ne travaille et que tout est enregistré. »

L’app est au repos quand rien de ceci n’est vrai :

- Un agent travaille ou attend ta réponse (une question ou une autorisation).
- Un worktree est en préparation.
- Un ticket est en cours de validation (merge, pull request, push), ou un autre travail est en cours hors d’un tour d’agent, par exemple un ticket qui démarre ou une fusion demandée à la main.
- Une commande de lancement ou une étape d’un lancement de test tourne, ou un lancement de test est en préparation.
- Un terminal intégré a reçu ou affiché quelque chose depuis moins de cinq minutes. Un terminal resté silencieux plus longtemps ne compte pas.
- L’éditeur contient des fichiers non enregistrés.
- Une fenêtre (réglages, commit…) est ouverte.
- Tu as touché le clavier ou la souris dans la fenêtre depuis moins de cinq minutes. Ce point ne compte que si la fenêtre est à l’écran : réduite ou fermée dans la zone de notification, elle ne te retient plus.

Quand l’app est au repos, Escouade te prévient trente secondes avant de redémarrer : la barre d’état affiche « Redémarrage dans 30 s » avec un bouton « Plus tard », et une notification du système dit « Escouade redémarre pour se mettre à jour », quel que soit le réglage « Notifications système » (sous Windows, avec le même bouton « Plus tard » ; sous Linux, seule la barre d’état te prévient). Si l’app cesse d’être au repos pendant ce compte à rebours (un agent se remet au travail, tu touches le clavier), le redémarrage est annulé et attend le prochain repos. « Plus tard » le repousse de trente minutes.

### Quitter l’app

Fermer la fenêtre ne quitte pas Escouade : elle reste dans la zone de notification. Si tu la quittes (« Quitter » dans le menu de son icône, ou `⌘Q` sous macOS) alors qu’une mise à jour est prête, la mise à jour s’installe et l’app reste fermée.

### Si l’installation échoue

L’app reste sur l’ancienne version et le dit : « La mise à jour vers 1.8.0 n’a pas pu s’installer. » avec un bouton « Réessayer », qui rouvre la fenêtre de la mise à jour. Elle ne redémarre plus d’elle-même pour cette version ; elle retente à ta demande, ou quand tu quittes l’app.

## Chercher à la main

Réglages › À propos montre la version installée (« Escouade 1.7.5 », par exemple) et un bouton « Rechercher une mise à jour ». La réponse est « Aucune mise à jour disponible. », ou la mise à jour apparaît dans la barre d’état. Une panne est dite telle quelle : « Vérification des mises à jour impossible » ou « Téléchargement de la mise à jour impossible », suivis de ce que le serveur a répondu. Derrière un proxy ou un certificat d’entreprise, voir le [dépannage](troubleshooting).

## Selon le système

### Windows

L’installeur tourne sans fenêtre et Escouade redémarre sur la nouvelle version.

### macOS

L’app est signée avec un certificat Apple Developer ID et notariée par Apple (depuis la 1.5.4) : macOS l’ouvre sans demander d’autorisation. La mise à jour remplace l’app en place.

Le redémarrage automatique, et l’installation à la fermeture de l’app, demandent que ton utilisateur puisse modifier Escouade.app et le dossier qui la contient. Sinon, la mise à jour attend ton clic sur « Redémarrer maintenant », et macOS peut demander un mot de passe d’administrateur.

### Linux

La mise à jour intégrée remplace l’`AppImage` que tu as lancée. Le `.deb` (Debian, Ubuntu) s’installe d’abord avec `sudo apt install ./Escouade_*_amd64.deb` ; ensuite, la mise à jour intégrée télécharge le nouveau `.deb` de la release et l’installe avec `dpkg` : le système te demande alors ton mot de passe d’administrateur (par `pkexec`, à défaut par `sudo`).

## De Claude Code Manager à Escouade

Escouade s’appelait « Claude Code Manager ». La mise à jour qui l’a renommée remplace l’ancienne installation et garde tes réglages, tes projets et tes conversations. Sous Windows, l’installeur retire d’abord l’ancienne installation en gardant tes données, puis crée les raccourcis d’Escouade. Le dossier de données change de nom : voir les [données locales](data).

## Lire ce qui a changé

- **Dans l’app.** La fenêtre d’une mise à jour prête montre ses notes. Après l’installation, « Voir les nouveautés » ouvre « Nouveautés d’Escouade 1.8.0 ».
- **Sur GitHub.** Le [journal des versions](https://github.com/guillaume-gagnaire/escouade/blob/main/CHANGELOG.md) liste, version par version, ce qui change. Les notes de chaque release en reprennent la section de la version.
