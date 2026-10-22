import { defineZone } from '../types';

// The pull requests of an ordinary agent (ESC-64): see the French catalog. `{word}`: « PR » or « MR » (GitLab).
export default defineZone('prs', {
  open: 'Open a {word}…',
  openButton: 'Open a {word}',
  openHint: 'Pushes the branch {branch} and opens its {word}, with a proposed title and description.',
  see: 'View {word} #{number}',

  modal: {
    title: 'Open a {word} on {host}',
    scope: '{agent} · {head} → {base}',
    titleLabel: 'Title',
    bodyLabel: 'Description',
    baseLabel: 'Target branch',
    draft: 'As a draft',
    proposing: 'Writing the title and the description…',
    fallback: 'The model for written texts didn’t answer: title and description taken from the commits.',
    uncommitted: {
      one: '{count} uncommitted file of the worktree won’t be in the {word}.',
      other: '{count} uncommitted files of the worktree won’t be in the {word}.',
    },
    regenerate: 'Propose again',
    submit: 'Push and open',
    opening: 'Opening…',
    opened: '{word} #{number} opened.',
  },

  state: {
    open: 'open',
    draft: 'draft',
    merged: 'merged',
    closed: 'closed',
  },
  checks: {
    pending: 'CI running',
    success: 'CI passed',
    failure: 'CI failed',
    skipped: 'CI skipped',
    none: 'no CI',
  },
  approvals: { one: '{count} approval', other: '{count} approvals' },
  changesRequested: 'changes requested',
  threads: { one: '{count} open thread', other: '{count} open threads' },
  conflict: 'conflicts with {base}',
  tipHead: '{word} #{number} · {title}',
  chipLabel: 'Open {word} #{number} in the browser ({state})',
  group: 'Pull requests of {name}',

  fixChecks: 'Agent fixes it',
  fixChecksHint: 'Sends {agent} the failed checks of {word} #{number}, with the end of their logs.',
  fixReviews: 'Agent addresses the feedback',
  fixReviewsHint: 'Sends {agent} the requested changes and the unresolved threads of {word} #{number}.',
  fixSent: 'Sent to {agent}.',
});
