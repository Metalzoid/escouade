# Changelog

Escouade's visible changes, version by version, in English. The notes of each GitHub release and the English Discord channel take the section of its version; the French notes, those of the in-app update included, are in [CHANGELOG.md](CHANGELOG.md), which also holds the versions before 1.8.2.

To write an entry: one or two short sentences, for a human reader. What they can now see or do, and why it helps; the details (edge cases, settings, file names, tools, ticket numbers) go in the documentation, not here. Each entry of CHANGELOG.md has its English one here, under the same version and the same heading (`## [Unreleased]` for `## [Non publié]`).

## [Unreleased]

### New

- A project’s tile in the projects’ rail can say something other than its initials: up to three letters or an emoji, or the logo of your choice in their place, in Settings › Projects or in the “New project” assistant. The agents waiting and those at work stay readable over it.
- Cursor CLI becomes the fifth harness: a Cursor agent converses in Escouade, asks its questions and permissions there, proposes its plan to approve and keeps its tasks and subagents in the Plan banner. Its “Always” becomes “For this agent”: the rule holds for that agent alone, never for your Cursor config.
- A project can show a label under its tile, its name or a shorter text, and the projects’ rail widens by dragging its right edge: wide enough, it shows each project’s name beside its tile, as a list. The width chosen is kept for the whole app.

## [2.0.0] — 2026-10-24

### New

- Escouade has a light theme: Settings › Application › Display › “Theme” offers System, Light or Dark, applied at once, title bar included. By default, it follows the one of Windows, macOS or Linux.
- Projects move to a rail on the left, like Slack’s workspaces: a tile per project, with its agents waiting and at work, dragged or moved by Alt+↑ and Alt+↓. The title bar keeps the name of the project on screen and the search; the status bar shows the quotas of each harness at work.
- The list of agents is redrawn: the agent waiting goes first with its question, which you answer in a click or with 1, 2… without leaving the conversation open (several questions and permissions too; Ctrl+J puts the focus on its card), and each card says what the agent is doing (“Editing src/auth.ts”), whatever its harness, what it changed, or what still runs once its turn is over. The arrow of “New agent”, or Ctrl+Shift+N, opens the menu of the harnesses, numbered.
- The conversation is redrawn: a header with the status in a pill and the agent’s figures, its actions under “…”, the tool calls of a turn in a single thread, and a floating message field where dictation and dropped files happen. A message refused for want of an account says so in the conversation, with “Add an account…” a click away.
- The “Plan” banner is redrawn in the conversation’s column: a segment per task, then each task with its state, the subagent working on it and the model it really runs on, whatever its harness, what it is doing and what it waits for.
- The Kanban is redrawn: columns without frames, cards that show their criteria checked, the loop in squares, what the agent is doing and what it costs, and the ticket to review in amber with “Approve” and “Test”. In a ticket’s form, every field has its label, the description takes all the free room and “After” opens as a menu.
- Git is redrawn beside the conversation: “Uncommitted” and “History” tabs, the files with their letter and their counts, the diff in a frame, “Commit…” and the merge at hand. The history draws each agent’s branch joining the main one, and tells which agent made each commit.
- Terminals and launches are redrawn: a command’s log tells its state, since when it runs, its command, its folder and the worktree it runs in, and the notification of a command that crashed has “View the log”. Terminals follow the light or dark theme at once, and the “Test” window tells who wrote the commands before they run, then each step with its time. In a short window, Launch and Terminals fold to their title, which unfolds them with a click.
- The editor is redrawn: folders holding changes are marked with a dot, lines added or modified with a green or amber mark in the margin, and the search in the file floats over the text with its count (“1 of 3”). It follows the light or dark theme at once, and “Open a file” and the search through the conversations get the same look.
- The overview and the statistics are redrawn: the agents waiting for your answer first, answered on the spot, then each project’s, and “Awaiting” for an agent whose turn is over but not its work. The statistics show four figures, each day’s tokens in columns with their detail on hover, and the cost by project, by model and by harness, readable in both themes.
- In the Codex or Copilot CLI view, an amber band tells when the harness asks whether it may trust the agent’s folder; the OpenCode view reminds that Escouade keeps the conversation’s thread.
- Windows are redrawn: the “New project” assistant and its rail of steps, “Add an account” with the harnesses in segments and the sign-in in a frame, “Open a PR” telling which uncommitted files are left out, and the notes of an update. Buttons draw their icon, and menus have the preview’s entries.
- The settings are redrawn: their tabs in three groups, a new “MCP server” tab among them, each harness with its state and version, each account on a card with its quota and its new agents’ settings, and all that happens at a quota’s limit gathered in Accounts. An update that does not download stays told in About, with “Download in the browser”.

### Fixes

- A message sent right after the one before, before that one is taken, is no longer lost: it leaves the field and goes right after it.
- An agent’s header no longer overflows when the files and history panel is open or the window is narrow: it puts away its figures, then the words of its buttons, and moves the layout into “…”, always keeping the agent’s name and status.

## [1.8.14] — 2026-10-24

### New

- On Windows, the installer and the app are signed by GAGNAIRE DEVELOPPEMENT: Windows says who publishes them, and the SmartScreen warning fades as this signature builds its reputation.

## [1.8.13] — 2026-10-24

### Fixes

- The “New project” assistant now sets everything a project has at its creation: default harness, “Private project” with the accounts to reserve to it, and the whole Kanban. .escouade.yml also shares “Private project” and the model, effort and mode of the ticket agents; what belongs to each person (accounts, remote control, tickets in parallel, autopilot) stays on their machine.

## [1.8.12] — 2026-10-23

### New

- Each project chooses the branch its new agents’ worktrees start from: the folder’s, the board’s target branch or a branch of your choice, which becomes their base and that of their PR. “+ New agent” can choose another one for an agent, including for a branch you create. Thanks to Metalzoid on Discord.

### Fixes

- Settings › Harness no longer talks about the tested versions: a newer version of a harness shows like the others, with no warning. Only what keeps it from starting is told, like a version too old and the command that updates it.
- An agent without an Escouade worktree that works in a worktree of its own (made by Claude Code, or one it went into with a `cd`) now follows the pull requests of that branch: its header shows its branch and “Open a PR” starts from there, never from the branch of the project’s folder nor from another agent’s. Thanks to Metalzoid on Discord.
- An agent stopped by “OAuth session expired and could not be refreshed” while its account is signed in goes on by itself. If the account really must sign in again, its card says so and the agent goes on once signed in.

## [1.8.11] — 2026-10-23

### New

- A new agent’s worktree is created at its first message: the agent is named first, then its branch and its folder take that name, and its setup runs in that folder. A setup script that uses it for its local address or its database gets the right name. A per-project setting, on everywhere, gives back the old behavior. Thanks to MrKayJayDee on Discord.

## [1.8.10] — 2026-10-23

### New

- A ticket has “Account”, “Model” and “Effort” next to “Harness”: its agent always starts on what you choose, and a ticket set on an account stays there, waiting for its reset rather than switching accounts. By default, “Auto” says what it will give: the current account, the Kanban’s model and effort.
- “New agent on a branch…” also creates the branch you type, from where a new agent starts, and the worktree’s folder is named after the branch (`feat/signup` gives `signup`): a setup script can use it for its local address or its database. Renaming an agent renames its branch too, unless it is pushed already, has a pull request or was there before the agent. Thanks to MrKayJayDee on Discord.
- Through the MCP server, an agent now acts on every project that is not private, not only its own: your back end’s agent can create, edit and start your front end’s tickets, and write to its agents. A private project stays reserved to its own agents. Thanks to Cédric on Discord.

### Fixes

- The `.escouade.yml` Escouade writes passes Prettier: its lists are indented the same way at the root as in a group, and its values take quotes only where YAML requires them.
- Claude Code’s commands (`/compact`, `/cost`, `/context`, `! git status`…) and the wake-up of a `/loop` no longer show with their tags in the conversation: the command as typed, its output under it, its error in red, in conversations saved before too.

## [1.8.9] — 2026-10-22

### New

- The status bar tells where each quota will end at its reset if you keep your pace (“→ 64 %”), and OpenCode’s day cost at midnight: you see in time when to slow down. A setting in Settings › Accounts turns it off. Thanks to @epommereuil (#12).
- A subagent shows the model it really runs on, even when its call names none, with every harness. Thanks to @epommereuil (#14).
- Agents can start from the Kanban’s target branch rather than the folder’s (a box in Settings › Kanban), and the menu next to “New agent” makes one without a worktree, or in a worktree. Thanks to @Metalzoid, whose PR #6 started the idea.
- Settings › Integrations has a “Code hosts” section: connect GitHub, GitLab, Bitbucket or Gitea / Forgejo, several instances each, and see whether a token has expired or which permissions it lacks. Each project finds its account there through its remote, and the github.com account is GitHub Issues’ one too.
- Escouade can read and drive GitHub pull requests (github.com, GHE.com or your company server): open, merge, checks, logs, reruns, reviews and deployments, while sparing your API quota.
- An agent opens its pull request in one click, from its conversation’s header, its card’s menu or the branch picker: its branch is pushed, and a title and description are proposed for you to review. Its card then follows the pull request and its CI, and “Agent fixes it” or “Agent addresses the feedback” sends it the failed checks or the comments, only when you click. Thanks to @Metalzoid, whose PR #7 started the idea.
- An agent whose turn is over but that is still waiting on something no longer says “Done”: its card says “Awaiting”, or the time Claude Code will wake it up, and its tooltip lists what goes on. The agents it drives through the MCP server are listed under its card while they work.
- A project can be private (Settings › Projects): the agents of the other projects no longer see it through the MCP server, and its own see it alone. You and Claude outside Escouade still see everything; a setting makes every new project private.
- Agents no longer read a private project’s files either (folder, worktrees, Escouade’s data, harness sessions), nor its own agents those of the others. The project’s settings say, harness by harness, whether it is a guard or a real barrier.
- The worktree of a done ticket, whatever the approval, or of a deleted one goes on its own, without ever losing work: if it holds uncommitted changes or commits neither merged nor pushed, it stays, and you’re told. “Clean up” in Settings › Projects tidies up those of archived agents.
- Nothing of a private project goes to another through Escouade either: the “New project” assistant doesn’t offer to copy its setup, and says so, and what Escouade writes to the agents never names another project.
- A private project offers to reserve it an account, so that the harness’s sessions, memory and history are shared with no other project, and flags an account still shared. Its agents no longer switch to a shared account by themselves at the usage limit, unless you allow it.
- A `.escouade.yml` in the repository shares the project’s settings with your team (worktrees, launch, Git, Kanban): Escouade uses it as soon as the project opens and reads it again when it changes, but runs none of its commands without your approval. “Export to .escouade.yml” writes it from a project that is already set up.
- “Switch accounts at” (Settings › Accounts) moves an agent to another account when its own reaches 80, 90 or 95% of its quota, at the end of its turn, never in the middle of its work; the conversation and a notification say so. By default, “At the limit”: nothing changes.

### Fixes

- An agent archived right after it was created no longer leaves a process running that held its folder: the worktree of a deleted or validated ticket goes instead of staying, sometimes minutes later.
- A second Claude Code account no longer runs as the first one’s identity when your environment sets `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_AUTH_TOKEN`: its quota finally moves on claude.ai.
- When an account goes on in extra usage at 100 % of its quota, the status bar says so: its running agents stay on it, only new ones go to the other account.
- With live transcription on Deepgram, a sentence whose stream breaks is no longer lost: it goes whole, as without live transcription.
- Local dictation and voice conversation (Whisper) are much faster, above all on Windows: a sentence is transcribed there in 2.5 s with large-v3-turbo instead of over a minute, and in a quarter of a second with base.
- An agent that scheduled a turn for later (`/loop`, a scheduled task) is no longer stopped for being idle before that time: its wake-up happened in the stopped process, so never.

## [1.8.8] — 2026-10-20

### Fixes

- With live transcription, the voice conversation no longer cuts the starts and ends of your sentences, nor the words said more softly after a pause: the whole sentence goes to the service, and its text comes a moment later.

## [1.8.7] — 2026-10-20

### New

- With online transcription, the text writes itself as you speak, in dictation as in the voice conversation, and the sentence is ready a moment after your last word. A box in Settings › Voice turns it off for each service.

## [1.8.6] — 2026-10-20

### Fixes

- With online transcription, the voice conversation also sends what you say to the chosen service (ElevenLabs…), as dictation does: on Windows, each sentence no longer takes tens of seconds to be understood.

## [1.8.5] — 2026-10-19

### Fixes

- Stopping an agent can no longer cut an update of Claude Code half-way, which could make the `claude` command disappear: Escouade updates it itself, every day (a switch in Settings › Harness). A Claude Code that cannot be found is reported with the command that reinstalls it.

## [1.8.4] — 2026-10-19

### Fixes

- With an online voice, Settings › Voice no longer shows Piper's settings: a single line says which local voice takes over if the service does not answer.

## [1.8.3] — 2026-10-19

### New

- The voice conversation can be read by an online service (OpenAI, ElevenLabs, Mistral, Deepgram, Groq), with the same key as its dictation, and the voice of your choice, your account's own included. For dictation as for the voice, you also choose each service's model.

## [1.8.2] — 2026-10-19

### New

- In a voice conversation, the agent asks its questions aloud, one at a time, even when it has several. The choices show on screen: you answer by saying the choice, its number or your own answer.

### Changes

- Settings › Harness no longer has a "Sign in…" button: each account signs in from Settings › Accounts.
