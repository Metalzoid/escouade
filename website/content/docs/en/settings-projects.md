# Settings: Projects

The “Projects” tab sets one project at a time: its name and color, its worktrees, how its commits are written, its setup, teardown, and launch commands, and its agents’ access to Escouade.

## Choosing the project

The tab acts on the project chosen in the “Project” row, under the header of the [settings window](settings-application): one button per open project. What you change on a project stays in the draft when you switch to another, and everything is saved together with “Save”.

## Identity

| Setting | Effect | Default |
|---|---|---|
| “Name” | The project’s name, as its tab and the project picker show it. It can’t be left empty: “Save” is blocked until it has a name. | The name given at creation, the folder’s name if you gave none |
| “Folder” | The project’s folder, shown but not editable. The “Open” button opens it with the system’s file manager. | — |
| “Color” | One swatch out of 14 (13 hues and a neutral tone). The color identifies the project and tints the interface while it is shown. | The first color no project has taken, at creation |
| “Preferred account” | The account new agents and tickets of the project start on. Only visible with several accounts. Choices: “Automatic” (the first active account under the pause threshold, in the order of the accounts) or one of the active accounts that serve this project. | “Automatic” |

Accounts are described in [accounts](accounts) and set in the [“Claude accounts”](settings-accounts) tab. An account switched off after it was chosen stays shown with “(inactive)” as long as it is chosen, and is ignored in the meantime.

## Git

| Setting | Effect | Default |
|---|---|---|
| “One worktree per agent” | Keeps each new agent’s changes in its own branch. | Chosen when the project is created (off until you tick it) |
| “Worktrees folder” | Where the project’s agent worktrees go. | Blank: `.claude/worktrees` |
| “Agents’ branch prefix” | The start of a new agent’s branch name: the prefix followed by the agent’s name. Blank, the branch takes the agent’s name alone. | `escouade/` |
| “Tickets’ branch prefix” | The start of a ticket’s branch name, the one its pull request comes from: the prefix followed by the ticket’s key. Blank, the branch takes the key alone. | `ticket/` |
| “Files copied into worktrees” | The project files copied into each new worktree, one pattern per line. | `.env*` |
| “Commit” | Who writes the commits asked for from the files panel. | “Written by the agent” |

Worktrees are explained in [worktrees](worktrees).

### Worktrees folder

You can write a path relative to the project’s folder (`../app-worktrees`, `.worktrees`), a path relative to your home folder (`~/worktrees/app`), or a full path. The quotes that “Copy as path” adds are removed. Left blank, the field means `.claude/worktrees`, as `claude --worktree` does.

Under the field, a line says where the next worktree will go (“The next one:” followed by the path, with `<name>` standing for the agent’s name). Worktrees already created stay where they are. Outside the project, the Claude Code view first asks you to trust each of them.

A folder that is refused replaces that line with a red message and blocks “Save”:

- the project’s own folder;
- a folder that holds the project’s: pick one beside it (`../app-worktrees`) or in it (`.worktrees`);
- a folder inside a `.git` folder;
- on Windows, a path that is neither relative nor full, such as `D:wt` or `\wt`.

### Branch prefixes

The branch names of agents and tickets are the ones that go to the remote repository with a pull request: the prefixes let you follow a repository’s convention. [Branches](branches) are described separately. Under each field, a line shows the resulting form.

A prefix that wouldn’t give a valid branch name is refused as you type, and blocks “Save”. These are refused: a space, `..`, `~`, `^`, `:`, `?`, `*`, `[`, `\`, and `@{`; a `-` or a `/` at the start; `//`; a part of the name that starts with `.` or ends with `.lock`.

### Files copied into worktrees

The field is a text area, one pattern per line: `.env*` copies the `.env` files at the root, `**/.env*` those in every folder. Only files git ignores are copied, and they are never committed. Empty lines are ignored.

### Commit

This choice concerns the “Commit…” and “Commit all…” buttons of the files panel, described in [Git](git).

- “Written by the agent”: the agent is asked to commit its changes.
- “Direct, with a suggested message”: Escouade suggests a message, you review it, and you commit yourself.

## MCP server

| Setting | Effect | Default |
|---|---|---|
| “Agents can use Escouade” | The project’s agents read the tickets and the agents, and can create tickets or start other agents, which uses quota. Each agent gets a token of its own. Applies the next time its process starts. | Off |

The [MCP server](mcp) runs as soon as a project lets its agents use it, even when “Claude can drive Escouade” is off in the [“Claude Code”](settings-claude-code) tab.

## Worktrees

This group sets the commands Escouade runs when a project worktree opens, and before it is removed. No command is defined at first.

| Setting | Effect |
|---|---|
| “When a worktree opens” | The setup. The commands run in order, before the agent’s first message: dependencies, generated code… Messages wait for them to finish. |
| “Before a worktree is removed” | The teardown. What the setup created outside the worktree (database, containers…); often nothing. |

Each command is a numbered line.

| Field | Effect |
|---|---|
| “Shell” | The shell that runs it, among those the app detects. A new command takes the first one found. A shell the machine doesn’t have shows with “(not found)”. |
| “Command” | The command line, such as `npm ci`. |
| “Subfolder” | The worktree folder it runs in. Blank: its root. |
| ↑ and ↓ | Move the command up or down. `Alt+↑` and `Alt+↓` (`⌥↑` and `⌥↓` on macOS) do the same from any field of the line. |
| × | Deletes the command. |

“+ Add a command” adds a line to the list. A command whose command line is empty is not saved.

These variables are available: `ESCOUADE_PROJECT_DIR` (the project), `ESCOUADE_WORKTREE_DIR`, `ESCOUADE_BRANCH`, and the ports reserved for a ticket (`ESCOUADE_PORT_BASE`, `ESCOUADE_PORT_END`). A failure is reported in the agent’s conversation.

### Fill in automatically

The “✦ Fill in automatically” button (“Claude is reading the project…” while it works) asks Claude to suggest the commands. It reads the project (manifests, lockfiles, README…) with read-only tools: it changes nothing and runs nothing. Its commands are written for the first shell detected.

The suggestion is shown in full, with each command’s shell and folder, under “Suggested worktree commands”. Read each command in full: once saved, they run on their own, the setup when each new worktree opens and the teardown before it is removed.

- “Replace the commands” puts the suggestion in place of the draft’s two lists.
- “Ignore” throws it away.

Nothing is saved before “Save”. A message says how many commands are suggested, and how many Claude left out (invisible characters or a line that is too long). When it finds none, it says “Claude found no command to run for this project.”.

## Launch

Launch commands start the project’s servers, watchers, and services. Each one runs in its own terminal, read-only, started from the Launch section of the sidebar. That section’s gear (“Launch commands…”) opens this tab on this group. When the section is empty, its “Configure” and “✦ Suggest commands” links open it too, the second one also starting the fill-in. See [launch](launch) and [terminals](terminals).

With no command, the group says “No commands yet.”. Each command has four fields.

| Field | Effect |
|---|---|
| “Name” | The name shown in the Launch section, such as “Front”. Required. |
| “Shell” | The shell that runs it. A new command takes the first shell found. |
| “Command” | The command line, such as `npm run dev`. Required. |
| “Subfolder” (blank = project folder) | The folder, under the project’s, it runs in, such as `apps/web`. |

The cross on the right deletes the command, and “+ Add a command” adds one. A command with no name or no command line blocks “Save”.

“✦ Fill in automatically” works as it does for worktrees. Claude reads the project (manifests, scripts, docker-compose, README…) and suggests the commands to run under “Suggested launch commands”, which “Replace the commands” puts in place of the list.

## Danger zone

| Setting | Effect |
|---|---|
| “Close the project” | The “Close the project…” button asks for confirmation, then removes the project and its agents from the app, conversations included. The files and worktrees on disk are not touched. |

Closing the project acts right away, without waiting for “Save”, and takes you back to the settings with the draft as it was.

## The project’s other settings

A project’s links to Jira, Trello, GitHub Issues, and Linear are set in the [“Integrations”](settings-integrations) tab. Its Kanban (autopilot, agents, approval) is set in the [“Kanban”](settings-board) tab.
