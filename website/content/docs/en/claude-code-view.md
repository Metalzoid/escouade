# The Claude Code view

The Claude Code view runs an agent in Claude Code’s own interface, in a terminal, and brings it back to Escouade’s conversation without losing the session. This page explains how to switch views, what Escouade keeps tracking, and what changes.

## What it’s for

Escouade’s conversation shows the essentials of an agent’s work, but not everything Claude Code offers. In its own interface, you get all of it: `/` commands, shortcuts, dialogs, `/model`, `Shift+Tab` to change mode… It’s useful when you want to work the way you would in a terminal, while keeping the agent in Escouade’s list with its statuses, notifications, and cost.

## Switching views

In an agent’s conversation header, the “Claude Code view” button (`>_`) launches Claude Code’s interface in a terminal that takes the place of the conversation. The button becomes “Escouade view” (`◧`): a click takes you back to the conversation. The menu of the agent’s card in the sidebar (right click) offers the same: “Claude Code view” or “Escouade view”. The session is the same in both directions: Escouade stops the process of one view and resumes the session in the other (`--resume`), so the agent forgets nothing. The choice is kept for each agent. The interface starts when you show the agent (the terminal then says “Starting Claude Code…”), including after Escouade restarts, and picks up its session.

Switching to the Claude Code view is refused in three cases, with a message; switching back to the Escouade view is refused in none of them:

- **The agent is still working**: switch views once its turn is over.
- **Remote control is on**: turn it off first. In Claude Code’s interface, its `/remote-control` command does it (see [remote control](remote-control)).
- **The agent works on a ticket**: a ticket agent stays in Escouade’s view, which its board drives (see [the Kanban](board)). Neither the button nor the entry of its card’s menu exists for it, nor for an archived agent.

If the interface stops (you typed `/exit`, or the process was killed), the terminal shows “Claude Code stopped.” and a “Restart” button; if it doesn’t start, “Claude Code didn’t start:” followed by the error, with the same button. Archiving or deleting the agent also closes its terminal.

## What Escouade keeps tracking

Claude Code’s interface is a terminal, but Escouade still knows what the agent does. It reads it in two ways: Claude Code’s hooks, which the interface calls on your machine (`127.0.0.1`, with a token of its own for each interface), and the session’s transcript, which the app rereads continuously. Your own hooks stay active.

Thanks to this, an agent in the Claude Code view keeps:

- **its dot and its statuses**: “Running”, “Question” when it’s waiting for a permission or an answer, “Done” at the end of a turn;
- **its notifications**: the blinking, the chime, and the system notification when it’s waiting for a permission or an answer, then when it finishes (see [notifications](notifications));
- **its conversation**: what happens in the interface is also written to Escouade’s conversation, which you find again when you return to the “Escouade view”;
- **search** (`Ctrl+K`, see [keeping track of your agents](overview#searching-conversations));
- **the “Plan” banner** (see [plan progress](plan));
- **its subagents**: their list in the sidebar and, read-only, their conversation (see [below](#subagents));
- **its statistics and its cost** (see [statistics](stats)). The interface doesn’t give the cost of each turn: Escouade estimates it from public prices.

When the agent is waiting for an answer, you give it in the terminal: the [overview](overview) reminds you (“Waiting for your answer in Claude Code’s interface”) and its “Reply” button opens the agent.

## Subagents

The subagents of an agent in the Claude Code view are listed as elsewhere, under its card in the sidebar and in the “Plan” banner (see [subagents in the sidebar](plan#subagents-in-the-sidebar)). A click on one opens its conversation in place of the terminal; the breadcrumb, or `Esc`, takes you back to the agent.

This conversation is **read-only**. Escouade reads it in the transcript Claude Code keeps for this subagent, next to the agent’s: it’s read when the view opens, read again every 2 seconds while the subagent runs, then one last time when it finishes. The view says so at the top (“Read-only: its transcript, as Claude Code writes it. This subagent is acted on in Claude Code’s own interface.”). There’s no “Stop” and no “Write to it”: to stop a subagent or write to it, use Claude Code’s interface, in the terminal. If Escouade can’t find that transcript (Claude Code hasn’t written it yet, or keeps it elsewhere), the view says “No message from this subagent yet.”

In this view, no signal tells Escouade that a background subagent has finished. It works it out from what Claude Code replays to the agent in its transcript: the report the subagent hands back to it, or the notification of its end. Until that message has arrived, the subagent’s line stays “Running”. Its report is the one it handed back to the agent.

## Writing to an agent in this view

Escouade’s message field isn’t shown: you write in the terminal, as in Claude Code. To attach an image, such as a copied screenshot, paste it into the terminal (`Ctrl+V`, `Cmd+V` on macOS): Escouade saves it to a file and types its path, which Claude Code takes for the image (“[Image #1]”). Pasted text is typed as it is.

A message sent to the agent from elsewhere, for example through the [MCP server](mcp), is typed into its interface. It’s refused while the agent is waiting for an answer in its terminal (“The agent is waiting for an answer in its terminal: answer there first.”). An interruption requested from Escouade becomes the `Esc` key in the interface.

## Opening new agents in this view

In Settings › Claude Code, group “New agents”, the “Open new agents in Claude Code’s interface” switch (off by default) makes each new agent start in this view. Each agent can then switch views from its header. Ticket agents always stay in Escouade’s view. See [the Claude Code settings](settings-claude-code).

## Folder trust

The first time Claude Code’s interface launches in a folder, it asks whether you trust it. Escouade never answers for you. Worktrees created in the project’s default worktrees folder (`.claude/worktrees`) inherit the answer given for the project. A “Worktrees folder” outside the project doesn’t inherit it: the interface asks the question the first time each worktree is launched (see [worktrees](worktrees)).

## On Windows with WSL

When Claude Code is installed in WSL, Escouade launches it through `wsl.exe` (see [the Claude Code settings](settings-claude-code)). Live tracking of the Claude Code view then requires WSL’s mirrored networking: without it, the interface’s hooks don’t reach the app. The settings point it out under the `claude` path (“WSL’s network is NAT…”). To switch to mirrored mode, add this to `%UserProfile%\.wslconfig`, then run `wsl --shutdown`:

```ini
[wsl2]
networkingMode=mirrored
```
