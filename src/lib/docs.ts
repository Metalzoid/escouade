// The Docs tab (ESC-258, docs/FACTORY.md § 3): what its screens tell of the spec, worked out from what the backend reads
// in `.escouade/` of the branch of the docs.
import { t } from './i18n';
import type { DocsCompared, DocsMoved, DocsPageInfo, DocsSubject, DocsTree } from './types';

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

/** The latest comparison of the pages to the code, in milliseconds since the epoch; null: never compared. */
export function latestCompared(pages: DocsPageInfo[]): number | null {
  const at = pages
    .map((p) => Date.parse(p.compared))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a)[0];
  return at ?? null;
}

/** What the head of the spec says: its pages up to date, its gaps, its drafts, and when it was last compared to the code. */
export function specSummary(tree: DocsTree) {
  const pages = tree.subjects.flatMap((s) => s.pages);
  const compared = latestCompared(pages);
  return {
    pages: pages.length,
    ok: pages.filter((p) => pageState(p) === 'ok').length,
    gaps: pages.reduce((n, p) => n + p.gaps, 0),
    drafts: pages.filter((p) => p.draft).length,
    /** Milliseconds since the epoch of the latest comparison; null: never compared. */
    compared,
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

// ---------- the drive of the documents (ESC-260) ----------

/** The files of the drive under `folder` (its folders' too); all of them for the root (''). */
export function filesUnder<T extends { folder: string }>(files: T[], folder: string): T[] {
  if (!folder) return files;
  return files.filter((f) => f.folder === folder || f.folder.startsWith(`${folder}/`));
}

/** How deep a folder is: 0 for one at the root. */
export function folderDepth(path: string): number {
  return path.split('/').length - 1;
}

/** The folders the tree shows: those at the root, and those whose every folder above is open. */
export function visibleFolders<T extends { path: string }>(folders: T[], open: Set<string>): T[] {
  return folders.filter((f) => {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) if (!open.has(parts.slice(0, i).join('/'))) return false;
    return true;
  });
}

/** Whether a folder has folders under it. */
export function hasChildren(folders: { path: string }[], path: string): boolean {
  return folders.some((f) => f.path.startsWith(`${path}/`));
}

/** The folders above `path` and itself, for the crumb: `A`, `A/B`… */
export function folderTrail(path: string): { path: string; name: string }[] {
  if (!path) return [];
  const parts = path.split('/');
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
}

/** What the box of a file's card says: its extension in capitals (DOCX, PDF, MD), else its kind. */
export function fileBadge(f: { name: string; kind: string }): string {
  const i = f.name.lastIndexOf('.');
  const ext = i > 0 ? f.name.slice(i + 1) : '';
  return (ext && ext.length <= 5 ? ext : f.kind).toUpperCase();
}

/** A file's name as its card shows it: without its extension, which its box says. */
export function fileTitle(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** What the agents did with a file: read (and how many times cited), cited only, or nothing yet. */
export function readState(f: { reads: number; cited: number; readable: boolean }): 'read' | 'cited' | 'unread' | 'noText' {
  if (f.reads > 0) return 'read';
  if (f.cited > 0) return 'cited';
  return f.readable ? 'unread' : 'noText';
}

/** The window's path of a document, as a page of the spec cites it: `documents/<path>`. */
export function documentCitation(path: string): string {
  return `documents/${path}`;
}

/** What a « Comparer au code » says once done (ESC-263): the pages compared, their gaps, those that could not be. */
export function comparedLine(done: DocsCompared): string {
  const parts = [
    t('docs.compare.done', { count: done.pages }),
    done.gaps ? t('docs.count.gaps', { count: done.gaps }) : t('docs.compare.noGap'),
  ];
  if (done.failed) parts.push(t('docs.compare.failed', { count: done.failed }));
  return parts.join(' · ');
}
