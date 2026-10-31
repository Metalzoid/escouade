import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { docsStore } from '../../lib/docs.svelte';
import { app } from '../../lib/state.svelte';
import { fakeBackend, resetApp } from '../../test/ipc';
import type { DocsDrive, DocsFile } from '../../lib/types';
import DocumentsSpace from './DocumentsSpace.svelte';

// The drive of the documents (ESC-260): its folders and files, what the agents did with each, a folder opened, the
// search, a file dropped filed by itself and said where, and a heavy one asked about first.

const file = (path: string, o: Partial<DocsFile> = {}): DocsFile => {
  const name = path.split('/').pop()!;
  return {
    path,
    name,
    folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    size: 48 * 1024,
    kind: name.endsWith('.pdf') ? 'pdf' : name.endsWith('.docx') ? 'word' : 'text',
    readable: true,
    modified: Date.now() - 5 * 86_400_000,
    author: 'Claire',
    reads: 0,
    cited: 0,
    ...o,
  };
};

const DRIVE: DocsDrive = {
  folders: [
    { path: 'Comptes rendus', name: 'Comptes rendus', files: 2 },
    { path: 'Comptes rendus/2026', name: '2026', files: 1 },
    { path: 'Juridique', name: 'Juridique', files: 1 },
  ],
  files: [
    file('Comptes rendus/CR atelier du 22-10.docx', { reads: 2, cited: 3 }),
    file('Comptes rendus/2026/CR comite.pdf', { reads: 1 }),
    file('Juridique/contrat.pdf', { readable: false, kind: 'pdf' }),
  ],
};

function backend(over: Record<string, (a: any) => unknown> = {}) {
  return fakeBackend({
    docs_spec_tree: () => ({ branch: '', pages: 0, subjects: [], existingSpec: [] }),
    docs_decisions: () => [],
    docs_drive: () => DRIVE,
    docs_recent: () => [],
    docs_pending: () => ({ files: [], count: 0, codeCommits: 0, conflict: null }),
    ...over,
  });
}

const project = () => app.projects[0];

describe('the drive of the documents', () => {
  beforeEach(() => {
    resetApp();
    docsStore.documents = {};
    docsStore.folders = {};
    app.openDocs('p1', 'documents');
  });

  it('shows the folders and the files, each with what the agents did with it', async () => {
    backend();
    await docsStore.load('p1');
    render(DocumentsSpace, { project: project() });
    const tree = screen.getByRole('navigation', { name: 'Dossiers des documents' });
    // The root counts all of them; a folder with folders under it unfolds.
    expect(within(tree).getByRole('button', { name: /Tous les documents\s*3/ })).toBeTruthy();
    expect(within(tree).queryByRole('button', { name: /^2026/ })).toBeNull();
    await userEvent.click(within(tree).getByRole('button', { name: 'Déplier Comptes rendus' }));
    expect(within(tree).getByRole('button', { name: /^2026/ })).toBeTruthy();
    const card = document.querySelector('[data-document="Comptes rendus/CR atelier du 22-10.docx"]')!;
    expect(card.textContent).toContain('DOCX');
    expect(card.textContent).toContain('CR atelier du 22-10');
    expect(card.textContent).toContain('Claire · 48 Ko');
    expect(card.textContent).toContain('✓ lu par les agents · cité 3 fois');
    expect(document.querySelector('[data-document="Juridique/contrat.pdf"] [data-read]')!.textContent).toContain('texte non lu');
    // A folder opened shows what is under it, and the crumb leads back.
    await userEvent.click(within(tree).getByRole('button', { name: /^Comptes rendus\s*2/ }));
    expect(document.querySelectorAll('[data-document]')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Comptes rendus' })).toBeTruthy();
    expect(screen.getByText('Glisse des fichiers ici pour les ranger dans « Comptes rendus »')).toBeTruthy();
  });

  it('searches the documents and opens one found', async () => {
    const b = backend({
      docs_documents_search: () => [
        {
          path: 'Comptes rendus/2026/CR comite.pdf',
          name: 'CR comite.pdf',
          folder: 'Comptes rendus/2026',
          kind: 'pdf',
          excerpt: 'Le bureau valide les adhésions.',
        },
      ],
      docs_document_text: () => ({
        path: 'Comptes rendus/2026/CR comite.pdf',
        kind: 'pdf',
        text: 'Le bureau valide les adhésions.',
        total: 31,
        from: 0,
        truncated: false,
      }),
    });
    await docsStore.load('p1');
    render(DocumentsSpace, { project: project() });
    await userEvent.click(screen.getByRole('button', { name: /Rechercher dans les documents/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Recherche dans les documents' }), 'adhésions');
    const hit = await screen.findByText('Le bureau valide les adhésions.');
    expect(b.called('docs_documents_search').at(-1)!.args).toEqual({ id: 'p1', query: 'adhésions' });
    await userEvent.click(hit);
    const dialog = await screen.findByRole('dialog', { name: 'CR comite.pdf' });
    await waitFor(() => expect(within(dialog).getByText('Le bureau valide les adhésions.')).toBeTruthy());
  });

  it('drops a file on the drive: copied, filed by Escouade, and says where it went', async () => {
    const b = backend({
      docs_document_check: (a) => a.files.map((f: any) => ({ ...f, lfs: false, large: false })),
      attach_open: () => 'h1',
      attach_finish: () => ({ name: 'scan.pdf', path: 'C:/data/drafts/x/scan.pdf', claudePath: '', size: 2, origin: false }),
      docs_document_add: () => ({
        file: file('Comptes rendus/scan.pdf'),
        placement: { folder: 'Comptes rendus', new: false, by: 'sort' },
        lfs: false,
      }),
    });
    await docsStore.load('p1');
    render(DocumentsSpace, { project: project() });
    const input = document.querySelector('[data-documents-input]') as HTMLInputElement;
    await userEvent.upload(input, new File(['PK'], 'scan.pdf'));
    const notice = await screen.findByText('« scan.pdf » rangé dans « Comptes rendus », d’après sa nature');
    expect(notice).toBeTruthy();
    // On the drive itself: no folder given, Escouade files it; the copy goes once it is in.
    expect(b.called('docs_document_add')[0].args).toEqual({
      id: 'p1',
      folder: null,
      source: 'C:/data/drafts/x/scan.pdf',
      confirmed: false,
    });
    expect(b.called('attach_discard')[0].args).toEqual({ owner: 'draft', path: 'C:/data/drafts/x/scan.pdf' });
    // Moved from the notice.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Déplacer « scan.pdf »' }), 'Juridique');
    await waitFor(() =>
      expect(b.called('docs_document_move')[0]?.args).toEqual({ id: 'p1', path: 'Comptes rendus/scan.pdf', folder: 'Juridique' }),
    );
  });

  it('asks before a heavy file without an LFS rule goes in, and leaves it out when told', async () => {
    const b = backend({
      docs_document_check: (a) => a.files.map((f: any) => ({ ...f, lfs: false, large: f.name === 'film.mp4' })),
      attach_open: () => 'h1',
      attach_finish: () => ({ name: 'cr.md', path: 'C:/d/cr.md', claudePath: '', size: 2, origin: false }),
      docs_document_add: () => ({
        file: file('Juridique/cr.md'),
        placement: { folder: 'Juridique', new: false, by: 'chosen' },
        lfs: false,
      }),
    });
    await docsStore.load('p1');
    render(DocumentsSpace, { project: project() });
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Dossiers des documents' })).getByRole('button', { name: /^Juridique/ }),
    );
    const input = document.querySelector('[data-documents-input]') as HTMLInputElement;
    await userEvent.upload(input, [new File(['x'], 'film.mp4'), new File(['# CR'], 'cr.md')]);
    const ask = await screen.findByRole('dialog', { name: 'Fichiers lourds' });
    expect(within(ask).getByText('film.mp4')).toBeTruthy();
    await userEvent.click(within(ask).getByRole('button', { name: 'Ne pas les ajouter' }));
    await screen.findByText('« cr.md » ajouté à « Juridique »');
    // Only the small one went, in the folder open.
    expect(b.called('docs_document_add').map((c) => [c.args.folder, c.args.confirmed])).toEqual([['Juridique', false]]);
  });

  it('makes a folder under the one open', async () => {
    const b = backend({ docs_folder_add: (a) => a.folder });
    await docsStore.load('p1');
    render(DocumentsSpace, { project: project() });
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Dossiers des documents' })).getByRole('button', { name: /^Comptes rendus/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Bureau');
    await fireEvent.submit(screen.getByRole('form', { name: 'Nouveau dossier' }));
    await waitFor(() => expect(b.called('docs_folder_add')[0]?.args).toEqual({ id: 'p1', folder: 'Comptes rendus/Bureau' }));
  });
});
