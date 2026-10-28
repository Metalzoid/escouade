# The Docs space

The Docs tab holds the product’s specification, by subject, with what sets it apart from the code; its decisions and its documents. Everything lives in the repository, and you share it with the team in one click.

## The tab

The sidebar has three tabs: “Agents”, “Kanban” and “Docs”. Under “Docs”, three spaces:

- **Specification**: the pages of the spec, with the number of gaps with the code.
- **Decisions**: the register of the decisions on the product, numbered and dated.
- **Documents**: the files dropped for the project (requirements, minutes, mockups).

Everything is written under `.escouade/` of the [docs branch](#the-docs-branch): `.escouade/spec/<subject>/<page>.md`, `.escouade/decisions/`, `.escouade/documents/`. They are Markdown files you can also read and edit by hand.

## The specification

The space opens on **the map of the subjects**: a card per subject, with where it stands against the code.

- “Up to date”: the last comparison with the code found nothing.
- “1 gap”: a page of the subject says something else than the code.
- “Draft”: all its pages are still drafts.

Each card also says how many pages, tickets and decisions the subject has. The last card, “What changed”, gives the last shared changes of the spec, and the pages changed here, not shared yet. At the head of the space: the pages up to date, the gaps, the drafts, and when the spec was last compared to the code.

On the left, **the tree of the pages**, by subject as in a wiki: a click on a subject collapses or expands it, a click on a page opens it. A page marked “gap” says something else than the code; “to share”, it was changed here and not shared yet.

“New page” creates a page: a subject (“Payment”) and a title (“In instalments”). It opens ready to be written.

## A page

A page shows its Markdown text formatted and, beside it, its sources (the documents, files or links it comes from), its tickets and decisions, and when it was last compared to the code.

When the comparison found **gaps with the code**, they are at the top of the page, each with what differs and the files concerned:

- “Open a ticket for the code” opens the window of a new ticket, its title and description already written from the gap: the code is what must follow the spec.
- “See the code” opens the file the gap names in the [editor](editor).

“Edit” opens the page in a simple editor: its title and its text. “Save” writes the file, its header (sources, tickets, decisions, gaps) kept as it is. With the current branch, “Open in the editor” opens the page’s file in Escouade’s editor.

## Importing an existing spec

A project without a spec starts from an empty space. When Escouade finds a spec in the project (a `SPEC.md` at the root or in `docs/`, a `spec` or `specs` folder, a `docs/` folder of Markdown files), it offers it:

1. “See how it would be cut” shows how Escouade would cut it, by its titles: a subject per main title, a page per section; in a folder, a subject per file. A lone title at the top of the file, the document’s name, becomes the introduction’s title.
2. Untick the pages you don’t want.
3. “Import” writes the pages. Each one cites the file it comes from and keeps its place in the order of the original spec.

Nothing is written before “Import”, and a page that already exists stays as it is. The original file is neither changed nor removed: removing it from the repository is up to you.

## Sharing the docs

While the Docs tab is open, or while the docs have changes, the status bar says “Docs on the branch main · 2 changes to share”. The changes are the files of `.escouade/spec`, `decisions` and `documents` changed and not sent yet.

“Share” first brings in what the others shared, then saves (commits) the files of the docs, and them alone, and sends them (push). The code you change meanwhile is left alone.

- When the branch also has commits of code not sent yet, Escouade tells you first: “Share everything” sends them with the docs, “Cancel” does nothing.
- When two people changed the same pages, the status bar names them: “The agent resolves” hands the conflict to a writer agent, who keeps what each one meant; “Cancel” puts the docs back as they were. You share again once it is done.

> [!NOTE]
> Escouade never shares by itself: nothing is committed or pushed without a click on “Share”.

## The docs branch

Settings › Projects › Git, “Docs branch”:

- **The current branch** (by default): the docs live in the branch of each folder. Those of a ticket follow its branch and are merged with its code.
- **A fixed branch** (`docs`, for instance): the docs always live on that branch, which Escouade keeps in a worktree of its own, in its system folder. Escouade makes it when needed, from the remote branch when there is one, and never merges it anywhere: that is up to the team.
