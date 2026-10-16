import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import { fakeBackend, project, resetApp } from '../../test/ipc';
import SettingsModal from '../modals/SettingsModal.svelte';

vi.mock('../../lib/terminals', () => ({ launchLog: () => ({}), disposeLog() {} }));

const save = () => userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

describe('ProjectTab', () => {
  beforeEach(() => {
    resetApp({ projects: [project(), project({ id: 'p2', name: 'site' })] });
    app.modal = { kind: 'settings' };
  });

  it('has no switch of its own for Escouade’s tools: the app’s one gives them to every agent (ESC-91)', async () => {
    const backend = fakeBackend();
    render(SettingsModal, { tab: 'projects', projectId: 'p1' });
    expect(screen.queryByRole('switch', { name: 'Les agents peuvent utiliser Escouade' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Serveur MCP' })).not.toBeInTheDocument();
    // A change of the project saves nothing of the kind.
    await userEvent.click(screen.getByRole('switch', { name: 'Un worktree par agent' }));
    await save();
    expect(backend.called('update_project')).toHaveLength(1);
    expect(backend.called('update_project')[0].args.project).not.toHaveProperty('agentsUseEscouade');
  });

  it('sets where the worktrees go and how their branches are named, and says where the next one goes', async () => {
    const backend = fakeBackend();
    render(SettingsModal, { tab: 'projects', projectId: 'p1' });
    const dir = screen.getByRole('textbox', { name: 'Dossier des worktrees' });
    expect(dir).toHaveValue('');
    expect(dir).toHaveAttribute('placeholder', '.claude/worktrees');
    expect(dir).toHaveAccessibleDescription(/Le prochain : C:\\code\\demo-api\\\.claude\\worktrees\\<nom>/);
    const agents = screen.getByRole('textbox', { name: 'Préfixe des branches des agents' });
    const tickets = screen.getByRole('textbox', { name: 'Préfixe des branches des tickets' });
    expect(agents).toHaveValue('escouade/');
    expect(tickets).toHaveValue('ticket/');
    expect(screen.getByText('Branche d’un nouvel agent : escouade/<nom>. Vide : son nom seul.')).toBeInTheDocument();
    await userEvent.type(dir, '../demo-api-worktrees');
    expect(screen.getByText('Le prochain : C:\\code\\demo-api-worktrees\\<nom>')).toBeInTheDocument();
    await userEvent.clear(agents);
    await userEvent.type(agents, 'gg/');
    expect(screen.getByText('Branche d’un nouvel agent : gg/<nom>. Vide : son nom seul.')).toBeInTheDocument();
    await userEvent.clear(tickets);
    await save();
    expect(backend.called('update_project')[0].args.project).toMatchObject({
      id: 'p1',
      worktreeDir: '../demo-api-worktrees',
      agentBranchPrefix: 'gg/',
      ticketBranchPrefix: '',
    });
    expect(app.projects[0]).toMatchObject({ worktreeDir: '../demo-api-worktrees', agentBranchPrefix: 'gg/', ticketBranchPrefix: '' });
  });

  it('refuses a worktrees folder or a branch prefix that cannot be, and saves nothing until it is fixed', async () => {
    const backend = fakeBackend();
    render(SettingsModal, { tab: 'projects', projectId: 'p1' });
    const saveButton = screen.getByRole('button', { name: 'Enregistrer' });
    const dir = screen.getByRole('textbox', { name: 'Dossier des worktrees' });
    await userEvent.type(dir, '../demo-api');
    expect(dir).toHaveAttribute('aria-invalid', 'true');
    expect(dir).toHaveAccessibleDescription(/C’est le dossier du projet lui-même\./);
    expect(screen.getByText('Le dossier des worktrees ou un préfixe de branche de « demo-api » n’est pas valide.')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    await userEvent.clear(dir);
    await userEvent.type(dir, '..');
    expect(dir).toHaveAccessibleDescription(/Ce dossier contient celui du projet : choisis-en un à côté/);
    await userEvent.clear(dir);
    await userEvent.type(dir, 'D:wt');
    expect(dir).toHaveAccessibleDescription(/Écris un chemin relatif au dossier du projet, ou un chemin complet \(C:\\…\)\./);
    await userEvent.clear(dir);
    await userEvent.type(dir, '.git/wt');
    expect(dir).toHaveAccessibleDescription(/Ce dossier est dans un dossier \.git\./);
    await userEvent.clear(dir);
    expect(dir).toHaveAttribute('aria-invalid', 'false');
    expect(saveButton).toBeEnabled();
    const tickets = screen.getByRole('textbox', { name: 'Préfixe des branches des tickets' });
    await userEvent.type(tickets, ' x');
    expect(tickets).toHaveAttribute('aria-invalid', 'true');
    expect(tickets).toHaveAccessibleDescription(/Aucun nom de branche ne commence ainsi.*« \\ » ou « @\{ »/);
    expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    expect(backend.called('update_project')).toHaveLength(0);
  });

  it('says in the sensitive zone that closing the project keeps its history, and offers to erase it with the question', async () => {
    fakeBackend();
    render(SettingsModal, { tab: 'projects', projectId: 'p1' });
    expect(
      screen.getByText(
        "Le projet quitte l'application : ses agents, ses terminaux et ses lancements s'arrêtent. Son historique (conversations, tickets, réglages) est gardé : rouvrir ce dossier le retrouve. Les fichiers et les worktrees sur le disque ne sont pas touchés.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le projet…' }));
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      option: { label: 'Effacer aussi son historique (conversations, tickets, réglages)', value: false },
    });
  });

  it('says it in English', () => {
    setLang('en');
    fakeBackend();
    render(SettingsModal, { tab: 'projects', projectId: 'p1' });
    expect(screen.getByRole('heading', { name: 'Identity' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'The project leaves the app: its agents, terminals and launches stop. Its history (conversations, tickets, settings) is kept: adding this folder again brings it back. The files and worktrees on disk are not touched.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MCP server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Agents can use Escouade' })).not.toBeInTheDocument();
  });
});
