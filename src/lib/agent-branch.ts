// The branch of the agent open, as the status bar shows it: the one git says its own folder is on (`GitInfo.agentGit`),
// else the project's folder's; whether the picker may switch its worktree, and its pull requests on that branch.

import { t } from './i18n';
import type { Agent, AgentGit, GitInfo, PullRequest } from './types';

/** The checkout of the agent's own folder (its worktree, or the one it went into by itself); null in the project's folder. */
export function agentGitOf(a: Agent | null | undefined, g: GitInfo | undefined): AgentGit | null {
  return (a && !a.archived && g?.agentGit?.[a.id]) || null;
}

/**
 * Why the picker can't switch the agent's folder to another branch: a ticket's agent (its board holds its branch), one of
 * several repositories, one in a worktree it went into by itself. Null for an ordinary agent in a worktree of Escouade's.
 */
export function switchRefusal(a: Agent): string | null {
  if (a.ticketId) return t('branches.agentSwitch.ticket');
  if (a.worktree?.repos?.length) return t('branches.agentSwitch.multi');
  if (!a.worktree) return t('branches.agentSwitch.found');
  return null;
}

/** Its pull requests of `branch`, the ones to merge first (the backend's order); of several repositories, each one's. */
export const branchPrs = (a: Agent, branch: string): PullRequest[] => a.prs.filter((p) => !!p.repo || p.head === branch);
