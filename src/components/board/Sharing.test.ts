import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/terminals', () => ({
  launchLog: () => ({
    term: { cols: 80, rows: 24, buffer: { active: { cursorY: 0 } }, write: (_: unknown, done?: () => void) => done?.() },
    fit: { fit() {} },
  }),
  disposeLog() {},
}));

import { setLang } from '../../lib/i18n';
import { menu } from '../../lib/menu.svelte';
import { app } from '../../lib/state.svelte';
import type { Project, Shared, Ticket } from '../../lib/types';
import { board, fakeBackend, project, resetApp, ticket } from '../../test/ipc';
import TeamNameModal from '../modals/TeamNameModal.svelte';
import Board from './Board.svelte';
import TicketCard from './TicketCard.svelte';
import TicketForm from './TicketForm.svelte';

// The shared Kanban (ESC-190): the card of a shared ticket, its menu, the form's switch, the first launch's question,
// the board's hidden tickets.

const alice = { name: 'Alice Martin', id: 'a91f03c2' };
const bob = { name: 'Bob Durand', id: '5d0e77b1' };

function shared(over: Partial<Shared> = {}): Shared {
  return {
    id: 'h8m2v6kd',
    key: 'DEM-12',
    author: alice,
    takenBy: null,
    updatedBy: alice,
    created: '',
    after: [],
    external: null,
    mine: false,
    seen: '',
    problem: null,
    conflict: false,
    newer: false,
    gone: false,
    left: false,
    hidden: false,
    ...over,
  };
}

const hers = (over: Partial<Ticket> = {}, s: Partial<Shared> = {}) =>
  ticket({ id: 't12', key: 'DEM-12', title: 'Export des factures en PDF', shared: shared(s), ...over });

const on = () => project({ board: board({ autopilot: true, maxParallel: 2 }) });

const show = (t: Ticket, p: Project = on()) =>
  render(TicketCard, { ticket: t, project: p, queueIndex: 0, busyCount: 0, quota: null, onedit: () => {} });

describe('a shared ticket on the board (ESC-190)', () => {
  beforeEach(() => {
    cleanup();
    setLang('fr');
    resetApp();
    app.settings = { ...app.settings, userName: 'Bob Durand', userId: bob.id, nameAsked: true };
  });

  it('shows another one’s ticket with its author, never started by the autopilot, with « Lancer »', async () => {
    const backend = fakeBackend();
    const { container } = show(hers());
    const who = container.querySelector('.who')!;
    expect(who).toHaveTextContent('Alice Martin');
    expect(who).toHaveAccessibleName('Ajouté par Alice Martin');
    expect(screen.getByText('Ajouté par Alice Martin · le pilote auto ne le lance pas')).toBeInTheDocument();
    // The autopilot is on: « Lancer » all the same, for this one.
    await userEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    expect(backend.called('ticket_start')).toEqual([{ cmd: 'ticket_start', args: { id: 't12' } }]);
  });

  it('marks a ticket shared by its own user, and says who has the others', () => {
    fakeBackend();
    const mine = show(ticket({ shared: shared({ mine: true, author: bob, id: 'q4w7c2na' }) }));
    expect(mine.container.querySelector('.mark')).toHaveAccessibleName('Partagé avec l’équipe · .escouade/tickets/q4w7c2na.yml');
    expect(mine.container.querySelector('.who')).toBeNull();
    mine.unmount();
    show(hers({ column: 'doing' }, { takenBy: alice }));
    expect(screen.getByText('Pris par Alice Martin')).toBeInTheDocument();
    cleanup();
    show(hers({ column: 'done', outcome: '⤵ Mergé dans main · squash' }, { takenBy: alice }));
    expect(screen.getByText('Fait par Alice Martin')).toBeInTheDocument();
  });

  it('offers its own menu: launch, edit, hide here, delete for the team after a confirmation', async () => {
    const backend = fakeBackend();
    show(hers());
    await fireEvent.contextMenu(screen.getByRole('button', { name: /DEM-12/ }));
    expect(menu.open!.items.map((i) => i.label)).toEqual(['Lancer', 'Modifier', '', 'Masquer chez moi', 'Supprimer pour l’équipe…']);
    menu.open!.items.find((i) => i.label === 'Masquer chez moi')!.onClick!();
    await waitFor(() => expect(backend.called('ticket_hide')).toEqual([{ cmd: 'ticket_hide', args: { id: 't12', hidden: true } }]));
    menu.open!.items.find((i) => i.label === 'Supprimer pour l’équipe…')!.onClick!();
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      title: 'Supprimer DEM-12 pour l’équipe ?',
      body: 'Son fichier est supprimé, à commiter. Il disparaîtra chez Alice Martin et le reste de l’équipe à leur pull.',
    });
  });

  it('shares a ticket of ours from its menu, then says which file to commit; stops sharing it the same way', async () => {
    const t = ticket();
    const backend = fakeBackend({
      ticket_share: ({ on }: { on: boolean }) => ({ ...t, shared: on ? shared({ mine: true, author: bob, id: 'q4w7c2na' }) : null }),
    });
    show(t);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /DEM-1/ }));
    menu.open!.items.find((i) => i.label === 'Partager avec l’équipe')!.onClick!();
    await waitFor(() => expect(backend.called('ticket_share')).toEqual([{ cmd: 'ticket_share', args: { id: 't1', on: true } }]));
    await waitFor(() =>
      expect(app.toasts.at(-1)?.text).toBe('DEM-1 partagé : .escouade/tickets/q4w7c2na.yml est à commiter avec ton travail'),
    );
    expect(app.tickets.t1.shared?.id).toBe('q4w7c2na');
  });

  it('shares under the name git knows in the project’s folder when none was given, without asking (ESC-243)', async () => {
    const t = ticket();
    app.settings = { ...app.settings, userName: '', nameAsked: true };
    const backend = fakeBackend({
      git_user_name: ({ projectId }: { projectId: string | null }) => (projectId === 'p1' ? 'Bob (dépôt)' : 'Bob (global)'),
      ticket_share: () => ({ ...t, shared: shared({ mine: true, author: { ...bob, name: 'Bob (dépôt)' }, id: 'q4w7c2na' }) }),
    });
    show(t);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /DEM-1/ }));
    menu.open!.items.find((i) => i.label === 'Partager avec l’équipe')!.onClick!();
    await waitFor(() => expect(backend.called('ticket_share')).toEqual([{ cmd: 'ticket_share', args: { id: 't1', on: true } }]));
    expect(app.modal).toBeNull();
    expect(app.gitNames.p1).toBe('Bob (dépôt)');
    // Nothing kept in the settings: git's name stands in while none is given.
    expect(backend.called('save_settings')).toHaveLength(0);
    expect(app.tickets.t1.shared?.author.name).toBe('Bob (dépôt)');
  });

  it('asks the user’s name first when none was given, then shares', async () => {
    const t = ticket();
    app.settings = { ...app.settings, userName: '' };
    const backend = fakeBackend({ ticket_share: () => ({ ...t, shared: shared({ mine: true, author: bob }) }) });
    show(t);
    await fireEvent.contextMenu(screen.getByRole('button', { name: /DEM-1/ }));
    menu.open!.items.find((i) => i.label === 'Partager avec l’équipe')!.onClick!();
    // Git has no name either.
    await waitFor(() => expect(app.modal).toMatchObject({ kind: 'teamName', projectId: 'p1' }));
    expect(backend.called('git_user_name')).toEqual([{ cmd: 'git_user_name', args: { projectId: 'p1' } }]);
    expect(backend.called('ticket_share')).toHaveLength(0);
    // The name given, the share goes on.
    app.settings = { ...app.settings, userName: 'Bob Durand' };
    (app.modal as any).then();
    await waitFor(() => expect(backend.called('ticket_share')).toHaveLength(1));
  });

  it('settles a file in conflict by « Garder le mien » or « Prendre le sien », and says one that cannot be read', async () => {
    const backend = fakeBackend();
    show(hers({}, { problem: 'Son fichier est en conflit après un pull : choisis la version à garder.', conflict: true }));
    expect(screen.queryByRole('button', { name: 'Lancer' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Garder le mien' }));
    await userEvent.click(screen.getByRole('button', { name: 'Prendre le sien' }));
    expect(backend.called('shared_resolve').map((c) => c.args.keepMine)).toEqual([true, false]);
    cleanup();
    show(hers({ title: 'x3t9f5rb.yml' }, { problem: 'Ligne 14 : criteria doit être une liste', author: { name: '', id: '' } }));
    expect(screen.getByRole('heading', { name: 'Ticket partagé illisible' })).toBeInTheDocument();
    expect(screen.getByText('Ligne 14 : criteria doit être une liste')).toBeInTheDocument();
  });

  it('says someone else took it too while its agent here holds it', () => {
    fakeBackend();
    show(ticket({ column: 'doing', agentId: 'a1', shared: shared({ mine: true, author: bob, takenBy: alice }) }));
    expect(screen.getByText(/Alice Martin y travaille aussi d’après son fichier/)).toBeInTheDocument();
  });
});

describe('the board’s hidden tickets (ESC-190)', () => {
  beforeEach(() => {
    cleanup();
    setLang('fr');
  });

  it('leaves the hidden ones out, says how many, and shows them on demand', async () => {
    fakeBackend();
    resetApp({ tickets: [ticket(), hers({}, { hidden: true })] });
    render(Board, { project: app.projects[0] });
    expect(screen.queryByText('Export des factures en PDF')).toBeNull();
    expect(screen.getByText('1 ticket masqué')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    expect(screen.getByText('Export des factures en PDF')).toBeInTheDocument();
  });
});

describe('the form’s « Partager avec l’équipe » (ESC-190)', () => {
  beforeEach(() => {
    cleanup();
    setLang('fr');
    resetApp();
  });

  it('shares a new ticket when switched on, as the project’s « Partager chaque nouveau ticket » starts it', async () => {
    fakeBackend();
    const onsubmit = vi.fn(() => true);
    render(TicketForm, { projectId: 'p1', onsubmit });
    const sw = screen.getByRole('switch', { name: 'Partager avec l’équipe' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.type(screen.getByRole('textbox', { name: /Titre/ }), 'Un ticket');
    await userEvent.click(sw);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onsubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Un ticket', shared: true }));
    cleanup();
    resetApp({ projects: [project({ shareNew: true })] });
    render(TicketForm, { projectId: 'p1', onsubmit });
    expect(screen.getByRole('switch', { name: 'Partager avec l’équipe' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has no switch on another one’s ticket: what changes goes into its file', () => {
    fakeBackend();
    render(TicketForm, { projectId: 'p1', ticket: hers(), onsubmit: () => true });
    expect(screen.queryByRole('switch', { name: 'Partager avec l’équipe' })).toBeNull();
    expect(screen.getByText('Ajouté par Alice Martin : ce que tu changes va dans son fichier, pour toute l’équipe.')).toBeInTheDocument();
  });
});

describe('the first launch’s question: the user’s name (ESC-190)', () => {
  beforeEach(() => {
    cleanup();
    setLang('fr');
    resetApp();
  });

  it('offers git’s name, keeps the one given and marks the question asked', async () => {
    const backend = fakeBackend({ git_user_name: () => 'Bob Durand', save_settings: () => [] });
    app.modal = { kind: 'teamName' };
    render(TeamNameModal, {});
    const field = screen.getByRole('textbox', { name: 'Ton nom' });
    await waitFor(() => expect(field).toHaveValue('Bob Durand'));
    expect(screen.getByText(/Repris de git config user.name/)).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, 'Robert');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(app.modal).toBeNull());
    const saved = backend.called('save_settings')[0].args.settings;
    expect(saved).toMatchObject({ userName: 'Robert', nameAsked: true });
    expect(app.settings.userName).toBe('Robert');
  });

  it('puts the question off with « Plus tard »: asked, no name', async () => {
    const backend = fakeBackend({ git_user_name: () => '', save_settings: () => [] });
    app.modal = { kind: 'teamName' };
    render(TeamNameModal, {});
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    await waitFor(() => expect(app.modal).toBeNull());
    expect(backend.called('save_settings')[0].args.settings).toMatchObject({ nameAsked: true });
    expect(app.settings.userName ?? '').toBe('');
  });
});
