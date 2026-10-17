import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { menu } from '../../lib/menu.svelte';
import { app } from '../../lib/state.svelte';
import type { Account, Agent, EngineDecl, TurnItem } from '../../lib/types';
import { agent, BARE_ENGINE, CLAUDE_ENGINE, fakeBackend, resetApp, usageOf } from '../../test/ipc';
import TurnCard from './TurnCard.svelte';

// « Continuer sur <harness> » (ESC-88) on the card of a turn stopped by the usage limit, and « Revenir sur <harness> ».

const NOW = new Date(2026, 9, 10, 14, 0).getTime();
const CODEX: EngineDecl = { ...BARE_ENGINE, id: 'codex', name: 'Codex', speaker: 'Codex' };
const OPENCODE: EngineDecl = { ...BARE_ENGINE, id: 'opencode', name: 'OpenCode', speaker: 'OpenCode' };

const PRINCIPAL: Account = { id: 'principal', name: 'Principal', configDir: '', claudePath: '', active: true };
const PRO: Account = { id: 'pro', name: 'Pro', configDir: 'C:\\claude\\pro', claudePath: '', active: true };
const codex = (over: Partial<Account> = {}): Account => ({
  id: 'principal-codex',
  name: 'Principal',
  configDir: '',
  claudePath: '',
  active: true,
  engine: 'codex',
  ...over,
});
const OPENCODE_ACCOUNT: Account = {
  id: 'principal-opencode',
  name: 'Principal',
  configDir: '',
  claudePath: '',
  active: true,
  engine: 'opencode',
};

const turn = (over: Partial<TurnItem> = {}): TurnItem => ({
  kind: 'turn',
  id: 'r1',
  ts: 1,
  durationMs: 100,
  cost: 0,
  tokens: 0,
  isError: true,
  interrupted: false,
  error: "You've hit your limit · resets 3pm",
  limited: true,
  engine: 'claude',
  ...over,
});

/** An agent of the project p1 stopped by the usage limit, with these accounts and harnesses found. */
function stopped(accounts: Account[], over: Partial<Agent> = {}, engines: EngineDecl[] = [CLAUDE_ENGINE, CODEX]) {
  resetApp();
  app.now = NOW;
  app.engines = engines;
  app.enginesFound = engines.map((e) => e.id);
  app.settings.accounts = accounts;
  app.settings.engineOrder = engines.map((e) => e.id);
  app.settings.quotaPause = 90;
  return agent({ status: 'error', account: 'principal', resumeAt: NOW + 3_600_000, ...over });
}

const button = (name: string) => screen.queryByRole('button', { name });

describe('TurnCard, going on on another harness', () => {
  beforeEach(() => {
    resetApp();
    menu.close();
    setLang('fr');
  });

  it('offers « Continuer sur Codex » once every Claude account serving the project is spent, and asks the backend', async () => {
    const backend = fakeBackend({ continue_on_engine: () => null });
    // Pro is past the threshold: no account of Claude Code to resume on.
    const a = stopped([PRINCIPAL, PRO, codex()]);
    app.usage.accounts = [usageOf('pro', { fiveHour: { pct: 95, resetsAt: NOW + 3_600_000 } })];
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(button('Reprendre sur Pro')).not.toBeInTheDocument();
    // Beside the wait for the reset, which stays (by default, nothing changes).
    expect(screen.getByText(/^Reprise automatique/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer sur Codex' }));
    expect(backend.called('continue_on_engine')[0].args).toEqual({ agentId: 'a1', engine: 'codex' });
  });

  it('offers no other harness while an account of its own harness can take the agent', () => {
    const a = stopped([PRINCIPAL, PRO, codex()]);
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(button('Reprendre sur Pro')).toBeInTheDocument();
    expect(button('Continuer sur Codex')).not.toBeInTheDocument();
  });

  it('offers none that serves another project only, nor one not found: the agent waits for the reset', () => {
    // Codex's only account is reserved to another project.
    const reserved = stopped([PRINCIPAL, codex({ projects: ['p2'] })]);
    const one = render(TurnCard, { item: turn(), agent: reserved, last: true });
    expect(button('Continuer sur Codex')).not.toBeInTheDocument();
    expect(screen.getByText(/^Reprise automatique/)).toBeInTheDocument();
    one.unmount();
    // Reserved to this one: offered.
    const own = stopped([PRINCIPAL, codex({ projects: ['p1'] })]);
    const two = render(TurnCard, { item: turn(), agent: own, last: true });
    expect(button('Continuer sur Codex')).toBeInTheDocument();
    two.unmount();
    // Codex not found on this machine.
    const absent = stopped([PRINCIPAL, codex()]);
    app.enginesFound = ['claude'];
    render(TurnCard, { item: turn(), agent: absent, last: true });
    expect(button('Continuer sur Codex')).not.toBeInTheDocument();
  });

  it('names the next harness in « Ordre des harness », with a menu for the others', async () => {
    const backend = fakeBackend({ continue_on_engine: () => null });
    const a = stopped([PRINCIPAL, codex(), OPENCODE_ACCOUNT], {}, [CLAUDE_ENGINE, CODEX, OPENCODE]);
    app.settings.engineOrder = ['claude', 'opencode', 'codex'];
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(button('Continuer sur OpenCode')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'Continuer sur un autre harness' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(more);
    expect(menu.open?.items.map((i) => i.label)).toEqual(['Continuer sur Codex']);
    menu.open?.items[0].onClick?.();
    await waitFor(() => expect(backend.called('continue_on_engine').at(-1)?.args).toEqual({ agentId: 'a1', engine: 'codex' }));
  });

  it('offers to go back to the harness left once its quota came back, never before, and never by itself', async () => {
    const backend = fakeBackend({ continue_on_engine: () => null });
    const left = { engine: 'claude' as const, account: 'principal', until: NOW + 60_000 };
    const a = stopped([PRINCIPAL, codex()], {
      engine: 'codex',
      account: 'principal-codex',
      status: 'done',
      resumeAt: null,
      handedFrom: left,
    });
    const done = turn({ isError: false, limited: false, error: null, engine: 'codex' });
    const { rerender } = render(TurnCard, { item: done, agent: a, last: true });
    expect(button('Revenir sur Claude Code')).not.toBeInTheDocument();
    app.now = NOW + 120_000;
    await rerender({ item: done, agent: a, last: true });
    await userEvent.click(screen.getByRole('button', { name: 'Revenir sur Claude Code' }));
    expect(backend.called('continue_on_engine')[0].args).toEqual({ agentId: 'a1', engine: 'claude' });
  });

  it('marks each turn with its harness once the conversation went from one to another', () => {
    const a = stopped([PRINCIPAL, codex()], { status: 'done', resumeAt: null });
    const sep = turn({ isError: false, limited: false, error: null, engine: 'codex' });
    const plain = render(TurnCard, { item: sep, agent: a, last: false });
    expect(screen.queryByText(/sur Codex/)).not.toBeInTheDocument();
    plain.unmount();
    render(TurnCard, { item: sep, agent: a, last: false, marked: true });
    expect(screen.getByText(/· sur Codex/)).toBeInTheDocument();
  });

  it('says it in English', async () => {
    setLang('en');
    const a = stopped([PRINCIPAL, codex()]);
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(screen.getByRole('button', { name: 'Continue on Codex' })).toBeInTheDocument();
  });
});
