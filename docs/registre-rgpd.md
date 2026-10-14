# Registre des activités de traitement (RGPD, article 30)

Tenu par GAGNAIRE DEVELOPPEMENT pour Escouade. À mettre à jour à chaque changement de ce qui est collecté, de l'hébergement ou des durées. Dernière mise à jour : 14 octobre 2026.

## Responsable du traitement

GAGNAIRE DEVELOPPEMENT, SAS au capital de 1 000 €, 2 rue du Taillis, 33620 Cavignac, France. RCS Libourne 953 269 263. Représentée par Guillaume Gagnaire, président. Contact : guillaume@gagnaire.dev. Pas de délégué à la protection des données (non obligatoire).

## Traitement 1 : statistiques d'usage de l'application

| Rubrique | Contenu |
|---|---|
| Finalité | Mesurer l'usage d'Escouade : utilisateurs actifs sur 30 jours, versions et systèmes en service, fonctionnalités utilisées, pour décider quoi améliorer et quand cesser de prendre en charge une ancienne version. |
| Base légale | Consentement (RGPD art. 6.1.a ; loi Informatique et Libertés art. 82 pour l'identifiant gardé sur l'appareil). Demandé au premier lancement, retirable à tout moment dans Réglages › À propos. |
| Personnes concernées | Les utilisateurs d'Escouade qui ont accepté. |
| Données | Nom de l'événement (liste fermée de 23, dans `src-tauri/src/telemetry.rs`) et ses propriétés (langue de l'interface, nombre de comptes et de projets, oui/non, service d'intégration) ; date ; identifiant de session aléatoire ; identifiant d'installation aléatoire (UUID v4, `~/.escouade/telemetry-id`) ; version de l'app, système et version, langue du système, moteur web et version. Côté serveur, Aptabase déduit de l'adresse IP le pays et la région, et un identifiant quotidien haché avec un sel changé chaque jour ; l'adresse IP elle-même n'est pas gardée par Aptabase. Aucun nom, e-mail, chemin, code, contenu ni secret. |
| Destinataires | GAGNAIRE DEVELOPPEMENT seul. |
| Sous-traitant | Scaleway SAS, 8 rue de la Ville-l'Évêque, 75008 Paris (serveur dédié, centre de données de Paris). |
| Transferts hors UE | Aucun. |
| Durée de conservation | 25 mois (règle TTL des tables `events` et `error_events` de ClickHouse, appliquée par le conteneur `aptabase_retention` du service Aptabase dans Coolify). |
| Sécurité | HTTPS ; instance Aptabase auto-hébergée (aptabase.gagnaire.dev), inscriptions fermées (la route `/api/_auth/register` ne mène nulle part) ; mots de passe des bases générés par Coolify, bases non exposées ; aucune collecte en bac à sable (`ESCOUADE_DATA_DIR`). |
| Exercice des droits | Par e-mail à guillaume@gagnaire.dev ou par une issue GitHub, avec l'identifiant du fichier `telemetry-id` ; réponse sous un mois. Suppression : les événements portant cet identifiant (`installId` dans `string_props`) sont effacés de ClickHouse. |

## Traitement 2 : journaux du serveur

| Rubrique | Contenu |
|---|---|
| Finalité | Sécurité et bon fonctionnement du serveur (détection d'abus, diagnostic). |
| Base légale | Intérêt légitime (RGPD art. 6.1.f). |
| Personnes concernées | Les visiteurs d'escouade.dev et les installations qui envoient des statistiques. |
| Données | Adresse IP, date, adresse demandée, navigateur (User-Agent), page d'origine (journal d'accès du proxy Traefik géré par Coolify). Le serveur web du site (nginx) ne tient pas de journal d'accès. |
| Destinataires | GAGNAIRE DEVELOPPEMENT seul. |
| Sous-traitant | Scaleway SAS (hébergement). |
| Transferts hors UE | Aucun. |
| Durée de conservation | Un an au plus : le conteneur `coolify-proxy-logrotate` (configuration du proxy dans Coolify) fait tourner le journal chaque jour et au-delà de 20 Mo, et supprime les fichiers tournés après 364 jours (variable `TRAEFIK_ACCESS_LOG_MAX_DAYS`). Mis en place le 14 octobre 2026, les lignes de plus d'un an des journaux existants alors purgées. |
| Sécurité | Fichiers sur le serveur, accessibles au seul administrateur. |

## Le site

escouade.dev ne dépose aucun cookie et n'a aucun outil de mesure d'audience. Le choix de langue est gardé dans le stockage local du navigateur (clé `escouade-lang`), à la demande du visiteur : exempté de consentement.
