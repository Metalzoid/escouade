import { defineZone } from '../types';

// The shared memory of a project's agents (ESC-255): see the French catalog.
export default defineZone('memory', {
  settings: {
    title: 'Shared memory',
    note: 'The agents’ work notebook: what they learned about how to work in this project. Every harness reads and writes it through Escouade’s tools. It lives in {dir} of the project’s folder; Escouade never commits it.',
    empty: 'No memory yet: the agents will note some as they work on tickets.',
    count: { one: '{count} memory', other: '{count} memories' },
    forget: 'Forget',
    forgetLabel: 'Forget the memory {name}',
    forgotten: 'Memory “{name}” forgotten.',
    confirm: 'Confirm forgetting',
    unreadable: 'The memory can’t be read: {error}',
  },
  kinds: {
    feedback: 'Way of working',
    project: 'Project',
    reference: 'Reference',
    user: 'User',
  },
  claude: {
    title: 'Take over Claude Code’s memory?',
    body: 'Claude Code remembered things about this project. Tick the ones every agent of the project should know, whatever its harness: they will go into its shared memory. Nothing else is read or copied, and this question won’t come back.',
    replaces: 'Replaces the project’s',
    all: 'Tick all',
    none: 'Untick all',
    skip: 'Take nothing',
    take: { one: 'Take {count} memory', other: 'Take {count} memories' },
    takeNone: 'Take',
    taken: { one: '{count} memory taken into the shared memory.', other: '{count} memories taken into the shared memory.' },
    show: 'Show the text',
  },
});
