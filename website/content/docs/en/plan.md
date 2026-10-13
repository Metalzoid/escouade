# Plan progress

When an agent follows a task list or works with subagents, Escouade shows where it stands in a “Plan” banner above the conversation, and in a line on its card. This page explains where the list comes from, what the banner shows, and how to use it.

## When the banner appears

The “Plan” banner appears between the conversation header and the messages as soon as the agent has at least one task, or at least one subagent at work. There’s nothing to do to display it: the agent decides whether to keep a list, and Escouade only reads it.

## Where the tasks come from

Escouade never creates a task and never changes a plan file: it reads what the agent does. The list comes from one of these two sources.

- **Claude Code’s task list.** The agent keeps it with Claude Code’s task tools (`TodoWrite`, or `TaskCreate` and `TaskUpdate`). The “Agents keep a task list” setting (Settings › Claude Code, on by default) gives this tool to the agents started afterwards; the model doesn’t have to use it. See [the Claude Code settings](settings-claude-code).
- **A superpowers plan.** For an agent that has no task list, Escouade reads the plan the agent wrote in `docs/superpowers/plans/` (the `writing-plans`, `executing-plans`, and `subagent-driven-development` skills) and the progress ledger those skills keep in `.superpowers/sdd/`, to know which tasks are done. This reading only happens in the agent’s folder (its worktree, or the project) and changes nothing. If the agent also keeps its own list, that list is the list; the plan file then only gives its title and name.

The banner keeps at most 100 tasks.

## What the banner shows

At the top, a line sums up the plan:

- the “Plan” badge and the plan’s title: the plan file’s if there is one, otherwise the title of the agent’s ticket, otherwise the agent’s name;
- the subagents at work, as small dots followed by “3 subagents running” (see below);
- the count of finished tasks, “2/7 tasks”, and the percentage of the whole plan, “29%”;
- an arrow that folds and unfolds the list.

Below that line, a bar has one segment per task: full for a finished task, faded for a task to do, filled as far as its progress for a task in progress.

The list underneath gives one line per task, numbered (01, 02…):

| Element | What it says |
|---|---|
| Icon | ✓ for “Done”, a spinning circle for “In progress”, `!` for “Blocked”, a dash for “To do” |
| Title | The agent’s words, as they are |
| `↳ name` and the model | The subagent working on this task |
| Gray text | What the task is doing right now, in the agent’s words (the subagent’s last tool, otherwise the task’s own “in progress” form) |
| “after 03, 05” | For a task to do, the numbers of the tasks it waits for that aren’t finished |
| Bar and percentage | The task’s progress: 100% when it’s done, 0% when it’s to do. For a task in progress in a plan file, it’s computed from its ticked steps (hover over the percentage to see “2/3 steps”). While no step is ticked, or nothing counts them, the line shows the state’s word instead (“In progress”, “Blocked”). |

The list centers itself on the line to look at: the blocked task, otherwise the task in progress, otherwise the first one to do. If you scroll the list, it doesn’t re-center for six seconds.

## A blocked task

When the agent is waiting for an answer to a question or a permission (“Question” status), its first task in progress goes to “Blocked”: the icon is a `!` and the line says “Waiting for your answer”. The banner doesn’t know which task the question relates to: it picks the first one that is in progress. Answer the card in the conversation (see [the conversation](chat#questions-and-permissions)).

## Subagents

A subagent is an agent that Claude starts itself for part of the work. While it runs, it counts in “N subagents running” and has its dot in the banner’s header (up to six dots; hover over a dot to read the subagent’s title). If it works on a task of the list, the task’s line names it and says what it’s doing.

When an agent has **no** task list but subagents are running, the banner is called “Subagents”: it gives the title, the dots, and the count, with no list and no folding. It goes away when the last subagent has finished.

The detail of a subagent’s calls is read in the conversation, in the line of the `Agent` tool (see [the conversation](chat#tool-calls)).

## Folding, unfolding, resizing

- A click on the top line folds or unfolds the list. By default, it’s unfolded when the window is at least 800 px tall, folded otherwise. Your choice is kept for that agent until you close Escouade.
- A handle under the list can be dragged up or down to change its height; a double-click puts it back to the default height. The chosen height is used for all plans and is kept from one launch to the next. The messages always keep at least 160 px.

## The card’s line

In the sidebar, the card of an agent that has tasks shows a thin bar and “Plan 2/7” (or “Plan 2/7 · 3 subagents” when subagents are running). It lets you follow several agents at a glance, without opening their conversations. An agent that only has subagents, with no tasks, doesn’t have this line.

## When the plan goes away

When all the tasks are done and nothing is running, the banner stays displayed (“7/7 tasks”) until your next message: that message starts a new plan, and the banner starts over from zero with whatever the agent lists next. The banner also works when the agent runs in [the Claude Code view](claude-code-view).
