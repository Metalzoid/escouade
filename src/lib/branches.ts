/** Agents' worktree branches: `escouade/<name>`, or `ccm/<name>` for agents made before 0.1.4. */
const AGENT_BRANCH = /^(escouade|ccm)\//;

/** An agent's branch: the app's prefixes, or the project's own « Préfixe des branches des agents » `prefix`. */
export const isAgentBranch = (ref: string, prefix = '') => AGENT_BRANCH.test(ref) || (!!prefix && ref.startsWith(prefix));

/** An agent's branch without its prefix (the project's own `prefix`, or the app's). */
export const shortBranch = (ref: string, prefix = '') =>
  prefix && ref.startsWith(prefix) ? ref.slice(prefix.length) : ref.replace(AGENT_BRANCH, '');
