# Réglages : À propos

L’onglet « À propos » des réglages montre la version d’Escouade, cherche les mises à jour, dit si elles s’installent seules et indique où sont tes données locales.

## Ouvrir l’onglet

Ouvre les réglages avec `Ctrl+,` (`⌘,` sous macOS), puis choisis « À propos » (« Version et données locales »). Ces réglages sont ceux de l’app, communs à tous les projets ; ils s’appliquent à « Enregistrer ». La version est aussi écrite en bas de la colonne des onglets, après le mot « Escouade », quel que soit l’onglet ouvert.

## Escouade

L’onglet n’a qu’un groupe, « Escouade », avec trois lignes.

| Ligne | Ce qu’elle montre ou fait | Par défaut |
|---|---|---|
| « Escouade » suivi de la version | La version installée. Dessous, « Claude Code détecté » ou « Claude Code introuvable », selon qu’Escouade trouve `claude`. À droite, le bouton « Rechercher une mise à jour ». | — |
| « Installer les mises à jour automatiquement » | « Escouade redémarre d’elle-même quand aucun agent ne travaille et que tout est enregistré. » | Activé |
| « Données locales » | Le dossier où Escouade garde ses données : `~/.escouade/`. | — |

Si Claude Code est introuvable, indique son chemin dans l’onglet [« Claude Code »](settings-claude-code).

## Rechercher une mise à jour

Escouade cherche seule : une première fois quelques secondes après son démarrage, puis cinq minutes après la fin de chaque recherche. Le bouton « Rechercher une mise à jour » (il dit « Recherche… » pendant l’appel) lance une recherche tout de suite. Sans version plus récente, un message dit « Aucune mise à jour disponible. » ; si la recherche échoue, un message d’erreur le dit.

Une version trouvée est téléchargée aussitôt et sa signature est vérifiée, puis elle attend. Quand elle est prête, la barre d’état affiche un bouton, par exemple « Mise à jour 1.8.0 prête · Redémarrer ». Il ouvre une fenêtre, par exemple « Escouade 1.8.0 est prête », qui montre les notes de la version. « Redémarrer maintenant » installe la mise à jour. Il est grisé tant qu’un fichier de l’éditeur n’est pas enregistré (la fenêtre te le dit), et la fenêtre prévient quand des agents travaillent, car le redémarrage interrompt leur tour. « Plus tard » ferme la fenêtre sans rien installer.

La recherche et le téléchargement passent par le proxy de l’onglet [« Réseau »](settings-network). Le détail du parcours est dans [les mises à jour](updates).

## Installer les mises à jour automatiquement

Activé par défaut. Une mise à jour téléchargée redémarre alors Escouade toute seule, dès que l’app est au repos. Désactivé, la mise à jour reste prête : tu la lances avec « Redémarrer » dans la barre d’état, ou elle s’installe quand tu fermes l’app (qui reste alors fermée).

Escouade est au repos quand rien de ceci n’est vrai :

- un agent est en plein tour, ou attend ta réponse ou une autorisation ;
- un worktree est en cours de préparation ;
- un ticket est en cours de validation, ou un autre travail est en cours (démarrage d’un ticket, nettoyage…) ;
- une commande de lancement ou une étape de lancement de test tourne, ou un lancement de test se prépare ;
- un terminal intégré a reçu ou produit du texte depuis moins de 5 minutes ;
- un fichier de l’éditeur n’est pas enregistré ;
- une fenêtre est ouverte par-dessus l’app ;
- tu as utilisé le clavier ou la souris dans la fenêtre depuis moins de 5 minutes (une fenêtre cachée ou réduite ne compte pas).

Une fois au repos, Escouade te prévient 30 secondes avant : une notification système (pas sous Linux), même si les notifications système sont désactivées dans l’onglet [« Notifications »](settings-notifications), dit « Escouade redémarre pour se mettre à jour » avec un bouton « Plus tard », et la barre d’état compte à rebours (« Redémarrage dans 20 s »). « Plus tard » repousse le redémarrage de 30 minutes. Il est dans la barre d’état, à côté du compte à rebours, et dans la notification sous Windows seulement (la notification de macOS n’a pas de bouton). Si, pendant ces 30 secondes, tu reprends la main ou qu’un agent se remet au travail, le redémarrage est annulé.

Si une version n’a pas pu s’installer, Escouade ne redémarre plus seule pour elle : tu peux réessayer à la main.

> [!NOTE]
> Sous macOS, le redémarrage automatique n’a lieu que si Escouade peut remplacer son application sans mot de passe d’administrateur. Sinon, redémarre-la toi-même quand la mise à jour est prête.

## Données locales

La ligne « Données locales » indique `~/.escouade/`, dans ton dossier personnel (`C:\Users\<toi>\.escouade` sous Windows). L’onglet ne fait qu’en indiquer l’emplacement : il n’a pas de bouton pour l’ouvrir, ouvre-le avec ton gestionnaire de fichiers. Ce qu’il contient est décrit dans [les données locales](data).
