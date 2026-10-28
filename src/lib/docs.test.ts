import { describe, expect, it } from 'vitest';
import {
  documentCitation,
  draftsBySubject,
  fileBadge,
  filesUnder,
  fileTitle,
  folderDepth,
  folderTrail,
  hasChildren,
  readState,
  visibleFolders,
  findPage,
  movedLines,
  newPagePath,
  pageState,
  specPageOf,
  specSummary,
  subjectAbout,
  subjectCounts,
  subjectState,
  unsharedPages,
} from './docs';
import type { DocsPageInfo, DocsSubject, DocsTree } from './types';

const pg = (path: string, o: Partial<DocsPageInfo> = {}): DocsPageInfo => ({
  path,
  title: path.split('/')[1],
  compared: '',
  tickets: [],
  decisions: [],
  gaps: 0,
  draft: false,
  ...o,
});

const paiement: DocsSubject = {
  name: 'paiement',
  title: 'Paiement',
  pages: [
    pg('paiement/moyens', { title: 'Moyens de paiement', tickets: ['DEM-1', 'DEM-2'], decisions: [3] }),
    pg('paiement/plusieurs-fois', {
      title: 'En plusieurs fois',
      gaps: 1,
      tickets: ['DEM-2'],
      decisions: [3, 4],
      compared: '2026-10-28T08:00:00Z',
    }),
  ],
};
const notifications: DocsSubject = {
  name: 'notifications',
  title: 'Notifications',
  pages: [pg('notifications/emails', { title: 'E-mails', draft: true, compared: '2026-10-28T10:00:00Z' })],
};
const tree: DocsTree = { branch: '', pages: 3, subjects: [paiement, notifications], existingSpec: [] };

describe('the state of the spec against the code', () => {
  it('is a gap first, then a draft, else up to date, page by page and subject by subject', () => {
    expect(paiement.pages.map(pageState)).toEqual(['ok', 'gap']);
    expect(pageState(pg('a/b', { draft: true, gaps: 2 }))).toBe('gap');
    expect(subjectState(paiement)).toBe('gap');
    expect(subjectState(notifications)).toBe('draft');
    // A subject is a draft only when all its pages are.
    expect(subjectState({ ...notifications, pages: [...notifications.pages, pg('notifications/x')] })).toBe('ok');
  });

  it('counts each ticket and decision of a subject once', () => {
    expect(subjectCounts(paiement)).toEqual({ pages: 2, tickets: 2, decisions: 2, gaps: 1 });
  });

  it('sums up the spec and takes its latest comparison', () => {
    expect(specSummary(tree)).toEqual({ pages: 3, ok: 1, gaps: 1, drafts: 1, compared: Date.parse('2026-10-28T10:00:00Z') });
    expect(specSummary({ ...tree, subjects: [{ ...notifications, pages: [pg('n/e')] }] }).compared).toBeNull();
  });

  it('says what a subject is about by its pages, its own name left out', () => {
    expect(subjectAbout(paiement)).toBe('Moyens de paiement, En plusieurs fois');
    expect(subjectAbout({ ...paiement, pages: [pg('paiement/p', { title: 'Paiement' })] })).toBe('');
  });
});

describe('the pages of the docs', () => {
  it('tells a page of the spec among the files to share', () => {
    expect(specPageOf('.escouade/spec/paiement/moyens.md')).toBe('paiement/moyens');
    expect(specPageOf('.escouade/decisions/0001-x.md')).toBeNull();
    expect([...unsharedPages(['.escouade/spec/a/b.md', '.escouade/documents/c.pdf'])]).toEqual(['a/b']);
  });

  it('finds a page in the tree', () => {
    expect(findPage(tree, 'paiement/moyens')?.title).toBe('Moyens de paiement');
    expect(findPage(tree, 'nope/x')).toBeUndefined();
    expect(findPage(null, 'a')).toBeUndefined();
  });

  it('makes a new page’s path as the backend keeps it', () => {
    expect(newPagePath('Espace adhérent', 'Reçus fiscaux')).toBe('espace-adherent/recus-fiscaux');
    expect(newPagePath('  ', '!!')).toBe('general/page');
  });

  it('tells what changed with the subjects it touched', () => {
    const moved = [
      { when: 2, author: 'Claire', message: 'Docs : …', pages: ['paiement/moyens', 'paiement/plusieurs-fois'] },
      { when: 1, author: 'Guillaume', message: 'init', pages: ['gone/page'] },
    ];
    expect(movedLines(moved, tree)).toEqual([
      { when: 2, author: 'Claire', what: 'Paiement' },
      { when: 1, author: 'Guillaume', what: 'init' },
    ]);
  });

  it('groups an import’s cut by subject in its order', () => {
    const g = draftsBySubject([
      { subject: 'A', path: '1' },
      { subject: 'B', path: '2' },
      { subject: 'A', path: '3' },
    ]);
    expect(g.map((x) => [x.subject, x.pages.map((p) => p.path)])).toEqual([
      ['A', ['1', '3']],
      ['B', ['2']],
    ]);
  });
});

describe('the drive of the documents', () => {
  const folders = [
    { path: 'Comptes rendus', name: 'Comptes rendus', files: 3 },
    { path: 'Comptes rendus/2026', name: '2026', files: 1 },
    { path: 'Comptes rendus/2026/Bureau', name: 'Bureau', files: 1 },
    { path: 'Juridique', name: 'Juridique', files: 0 },
  ];
  const files = [
    { path: 'Comptes rendus/a.md', folder: 'Comptes rendus' },
    { path: 'Comptes rendus/2026/b.pdf', folder: 'Comptes rendus/2026' },
    { path: 'Comptes rendus-vieux/c.md', folder: 'Comptes rendus-vieux' },
    { path: 'd.md', folder: '' },
  ];

  it('shows a folder with what is under it, the root with everything', () => {
    expect(filesUnder(files, 'Comptes rendus').map((f) => f.path)).toEqual(['Comptes rendus/a.md', 'Comptes rendus/2026/b.pdf']);
    expect(filesUnder(files, '')).toHaveLength(4);
    expect(filesUnder(files, 'Juridique')).toEqual([]);
  });

  it('shows the folders of the open ones only, each at its depth', () => {
    expect(visibleFolders(folders, new Set()).map((f) => f.path)).toEqual(['Comptes rendus', 'Juridique']);
    expect(visibleFolders(folders, new Set(['Comptes rendus'])).map((f) => f.path)).toEqual([
      'Comptes rendus',
      'Comptes rendus/2026',
      'Juridique',
    ]);
    expect(visibleFolders(folders, new Set(['Comptes rendus/2026']))).toHaveLength(2);
    expect(folderDepth('Comptes rendus/2026/Bureau')).toBe(2);
    expect(hasChildren(folders, 'Comptes rendus')).toBe(true);
    expect(hasChildren(folders, 'Juridique')).toBe(false);
    expect(folderTrail('Comptes rendus/2026')).toEqual([
      { name: 'Comptes rendus', path: 'Comptes rendus' },
      { name: '2026', path: 'Comptes rendus/2026' },
    ]);
    expect(folderTrail('')).toEqual([]);
  });

  it('says a file by its extension, and what the agents did with it', () => {
    expect(fileBadge({ name: 'CR atelier.docx', kind: 'word' })).toBe('DOCX');
    expect(fileBadge({ name: 'LISEZMOI', kind: 'other' })).toBe('OTHER');
    expect(fileTitle('CR atelier du 22.10.docx')).toBe('CR atelier du 22.10');
    expect(fileTitle('.env')).toBe('.env');
    expect(readState({ reads: 2, cited: 3, readable: true })).toBe('read');
    expect(readState({ reads: 0, cited: 1, readable: true })).toBe('cited');
    expect(readState({ reads: 0, cited: 0, readable: true })).toBe('unread');
    expect(readState({ reads: 0, cited: 0, readable: false })).toBe('noText');
    expect(documentCitation('Comptes rendus/a.md')).toBe('documents/Comptes rendus/a.md');
  });
});
