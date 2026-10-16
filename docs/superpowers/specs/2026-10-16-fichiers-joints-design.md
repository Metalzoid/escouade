# Joindre n'importe quel fichier (ESC-95) — conception

Date : 2026-10-16. Ticket ESC-95. Brief commun des sous-agents ; fait foi pour les noms et les formes. Mis en cohérence avec le code livré (commits 09169b2, b818734, 28cb041 et le correctif de `tickets.rs`) : là où le code diffère du brief d'origine, c'est le code qui est décrit. Mis à jour le 2026-10-16 après la relecture du chef d'escouade : chemin d'origine de confiance (lu par l'application, Windows seulement), marqueur de la puce d'un fichier d'origine, taille de l'historique d'un projet fermé.

## But

Aujourd'hui le compositeur (`src/lib/attachments.ts`) n'accepte que ce que l'API de Claude lit dans le
message : images PNG/JPEG/GIF/WebP (5 Mo), PDF (18 Mo), textes (256 Ko), 18 Mo en tout. Tout autre
fichier est refusé au collage, au glisser-déposer et dans la fenêtre de choix.

Désormais : **n'importe quel fichier se joint**. Ce que l'API lit reste dans le message, dans ses
limites. Tout le reste — autre format, ou fichier lisible mais trop gros pour le message — est joint
**par chemin** : le message donne son chemin à Claude (« Fichier joint : rapport.xlsx, C:\…\rapport.xlsx »),
qui le lit avec ses outils. Le fichier est soit une **copie** hors du dépôt, soit (si l'utilisateur l'a
choisi, c'est le défaut) le **fichier d'origine**.

## Décisions de l'utilisateur (2026-10-16, ne pas les rouvrir)

1. **Taille** : aucune limite par défaut, avertissement au-delà de **200 Mo**. Seuil (`attachWarnMb`) et
   plafond (`attachMaxMb`, 0 = aucun) réglables.
2. **Fichier déposé** : **chemin d'origine** (défaut). Réglage `attachOrigin` (vrai par défaut) ; faux = toujours copier.
3. **Texte de plus de 256 Ko** : **envoyé par chemin**, comme les autres. Réglage `attachBigText` : `"path"` (défaut) ou `"refuse"` (refus comme aujourd'hui).
4. **Conservation** : tant que l'agent, le projet ou le ticket existe. Réglage `attachKeepDays` (0 = sans purge, défaut) : purge automatique des copies plus vieilles que N jours.
5. **Fichier déposé, lecture** (relecture du chef d'escouade) : Escouade ne donne **pas** son dossier à Claude ; elle autorise la lecture de **ce fichier seul**, à son chemin d'origine, jamais l'écriture ; les tickets et la vue Claude Code (terminal) gardent une copie.

Conséquences de conception (choix de l'agent, à signaler dans le bilan) :

- JS ne reçoit jamais le chemin d'un `File` (le glisser-déposer natif de Tauri est coupé :
  `dragDropEnabled: false`, il casserait le glisser-déposer HTML de l'app). Le **chemin d'origine** est lu par
  l'application elle-même, par un pont qui n'existe que sous Windows (`src/lib/file-origin.ts` : WebView2,
  `postMessageWithAdditionalObjects`, vérifié sur la vraie app : un fichier du disque, déposé ou collé depuis
  l'Explorateur, donne son chemin ; une capture collée non). La fenêtre ne tient qu'un identifiant et ne peut pas en
  fournir un autre ; un chemin que le pont n'a jamais rendu est refusé, à l'attache comme à l'envoi du message ; un
  fichier du dossier de données d'Escouade ne se joint jamais par son chemin (refusé). **Sous Linux et macOS, aucun
  chemin d'origine : copie.** **Sans chemin connu, ou si le réglage est faux : copie.** Un fichier collé du
  presse-papiers sans origine (capture) est toujours écrit (copié).
- **Les tickets copient toujours** : l'agent lit les fichiers plus tard, l'original peut avoir bougé ou disparu.
- **La vue Claude Code (terminal) copie toujours**, que le fichier y soit collé ou déposé : son processus est lancé
  une fois, sans moyen d'ajouter un dossier lisible ensuite ; seul le dossier de l'agent (`--add-dir`) est lisible
  sans demander.
- Lire un fichier d'origine sans permission : `--add-dir` ne le peut pas (dossier inconnu au lancement). Escouade
  répond « autorisé » à la demande de permission `Read` dont le `file_path` est exactement un fichier joint par
  son origine (`AgentMeta.granted_files`, enregistré, les 200 derniers ; comparaison normalisée : séparateurs,
  préfixe `\\?\`, casse d'un chemin Windows ou `/mnt/c/…`, aucun `..` résolu). Rien d'autre n'est autorisé ainsi :
  `Read` seulement, jamais `Edit` ni une écriture. Seuls les faux `claude` des tests ont servi : rien de cela
  n'est vérifié sur un vrai Claude Code (voir PROTOCOL.md). Ces lectures autorisées d'office (`granted_files`, 200 au
  plus par agent) sont gardées avec l'agent et effacées avec lui ; l'interface ne montre pas encore cette liste et ne
  permet pas d'en retirer un fichier (supprimer l'agent l'efface).

## Stockage

Racine : `<data root>/attachments/` (`self.data.root()`, donc `~/.escouade` ou `ESCOUADE_DATA_DIR`).

- Agent (chat ou terminal) : `attachments/<agent id>/<uniq>/<nom>` où `<uniq>` = 8 caractères hexadécimaux aléatoires
  (deux fichiers du même nom ne se marchent pas dessus, et Claude voit le vrai nom du fichier).
- Brouillon (formulaire d'un ticket, avant enregistrement) : `attachments/_drafts/<uniq>/<nom>` ; vidé après 24 h
  au démarrage ; déplacé (rename) dans le dossier du ticket à l'enregistrement.
- Ticket : `<ticket_dir>/files/<uniq>/<nom>` (`data.ticket_dir(id)` ; il part avec le ticket, `ticketimages::remove`).
- **Nom** : on garde le nom de l'utilisateur, nettoyé (`attachfiles::safe_name`) : sans séparateur ni caractère
  réservé Windows (`<>:"/\|?*` et contrôles), sans point ou espace final, pas un nom d'appareil Windows
  (`con`, `nul`, `com1`… → préfixé `_`), sans marque d'écriture de droite à gauche ni espace en tête, 150 caractères
  et 240 octets au plus en gardant l'extension, vide → `fichier`.
- **Dossier lisible sans permission** : `--add-dir=<attachments/<agent id>>` à chaque lancement de Claude Code de
  l'agent, chat comme terminal ; le dossier est créé avant. Pour l'agent d'un ticket **qui a des fichiers**, aussi
  `--add-dir=<ticket_dir>/files` (sans fichier, pas d'argument ni de dossier). Sous WSL, `--add-dir` est dans
  `PATH_OPTIONS` (`claude.rs`) : chemin traduit, en forme `--add-dir=<dossier>` comme en forme séparée.
- **Effacement** : `attachments/<agent id>` part avec l'agent (suppression d'agent, au même endroit que
  `forget_pastes`) ; avec le projet (suppression définitive ; **fermer** un projet les garde, ESC-89 le restaure
  avec ses agents ; la taille de l'historique d'un projet fermé compte aussi `attachments/<agent>/` de ses agents, comme
  les images de ses tickets) ; le dossier du ticket part avec le ticket. Jamais un fichier d'origine.
- **Purge** (`attachKeepDays` > 0) : au démarrage puis chaque heure (là où `clear_pastes` est appelé), les fichiers
  de `attachments/**` (et des dossiers `files/` des tickets) plus vieux que N jours sont effacés, avec leurs
  dossiers vides. Jamais un fichier d'origine.

## Contrat Rust ↔ TypeScript (serde camelCase)

```
AttachedFile {
  name: string,        // nom affiché et donné à Claude
  path: string,        // chemin sur le poste (Windows ici) ; copie, ou fichier d'origine
  claudePath: string,  // le même, tel que le Claude Code de l'agent le lit (Linux sous WSL) ; "" pour un brouillon
  size: number,        // octets
  origin: boolean,     // vrai : c'est le fichier d'origine (rien n'a été copié)
}
```

Commandes (module `attachfiles.rs`, enregistrées dans `lib.rs` ; erreurs en français/anglais par `tr!`) :

- `attach_open(owner, name, size) -> handle` : `owner` = id d'agent ou `"draft"`. Refuse si `size` dépasse
  `attachMaxMb` (message « {name} dépasse {max} »). Crée le fichier `…/<uniq>/<nom nettoyé>` et rend un handle opaque.
- `attach_chunk` : **octets bruts**, pas de base64 JSON : `invoke('attach_chunk', uint8array, { headers: { 'x-handle': handle } })`,
  lu par `tauri::ipc::Request` (`InvokeBody::Raw`). Morceaux de 4 Mo au plus côté JS. Refuse un handle inconnu ;
  compte les octets écrits et refuse au-delà du `size` annoncé de plus d'un morceau (et au-delà du plafond).
- `attach_finish(handle) -> AttachedFile` : vérifie que la taille écrite = `size`, ferme, rend le fichier.
- `attach_cancel(handle)` : efface le fichier à moitié écrit (échec, retrait de la puce en cours de copie). Un handle
  perdu (fenêtre rechargée) : ses fichiers à moitié écrits sont effacés au démarrage et avec la purge.
- `attach_discard(owner, path)` : efface une copie terminée (retrait de la puce) ; **refuse tout chemin qui n'est pas
  sous le dossier de `owner`** (canonicalisé, jamais un fichier d'origine, jamais un lien qui sort du dossier).
- `attach_origin(owner, id) -> AttachedFile` : `id` est l'identifiant de `file_origin` (la fenêtre ne donne jamais un
  chemin) ; l'application retrouve le chemin que le pont a lu pour lui, refuse un chemin que le pont n'a jamais rendu
  et un fichier du dossier de données d'Escouade, puis valide le fichier (existe, fichier ordinaire, lisible ;
  `attachMaxMb`) sans rien copier : `origin: true`.
- `send_message(id, text, attachments, files = [])` : `files: Option<Vec<AttachedFile>>` (absent = aucun). Le dos fait :
  chaque `path` non d'origine doit être sous le dossier de l'agent ; chaque fichier d'origine doit avoir un chemin que
  le pont a rendu, est revalidé et **accordé** (`granted_files`) ; le texte livré à Claude est `text`, une ligne vide, puis une ligne par fichier :
  `Fichier joint : {name}, {claudePath}` / `Attached file: {name}, {claudePath}` (`i18n::claude()`). Sans texte :
  les lignes seules. Le nom de l'agent n'est tiré que du texte de l'utilisateur. La conversation montre le message
  complet (lignes comprises). `claudePath` est recalculé par le dos (`Program::file_path`), pas cru du front.
- Vue Claude Code : `send_message` avec `files` reste refusé (« Pas de pièce jointe en vue Claude Code : colle-la dans
  son terminal. ») ; le terminal (fichier collé ou déposé) copie par `attach_*` (owner = l'agent) puis tape
  `claudePath`, comme `paste_image` pour les images (une image déposée suit la route des images collées).

Réglages (`Settings`, `types.ts`, `settings.svelte.ts`, onglet de réglages — suivre `idleStopMinutes`) :

| Réglage | Type | Défaut |
|---|---|---|
| `attachMaxMb` | nombre ≥ 0 (0 = aucune limite) | 0 |
| `attachWarnMb` | nombre ≥ 0 (0 = jamais) | 200 |
| `attachOrigin` | booléen | vrai |
| `attachBigText` | `"path"` \| `"refuse"` | `"path"` |
| `attachKeepDays` | nombre ≥ 0 (0 = tant que le propriétaire existe) | 0 |

## Côté interface : que fait-on d'un fichier ? (`src/lib/attachments.ts`)

`planAttachment(file, { settings, messageBytes })` rend `'image' | 'pdf' | 'text' | 'file'` ou un refus :

1. Type connu de l'API (images PNG/JPEG/GIF/WebP, PDF, texte par extension ou type ; un fichier sans extension ni
   type connu de 256 Ko au plus est essayé comme du texte) et sous sa limite (image 5 Mo, PDF 18 Mo, texte 256 Ko)
   et `messageBytes + size ≤ MAX_TOTAL` (18 Mo ; `messageBytes` ne compte que ce que le message porte) → dans le
   message, comme aujourd'hui.
2. Un texte de plus de 256 Ko avec `attachBigText = 'refuse'` → refus (message `tooBig` actuel). Sinon, tout fichier
   qui n'entre pas dans le message (autre format, trop gros, total dépassé, « texte » qui ne se décode pas) → `'file'`.
3. `'file'` : refus si `attachMaxMb > 0` et la taille le dépasse (« {name} dépasse {max} ») ; `warn: true` si
   `attachWarnMb > 0` et la taille le dépasse (avertissement, pas un refus). Un fichier vide (0 octet) se joint.
4. Un `'file'` dont le pont connaît le chemin d'origine (`fileOrigins(files)` rend un identifiant par fichier, ou
   `null`) et `attachOrigin` : `attach_origin(owner, id)` (rien n'est copié).
   Sinon copie : `attach_open`, morceaux de 4 Mo de `file.stream()`/`slice`, `attach_finish` ; puce « copie en cours »
   avec la progression, envoi désactivé tant qu'une copie court, `attach_cancel` si la puce est retirée.

Puces (`AttachmentChip`, compositeur et formulaire de ticket) : icône par type (archive, tableur, document, vidéo,
audio, code, générique), nom, taille (`fSize`), bouton retirer (efface la copie), pourcentage et barre pendant la
copie, marque « ! » avec infobulle pour `warn` (« Gros fichier : 250 Mo, copié sur le disque », ou « … joint là où il
est, sans copie » pour un fichier d'origine), sur la puce d'un fichier d'origine un marqueur et l'infobulle « Fichier
d'origine, lu là où il est » (« Original file, read where it is »), pour ne pas la prendre pour une copie, sans aperçu
(les images du message gardent leur aperçu). La fenêtre de choix n'a plus de filtre : tous les fichiers.

Réglages (Réglages › Claude Code, groupe « Pièces jointes », `AppTab.svelte`) : « Taille maximale d'un fichier joint »
(`attachMaxMb`), « Avertir au-delà de » (`attachWarnMb`), « Joindre le fichier d'origine » (`attachOrigin`), « Texte de
plus de 256 Ko » (`attachBigText` : « Joint par son chemin » | « Refusé »), « Purger les copies après »
(`attachKeepDays`) ; un champ de nombre vidé vaut 0.

## Tickets (contrat)

Les images de ticket (ESC-15) ne changent pas. Les **autres fichiers** d'un ticket sont une seconde liste :

```
TicketFile { name: string, file: string, size: number }   // `file` : "<uniq>/<nom>" sous `<ticket_dir>/files/`
DraftFile  { name: string, file: string, path: string }   // formulaire : `file` = un fichier que le ticket a (path vide) ;
                                                          // `path` = une copie de brouillon (AttachedFile.path, `file` vide)
Ticket.files: TicketFile[]      TicketDraft.files: Option<Vec<DraftFile>>   (None : inchangés — MCP, imports)
```

- Formulaire : un fichier qui n'est pas une image lisible de ticket (autre format, image >5 Mo, PDF, texte…) est copié
  tout de suite par `copyToDisk(f, 'draft')` (jamais d'origine) ; la puce est celle du compositeur (`AttachmentChip`) ;
  la retirer appelle `attach_discard('draft', path)`. Les images PNG/JPEG/GIF/WebP ≤ 5 Mo restent des `images`
  (aperçu, `ticket-images.ts`) comme aujourd'hui, sauf un « .png » dont le contenu n'est pas une image (il devient un
  fichier, `NotImageError`). Au plus **20 fichiers** par ticket (comme les images, qui ont leurs 20 à part). « Ajouter »
  et « Enregistrer » attendent la fin des copies ; « Abandonner » efface les copies faites par la fenêtre.
- Enregistrement (`ticket_create`, `ticket_update`) : le dos valide chaque `DraftFile` (`ticketfiles::check`) — un
  fichier gardé doit être un `TicketFile` du ticket dont le fichier existe (sinon il est laissé de côté), un nouveau
  doit être **sous `attachments/_drafts`** (canonicalisé) ; plafond `attachMaxMb` appliqué. Un ticket qui a quitté
  « À faire » est refusé (« Seul un ticket « À faire » se modifie. ») avant qu'une copie quitte les brouillons. Le
  fichier est ensuite déplacé (rename, sinon copie + effacement) dans `<ticket_dir>/files/<uniq>/<nom>` ; un échec
  laisse le ticket intact et efface ce qu'il a déplacé ; un fichier retiré de la liste est effacé.
- L'agent du ticket reçoit les fichiers avec son premier message (aussi à « Reprendre », quand son agent ne l'a jamais
  reçu) : une ligne `Fichier joint : {nom}, {claudePath}` par fichier (`ticketfiles::message`, appelée par
  `Core::with_ticket_files`, chemin traduit pour WSL), **à la fin** du message de `first_message_with` (après les
  critères et la ligne de boucle), puis une phrase pour ceux dont le fichier est absent (« Fichier absent du dossier du
  ticket, non joint : {noms}. ») ; seule la note d'un échec de préparation du worktree vient ensuite. Son Claude Code
  reçoit `--add-dir=<ticket_dir>/files` (`ticket_add_dir_arg`) seulement si le ticket a des fichiers.
- Effacement : le dossier du ticket (`ticketimages::remove`) emporte `files/` ; les brouillons abandonnés sont vidés
  après 24 h (au démarrage puis chaque heure). MCP : `get_ticket` dit `files` (le nombre) à côté de `images` ;
  `list_tickets` ne compte ni l'un ni l'autre ; `create_ticket` et `update_ticket` ne touchent pas aux fichiers
  (`files: None`). La carte compte images et fichiers ; la confirmation de suppression dit « pièces jointes » dès qu'il
  y a un fichier.

## Chemin d'origine (`src/lib/file-origin.ts`, Rust `fileorigin.rs`)

`fileOrigins(files: File[]): Promise<(string | null)[]>` rend, pour chaque fichier, l'**identifiant** sous lequel
l'application connaît son chemin, ou `null` : la fenêtre ne tient jamais le chemin, ne peut pas en fournir un autre, et
`attach_origin(owner, id)` ne prend que cet identifiant. Windows seulement : `window.chrome.webview.postMessageWithAdditionalObjects`
avec un message JSON `{ escouadeFileOrigin: <id> }` et `[file]` ; Rust (`with_webview`, `webview2-com`, même version
que celle de Tauri/wry) ajoute un gestionnaire `WebMessageReceived`, lit `AdditionalObjects` → `ICoreWebView2File::Path`
et garde ce chemin sous l'identifiant ; la commande `file_origin(id)` attend ce chemin (2 s au plus) et dit si le fichier
en a un (toujours « non » hors Windows). Un `File` qui n'est pas un fichier du disque (capture collée) n'en a pas
(WebView2 refuse le message dans la page même). Un chemin que le pont n'a jamais rendu est refusé, à l'attache comme à
l'envoi du message ; un fichier du dossier de données d'Escouade ne se joint jamais par son chemin (refusé). Vérifié sur
la vraie app, sous Windows. **Sous Linux et macOS, il n'y a aucun chemin d'origine : les fichiers sont copiés.**

## Tests exigés

- Vitest : `planAttachment` (dans le message / par chemin / refus, limites, total, réglages), puces (icône, nom,
  taille, retrait, avertissement, copie en cours), copie par morceaux, réglages dans l'onglet.
- Rust : sécurité du nom, stockage, chunk/finish/cancel/discard (refus hors dossier), plafond, `--add-dir` aux
  lancements (chat et terminal, WSL traduit), lignes du message (fr/en), permission `Read` accordée à un fichier
  d'origine et à lui seul, effacement avec l'agent / projet / ticket, purge, `attachKeepDays`, `attachBigText`.
- e2e (Playwright, vraie app) : un `.zip` et un `.xlsx` joints ; le message donne leurs chemins ; les fichiers sont là ;
  l'agent (faux `claude`) les lit ; mode copie (fichiers sous `ESCOUADE_DATA_DIR/attachments/<agent>`) et mode origine.
  Dans `tests/e2e/attachments.spec.ts` (fichier apparu pendant la mise en cohérence de cette doc, ni relu ni lancé
  ici). Le faux `claude` (`tests/fixtures/fake-claude.mjs`)
  sait déjà lire chaque « Fichier joint » avec `Read` (permission demandée hors du dossier de travail et des
  `--add-dir`), et faire un `Read` ou un `Edit` sur un chemin donné (« lire-fichier », « modifier-fichier »).
- Docs : `docs/SPEC.md`, `docs/PROTOCOL.md`, page du site (fr et en), CHANGELOG ; textes fr et en partout.

## Hors périmètre

Aperçu des fichiers non image ; envoi d'un fichier par l'outil MCP `send_message` ; copie d'un agent (la copie
garde les chemins de l'original).
