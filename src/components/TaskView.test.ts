import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanOutput } from '../lib/bgtasks';
import { setLang } from '../lib/i18n';
import { app } from '../lib/state.svelte';
import type { Agent, BgTask, PlanState, SubAgent, TaskOutput, WorkflowRun } from '../lib/types';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import TaskView from './TaskView.svelte';

const task = (over: Partial<BgTask> = {}): BgTask => ({
  id: 'b1',
  kind: 'command',
  title: 'Ticker',
  command: 'node ticker.js --every 1s',
  status: 'running',
  startedAt: 1_000,
  ...over,
});
const flow = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 'w1',
  name: 'review',
  title: 'Revue du diff',
  status: 'running',
  now: 'Phase 1 : lecteur A',
  tools: 4,
  tokens: 12_300,
  startedAt: 1_000,
  ...over,
});
const planOf = (bgTasks: BgTask[], workflows: WorkflowRun[] = [], agents: SubAgent[] = []): PlanState => ({
  source: null,
  tasks: [],
  agents,
  launched: agents.length,
  workflows,
  bgTasks,
});
const out = (output: string, over: Partial<TaskOutput> = {}): TaskOutput => ({
  output,
  totalBytes: output.length,
  truncated: false,
  source: 'process',
  ...over,
});

type Handlers = Record<string, (args: any) => unknown>;

/** The agent the app keeps (a change of its plan reaches the view), the view drawn for `task` and a backend that answers the reads of the output. */
function setup(over: Partial<Agent> = {}, handlers: Handlers = {}, at = 'b1') {
  const a = agent({ id: `t${Math.random()}`, status: 'running', alive: true, plan: planOf([task()]), ...over });
  resetApp({ projects: [project()], agents: [a] });
  app.ui.selectedAgent = { p1: a.id };
  app.taskView = { [a.id]: at };
  app.now = 61_000;
  const backend = fakeBackend({ task_output: () => out(''), ...handlers });
  const live = app.agents[a.id];
  const view = render(TaskView, { agent: live, task: at });
  return { a: live, backend, ...view };
}

const log = () => screen.getByRole('log');
const reads = (backend: ReturnType<typeof fakeBackend>) => backend.called('task_output');

afterEach(() => vi.useRealTimers());

describe('TaskView', () => {
  it('heads a command with the way back to its agent, what it is, its state, its duration, and shows its command', async () => {
    const { a } = setup();
    const crumbs = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(crumbs).toHaveTextContent(/^refacto-auth\s*Ticker$/);
    expect(within(crumbs).getByText('Ticker')).toHaveAttribute('aria-current', 'page');
    const facts = screen.getByRole('group', { name: 'Ticker' });
    expect(facts).toHaveTextContent(/Type\s*Commande en fond/);
    expect(facts).toHaveTextContent(/Durée\s*1m 00s/);
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('node ticker.js --every 1s')).toBeInTheDocument();
    // Back to the agent.
    await userEvent.click(within(crumbs).getByRole('button', { name: 'refacto-auth' }));
    expect(app.taskView[a.id]).toBeNull();
  });

  it('puts the focus on the breadcrumb when it opens, and goes back to the agent with Escape', async () => {
    const { a } = setup();
    expect(screen.getByText('Ticker', { selector: '.crumb' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(app.taskView[a.id]).toBeNull();
  });

  it('keeps Escape for a dialog that is open', async () => {
    const { a } = setup();
    app.modal = { kind: 'confirm', title: 'x', body: 'y', confirm: 'z', onConfirm: () => {} } as never;
    await userEvent.keyboard('{Escape}');
    expect(app.taskView[a.id]).toBe('b1');
  });

  describe('Escape while a field of the window has the focus', () => {
    // The view has no field of its own: this is the composer of the window, or a field of the side panel.
    const fields: HTMLElement[] = [];
    function field(tag: 'textarea' | 'input', value: string) {
      const el = document.createElement(tag);
      el.value = value;
      document.body.append(el);
      fields.push(el);
      el.focus();
      return el;
    }
    afterEach(() => fields.splice(0).forEach((f) => f.remove()));

    it.each(['textarea', 'input'] as const)('keeps a %s with text in it: the text is not lost to a key', async (tag) => {
      const { a } = setup();
      const el = field(tag, 'un message à moitié écrit');
      await userEvent.keyboard('{Escape}');
      expect(app.taskView[a.id]).toBe('b1');
      expect(el).toHaveFocus();
      expect(el.value).toBe('un message à moitié écrit');
    });

    it.each(['textarea', 'input'] as const)('goes back to the agent from an empty %s', async (tag) => {
      const { a } = setup();
      field(tag, '');
      await userEvent.keyboard('{Escape}');
      expect(app.taskView[a.id]).toBeNull();
    });

    it('goes back to the agent from a field with only blanks in it', async () => {
      const { a } = setup();
      field('textarea', '  \n ');
      await userEvent.keyboard('{Escape}');
      expect(app.taskView[a.id]).toBeNull();
    });

    it('goes back to the agent when the focus is on something that is not a field', async () => {
      const { a } = setup();
      const other = document.createElement('button');
      document.body.append(other);
      fields.push(other);
      other.focus();
      await userEvent.keyboard('{Escape}');
      expect(app.taskView[a.id]).toBeNull();
    });
  });

  it('counts the duration live while it runs, and stops counting once it ended', async () => {
    const { a } = setup();
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Durée\s*1m 00s/);
    app.now = 121_000;
    await waitFor(() => expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Durée\s*2m 00s/));
    a.plan = planOf([task({ status: 'done', endedAt: 31_000 })]);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Durée\s*0m 30s/));
    app.now = 999_000;
    await Promise.resolve();
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Durée\s*0m 30s/);
  });

  it('says how a command ended, with its exit code and what Claude Code said of it', () => {
    setup({
      plan: planOf([task({ status: 'failed', endedAt: 5_000, summary: 'Background command "Ticker" failed with exit code 3' })]),
    });
    expect(screen.getByText('En échec')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Code de sortie\s*3/);
    const summary = screen.getByRole('region', { name: 'Résumé' });
    expect(summary).toHaveTextContent('Background command "Ticker" failed with exit code 3');
  });

  it('has no exit code to give when Claude Code gave none, nor a summary while it runs', () => {
    setup({ plan: planOf([task({ summary: 'Background command "Ticker" completed (exit code 0)' })]) });
    expect(screen.queryByRole('region', { name: 'Résumé' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ticker' })).not.toHaveTextContent('Code de sortie');
  });

  it('does not repeat as a summary the description of a task that was stopped', () => {
    setup({ plan: planOf([task({ status: 'stopped', endedAt: 5_000, summary: 'Ticker' })]) });
    expect(screen.getByText('Arrêtée')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Résumé' })).not.toBeInTheDocument();
  });

  it('tells the states in words', () => {
    for (const [status, word] of [
      ['done', 'Terminée'],
      ['interrupted', 'Interrompue'],
    ] as const) {
      const { unmount } = setup({ plan: planOf([task({ status, endedAt: 5_000 })]) });
      expect(screen.getByText(word)).toBeInTheDocument();
      unmount();
    }
  });

  it('folds a long command to its first lines, and unfolds it', async () => {
    const command = Array.from({ length: 12 }, (_, i) => `echo ligne ${i}`).join('\n');
    setup({ plan: planOf([task({ command })]) });
    const more = screen.getByRole('button', { name: 'Voir toute la commande' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.cmd')).toHaveClass('folded');
    await userEvent.click(more);
    expect(more).toHaveAccessibleName('Réduire la commande');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.cmd')).not.toHaveClass('folded');
  });

  it('does not offer to unfold a short command', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Voir toute la commande' })).not.toBeInTheDocument();
  });

  it('shows the description of a task that has no command', () => {
    setup({ plan: planOf([task({ kind: 'monitor', command: undefined, title: 'Surveille les logs du serveur' })]) });
    expect(screen.getByText('Surveillance')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Commande', { selector: '.k' })).not.toBeInTheDocument();
  });

  it('says which subagent launched it', () => {
    const sub: SubAgent = {
      id: 'c1',
      title: 'Chercher la cause',
      status: 'running',
      background: true,
      tools: 0,
      startedAt: 1,
      taskId: 'ta',
    };
    setup({ plan: planOf([task({ parent: 'ta' })], [], [sub]) });
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Lancée par\s*Chercher la cause/);
  });

  it('says nothing of a launcher the plan does not list', () => {
    setup({ plan: planOf([task({ parent: 'zzz' })]) });
    expect(screen.getByRole('group', { name: 'Ticker' })).not.toHaveTextContent('Lancée par');
  });

  describe('a workflow', () => {
    const asFlow = (over: Partial<WorkflowRun> = {}) => setup({ plan: planOf([], [flow(over)]) }, {}, 'w1');

    it('says its phase, its tools and its tokens, and has no output to follow', async () => {
      const { backend } = asFlow();
      expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toHaveTextContent(/^refacto-auth\s*Revue du diff$/);
      const facts = screen.getByRole('group', { name: 'Revue du diff' });
      expect(facts).toHaveTextContent(/Type\s*Workflow/);
      expect(facts).toHaveTextContent(/Phase en cours\s*Phase 1 : lecteur A/);
      expect(facts).toHaveTextContent(/Outils\s*4/);
      expect(facts).toHaveTextContent(/Tokens\s*12,3 k/);
      expect(screen.queryByRole('log')).not.toBeInTheDocument();
      expect(screen.getByText('Pas de sortie à suivre pour ce type de tâche.')).toBeInTheDocument();
      await Promise.resolve();
      expect(reads(backend)).toHaveLength(0);
    });

    it('is stopped by its own id', async () => {
      const { a, backend } = asFlow();
      await userEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
      await waitFor(() => expect(backend.called('stop_bg_task')[0]?.args).toEqual({ id: a.id, task: 'w1' }));
    });

    it('has no stop button once it ended', () => {
      asFlow({ status: 'done', endedAt: 9_000 });
      expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    });
  });

  it('has no output to follow for a remote agent or a teammate either', async () => {
    for (const kind of ['remote', 'teammate'] as const) {
      const { backend, unmount } = setup({ plan: planOf([task({ kind, command: undefined })]) });
      expect(screen.queryByRole('log')).not.toBeInTheDocument();
      expect(screen.getByText('Pas de sortie à suivre pour ce type de tâche.')).toBeInTheDocument();
      expect(reads(backend)).toHaveLength(0);
      unmount();
    }
  });

  describe('its output', () => {
    it('is read as the view opens, in a read-only log that can be reached with the keyboard', async () => {
      const { a, backend } = setup({}, { task_output: () => out('tick 1\ntick 2\n') });
      await waitFor(() => expect(log()).toHaveTextContent(/tick 1\s*tick 2/));
      expect(reads(backend)[0].args).toEqual({ id: a.id, task: 'b1' });
      expect(log()).toHaveAttribute('tabindex', '0');
      expect(log()).toHaveAttribute('aria-live', 'off');
      expect(log()).toHaveAccessibleName('Sortie de Ticker, en lecture seule');
      expect(log().tagName).toBe('PRE');
      expect(log()).not.toHaveAttribute('contenteditable');
    });

    it('takes the escape sequences of a terminal out of what it shows', async () => {
      setup({}, { task_output: () => out('\u001b[32mvert\u001b[0m\r\nligne\r\n') });
      await waitFor(() => expect(log().textContent).toBe('vert\nligne\n'));
    });

    it('reads it again every 1,5 s while the task runs, and replaces what is shown each time', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      let n = 0;
      const { backend } = setup({}, { task_output: () => out(`lecture ${++n}\n`) });
      await vi.advanceTimersByTimeAsync(0);
      expect(reads(backend)).toHaveLength(1);
      expect(log().textContent).toBe('lecture 1\n');
      await vi.advanceTimersByTimeAsync(1_499);
      expect(reads(backend)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(reads(backend)).toHaveLength(2);
      // The tail of the output replaces the text: nothing is added to it.
      expect(log().textContent).toBe('lecture 2\n');
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reads(backend)).toHaveLength(4);
      expect(log().textContent).toBe('lecture 4\n');
    });

    it('does not stack a read on one that is not over', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const pending: ((o: TaskOutput) => void)[] = [];
      const { backend } = setup({}, { task_output: () => new Promise<TaskOutput>((resolve) => pending.push(resolve)) });
      await vi.advanceTimersByTimeAsync(0);
      expect(reads(backend)).toHaveLength(1);
      // Several ticks go by while the read is slow: none starts another.
      await vi.advanceTimersByTimeAsync(6_000);
      expect(reads(backend)).toHaveLength(1);
      pending[0](out('enfin'));
      await vi.advanceTimersByTimeAsync(0);
      expect(log().textContent).toBe('enfin');
      await vi.advanceTimersByTimeAsync(1_500);
      expect(reads(backend)).toHaveLength(2);
    });

    it('reads it one last time when the task ends, then no more', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      let n = 0;
      const { a, backend } = setup({}, { task_output: () => out(`lecture ${++n}`) });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reads(backend)).toHaveLength(3);
      a.plan = planOf([task({ status: 'done', endedAt: 4_000, summary: 'Background command "Ticker" completed (exit code 0)' })]);
      await vi.advanceTimersByTimeAsync(0);
      expect(reads(backend)).toHaveLength(4);
      expect(log().textContent).toBe('lecture 4');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(reads(backend)).toHaveLength(4);
    });

    it('does not lose that last read when the one before is still under way as the task ends', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const pending: ((o: TaskOutput) => void)[] = [];
      const { a, backend } = setup({}, { task_output: () => new Promise<TaskOutput>((resolve) => pending.push(resolve)) });
      await vi.advanceTimersByTimeAsync(0);
      a.plan = planOf([task({ status: 'done', endedAt: 4_000 })]);
      await vi.advanceTimersByTimeAsync(0);
      // Still one in flight: the last read waits for it, and then goes.
      expect(reads(backend)).toHaveLength(1);
      pending[0](out('milieu'));
      await vi.advanceTimersByTimeAsync(0);
      expect(reads(backend)).toHaveLength(2);
      pending[1](out('milieu\nfin'));
      await vi.advanceTimersByTimeAsync(0);
      expect(log().textContent).toBe('milieu\nfin');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reads(backend)).toHaveLength(2);
    });

    it('is read once for a task that ended already', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const { backend } = setup({ plan: planOf([task({ status: 'done', endedAt: 4_000 })]) }, { task_output: () => out('tout') });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reads(backend)).toHaveLength(1);
      expect(log().textContent).toBe('tout');
    });

    it('reads the output of the new task, and of no other, when the view is given another', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const plan = planOf([task({ id: 'b1', title: 'Un' }), task({ id: 'b2', title: 'Deux' })]);
      const { backend, rerender } = setup({ plan }, { task_output: (args: { task: string }) => out(`sortie de ${args.task}`) });
      await vi.advanceTimersByTimeAsync(0);
      expect(log().textContent).toBe('sortie de b1');
      await rerender({ task: 'b2' });
      await vi.advanceTimersByTimeAsync(0);
      expect(log().textContent).toBe('sortie de b2');
      const before = reads(backend).length;
      await vi.advanceTimersByTimeAsync(4_500);
      // Three more reads, all of the new task: the timer of the first is gone.
      expect(
        reads(backend)
          .slice(before)
          .map((c) => c.args.task),
      ).toEqual(['b2', 'b2', 'b2']);
    });

    it('stops reading with the view', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const { backend, unmount } = setup();
      await vi.advanceTimersByTimeAsync(1_500);
      const before = reads(backend).length;
      expect(before).toBe(2);
      unmount();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(reads(backend)).toHaveLength(before);
    });

    it('does not read while the window is hidden, and reads at once when it is seen again', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      let state: DocumentVisibilityState = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      try {
        const { backend } = setup();
        await vi.advanceTimersByTimeAsync(0);
        expect(reads(backend)).toHaveLength(1);
        state = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(10_000);
        expect(reads(backend)).toHaveLength(1);
        state = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(reads(backend)).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(reads(backend)).toHaveLength(3);
      } finally {
        delete (document as { visibilityState?: unknown }).visibilityState;
      }
    });

    it('says when the start of the output is missing, without a size: the end is 8 KiB while it runs and 256 KiB once it ended', async () => {
      setup({}, { task_output: () => out('fin', { truncated: true, totalBytes: 100_000 }) });
      expect(await screen.findByText('Début tronqué : seule la fin de la sortie est montrée.')).toBeInTheDocument();
    });

    it('shows the 256 KiB the backend reads of a task that ended, cleaned, from one read and no timer', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      // More than 256 KiB of colored lines: what is shown is their text, whole.
      const lines = Array.from({ length: 20_000 }, (_, i) => `\u001b[32mligne ${String(i).padStart(6, '0')}\u001b[0m`);
      const raw = lines.join('\n');
      expect(raw.length).toBeGreaterThan(256 * 1024);
      const { backend } = setup(
        { plan: planOf([task({ status: 'done', endedAt: 4_000 })]) },
        { task_output: () => out(raw, { truncated: true, totalBytes: 900_000, source: 'file' }) },
      );
      await vi.advanceTimersByTimeAsync(0);
      const shown = log().textContent ?? '';
      expect(shown === cleanOutput(raw)).toBe(true);
      expect(shown.includes('\u001b')).toBe(false);
      expect(shown.endsWith('ligne 019999')).toBe(true);
      expect(screen.getByText('Début tronqué : seule la fin de la sortie est montrée.')).toBeInTheDocument();
      // Read once: cleaning it again and again is what a timer would do.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(reads(backend)).toHaveLength(1);
    });

    it('says nothing of that when it is whole, and the source is the process', async () => {
      setup({}, { task_output: () => out('tout') });
      await waitFor(() => expect(log().textContent).toBe('tout'));
      expect(screen.queryByText(/Début tronqué/)).not.toBeInTheDocument();
      expect(screen.queryByText('lue dans le fichier de sortie')).not.toBeInTheDocument();
    });

    it('says when it was read from the output file', async () => {
      setup({ plan: planOf([task({ status: 'done', endedAt: 4_000 })]) }, { task_output: () => out('du fichier', { source: 'file' }) });
      expect(await screen.findByText('lue dans le fichier de sortie')).toBeInTheDocument();
      expect(log().textContent).toBe('du fichier');
    });

    it('says when there is no output to read', async () => {
      setup({ plan: planOf([task({ status: 'done', endedAt: 4_000 })]) }, { task_output: () => out('', { source: 'none' }) });
      expect(await screen.findByText('Aucune sortie disponible : le fichier de sortie est introuvable.')).toBeInTheDocument();
    });

    it('says it is waiting for a first line, or that a task wrote nothing', async () => {
      const { unmount } = setup({}, { task_output: () => out('') });
      expect(await screen.findByText('Rien n’a encore été écrit.')).toBeInTheDocument();
      unmount();
      setup({ plan: planOf([task({ status: 'done', endedAt: 4_000 })]) }, { task_output: () => out('') });
      expect(await screen.findByText('Cette tâche n’a rien écrit.')).toBeInTheDocument();
    });

    it('says it is reading before the first answer', async () => {
      setup({}, { task_output: () => new Promise(() => {}) });
      expect(screen.getByText('Lecture de la sortie…')).toBeInTheDocument();
    });

    it('does not break when a read fails: it says so quietly, keeps what it showed, and tries again on the next', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const answers: (() => TaskOutput)[] = [
        () => out('avant'),
        () => {
          throw 'Accès refusé';
        },
        () => out('après'),
      ];
      let k = 0;
      setup({}, { task_output: () => answers[Math.min(k++, 2)]() });
      await vi.advanceTimersByTimeAsync(0);
      expect(log().textContent).toBe('avant');
      await vi.advanceTimersByTimeAsync(1_500);
      expect(screen.getByText(/La sortie n’a pas pu être lue : Accès refusé/)).toBeInTheDocument();
      expect(log().textContent).toBe('avant');
      await vi.advanceTimersByTimeAsync(1_500);
      expect(log().textContent).toBe('après');
      expect(screen.queryByText(/n’a pas pu être lue/)).not.toBeInTheDocument();
    });

    it('follows its end, unless the reader went up in it, and offers to follow again', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      // jsdom has no layout: a fixed geometry for the log.
      const geometry = { scrollHeight: 2000, clientHeight: 500 };
      const saved = Object.keys(geometry).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)] as const);
      for (const [k, v] of Object.entries(geometry)) Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
      try {
        let n = 0;
        setup({}, { task_output: () => out(`lecture ${++n}`) });
        await vi.advanceTimersByTimeAsync(0);
        expect(log().scrollTop).toBe(2000);
        expect(screen.queryByRole('button', { name: 'Suivre la fin' })).not.toBeInTheDocument();
        // Scrolled up: left there, and the way back is offered.
        log().scrollTop = 100;
        await fireEvent.scroll(log());
        await vi.advanceTimersByTimeAsync(1_500);
        expect(log().textContent).toBe('lecture 2');
        expect(log().scrollTop).toBe(100);
        const follow = screen.getByRole('button', { name: 'Suivre la fin' });
        await fireEvent.click(follow);
        expect(log().scrollTop).toBe(2000);
        expect(screen.queryByRole('button', { name: 'Suivre la fin' })).not.toBeInTheDocument();
        // Followed again.
        await vi.advanceTimersByTimeAsync(1_500);
        expect(log().scrollTop).toBe(2000);
        // Back at the bottom by hand: followed too, without the button.
        log().scrollTop = 100;
        await fireEvent.scroll(log());
        expect(screen.getByRole('button', { name: 'Suivre la fin' })).toBeInTheDocument();
        log().scrollTop = 1990;
        await fireEvent.scroll(log());
        expect(screen.queryByRole('button', { name: 'Suivre la fin' })).not.toBeInTheDocument();
      } finally {
        for (const [k, d] of saved) {
          if (d) Object.defineProperty(HTMLElement.prototype, k, d);
          else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
        }
      }
    });
  });

  describe('« Arrêter »', () => {
    it('stops the task by its id, once, and tells why it costs a turn', async () => {
      let release: () => void = () => {};
      const { a, backend } = setup({}, { stop_bg_task: () => new Promise<void>((r) => (release = r)) });
      const stop = screen.getByRole('button', { name: /Arrêter/ });
      expect(stop).toBeEnabled();
      expect(stop).toHaveAttribute('data-tip', 'Arrêter cette tâche. Claude Code l’annonce ensuite à l’agent, ce qui lui coûte un tour.');
      await userEvent.click(stop);
      await waitFor(() => expect(backend.called('stop_bg_task')[0]?.args).toEqual({ id: a.id, task: 'b1' }));
      // Not twice while the call is under way.
      expect(stop).toBeDisabled();
      await userEvent.click(stop);
      expect(backend.called('stop_bg_task')).toHaveLength(1);
      release();
      await waitFor(() => expect(stop).toBeEnabled());
    });

    it('says why it could not stop it', async () => {
      const { backend } = setup(
        {},
        {
          stop_bg_task: () => {
            throw 'Cette tâche ne tourne plus.';
          },
        },
      );
      await userEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
      await waitFor(() => expect(backend.called('stop_bg_task')).toHaveLength(1));
      await waitFor(() => expect(app.toasts.at(-1)).toMatchObject({ text: 'Cette tâche ne tourne plus.', kind: 'error' }));
      // It can be tried again.
      expect(screen.getByRole('button', { name: /Arrêter/ })).toBeEnabled();
    });

    it('is not offered once the task is over', () => {
      setup({ plan: planOf([task({ status: 'done', endedAt: 4_000 })]) });
      expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    });

    it('is not offered in the Claude Code view, which says where the task is stopped', () => {
      const { backend } = setup({ terminal: true });
      expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
      expect(screen.getByText('Cette tâche s’arrête depuis l’interface de Claude Code.')).toBeInTheDocument();
      expect(backend.called('stop_bg_task')).toHaveLength(0);
    });

    it('does not say that for a task that is over, in that view', () => {
      setup({ terminal: true, plan: planOf([task({ status: 'done', endedAt: 4_000 })]) });
      expect(screen.queryByText('Cette tâche s’arrête depuis l’interface de Claude Code.')).not.toBeInTheDocument();
    });
  });

  it('says the task is gone when the agent’s plan no longer has it, and reads nothing', async () => {
    const { backend } = setup({ plan: planOf([]) });
    expect(screen.getByText('Cette tâche n’est plus dans la liste de l’agent.')).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    // The way back to the agent is still there.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).getByRole('button', { name: 'refacto-auth' }));
    expect(reads(backend)).toHaveLength(0);
  });

  it('says the same of an agent with no plan at all', () => {
    setup({ plan: undefined });
    expect(screen.getByText('Cette tâche n’est plus dans la liste de l’agent.')).toBeInTheDocument();
  });

  it('stops reading when the task goes from the plan under it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { a, backend } = setup();
    await vi.advanceTimersByTimeAsync(1_500);
    const before = reads(backend).length;
    a.plan = planOf([]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reads(backend).length).toBeLessThanOrEqual(before + 1);
    expect(screen.getByText('Cette tâche n’est plus dans la liste de l’agent.')).toBeInTheDocument();
  });

  it('speaks English', async () => {
    setLang('en');
    setup(
      { plan: planOf([task({ status: 'failed', endedAt: 5_000, summary: 'Background command "Ticker" failed with exit code 3' })]) },
      { task_output: () => out('x', { truncated: true, source: 'file' }) },
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Type\s*Background command/);
    expect(screen.getByRole('group', { name: 'Ticker' })).toHaveTextContent(/Exit code\s*3/);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(await screen.findByText('Start cut off: only the end of the output is shown.')).toBeInTheDocument();
    expect(screen.getByText('read from the output file')).toBeInTheDocument();
  });
});
