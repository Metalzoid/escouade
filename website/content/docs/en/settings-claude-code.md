# Settings: Claude Code

The “Claude Code” tab sets the Claude Code executable, the model, effort, and permission mode of new agents, how Claude processes live, and the server that lets Claude drive Escouade.

## Executable

The “Executable” group has a single field.

| Setting | Effect | Default |
|---|---|---|
| “Executable path” (blank = detect automatically) | The `claude` Escouade runs for agents. An account with its own executable, in the [“Claude accounts”](settings-accounts) tab, runs its own. | Blank |

### Where Escouade looks

With the field blank, Escouade looks for `claude` in the `PATH`, then in the installers’ usual locations:

- on Windows: `~\.local\bin\claude.exe`, `~\.claude\local\claude.exe`, and `~\AppData\Roaming\npm\claude.cmd`;
- on macOS and Linux: `~/.local/bin/claude`, `~/.claude/local/claude`, `/opt/homebrew/bin/claude`, and `/usr/local/bin/claude`.

On Windows, if it finds none, Escouade looks for a Claude Code installed in WSL, in the distribution named by “WSL distribution” in the [“Terminals”](settings-terminals) tab (blank = the default distribution).

With the field filled in, you can write:

- a full path;
- a path starting with `~`, the home folder (Windows, macOS, and Linux);
- on Windows, a path without its `.exe` or `.cmd`;
- on Windows, a Claude Code installed in WSL: `~/.local/bin/claude`, `/home/<user>/.local/bin/claude`, or `\\wsl.localhost\<distribution>\home\<user>\.local\bin\claude` (`\\wsl$\<distribution>\…` works too).

### The line under the field

A quarter of a second after you stop typing, Escouade looks for the `claude` in the field and says what it found under the field:

- “Found: ” followed by the path;
- “Found in WSL (Ubuntu): ” followed by the Linux path, for a Claude Code in WSL;
- “Not found.”: on Windows the line then recalls the accepted path forms, WSL’s included; elsewhere it says “Not found. Give the path to claude.”.

With the field blank, the placeholder already says whether `claude` is found: “claude (found in PATH)” or “not found — enter the path to claude.exe”. After “Save”, a new path or a new WSL distribution triggers another search, to update the banner on the [Kanban](board) and the text of the field.

> [!WARNING]
> If the `claude` found is in WSL and WSL’s network is NAT, a warning is added: Escouade’s MCP server and the tracking of the [Claude Code view](claude-code-view) can’t reach the app. Switch WSL to mirrored mode (`networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`), then run `wsl --shutdown`.

## New agents

The three choices apply to every [agent](managing-agents) created afterward. In an agent’s message field you can change them for that agent alone. Kanban tickets take them too when the project’s [“Kanban”](settings-board) tab doesn’t pick its own.

| Setting | Effect | Default |
|---|---|---|
| “Default model” | One of Claude Code’s aliases: “Fable”, “Opus”, “Sonnet”, or “Haiku”. Once Claude Code has said which version it runs for an alias, the chip shows it (“Sonnet 5.5”, for example). | “Sonnet” |
| “Default effort” | How much the model thinks before answering. | “Medium” |
| “Default permission mode” | What Claude may do without asking you. | “Auto” |

### Effort levels

| Level | Meaning |
|---|---|
| “Low” | Quick answers, little thinking |
| “Medium” | Balanced |
| “High” | Deep thinking |
| “Very high” | Very deep thinking |
| “Max” | Maximum thinking, uses more tokens |

### Permission modes

| Mode | Meaning |
|---|---|
| “Auto” | A classifier approves safe actions and asks about the rest |
| “Ask” | Claude asks for your approval before each sensitive action |
| “Plan” | Claude analyzes and proposes a plan without changing anything |
| “Accept edits” | File edits are accepted without asking |
| “Bypass” | No permission requests (only for safe environments) |

Permission requests and how to answer them are described in [the conversation](chat), and “Plan” mode in [the plan](plan).

> [!NOTE]
> With Haiku, the effort choice is grayed out in the agent’s message field (“Haiku doesn’t support effort”), and so is “Auto” mode (“unavailable with Haiku”).

## Processes

| Setting | Effect | Default |
|---|---|---|
| “Auto-resume after the usage limit” | “continue” is sent to the agent once the quota has reset. | On |
| “Resume a ticket’s agent stopped by the usage limit on another account” | Otherwise it waits for its account to reset. Absent while there is only one account. | Off |
| “Open new agents in Claude Code’s interface” | A new agent runs in the Claude Code view rather than in Escouade’s conversation. | Off |
| “Agents keep a task list” | Agents get Claude Code’s task list tool. | On |
| “Stop idle Claude processes after” (minutes, 0 = never) | The Claude process of an idle agent is stopped after this delay. | 30 |

### Auto-resume

When an agent stops on the usage limit, Escouade plans to write “continue” to it when the quota resets. Turning the setting off also cancels the resumes already planned. The limit and the quotas are explained in [usage](usage).

### Resume on another account

With several accounts, a ticket’s agent stopped by the limit goes on by itself, with its session, on the account Escouade would pick, when another one is usable, instead of waiting for its own account to reset. See [accounts](accounts) and the [“Claude accounts”](settings-accounts) tab.

### Claude Code view

Each agent switches views from its header, and this setting only picks the starting view. Ticket agents stay in Escouade’s view. See [the Claude Code view](claude-code-view).

### Task list

If the agent keeps a list, Escouade shows its progress in the “Plan” banner; the model doesn’t have to use it. The setting applies to agents started afterward. See [the plan](plan).

### Idle processes

The field is a number of minutes; 0 means never, and an empty field counts as 0. The session of an agent whose process was stopped stays resumable. An agent in remote control is never stopped this way, so that it stays reachable from claude.ai.

## Escouade in Claude

This group lets Claude Code, in a terminal, in another tool, or in an Escouade agent, read your projects, agents, and tickets, and create tickets or start agents, through Escouade’s [MCP server](mcp).

### Claude can drive Escouade

The switch is off by default. It saves right away, without going through “Save”: turning it on declares the server in the Claude Code config of each active account, which a “Cancel” could not undo. Turning it off changes the token and removes the server from each account.

As long as a project lets its agents use Escouade (the “Agents can use Escouade” setting in the [“Projects”](settings-projects) tab), the server runs even with the switch off.

With the switch on, a line below it says where the declaration stands:

- “Declaring in Claude…” while Escouade writes the server into Claude Code’s config;
- “Declared in Claude · Main account, Pro account” when it is done for the accounts listed;
- “Not declared for the Pro account: ” followed by the reason, when it failed for an account: the window then shows the command to run by hand (introduced by “Run it by hand in PowerShell:”, or “… in sh:” on macOS), with the token masked, and the “Copy the command” button copies the real command (“Command copied”);
- “The server did not start: ” followed by the reason, in place of the lines above.

> [!WARNING]
> The token is written in plain text in Claude Code’s config (`~/.claude.json` for the Main account). Turning it off changes the token.

## MCP activity

This last group, “MCP activity”, lists what the server received and answered, the most recent calls first. Each line gives the time, who called (an agent’s name, “Claude (outside Escouade)”, or, for a request refused before it is known who sent it, “Unknown client”), the tool, the result (“Done”, “Refused”, or “Error”), then what was asked and, for a refusal or an error, why. The last 200 calls are kept in memory, not saved. The “Clear” button empties the list; with no calls, it says “No calls yet.”.
