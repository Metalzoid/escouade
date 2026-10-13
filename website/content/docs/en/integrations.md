# Jira, Trello, GitHub, and Linear

Escouade imports tickets from Jira, Trello, GitHub Issues, and Linear into the Kanban, with their acceptance criteria, then keeps their status up to date and leaves comments on them as the work goes. This page covers connecting, importing, and syncing.

![The “Import tickets” window: Jira tickets filtered by “Assigned to me”, with their detected criteria](/images/en/integrations.jpg)

## Connecting a service

Accounts are connected in Settings › Integrations, “Connected accounts” group (see [Integrations settings](settings-integrations)). For each service, “Connect…” opens a form. “Connect” checks the credentials with the service (“Checking…”), then the line reads “Connected · ” followed by who you are there (for example `ada@atlas.dev · atlas.atlassian.net`). If the service refuses, the reason shows under the form. The connection is saved at once: it does not go through “Save”.

| Service | What you give | Where to get it |
|---|---|---|
| Jira | “Site” (`atlas.atlassian.net`, over https), “Email”, and “API token” | “Create an Atlassian API token” |
| Trello | “API key” and “Token” | “Get an API key”, then “Get a token for this key” (available once the key is typed: a read and write token that never expires) |
| GitHub | “Token”, optional | “Create a GitHub token”. Left empty, Escouade uses the one from the `gh` CLI (`gh auth login`); the account then shows with “· via gh” |
| Linear | “API key” | “Create a Linear API key” |

“Disconnect” forgets the account and its secrets. Projects keep their links, unused until you connect again.

### Where the tokens are kept

Tokens stay on your machine, apart from your settings, and are only used for calls to these services. Escouade stores them in the system keychain: Credential Manager on Windows, Keychain on macOS. On Linux, which has no supported keychain, they stay in `~/.escouade/integrations.json`, readable by you alone.

When the keychain refuses a token on Windows or macOS, it stays in that file and the tab says so: “System keychain unavailable: the token stays in ~/.escouade/integrations.json.” If the keychain exists but cannot be read, the tab says “System keychain unreadable: restart Escouade or reconnect the account.” and no call goes out without the tokens. For GitHub through `gh`, Escouade keeps no token.

## Linking a project to a source

A project links to one place per service: a Jira project, a Trello board, a GitHub repository, or a Linear team. In Settings › Integrations, the “Sources linked to `<project>`” group offers, for each connected service, a list: “Jira project”, “Trello board”, “GitHub Issues repository”, “Linear team”. “None” unlinks the service. For GitHub, the project’s own repository, when its remote is on GitHub, comes first (“(the project’s repository)”).

Choosing a source loads its statuses and pre-fills the status mapping (see below). Then save the settings.

From the Kanban, “Import” with no linked source shows “No source linked to this project” and “Link a source”, which opens this same tab.

## Importing tickets

In the [Kanban](board), “Import” (⤓) opens the “Import tickets” window. It adds the tickets you pick to the end of “To do”.

- One tab per linked and connected source (the service, the source’s name, and the number of tickets you picked in it). “⚙ Manage sources” opens the settings.
- The search field searches the chosen source. The search runs 300 ms after the last keystroke.
- Filter chips are clicked to turn on or off. The field and the chips depend on the service:

| Service | Search field | Chips |
|---|---|---|
| Jira | “Search by key or text…” | “Assigned to me”, “Active sprint”, “To do” |
| Trello | “Search for a card…” | “My cards”, then one chip per list of the board |
| GitHub | “Search for an issue…” (a number, `42` or `#42`, finds the issue) | “Assigned to me”, then the repository’s labels (twelve at most) |
| Linear | “Search by identifier (ENG-42) or title…” | “My issues”, then one chip per workflow state that is neither completed nor canceled |

Only open tickets are offered: not those in Jira’s “Done” category, nor closed GitHub issues (pull requests are left out), nor completed or canceled Linear issues.

Each row shows the key, the title, the type (Bug, Story, Task, Card, Issue), the priority, the assignee, and the state, plus “✓ 2 criteria detected” (on hover: which ones). A ticket already in the Kanban is grayed out (“Already in the Kanban”) and cannot be picked. Tickets arrive in pages; “Show more” loads the next one, and the line above the list says “50 shown of 312” when the service counts more tickets than it has sent.

To import:

1. Check the tickets (one click, or `Space` or `Enter` on a row), or “Select all” for those in the list that are not already imported. The selection is kept from one search, one page, and one source to the next.
2. Choose “Max loops” (3, 5, or 8): the same number for every imported ticket.
3. Click “Import 3 tickets”.

Each imported ticket has its own Escouade key (`DEM-7`) and keeps, on its card, the badge of its service with its key there (`ATL-1294`): a click opens it in the service. Its description takes over the external ticket’s, and ends with a line “Jira ticket ATL-1294: `<address>`”. A message confirms (“3 tickets imported from Jira and Trello”). With the autopilot on, imported tickets start on their own (see [The autopilot](autopilot)).

### The acceptance criteria

With “Extract the acceptance criteria” on (the default), Escouade looks for the criteria in the ticket:

- Jira and GitHub: the list items under a heading or a line that names them (“Acceptance criteria”, “Definition of done”, “AC”, “DoD”, or the French “Critères d’acceptation”), otherwise the checkboxes (`- [ ]`) of the description;
- Trello: the items of the checklist that goes by this name, otherwise those of all the checklists, otherwise those the description lists;
- Linear: as for Jira and GitHub, in the description.

It keeps twenty criteria at most, of 300 characters at most. With no criterion found, or with the setting off, the ticket gets the two default criteria. A Jira description is converted to Markdown before it is searched.

## Importing by label

Settings › Integrations › “Automatic import” lets Escouade import on its own:

| Setting | What it does | Default |
|---|---|---|
| “Import labeled tickets” | The open tickets of the linked sources that carry the label arrive in “To do” | Off |
| “Label” | The Jira, Trello, GitHub, or Linear label | `claude-ready` |
| “Check every” | The interval between two passes: 5, 15, or 60 min | 15 min |

A pass looks, in each project, at the linked sources whose account is connected. Tickets arrive with 5 loops at most, and a message announces them (“3 tickets imported from Jira into demo”). A ticket the project has already imported is never brought back, even if you have deleted it from the Kanban since. The first pass happens shortly after you turn it on.

## Status and comments follow the ticket

When an imported ticket changes column, Escouade updates the external ticket. The links, the status mapping, and the comments are set per project; the three settings of the “Sync” group apply to every project.

### Status mapping

The “Status mapping” group (once a source is linked) has one row per Kanban column and, for each linked service, a list of statuses. “— unchanged” leaves the external ticket as it is. Choosing a source pre-fills the columns like this:

- “In progress” and “To review”: the status that looks like “in progress” (`In Progress`, `En cours`, `Doing`, `WIP`, `In development`, `Started`…);
- “Done”: the status that looks like “to review” (`To test`, `Testing`, `QA`, `In Review`, `Review`, `Recette`, `À valider`, `Validation`, `Test`…);
- “To do”: unchanged.

What “status” means depends on the service: a workflow transition for Jira, the list the card sits in for Trello, a workflow state for Linear. For GitHub, they are “Open”, “Closed”, or a label of the repository (marked ◆): “Closed” closes the issue, a label reopens it if needed and removes the other labels of the mapping.

The last column, “Comment”, chooses the columns whose arrival writes a comment (by default “To review” and “Done”). The comment says where the ticket stands:

| Column | Comment |
|---|---|
| “To do” | “Escouade: DEM-5 is back in “To do”.” |
| “In progress” | “Escouade: DEM-5 is picked up by an agent (branch ticket/dem-5).” |
| “To review” | “Escouade: DEM-5 is ready to review.” (with “(partial goal)” where it applies), the criteria (✓ or ○, with the agent’s note), and “What was done”. |
| “Done” | “Escouade: DEM-5 is done — ” followed by the outcome (“⤵ Merged into main · squash”), and the pull request’s link if there is one. |

### Sync settings

| Setting | What it does | Default |
|---|---|---|
| “Update the external status” | When an imported ticket changes column, its external ticket takes the status of the mapping | On |
| “Post a summary on every loop” | At each new loop, a comment gives the criteria met and the agent’s notes (“Escouade: DEM-5, loop 2/5 — 1/3 criteria met.”) | Off |
| “Extract the acceptance criteria” | See above | On |

### The language of comments

Comments are published for your team: they are written in the “Language of texts written by Claude” (Settings › Application, see [Application settings](settings-application)), not in the interface’s language. The outcome of a done ticket is quoted there in that same language.

## Failed syncs

Every change to pass on is kept in a queue, `~/.escouade/sync-queue.json`, until the service has taken it. A ticket’s changes go in order, one after the other: a change that fails holds back the next ones of the same ticket, not those of other tickets. A status transition replaces the ticket’s one that has not gone out yet, and a ticket that goes back to an earlier column cancels the transition that had not gone out.

A card whose sync failed shows a ⚠. A click on it shows the reason (“Jira refuses these credentials (401)”, “Jira: no transition from “In progress” to “Done” for ATL-1294”…) and the “Resync” button.

- When the service can’t be reached, is down or overloaded, or refuses the credentials (which you can fix), the failure may pass later: Escouade tries again on its own, after 1, 5, 15, then 60 minutes, the last wait being repeated, for 24 hours from the first failure.
- A refusal that trying again would not change (a request refused as it is, a ticket gone, no transition to the status) is set aside at once, like anything that still fails after a day. It no longer holds back the ticket’s next changes.
- When Escouade starts, everything that was waiting goes again (except what was set aside).
- “Resync” sends again right away, set-aside changes included. When nothing is left to send, it gives the external ticket the status of its column again (without writing a comment twice). The ⚠ goes as soon as everything has gone through.

Deleting the ticket from the Kanban drops whatever was waiting for it.

## See also

- [The Kanban](board): the card of an imported ticket.
- [Integrations settings](settings-integrations): the complete list of settings.
- [The MCP server](mcp): a ticket’s external ticket is read with `get_ticket`.
