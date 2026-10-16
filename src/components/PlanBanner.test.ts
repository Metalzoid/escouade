import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../lib/i18n';
import { menu } from '../lib/menu.svelte';
import { readPref, writePref } from '../lib/prefs';
import { app } from '../lib/state.svelte';
import type { Agent, PlanState, PlanTask, SubAgent } from '../lib/types';
import '../test/pointer';
import { agent, resetApp, ticket } from '../test/ipc';
import ContextMenu from './ContextMenu.svelte';
import PlanBanner from './PlanBanner.svelte';

const task = (id: string, status: PlanTask['status'], over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  title: `Tâche ${id}`,
  status,
  ...over,
});
const sub = (id: string, over: Partial<SubAgent> = {}): SubAgent => ({
  id,
  title: `sous-agent ${id}`,
  status: 'running',
  background: false,
  tools: 0,
  startedAt: 1,
  ...over,
});
const planOf = (tasks: PlanTask[], over: Partial<PlanState> = {}): PlanState => ({
  source: 'tools',
  tasks,
  agents: [],
  launched: 0,
  workflows: [],
  bgTasks: [],
  ...over,
});
const agentOf = (tasks: PlanTask[], over: Partial<Agent> = {}, plan: Partial<PlanState> = {}) =>
  agent({ id: 'a1', status: 'running', plan: planOf(tasks, plan), ...over });

/** The tasks of the examples: two done, one under way, two to do. */
const FIVE = () => [
  task('1', 'done'),
  task('2', 'done'),
  task('3', 'inProgress', { steps: [1, 2] }),
  task('4', 'pending'),
  task('5', 'pending', { blockedBy: ['3', '4'] }),
];

// jsdom has no layout: the geometry the banner reads. The list is as tall as its inline height says (else 120); the
// messages that follow the banner take what is left of 520; a row is 40 high, one after the other.
const geometry = { list: 120, total: 520, row: 40 };
const listHeight = (el: HTMLElement) => parseInt(el.style.height) || geometry.list;
const saved: [string, PropertyDescriptor | undefined][] = [];
function defineLayout(name: string, get: (this: HTMLElement) => number) {
  saved.push([name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)]);
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get });
}

/** The banner, with an element after it as the messages of a conversation are. */
function show(a: Agent, opts: { tickets?: ReturnType<typeof ticket>[] } = {}) {
  resetApp({ agents: [a], tickets: opts.tickets ?? [] });
  const target = document.body.appendChild(document.createElement('div'));
  const next = target.appendChild(document.createElement('div'));
  next.className = 'next';
  const r = render(PlanBanner, { target, anchor: next, props: { agent: a } });
  return { ...r, a, next, container: target };
}
const list = () => document.querySelector<HTMLElement>('.list')!;
const rows = () => [...document.querySelectorAll<HTMLElement>('.list .row')];
const segs = () => [...document.querySelectorAll<HTMLElement>('.seg')];
const toggle = () => screen.getByRole('button', { name: /^Plan ?: / });
/** The name of the button of the stack of dots when several subagents run. */
const ANY = 'Ouvrir la conversation d’un sous-agent';
const grip = () => screen.getByRole('separator');
const setWindowHeight = (h: number) => Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: h });
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

beforeEach(() => {
  localStorage.clear();
  menu.close();
  setWindowHeight(900);
  Element.prototype.setPointerCapture = vi.fn();
  defineLayout('clientHeight', function () {
    if (this.classList.contains('list')) return listHeight(this);
    if (this.classList.contains('next')) {
      const l = document.querySelector<HTMLElement>('.list');
      return geometry.total - (l ? listHeight(l) : 0);
    }
    return 0;
  });
  defineLayout('offsetTop', function () {
    return this.classList.contains('row') ? [...this.parentElement!.children].indexOf(this) * geometry.row : 0;
  });
  defineLayout('offsetHeight', function () {
    return this.classList.contains('row') ? geometry.row : 0;
  });
});

afterEach(() => {
  for (const [name, d] of saved.splice(0)) {
    if (d) Object.defineProperty(HTMLElement.prototype, name, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
  vi.useRealTimers();
});

describe('PlanBanner', () => {
  describe('when it is there', () => {
    it('shows nothing for an agent without tasks or subagents running', () => {
      const { container } = show(agent({ id: 'a1' }));
      expect(container.querySelector('.plan')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows nothing for an empty task list, whatever the plan holds besides', () => {
      const { container } = show(
        agentOf([], {}, { source: 'plan', planFile: 'docs/p.md', title: 'Un plan', agents: [sub('s1', { status: 'done' })] }),
      );
      expect(container.querySelector('.plan')).toBeNull();
    });
  });

  describe('its head', () => {
    it('tells the plan, its title, its tasks done and how far it is', () => {
      show(agentOf(FIVE(), {}, { title: 'Refonte du hero' }));
      const head = toggle();
      expect(head).toHaveAccessibleName('Plan : Refonte du hero');
      expect(within(head).getByText('Plan')).toBeInTheDocument();
      expect(within(head).getByText('Refonte du hero')).toBeInTheDocument();
      expect(within(head).getByText('2/5 tâches')).toBeInTheDocument();
      // Two done, one half way: (100 + 100 + 50) / 5.
      expect(within(head).getByText('50 %')).toBeInTheDocument();
    });

    it('counts a single task in the singular', () => {
      show(agentOf([task('1', 'pending')]));
      expect(within(toggle()).getByText('0/1 tâche')).toBeInTheDocument();
    });

    it('names itself after the plan, else the ticket of the agent, else the agent', () => {
      const t1 = ticket({ id: 't1', agentId: 'a1', column: 'doing', title: 'Ajouter le fichier' });
      const { unmount } = show(agentOf([task('1', 'pending')], { name: 'refacto-auth' }, { title: 'Le plan' }), { tickets: [t1] });
      expect(toggle()).toHaveAccessibleName('Plan : Le plan');
      unmount();
      const { unmount: next } = show(agentOf([task('1', 'pending')], { name: 'refacto-auth' }), { tickets: [t1] });
      expect(toggle()).toHaveAccessibleName('Plan : Ajouter le fichier');
      next();
      show(agentOf([task('1', 'pending')], { name: 'refacto-auth' }));
      expect(toggle()).toHaveAccessibleName('Plan : refacto-auth');
    });

    it('names the plan file in the tooltip of the title when the tasks come from it, and only then', () => {
      const { unmount } = show(
        agentOf([task('1', 'pending')], {}, { title: 'Le plan', source: 'plan', planFile: 'docs/superpowers/plans/x.md' }),
      );
      const title = within(toggle()).getByText('Le plan');
      expect(title.getAttribute('data-tip')).toContain('Plan : docs/superpowers/plans/x.md');
      expect(title.getAttribute('data-tip')).toContain('Le plan');
      unmount();
      show(agentOf([task('1', 'pending')], {}, { title: 'Le plan', source: 'tools', planFile: 'docs/superpowers/plans/x.md' }));
      expect(within(toggle()).getByText('Le plan')).toHaveAttribute('data-tip', 'Le plan');
    });

    it('shows the subagents running as a stack of dots, six at most, all in one button, and counts them', () => {
      const agents = Array.from({ length: 8 }, (_, i) => sub(`s${i}`, { title: `agent-${i}` }));
      agents.push(sub('gone', { title: 'fini', status: 'done' }));
      show(agentOf(FIVE(), {}, { agents }));
      const stack = screen.getByRole('button', { name: ANY });
      const dots = [...stack.querySelectorAll('.dot')];
      expect(dots).toHaveLength(6);
      // The circles are drawings: the button names them all, and holds no other button.
      expect(dots.every((d) => d.tagName === 'SPAN' && d.getAttribute('aria-hidden') === 'true')).toBe(true);
      expect(stack.querySelector('button')).toBeNull();
      // The count is beside the stack and the fold button, not in them.
      expect(screen.getByText('8 sous-agents actifs')).toBeInTheDocument();
      expect(stack).not.toHaveTextContent('sous-agents actifs');
      expect(toggle()).not.toHaveTextContent('sous-agents actifs');
    });

    it('says one subagent in the singular, and shows no stack when none runs', () => {
      const { unmount } = show(agentOf(FIVE(), {}, { agents: [sub('s1')] }));
      expect(screen.getByText('1 sous-agent actif')).toBeInTheDocument();
      expect(document.querySelectorAll('.subs button .dot')).toHaveLength(1);
      unmount();
      show(agentOf(FIVE(), {}, { agents: [sub('s1', { status: 'done' })], launched: 1 }));
      expect(document.querySelector('.subs')).toBeNull();
      expect(screen.queryByText(/sous-agent/)).toBeNull();
    });

    describe('the stack of dots of the subagents running', () => {
      const stackOf = () => document.querySelector<HTMLButtonElement>('.subs > button')!;
      const three = () => [
        sub('s1', { title: 'Explore', planTask: '3', model: 'haiku' }),
        sub('s2', { title: 'Revue' }),
        sub('s3', { title: 'Tests', status: 'done' }),
      ];
      const alone = () => [sub('s1', { title: 'Explore', planTask: '3' }), sub('s3', { title: 'Tests', status: 'done' })];
      /** The real menu, which the window draws once for all. */
      const withMenu = (a: Agent) => {
        const r = show(a);
        render(ContextMenu);
        app.ui.selectedAgent = { p1: 'a1' };
        return r;
      };

      it('is one button for all of them, outside the one that folds the banner: no button in a button', () => {
        show(agentOf(FIVE(), {}, { title: 'Le plan', agents: three() }));
        expect(document.querySelectorAll('.subs button')).toHaveLength(1);
        const stack = screen.getByRole('button', { name: ANY });
        expect(stack).toBe(stackOf());
        expect(stack).toHaveAttribute('type', 'button');
        expect(toggle().querySelector('button')).toBeNull();
        expect(toggle()).not.toContainElement(stack);
        // The fold button keeps its name, whatever runs beside it.
        expect(toggle()).toHaveAccessibleName('Plan : Le plan');
      });

      describe('with one subagent running', () => {
        it('is named after it, has its name for the tooltip and opens its conversation at once', async () => {
          show(agentOf(FIVE(), { id: 'a1' }, { agents: alone() }));
          app.ui.selectedAgent = { p1: 'a1' };
          const stack = screen.getByRole('button', { name: 'Ouvrir la conversation du sous-agent Explore' });
          expect(stack).toBe(stackOf());
          expect(stack).toHaveAttribute('data-tip', 'Explore');
          expect(stack).not.toHaveAttribute('aria-haspopup');
          // What the conversation looks for when the view of the subagent is left (Conversation.test.ts).
          expect(stack).toHaveAttribute('data-open-sub', 's1');
          expect(stack).toHaveAttribute('data-open-from', 'dots');
          await userEvent.click(stack);
          expect(menu.open).toBeNull();
          expect(app.subView.a1).toBe('s1');
          // The banner stays as it was.
          expect(toggle()).toHaveAttribute('aria-expanded', 'true');
          expect(list()).toBeInTheDocument();
        });

        it('opens it with Enter, reached from the keyboard after the button that folds', async () => {
          show(agentOf(FIVE(), { id: 'a1' }, { agents: alone() }));
          app.ui.selectedAgent = { p1: 'a1' };
          await userEvent.tab();
          expect(toggle()).toHaveFocus();
          await userEvent.tab();
          expect(stackOf()).toHaveFocus();
          await userEvent.keyboard('{Enter}');
          expect(app.subView.a1).toBe('s1');
          expect(app.subFocus.from).toMatchObject({ agentId: 'a1', call: 's1', opener: 'dots' });
          expect(app.subFocus.from?.el).toBe(stackOf());
        });
      });

      describe('with several running', () => {
        it('is named for any of them, with the same words for its tooltip, and offers a menu', () => {
          show(agentOf(FIVE(), {}, { agents: three() }));
          const stack = screen.getByRole('button', { name: ANY });
          expect(stack).toBe(stackOf());
          expect(stack).toHaveAttribute('data-tip', ANY);
          expect(stack).toHaveAttribute('aria-haspopup', 'menu');
          expect(stack).toHaveAttribute('data-open-from', 'dots');
          // It stands for no call in particular.
          expect(stack).not.toHaveAttribute('data-open-sub');
        });

        it('opens a menu of the subagents running, in the order of the plan, with their models, and opens none by itself', async () => {
          show(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
          app.ui.selectedAgent = { p1: 'a1' };
          await userEvent.click(screen.getByRole('button', { name: ANY }));
          // The one that ended is not in it.
          expect(menu.open?.items.map((i) => i.label)).toEqual(['Explore', 'Revue']);
          expect(menu.open?.items.map((i) => i.hint)).toEqual(['Haiku', undefined]);
          // Opened from an element: the focus goes into it, and comes back.
          expect(menu.open?.keyboard).toBe(true);
          expect(app.subView.a1).toBeFalsy();
        });

        it('lists those past the sixth dot too', async () => {
          const agents = Array.from({ length: 8 }, (_, i) => sub(`s${i}`, { title: `agent-${i}` }));
          show(agentOf(FIVE(), {}, { agents }));
          await userEvent.click(screen.getByRole('button', { name: ANY }));
          expect(menu.open?.items.map((i) => i.label)).toEqual(agents.map((s) => s.title));
          expect(stackOf().querySelectorAll('.dot')).toHaveLength(6);
        });

        it('opens the conversation of the entry chosen, one linked to a task or not, and does not fold the banner', async () => {
          withMenu(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
          await userEvent.click(screen.getByRole('button', { name: ANY }));
          const entries = await screen.findAllByRole('menuitem');
          expect(entries.map((e) => e.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Explore Haiku', 'Revue']);
          await userEvent.click(screen.getByRole('menuitem', { name: /^Revue/ }));
          await waitFor(() => expect(app.subView.a1).toBe('s2'));
          expect(menu.open).toBeNull();
          await userEvent.click(screen.getByRole('button', { name: ANY }));
          await userEvent.click(await screen.findByRole('menuitem', { name: /^Explore/ }));
          await waitFor(() => expect(app.subView.a1).toBe('s1'));
          expect(toggle()).toHaveAttribute('aria-expanded', 'true');
          expect(list()).toBeInTheDocument();
        });

        it('is worked from the keyboard, and the focus is on it again when the view of the subagent opens', async () => {
          withMenu(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
          await userEvent.tab();
          expect(toggle()).toHaveFocus();
          await userEvent.tab();
          expect(stackOf()).toHaveFocus();
          await userEvent.keyboard('{Enter}');
          await waitFor(() => expect(screen.getByRole('menuitem', { name: /^Explore/ })).toHaveFocus());
          await userEvent.keyboard('{ArrowDown}{Enter}');
          await waitFor(() => expect(app.subView.a1).toBe('s2'));
          // The place to come back to is the stack, which has the focus again by then, not the entry that went with the menu.
          expect(stackOf()).toHaveFocus();
          expect(app.subFocus.from?.el).toBe(stackOf());
          expect(app.subFocus.from).toMatchObject({ agentId: 'a1', call: 's2', opener: 'dots' });
        });

        it('is the place to come back to even when a click did not give it the focus (the web view of macOS)', async () => {
          withMenu(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
          await fireEvent.click(screen.getByRole('button', { name: ANY }));
          expect(stackOf()).not.toHaveFocus();
          await userEvent.click(await screen.findByRole('menuitem', { name: /^Revue/ }));
          await waitFor(() => expect(app.subView.a1).toBe('s2'));
          expect(app.subFocus.from?.el).toBe(stackOf());
          expect(app.subFocus.from?.opener).toBe('dots');
          expect(stackOf()).toHaveFocus();
        });

        it('closes on Escape without opening anything, the focus back on it', async () => {
          withMenu(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
          await userEvent.click(screen.getByRole('button', { name: ANY }));
          await waitFor(() => expect(screen.getByRole('menuitem', { name: /^Explore/ })).toHaveFocus());
          await userEvent.keyboard('{Escape}');
          expect(menu.open).toBeNull();
          await waitFor(() => expect(stackOf()).toHaveFocus());
          expect(app.subView.a1).toBeFalsy();
        });
      });

      it('stays while the banner is folded, and the button still folds and unfolds', async () => {
        show(agentOf(FIVE(), {}, { agents: three() }));
        await userEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        expect(document.querySelector('.list')).toBeNull();
        expect(stackOf().querySelectorAll('.dot')).toHaveLength(2);
        await userEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
        expect(list()).toBeInTheDocument();
      });

      it('follows the subagents that come and go: from several to one, the button opens that one', async () => {
        const { rerender } = show(agentOf(FIVE(), { id: 'a1' }, { agents: three() }));
        app.ui.selectedAgent = { p1: 'a1' };
        expect(stackOf()).toHaveAttribute('aria-haspopup', 'menu');
        await rerender({ agent: agentOf(FIVE(), { id: 'a1' }, { agents: alone() }) });
        expect(stackOf()).toHaveAccessibleName('Ouvrir la conversation du sous-agent Explore');
        expect(stackOf()).not.toHaveAttribute('aria-haspopup');
        await userEvent.click(stackOf());
        expect(app.subView.a1).toBe('s1');
      });

      it('is named in English', async () => {
        setLang('en');
        const { unmount } = show(agentOf(FIVE(), {}, { agents: alone() }));
        expect(stackOf()).toHaveAccessibleName('Open the conversation of the subagent Explore');
        unmount();
        show(agentOf(FIVE(), {}, { agents: three() }));
        expect(stackOf()).toHaveAccessibleName('Open the conversation of a subagent');
        expect(stackOf()).toHaveAttribute('data-tip', 'Open the conversation of a subagent');
        await userEvent.click(stackOf());
        expect(menu.open?.items.map((i) => [i.label, i.hint])).toEqual([
          ['Explore', 'Haiku'],
          ['Revue', undefined],
        ]);
      });
    });

    it('is a button that folds and unfolds the list', async () => {
      show(agentOf(FIVE()));
      const head = toggle();
      expect(head).toHaveAttribute('aria-expanded', 'true');
      expect(head).toHaveAttribute('aria-controls', list().id);
      expect(list().id).not.toBe('');
      await userEvent.click(head);
      expect(head).toHaveAttribute('aria-expanded', 'false');
      expect(document.querySelector('.list')).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
      expect(within(head).getByText('▸')).toHaveAttribute('aria-hidden', 'true');
      await userEvent.click(head);
      expect(head).toHaveAttribute('aria-expanded', 'true');
      expect(within(head).getByText('▾')).toBeInTheDocument();
    });

    it('is reached and used from the keyboard', async () => {
      show(agentOf(FIVE()));
      await userEvent.tab();
      expect(toggle()).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      await userEvent.keyboard(' ');
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('open or folded', () => {
    it('is open when the window is 800 px tall, folded under', () => {
      setWindowHeight(800);
      const { unmount } = show(agentOf(FIVE()));
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      unmount();
      setWindowHeight(799);
      show(agentOf(FIVE()));
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(document.querySelector('.list')).toBeNull();
    });

    it('follows the window growing, until the reader chooses', async () => {
      setWindowHeight(700);
      show(agentOf(FIVE()));
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      setWindowHeight(1000);
      await fireEvent(window, new Event('resize'));
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(toggle());
      setWindowHeight(1200);
      await fireEvent(window, new Event('resize'));
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    });

    it('is kept by agent, for the session', async () => {
      const a = agentOf(FIVE(), { id: 'a1' });
      const b = agentOf(FIVE(), { id: 'a2', name: 'autre' });
      const first = show(a);
      await userEvent.click(toggle());
      expect(app.planOpen).toEqual({ a1: false });
      first.unmount();
      // Another agent opens as the window says; the first one comes back as it was left.
      const second = render(PlanBanner, { agent: b });
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      second.unmount();
      render(PlanBanner, { agent: a });
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('its bar', () => {
    it('is one progress bar for the whole, with a segment for each task', () => {
      show(agentOf(FIVE()));
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '5');
      expect(bar).toHaveAttribute('aria-valuenow', '2');
      expect(bar).toHaveAttribute('aria-valuetext', '2/5 tâches');
      expect(bar).toHaveAccessibleName('Plan');
      expect(segs()).toHaveLength(5);
      expect(segs().every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
    });

    it('fills each segment by the state of its task, and makes no number up', () => {
      show(
        agentOf([task('1', 'done'), task('2', 'inProgress', { steps: [1, 4] }), task('3', 'inProgress'), task('4', 'pending')], {
          status: 'waiting',
        }),
      );
      const fills = segs().map((s) => ({
        state: [...s.classList].find((c) => ['done', 'run', 'block', 'todo'].includes(c)),
        fill: s.querySelector<HTMLElement>('.fill')!,
      }));
      // The first task under way is blocked: the agent waits for an answer.
      expect(fills.map((f) => f.state)).toEqual(['done', 'block', 'run', 'todo']);
      expect(fills[0].fill.style.width).toBe('100%');
      // Measured: as far as it is. Not measured: whole, but faint.
      expect(fills[1].fill.style.width).toBe('25%');
      expect(fills[1].fill).not.toHaveClass('unmeasured');
      expect(fills[2].fill.style.width).toBe('100%');
      expect(fills[2].fill).toHaveClass('unmeasured');
      // To do: faint and whole.
      expect(fills[3].fill.style.width).toBe('100%');
      expect(fills[3].fill).toHaveClass('faint');
    });

    it('moves with the plan', async () => {
      const a = agentOf(FIVE());
      const { rerender } = show(a);
      await rerender({
        agent: agentOf([task('1', 'done'), task('2', 'done'), task('3', 'done'), task('4', 'inProgress'), task('5', 'pending')]),
      });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
      expect(within(toggle()).getByText('3/5 tâches')).toBeInTheDocument();
      expect(within(toggle()).getByText('60 %')).toBeInTheDocument();
    });
  });

  describe('its list', () => {
    it('is a list of the tasks, in order, each with its rank', () => {
      show(agentOf(FIVE()));
      const ul = screen.getByRole('list', { name: 'Tâches du plan' });
      expect(ul).toBe(list());
      const items = within(ul).getAllByRole('listitem');
      expect(items).toHaveLength(5);
      expect(items.map((r) => r.querySelector('.n')?.textContent)).toEqual(['01', '02', '03', '04', '05']);
      expect(items.map((r) => r.querySelector('.rt')?.textContent)).toEqual(['Tâche 1', 'Tâche 2', 'Tâche 3', 'Tâche 4', 'Tâche 5']);
    });

    it('says the state of every task in words, before its title, and draws it', () => {
      show(agentOf([task('1', 'done'), task('2', 'inProgress'), task('3', 'pending'), task('4', 'inProgress')], { status: 'waiting' }));
      const [done, blocked, todo, run] = rows();
      expect(done.querySelector('.ico .sr')).toHaveTextContent('Terminé');
      expect(blocked.querySelector('.ico .sr')).toHaveTextContent('Bloqué');
      expect(todo.querySelector('.ico .sr')).toHaveTextContent('À faire');
      expect(run.querySelector('.ico .sr')).toHaveTextContent('En cours');
      // The word comes before the title in the page.
      for (const row of rows()) {
        const word = row.querySelector('.ico .sr')!;
        const title = row.querySelector('.rt')!;
        expect(word.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
      expect(done.querySelector('.ico')).toHaveTextContent('✓');
      expect(blocked.querySelector('.ico')).toHaveTextContent('!');
      expect(run.querySelector('.ico .spin')).not.toBeNull();
      expect(todo.querySelector('.ico .dash')).not.toBeNull();
      // The drawings are not read: the words are.
      expect(done.querySelector('.ico [aria-hidden="true"]')).not.toBeNull();
      expect(run.querySelector('.ico .spin')).toHaveAttribute('aria-hidden', 'true');
      expect(done).toHaveClass('done');
      expect(blocked).toHaveClass('block');
      expect(todo).toHaveClass('todo');
      expect(run).toHaveClass('run');
    });

    it('says how far each task is, and “En cours” rather than a made-up number for one nothing measures', () => {
      show(agentOf([task('1', 'done'), task('2', 'inProgress', { steps: [2, 3] }), task('3', 'inProgress'), task('4', 'pending')]));
      const pct = rows().map((r) => r.querySelector('.rpct')?.textContent);
      expect(pct).toEqual(['100 %', '67 %', 'En cours', '0 %']);
      expect(rows()[2]).not.toHaveTextContent('%');
      expect(rows()[1].querySelector('.rpct')).toHaveAttribute('data-tip', '2/3 étapes');
      // The bar of the row: as far as it is, or faint and whole.
      const bars = rows().map((r) => r.querySelector<HTMLElement>('.rfill')!);
      expect(bars.map((b) => b.style.width)).toEqual(['100%', '67%', '100%', '0%']);
      expect(bars[2]).toHaveClass('unmeasured');
    });

    it('says “En cours”, not “0 %”, for a task under way whose steps are none of them done yet', () => {
      show(agentOf([task('1', 'inProgress', { steps: [0, 2] }), task('2', 'pending')]));
      const row = rows()[0];
      expect(row.querySelector('.rpct')).toHaveTextContent('En cours');
      expect(row).not.toHaveTextContent('%');
      // The steps are still there for whoever points at it.
      expect(row.querySelector('.rpct')).toHaveAttribute('data-tip', '0/2 étapes');
      expect(row.querySelector('.rfill')).toHaveClass('unmeasured');
    });

    it('says a blocked task is blocked, whether it is measured or not', () => {
      show(agentOf([task('1', 'inProgress'), task('2', 'inProgress', { steps: [1, 4] })], { status: 'waiting' }));
      const [blocked, run] = rows();
      expect(blocked.querySelector('.rpct')).toHaveTextContent('Bloqué');
      expect(blocked.querySelector('.meta')).toHaveTextContent('En attente de ta réponse');
      expect(blocked.querySelector('.meta .wait')).not.toBeNull();
      expect(run.querySelector('.rpct')).toHaveTextContent('25 %');
    });

    it('blocks a task while the agent waits, and frees it once it does not', async () => {
      const a = agentOf([task('1', 'inProgress')], { status: 'waiting' });
      const { rerender } = show(a);
      expect(rows()[0]).toHaveClass('block');
      await rerender({ agent: { ...a, status: 'running' } });
      expect(rows()[0]).toHaveClass('run');
      expect(rows()[0]).not.toHaveTextContent('En attente de ta réponse');
    });

    it('names the subagent working on a task, its model, and what it does now', () => {
      const a = agentOf(
        [task('1', 'inProgress', { active: 'Lance les tests' }), task('2', 'inProgress', { active: 'Écrit la doc' })],
        {},
        {
          agents: [sub('s1', { title: 'visuel-produit', model: 'sonnet', planTask: '1', doing: 'Édite src/Hero.tsx' })],
        },
      );
      show(a);
      const [first, second] = rows();
      const tag = first.querySelector('.subtag')!;
      expect(tag).toHaveTextContent('↳ visuel-produit');
      expect(tag.querySelector('.model')).toHaveTextContent('Sonnet');
      expect(first.querySelector('.step')).toHaveTextContent('Édite src/Hero.tsx');
      // Another task has no tag: it says what the task itself says it does.
      expect(second.querySelector('.subtag')).toBeNull();
      expect(second.querySelector('.step')).toHaveTextContent('Écrit la doc');
    });

    it('opens the subagent’s conversation in place of the agent’s', async () => {
      const a = agentOf([task('1', 'inProgress')], { id: 'a1' }, { agents: [sub('s1', { title: 'visuel-produit', planTask: '1' })] });
      show(a);
      app.ui.selectedAgent = { p1: 'a1' };
      const tag = screen.getByRole('button', { name: /↳ visuel-produit/ });
      expect(tag).toHaveAttribute('data-tip', 'Ouvrir la conversation du sous-agent visuel-produit');
      await userEvent.click(tag);
      expect(app.subView.a1).toBe('s1');
    });

    it('names the model as Claude Code runs it', () => {
      const a = agentOf([task('1', 'inProgress')], {}, { agents: [sub('s1', { model: 'haiku', planTask: '1' })] });
      resetApp({ agents: [a] });
      app.models = [{ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }];
      render(PlanBanner, { agent: a });
      expect(rows()[0].querySelector('.subtag .model')).toHaveTextContent('Haiku 4.5');
    });

    it('leaves the model out when the call named none, and a subagent that ended', () => {
      const a = agentOf(
        [task('1', 'inProgress'), task('2', 'inProgress')],
        {},
        {
          agents: [sub('s1', { planTask: '1' }), sub('s2', { planTask: '2', status: 'done' })],
        },
      );
      show(a);
      expect(rows()[0].querySelector('.subtag')).toHaveTextContent('↳ sous-agent s1');
      expect(rows()[0].querySelector('.subtag .model')).toBeNull();
      expect(rows()[1].querySelector('.subtag')).toBeNull();
    });

    it('says which tasks a task to do waits for, by their ranks', () => {
      show(agentOf(FIVE()));
      const after = rows().map((r) => r.querySelector('.after')?.textContent ?? null);
      expect(after).toEqual([null, null, null, null, 'après 03, 04']);
    });

    it('does not say it once what a task waited for is done', () => {
      show(agentOf([task('1', 'done'), task('2', 'pending', { blockedBy: ['1'] })]));
      expect(document.querySelector('.after')).toBeNull();
    });

    it('shows the words of the agent as text: a title that is markup stays text', () => {
      const bad = '<img src=x onerror=alert(1)>';
      const a = agentOf(
        [task('1', 'inProgress', { title: bad, active: bad })],
        {},
        { title: bad, agents: [sub('s1', { title: bad, planTask: '1', doing: bad })] },
      );
      const { container } = show(a);
      expect(container.querySelector('img')).toBeNull();
      expect(within(toggle()).getByText(bad)).toBeInTheDocument();
      expect(rows()[0].querySelector('.rt')).toHaveTextContent(bad);
      expect(rows()[0].querySelector('.step')).toHaveTextContent(bad);
      expect(rows()[0].querySelector('.subtag')).toHaveTextContent(`↳ ${bad}`);
      expect(document.querySelector('.subs > button')).toHaveAttribute('data-tip', bad);
      expect(document.querySelector('.subs > button')).toHaveAccessibleName(`Ouvrir la conversation du sous-agent ${bad}`);
    });

    it('cuts a long title and keeps all of it for the tooltip', () => {
      const long = 'Un titre de tâche beaucoup trop long pour tenir sur une seule ligne de la liste du plan';
      show(agentOf([task('1', 'pending', { title: long })]));
      expect(rows()[0].querySelector('.rt')).toHaveAttribute('data-tip', long);
    });

    it('is as tall as it needs, at most its share of the window, unless the reader chose a height', () => {
      show(agentOf(FIVE()));
      expect(list().style.height).toBe('');
      expect(list()).not.toHaveClass('sized');
    });
  });

  describe('the row to look at', () => {
    it('is the first blocked, else the first under way, else the first to do', async () => {
      const a = agentOf(FIVE());
      const { rerender } = show(a);
      expect(rows().map((r) => r.classList.contains('focus'))).toEqual([false, false, true, false, false]);
      await rerender({
        agent: agentOf([task('1', 'done'), task('2', 'done'), task('3', 'done'), task('4', 'pending'), task('5', 'pending')]),
      });
      expect(rows().map((r) => r.classList.contains('focus'))).toEqual([false, false, false, true, false]);
      await rerender({ agent: agentOf([task('1', 'done'), task('2', 'done')]) });
      expect(rows().some((r) => r.classList.contains('focus'))).toBe(false);
      await rerender({ agent: agentOf([task('1', 'inProgress'), task('2', 'inProgress')], { status: 'waiting' }) });
      expect(rows().map((r) => r.classList.contains('focus'))).toEqual([true, false]);
    });

    it('is put in the middle of the list, by itself', async () => {
      // The third of five: 80 from the top, in a list of 120 with rows of 40.
      show(agentOf(FIVE()));
      await frame();
      expect(list().scrollTop).toBe(80 - (120 - 40) / 2);
    });

    it('is put in the middle again when it changes, but not for 6 seconds after the reader scrolled', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const four = () => [task('1', 'done'), task('2', 'done'), task('3', 'done'), task('4', 'inProgress'), task('5', 'pending')];
      const { rerender } = show(agentOf(FIVE()));
      await frame();
      expect(list().scrollTop).toBe(40);
      // The reader scrolls the list by hand.
      now += 2000;
      list().scrollTop = 7;
      await fireEvent.scroll(list());
      now += 5000;
      await rerender({ agent: agentOf(four()) });
      expect(list().scrollTop).toBe(7);
      // Over 6 seconds since the reader scrolled: the next change brings the list back to the row.
      now += 2000;
      await rerender({
        agent: agentOf([task('1', 'done'), task('2', 'done'), task('3', 'done'), task('4', 'done'), task('5', 'inProgress')]),
      });
      expect(list().scrollTop).toBe(160 - 40);
    });

    it('does not take its own scrolling for the reader’s', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const { rerender } = show(agentOf(FIVE()));
      await frame();
      // The scroll event of the move the banner made itself comes just after it.
      now += 100;
      await fireEvent.scroll(list());
      now += 500;
      await rerender({
        agent: agentOf([task('1', 'done'), task('2', 'done'), task('3', 'done'), task('4', 'inProgress'), task('5', 'pending')]),
      });
      expect(list().scrollTop).toBe(120 - 40);
    });

    it('is put in the middle at once for another agent, whenever the reader scrolled', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const { rerender } = show(agentOf(FIVE(), { id: 'a1' }));
      await frame();
      now += 5000;
      list().scrollTop = 5;
      await fireEvent.scroll(list());
      now += 1000;
      await rerender({
        agent: agentOf([task('a', 'done'), task('b', 'done'), task('c', 'done'), task('d', 'done'), task('e', 'inProgress')], { id: 'a2' }),
      });
      expect(list().scrollTop).toBe(160 - 40);
    });

    it('is put in the middle when the list is unfolded', async () => {
      setWindowHeight(700);
      show(agentOf(FIVE()));
      await userEvent.click(toggle());
      await frame();
      expect(list().scrollTop).toBe(40);
    });

    it('is put in the middle when the list is unfolded again, whenever the reader scrolled the one before', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      show(agentOf(FIVE()));
      await frame();
      now += 2000;
      list().scrollTop = 7;
      await fireEvent.scroll(list());
      // Folded and unfolded within the 6 seconds: it is another list, which nobody scrolled.
      now += 1000;
      await userEvent.click(toggle());
      await userEvent.click(toggle());
      await frame();
      expect(list().scrollTop).toBe(40);
    });

    it('is not held back on another agent by what the reader did on the one before', async () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const second = (focus: number) =>
        agentOf(
          ['a', 'b', 'c', 'd', 'e'].map((id, i) => task(id, i < focus ? 'done' : i === focus ? 'inProgress' : 'pending')),
          { id: 'a2' },
        );
      const { rerender } = show(agentOf(FIVE(), { id: 'a1' }));
      await frame();
      now += 2000;
      list().scrollTop = 5;
      await fireEvent.scroll(list());
      now += 1000;
      await rerender({ agent: second(2) });
      expect(list().scrollTop).toBe(40);
      // Two seconds after the switch, the second agent moves on: the list follows, nobody scrolled it.
      now += 2000;
      await rerender({ agent: second(4) });
      expect(list().scrollTop).toBe(160 - 40);
    });

    it('does not scroll to rows when none is to look at', async () => {
      show(agentOf([task('1', 'done'), task('2', 'done')]));
      await frame();
      expect(list().scrollTop).toBe(0);
    });
  });

  describe('its handle', () => {
    it('is a separator under the list, named and with a tooltip', () => {
      show(agentOf(FIVE()));
      const handle = grip();
      expect(handle).toHaveAccessibleName('Hauteur de la liste des tâches');
      expect(handle).toHaveAttribute('data-tip', 'Glisser pour redimensionner · double-clic pour réinitialiser');
      expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
      expect(handle).toHaveAttribute('tabindex', '0');
      expect(handle).toHaveAttribute('aria-valuemin', '60');
      // The messages keep 160: what the list can have is what both have, less 160.
      expect(handle).toHaveAttribute('aria-valuemax', String(geometry.total - 160));
      expect(handle).toHaveAttribute('aria-valuenow', '120');
    });

    it('sets the height of the list by dragging, and keeps it', async () => {
      show(agentOf(FIVE()));
      const handle = grip();
      await fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1, button: 0 });
      await fireEvent.pointerMove(handle, { clientY: 340, pointerId: 1, buttons: 1 });
      expect(list().style.height).toBe('160px');
      expect(list()).toHaveClass('sized');
      expect(readPref('planHeight')).toBeNull();
      await fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(readPref('planHeight')).toBe('160');
    });

    it('does not go under 60 px, nor leave the messages less than 160', async () => {
      show(agentOf(FIVE()));
      const handle = grip();
      await fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1, button: 0 });
      await fireEvent.pointerMove(handle, { clientY: -500, pointerId: 1, buttons: 1 });
      expect(list().style.height).toBe('60px');
      await fireEvent.pointerMove(handle, { clientY: 5000, pointerId: 1, buttons: 1 });
      expect(list().style.height).toBe(`${geometry.total - 160}px`);
      await fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(readPref('planHeight')).toBe(String(geometry.total - 160));
    });

    it('is moved with the arrows, by 16 px, and with Home and End', async () => {
      show(agentOf(FIVE()));
      grip().focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(list().style.height).toBe('136px');
      expect(readPref('planHeight')).toBe('136');
      expect(grip()).toHaveAttribute('aria-valuenow', '136');
      await userEvent.keyboard('{ArrowUp}{ArrowUp}');
      expect(list().style.height).toBe('104px');
      await userEvent.keyboard('{End}');
      expect(list().style.height).toBe(`${geometry.total - 160}px`);
      await userEvent.keyboard('{Home}');
      expect(list().style.height).toBe('60px');
      expect(readPref('planHeight')).toBe('60');
    });

    it('goes back to its natural height with a double click, Enter or Escape, and forgets the height', async () => {
      writePref('planHeight', '200');
      show(agentOf(FIVE()));
      expect(list().style.height).toBe('200px');
      await fireEvent.dblClick(grip());
      expect(list().style.height).toBe('');
      expect(list()).not.toHaveClass('sized');
      expect(readPref('planHeight')).toBeNull();
      grip().focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(readPref('planHeight')).toBe('136');
      await userEvent.keyboard('{Enter}');
      expect(list().style.height).toBe('');
      expect(readPref('planHeight')).toBeNull();
      await userEvent.keyboard('{ArrowDown}{Escape}');
      expect(list().style.height).toBe('');
      expect(readPref('planHeight')).toBeNull();
    });

    it('keeps the height the reader chose, for the agents that come after', () => {
      writePref('planHeight', '210');
      show(agentOf(FIVE()));
      expect(list().style.height).toBe('210px');
      expect(list()).toHaveClass('sized');
    });

    it.each(['', 'abc', '0', '-40', 'NaN'])('ignores a kept height that is %j', (kept) => {
      writePref('planHeight', kept);
      show(agentOf(FIVE()));
      expect(list().style.height).toBe('');
      expect(list()).not.toHaveClass('sized');
    });

    it('is there only while the list is', async () => {
      show(agentOf(FIVE()));
      expect(grip()).toBeInTheDocument();
      await userEvent.click(toggle());
      expect(screen.queryByRole('separator')).toBeNull();
    });
  });

  describe('with no task list but subagents running', () => {
    it('shows who works, and no list, no bar, no handle', () => {
      show(agentOf([], {}, { agents: [sub('s1', { title: 'Explore' }), sub('s2', { title: 'Revue' })], launched: 3 }));
      const head = screen.getByText('Sous-agents').closest('.head')!;
      expect(head).toHaveTextContent('2 sous-agents actifs');
      // The dots are drawn as they are under a plan, in one button.
      expect(head.querySelectorAll('.subs > button > .dot')).toHaveLength(2);
      expect(head).not.toHaveTextContent('tâche');
      expect(head).not.toHaveTextContent('%');
      // No fold button: the stack of dots is the only button.
      expect(screen.queryByRole('button', { name: /^Plan ?: / })).toBeNull();
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([ANY]);
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
    });

    it('opens the conversation of a subagent from its stack of dots: at once for one, from a menu for several', async () => {
      const { unmount } = show(agentOf([], { id: 'a1' }, { agents: [sub('s1', { title: 'Explore' })] }));
      app.ui.selectedAgent = { p1: 'a1' };
      const alone = screen.getByRole('button', { name: 'Ouvrir la conversation du sous-agent Explore' });
      expect(alone).toHaveAttribute('data-tip', 'Explore');
      await userEvent.click(alone);
      expect(app.subView.a1).toBe('s1');
      unmount();
      show(agentOf([], { id: 'a1' }, { agents: [sub('s1', { title: 'Explore' }), sub('s2', { title: 'Revue' })] }));
      render(ContextMenu);
      app.ui.selectedAgent = { p1: 'a1' };
      await userEvent.click(screen.getByRole('button', { name: ANY }));
      expect(app.subView.a1).toBeFalsy();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Revue' }));
      await waitFor(() => expect(app.subView.a1).toBe('s2'));
    });

    it('gives the agent’s name as the title, and goes when the subagents have ended', async () => {
      const a = agentOf([], { name: 'refacto-auth' }, { agents: [sub('s1')] });
      const { rerender, container } = show(a);
      expect(screen.getByText('refacto-auth')).toBeInTheDocument();
      await rerender({ agent: agentOf([], { name: 'refacto-auth' }, { agents: [sub('s1', { status: 'done' })] }) });
      expect(container.querySelector('.plan')).toBeNull();
    });

    it('turns into the plan when a task comes', async () => {
      const a = agentOf([], {}, { agents: [sub('s1')] });
      const { rerender } = show(a);
      expect(screen.queryByRole('button', { name: /^Plan ?: / })).toBeNull();
      await rerender({ agent: agentOf([task('1', 'inProgress')], {}, { agents: [sub('s1')] }) });
      expect(toggle()).toBeInTheDocument();
      expect(screen.queryByText('Sous-agents')).toBeNull();
      expect(rows()).toHaveLength(1);
    });
  });

  describe('what a screen reader is told', () => {
    it('is one polite status, the tasks done, and not more often than every 2 seconds', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let now = 10_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const done = (n: number) => agentOf(FIVE().map((x, i) => ({ ...x, status: i < n ? ('done' as const) : ('pending' as const) })));
      const { rerender } = show(done(1));
      const status = screen.getByRole('status');
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveTextContent('1/5 tâches');
      // Changes that come in quick succession are not read one by one: the latest is, when the 2 seconds are over.
      now = 10_500;
      await rerender({ agent: done(2) });
      now = 11_000;
      await rerender({ agent: done(3) });
      expect(status).toHaveTextContent('1/5 tâches');
      now = 12_000;
      vi.advanceTimersByTime(1000);
      flushSync();
      expect(status).toHaveTextContent('3/5 tâches');
      // A change after a quiet time is read at once.
      now = 20_000;
      await rerender({ agent: done(4) });
      expect(status).toHaveTextContent('4/5 tâches');
    });

    it('says the subagents running when there are no tasks', () => {
      show(agentOf([], {}, { agents: [sub('s1'), sub('s2')] }));
      expect(screen.getByRole('status')).toHaveTextContent('2 sous-agents actifs');
    });
  });

  describe('in English', () => {
    it('words the head, the list and the handle, with the figures as English writes them', () => {
      setLang('en');
      show(
        agentOf(
          [...FIVE().slice(0, 4), task('5', 'pending', { blockedBy: ['4'] })],
          { status: 'waiting' },
          { title: 'Hero redesign', agents: [sub('s1', { planTask: '3', model: 'sonnet' })] },
        ),
      );
      expect(toggle()).toHaveAccessibleName('Plan: Hero redesign');
      expect(within(toggle()).getByText('2/5 tasks')).toBeInTheDocument();
      expect(within(toggle()).getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('1 subagent running')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Plan tasks' })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '2/5 tasks');
      const [, , blocked, , todo] = rows();
      expect(blocked.querySelector('.ico .sr')).toHaveTextContent('Blocked');
      expect(blocked).toHaveTextContent('Waiting for your answer');
      expect(blocked.querySelector('.subtag')).toHaveTextContent('↳ sous-agent s1');
      expect(todo.querySelector('.ico .sr')).toHaveTextContent('To do');
      expect(todo.querySelector('.after')).toHaveTextContent('after 04');
      expect(rows()[0].querySelector('.ico .sr')).toHaveTextContent('Done');
      expect(grip()).toHaveAccessibleName('Height of the task list');
      expect(grip()).toHaveAttribute('data-tip', 'Drag to resize · double-click to reset');
    });

    it('says “In progress” where a task under way has no number', () => {
      setLang('en');
      show(agentOf([task('1', 'inProgress', { steps: [1, 2] }), task('2', 'inProgress')]));
      expect(rows().map((r) => r.querySelector('.rpct')?.textContent)).toEqual(['50%', 'In progress']);
      expect(rows()[0].querySelector('.rpct')).toHaveAttribute('data-tip', '1/2 steps');
    });

    it('says one task and the plan file in English', () => {
      setLang('en');
      show(agentOf([task('1', 'pending')], {}, { title: 'Plan title', source: 'plan', planFile: 'docs/p.md' }));
      expect(within(toggle()).getByText('0/1 task')).toBeInTheDocument();
      expect(within(toggle()).getByText('Plan title').getAttribute('data-tip')).toContain('Plan: docs/p.md');
    });

    it('names the subagents when there is no task list', () => {
      setLang('en');
      show(agentOf([], {}, { agents: [sub('s1')] }));
      const head = screen.getByText('Subagents').closest('.head')!;
      expect(head).toHaveTextContent('1 subagent running');
    });

    it('follows a change of language while it is open', async () => {
      show(agentOf(FIVE(), {}, { title: 'Le plan', agents: [sub('s1')] }));
      expect(within(toggle()).getByText('2/5 tâches')).toBeInTheDocument();
      setLang('en');
      flushSync();
      expect(toggle()).toHaveAccessibleName('Plan: Le plan');
      expect(within(toggle()).getByText('2/5 tasks')).toBeInTheDocument();
      expect(screen.getByText('1 subagent running')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open the conversation of the subagent sous-agent s1' })).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Plan tasks' })).toBeInTheDocument();
      expect(rows()[0].querySelector('.ico .sr')).toHaveTextContent('Done');
      expect(grip()).toHaveAccessibleName('Height of the task list');
      setLang('fr');
      flushSync();
      expect(rows()[0].querySelector('.ico .sr')).toHaveTextContent('Terminé');
    });
  });

  describe('in a narrow conversation', () => {
    // jsdom applies no container query: the stylesheet is read for what it hides under 560 px.
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PlanBanner.svelte'), 'utf8');
    const narrow = source.slice(source.indexOf('@container (max-width: 560px)'), source.indexOf('@media (prefers-reduced-motion: reduce)'));

    it('hides the bar of a row and the count of subagents of a list, not the one of the banner that has no list', () => {
      expect(narrow).toContain('.rbar');
      // The count is hidden only in the head of a banner that has a list (the title needs the room there); in the banner of
      // subagents alone it is all there is to read.
      expect(narrow).toMatch(/\.head:not\(\.static\) \.subs/);
      const selectors = (narrow.match(/[^{}]+(?=\{)/g) ?? []).flatMap((list) => list.split(',').map((s) => s.trim()));
      expect(selectors).not.toContain('.subs');
    });
  });

  describe('motion', () => {
    // The stylesheet is the component’s own: what a reader who asked for less motion gets is read from it.
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'PlanBanner.svelte'), 'utf8');
    const reduced = source.slice(source.indexOf('@media (prefers-reduced-motion: reduce)'));

    it('stops the spinner, the growing of the bars and the smooth scrolling for a reader who asked for less motion', () => {
      expect(source).toContain('@media (prefers-reduced-motion: reduce)');
      expect(reduced).toMatch(/\.spin\s*\{[^}]*animation:\s*none/);
      expect(reduced).toMatch(/transition:\s*none/);
      expect(reduced).toMatch(/scroll-behavior:\s*auto/);
    });

    it('moves them otherwise', () => {
      expect(source).toMatch(/\.spin\s*\{[^}]*animation:\s*ccSpin 0\.9s linear infinite/);
      expect(source).toMatch(/transition:\s*width 1s linear/);
      expect(source).toMatch(/scroll-behavior:\s*smooth/);
    });
  });
});
