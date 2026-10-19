# Settings: Voice

The “Voice” tab of the settings sets up dictation (the microphone, who transcribes what you say, the spoken language and the shortcut) and the voice conversation (the voice of each language, its speed, its volume and the silence that sends what you said).

## Opening the tab

Open the settings with `Ctrl+,` (`⌘,` on macOS), then choose “Voice” (“Dictating messages: microphone, transcription model, language and shortcut”). These settings are the app’s own, shared by all projects.

The tab’s choices apply on “Save”, like the other settings. Three actions take effect at once, without waiting for “Save”: downloading or deleting a Whisper model, downloading or deleting a voice, and saving or deleting the key of an online service.

Using dictation and the conversation is described in [the conversation](chat#dictating-a-message).

## Microphone

| Setting | Effect | Default |
|---|---|---|
| “Microphone used” | The microphone that dictation and the conversation listen to: “The system’s” (with its name in parentheses when the system gives it), or one of the microphones plugged in. A microphone chosen then unplugged stays in the list under its id; while it is missing, the system’s is used. | “The system’s” |

With no microphone at all, the row says “No microphone found: plug one in, then open the settings again.” The messages for a microphone the system refuses are in [troubleshooting](troubleshooting#dictation-or-the-conversation-hears-nothing).

## Transcription

This group chooses who transcribes a dictation, and in which language. Under its title, the app recalls what leaves your machine: with Whisper, “Whisper transcribes on your machine: nothing you say is sent. Only the model is downloaded, through the proxy of the network settings, and its checksum checked.”; online, what leaves and to which service (see [Online dictation](#online-dictation)).

| Setting | Effect | Default |
|---|---|---|
| “Transcribed by” | “Local (Whisper)”: the dictation is transcribed on your machine. “Online”: the sound of each dictation is sent to the service chosen, with your key, for a machine too slow for Whisper or a better quality. The voice conversation is always transcribed on your machine. | “Local (Whisper)” |
| “Model” (local) | The Whisper model. A bigger one understands better and transcribes more slowly. The one chosen downloads at the first dictation, or from its row. It also serves the voice conversation. | base |
| “Service” (online) | The service that transcribes: OpenAI, Groq, Mistral, ElevenLabs or Deepgram. The row names its model, paid per use on your account with it. | OpenAI |
| “<service> key” (online) | Your API key with that service. | None |
| “Spoken language” | The language Whisper (or the service) expects: “The interface’s”, “Automatic detection”, or a given language (Français, English, Deutsch, Español, Italiano, Português, Nederlands). Naming the language makes the transcription more accurate; automatic detection suits those who speak several. | “The interface’s” |

### Whisper’s models

Each model has its row, with its size and two marks out of 5, like “Speed 4/5 · quality 2/5”:

| Model | Size | Speed | Quality |
|---|---|---|---|
| `tiny` | 74 MB | 5/5 | 1/5 |
| `base` | 141 MB | 4/5 | 2/5 |
| `small` | 465 MB | 3/5 | 3/5 |
| `large-v3-turbo-q5_0` | 547 MB | 2/5 | 4/5 |
| `medium` | 1.4 GB | 1/5 | 4/5 |
| `large-v3-turbo` | 1.5 GB | 2/5 | 5/5 |

A model not yet downloaded has a “Download” button; while it downloads, the row shows the percentage and “Cancel”. A downloaded model is marked “Downloaded”, with “Delete”: its file leaves the disk, and it downloads again at the next dictation that needs it. Models come from Hugging Face (`huggingface.co`), through the proxy of the [network settings](settings-network), and their checksum is checked before they are kept.

### Online dictation

“Online” shows two rows in place of “Model”: “Service” and “<service> key”. The services and their model:

| Service | Address | Model |
|---|---|---|
| OpenAI | `api.openai.com` | `gpt-4o-mini-transcribe` |
| Groq | `api.groq.com` | `whisper-large-v3-turbo` |
| Mistral | `api.mistral.ai` | `voxtral-mini-latest` |
| ElevenLabs | `api.elevenlabs.io` | `scribe_v2` |
| Deepgram | `api.deepgram.com` | `nova-3` |

Paste the key in the field (“Paste your API key”), then “Save the key” or `Enter`. It goes straight to the system keychain, one entry per service, never to Escouade’s files nor to its log, and is never shown again: the row says “Saved in the keychain”, with “Replace” and “Delete the key”. Without a key, the row says “No key saved: online dictation needs one.” On Linux, where Escouade has no keychain, the key cannot be saved.

Under the group’s title, the app says what leaves: the sound of each dictation (a WAV file), once you end it, to the service chosen, with your key, through the proxy of the network settings. Nothing else: neither the project, nor the code, nor the conversation with the agent. The text comes back into the field dictated into; the service handles the sound under its own terms. The details are on the [Privacy](/privacy/) page.

## Use

| Setting | Effect | Default |
|---|---|---|
| “Shortcut” | The dictation shortcut: a short press starts it and another ends it; held down, it dictates while it is pressed. It dictates into the field that has the focus: the message, a ticket’s description, the terminal of the Claude Code view. | `Ctrl+Shift+Space` (`⇧⌘Space` on macOS) |

“Change” waits for the new shortcut (“Press the shortcut…”): it needs `Ctrl`, `Alt` or `Cmd`, or a key `F1` to `F24`; `Esc` keeps the current one. A changed shortcut has a “Default” button, which puts back `Ctrl+Shift+Space`.

## Conversation

This group sets up the voice that reads the agent’s answers during a [voice conversation](chat#talking-with-the-agent-voice-conversation). Under its title, the app says: “Answers are read on your machine by Piper: nothing leaves your machine.” The voices offered are those whose license allows it: free model and dataset, no voice of a character, a known person or a brand, but for one exception, marked as such.

| Setting | Effect | Default |
|---|---|---|
| “Voice in Français” | The voice that reads the answers when the conversation is held in French, out of 7. | Siwis, medium quality (60 MB) |
| “Voice in English” | The same in English, out of 29. | Ljspeech, medium quality (61 MB) |
| “Speaker” | For a voice with several speakers or styles, the one that reads: its name when the voice gives one, else its number. | The first |
| “Speed” | From 0.5× to 2×, in steps of 0.1: 1 is the voice’s own pace, higher it reads faster. | 1.0× |
| “Volume” | From 0 to 100 %. | 100 % |
| “Delay before sending” | The silence after which what you said goes to the agent, from 0.5 to 3 s, in steps of 0.1 s. | 1.2 s |

The conversation is held in the “Spoken language” when it is French or English, else in the interface’s language.

### The voices

Each language’s menu names each voice with its quality and size, like “Siwis - French (FR) Medium · medium quality · 60 MB”. Under the menu:

- “Download (60 MB)” for a voice not yet downloaded, then the percentage and “Cancel”;
- “▶ Listen” (“Playing…” while it reads a test sentence) and “Delete” for a downloaded voice;
- its license and its dataset’s (“Model license: mit · Dataset: CC-BY 4.0”, or “Model license: none declared” for Fuze), and the credit it asks for (“Credit: …”).

**Fuze**, in French, of high quality (74 MB), is the only voice offered as an exception, which its card says: its model declares no license, and its dataset, under CC BY 4.0, was generated by a synthetic voice (ElevenLabs v4). It has 14 styles, chosen with “Speaker”: normal (the default), joyeuse, excited, colere, triste, surprise, interrogative, storytelling, moqueur, peur, chuchote, determine, fier and degoute.

The credits of Piper, eSpeak NG, ONNX Runtime, whisper.cpp and each voice are in [Settings › About](settings-about), “Credits and licenses”.

### What is read aloud

During a conversation, each message said to the agent asks it to end its answer with a short passage written to be read: two or three sentences, with no code, no file path and no technical detail. Escouade shows it apart under the answer (“Read aloud”) and reads it with the language’s voice; the whole answer stays in the conversation. This holds for every harness (Claude Code, Codex, OpenCode, Copilot CLI). An agent that gives no such passage makes it say “Done. The answer is in the conversation.” The agent’s questions and permission requests are read too.

### When the voice is not available

Piper runs the voices with ONNX Runtime, which ships with the app. If it is missing, the group says “Speech is not available: the voice’s engine (ONNX Runtime) is missing from the app.”, the voices’ buttons are grayed out, and the conversation does not start: reinstall Escouade.

## What downloads, and where

Nothing downloads until you dictate or talk with an agent. At the first dictation, then at the first conversation, Escouade offers each missing file, with its size, and downloads it only after “Download”. Everything goes through the proxy of the [network settings](settings-network), from Hugging Face, and each file is checked against its checksum.

| What | When | Where, under the [data folder](data) |
|---|---|---|
| The Whisper model chosen | At the first local dictation or conversation | `voice/models/ggml-<model>.bin` |
| The language’s voice | At the first conversation in that language | `voice/voices/<voice>.onnx` and `<voice>.onnx.json` |
| eSpeak NG’s data (how French and English are pronounced) | Written by the app at the first reading, without a download, and written again after an update | `voice/espeak-ng-data/` |
| ONNX Runtime | Never: it ships with the app | The app’s folder |

Online dictation downloads nothing. “Delete”, on the row of a model or a voice, frees its room on the disk.
