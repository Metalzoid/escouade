import { describe, expect, it } from 'vitest';
import {
  draftsBySubject,
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
