import { describe, expect, it } from 'vitest';
import { isAgentBranch, shortBranch } from './branches';

describe('agent branches', () => {
  it('are named escouade/…, or ccm/… for agents made before the rename', () => {
    expect(isAgentBranch('escouade/pagination')).toBe(true);
    expect(isAgentBranch('ccm/refacto-auth')).toBe(true);
    expect(isAgentBranch('origin/main')).toBe(false);
    expect(isAgentBranch('main')).toBe(false);
  });

  it('are named with the project’s own prefix when it sets one', () => {
    expect(isAgentBranch('gg/pagination', 'gg/')).toBe(true);
    expect(isAgentBranch('escouade/pagination', 'gg/')).toBe(true);
    expect(isAgentBranch('origin/main', 'gg/')).toBe(false);
    // No prefix: no branch tells by its name that it is an agent's.
    expect(isAgentBranch('pagination', '')).toBe(false);
  });

  it('show without their prefix', () => {
    expect(shortBranch('escouade/pagination')).toBe('pagination');
    expect(shortBranch('ccm/refacto-auth')).toBe('refacto-auth');
    expect(shortBranch('feature/x')).toBe('feature/x');
    expect(shortBranch('gg/pagination', 'gg/')).toBe('pagination');
    expect(shortBranch('escouade/pagination', 'gg/')).toBe('pagination');
    expect(shortBranch('pagination', '')).toBe('pagination');
  });
});
