# Mise à jour qui tient bon (ESC-99) — conception

Deux causes aux 403 et aux échecs de la mise à jour :

1. **Le Release publiait la release tout de suite**, puis les trois builds y déposaient leurs fichiers
   pendant ~30 min, chacun réécrivant `latest.json`. « latest » désignait donc une release sans
   `latest.json`, ou avec un `latest.json` partiel.
2. **Un proxy d'entreprise** (Zscaler sur un poste de l'utilisateur, `127.0.0.1:9000`, TLS inspecté)
   laisse passer `latest.json` mais refuse l'installateur `.exe` à un client non navigateur (403).
   Le navigateur passe, après une double confirmation de Zscaler.

Règle : ne jamais contourner une règle de sécurité de l'entreprise (pas de User-Agent de navigateur,
pas d'exécutable déguisé). L'app s'annonce honnêtement, dit qui a refusé, et propose le navigateur.

## 1. Workflow Release (`.github/workflows/release.yml`)

- **create** : crée la release **en brouillon** (`gh release create --draft --verify-tag`, plus
  `--prerelease` pour un tag `vX.Y.Z-…`) ; une release qui existe déjà pour ce tag (créée sur la page
  GitHub, ou run relancé) repasse en brouillon (`PATCH draft=true`). Sortie `release-id` :
  l'id de la release, trouvé par l'API (`GET /releases`, qui voit les brouillons ;
  `getReleaseByTag` ne les voit pas).
- **build** (×3) : `tauri-action` reçoit `releaseId` (et garde `tagName`, qui réécrit dans
  `latest.json` les liens `…/download/untagged-…/` d'un brouillon en `…/download/<tag>/`, et
  `releaseBody`, les notes de `latest.json`). Plus de `releaseDraft`, `releaseName`, `prerelease`.
  Relancer un build échoué (`gh run rerun --failed`) redépose ses fichiers dans le même brouillon
  (tauri-action remplace un fichier du même nom) : c'est désormais sans danger.
- **publish** (après les trois builds réussis) : lit les fichiers du brouillon et son `latest.json`
  par l'API, et `scripts/release-check.mjs` vérifie : `version` = tag sans `v` ; les plateformes
  `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64` présentes ; chaque entrée a une
  signature et une `url` en `…/releases/download/<tag>/<fichier>` ; chaque fichier désigné est un
  fichier du brouillon, `state: uploaded`, taille > 0. Puis publie par l'id
  (`PATCH draft=false`, `make_latest=true`, ou `false` pour une pré-version), et vérifie ce que lit
  l'updater (`releases/latest/download/latest.json`, ou `releases/download/<tag>/latest.json` pour une
  pré-version) : sa version est celle du tag (quelques essais, le temps du cache).
- **guard** (« Back to draft ») disparaît : un build raté laisse simplement le brouillon.

## 2. L'app (Rust, `src-tauri/src/updates.rs` + `src-tauri/src/updates/net.rs`)

### Requêtes

- User-Agent honnête sur la vérification et le téléchargement : `Escouade/<version> (<Windows|macOS|Linux>; <arch>)`
  (`UpdaterBuilder::header`, gardé par l'`Update` pour son téléchargement).
- La vérification et le téléchargement restent ceux du plugin (signature vérifiée par lui). Quand
  l'un échoue, une **sonde** (reqwest de l'app, mêmes proxy, TLS, User-Agent et `Accept`) refait la
  même requête GET pour savoir ce qui a répondu : code HTTP, domaine qui a répondu (URL finale après
  redirections), passé par le proxy ou non, ce que la réponse dit d'elle-même (`Proxy-Agent`, ou un `Server` / une
  page de blocage qui nomme un proxy connu : Zscaler, Netskope, Squid, Blue Coat, Forcepoint,
  Fortinet, Palo Alto, Umbrella, Sophos, Skyhigh…), et le début du texte d'une page d'erreur.
  Le proxy n'est nommé (« le proxy de ton entreprise (Zscaler/6.2) a refusé… ») que d'après cela : un
  `Via` ne suffit pas (un proxy comme Squid l'ajoute à toute réponse, même à un refus de GitHub). Le
  nom est coupé à 160 caractères. Aucun lien signé (la requête `?sig=…` des liens de GitHub) n'apparaît
  dans un message ni dans le journal.
- **Repli sans proxy**, seulement quand **le proxy lui-même est injoignable** (proxy réglé mais arrêté,
  poste hors du réseau de l'entreprise : connexion refusée ou délai dépassé vers le proxy) : la requête
  est refaite une fois sans proxy ; le journal dit que l'accès direct a marché ; si les deux échouent,
  le message d'échec dit les deux essais. Un refus venu du proxy (403, 407, tunnel refusé) n'entraîne
  **aucun** essai sans proxy : Escouade ne contourne jamais une règle de l'entreprise, et le message
  explique.

### Vérification

- Une vérification = un essai (plus le repli sans proxy) ; un échec passager (réseau, 403, 404, 408,
  425, 429, 5xx, réponse illisible) est réessayé une fois après 3 s.
- Échec d'une vérification **automatique** : rien n'est montré ; l'erreur ne l'est qu'une fois les
  échecs enchaînés depuis au moins **1 h** et au nombre d'au moins **3**, une seule fois par série. Une
  série dont le dernier échec date de plus de **30 min** repart de zéro (un échec avant une mise en
  veille et deux au réveil ne font pas une alerte).
  Une vérification **à la main** montre toujours l'échec, avec la raison. Une vérification réussie
  (trouvée ou rien de neuf) termine la série.

### Téléchargement

- Un téléchargement qui échoue (403 d'un lien expiré, 404…) **relit `latest.json`** (nouvelle
  vérification) et, si la même version y est, réessaie une fois avec ce qu'elle donne. Sinon, ou s'il
  échoue encore : l'échec.
- Même règle d'affichage que la vérification, avec sa propre série (un téléchargement refusé toutes
  les 5 min par un proxy finit par se dire, même si les vérifications passent) ; un téléchargement
  réussi termine la série.
- L'échec propose **« Télécharger dans le navigateur »** (le toast reste affiché 30 s) : la page de la
  release (`…/releases/tag/<tag>`, tirée du lien de téléchargement) seulement si ce lien, celui de
  `latest.json`, est sur github.com en https (ou sur le domaine de l'endpoint de mise à jour) ; sinon,
  la page des releases d'Escouade (`https://github.com/guillaume-gagnaire/escouade/releases/latest`).

### Messages (la cause ; la fenêtre la préfixe de « Vérification des mises à jour impossible : » ou « Téléchargement de la mise à jour impossible : »)

- `403 Forbidden de release-assets.githubusercontent.com, par le proxy 127.0.0.1:9000 (Zscaler/6.2 : « … ») : bloqué par le réseau ou un proxy ?`
- 407 : le proxy demande une authentification ; le message dit de mettre l'identifiant et le mot de passe dans l'adresse du proxy, dans Réglages › Réseau (pas « Télécharge-le dans le navigateur »).
- Refus d'un proxy d'entreprise au téléchargement : `le proxy de ton entreprise (Zscaler/6.2) a refusé l'installateur (403 Forbidden de release-assets.githubusercontent.com, par le proxy 127.0.0.1:9000). Télécharge-le dans le navigateur : il faudra peut-être confirmer l'avertissement du proxy.`
- Réseau : `connexion impossible à github.com par le proxy 127.0.0.1:9000 (…)` ; proxy injoignable, repli sans proxy échoué aussi : `… ; sans proxy : connexion impossible à github.com (…)`.
- Les mêmes en anglais.

### Contrat avec la fenêtre

```ts
interface UpdateTrouble { message: string; show: boolean; page: string | null }
type CheckedUpdate = { kind: 'found'; update: FoundRelease } | { kind: 'none' } | { kind: 'failed'; trouble: UpdateTrouble };
type DownloadedUpdate = { kind: 'ready' } | { kind: 'superseded' } | { kind: 'failed'; trouble: UpdateTrouble };
update_check({ manual }) -> CheckedUpdate
update_download({ id, manual }) -> DownloadedUpdate
```

`show` : à montrer maintenant (à la main, ou série assez longue). La fenêtre montre un toast d'erreur
quand `show`, avec le bouton « Télécharger dans le navigateur » quand `page`.

## 3. Aide

La page « Mises à jour » du site (fr, en) dit quoi faire derrière un proxy d'entreprise : « Télécharger
dans le navigateur », et quoi demander au service informatique (autoriser `github.com` et
`release-assets.githubusercontent.com`, et les fichiers `.exe`, `.dmg`, `.app.tar.gz`, `.AppImage`
pour le client `Escouade/<version>`).

## Hors champ

Un miroir des mises à jour sur escouade.dev (second endpoint) : à décider avec l'utilisateur.
