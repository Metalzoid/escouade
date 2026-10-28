# The code index

Escouade sorts a project’s code into symbols and links, so that its agents find what they look for in one call, faster and for fewer tokens than by reading whole files.

## What it saves

Without an index, an agent searches with grep, then reads the files it found, often whole. With the index, it asks in one call:

- where a symbol is (function, method, class, type, field, Markdown heading), with its signature and doc;
- the context of a task: the entry points and the related symbols, with their excerpts;
- the callers and the callees of a function;
- what a change would touch.

Each answer says what it saved: the tokens of the files it draws on, read whole, against its own. The [statistics](stats) add them up per project.

The languages read: Rust, TypeScript, JavaScript, Svelte, Python, Go, Java, C#, PHP and Markdown.

## Turning it on

The index is **off by default**. Escouade offers it:

- when a project is added, at the last step of the “New project” assistant (**Index the code**);
- in **Settings › Projects › Code index** (**Index this project**), at any time.

Once on, the project is read once, then kept up to date without a file watcher: at each question of the agents (every 3 seconds at most), on commits, branch changes and the ends of turns. The setting says what it holds: its files, its symbols, its size and when it was read. Turning it off erases the index.

The agents’ worktrees are not indexed whole: the index of the base branch serves them all, and each worktree only adds what differs from it.

## Nothing leaves the machine

The index is computed on your machine and kept in [Escouade’s folder](data), never in the repository nor in an online service. Only the agents get excerpts of it, as they already get code. Files git ignores are not read.

## Private projects

The index of a [private project](mcp#private-projects) serves its own agents alone: those of the other projects never reach it, by name or by id. What its fence refuses is never read nor indexed; when another project sits inside its folder, the setting names it: “Left out of the index: …”. Likewise, an open project that holds a private project inside its folder leaves it out of its index.

## Search by meaning

Besides the words, a project’s [shared memory](shared-memory) and docs are searched by meaning, with a small multilingual model (multilingual-e5-base, MIT license) that runs on your machine. It is downloaded once for every project, from **Settings › Projects › Code index › Search by meaning** (282 MB):

- a gauge shows how far the download is, and **Cancel** stops it;
- what came is kept: **Resume** goes on from there;
- the file is checked by its SHA-256 and goes through the proxy of the [network settings](settings-network);
- **Delete** removes it; the search then goes by the words alone.

Once the model is downloaded, nothing leaves the machine any more.

## What the agents see

The agents go through five tools of the [MCP server](mcp), the same for [every harness](harness): `index_search`, `index_context`, `index_callers`, `index_callees` and `index_impact`. In the Claude Code and Codex views, a search aimed at a symbol gets a line saying the index answers it in one call; elsewhere, it is a rule of their instructions. A text search is never blocked.

## What it saved

The [statistics](stats) have a **Code index savings** part, over the period chosen: per project, the number of answers of the index, the tokens saved and their worth in dollars. The dollars are an estimate: the tokens saved at the input price of the model each agent ran on.
