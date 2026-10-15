# The MCP server

Escouade’s MCP server lets Claude (in a terminal, in another tool, or as an Escouade agent) read your projects, agents, and tickets, create, edit, and start tickets, and drive agents, including answering their requests, under the same guardrails as the autopilot.

## What it is for

MCP (Model Context Protocol) is the protocol through which Claude Code calls tools. Escouade embeds an MCP server: once declared in Claude Code, it gives Claude the tools listed below.

- **Claude in a terminal**: you run `claude` wherever you like and talk to it about Escouade (“list the tickets to review in the api project”, “create a ticket to limit login attempts, then start it”).
- **Another tool** that speaks MCP can connect the same way (see [Token and network](#token-and-network)).
- **An Escouade agent**, of any project, with a token of its own (see [Escouade’s agents and the server](#escouade-s-agents-and-the-server)).

The server runs on your machine alone. It only serves to read and to give orders; it runs no command, merges nothing, and deletes nothing. It can answer an agent’s request on your behalf, but never with “Always allow”: a lasting permission rule stays your decision, in the window.

## Turning on “Claude and the agents can drive Escouade”

One switch gives the server to Claude outside Escouade and to the Escouade agents of every project.

1. Open Settings › Claude Code. The “Escouade in Claude” group has the “Claude and the agents can drive Escouade” switch.
2. Turn it on. It is saved at once, without “Save”: the declaration writes into the Claude Code config of each account, which “Cancel” could not undo.

Escouade then starts the server and declares it in Claude Code for each active account, with the command `claude mcp add --scope user --transport http escouade <address> --header "Authorization: Bearer <token>"`, run the way the account runs Claude Code (its executable, its configuration folder). The entry lands in the account’s `.claude.json` (`~/.claude.json` for “Main”). The tab says “Declared in Claude · Main account, Pro account”.

- An entry that is already up to date is left as it is. A different one (another port, another token) is replaced. An account added or reactivated later receives the declaration.
- If it fails for an account, the tab says so (“Not declared for the Pro account: …”) and shows the command to run by hand (“Run it by hand in PowerShell:”), written for PowerShell on Windows and for `sh` elsewhere. The token is masked on screen; “Copy the command” copies the real one.
- Turning the switch off changes the token at once, then removes the entry from every account. The agents already running lose the tools at once too (their tokens are forgotten): turned on again, the switch gives them back the next time their process starts (“Restart”). Deleting an account removes its own.
- If the server does not start, the tab says so (“The server did not start: …”).

Claude Code knows the server as `escouade`: its tools are called `mcp__escouade__<tool>` (for example `mcp__escouade__list_tickets`).

> [!NOTE]
> On Windows with Claude Code in WSL, Escouade’s MCP tools need WSL’s mirrored network: `networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`, then `wsl --shutdown`. Settings › Claude Code reminds you when WSL’s network is NAT.

## The tools

In the arguments, a project is named by its id or its name (any case), an agent by its id or its name, a ticket by its key (`ATL-12`, any case) or its id. Answers are JSON.

### Reading

These seven tools change nothing.

| Tool | Arguments | What it returns |
|---|---|---|
| `list_projects` | none | The projects, in the app’s order: id, name, folder, current git branch, number of agents (archived ones left out), and number of tickets in each column. |
| `list_agents` | `project` (optional) | The agents that are not archived, oldest first, of every project or of one: id, name, project, status (`idle`, `running`, `waiting`, `done`, or `error`), whether a question or a permission is waiting for your answer and how many, the key of their ticket, model, Claude account, and cost in dollars. |
| `list_tickets` | `project`, `column` (optional: `todo`, `doing`, `review`, or `done`) | A project’s tickets in the Kanban’s order: id, key, title, column, the keys of the tickets they wait for, their agent’s name, and why they are blocked. |
| `get_ticket` | `ticket` | A whole ticket: title, description, criteria (met or not, with the agent’s note), loops (the current one and the maximum), column, tickets it waits for, progress, and the external ticket it comes from (Jira, Trello, GitHub, or Linear). An Escouade agent may leave out `ticket` to read its own. |
| `get_usage` | none | Each Claude account’s quota: whether new agents start on it now, the use of its 5-hour and weekly windows (`pct` from 0 to 100, `resetsAt`), and why the autopilot holds the tickets back (`reason`: `fiveHour`, `week`, or `limit`), until when. |
| `get_agent_summary` | `agent`, `project` (optional) | An agent without its conversation: id, name, status, the ticket’s key, last message (2,000 characters at most; a longer message gives its start and its end), and the files it edited (the latest 100 at most), with the number and the type of the requests waiting for an answer. |
| `list_requests` | `agent` (optional), `project` (optional) | The questions and the permission requests waiting for your answer, of one agent, of one project, or of all, in the order they came: the agent and the key of its ticket, `request` (the id the two answering tools name), `type` (`permission`, `question`, or `plan` for a plan to approve), since when, the tool and what it acts on (the command, the file, the whole plan), everything Claude Code sent (the content of a file to write, the strings of an edit, the flags of a command), the reason, whether Claude Code would refuse it by default, and for a question its questions with their options and whether several may be picked. `cut` says whether a text was cut: the whole request is in the conversation. An agent in the Claude Code view has none here: its requests are in its terminal. |

### Acting

These tools do what you would do in the window, through the same functions: the window is told, external tickets follow, and the Kanban updates.

| Tool | Arguments | What it does |
|---|---|---|
| `create_ticket` | `project`, `title`, `description`, `criteria`, `after` | Creates a “To do” ticket at the bottom of the column. `criteria` is a list (two default criteria without it), `after` the tickets it waits for, by key or id. With the autopilot on, it starts as soon as a slot is free and its predecessors are done. Its description ends with “Created by `<author>` through Escouade”. |
| `update_ticket` | `ticket`, `title`, `description`, `criteria`, `after` | Edits a “To do” ticket, field by field: what is left out stays. `criteria` and `after` replace the whole list. A ticket that has already started cannot be edited, and a dependency that would make two tickets wait for each other is refused. If the title, description, or criteria change, the last line of the description becomes “Modified by `<author>` through Escouade”. |
| `move_ticket` | `ticket`, `position` (`top`, `bottom`, or `before`), `before` | Puts a “To do” ticket at the top, at the bottom, or just before another “To do” ticket of the project (`before`). Returns the column’s keys in their new order. |
| `start_ticket` | `ticket` | Starts a “To do” ticket as the “Start” button does: its agent starts as soon as a slot is free. Answers once the ticket is queued; follow it with `get_ticket`. |
| `create_agent` | `project`, `message`, `worktree`, `model` | Creates an agent in a project, with its first message, without changing the agent you are looking at. `worktree` (true or false) says whether it works in a worktree of its own, otherwise the project decides; `model` is named as in Claude Code (`sonnet`, `opus`, `haiku`…). Returns the agent’s id and name. |
| `send_message` | `agent`, `project`, `text` | Writes to an agent. An agent at work reads the message after its current turn (the answer says `queued`). |
| `stop_agent` | `agent`, `project` | Interrupts an agent’s current turn, as the stop button of its conversation does. The agent stays, and can be sent a message afterward. |
| `answer_permission` | `agent`, `project`, `request`, `decision` (`allow` or `deny`), `message` | Answers an agent’s permission request as the “Allow” and “Deny” buttons of its card do, or approves (`allow`) or sends back (`deny`) its plan. `message`, with `deny`, tells the agent why, or what to do instead. “Always allow” is not offered (`always` is refused): a lasting rule stays your decision, in the window. The request’s card, in the agent’s conversation, says who answered (“Allowed by `<author>` through Escouade”), and the agent reads who refused. |
| `answer_question` | `agent`, `project`, `request`, `answers` | Answers an agent’s question as its question card does: for each question (`question`, its text, which can be left out when there is only one), the labels of the options picked (`choices`, several only when the question allows it) or a free text (`text`). Every question needs an answer. The card says “Answered by `<author>` through Escouade”, and the agent reads each answer followed by who gave it. |

A title is 200 characters at most, a description 10,000, and a ticket has 30 criteria of 500 characters at most. A ticket created by the server has the default number of loops, 5, and its own branch.

### Reserved to Escouade’s agents

These two tools are refused to Claude outside Escouade.

| Tool | Arguments | What it does |
|---|---|---|
| `report_progress` | `line` | Publishes a status line of 120 characters at most, about what the agent is doing. It shows under its name in the sidebar and the overview, and on the card of its “In progress” ticket, until its next call. An empty line clears it. |
| `split_ticket` | `tickets`, `chain` | Splits what remains of the agent’s ticket into ten “To do” tickets at most, after its own. With `chain` true (the default), each comes after the one before and the first after the agent’s ticket; false, all come after the agent’s ticket alone and may run in parallel. Refused to an agent without a ticket. Returns the keys of the tickets made. |

## The guardrails

The tools that act follow the rules of the window and of the autopilot:

- **Quota.** No ticket (`start_ticket`) or agent (`create_agent`) starts when no account is usable for the project: autopilot paused, quota window above the “Pause above quota” threshold, usage limit, an agent waiting for its reset. A single free account is enough. The refusal says until when (“The autopilot is paused until 14:30: the 5-hour window is 96% used. Try again then.”). `send_message` is refused when the agent’s account is held back that way (agents on another account can still take a message).
- **In parallel.** The project’s “In parallel” maximum of tickets is not exceeded by `start_ticket`, nor its maximum of agents working at once by `create_agent`.
- **Dependencies.** A ticket that comes after tickets that are not done is not started without them: the refusal says which ones, and `update_ticket` takes the dependencies off. A circular dependency is refused.
- **The Kanban.** `start_ticket` is refused when the project’s Kanban starts nothing for now (the target branch has no commit or is not found, no active account serves the project); the refusal says why.
- **Escouade’s agents** only act in their own project (they read the others), do not write to themselves, do not stop themselves, and do not answer their own requests. You do not write to an archived agent.
- **Answering a request.** Once “Claude and the agents can drive Escouade” is on, any client of the server sees the requests of every project and can answer them, Claude outside Escouade as well as the agents, with no extra setting; an agent only answers those of the agents of its own project, never its own. `answer_permission` only offers `allow` and `deny`: “Always allow” stays your decision, in the window. A request that no longer waits for an answer (you answered it in the window, another client did, or the agent no longer runs) is refused, and if two answers arrive at the same time, only one goes through. An agent in the Claude Code view has nothing to answer here: its requests are in its terminal.
- **No tool** runs a command or a test, merges, or deletes (a project, an agent, or a ticket). An agent pushed by booby-trapped content cannot use them to escalate its rights. The exception is answering the agents’ requests: with the switch on, an agent can allow, one request at a time and never for good, what another agent of its project asks.
- **What comes from the server is never taken for you.** A message sent to an agent (`send_message`, the first message of `create_agent`) is read by the agent and shown in its conversation under “Message from `<author>`:”, the author being the name of the agent sending it or “Claude (outside Escouade)”. A ticket created or split by the server ends with “Created by `<author>` through Escouade”, a ticket it modified with “Modified by `<author>` through Escouade”, on its card as in its agent’s protocol. The card of a request the server answered says who did (“Allowed by `<author>` through Escouade”, “Denied by `<author>` through Escouade”, “Answered by `<author>` through Escouade”), and a refusal, like each answer to a question, tells Claude who it comes from, not that it is you (“Refused by `<author>` through Escouade”, “SQLite (answer from `<author>` through Escouade)”).

A permission request for an Escouade tool names it in plain words (“Escouade · Create a ticket”, “Escouade · Start an agent”…) and shows what Claude gives it, one argument per line. A value of more than 2,000 characters is cut: the card says how many are not shown and points you to the conversation.

## Escouade’s agents and the server

The “Claude and the agents can drive Escouade” switch also serves Escouade’s agents, those of every project: there is nothing to allow in a project’s settings.

- **On**, each agent receives the server when its process starts, with a token of its own: it acts in its own name, never as Claude outside Escouade. It reads the tickets and the agents, and can create tickets or start other agents, which uses quota. It also sees the questions and permission requests of the agents of every project, and can answer those of the agents of its own project.
- **Off**, the agents already running lose the tools at once, and Escouade keeps its server away from every agent that starts, even when an `escouade` entry is left in your Claude Code config: its tools are refused, and the server itself is not loaded (Escouade starts the agent with Claude Code’s `deniedMcpServers` setting). The agent therefore gets neither the tools nor the server’s instructions.
- **An agent already running** when you turn the switch on keeps a process without the tools. Its conversation shows “Escouade’s tools at the next start” with “Restart”: its process stops and the next one resumes the same session: the conversation stays, a command running in the background stops. The button waits until it is done with what it is doing (its turn, your answer, the setup of its worktree, a subagent or a workflow in the background). In the Claude Code view, “Restart” starts its interface again. Settings › Claude Code says how many agents are in that case.
- It is not a partition: an agent only acts in its own project, but reads the others.

The server runs while the switch is on, and stops with the app.

> [!NOTE]
> Up to 1.7, each project had its own “Agents can use Escouade” switch (Settings › Projects › MCP server). It is gone: a project that had it on while “Claude can drive Escouade” was off no longer gives the server to its agents until you turn “Claude and the agents can drive Escouade” on.

In a conversation, a call to an Escouade tool carries the label “Escouade · ” followed by its name (“Escouade · Read a ticket”, “Escouade · Report progress”).

## MCP activity

Settings › Claude Code › “MCP activity” keeps the last 200 calls and refusals, the most recent first, updated live. Each line gives:

- the time (on hover, the date);
- the caller: the agent’s name, “Claude (outside Escouade)”, or “Unknown client” for a request refused before its token says where it comes from;
- the tool, and in short what it was asked (never a token);
- the result: “Done”, “Refused”, or “Error”, with the reason for the last two (shown in the alert color).

“Clear” empties the list. The log is not saved: it starts from zero the next time Escouade starts.

Also refused, and logged: a request without a token (“Request refused: no token”), with an unknown token, with an unexpected `Host` header, with an `Origin` header (a web page), or to a path other than the server’s.

## Token and network

- The server only listens on `127.0.0.1`, on a free port between 47000 and 47999, chosen at the first start and then kept (it only changes when its own is taken, and the declaration is then redone in every account).
- Every request carries a token, in the `Authorization: Bearer` header. Claude outside Escouade’s token is kept in the system keychain; when it refuses it, and on Linux, in `~/.escouade/mcp-token.json`, readable by you alone. It is also written in plain text in Claude Code’s config (`~/.claude.json` for “Main”). An agent’s token is its own, lives in memory and in a configuration file under `~/.escouade/mcp/` that the app removes when its process stops. An agent without the tools starts with `~/.escouade/mcp-refused.json`, which keeps the server out.
- A request sent by a web page (`Origin` header) or addressed to a name other than `127.0.0.1` or `localhost` is refused, even with a token: a site you visit cannot call the server.
- Another MCP client connects to `http://127.0.0.1:<port>/mcp` with the same header. The address and the token can be read in the account’s `.claude.json`, in the `escouade` entry, or in the command the tab offers when the declaration fails.

## See also

- [The autopilot](autopilot): the rules the tools take over.
- [The Kanban](board): the tickets the tools create and move.
- [Claude Code settings](settings-claude-code): where the switch is.
