// The Docs tab (ESC-258, docs/FACTORY.md § 3): what its screens tell of the spec, worked out from what the backend reads
// in `.escouade/` of the branch of the docs.
import type { DocsMoved, DocsPageInfo, DocsSubject, DocsTree } from './types';

/** The three spaces of the tab. */
export type DocsSpaceId = 'spec' | 'decisions' | 'documents';
export const DOCS_SPACES: DocsSpaceId[] = ['spec', 'decisions', 'documents'];

/** Where a subject, or a page, stands against the code: a gap the last comparison found, a draft, or up to date. */
export type SpecState = 'gap' | 'draft' | 'ok';

export function pageState(p: DocsPageInfo): SpecState {
  if (p.gaps > 0) return 'gap';
  return p.draft ? 'draft' : 'ok';
}

/** A subject has a gap when one of its pages has; it is a draft when all of them are. */
export function subjectState(s: DocsSubject): SpecState {
  if (s.pages.some((p) => p.gaps > 0)) return 'gap';
  return s.pages.length && s.pages.every((p) => p.draft) ? 'draft' : 'ok';
}

/** What a subject's card counts: its pages, the tickets and decisions its pages cite (each once), its gaps. */
export function subjectCounts(s: DocsSubject) {
  const tickets = new Set(s.pages.flatMap((p) => p.tickets));
  const decisions = new Set(s.pages.flatMap((p) => p.decisions));
  return {
    pages: s.pages.length,
    tickets: tickets.size,
    decisions: decisions.size,
    gaps: s.pages.reduce((n, p) => n + p.gaps, 0),
  };
}

/** What the head of the spec says: its pages up to date, its gaps, its drafts, and when it was last compared to the code. */
export function specSummary(tree: DocsTree) {
  const pages = tree.subjects.flatMap((s) => s.pages);
  const compared = pages
    .map((p) => Date.parse(p.compared))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a)[0];
  return {
    pages: pages.length,
    ok: pages.filter((p) => pageState(p) === 'ok').length,
    gaps: pages.reduce((n, p) => n + p.gaps, 0),
    drafts: pages.filter((p) => p.draft).length,
    /** Milliseconds since the epoch of the latest comparison; null: never compared. */
    compared: compared ?? null,
  };
}

/** A subject's card says what it is about: its pages' titles, its own left out. */
export function subjectAbout(s: DocsSubject): string {
  return s.pages
    .map((p) => p.title)
    .filter((t) => t !== s.title)
    .join(', ');
}

/** The spec's page a docs file is (`.escouade/spec/a/b.md` → `a/b`), else null. */
export function specPageOf(file: string): string | null {
  const m = /^\.escouade\/spec\/(.+)\.md$/.exec(file);
  return m ? m[1] : null;
}

/** The pages of the spec changed and not shared yet, from the files the docs have to share. */
export function unsharedPages(files: string[]): Set<string> {
  return new Set(files.map(specPageOf).filter((p): p is string => !!p));
}

/** « Ce qui a bougé »: the last changes, each with the titles of the pages it touched (known ones). */
export function movedLines(moved: DocsMoved[], tree: DocsTree, max = 3) {
  const titles = new Map(tree.subjects.flatMap((s) => s.pages.map((p) => [p.path, p.title] as const)));
  const subjects = new Map(tree.subjects.flatMap((s) => s.pages.map((p) => [p.path, s.title] as const)));
  return moved.slice(0, max).map((m) => {
    const named = [...new Set(m.pages.map((p) => subjects.get(p) ?? titles.get(p)).filter((x): x is string => !!x))];
    return { when: m.when, author: m.author, what: named.join(', ') || m.message };
  });
}

/** The page of `path` in the tree. */
export function findPage(tree: DocsTree | null | undefined, path: string | null | undefined): DocsPageInfo | undefined {
  if (!tree || !path) return undefined;
  for (const s of tree.subjects) {
    const p = s.pages.find((x) => x.path === path);
    if (p) return p;
  }
  return undefined;
}

/** The path a new page gets from its subject and title, as the backend keeps it: `subject/page`, each a slug. */
export function newPagePath(subject: string, title: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '');
  return `${slug(subject) || 'general'}/${slug(title) || 'page'}`;
}

/** An import's cut grouped by subject, in its order, for the window that asks to agree to it. */
export function draftsBySubject<T extends { subject: string }>(drafts: T[]): { subject: string; pages: T[] }[] {
  const out: { subject: string; pages: T[] }[] = [];
  for (const d of drafts) {
    const g = out.find((x) => x.subject === d.subject);
    if (g) g.pages.push(d);
    else out.push({ subject: d.subject, pages: [d] });
  }
  return out;
}
