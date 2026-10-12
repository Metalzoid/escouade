import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// xterm.js has no place in jsdom: the terminals are counted, not drawn.
const terms = vi.hoisted(() => ({
  opened: [] as string[],
  mounted: [] as (string | null)[],
  disposed: [] as string[],
  held: new Set<string>(),
}));
vi.mock('../lib/terminals', () => ({
  openAgentTerminal: async (agentId: string) => {
    const id = `t${terms.opened.length + 1}`;
    terms.opened.push(agentId);
    terms.held.add(id);
    return { id, projectId: '', name: 'x', shell: 'claude' };
  },
  getXTerm: (id: string) => (terms.held.has(id) ? { fit: { fit() {} } } : undefined),
  mountTerminal: (id: string, el: HTMLElement | null) => terms.mounted.push(el ? id : null),
  disposeTerminal: (id: string) => {
    terms.disposed.push(id);
    terms.held.delete(id);
  },
}));

import { setLang } from '../lib/i18n';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import AgentTerminal from './AgentTerminal.svelte';

beforeEach(() => {
  terms.opened = [];
  terms.mounted = [];
  terms.disposed = [];
  terms.held.clear();
  setLang('fr');
});

describe('the agent in Claude Code’s interface', () => {
  it('starts its interface once and shows it', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    expect(terms.opened).toEqual([a.id]);
  });

  it('shows the one this window holds already rather than starting another', async () => {
    terms.held.add('t9');
    const a = agent({ terminal: true, terminalId: 't9' });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t9'));
    expect(terms.opened).toEqual([]);
  });

  it('offers to start it again once it stopped', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    app.exitedTerms['t1'] = 0;
    await userEvent.click(await screen.findByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(terms.mounted).toContain('t2'));
    expect(terms.disposed).toEqual(['t1']);
    expect(screen.queryByText('Claude Code s’est arrêté.')).toBeNull();
  });
});
