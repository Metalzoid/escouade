# Settings: Integrations

The “Integrations” tab of the settings connects Jira, Trello, GitHub Issues, and Linear, links each project to a source of tickets, and sets what Escouade writes on the external tickets and what it imports by itself.

## Open the tab

Open the settings with `Ctrl+,` (`⌘,` on macOS), then choose “Integrations”. Imported tickets and their sync are explained in [integrations](integrations).

The tab brings together three kinds of settings:

- “Connected accounts” is shared by the whole app and is saved right away, without “Save”.
- “Sources linked to …” and “Status mapping” belong to the project selected in the “Project” bar at the top of the window. They stay in a draft until “Save”; “Cancel” drops them.
- “Sync” and “Automatic import” are shared by all projects, and also go through “Save”.

With no project open, the tab shows “No project open.”.

## Connected accounts

One account per service: Jira, Trello, GitHub Issues, and Linear. Each service shows “Not connected” with a “Connect…” button, or “Connected · ” followed by the account with a “Disconnect” button. Under the title, the app reminds you: “Tokens stay on this machine, stored apart from your settings, and are only used for calls to these services.”

“Connect…” opens the service’s form, whose fields are described below. Tokens and Linear’s API key are masked as you type; Trello’s API key isn’t.

### Jira

| Field | What to enter |
|---|---|
| “Site” | The address of your Atlassian site, for example `atlas.atlassian.net`. Without `https://`, Escouade adds it. Only https is accepted (http only to this machine). |
| “Email” | The email of the account the token belongs to, for example `ada@atlas.dev`. |
| “API token” | An Atlassian API token. |

The link “Create an Atlassian API token” opens `https://id.atlassian.com/manage-profile/security/api-tokens`. Once connected, the account shows the email and the site, for example “ada@atlas.dev · atlas.atlassian.net”. What Jira calls the place of the tickets is a “Project”.

### Trello

| Field | What to enter |
|---|---|
| “API key” | Trello’s API key. |
| “Token” | A token for that key. |

The link “Get an API key” opens `https://trello.com/power-ups/admin`. The link “Get a token for this key”, grayed out while the key is empty, opens Trello’s authorization page for the key you typed: read and write access, no expiration, in the name of “Escouade”. The place of the tickets is a “Board”.

### GitHub Issues

| Field | What to enter |
|---|---|
| “Token (empty: the one from gh)” | A GitHub token. Left empty, Escouade asks the GitHub CLI for its token (`gh auth token`): `gh` must be installed and logged in (`gh auth login`). |

The link “Create a GitHub token” opens `https://github.com/settings/tokens`. An account that goes through `gh` shows “· via gh”. The place of the tickets is a “Repository”.

### Linear

| Field | What to enter |
|---|---|
| “API key” | A Linear personal API key. |

The link “Create a Linear API key” opens `https://linear.app/settings/account/security`. The place of the tickets is a “Team”.

### Connect and disconnect

Click “Connect” once the fields are filled in; the button reads “Checking…” during the call, and “Cancel” closes the form. Escouade checks the credentials with the service and only keeps them if it accepts them. If it refuses them, or can’t be reached, its answer shows in red under the fields, for example “Jira refuses these credentials (401)”. A missing field is reported before any call, for example “Give the token.”.

“Disconnect” forgets the account and its secrets. Projects keep their linked sources: they’re unused until an account of that service is connected again. To switch accounts, disconnect the old one, then connect the other.

### Where tokens are kept

Keys and tokens go to the system keychain (Credential Manager on Windows, Keychain on macOS); the rest of the account is in `~/.escouade/integrations.json`. On Linux, where Escouade knows of no keychain, and when the keychain refuses a write, the secrets stay in that file, readable by you alone. The account then says so: “System keychain unavailable: the token stays in ~/.escouade/integrations.json.”

If the keychain doesn’t give a token back at startup, the account shows “System keychain unreadable: restart Escouade or reconnect the account.” and no call goes out as long as that’s the case. See [local data](data).

## Sources linked to a project

The group is titled “Sources linked to” followed by the project’s name. While no account is connected, it says: “Connect an account above to link a source to this project.”

For each connected service, a menu chooses the project’s source: “Jira project”, “Trello board”, “GitHub Issues repository”, or “Linear team”. “None” (the default) unlinks. A project has at most one source per service.

- **Jira**: the projects of the site, shown as “KEY — name”.
- **Trello**: your open boards.
- **GitHub Issues**: the repositories you have access to (owner, collaborator, or organization member), the latest pushed first. The project’s own repository, read from its git remote, comes first with “(the project’s repository)”.
- **Linear**: your teams, shown as “Name (KEY)”.

Choosing a source loads its statuses and pre-fills the mapping below. If the statuses don’t load, the source is linked anyway, and the tooltip of the mapping menus says why.

## Status mapping

This group only appears once a source is linked on a connected account. It says: “The status the external ticket takes when its ticket reaches the column; “Comment” adds a comment there (criteria, outcome of the approval…).”

One row per Kanban column (“To do”, “In progress”, “To review”, “Done”), one menu per linked service, and a “Comment” switch at the end of the row.

### The status of each column

Each menu offers “— unchanged” (the external ticket isn’t touched) and the source’s statuses:

| Service | Statuses offered | What the status change does |
|---|---|---|
| Jira | The statuses of the project’s issue types | Escouade applies the workflow transition that leads to that status. If the workflow doesn’t lead there from the current status, it’s refused. |
| Trello | The board’s open lists | The card moves into the list. |
| GitHub Issues | “Open”, “Closed”, and the repository’s labels (preceded by ◆) | “Closed” closes the issue as completed; “Open” reopens it. A label is put on the issue (reopened if need be), and the other labels of the mapping are taken off. |
| Linear | The states of the team’s workflow | The ticket takes that state. |

When you link a source, Escouade pre-fills the menus from the statuses’ names: the one that looks like “in progress” (“In Progress”, “En cours”, “Doing”…) for “In progress” and “To review”, and the one that looks like “to test” (“To test”, “QA”, “In Review”, “À tester”…) for “Done”. “To do” stays “— unchanged”. Fix the menus if your workflow is different.

### Comment

A column’s “Comment” switch adds a comment on the external ticket when a ticket reaches the column. It applies to all of the project’s sources. By default it’s on for “To review” and “Done”, and off for “To do” and “In progress”.

The comment is written in the language of “Language of texts written by Claude” (in the [“Application”](settings-application) tab):

| Column | Comment |
|---|---|
| “To do” | “Escouade: ATL-42 is back in “To do”.” |
| “In progress” | “Escouade: ATL-42 is picked up by an agent (branch ticket/ATL-42).” |
| “To review” | “Escouade: ATL-42 is ready to review.”, or “… (partial goal).” when the ticket arrives without all its criteria for lack of loops. The list of criteria and “What was done” follow when the ticket has them. |
| “Done” | “Escouade: ATL-42 is done — ” followed by the outcome of the approval, then the PR’s link if there is one. |

## Sync

These three settings apply to all projects.

| Setting | Effect | Default |
|---|---|---|
| “Update the external status” | When an imported ticket changes column in the Kanban, the external ticket takes the status the mapping gives the column. Off, statuses are no longer touched; the mapping’s comments are still posted. | On |
| “Post a summary on every loop” | When a ticket begins a new loop (from the second one on), a comment gives the criteria met and the agent’s notes on the external ticket. | Off |
| “Extract the acceptance criteria” | On import, reads the criteria from the imported ticket’s description (Jira, GitHub) or checklist (Trello). Off, the ticket gets the default criteria. | On |

If a service refuses or can’t be reached, the operation isn’t lost: it’s tried again after 1, 5, 15, then 60 minutes, for 24 hours at most. The ticket’s card then shows the error and “Resync” to try again right away. A refusal that trying again wouldn’t change (a deleted ticket, a workflow that doesn’t lead to the status) is set aside without waiting.

## Automatic import

These three settings also apply to all projects. Importing by hand is the “Import” button in the Kanban header: see [integrations](integrations).

| Setting | Effect | Default |
|---|---|---|
| “Import labeled tickets” | Open tickets from the linked sources that carry the label arrive in “To do”, with 5 loops at most. | Off |
| “Label” | The label’s name: a Jira, Trello, GitHub, or Linear label. Empty, nothing is imported. | `claude-ready` |
| “Check every” | The interval between two checks: 5 min, 15 min, or 60 min. | 15 min |

The automatic import brings a ticket in only once per project: a ticket already imported, even deleted from the Kanban since, isn’t brought back on its own (importing by hand can take it again, as long as it is no longer in the Kanban). Each import shows a message like “3 tickets imported from Jira into demo”. The first check happens about 30 seconds after the app starts, or at most 30 seconds after you save if you turn the import on later; the next ones follow at the chosen interval.
