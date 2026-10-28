import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { docsStore } from '../../lib/docs.svelte';
import { shareDocs } from '../../lib/docs-share';
import { app } from '../../lib/state.svelte';
import { fakeBackend, project, resetApp } from '../../test/ipc';
import type { DocsPage, DocsTree } from '../../lib/types';
import DocsShareItem from './DocsShareItem.svelte';
import DocsSidebar from './DocsSidebar.svelte';
import DocsView from './DocsView.svelte';

const info = (path: string, title: string, o: object = {}) => ({
  path,
  title,
  compared: '',
  tickets: [],
  decisions: [],
  gaps: 0,
  draft: false,
  ...o,
});

const TREE: DocsTree = {
  branch: '',
  pages: 4,
  subjects: [
    {
      name: 'adhesion',
      title: 'Adhésion en ligne',
      pages: [info('adhesion/formulaire', 'Formulaire', { tickets: ['DEM-1'] }), info('adhesion/pieces', 'Pièces justificatives')],
    },
    {
      name: 'paiement',
      title: 'Paiement',
      pages: [info('paiement/plusieurs-fois', 'En plusieurs fois', { gaps: 1, decisions: [4], compared: '2026-10-28T08:00:00Z' })],
    },
    { name: 'notifications', title: 'Notifications', pages: [info('notifications/emails', 'E-mails', { draft: true })] },
  ],
  existingSpec: [],
};

const PAGE: DocsPage = {
  path: 'paiement/plusieurs-fois',
  title: 'En plusieurs fois',
  subject: 'Paiement',
  sources: ['documents/cahier-des-charges.pdf'],
  tickets: ['DEM-31'],
  decisions: [4],
  compared: '2026-10-28T08:00:00Z',
  gaps: [{ text: 'La spec dit 3 fois au plus ; le code accepte 4 échéances.', code: ['src/payment.ts'] }],
  draft: false,
  order: 0,
  body: '## Règle\n\nTrois échéances **au plus**.',
};

function backend(over: Record<string, (a: any) => unknown> = {}) {
  return fakeBackend({
    docs_spec_tree: () => TREE,
    docs_decisions: () => [],
    docs_drive: () => ({ folders: [], files: [] }),
    docs_recent: () => [{ when: 1_761_640_000, author: 'Claire', message: 'Docs', pages: ['paiement/plusieurs-fois'] }],
    docs_pending: () => ({ files: ['.escouade/spec/adhesion/pieces.md'], count: 1, codeCommits: 0, conflict: null }),
    docs_spec_page: () => PAGE,
    ...over,
  });
}

describe('the Docs tab', () => {
  beforeEach(() => {
    resetApp();
    docsStore.tree = {};
    docsStore.pending = {};
    app.openDocs('p1');
  });

  it('lists its three spaces, the spec with its gaps, and opens each', async () => {
    backend();
    await docsStore.load('p1');
    render(DocsSidebar, { project: app.projects[0] });
    const spaces = screen.getByRole('region', { name: 'Espaces des docs' });
    expect(within(spaces).getByRole('button', { name: /Spécification/ })).toHaveTextContent('1 écart');
    await userEvent.click(within(spaces).getByRole('button', { name: /Décisions/ }));
    expect(app.docsSpace.p1).toBe('decisions');
  });

  it('shows the map of the subjects with their state against the code, and the tree of the pages', async () => {
    backend();
    render(DocsView, { project: app.projects[0] });
    const map = await screen.findByRole('list', { name: 'Sujets de la spécification' });
    const card = (name: string) => within(map).getByRole('button', { name: `Ouvrir le sujet ${name}` });
    expect(card('Adhésion en ligne')).toHaveTextContent('À jour');
    expect(card('Adhésion en ligne')).toHaveTextContent('2 pages');
    expect(card('Adhésion en ligne')).toHaveTextContent('1 ticket');
    expect(card('Paiement')).toHaveTextContent('1 écart');
    expect(card('Notifications')).toHaveTextContent('Brouillon');
    // What changed: here, not shared yet, then committed.
    expect(screen.getByText('1 page modifiée ici, pas encore partagée')).toBeInTheDocument();
    expect(screen.getByText(/Claire a modifié Paiement/)).toBeInTheDocument();
    // The head of the spec.
    expect(document.querySelector('[data-stat="gaps"]')).toHaveTextContent('1 écart avec le code');
    expect(document.querySelector('[data-stat="ok"]')).toHaveTextContent('2 pages à jour');
    // The tree: by subject, its marks.
    const tree = screen.getByRole('navigation', { name: 'Pages de la spécification' });
    expect(within(tree).getByRole('button', { name: /En plusieurs fois/ })).toHaveTextContent('écart');
    expect(within(tree).getByRole('button', { name: /Pièces justificatives/ })).toHaveTextContent('à partager');
    await userEvent.click(within(tree).getByRole('button', { name: 'Replier Adhésion en ligne' }));
    expect(within(tree).queryByRole('button', { name: /Formulaire/ })).toBeNull();
  });

  it('opens a page with its gaps, its sources, and writes it', async () => {
    let page = PAGE;
    const b = backend({
      docs_spec_page: () => page,
      docs_spec_write: (a) => (page = { ...PAGE, body: a.body, title: a.title }),
    });
    render(DocsView, { project: app.projects[0] });
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir le sujet Paiement' }));
    expect(app.docsPage.p1).toBe('paiement/plusieurs-fois');
    const gaps = await screen.findByRole('region', { name: 'Un écart avec le code' });
    expect(gaps).toHaveTextContent('le code accepte 4 échéances');
    // « Mettre la spec à jour » waits for the discussions.
    expect(screen.queryByRole('button', { name: 'Mettre la spec à jour' })).toBeNull();
    expect(screen.getByText('documents/cahier-des-charges.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Règle' })).toBeInTheDocument();
    // « Ouvrir un ticket pour le code »: the ticket's window, written from the gap.
    await userEvent.click(within(gaps).getByRole('button', { name: 'Ouvrir un ticket pour le code' }));
    expect(app.modal).toMatchObject({
      kind: 'ticket',
      projectId: 'p1',
      resume: { title: 'Aligner le code sur la spec : En plusieurs fois' },
    });
    expect((app.modal as { resume: { description: string } }).resume.description).toContain('src/payment.ts');
    app.modal = null;
    // Edited in the simple editor, then saved.
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const text = screen.getByRole('textbox', { name: 'Texte de la page, en Markdown' });
    await userEvent.clear(text);
    await userEvent.type(text, 'Quatre échéances.');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(b.called('docs_spec_write')).toHaveLength(1));
    expect(b.called('docs_spec_write')[0].args).toMatchObject({ id: 'p1', path: 'paiement/plusieurs-fois', body: 'Quatre échéances.' });
    expect(await screen.findByText('Quatre échéances.')).toBeInTheDocument();
  });

  it('starts a project without a spec from an empty space that offers the spec it has, then imports its cut', async () => {
    let imported = false;
    const b = backend({
      docs_spec_tree: () =>
        imported
          ? TREE
          : { branch: '', pages: 0, subjects: [], existingSpec: [{ path: 'docs/SPEC.md', kind: 'file', files: 1, bytes: 4096 }] },
      docs_import_plan: () => [
        { path: 'paiement/moyens', subject: 'Paiement', title: 'Moyens', source: 'docs/SPEC.md', lines: 4, exists: false },
        {
          path: 'paiement/plusieurs-fois',
          subject: 'Paiement',
          title: 'En plusieurs fois',
          source: 'docs/SPEC.md',
          lines: 2,
          exists: false,
        },
        { path: 'back/office', subject: 'Back-office', title: 'Back-office', source: 'docs/SPEC.md', lines: 1, exists: true },
      ],
      docs_import: (a) => {
        imported = true;
        return { written: a.only, skipped: [] };
      },
    });
    render(DocsView, { project: app.projects[0] });
    expect(await screen.findByText('Pas encore de spécification')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir le découpage' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Paiement')).toBeInTheDocument();
    expect(within(dialog).getByText('déjà là, gardée')).toBeInTheDocument();
    // Nothing written before « Importer »; a page left out stays out.
    expect(b.called('docs_import')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Importer la page Moyens' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Importer 1 page' }));
    await waitFor(() => expect(b.called('docs_import')).toHaveLength(1));
    expect(b.called('docs_import')[0].args).toEqual({ id: 'p1', path: 'docs/SPEC.md', only: ['paiement/plusieurs-fois'] });
    expect(await screen.findByRole('list', { name: 'Sujets de la spécification' })).toBeInTheDocument();
  });

  it('makes a new page under its subject and opens it to be written', async () => {
    const b = backend({ docs_spec_write: (a) => ({ ...PAGE, path: a.path, title: a.title, subject: a.subject, gaps: [], body: '' }) });
    render(DocsView, { project: app.projects[0] });
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle page' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Sujet' }), 'Espace adhérent');
    await userEvent.type(screen.getByRole('textbox', { name: 'Titre' }), 'Reçus fiscaux');
    await userEvent.click(screen.getByRole('button', { name: 'Créer la page' }));
    await waitFor(() => expect(b.called('docs_spec_write')).toHaveLength(1));
    expect(b.called('docs_spec_write')[0].args).toMatchObject({ path: 'espace-adherent/recus-fiscaux', subject: 'Espace adhérent' });
    expect(app.docsPage.p1).toBe('espace-adherent/recus-fiscaux');
    expect(await screen.findByRole('textbox', { name: 'Texte de la page, en Markdown' })).toBeInTheDocument();
  });
});

describe('sharing the docs', () => {
  beforeEach(() => resetApp({ projects: [project({ docsBranch: 'docs' })] }));

  it('says the docs branch and what is left to share, and shares at the click', async () => {
    const b = backend({ docs_share: () => ({ kind: 'done', committed: 2, message: 'm', pulled: false }) });
    app.docsShare.p1 = { pending: 2, conflict: null };
    render(DocsShareItem, { projectId: 'p1' });
    const item = screen.getByText('2 changements à partager').closest('[data-docs-share]')!;
    expect(item).toHaveTextContent('Docs sur la branche docs');
    await userEvent.click(screen.getByRole('button', { name: 'Partager' }));
    await waitFor(() => expect(b.called('docs_share')).toHaveLength(1));
    expect(b.called('docs_share')[0].args).toMatchObject({ id: 'p1', withCode: false });
  });

  it('asks before code not pushed leaves with the docs', async () => {
    const b = backend({
      docs_pending: () => ({ files: [], count: 1, codeCommits: 3, conflict: null }),
      docs_share: () => ({ kind: 'done', committed: 1, message: 'm', pulled: false }),
    });
    await shareDocs('p1');
    expect(b.called('docs_share')).toHaveLength(0);
    expect(app.modal).toMatchObject({ kind: 'confirm', confirm: 'Tout partager' });
    await (app.modal as { onConfirm: (o: boolean) => Promise<void> }).onConfirm(false);
    expect(b.called('docs_share')[0].args).toMatchObject({ withCode: true });
  });

  it('hands a conflict to the writer agent or cancels it, never in lines of git', async () => {
    const b = backend({ docs_share_resolve: () => ({ files: ['.escouade/spec/a/b.md'], target: 'origin/docs', agentId: 'w1' }) });
    app.docsShare.p1 = { pending: 1, conflict: { files: ['.escouade/spec/a/b.md'], target: 'origin/docs', agentId: null } };
    render(DocsShareItem, { projectId: 'p1' });
    expect(screen.getByRole('status')).toHaveTextContent('Deux personnes ont modifié les mêmes pages');
    await userEvent.click(screen.getByRole('button', { name: 'L’agent résout' }));
    await waitFor(() => expect(b.called('docs_share_resolve')).toHaveLength(1));
    expect(await screen.findByText('L’agent rédacteur résout le conflit')).toBeInTheDocument();
  });
});
