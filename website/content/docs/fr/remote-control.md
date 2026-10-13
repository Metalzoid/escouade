# Le remote control

Le remote control rend la session d’un agent accessible depuis claude.ai et l’app Claude sur mobile, pour que tu puisses lui répondre depuis un navigateur ou ton téléphone. Cette page explique comment l’activer, ce qui s’affiche dans Escouade, combien de temps l’agent reste joignable et comment le couper.

![Escouade à gauche, avec l’icône du remote control sur la carte de l’agent « refacto-auth », et à droite l’app Claude sur mobile qui montre la même conversation, nommée « demo-api · refacto-auth »](/images/remote.jpg)

## Activer le remote control

1. Fais un clic droit sur la carte de l’agent dans la barre latérale.
2. Choisis « Activer le remote control » (« claude.ai, mobile »).

Escouade démarre le processus de l’agent s’il est arrêté et demande à Claude Code d’ouvrir la session à distance. Un message confirme : « refacto-auth est accessible depuis claude.ai et l’app Claude ». La session y porte le nom `projet · agent`, par exemple `demo-api · refacto-auth`.

Si Claude Code ne peut pas ouvrir la session, un message d’erreur commençant par « Remote control indisponible » s’affiche, et l’option reste désactivée.

Le menu d’un agent archivé ne propose pas le remote control. Pour un agent qui tourne dans [la vue Claude Code](claude-code-view), l’entrée n’est proposée que s’il est déjà activé : dans cette vue, c’est la commande `/remote-control` de l’interface de Claude Code qui l’active et le coupe, et le changement de vue est refusé tant que le remote control d’Escouade est activé.

## Ce qui s’affiche dans Escouade

Une icône d’onde apparaît sur la carte de l’agent, après son nom. Elle dit où en est la liaison, et son infobulle la détaille :

| Icône | Début de l’infobulle | Sens |
|---|---|---|
| Bleue | « Remote control : connecté » | La session est ouverte et connectée. |
| Grise | « Remote control : connexion… » ou « Remote control : en attente de connexion » | La liaison s’établit. |

Chaque infobulle se termine par « (accessible depuis claude.ai et l’app Claude) ».

Quand l’agent est joignable, le menu de la carte change :

| Entrée | Effet |
|---|---|
| Désactiver le remote control | Coupe la liaison (voir plus bas). |
| Ouvrir sur claude.ai | Ouvre la session dans ton navigateur. |
| Copier le lien claude.ai | Copie l’adresse de la session (« Lien claude.ai copié »), pour l’ouvrir sur un autre appareil. |

Les deux dernières entrées apparaissent dès que l’adresse de la session est connue.

Ce que tu envoies à l’agent depuis claude.ai ou l’app Claude s’affiche aussi dans la conversation d’Escouade, dans une bulle comme les tiennes, avec la mention « depuis claude.ai » (son infobulle dit : « Envoyé depuis claude.ai ou l’app Claude (remote control) »).

## Combien de temps l’agent reste joignable

- **Tant qu’Escouade tourne.** L’agent reste joignable quand tu fermes la fenêtre : elle se cache et l’app continue dans la zone de notification (voir [les agents](managing-agents#fermer-la-fenetre-quitter-et-redemarrer)). Si tu quittes l’app avec « Quitter », les agents s’arrêtent et ne sont plus joignables.
- **Sans arrêt pour inactivité.** Escouade arrête normalement le processus d’un agent inactif au bout d’un délai (30 minutes par défaut) ; un agent dont le remote control est activé garde le sien, pour rester joignable.
- **Après un redémarrage.** Escouade relance les agents dont le remote control est activé en même temps que l’app et rattache leur session à distance précédente : le lien que tu avais ouvert sur ton téléphone reste valide. Si cette session a disparu entre-temps, une nouvelle est ouverte, avec un nouveau lien. Si la liaison échoue au démarrage, un avis « Remote control indisponible : » suivi de la cause s’affiche dans la conversation de l’agent.

## Désactiver le remote control

Fais un clic droit sur la carte de l’agent, puis « Désactiver le remote control ». Escouade demande à Claude Code de fermer la session à distance, l’icône disparaît, et l’agent redevient un agent ordinaire (que l’arrêt pour inactivité peut de nouveau arrêter). Archiver un agent ou le supprimer coupe aussi son remote control.
