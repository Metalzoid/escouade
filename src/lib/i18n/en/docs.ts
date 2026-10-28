import { defineZone } from '../types';

// The Docs tab (ESC-258): its spaces, the spec (map of the subjects, tree, page, import), sharing, the docs branch.
export default defineZone('docs', {
  tab: 'Docs',
  side: {
    spaces: 'Spaces',
    spacesLabel: 'Spaces of the docs',
  },
  spaces: { spec: 'Specification', decisions: 'Decisions', documents: 'Documents' },
  count: {
    gaps: { one: '{count} gap', other: '{count} gaps' },
    pages: { one: '{count} page', other: '{count} pages' },
    tickets: { one: '{count} ticket', other: '{count} tickets' },
    decisions: { one: '{count} decision', other: '{count} decisions' },
  },
  states: { ok: 'Up to date', draft: 'Draft' },

  spec: {
    upToDate: { one: '{n} page up to date', other: '{n} pages up to date' },
    gaps: { one: '{n} gap with the code', other: '{n} gaps with the code' },
    drafts: { one: '{n} draft', other: '{n} drafts' },
    compared: 'compared to the code {when}',
    neverCompared: 'not compared to the code yet',
    newPage: 'New page',
    treeLabel: 'Pages of the specification',
    mapLabel: 'Subjects of the specification',
    fold: 'Collapse {name}',
    unfold: 'Expand {name}',
    gapMark: 'gap',
    draftMark: 'draft',
    unsharedMark: 'to share',
    unsharedTip: 'Changed here, not shared with the team yet',
    openSubject: 'Open the subject {name}',
  },

  moved: {
    title: 'What changed',
    line: '{who} changed {what} · {when}',
    unshared: { one: '{count} page changed here, not shared yet', other: '{count} pages changed here, not shared yet' },
    none: 'The shared changes of the spec will show here.',
  },

  page: {
    back: 'Map of the subjects',
    edit: 'Edit',
    inEditor: 'Open in the editor',
    inEditorTip: 'Open the page’s file in Escouade’s editor',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Page saved: it is part of the changes to share.',
    titleField: 'Title of the page',
    bodyField: 'Text of the page, in Markdown',
    empty: 'This page is empty. “Edit” to write it.',
    gaps: { one: 'One gap with the code', other: '{count} gaps with the code' },
    openTicket: 'Open a ticket for the code',
    seeCode: 'See the code',
    noCode: 'The comparison didn’t say which files',
    ticketTitle: 'Align the code with the spec: {page}',
    ticketDescription:
      'The page “{page}” of the specification (.escouade/spec/{path}.md) and the code don’t say the same thing:\n\n{gap}\n\nFiles concerned: {files}',
    noFiles: 'to be found',
    sources: 'Sources',
    noSources: 'No source cited',
    tickets: 'Tickets',
    decisions: 'Decisions',
    compared: 'Compared to the code {when}',
    neverCompared: 'Not compared to the code yet',
    draft: 'Draft: not settled yet',
    notFound: 'This page is no longer in the specification.',
  },

  newPage: {
    title: 'New page',
    subject: 'Subject',
    subjectHint: 'Payment, Member area…',
    name: 'Title',
    nameHint: 'In instalments',
    create: 'Create the page',
    exists: 'The page “{path}” already exists.',
  },

  empty: {
    title: 'No specification yet',
    text: 'This project’s spec will live here, by subject, in .escouade/spec of the docs branch. Start with a page, or import the spec the project already has.',
    found: 'Escouade found a spec in this project:',
    file: '{path} · {size}',
    folder: { one: '{path} · {count} Markdown file', other: '{path} · {count} Markdown files' },
    look: 'See how it would be cut',
    firstPage: 'Write a first page',
  },

  import: {
    title: 'Import {path}',
    intro:
      'Escouade cuts the spec by its titles: a subject per main title, a page per section. Nothing is written before “Import”, and a page already there stays as it is.',
    lines: { one: '{count} line', other: '{count} lines' },
    exists: 'already there, kept',
    pageLabel: 'Import the page {name}',
    go: { one: 'Import {count} page', other: 'Import {count} pages' },
    done: { one: '{count} page imported into the specification.', other: '{count} pages imported into the specification.' },
    nothing: 'Nothing to import in this file.',
    loading: 'Cutting…',
  },

  share: {
    on: 'Docs on the branch {branch}',
    pending: { one: '{count} change to share', other: '{count} changes to share' },
    none: 'nothing to share',
    go: 'Share',
    withCodeTitle: 'Share the code too?',
    goAll: 'Share everything',
    going: 'Sharing…',
    tip: 'The changes of the docs (spec, decisions, documents) not shared with the team yet. “Share” first brings in what the others shared, then saves and sends the docs, and them alone.',
    done: { one: '{count} change of the docs shared.', other: '{count} changes of the docs shared.' },
    nothing: 'Nothing to share.',
    withCode: {
      one: 'This branch also has {count} commit of code not shared yet: “Share” would publish it with the docs. Share everything?',
      other: 'This branch also has {count} commits of code not shared yet: “Share” would publish them with the docs. Share everything?',
    },
    conflict: 'Two people changed the same pages: {files}.',
    resolve: 'The agent resolves',
    cancel: 'Cancel',
    resolving: 'The writer agent is resolving the conflict',
  },

  decisions: {
    empty: 'No decision yet.',
    states: { proposed: 'proposed', accepted: 'accepted', superseded: 'superseded' },
  },
  documents: {
    empty: 'No document yet.',
  },

  branch: {
    label: 'Docs branch',
    desc: 'Where the spec, the decisions and the documents live (.escouade/). The current branch: the spec follows the code of each branch. A fixed branch: Escouade keeps it in a worktree of its own and never merges it.',
    current: 'The current branch',
    fixed: 'A fixed branch',
    name: 'Name of the docs branch',
    currentAt: 'The docs follow the branch of each folder: the project’s, each agent’s.',
    fixedAt: 'The docs live on {branch}, in a worktree Escouade keeps.',
  },
});
