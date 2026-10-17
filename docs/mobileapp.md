# Escouade depuis le téléphone — chantier

But : suivre et piloter Escouade depuis son téléphone, hors de chez soi. Voir les agents qui attendent, répondre à une autorisation ou une question, envoyer un message, regarder le Kanban, ouvrir le serveur de dev d'un agent pour le tester. Le tout sans service tiers ni abonnement, et avec une configuration réduite à une redirection de port dans la box et un QR code à scanner.

Le remote control (claude.ai et l'app Claude) existe déjà pour une conversation d'agent ; ce chantier couvre le reste d'Escouade.

## Architecture retenue

Escouade embarque un pair WireGuard, et son serveur n'est jamais exposé à Internet : seul le port UDP de WireGuard l'est.

```
Téléphone (app WireGuard + app ou navigateur)
   │  UDP, chiffré par WireGuard
   ▼
Box  ── redirection du port UDP X ──▶  PC : Escouade
                                         ├─ WireGuard en espace utilisateur (port X)
                                         ├─ pile réseau intégrée (adresse du tunnel, ex. 10.77.0.1)
                                         └─ serveur d'Escouade, joignable dans le tunnel seulement
```

- **WireGuard dans l'app, sans interface système** : `boringtun` (ou `defguard_wireguard_rs`) pour le protocole, `smoltcp` pour une pile TCP/IP à l'intérieur d'Escouade. Pas d'interface `wg0`, donc aucun droit administrateur : pas de pilote Wintun sous Windows, ni de Network Extension sous macOS, ni de capacité réseau sous Linux. Seul le trafic d'Escouade passe dans le tunnel.
- **Côté téléphone** : l'app WireGuard officielle (iOS, Android), configurée en scannant un QR code ; ou, plus tard, une app Escouade qui embarque WireGuard elle-même.
- **Pourquoi pas un port HTTP ouvert directement** : Escouade lance des agents qui exécutent des commandes, ouvre des terminaux et écrit dans les dépôts. Un serveur HTTP exposé serait scanné en quelques minutes, et la moindre faille deviendrait une prise de contrôle de la machine. Avec WireGuard, un paquet non signé par une clé connue est ignoré sans réponse : un scan ne voit rien, et la surface exposée se réduit à une implémentation petite et très auditée.

## Configuration, pour l'utilisateur

1. Réglages › Téléphone › « Activer l'accès depuis le téléphone » : Escouade choisit un port UDP (modifiable), génère sa paire de clés et celle du téléphone.
2. Escouade dit quoi faire dans la box : rediriger le port UDP X vers l'adresse locale du PC, avec l'adresse et le port à recopier. Il essaie d'abord de l'ouvrir lui-même par UPnP ou NAT-PMP, et dit si ça a marché.
3. Escouade affiche un QR code : la config WireGuard du téléphone (sa clé privée, la clé publique d'Escouade, l'adresse publique et le port, `AllowedIPs` limité à l'adresse du tunnel, `PersistentKeepalive = 25`).
4. Sur le téléphone : app WireGuard › scanner le QR code › activer. L'interface d'Escouade s'ouvre à l'adresse du tunnel.

Plusieurs téléphones : un pair et un QR code par appareil, révocable un par un.

## Points durs

- **L'adresse publique** : une IP fixe, sinon elle change. Pistes : la relire régulièrement (un service « quelle est mon IP ») et prévenir quand le QR code est périmé ; accepter un nom DynDNS saisi par l'utilisateur (DuckDNS, celui de la box).
- **CGNAT** : derrière une IPv4 partagée par l'opérateur, la redirection ne sert à rien. Escouade doit le détecter (l'adresse de la box côté WAN n'est pas l'adresse publique vue de l'extérieur) et le dire, avec les issues : demander une IPv4 dédiée à l'opérateur, passer par IPv6, ou un relais.
- **IPv6** : souvent disponible même derrière un CGNAT ; il faut alors ouvrir le port dans le pare-feu IPv6 de la box plutôt qu'une redirection.
- **Pare-feu du PC** : Windows demande l'autorisation au premier lancement ; macOS et Linux selon leur config.
- **Le PC en veille** : rien ne répond. À dire dans l'interface ; option possible d'empêcher la veille tant que l'accès est actif.
- **Authentification dans le tunnel** : même dans le tunnel, l'interface demande un jeton d'appareil (défense en profondeur si une clé de téléphone fuit). Révoquer un téléphone retire son pair et son jeton.

## Ce que voit le téléphone

À décider :

- **Option A, l'interface web d'Escouade servie dans le tunnel** : la même interface Svelte, servie par un petit serveur HTTP de l'app, avec une mise en page mobile. Le moins de code à écrire, mais tous les composants doivent marcher hors de Tauri : les appels `invoke` et les événements passent par HTTP et WebSocket.
- **Option B, une app mobile dédiée** : plus agréable (notifications push, WireGuard intégré, pas d'app WireGuard à part), mais une app iOS et Android à maintenir et à publier.

Proposition : A d'abord, centré sur ce qui sert loin du PC (vue d'ensemble, réponses aux autorisations et questions, envoi d'un message, Kanban en lecture, ouverture du serveur de test d'un agent), puis B si l'usage le justifie.

## Alternative sans WireGuard dans l'app

Si Tailscale (ou Netbird, Headscale) est installé sur le PC et le téléphone, Escouade peut simplement servir son interface sur l'adresse Tailscale de la machine : aucun port à ouvrir, perçage de NAT et relais fournis, CGNAT compris. À proposer en plus de l'accès intégré, quand Escouade détecte Tailscale.

À ne pas faire : refaire Tailscale (perçage de NAT des deux côtés, relais hébergés).

## Tâches

- [ ] Essais : `boringtun` + `smoltcp` dans un binaire de test, joint depuis l'app WireGuard d'un téléphone en 4G, sous Windows, macOS et Linux.
- [ ] Module `remote` (backend) : pair WireGuard, pile réseau, serveur HTTP et WebSocket dans le tunnel, pairs et jetons gardés (clés privées dans le trousseau comme les jetons des intégrations).
- [ ] Ouverture du port par UPnP et NAT-PMP, détection du CGNAT et de l'adresse publique, suivi de son changement.
- [ ] Réglages › Téléphone : activation, port, QR code par appareil, liste des appareils et révocation, état (port ouvert ou non, adresse publique, dernière connexion).
- [ ] L'interface web hors de Tauri (couche d'appel HTTP et WebSocket à la place d'`invoke`), mise en page mobile des écrans retenus.
- [ ] Détection de Tailscale et de son adresse.
- [ ] Docs : README, site, et la FAQ « Où vont mes données ? », qui doit mentionner ce nouvel accès.
