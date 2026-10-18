# The harnesses

A harness is the program that runs an agent: Claude Code, Codex, OpenCode or GitHub Copilot CLI. This page compares them, then tells for each one how to install it, its account, its models, its modes and what protects it, its cost and quota, its terminal view, the MCP server and what it doesn’t do.

> [!NOTE]
> Codex, OpenCode and Copilot CLI come with Escouade 1.8; Claude Code has been there from the start. Cursor CLI comes later.

## Choosing a harness

Escouade starts the harness on your machine, with your own account: install at least one and sign in to it once, as you would to use it in a terminal. Settings › Harness lists each one with its executable, its version and its state (see [the harness settings](settings-claude-code)).

As soon as two harnesses are installed:

- each project has its “Default harness” (Settings › Projects), Claude Code when unset;
- the “▾” button next to “New agent” offers “New agent on …” for each one;
- a ticket’s window has its “Harness” field, the project’s by default, which the autopilot follows;
- each agent’s card bears the mark of its harness, as soon as agents run on two harnesses.

An agent keeps its harness. When no account of its own can take it anymore, it can [continue on another harness](accounts#continue-on-another-harness), with its conversation, its worktree and its branch.

Whatever the harness, the agent has the same conversation: the answer and the reasoning live, its tools under the same names (`Bash`, `Edit` with its diff, `Read`, `Task`…), the same permission, question and plan-to-approve cards, the “Plan” banner with its tasks and subagents, resuming after a restart and “Duplicate the conversation”. What a harness can’t do doesn’t show for its agents.

## Comparison

| | Claude Code | Codex | OpenCode | Copilot CLI |
|---|---|---|---|---|
| Installation | Claude Code’s script | `npm install -g @openai/codex` | `npm install -g opencode-ai` | `npm install -g @github/copilot` |
| Tested with | 2.1.283 to 2.1.301 | 0.163.0 | 1.19.3 | 1.0.98 |
| Account | Claude subscription or API key | ChatGPT account | the providers connected to OpenCode, local models included | GitHub account with Copilot, Free included |
| Several accounts | yes | yes | no | yes |
| Models | Fable, Opus, Sonnet, Haiku | those Codex lists for your account | your providers’, with search and favorites | those Copilot lists, with their multiplier |
| Modes | all five | all five | four (no Auto) | all five |
| What protects | its permissions | its sandbox | its permission rules | Escouade’s rules |
| Message during a turn | waits for the end of the turn | enters the turn | waits for the end of the turn | enters the turn |
| Cost | exact | estimated | exact (0 when local) | exact, in AI credits |
| Quota | 5-hour and 7-day windows | 5-hour and 7-day windows (30 days on the free plan) | none: daily budget | monthly credits |
| Terminal view | “Claude Code view” | “Codex view” | “OpenCode view” | “Copilot CLI view” |
| Attached PDFs | yes | no | no | no |
| Remote control, background tasks | yes | no | no | no |

## Claude Code

### Installation and account

Install Claude Code with its script (`irm https://claude.ai/install.ps1 | iex` on Windows, `curl -fsSL https://claude.ai/install.sh | bash` on macOS and Linux), then sign in with your Claude subscription or an API key. Escouade finds it in the `PATH` or in the usual places, even in WSL (see [installation](installation)). Its accounts each have their folder (`CLAUDE_CONFIG_DIR`): see [several accounts](accounts).

### Models and modes

Fable, Opus, Sonnet and Haiku, shown with the version Claude Code runs, and their efforts (Haiku has none). The five modes have their original meaning: “Auto” (a classifier approves safe actions), “Ask”, “Plan”, “Accept edits” and “Bypass” (see [the permission modes](managing-agents#permission-modes)). Claude Code’s permissions are what protects.

### Cost, quota and view

A turn’s cost is the one Claude Code gives. The quota is your account’s 5-hour window and weekly window, in the status bar. The [Claude Code view](claude-code-view) runs the agent in Claude Code’s own interface. It alone has [remote control](remote-control), background tasks and reading PDFs.

## Codex

### Installation and account

`npm install -g @openai/codex`, then `codex login` with your ChatGPT account. Escouade starts the native binary of the npm package (on Windows, the package’s `codex.exe`, not its launcher): Codex’s desktop app often installs an older version, which the `PATH` may find first. Each agent has its `codex app-server`. Its accounts each have their `CODEX_HOME`: see [Codex accounts](accounts#codex-accounts).

### Models and modes

The models and their efforts are those Codex lists for your account. The modes go through Codex’s sandbox:

| Mode | With Codex |
|---|---|
| Plan | Codex’s Plan mode: it studies, may ask you questions, then proposes its plan, without changing anything (read-only sandbox). |
| Ask | Sandbox: writing in the agent’s folder, network off. A command that leaves it asks, `git add` and `git commit` included (Codex protects the whole `.git` folder). |
| Accept edits | The same, and Escouade accepts at once `git add` and `git commit` in the agent’s worktree, when the command is only that and its hooks are the repository’s; the network and the rest ask. |
| Auto | Codex’s automatic reviewer decides on the requests for you, and the conversation says what it approved. |
| Bypass | Codex asks nothing and leaves its sandbox. |

A request from Codex has three buttons: “Allow”, “For this session” and “Deny”. A message sent while it works enters its turn instead of waiting.

### Cost, quota and view

Codex doesn’t give the cost: Escouade estimates it from the turn’s tokens and OpenAI’s public prices, and writes it “≈ … estimated”. The quota is your account’s windows (5 hours and 7 days, or a single 30-day one on the free plan). The “Codex view” runs the agent in Codex’s interface (see [the terminal view](claude-code-view#with-codex)).

### What Codex doesn’t do

It doesn’t read PDFs (the button refuses them and says so) and offers no `/` commands in Escouade. A Codex agent doesn’t resume on another account: it waits for the reset, or continues on another harness. No remote control or background tasks.

## OpenCode

### Installation and account

`npm install -g opencode-ai` installs OpenCode 1, the only one Escouade drives: OpenCode 2 (`@opencode/cli`) is recognized and says “Not supported”. Connect a provider with `opencode auth login` (“Sign in…” in Settings › Harness runs it); Ollama’s local models work too. OpenCode has a single account in Escouade, its usual config. A single `opencode serve` serves all OpenCode agents, protected by a random password that never leaves Escouade; each agent is a session on it.

### Models and modes

The “Model” menu lists the models of the connected providers, with a search, their provider and favorites (★) first, also set in Settings › Harness › OpenCode › “Models”. The effort is the model’s variant when it has one. Escouade always gives the model, so that OpenCode doesn’t pick one by itself.

OpenCode has no sandbox: its permission rules are what follows the mode, and an accepted command can do anything.

| Mode | With OpenCode |
|---|---|
| Ask | The files of the agent’s folder change without asking; commands (`git add` and `git commit` included), the web and paths outside the folder ask. |
| Accept edits | The same, and `git add` and `git commit` go through without asking. |
| Plan | OpenCode’s `plan` agent studies without changing anything, then proposes its plan for you to approve. |
| Bypass | OpenCode asks nothing. |

A request from OpenCode has “Allow”, “Always allow” (the card says the pattern OpenCode will keep for the session, like `git add *`) and “Deny”. A message sent during a turn waits for its end.

### Cost, budget and view

A turn’s cost is the one OpenCode gives, at the provider’s price: 0 with a local model. OpenCode has no quota: the status bar shows its account’s cost for the day, and “Daily budget ($)”, in Settings › Accounts, pauses the autopilot until midnight once reached (see [the OpenCode account](accounts#opencode-account)). The “OpenCode view” plugs OpenCode’s interface into the agent’s session without stopping Escouade’s tracking (see [the terminal view](claude-code-view#with-opencode)).

### What OpenCode doesn’t do

No “Auto” mode (OpenCode has no reviewer), no sandbox, a single account, no attached PDFs, no `/` commands in Escouade, no remote control or background tasks.

## Copilot CLI

### Installation and account

`npm install -g @github/copilot`, then `copilot login` with a GitHub account that has Copilot (Free included). Each agent has its `copilot --server --stdio`, without the GitHub MCP server Copilot plugs in by itself, without access to the system’s temporary folder and without the GitHub tokens in its commands’ environment. Its accounts each have their `COPILOT_HOME`: see [Copilot CLI accounts](accounts#copilot-cli-accounts).

### Models and modes

The models menu writes each one’s multiplier (`×3`), or its relative cost on a Free account; `auto` is never offered. The model and the mode change at once, even during a turn.

Copilot has no sandbox when Escouade drives it: Escouade’s rules answer the safe requests without a card.

| Mode | With Copilot CLI |
|---|---|
| Ask | Reads and writes in the agent’s folder go through; commands (`git add` and `git commit` included), the web, MCP tools and paths outside the folder ask. |
| Accept edits | The same, and `git add` and `git commit` of its worktree go through. |
| Plan | Copilot studies and proposes a plan without changing anything; its reads of the folder go through. |
| Auto | Copilot goes on by itself to the end of its task (autopilot), with the rules of “Accept edits”. |
| Bypass | Copilot asks nothing. |

A request from Copilot has “Allow”, “For this session” and “Deny”; no “Always”, which would write a lasting rule into Copilot’s config. A form from an MCP server becomes a card with fields. A message sent during a turn enters it at once.

### Cost, credits and view

A turn’s cost comes from the AI credits of its calls (one credit is $0.01). The “credits” bar says what is used this month, until they come back on the 1st of the month; a session’s credit cap, once reached, becomes a card. The “Copilot CLI view” runs the agent in Copilot’s interface (see [the terminal view](claude-code-view#with-copilot-cli)).

### What Copilot CLI doesn’t do

No “Always allow”, no `assisted` mode (experimental), no attached PDFs, no `/` commands in Escouade, no remote control or background tasks. A Copilot agent doesn’t resume on another account.

## The MCP server

Whatever their harness, Escouade’s agents get its MCP server, each with its own token, when “Agents can drive Escouade” is on. The same switch declares it in each installed harness, so that Claude Code, Codex, OpenCode or Copilot CLI started outside Escouade, in a terminal or their app, drive Escouade: see [the MCP server](mcp).

## Written texts

A new agent’s name, the suggested commit messages and pull request descriptions are written by the harness of Settings › Application › “Model for written texts”: “Claude Haiku”, “Codex (GPT-6-Luna)”, an OpenCode model or “Copilot (GPT-5 mini)”, among the installed harnesses (see [written texts](settings-application#written-texts)).
