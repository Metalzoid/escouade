// Everything the English page says. fr.ts says the same, key for key.
import type { Catalog } from './catalog';
import { DOWNLOAD } from './site';

export const en: Catalog = {
  meta: {
    title: 'Escouade — the cockpit for your Claude Code agents',
    description:
      'Escouade, the cockpit for your Claude Code agents: a free, open source Windows, macOS and Linux app to run several agents in parallel, in a single window, and hand them tickets, even from Jira, Trello or GitHub, that they carry through to the end.',
    locale: 'en_US',
  },

  header: {
    sections: 'Sections',
    video: 'Video',
    features: 'Features',
    install: 'Install',
    roadmap: 'Roadmap',
    faq: 'FAQ',
    github: 'GitHub',
    download: 'Download',
    language: 'Language',
  },

  anchors: { features: 'features', install: 'install', roadmap: 'roadmap' },

  hero: {
    line1: 'A squad of Claudes.',
    line2: 'A single window.',
    lede: 'All your Claude Code sessions in a single window: as many agents as you want, in parallel, and a signal as soon as one of them needs you.',
    download: 'Download for Windows, macOS and Linux',
    github: 'View on GitHub',
    meta: 'Version {version} · Windows 10 and 11, macOS 11 or later, Linux · Free and open source (MIT)',
    video: 'Watch the video',
  },

  spotlight: {
    title: 'The one that needs you comes to the front.',
    text: 'A question, a permission request, a finished task: the agent says so, and you answer without hunting for the terminal it is waiting in. Try it: answer e2e-tests.',
    points: [
      'Ctrl+J jumps to the next agent that is waiting',
      'The overview shows every agent, the waiting ones first',
      'A chime, a system notification, a blinking tab: you choose what notifies you',
    ],
  },

  video: { title: 'Escouade at work.' },

  features: {
    title: 'Inside the window.',
    lead: 'Each agent moves forward on its own. You keep the big picture and only step in when you need to.',
    items: {
      agents: {
        title: 'Projects in tabs, agents in parallel',
        text: 'One tab per project, and in each as many Claude Code agents as you like: each with its own conversation, model, effort and, if you want, its own git worktree. Status, tokens, cost and files touched, live.',
        alt: 'Escouade’s window: the projects in tabs, the list of agents and the conversation of one of them',
      },
      chat: {
        title: 'A real chat, or Claude Code’s own interface: your choice',
        text: 'Markdown, highlighted code, tool calls that unfold into a diff, questions and permission requests as cards you answer with a click. Prefer Claude Code’s interface? One button moves the agent there, in a terminal, without losing its session, and Escouade still follows it: notifications, cost, plan.',
        alt: 'A conversation: Claude’s reply in markdown, a tool call unfolded to its diff',
      },
      notifications: {
        title: 'You know when you’re needed',
        text: 'A question, a finished task: the tab and the card blink, a chime sounds, a system notification says what is asked. Ctrl+J jumps to the next agent that is waiting, and closing the window stops nothing.',
        alt: 'An agent waiting for an answer, its question and its card in the sidebar',
      },
      git: {
        title: 'Git in plain sight',
        text: 'Uncommitted files per agent, side-by-side diffs, the repository’s git graph. A commit written by the agent or a proposed message you review, then a merge or squash of a worktree into its branch.',
        alt: 'The half-and-half layout: the conversation, the uncommitted files and their diff side by side',
      },
      editeur: {
        title: 'An editor, without leaving the app',
        text: 'File tree, tabs, syntax highlighting and changed lines in the gutter. Ctrl+click goes to a definition without a language server, Ctrl+P opens a file by name, Ctrl+Shift+F searches every file.',
        alt: 'The built-in editor: the worktree’s file tree, tabs and the code with its changed lines',
      },
      tableau: {
        title: 'Tickets that agents pick up on their own',
        text: 'Each project’s Kanban: write a ticket and its acceptance criteria. Autopilot on, agents pick them up, each in its own worktree, and loop until every criterion is met.',
        alt: 'A project’s Kanban: two tickets in progress with their loop and criteria, and the finished tickets',
      },
      test: {
        title: 'Test each ticket in one click',
        text: 'A ticket moves to “To review”: “Test” shows you the agent’s test plan, starts its servers on their reserved ports and opens your browser on the feature.',
        alt: 'The “Test DEM-6” window: preparation, servers ready and address opened in the browser',
      },
      integrations: {
        title: 'Your Jira, Trello and GitHub tickets, in the Kanban',
        text: 'Link a source to your project, “Import”, tick: the tickets arrive with their acceptance criteria. Escouade keeps their status up to date and comments on the original ticket when it is ready for review, then done.',
        alt: 'The “Import tickets” window: three Jira tickets ticked, with their acceptance criteria detected',
      },
      lancement: {
        title: 'Launch your project in one click',
        text: 'The commands that run your project (front end, API, worker…), written by you or suggested by Claude, each in its own terminal with its live status. A crash shows right away, with its exit code.',
        alt: 'Three launch commands, one of them crashed, and the dev server’s log',
      },
      stats: {
        title: 'Tokens, cost, quotas: live',
        text: 'The status bar tracks your 5-hour quota, your weekly quota and the day’s cost, which climbs while Claude works. The breakdown by project, model, agent and ticket is in the statistics.',
        alt: 'The statistics page: tokens per day, cost by project and by model',
      },
      remote: {
        title: 'And from your phone',
        text: 'Turn on remote control for an agent: its session opens on claude.ai and in the Claude mobile app, and what you send from there also shows up in Escouade.',
        alt: 'A phone on claude.ai and Escouade showing the same conversation',
      },
    },
  },

  cards: [
    { title: 'Real terminals', text: 'PowerShell, Git Bash and WSL, with your shell’s autocompletion.' },
    { title: 'Usage limit? It resumes', text: 'An agent stopped by its usage limit resumes on its own as soon as your quota is back.' },
    { title: 'Always there', text: 'Window closed, Escouade stays in the notification area and resumes each session on restart.' },
    { title: 'Behind a proxy', text: 'HTTP(S) proxy for Claude, quotas, updates, integrations and, if you want, terminals.' },
    { title: 'Automatic updates', text: 'Signed, downloaded in the background, installed without a window when no agent is working.' },
    {
      title: 'From the keyboard',
      text: 'Ctrl+1…9 projects, Ctrl+N an agent, Ctrl+J the one that is waiting, Ctrl+K search, Esc interrupt.',
    },
  ],

  install: {
    title: 'Ready in three steps.',
    steps: [
      {
        title: 'Install Claude Code',
        text: 'Escouade drives the Claude Code on your machine: install it and sign in once, with your Claude subscription or an API key.',
        link: { label: 'Claude Code documentation', href: 'https://code.claude.com/docs/en/overview' },
      },
      {
        title: 'Install Escouade',
        text: 'The .exe for Windows 10 or 11 (with Git for Windows), the .dmg for macOS 11 or later, on an Apple Silicon or Intel Mac, the AppImage or the .deb for Linux (x86-64).',
        link: { label: 'Latest release', href: DOWNLOAD },
      },
      {
        title: 'Open a project',
        text: 'Pick a folder, create an agent and write your first request. The next ones come with Ctrl+N (⌘N on Mac).',
      },
    ],
  },

  roadmap: {
    title: 'What comes next.',
    lead: 'Escouade will soon drive more than Claude Code. No date promised: the work is planned in detail on GitHub.',
    next: 'Version {version} · in the works',
    items: [
      {
        title: 'Codex, Copilot CLI and OpenCode',
        text: 'Each agent runs on the engine you choose: Claude Code, OpenAI’s Codex, GitHub Copilot CLI or OpenCode. Same conversation, same cards, same Kanban, same worktrees.',
      },
      {
        title: 'One engine per project, agent or ticket',
        text: 'A default engine for each project, another one for an agent or a ticket, and the autopilot follows.',
      },
      {
        title: 'Each engine’s quotas',
        text: 'Codex’s quota windows and Copilot’s monthly credits in the status bar, and stats per engine.',
      },
    ],
    plan: 'The detailed plan (in French)',
    changelog: 'What is already out',
  },

  faq: {
    title: 'Frequently asked questions.',
    items: [
      {
        q: 'Is it free?',
        a: 'Yes, and open source, under the MIT license. Escouade uses your own Claude Code: your Claude subscription or your API key, with no middleman.',
      },
      {
        q: 'Where does my data go?',
        a: 'Nowhere: projects, conversations and statistics stay on your machine, in ~/.escouade/. The network is only used by Claude Code itself, to read your quotas, for updates and, if you connect them, for Jira, Trello or GitHub, where an imported ticket gets its status and comments.',
      },
      {
        q: 'What about my Jira, Trello or GitHub tokens?',
        a: 'They stay on your machine: in the system keychain (Windows Credential Manager, macOS Keychain), or on Linux in the integrations file of ~/.escouade/, and are only used for calls to those services. For GitHub, Escouade can also reuse the token from gh.',
      },
      {
        q: 'I prefer Claude Code’s interface. Can I keep it?',
        a: 'Yes. The “Claude Code view” button, in an agent’s header, runs it in Claude Code’s own interface, in a terminal: your / commands, your shortcuts, your dialogs. “Escouade view” brings it back to the chat without losing the session. A setting opens new agents in Claude Code’s interface straight away. Ticket agents, which the autopilot drives, stay in the chat.',
      },
      {
        q: 'Does it work on Mac or Linux?',
        a: 'Yes. On Mac: macOS 11 or later, Apple Silicon and Intel alike. On Linux (x86-64): the AppImage, which updates itself, or the .deb for Debian and Ubuntu.',
      },
      {
        q: 'Can autopilot use up my quota?',
        a: 'You choose how many agents work in parallel (from 1 to 6), how many loops each ticket gets at most, and at what percentage of your quotas autopilot pauses. Nothing starts while an agent is waiting for its usage limit to end, and a ticket that reaches its last loop moves to “To review” with “Partial goal”.',
      },
      {
        q: 'Do my .env files end up in commits?',
        a: 'No. The project files that git ignores (.env* by default) are copied into each agent’s worktree so the app can run there; when you approve a ticket, Escouade refuses to commit, push or merge them.',
      },
      {
        q: 'How do updates work?',
        a: 'The app checks for a new version every five minutes and downloads it in the background. It installs without an installer window, at the restart you choose, or on its own when no agent is working and everything is saved, after warning you 30 seconds ahead.',
      },
      {
        q: 'Is it an Anthropic product?',
        a: 'No. Escouade is an independent project, not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic.',
      },
    ],
  },

  close: { title: 'Launch your squad.' },

  footer: {
    github: 'GitHub',
    license: 'MIT license',
    note: 'Independent project, not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic.',
  },

  notFound: { title: 'Page not found', text: 'There is nothing at this address.', home: 'Back to the home page' },
  failure: { title: 'Something went wrong', home: 'Back to the home page' },

  demo: {
    status: { ready: 'Ready', running: 'Running', question: 'Question', done: 'Done', totest: 'To review' },
    agents: 'Agents',
    loop: 'loop {loop}/{max}',
    criteria: { one: '{count} of {total} criteria met', other: '{count} of {total} criteria met' },
    tokens: 'tok',
    running: '{count} running',
    waiting: '{count} waiting',
    done: { one: '{count} done', other: '{count} done' },
    today: 'Today ≈ {amount}',
    pause: 'Pause the demonstration',
    caption: 'Animated demonstration · made-up data',
    description:
      ': five Claude Code agents of the demo-api project work in parallel; one asks a question you can answer, and a ticket agent loops on its criteria until “To review”.',
  },

  squad: {
    names: { auth: 'refactor-auth', e2e: 'e2e-tests', docs: 'docs-api', login: 'fix-login' },
    ticketSlugs: ['paginate-users', 'filter-by-role', 'export-to-csv'],
    question: { text: 'Run the whole e2e suite (38 tests)?', options: ['Yes', 'Auth only'] },
    results: {
      files: { one: '{count} file changed', other: '{count} files changed' },
      tests: { one: '{count} test passed', other: '{count} tests passed' },
      met: 'Criteria met · ready for review',
    },
  },
};
