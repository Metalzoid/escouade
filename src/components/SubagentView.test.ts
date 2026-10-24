import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../lib/i18n';
import { app } from '../lib/state.svelte';
import type { Agent, ConvItem, PlanState, SubAgent, SubagentRead, ToolItem, TranscriptCursor } from '../lib/types';
import { answerClock, settle } from '../test/conversation';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import SubagentView from './SubagentView.svelte';

const row = (over: Partial<SubAgent> = {}): SubAgent => ({
  id: 'c1',
  title: 'Chercher la cause',
  kind: 'Explore',
  model: 'haiku',
  status: 'running',
  background: true,
  tools: 2,
  tokens: 1_800,
  startedAt: 1_000,
  taskId: 'task-1',
  ...over,
});
const planOf = (agents: SubAgent[]): PlanState => ({
  source: null,
  tasks: [],
  agents,
  launched: agents.length,
  workflows: [],
  bgTasks: [],
});
const call = (id: string, over: Partial<ToolItem> = {}): ToolItem => ({
  kind: 'tool',
  id,
  name: 'Agent',
  input: { description: 'Chercher la cause', subagent_type: 'Explore', model: 'haiku', prompt: 'Cherche pourquoi les PDF sont refusés.' },
  status: 'ok',
  result: { text: 'Async agent launched successfully.\nagentId: task-1', isError: false },
  ts: 1,
  ...over,
});
const text = (id: string, parent: string | null, t: string): ConvItem => ({ kind: 'text', id, parent, text: t, streaming: false });
const permission = (over: Record<string, unknown> = {}): ConvItem =>
  ({
    kind: 'permission',
    id: 'r1',
    toolUseId: 'k1',
    toolName: 'Bash',
    input: { command: 'curl localhost:3000', description: 'Interroge le serveur' },
    canAlways: false,
    defaultNo: false,
    decision: null,
    ts: 2,
    sub: 'c1',
    ...over,
  }) as ConvItem;

/** `before` runs once the app is set up, just before the view is drawn (a draft already typed, a dialog open…). */
function setup(
  over: Partial<Agent> = {},
  items: ConvItem[] = [],
  handlers: Record<string, (args: any) => unknown> = {},
  at = 'c1',
  before: (a: Agent) => void = () => {},
) {
  const a = agent({ id: `s${Math.random()}`, status: 'idle', alive: true, plan: planOf([row()]), ...over });
  resetApp({ projects: [project()], agents: [a] });
  app.ui.selectedAgent = { p1: a.id };
  app.subView = { [a.id]: at };
  app.now = 61_000;
  const backend = fakeBackend({ get_conversation: () => items, ...handlers });
  before(a);
  const { unmount } = render(SubagentView, { agent: a, project: project(), call: at });
  return { a, backend, unmount };
}

/** Like `setup`, with the agent the app keeps: a change of its plan reaches the view. */
function setupLive(over: Partial<Agent> = {}, items: ConvItem[] = [], handlers: Record<string, (args: any) => unknown> = {}) {
  const a = agent({ id: `l${Math.random()}`, status: 'idle', alive: true, plan: planOf([row()]), ...over });
  resetApp({ projects: [project()], agents: [a] });
  app.ui.selectedAgent = { p1: a.id };
  app.subView = { [a.id]: 'c1' };
  app.now = 61_000;
  const backend = fakeBackend({ get_conversation: () => items, ...handlers });
  const live = app.agents[a.id];
  const { unmount } = render(SubagentView, { agent: live, project: project(), call: 'c1' });
  return { a: live, backend, unmount };
}

const thread = () => [call('c1'), text('t0', null, 'Je lance un sous-agent.'), text('t1', 'c1', 'Je regarde le serveur.'), permission()];

describe('SubagentView', () => {
  it('heads its conversation with the way back to the agent, its type, model, prompt, tokens and duration', async () => {
    const { a } = setup({}, thread());
    const crumbs = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(crumbs).toHaveTextContent(/^refacto-auth\s*Chercher la cause$/);
    // Its steps are set apart by a chevron, drawn.
    expect(crumbs.querySelectorAll('.sep [data-icon="right"]')).toHaveLength(1);
    expect(within(crumbs).getByText('Chercher la cause')).toHaveAttribute('aria-current', 'page');
    const facts = await screen.findByRole('group', { name: 'Chercher la cause' });
    expect(facts).toHaveTextContent(/Type\s*Explore/);
    expect(facts).toHaveTextContent(/Modèle\s*Haiku/);
    expect(facts).toHaveTextContent(/Tokens\s*1,8 k/);
    expect(facts).toHaveTextContent(/Outils\s*2/);
    expect(facts).toHaveTextContent(/Durée\s*1m 00s/);
    expect(await screen.findByText('Cherche pourquoi les PDF sont refusés.')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    // Back to the agent.
    await userEvent.click(within(crumbs).getByRole('button', { name: 'refacto-auth' }));
    expect(app.subView[a.id]).toBeNull();
  });

  it('draws its own thread and its requests, not the agent’s, and answers them there', async () => {
    const { a, backend } = setup({ status: 'waiting', pending: ['r1'] }, thread());
    expect(await screen.findByText('Je regarde le serveur.')).toBeInTheDocument();
    expect(screen.queryByText('Je lance un sous-agent.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Autoriser/ }));
    await waitFor(() =>
      expect(backend.calls.find((c) => c.cmd === 'answer_permission')?.args).toMatchObject({
        id: a.id,
        requestId: 'r1',
        decision: 'allow',
      }),
    );
  });

  it('stops it by its task, and only while it runs and its task is known', async () => {
    const { a, backend } = setup({}, thread());
    const stop = screen.getByRole('button', { name: /Arrêter/ });
    expect(stop).toBeEnabled();
    await userEvent.click(stop);
    await waitFor(() => expect(backend.calls.find((c) => c.cmd === 'stop_subagent')?.args).toEqual({ id: a.id, call: 'c1' }));
  });

  it('cannot stop one whose task Claude Code has not told yet, and says why', async () => {
    const { backend } = setup({ plan: planOf([row({ taskId: undefined })]) }, thread());
    const stop = screen.getByRole('button', { name: /Arrêter/ });
    // Focusable still, for its tooltip to be read.
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toBeEnabled();
    await userEvent.click(stop);
    expect(backend.calls.some((c) => c.cmd === 'stop_subagent')).toBe(false);
    expect(stop).toHaveAttribute(
      'data-tip',
      'Claude Code n’a pas encore donné la tâche de ce sous-agent : il ne peut pas encore être arrêté seul.',
    );
  });

  it('ends a finished one with its report, without Arrêter', async () => {
    setup({ plan: planOf([row({ status: 'done', endedAt: 31_000 })]) }, [
      call('c1', { report: '**Cause trouvée** : le filtre.' }),
      text('t1', 'c1', 'Fini.'),
    ]);
    const report = await screen.findByRole('region', { name: 'Rapport' });
    expect(report).toHaveTextContent('Cause trouvée : le filtre.');
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Chercher la cause' })).toHaveTextContent(/Durée\s*0m 30s/);
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    // Nothing to write to: taken up again, it would still say it ended (the plan never opens an ended row again).
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('says a finished one handed back no report', async () => {
    setup({ plan: planOf([row({ status: 'stopped', endedAt: 5_000 })]) }, [call('c1')]);
    expect(await screen.findByText('Ce sous-agent n’a pas rendu de rapport.')).toBeInTheDocument();
    expect(screen.getByText('Arrêté')).toBeInTheDocument();
  });

  it('reads one the plan forgot (a restart, a new plan) from what its call kept', async () => {
    setup({ plan: undefined }, [
      call('c1', { report: 'Rapport gardé.', run: { status: 'done', tokens: 4_200, tools: 3, startedAt: 1_000, endedAt: 3_500 } }),
      text('t1', 'c1', 'Toujours là.'),
    ]);
    expect(await screen.findByText('Toujours là.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rapport' })).toHaveTextContent('Rapport gardé.');
    const facts = screen.getByRole('group', { name: 'Chercher la cause' });
    expect(facts).toHaveTextContent(/Tokens\s*4,2 k/);
    expect(facts).toHaveTextContent(/Durée\s*0m 02s/);
  });

  it('goes down to a subagent of its own and back up by the breadcrumb', async () => {
    const { a } = setup(
      { plan: planOf([row(), row({ id: 'c2', title: 'Petit', parent: 'c1' })]) },
      [call('c1'), call('c2', { parent: 'c1', input: { description: 'Petit', prompt: 'Lis.' } }), text('t2', 'c2', 'Je lis.')],
      {},
      'c2',
    );
    const crumbs = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    await waitFor(() => expect(crumbs).toHaveTextContent(/refacto-auth\s*Chercher la cause\s*Petit/));
    await userEvent.click(within(crumbs).getByRole('button', { name: 'Chercher la cause' }));
    expect(app.subView[a.id]).toBe('c1');
  });

  it('writes to it through the agent, which is said', async () => {
    const { a, backend } = setup({}, thread());
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    expect(screen.getByText(/ton message va à refacto-auth, qui le lui transmet/)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Envoyer à refacto-auth' });
    expect(send).toBeDisabled();
    await userEvent.type(field, 'Regarde aussi le port 3001.');
    await userEvent.click(send);
    await waitFor(() =>
      expect(backend.calls.find((c) => c.cmd === 'message_subagent')?.args).toEqual({
        id: a.id,
        call: 'c1',
        text: 'Regarde aussi le port 3001.',
      }),
    );
    await waitFor(() => expect(field).toHaveValue(''));
    expect(app.toasts.at(-1)?.text).toBe('Message envoyé à refacto-auth, qui le transmet au sous-agent.');
  });

  it('says a subagent nothing knows of any more', async () => {
    setup({ plan: undefined }, [], {}, 'gone');
    expect(await screen.findByText('Ce sous-agent n’est plus dans la conversation de l’agent.')).toBeInTheDocument();
  });

  it('speaks English', async () => {
    setLang('en');
    setup({ plan: planOf([row({ status: 'done', endedAt: 31_000 })]) }, [call('c1')]);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(await screen.findByText('This subagent handed back no report.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Chercher la cause' })).toHaveTextContent(/Model\s*Haiku/);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});

describe('SubagentView keys', () => {
  answerClock();

  it('sends the message on Ctrl+Entrée in its field, and leaves its waiting request alone', async () => {
    const { a, backend } = setup({ status: 'waiting', pending: ['r1'] }, thread());
    await screen.findByText('Je regarde le serveur.');
    settle();
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    await userEvent.type(field, 'Attends{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(backend.calls.find((c) => c.cmd === 'message_subagent')?.args).toEqual({ id: a.id, call: 'c1', text: 'Attends' }),
    );
    expect(backend.calls.some((c) => c.cmd === 'answer_permission')).toBe(false);
  });
});

const sideTool = (id: string, over: Partial<ToolItem> = {}): ToolItem => ({
  kind: 'tool',
  id,
  name: 'Bash',
  input: { command: 'ls -la' },
  status: 'ok',
  result: { text: 'a.txt', isError: false },
  parent: 'c1',
  ts: 1,
  ...over,
});
const sideText = (id: string, t: string): ConvItem => ({ kind: 'text', id, parent: 'c1', text: t, streaming: false });
const sideThinking = (id: string, t: string): ConvItem => ({ kind: 'thinking', id, parent: 'c1', text: t, streaming: false });
/** How its files stood, as the backend tells it: the size grows with what it holds. */
const cursorAt = (n: number): TranscriptCursor => ({ len: 100 * n, mtime: 1_000 + n });
/** What a read of its transcript gives: the items, and the cursor to give back. */
const read = (items: ConvItem[], over: Partial<SubagentRead> = {}): SubagentRead => ({
  items,
  cursor: cursorAt(items.length),
  ended: null,
  ...over,
});

describe('SubagentView in the Claude Code view', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the transcript of the subagent, read-only, and says so', async () => {
    const { a, backend } = setup({ terminal: true }, [call('c1')], {
      subagent_transcript: () =>
        read([sideThinking('s0', 'Je réfléchis au serveur.'), sideText('s1', 'Je regarde le serveur.'), sideTool('s2')]),
    });
    expect(await screen.findByText('Je regarde le serveur.')).toBeInTheDocument();
    expect(backend.calls.find((c) => c.cmd === 'subagent_transcript')?.args).toEqual({ id: a.id, call: 'c1', cursor: null });
    expect(screen.getByText('ls -la')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Lecture seule : son transcript, tel que Claude Code l’écrit. On agit sur ce sous-agent dans l’interface de Claude Code.',
      ),
    ).toBeInTheDocument();
    // Nothing to act with: no stop, no field.
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not ask for a transcript in the stream view', async () => {
    const { backend } = setup({}, [call('c1'), text('t1', 'c1', 'Dans le fil.')]);
    expect(await screen.findByText('Dans le fil.')).toBeInTheDocument();
    expect(backend.calls.some((c) => c.cmd === 'subagent_transcript')).toBe(false);
  });

  it('says there is nothing yet', async () => {
    setup({ terminal: true }, [call('c1')], { subagent_transcript: () => read([]) });
    expect(await screen.findByText('Pas encore de message de ce sous-agent.')).toBeInTheDocument();
  });

  it('says when its transcript could not be read', async () => {
    setup({ terminal: true }, [call('c1')], {
      subagent_transcript: () => {
        throw 'Accès refusé';
      },
    });
    expect(await screen.findByText('Le transcript de ce sous-agent n’a pas pu être lu : Accès refusé')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore de message de ce sous-agent.')).not.toBeInTheDocument();
  });

  it('reads it again every 2 s while it runs, and no more once it ended or the view is gone', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { a, backend, unmount } = setupLive({ terminal: true }, [call('c1')], { subagent_transcript: () => read([]) });
    const reads = () => backend.called('subagent_transcript').length;
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reads()).toBe(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(reads()).toBe(4);
    // It ends: one last read, for what it said last, then none.
    a.plan = planOf([row({ status: 'done', endedAt: 5_000 })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads()).toBe(5);
    unmount();

    // A view that goes while its subagent runs: the timer goes with it.
    const again = setupLive({ terminal: true }, [call('c1')], { subagent_transcript: () => read([]) });
    await vi.advanceTimersByTimeAsync(2_000);
    const before = again.backend.called('subagent_transcript').length;
    again.unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(again.backend.called('subagent_transcript')).toHaveLength(before);
  });

  it('gives the cursor of a read back to the next, and keeps what it shows when told nothing changed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // The backend answers null while its files are as the cursor says.
    let files = read([sideText('s1', 'Je regarde le serveur.')]);
    const { backend } = setupLive({ terminal: true }, [call('c1')], {
      subagent_transcript: (args: { cursor: TranscriptCursor | null }) =>
        args.cursor && args.cursor.len === files.cursor!.len && args.cursor.mtime === files.cursor!.mtime ? null : files,
    });
    const cursors = () => backend.called('subagent_transcript').map((c) => c.args.cursor);
    await vi.advanceTimersByTimeAsync(0);
    expect(await screen.findByText('Je regarde le serveur.')).toBeInTheDocument();
    // The first read has none.
    expect(cursors()).toEqual([null]);

    // The next gives back the one it got; told nothing changed, it still shows what it had.
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(cursors()).toEqual([null, cursorAt(1), cursorAt(1)]);
    expect(screen.getByText('Je regarde le serveur.')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore de message de ce sous-agent.')).not.toBeInTheDocument();

    // It grows: the new items replace the list, and the new cursor is the one given back.
    files = read([sideText('s1', 'Je regarde le serveur.'), sideText('s2', 'Et le port.')]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText('Et le port.')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(cursors().slice(-2)).toEqual([cursorAt(1), cursorAt(2)]);
    expect(screen.getByText('Je regarde le serveur.')).toBeInTheDocument();
  });

  it('gives no cursor again while its files were not found, and clears an error once a read goes through', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let answer: () => unknown = () => {
      throw 'Accès refusé';
    };
    const { backend } = setupLive({ terminal: true }, [call('c1')], { subagent_transcript: () => answer() });
    await vi.advanceTimersByTimeAsync(0);
    expect(await screen.findByText('Le transcript de ce sous-agent n’a pas pu être lu : Accès refusé')).toBeInTheDocument();
    // No file yet: nothing, and no cursor to give back.
    answer = () => read([], { cursor: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText('Pas encore de message de ce sous-agent.')).toBeInTheDocument();
    expect(screen.queryByText(/n’a pas pu être lu/)).not.toBeInTheDocument();
    // It was read then, but its files did not change since: the error of a failed read goes too.
    answer = () => read([sideText('s1', 'Là.')]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText('Là.')).toBeInTheDocument();
    answer = () => {
      throw 'Occupé';
    };
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText(/Occupé/)).toBeInTheDocument();
    answer = () => null;
    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(screen.queryByText(/Occupé/)).not.toBeInTheDocument());
    expect(screen.getByText('Là.')).toBeInTheDocument();
    expect(backend.called('subagent_transcript').map((c) => c.args.cursor)).toEqual([null, null, null, cursorAt(1), cursorAt(1)]);
  });

  it('says « Arrêté » and reads no more once a read told it ended and its row went to stopped', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // The user stopped it in the interface: the files say so, the backend ends its row and sends the agent.
    const files = read([sideText('s1', 'Je lance le serveur.')], { ended: 'stopped' });
    const { a, backend } = setupLive({ terminal: true }, [call('c1')], { subagent_transcript: () => files });
    const reads = () => backend.called('subagent_transcript').length;
    await vi.advanceTimersByTimeAsync(0);
    expect(await screen.findByText('Je lance le serveur.')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Le sous-agent travaille…')).toBeInTheDocument();

    a.plan = planOf([row({ status: 'stopped', endedAt: 5_000 })]);
    expect(await screen.findByText('Arrêté')).toBeInTheDocument();
    expect(screen.queryByText('En cours')).not.toBeInTheDocument();
    expect(screen.queryByText('Le sous-agent travaille…')).not.toBeInTheDocument();
    // One last read, then none; and its duration is the one it had when it ended.
    await vi.advanceTimersByTimeAsync(0);
    const last = reads();
    expect(screen.getByRole('group', { name: 'Chercher la cause' })).toHaveTextContent(/Durée\s*0m 04s/);
    app.now += 120_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads()).toBe(last);
    expect(screen.getByRole('group', { name: 'Chercher la cause' })).toHaveTextContent(/Durée\s*0m 04s/);
    expect(screen.getByText('Je lance le serveur.')).toBeInTheDocument();
  });

  it('shows the tools it left running as interrupted once it ended', async () => {
    const running = sideTool('s2', { status: 'running', result: undefined });
    const { unmount } = setup({ terminal: true }, [call('c1')], { subagent_transcript: () => read([running]) });
    expect(await screen.findByText('ls -la')).toBeInTheDocument();
    expect(screen.getByLabelText('en cours')).toBeInTheDocument();
    unmount();
    document.body.innerHTML = '';
    setup({ terminal: true, plan: planOf([row({ status: 'stopped', endedAt: 5_000 })]) }, [call('c1')], {
      subagent_transcript: () => read([running]),
    });
    expect(await screen.findByText('ls -la')).toBeInTheDocument();
    expect(screen.queryByLabelText('en cours')).not.toBeInTheDocument();
  });

  it('ends with the report of its call, else with what it handed back in its transcript', async () => {
    const handed = sideTool('s9', {
      name: 'SubagentHandback',
      input: { message: '**Cause trouvée** dans le filtre.' },
      result: { text: 'ok', isError: false },
    });
    const ended = { terminal: true, plan: planOf([row({ status: 'done', endedAt: 31_000 })]) };
    const first = setup(ended, [call('c1')], { subagent_transcript: () => read([sideText('s1', 'Fini.'), handed]) });
    const report = await screen.findByRole('region', { name: 'Rapport' });
    expect(report).toHaveTextContent('Cause trouvée dans le filtre.');
    // Its call is not drawn as a tool: the report below says it.
    expect(screen.queryByText('SubagentHandback')).not.toBeInTheDocument();
    first.unmount();
    document.body.innerHTML = '';

    // The report its call kept wins.
    const second = setup(ended, [call('c1', { report: 'Rapport gardé.' })], {
      subagent_transcript: () => read([sideText('s1', 'Fini.'), handed]),
    });
    expect(await screen.findByRole('region', { name: 'Rapport' })).toHaveTextContent('Rapport gardé.');
    second.unmount();
    document.body.innerHTML = '';

    // None at all.
    setup(ended, [call('c1')], { subagent_transcript: () => read([sideText('s1', 'Fini.')]) });
    expect(await screen.findByText('Ce sous-agent n’a pas rendu de rapport.')).toBeInTheDocument();
  });
});

describe('SubagentView focus and Escape', () => {
  it('puts the focus on the current crumb when it opens', () => {
    setup({}, thread());
    const here = within(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).getByText('Chercher la cause');
    expect(here).toHaveFocus();
    expect(here).toHaveAttribute('tabindex', '-1');
  });

  it('goes back to the agent’s conversation on Escape', async () => {
    const { a } = setup({}, thread());
    await userEvent.keyboard('{Escape}');
    expect(app.subView[a.id]).toBeNull();
  });

  it('stays open on Escape while a dialog is open, for the dialog to close first', async () => {
    const { a } = setup({}, thread(), {}, 'c1', () => (app.modal = { kind: 'telemetry' }));
    await userEvent.keyboard('{Escape}');
    expect(app.subView[a.id]).toBe('c1');
    app.modal = null;
    await userEvent.keyboard('{Escape}');
    expect(app.subView[a.id]).toBeNull();
  });

  it('leaves Escape to its field while it holds a draft, and goes back when it is empty', async () => {
    const { a } = setup({}, thread());
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    await userEvent.type(field, 'Un brouillon');
    await userEvent.keyboard('{Escape}');
    expect(app.subView[a.id]).toBe('c1');
    expect(field).toHaveValue('Un brouillon');
    await userEvent.clear(field);
    await userEvent.keyboard('{Escape}');
    expect(app.subView[a.id]).toBeNull();
  });

  it('does not go back on an Escape something else already took', () => {
    const { a } = setup({}, thread());
    const taken = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    taken.preventDefault();
    window.dispatchEvent(taken);
    expect(app.subView[a.id]).toBe('c1');
  });
});

describe('SubagentView draft', () => {
  const key = (a: Agent) => `${a.id}:c1`;

  it('keeps what is typed to the subagent in the app, and finds it again when the view is drawn again', async () => {
    const { a, unmount } = setup({}, thread());
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    await userEvent.type(field, 'Regarde le port 3001.');
    expect(app.subDrafts[key(a)]).toBe('Regarde le port 3001.');
    unmount();
    document.body.innerHTML = '';
    render(SubagentView, { agent: a, project: project(), call: 'c1' });
    expect(screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' })).toHaveValue('Regarde le port 3001.');
  });

  it('forgets a draft once the message is sent', async () => {
    const { a } = setup({}, thread());
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    await userEvent.type(field, 'Envoie-moi ça');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer à refacto-auth' }));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(app.subDrafts[key(a)] ?? '').toBe('');
  });

  it('keeps the field of a subagent that ended with a draft in it, says so, and sends nothing', async () => {
    const { a, backend } = setupLive({}, thread());
    const field = screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' });
    expect(screen.queryByText(/Ce sous-agent a fini/)).not.toBeInTheDocument();
    await userEvent.type(field, 'Trop tard ?');
    a.plan = planOf([row({ status: 'done', endedAt: 31_000 })]);
    expect(await screen.findByText(/Ce sous-agent a fini : ton brouillon est gardé/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' })).toHaveValue('Trop tard ?');
    expect(screen.getByRole('button', { name: 'Envoyer à refacto-auth' })).toBeDisabled();
    await userEvent.type(field, '{Control>}{Enter}{/Control}');
    expect(backend.calls.some((c) => c.cmd === 'message_subagent')).toBe(false);
    // The field is still there once the draft is emptied: it does not vanish under the cursor.
    await userEvent.clear(field);
    expect(screen.getByRole('textbox', { name: 'Lui écrire, par refacto-auth' })).toBeInTheDocument();
  });

  it('shows a draft already typed in a view drawn after the subagent ended, and no field without one', async () => {
    const ended = { plan: planOf([row({ status: 'done', endedAt: 31_000 })]) };
    const first = setup(ended, thread(), {}, 'c1', (a) => (app.subDrafts[`${a.id}:c1`] = 'Pour plus tard'));
    expect(await screen.findByRole('textbox', { name: 'Lui écrire, par refacto-auth' })).toHaveValue('Pour plus tard');
    expect(screen.getByText(/Ce sous-agent a fini/)).toBeInTheDocument();
    first.unmount();
    document.body.innerHTML = '';
    setup(ended, thread());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ce sous-agent a fini/)).not.toBeInTheDocument();
  });

  it('says it in English too', async () => {
    setLang('en');
    setup({ plan: planOf([row({ status: 'done', endedAt: 31_000 })]) }, thread(), {}, 'c1', (a) => (app.subDrafts[`${a.id}:c1`] = 'Later'));
    expect(
      await screen.findByText('This subagent has finished: your draft is kept, but it can no longer be sent to it.'),
    ).toBeInTheDocument();
  });
});

describe('SubagentView in the foreground', () => {
  it('has neither Arrêter nor a field to write: the agent waits for it, and stopping it alone was never tried', () => {
    setup({ plan: planOf([row({ background: false })]) }, thread());
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('stops and writes only to a subagent known to run in the background', () => {
    setup({ plan: planOf([row({ background: undefined as unknown as boolean })]) }, thread());
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
