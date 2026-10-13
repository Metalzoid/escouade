# Settings: Claude accounts

The “Claude accounts” tab lists the accounts agents start on, in the order Escouade tries them. Each change is saved right away, without going through “Save”.

## How Escouade picks an account

An account is a Claude Code run with its own configuration folder, so with its own sign-in, sessions, and quota. “Main” is your usual Claude Code: it runs as it always did, with no folder of its own, and it can’t be removed. How accounts and their quotas work is explained in [accounts](accounts) and in [usage](usage).

The note under the list’s title sums it up: “New agents start on the first active account under the pause threshold, in this order.” In detail:

- A new agent starts on the first active account in the list that has no quota window (5-hour or weekly) at the pause threshold.
- If every active account has reached the threshold, it starts on the first active account, and [autopilot](autopilot) pauses.
- A project’s “Preferred account”, in the [“Projects”](settings-projects) tab, goes first as long as it is active.
- An account “Reserved to projects” only receives the agents and tickets of those projects.

## The list

Each account has its own block in the list.

| Setting | Effect | Default |
|---|---|---|
| Name (the “Name” field) | The account’s name, saved when you leave the field or press `Enter`. An empty name, or one already taken by another account, is refused: the field goes back to the old one. | “Main” for the Main account; the name given at creation for the others |
| “Active” | Switch. An inactive account receives no new agent. At least one must stay active: the switch of the last active account is grayed out (“At least one account must be active.”). | On |
| ↑ and ↓ arrows | Move the account up or down: the order of the list is the order of priority. | — |
| “Folder” | The account’s configuration folder, shown but not editable. | — |
| “Executable” | This account’s `claude`. Blank, it is the one in the “Claude Code” tab (the field says “The one in the settings”). Saved when you leave the field. | Blank |
| “Sign in…” or “Sign in again…” | Opens the account’s sign-in. | — |
| “Remove” | Takes the account off the list (absent for Main). | — |
| “Reserved to projects” | One checkbox per open project: the account only serves the projects ticked. | None ticked: “Every project” |

### Name and state

Under the name, a colored dot and a text say where the sign-in stands:

- “Checking…” while it is being read;
- “Signed in · ” followed by the claude.ai account’s email, or just “Signed in” when the email isn’t known;
- “Not signed in”;
- “Not signed in with a claude.ai account (API key?)” for Main, which then most likely runs with an API key;
- “Inactive” for a switched-off account.

When the sign-in exists but is out of date, a line below gives the reason.

### Folder and executable

For Main, the folder is Claude Code’s own (`~/.claude`, or the one `CLAUDE_CONFIG_DIR` points to). Every other account has its own, which Escouade creates in `~/.escouade/claude/`, one subfolder per account. An account can run a different `claude` than the one in the settings, for example a Claude Code in WSL for one and a Windows Claude Code for the other.

### Signing in

“Sign in…” (“Sign in again…” when the account is already signed in, for example to switch to another claude.ai account) opens a window with a terminal running the account’s `claude`. Sign in there, with the `/login` command if Claude Code doesn’t offer it. Escouade checks for the sign-in every 2 seconds: as soon as it is done, the window shows “Signed in as” followed by the email, closes the terminal, and reads the account’s quota. If you close the window before that, the account stays, not signed in. If Claude Code stops before the sign-in, the window says so and offers “Restart”.

### Reserved to projects

The checkboxes keep an account to those projects alone (a client’s projects, say): other projects never start on it. With nothing ticked, the account serves every project, which the row says as “Every project”. Main can be reserved like any other.

If no active account serves a project (all are reserved to others, or switched off), a line under the list names the project and says its agents and tickets won’t start.

### Removing an account

“Remove” asks for confirmation. The dialog reminds you that new agents will no longer start on the account, and that its folder stays on the disk, with its sign-in and its conversations. While agents that are not archived still run on the account, removal is refused. Projects that preferred it go back to “Automatic”.

## Adding an account

“Add an account…”, under the list, opens the “Add a Claude account” window.

1. “Name”: the new account’s name (“Pro, Team…” as an example). Two accounts can’t have the same name.
2. “Share with Main”: checkboxes, all ticked at first, for the items of Main’s folder the account takes over. The files are `settings.json` and `CLAUDE.md`, the folders `skills`, `agents`, `commands`, `plugins`, `hooks`, and `output-styles`; only the ones Main has are offered.
3. “Sharing”: “Link (a change applies to both accounts)”, the default, or “Copy”. On Windows, folders are linked with a junction, which needs no administrator rights, and files are copied, since a file link would need them. On macOS and Linux, folders and files are linked with symbolic links; the “copied (linking a file needs administrator rights)” note the window shows next to the files only holds for Windows, even though it also appears on Linux.
4. “Create and sign in” creates the account, active and last in the list, with its folder in `~/.escouade/claude/`, then opens its sign-in.

The sign-in (`.credentials.json`) and `.claude.json` are never shared: each account has its own.

## The pause threshold

The threshold is set in the [“Kanban”](settings-board) tab, not here, but it decides which accounts Escouade sets aside.

| Setting | Effect | Default |
|---|---|---|
| “Pause above quota” (for all projects) | No ticket starts while the 5-hour window or the weekly window is at or above this threshold. Choices: 80%, 90%, 95%, or 100%. | 100% |

An account with a window past the threshold is set aside in favor of the next one in the list, and the quota panel marks it “past the pause threshold”.

## Resuming on another account

When a turn stops on the usage limit, the agent’s card offers “Resume on” followed by an account, or “Resume on another account” with a menu when there are several: the agent goes on with its session on the other account. The accounts offered are the active ones, other than the agent’s own, that serve its project, are signed in, and stay under the pause threshold.

For a ticket’s agent, the “Resume a ticket’s agent stopped by the usage limit on another account” setting in the [“Claude Code”](settings-claude-code) tab does it by itself. A session doesn’t move from an account that runs Claude Code on Windows to one that runs it in WSL, or the other way around.
