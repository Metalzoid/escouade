import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import type { PrProposal } from '../../lib/types';
import { agent, fakeBackend, pullRequest, resetApp } from '../../test/ipc';
import PrModal from './PrModal.svelte';

const WT = { path: 'C:\\wt\\login', branch: 'escouade/login', baseBranch: 'main', existing: false };
const PROPOSAL: PrProposal = {
  title: 'Connexion par jeton',
  body: '- Ajoute le jeton\n- Le teste',
  head: 'escouade/login',
  base: 'main',
  word: 'PR',
  host: 'GitHub',
  canDraft: true,
  uncommitted: 0,
  fallback: false,
};

const title = () => screen.getByRole('textbox', { name: 'Titre' });
const body = () => screen.getByRole('textbox', { name: 'Description' });
const submit = () => screen.getByRole('button', { name: 'Pousser et ouvrir' });

describe('PrModal', () => {
  beforeEach(() => {
    resetApp({ agents: [agent({ worktree: WT })] });
    app.modal = { kind: 'pullRequest', agentId: 'a1' };
  });
  afterEach(() => setLang('fr'));

  it('shows the proposed title and description, and opens the pull request only on « Pousser et ouvrir »', async () => {
    const backend = fakeBackend({ agent_pr_propose: () => PROPOSAL, agent_pr_open: () => pullRequest({ number: 12 }) });
    render(PrModal, { agentId: 'a1' });
    expect(screen.getByText('Rédaction du titre et de la description…')).toBeInTheDocument();
    await waitFor(() => expect(title()).toHaveValue('Connexion par jeton'));
    expect(screen.getByRole('dialog', { name: 'Ouvrir une PR sur GitHub' })).toBeInTheDocument();
    // The agent, then its branch and the target in mono.
    const scope = document.querySelector('.scope')!;
    expect(scope).toHaveTextContent('refacto-auth · escouade/login → main');
    expect([...scope.querySelectorAll('.mono')].map((m) => m.textContent)).toEqual(['escouade/login', 'main']);
    expect(body()).toHaveValue('- Ajoute le jeton\n- Le teste');
    expect(screen.getByRole('textbox', { name: 'Branche cible' })).toHaveValue('main');
    expect(backend.called('agent_pr_propose').map((c) => c.args)).toEqual([{ id: 'a1' }]);
    // Proposed, never opened by itself.
    expect(backend.called('agent_pr_open')).toHaveLength(0);

    await userEvent.clear(title());
    await userEvent.type(title(), 'feat: connexion');
    await userEvent.click(screen.getByRole('checkbox', { name: 'En brouillon' }));
    await userEvent.click(submit());
    expect(backend.called('agent_pr_open').map((c) => c.args)).toEqual([
      { id: 'a1', form: { title: 'feat: connexion', body: '- Ajoute le jeton\n- Le teste', base: 'main', draft: true } },
    ]);
    expect(app.modal).toBeNull();
    expect(app.toasts.at(-1)).toMatchObject({ text: 'PR #12 ouverte.', kind: 'ok' });
  });

  it('says why nothing can be proposed, and keeps the host’s refusal in the window', async () => {
    fakeBackend({
      agent_pr_propose: () => {
        throw 'Rien à proposer : escouade/login n’a aucun commit de plus que main.';
      },
    });
    const { unmount } = render(PrModal, { agentId: 'a1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Rien à proposer');
    expect(screen.queryByRole('button', { name: 'Pousser et ouvrir' })).not.toBeInTheDocument();
    unmount();

    fakeBackend({
      agent_pr_propose: () => ({ ...PROPOSAL, uncommitted: 2, fallback: true, canDraft: false, word: 'MR', host: 'GitLab' }),
      agent_pr_open: () => {
        throw 'GitHub : 422 Validation Failed';
      },
    });
    render(PrModal, { agentId: 'a1' });
    await waitFor(() => expect(title()).toHaveValue('Connexion par jeton'));
    expect(screen.getByText('2 fichiers non commités du worktree ne seront pas dans la MR.')).toBeInTheDocument();
    expect(screen.getByText(/titre et description tirés des commits/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'En brouillon' })).not.toBeInTheDocument();
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('422 Validation Failed');
    expect(app.modal).toEqual({ kind: 'pullRequest', agentId: 'a1' });
  });

  it('is written in English', async () => {
    setLang('en');
    fakeBackend({ agent_pr_propose: () => PROPOSAL });
    render(PrModal, { agentId: 'a1' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Connexion par jeton'));
    expect(screen.getByRole('dialog', { name: 'Open a PR on GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Push and open' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'As a draft' })).toBeInTheDocument();
  });
});
