# Réglages : Voix

L’onglet « Voix » des réglages règle la dictée (le micro, qui transcrit ce que tu dis, la langue parlée et le raccourci) et la conversation vocale (la voix de chaque langue, sa vitesse, son volume et le silence qui envoie ce que tu as dit).

## Ouvrir l’onglet

Ouvre les réglages avec `Ctrl+,` (`⌘,` sous macOS), puis choisis « Voix » (« Dictée des messages : micro, modèle de transcription, langue et raccourci »). Ces réglages sont ceux de l’app, communs à tous les projets.

Les choix de l’onglet s’appliquent à « Enregistrer », comme les autres réglages. Trois actions se font tout de suite, sans attendre « Enregistrer » : télécharger ou effacer un modèle de Whisper, télécharger ou effacer une voix, et enregistrer ou effacer la clé d’un service en ligne.

L’usage de la dictée et de la conversation est décrit dans [la conversation](chat#dicter-un-message).

## Micro

| Réglage | Effet | Par défaut |
|---|---|---|
| « Micro utilisé » | Le micro qu’écoutent la dictée et la conversation : « Celui du système » (avec son nom entre parenthèses quand le système le donne), ou un des micros branchés. Un micro choisi puis débranché reste dans la liste sous son identifiant ; tant qu’il manque, c’est celui du système qui sert. | « Celui du système » |

Sans aucun micro, la ligne dit « Aucun micro trouvé : branche-en un, puis rouvre les réglages. » Les messages d’un micro refusé par le système sont dans le [dépannage](troubleshooting#la-dictee-ou-la-conversation-n-entend-rien).

## Transcription

Ce groupe choisit qui transcrit une dictée, et dans quelle langue. Sous son titre, l’app rappelle ce qui quitte ta machine : avec Whisper, « Whisper transcrit sur ta machine : rien de ce que tu dis n’est envoyé. Seul le modèle est téléchargé, par le proxy des réglages réseau, et sa somme de contrôle vérifiée. » ; en ligne, ce qui part et vers quel service (voir [La dictée en ligne](#la-dictee-en-ligne)).

| Réglage | Effet | Par défaut |
|---|---|---|
| « Transcrite par » | « Local (Whisper) » : la dictée est transcrite sur ta machine. « En ligne » : le son de chaque dictée est envoyé au service choisi, avec ta clé, pour une machine trop lente pour Whisper ou une meilleure qualité. La conversation vocale, elle, est toujours transcrite sur ta machine. | « Local (Whisper) » |
| « Modèle » (local) | Le modèle de Whisper. Plus gros, il comprend mieux et transcrit plus lentement. Celui choisi se télécharge à la première dictée, ou depuis sa ligne. Il sert aussi à la conversation vocale. | base |
| « Service » (en ligne) | Le service qui transcrit : OpenAI, Groq, Mistral, ElevenLabs ou Deepgram. La ligne nomme son modèle, payé à l’usage sur ton compte chez lui. | OpenAI |
| « Clé de <service> » (en ligne) | Ta clé d’API chez ce service. | Aucune |
| « Langue parlée » | La langue que Whisper (ou le service) attend : « Celle de l’interface », « Détection automatique », ou une langue précise (Français, English, Deutsch, Español, Italiano, Português, Nederlands). Indiquer la langue rend la transcription plus juste ; la détection automatique convient à qui parle plusieurs langues. | « Celle de l’interface » |

### Les modèles de Whisper

Chaque modèle a sa ligne, avec sa taille et deux notes sur 5, comme « Vitesse 4/5 · qualité 2/5 » :

| Modèle | Taille | Vitesse | Qualité |
|---|---|---|---|
| `tiny` | 74 Mo | 5/5 | 1/5 |
| `base` | 141 Mo | 4/5 | 2/5 |
| `small` | 465 Mo | 3/5 | 3/5 |
| `large-v3-turbo-q5_0` | 547 Mo | 2/5 | 4/5 |
| `medium` | 1,4 Go | 1/5 | 4/5 |
| `large-v3-turbo` | 1,5 Go | 2/5 | 5/5 |

Un modèle pas encore téléchargé a un bouton « Télécharger » ; pendant le téléchargement, la ligne montre le pourcentage et « Annuler ». Un modèle téléchargé est marqué « Téléchargé », avec « Effacer » : son fichier quitte le disque, et il se télécharge à nouveau à la prochaine dictée qui le demande. Les modèles viennent de Hugging Face (`huggingface.co`), par le proxy des [réglages réseau](settings-network), et leur somme de contrôle est vérifiée avant qu’ils soient gardés.

### La dictée en ligne

« En ligne » montre deux lignes à la place de « Modèle » : « Service » et « Clé de <service> ». Les services et leur modèle :

| Service | Adresse | Modèle |
|---|---|---|
| OpenAI | `api.openai.com` | `gpt-4o-mini-transcribe` |
| Groq | `api.groq.com` | `whisper-large-v3-turbo` |
| Mistral | `api.mistral.ai` | `voxtral-mini-latest` |
| ElevenLabs | `api.elevenlabs.io` | `scribe_v2` |
| Deepgram | `api.deepgram.com` | `nova-3` |

La clé se colle dans le champ (« Colle ta clé d’API »), puis « Enregistrer la clé » ou `Entrée`. Elle part aussitôt dans le trousseau du système, une entrée par service, jamais dans les fichiers d’Escouade ni dans son journal, et n’est jamais réaffichée : la ligne dit « Enregistrée dans le trousseau », avec « Remplacer » et « Effacer la clé ». Sans clé, la ligne dit « Aucune clé enregistrée : la dictée en ligne en a besoin. » Sous Linux, où Escouade n’a pas de trousseau, la clé ne peut pas être enregistrée.

Sous le titre du groupe, l’app dit ce qui part : le son de chaque dictée (un fichier WAV), une fois que tu la finis, vers le service choisi, avec ta clé, par le proxy des réglages réseau. Rien d’autre : ni le projet, ni le code, ni la conversation avec l’agent. Le texte revient dans le champ dicté ; le service traite le son selon ses propres conditions. Le détail est sur la page [Confidentialité](/privacy/).

## Utilisation

| Réglage | Effet | Par défaut |
|---|---|---|
| « Raccourci » | Le raccourci de la dictée : un appui bref la commence et un second la finit ; maintenu, il dicte tant qu’il est enfoncé. Il dicte dans le champ qui a le focus : le message, la description d’un ticket, le terminal de la vue Claude Code. | `Ctrl+Maj+Espace` (`⇧⌘Espace` sous macOS) |

« Changer » attend le nouveau raccourci (« Appuie sur le raccourci… ») : il doit avoir `Ctrl`, `Alt` ou `Cmd`, ou être une touche `F1` à `F24` ; `Échap` garde l’actuel. Un raccourci changé a un bouton « Par défaut », qui remet `Ctrl+Maj+Espace`.

## Conversation

Ce groupe règle la voix qui lit les réponses de l’agent pendant une [conversation vocale](chat#parler-avec-l-agent-conversation-vocale). Sous son titre, l’app dit : « Les réponses sont lues sur ta machine par Piper : rien ne quitte ta machine. » Les voix proposées sont celles dont la licence le permet : modèle et jeu de données libres, aucune voix de personnage, de personne connue ni de marque, sauf une exception, signalée.

| Réglage | Effet | Par défaut |
|---|---|---|
| « Voix en Français » | La voix qui lit les réponses quand la conversation se tient en français, parmi 7. | Siwis, qualité moyenne (60 Mo) |
| « Voix en English » | La même chose en anglais, parmi 29. | Ljspeech, qualité moyenne (61 Mo) |
| « Locuteur » | Pour une voix qui a plusieurs locuteurs ou styles, celui qui lit : son nom quand la voix en donne un, sinon son numéro. | Le premier |
| « Vitesse » | De 0,5× à 2×, par pas de 0,1 : 1 est le rythme de la voix, plus haut elle lit plus vite. | 1,0× |
| « Volume » | De 0 à 100 %. | 100 % |
| « Délai avant l’envoi » | Le silence après lequel ce que tu as dit part à l’agent, de 0,5 à 3 s, par pas de 0,1 s. | 1,2 s |

La conversation se tient dans la « Langue parlée » quand c’est le français ou l’anglais, sinon dans la langue de l’interface.

### Les voix

Le menu de chaque langue nomme chaque voix avec sa qualité et sa taille, comme « Siwis - French (FR) Medium · qualité moyenne · 60 Mo ». Sous le menu :

- « Télécharger (60 Mo) » pour une voix pas encore téléchargée, puis le pourcentage et « Annuler » ;
- « ▶ Écouter » (« Lecture… » pendant qu’elle lit une phrase d’essai) et « Effacer » pour une voix téléchargée ;
- sa licence et celle de son jeu de données (« Licence du modèle : mit · Jeu de données : CC-BY 4.0 », ou « Licence du modèle : aucune déclarée » pour Fuze), et le crédit qu’elle demande (« Crédit : … »).

**Fuze**, en français, de haute qualité (74 Mo), est la seule voix proposée par exception, ce que sa fiche dit : son modèle ne déclare aucune licence, et son jeu de données, sous CC BY 4.0, a été généré par une voix de synthèse (ElevenLabs v4). Elle a 14 styles, choisis par « Locuteur » : normal (par défaut), joyeuse, excited, colere, triste, surprise, interrogative, storytelling, moqueur, peur, chuchote, determine, fier et degoute.

Les crédits de Piper, eSpeak NG, ONNX Runtime, whisper.cpp et de chaque voix sont dans [Réglages › À propos](settings-about), « Crédits et licences ».

### Ce qui est lu à voix haute

Pendant une conversation, chaque message dit à l’agent lui demande de finir sa réponse par un court passage écrit pour être lu : deux ou trois phrases, sans code, sans chemin de fichier ni détail technique. Escouade le montre à part sous la réponse (« Lu à voix haute ») et le lit avec la voix de la langue ; la réponse complète reste dans la conversation. Cela vaut pour tous les harness (Claude Code, Codex, OpenCode, Copilot CLI). Un agent qui ne donne pas ce passage fait dire « C’est fait. La réponse est dans la conversation. » Les questions et les demandes de permission de l’agent sont lues elles aussi.

### Quand la voix n’est pas disponible

Piper fait tourner les voix avec ONNX Runtime, livré avec l’app. S’il manque, le groupe dit « La synthèse vocale n’est pas disponible : le moteur de la voix (ONNX Runtime) est introuvable dans l’app. », les boutons des voix sont grisés, et la conversation ne démarre pas : réinstalle Escouade.

## Ce qui se télécharge, et où

Rien ne se télécharge tant que tu ne dictes pas ou ne parles pas avec un agent. À la première dictée, puis à la première conversation, Escouade propose chaque fichier qui manque, avec sa taille, et ne le télécharge qu’après « Télécharger ». Tout passe par le proxy des [réglages réseau](settings-network), depuis Hugging Face, et chaque fichier est vérifié par sa somme de contrôle.

| Quoi | Quand | Où, sous le [dossier de données](data) |
|---|---|---|
| Le modèle de Whisper choisi | À la première dictée locale ou conversation | `voice/models/ggml-<modèle>.bin` |
| La voix de la langue | À la première conversation dans cette langue | `voice/voices/<voix>.onnx` et `<voix>.onnx.json` |
| Les données d’eSpeak NG (prononciation du français et de l’anglais) | Écrites par l’app à la première lecture, sans téléchargement, et réécrites après une mise à jour | `voice/espeak-ng-data/` |
| ONNX Runtime | Jamais : il est livré avec l’app | Le dossier de l’app |

La dictée en ligne ne télécharge rien. « Effacer », sur la ligne d’un modèle ou d’une voix, libère sa place sur le disque.
