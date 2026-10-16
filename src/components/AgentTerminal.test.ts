import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The size of the place the interface is shown in, as `roomOf` measures it (jsdom has no layout).
interface Room {
  width: number;
  height: number;
}

// xterm.js has no place in jsdom: the terminals are counted, not drawn.
const terms = vi.hoisted(() => ({
  opened: [] as string[],
  /** The size each interface was started at (the `room` openAgentTerminal got). */
  rooms: [] as (Room | null | undefined)[],
  mounted: [] as (string | null)[],
  disposed: [] as string[],
  held: new Set<string>(),
  /** What `roomOf` measures, and the elements it was asked to measure. */
  room: null as Room | null,
  measured: [] as HTMLElement[],
  /** How many times a terminal was fitted to its box, and whether fitting it throws (a box that is hidden). */
  fits: 0,
  failFit: false,
}));
vi.mock('../lib/terminals', () => ({
  openAgentTerminal: async (agentId: string, room?: Room | null) => {
    const id = `t${terms.opened.length + 1}`;
    terms.opened.push(agentId);
    terms.rooms.push(room);
    terms.held.add(id);
    return { id, projectId: '', name: 'x', shell: 'claude' };
  },
  roomOf: (el: HTMLElement) => {
    terms.measured.push(el);
    return terms.room;
  },
  getXTerm: (id: string) =>
    terms.held.has(id)
      ? {
          fit: {
            fit() {
              terms.fits++;
              if (terms.failFit) throw new Error('not measurable');
            },
          },
        }
      : undefined,
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
  terms.rooms = [];
  terms.mounted = [];
  terms.disposed = [];
  terms.held.clear();
  terms.room = { width: 1124, height: 932 };
  terms.measured = [];
  terms.fits = 0;
  terms.failFit = false;
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

  it('starts it again when first asked from elsewhere, the count not there before', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    app.relaunched[a.id] = 1;
    await waitFor(() => expect(terms.mounted).toContain('t2'));
    expect(terms.disposed).toEqual(['t1']);
  });

  it('starts it again when asked from elsewhere (« Outils d’Escouade au prochain démarrage »), never at its first showing', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    // Asked before this view showed it: not asked of this one.
    app.relaunched[a.id] = 1;
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    expect(terms.opened).toEqual([a.id]);
    app.relaunched[a.id] = 2;
    await waitFor(() => expect(terms.mounted).toContain('t2'));
    expect(terms.disposed).toEqual(['t1']);
    expect(terms.opened).toEqual([a.id, a.id]);
  });
});

describe('the size Claude Code’s interface starts at', () => {
  /** The box the interface is shown in. */
  const box = () => document.querySelector('.box') as HTMLElement;

  it('is that of its box: the interface draws on the rows of its pseudo-console, so it starts at the size it will have', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    terms.room = { width: 1124, height: 932 };
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    expect(terms.rooms).toEqual([{ width: 1124, height: 932 }]);
    // It is the box that was measured, once: not some other element, and not again at each render.
    expect(terms.measured).toEqual([box()]);
  });

  it('starts all the same when its box has no size yet (not laid out, or hidden)', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    terms.room = null;
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    expect(terms.opened).toEqual([a.id]);
    expect(terms.rooms).toEqual([null]);
  });

  it('is measured again for the interface started again: the box may have another size by then', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    terms.room = { width: 800, height: 600 };
    app.exitedTerms['t1'] = 0;
    await userEvent.click(await screen.findByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(terms.mounted).toContain('t2'));
    expect(terms.rooms).toEqual([
      { width: 1124, height: 932 },
      { width: 800, height: 600 },
    ]);
  });

  it('is not asked for an interface this window holds already', async () => {
    terms.held.add('t9');
    const a = agent({ terminal: true, terminalId: 't9' });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t9'));
    expect(terms.rooms).toEqual([]);
  });
});

describe('the interface following its box', () => {
  /** The observers the component made, with what they watch; `fire` is the WebView telling the box changed. */
  const observers: FakeObserver[] = [];
  class FakeObserver {
    targets: Element[] = [];
    disconnected = false;
    constructor(private callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(el: Element) {
      this.targets.push(el);
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
    /** A disconnected observer reports nothing, as in a browser. */
    fire() {
      if (!this.disconnected) this.callback([], this as unknown as ResizeObserver);
    }
  }

  beforeEach(() => {
    observers.length = 0;
    // The setup’s observer watches nothing: this one can be set off by hand.
    vi.stubGlobal('ResizeObserver', FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function shown() {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    const view = render(AgentTerminal, { agent: a });
    await waitFor(() => expect(terms.mounted).toContain('t1'));
    return view;
  }

  it('watches its box, once the interface is shown in it', async () => {
    await shown();
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([document.querySelector('.box')]);
    // Nothing is fitted before the box changes: the interface started at its size.
    expect(terms.fits).toBe(0);
  });

  it('fits the interface when the box takes its size after it was shown, once for each change', async () => {
    await shown();
    observers[0].fire();
    expect(terms.fits).toBe(1);
    observers[0].fire();
    observers[0].fire();
    expect(terms.fits).toBe(3);
  });

  it('stops watching the box when the view goes: no fit after', async () => {
    const view = await shown();
    observers[0].fire();
    expect(terms.fits).toBe(1);
    view.unmount();
    expect(observers[0].disconnected).toBe(true);
    observers[0].fire();
    expect(terms.fits).toBe(1);
    expect(terms.mounted.at(-1)).toBeNull();
  });

  it('does not stop for a box it cannot measure (hidden), nor for an interface that is gone', async () => {
    await shown();
    terms.failFit = true;
    expect(() => observers[0].fire()).not.toThrow();
    terms.failFit = false;
    terms.held.delete('t1');
    expect(() => observers[0].fire()).not.toThrow();
    // Gone: nothing to fit, so the one count of the failed attempt is all there is.
    expect(terms.fits).toBe(1);
  });
});
