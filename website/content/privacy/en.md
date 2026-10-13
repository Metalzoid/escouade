# Privacy

Escouade works locally, on your machine. The only thing that leaves it on its own, and only if you accepted, is anonymous usage statistics. This page says what is sent, what never is, where it goes, and how to stop it.

## In short

- The statistics are **optional**. Escouade asks at the first start (existing installs too, after an update from a version that had none) and sends nothing until you answer “Share statistics”.
- They are **anonymous**: an id drawn at random, never derived from your machine or from you, and no name, path, code, conversation or Git data.
- They go to a server **of ours**, hosted in France. No third party receives them.
- You can stop them at any time, and the id is then deleted.

## What is sent

Every event carries its name, its time (UTC, to the millisecond), a session id, the install id, and the system information described below.

### The events

| Event | When | Props added |
|---|---|---|
| `app_started` | At each start | The interface language (`fr` or `en`), the number of Claude accounts, the number of projects, whether “Claude can drive Escouade” (the MCP server) is on (yes or no), whether a project is in WSL (yes or no) |
| `app_active` | Once a day while the app stays open | — |
| `project_created` | A project is created | — |
| `agent_created` | An agent is created | `worktree`: with a worktree or not (yes or no) |
| `message_sent` | A message is sent to an agent | — |
| `ticket_created` | A ticket is created | — |
| `ticket_started` | A ticket is started | `by`: `user` or `autopilot` |
| `ticket_approved` | A ticket is approved | — |
| `committed` | A commit is made | — |
| `merged` | A branch is merged | — |
| `git_sync` | A Git sync | `op`: `fetch`, `pull` or `push` |
| `branch_created` | A branch is created | — |
| `terminal_opened` | A terminal is opened | — |
| `launch_started` | A launch command starts | — |
| `test_run_started` | A test starts | — |
| `claude_code_view` | An agent switches to the Claude Code view | — |
| `file_saved` | A file is saved in the editor | — |
| `code_searched` | A search in the code | — |
| `mcp_enabled` | “Claude can drive Escouade” is turned on | — |
| `integration_connected` | A service is connected | `service`: `jira`, `trello`, `github` or `linear` |
| `tickets_imported` | Tickets are imported | `service`: `jira`, `trello`, `github` or `linear` |
| `account_created` | A Claude account is added | — |
| `remote_control_enabled` | Remote control is turned on | — |

An event says that a feature was used, not on what: never the name of the project, the agent or the branch, nor anything that was written.

### The system and the install

Every event also carries:

| Information | Example or detail |
|---|---|
| Install id | A random UUID v4 drawn when you agree, kept in `~/.escouade/telemetry-id`, deleted when you say no |
| Session id | A random number, renewed after 4 hours without any event |
| Escouade’s version | For example `1.8.0` |
| Development build | Whether the app is a development build (yes or no) |
| System and its version | For example Windows 10.0.26200, macOS 15.1 |
| System locale | For example `fr-FR` (10 characters at most) |
| Web engine and its version | WebView2, WebKit or WebKitGTK |

## What is never sent

- Names: yours, and those of your projects, agents, branches and accounts.
- E-mail addresses.
- Paths and file names.
- Your code.
- The content of conversations and of the instructions given to agents.
- The titles and texts of your tickets.
- Git data: commits, remotes.
- Tokens and secrets.
- Anything you type.

## The tool and where the data lives

The statistics are received by [Aptabase](https://aptabase.com), an open source analytics tool ([its source](https://github.com/aptabase/aptabase)). It is **self-hosted by Escouade’s author**, at `aptabase.gagnaire.dev`, on a Scaleway server in a datacenter in Paris (France). No third party receives this data, and nothing goes through Aptabase’s own cloud.

On the server side, Aptabase does not store the IP address. It uses it on reception to derive the country and, when it can, the region, and, combined with a salt that changes every day, to compute a daily visitor hash.

## How events leave

- Events wait in memory, never on disk.
- They are sent every minute, in batches of 25, and when you quit the app (3 seconds at most), over HTTPS to `https://aptabase.gagnaire.dev/api/v0/events`.
- Offline, up to 1,000 events wait in memory, the oldest being dropped first. If you quit the app offline, they are lost.

## How long

The server deletes events automatically after 5 years (after 182 days for those of development builds).

## Saying yes, no, or changing your mind

- **At the first start**, a “Help improve Escouade?” dialog offers “Share statistics” or “No thanks”, with a “What is sent, in detail” link to this page. If you close it without answering (with `Esc`), it comes back at the next start.
- **In the settings**, “About” tab, the “Anonymous usage statistics” line has a switch and an “In detail” button that opens this page. It is off until you accept in the first-start dialog.
- **When you turn it off**, the install id is forgotten, its `telemetry-id` file is deleted, and events still waiting are dropped. If you turn it on again, a new id is drawn: the install counts as a new one.

See also [the “About” settings](settings-about).

## Tests and demos

An instance started with a separate data folder (the `ESCOUADE_DATA_DIR` variable, used by tests and demos) never sends anything. See [local data](data).

## Why

To know how many people use Escouade (users active over 30 days, counted by install id), which versions are still in use (to know when an old one can stop being supported), on which systems, and which features are used, in order to decide what to improve.

## Anonymity

The id is drawn at random. It is derived from nothing about your machine or about you, and nothing allows linking the statistics to a person.

## Asking for deletion

To have an install’s data deleted, open a [GitHub issue](https://github.com/guillaume-gagnaire/escouade/issues) giving the id in your `telemetry-id` file (in `~/.escouade/`). You can also write to [guillaume@gagnaire.dev](mailto:guillaume@gagnaire.dev).

## Who is responsible

The statistics are managed by GAGNAIRE DEVELOPPEMENT, the publisher of Escouade (see the [legal notice](/en/legal/)). Contact: [guillaume@gagnaire.dev](mailto:guillaume@gagnaire.dev).

## The code

The code that sends the statistics is open: [`telemetry.rs`](https://github.com/guillaume-gagnaire/escouade/blob/main/src-tauri/src/telemetry.rs). What this page says has to be true there.

## What leaves Escouade besides the statistics

Escouade has no account or server of its own for your projects, conversations or settings: they stay in `~/.escouade/` ([local data](data)). It does talk to a few services, and only for what you ask of it:

- **Claude Code**, which it runs on your machine, sends its requests to Anthropic as it would in a terminal. Escouade also queries Anthropic’s usage service to show your quotas ([quotas](usage)).
- **Updates**: Escouade reads the `latest.json` file of the latest release on GitHub, then downloads the new version ([updates](updates)).
- **The integrations** you connect (Jira, Trello, GitHub, Linear): Escouade talks to those services with your token ([integrations](integrations)).

## This site

This site’s code includes no cookie and no analytics tool. It only keeps your language choice in your browser’s local storage (the `escouade-lang` key), to leave you on the right language at your next visit. That value stays in your browser and is sent nowhere.
