import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmModal from '../components/modals/ConfirmModal.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';
import {
  commitAgentPrompt,
  commitAllPrompt,
  commitViaAgent,
  copyRemoteLink,
  integrateBase,
  mergeAgent,
  toggleRemote,
} from './agent-actions';
import { setLang } from './i18n';
import { app } from './state.svelte';

const WORKTREE = { path: 'C:\\code\\demo-api\\.claude\\worktrees\\landing', branch: 'ccm/landing', baseBranch: 'main' };
const landing = () => agent({ id: 'a2', name: 'landing', worktree: WORKTREE });

let shown: { unmount: () => void } | null = null;

/** The confirmation currently asked, rendered as the app does (the one before it is gone). */
function asked() {
  shown?.unmount();
  expect(app.modal?.kind).toBe('confirm');
  shown = render(ConfirmModal, { ...(app.modal as any) });
}

describe('mergeAgent', () => {
  beforeEach(() => {
    shown = null;
    resetApp({ agents: [landing()] });
  });

  it('merges into the base without asking more when the project is on it', async () => {
    const backend = fakeBackend({ merge_agent: () => 'Merge effectué en un commit' });
    mergeAgent(app.agents.a2);
    expect(app.modal).toMatchObject({ kind: 'confirm', title: 'Merger ccm/landing dans main ?', confirm: 'Merger' });
    asked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Squash (un seul commit)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    expect(backend.called('merge_agent').map((c) => c.args)).toEqual([{ id: 'a2', squash: true, switchToBase: false }]);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'Merge effectué en un commit', kind: 'ok' });
    expect(app.modal).toBeNull();
  });

  it('asks to switch to the base when the project is on another branch, then merges with the same choice', async () => {
    let refuse = true;
    const backend = fakeBackend({
      merge_agent: () => {
        if (refuse) throw 'NOT_ON_BASE:feature/login:main';
        return 'Merge effectué';
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Squash (un seul commit)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    // Nothing is shown as an error: the refusal became a question.
    expect(app.toasts).toEqual([]);
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      title: 'Basculer sur « main » ?',
      body: 'Le projet est sur la branche « feature/login ». Escouade bascule sur « main » puis merge « ccm/landing ».',
      confirm: 'Basculer et merger',
    });
    expect(backend.called('merge_agent')).toHaveLength(1);

    refuse = false;
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Basculer et merger' }));
    expect(backend.called('merge_agent').map((c) => c.args)).toEqual([
      { id: 'a2', squash: true, switchToBase: false },
      { id: 'a2', squash: true, switchToBase: true },
    ]);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'Merge effectué', kind: 'ok' });
    expect(app.modal).toBeNull();
  });

  it('merges nothing when the switch is declined', async () => {
    const backend = fakeBackend({
      merge_agent: () => {
        throw 'NOT_ON_BASE:feature/login:main';
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(app.modal).toBeNull();
    expect(backend.called('merge_agent')).toHaveLength(1);
  });

  it('says so when the project is on no branch at all', async () => {
    fakeBackend({
      merge_agent: () => {
        throw 'NOT_ON_BASE::main';
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    expect(app.modal).toMatchObject({
      title: 'Basculer sur « main » ?',
      body: 'Le projet n’est sur aucune branche (HEAD détachée). Escouade bascule sur « main » puis merge « ccm/landing ».',
      confirm: 'Basculer et merger',
    });
  });

  it('shows git’s own refusal of the switch as it is, and any other error too', async () => {
    let n = 0;
    fakeBackend({
      merge_agent: () => {
        throw ++n === 1
          ? 'NOT_ON_BASE:feature/login:main'
          : 'git switch: error: The following untracked working tree files would be overwritten by checkout:\n\tnotes.txt';
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Basculer et merger' }));
    expect(app.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(app.toasts.at(-1)?.text).toContain('notes.txt');
    // It is an error, not another question.
    expect(app.modal).toBeNull();
  });

  it('shows the other refusals of the backend as errors, without proposing a switch', async () => {
    fakeBackend({
      merge_agent: () => {
        throw "Rien à merger : la branche ccm/landing n'a pas de nouveau commit.";
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merger' }));
    expect(app.toasts.at(-1)).toMatchObject({ text: "Rien à merger : la branche ccm/landing n'a pas de nouveau commit.", kind: 'error' });
    expect(app.modal).toBeNull();
  });

  it('does nothing for an agent without a worktree', () => {
    fakeBackend();
    mergeAgent(agent());
    expect(app.modal).toBeNull();
  });
});

describe('agent actions in English', () => {
  beforeEach(() => {
    shown = null;
    resetApp({ agents: [landing()] });
    setLang('en');
  });

  it('asks to merge in English, with the squash option, and tells it is done', async () => {
    const backend = fakeBackend({ merge_agent: () => '' });
    mergeAgent(app.agents.a2);
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      title: 'Merge ccm/landing into main?',
      body: 'The commits of agent “landing” are merged into the project’s “main” branch.',
      confirm: 'Merge',
    });
    asked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Squash (a single commit)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(backend.called('merge_agent').map((c) => c.args)).toEqual([{ id: 'a2', squash: true, switchToBase: false }]);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'Merge completed', kind: 'ok' });
  });

  it('asks to switch to the base in English, on a branch or on none', async () => {
    let refusal = 'NOT_ON_BASE:feature/login:main';
    fakeBackend({
      merge_agent: () => {
        throw refusal;
      },
    });
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(app.modal).toMatchObject({
      title: 'Switch to “main”?',
      body: 'The project is on the branch “feature/login”. Escouade switches to “main” and then merges “ccm/landing”.',
      confirm: 'Switch and merge',
    });
    refusal = 'NOT_ON_BASE::main';
    mergeAgent(app.agents.a2);
    asked();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(app.modal).toMatchObject({
      body: 'The project is on no branch (detached HEAD). Escouade switches to “main” and then merges “ccm/landing”.',
      confirm: 'Switch and merge',
    });
  });

  it('tells in English that a remote agent is reachable, and that its link is copied', async () => {
    const url = 'https://claude.ai/code/session_abc';
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const backend = fakeBackend({ set_remote_control: () => false });
    await toggleRemote(app.agents.a2);
    expect(backend.called('set_remote_control')[0].args).toEqual({ id: 'a2', enabled: true });
    expect(app.toasts.at(-1)).toMatchObject({ text: 'landing is reachable from claude.ai and the Claude app', kind: 'ok' });
    await copyRemoteLink({ ...app.agents.a2, remoteUrl: url });
    expect(write).toHaveBeenCalledWith(url);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'claude.ai link copied', kind: 'ok' });
  });

  it('asks the agent to commit in the language of the texts for Claude, whatever the interface’s', async () => {
    // The interface in English, the texts for Claude in French…
    app.lang = { ui: 'en', system: 'fr', claude: 'fr' };
    expect(commitAgentPrompt()).toMatch(/^Commite les modifications/);
    expect(commitAllPrompt()).toMatch(/^Commite toutes les modifications/);
    // …and the other way round, as the agent is sent it.
    app.lang = { ui: 'fr', system: 'fr', claude: 'en' };
    setLang('fr');
    expect(commitAgentPrompt()).toMatch(/^Commit the changes you made/);
    expect(commitAllPrompt()).toMatch(/^Commit all the current changes/);
    const backend = fakeBackend({ send_message: () => null });
    await commitViaAgent(app.agents.a2, 'project');
    expect(backend.called('send_message')[0].args.text).toMatch(/^Commit all the current changes/);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'Demande de commit envoyée à landing', kind: 'ok' });
  });
});

describe('toggleRemote', () => {
  const NEXT_LAUNCH =
    'Pris en compte au prochain lancement de son interface Claude Code ; d’ici là, c’est sa commande /remote-control qui le fait.';
  const REACHABLE = 'landing est accessible depuis claude.ai et l’app Claude';
  const toasts = () => app.toasts.map((x) => [x.text, x.kind]);
  /** The agent in Claude Code’s view, its interface on `terminalId`. */
  const inClaudeCode = (over: Partial<Parameters<typeof agent>[0]> = {}) =>
    agent({ id: 'a2', name: 'landing', terminal: true, terminalId: 't1', ...over });

  beforeEach(() => resetApp({ agents: [landing()] }));

  it.each([
    ['on', false],
    ['off', true],
  ] as const)('tells it applies at the next launch when the backend says so, turning it %s', async (_, remoteControl) => {
    const backend = fakeBackend({ set_remote_control: () => true });
    await toggleRemote(inClaudeCode({ remoteControl }));
    expect(backend.called('set_remote_control')[0].args).toEqual({ id: 'a2', enabled: !remoteControl });
    expect(toasts()).toEqual([[NEXT_LAUNCH, 'ok']]);
  });

  it('tells the same for an agent in Escouade’s view when the backend says so, whatever the window holds', async () => {
    fakeBackend({ set_remote_control: () => true });
    await toggleRemote(agent({ id: 'a2', name: 'landing' }));
    expect(toasts()).toEqual([[NEXT_LAUNCH, 'ok']]);
  });

  it('says the agent is reachable when it is turned on and the change applies now: the backend starts it in the background', async () => {
    fakeBackend({ set_remote_control: () => false });
    // Whether it is in Claude Code’s view, with an interface or none, or not.
    await toggleRemote(inClaudeCode({ terminalId: 't1' }));
    await toggleRemote(inClaudeCode({ terminalId: null }));
    await toggleRemote(agent({ id: 'a2', name: 'landing', terminalId: 't1' }));
    expect(toasts()).toEqual([
      [REACHABLE, 'ok'],
      [REACHABLE, 'ok'],
      [REACHABLE, 'ok'],
    ]);
  });

  it('says nothing when it is turned off and the change applies now: the backend stops the one it started', async () => {
    const backend = fakeBackend({ set_remote_control: () => false });
    await toggleRemote(inClaudeCode({ terminalId: 't1', remoteControl: true }));
    await toggleRemote(inClaudeCode({ terminalId: null, remoteControl: true }));
    expect(backend.called('set_remote_control')).toHaveLength(2);
    expect(toasts()).toEqual([]);
  });

  it('says the agent is reachable for a backend that answers nothing', async () => {
    fakeBackend({ set_remote_control: () => null });
    await toggleRemote(inClaudeCode());
    expect(toasts()).toEqual([[REACHABLE, 'ok']]);
  });

  it('says nothing more than the backend’s refusal', async () => {
    fakeBackend({
      set_remote_control: () => {
        throw 'Le remote control a échoué.';
      },
    });
    await toggleRemote(inClaudeCode());
    await toggleRemote(inClaudeCode({ terminalId: null }));
    expect(toasts()).toEqual([
      ['Le remote control a échoué.', 'error'],
      ['Le remote control a échoué.', 'error'],
    ]);
  });

  it('tells in English that the change applies at the next launch', async () => {
    setLang('en');
    fakeBackend({ set_remote_control: () => true });
    await toggleRemote(inClaudeCode());
    expect(toasts()).toEqual([
      ['Applies at the next launch of its Claude Code interface; until then, its /remote-control command does it.', 'ok'],
    ]);
  });
});

describe('integrateBase', () => {
  beforeEach(() => resetApp({ agents: [landing()] }));

  it('tells the base went into the branch', async () => {
    const backend = fakeBackend({ integrate_base: () => ({ kind: 'done' }) });
    await integrateBase(app.agents.a2);
    expect(backend.called('integrate_base')[0].args).toEqual({ id: 'a2' });
    expect(app.toasts).toEqual([expect.objectContaining({ text: 'main intégrée dans ccm/landing.', kind: 'ok' })]);
  });

  it('says the branch had everything already', async () => {
    fakeBackend({ integrate_base: () => ({ kind: 'upToDate' }) });
    await integrateBase(app.agents.a2);
    expect(app.toasts).toEqual([expect.objectContaining({ text: 'ccm/landing a déjà tout ce qu’il y a dans main.', kind: 'info' })]);
  });

  it('tells who has the conflicts to resolve, a merge left in the worktree or a rebase undone', async () => {
    fakeBackend({ integrate_base: () => ({ kind: 'conflict', files: ['src/a.ts'], rebase: false }) });
    await integrateBase(app.agents.a2);
    fakeBackend({ integrate_base: () => ({ kind: 'conflict', files: ['src/a.ts', 'src/b.ts'], rebase: false }) });
    await integrateBase(app.agents.a2);
    fakeBackend({ integrate_base: () => ({ kind: 'conflict', files: ['src/a.ts'], rebase: true }) });
    await integrateBase(app.agents.a2);
    expect(app.toasts.map((t) => [t.text, t.kind])).toEqual([
      ['main a un conflit avec ccm/landing sur 1 fichier : landing doit le résoudre.', 'info'],
      ['main a des conflits avec ccm/landing sur 2 fichiers : landing doit les résoudre.', 'info'],
      ['Le rebase sur main a des conflits et a été annulé : landing doit le refaire.', 'info'],
    ]);
  });

  it('tells the refusal of the backend as it is', async () => {
    fakeBackend({
      integrate_base: () => {
        throw 'Commite ou mets de côté les changements de l’agent d’abord.';
      },
    });
    await integrateBase(app.agents.a2);
    expect(app.toasts).toEqual([
      expect.objectContaining({ text: 'Commite ou mets de côté les changements de l’agent d’abord.', kind: 'error' }),
    ]);
  });

  it('does nothing for an agent without a worktree', async () => {
    const backend = fakeBackend({ integrate_base: () => ({ kind: 'done' }) });
    await integrateBase(agent({ id: 'a1' }));
    expect(backend.called('integrate_base')).toEqual([]);
    expect(app.toasts).toEqual([]);
  });

  it('writes its toasts in English', async () => {
    setLang('en');
    fakeBackend({ integrate_base: () => ({ kind: 'done' }) });
    await integrateBase(app.agents.a2);
    expect(app.toasts.at(-1)).toMatchObject({ text: 'main integrated into ccm/landing.', kind: 'ok' });
    fakeBackend({ integrate_base: () => ({ kind: 'conflict', files: ['a', 'b'], rebase: false }) });
    await integrateBase(app.agents.a2);
    expect(app.toasts.at(-1)?.text).toBe('main conflicts with ccm/landing in 2 files: landing has to resolve them.');
  });
});
