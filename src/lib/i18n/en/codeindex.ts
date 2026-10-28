import type { Tree } from '../types';

// « Index du code » (ESC-254): its setting in the project's settings and in « Nouveau projet », the model of the search by
// meaning, and what it saved in the statistics.
export default {
  what: 'Agents find code faster and for fewer tokens: in one call they get the functions, their callers and what a change would touch, instead of reading whole files.',
  local:
    'Everything stays on this machine: the index is computed here and kept in Escouade’s folder, never in the repository; nothing is sent online.',
  privateNote:
    'Private project: its index serves its own agents alone; those of the other projects never reach it. Files git ignores are not read.',
  excluded: {
    one: 'Left out of the index: {list} (another project inside its folder).',
    other: 'Left out of the index: {list} (other projects inside its folder).',
  },
  settings: {
    title: 'Code index',
    on: 'Index this project',
    onDesc:
      'Off by default. On, the project is read once, then kept up to date on commits, branch changes and the ends of turns. Turning it off erases the index.',
    reading: 'Reading the project…',
    status: '{files} files · {symbols} symbols · {size} · read {when}',
    turnedOn: 'Code index on: {files} files read.',
    turnedOff: 'Code index off: its index is erased.',
  },
  vectors: {
    label: 'Search by meaning',
    desc: 'Besides the words, the shared memory and the docs are searched by meaning, with a small multilingual model ({model}, {license} license) that runs on this machine. One download of {size}, for every project; after that, nothing leaves the machine.',
    download: 'Download ({size})',
    resume: 'Resume ({pct}%)',
    cancel: 'Cancel',
    downloaded: 'Downloaded',
    delete: 'Delete',
    deleteTitle: 'Delete the model ({size}): the search goes by the words alone until the next download.',
    progress: 'Downloading the model',
  },
  wizard: {
    title: 'Index the code',
  },
  stats: {
    title: 'Code index savings',
    note: 'What the agents did not have to read: the files the index’s answers come from, less those answers. In dollars, at the input price of each agent’s model: an estimate.',
    project: 'Project',
    calls: 'Answers',
    tokens: 'Tokens saved',
    cost: 'Dollars saved',
    none: 'No answer from the index over the period.',
  },
} as const satisfies Tree;
