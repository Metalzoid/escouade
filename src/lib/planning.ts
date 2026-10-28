// « Planifier » (ESC-262, docs/FACTORY.md « « Planifier » : de la spec aux tickets »): the changes of the spec without
// tickets, whether a discussion has some to plan, and the names of the pages a ticket implements.
import type { Discussion, DocsPlanning, DocsTree } from './types';

/** How many changes of the spec have no tickets yet: the pages changed and the decisions proposed. */
export function unplannedCount(p: DocsPlanning | null | undefined): number {
  return p ? p.pages.length + p.decisions.length : 0;
}

/** Whether « Planifier » is offered on a discussion: it poured changes, none planned since. */
export function canPlan(d: Discussion): boolean {
  return !!d.poured && (!d.planned || d.poured.at > d.planned.at);
}

/** The title of a page of the spec, as the tree gives it; else the last part of its path. */
export function pageTitle(path: string, tree: DocsTree | undefined): string {
  for (const s of tree?.subjects ?? []) {
    const p = s.pages.find((x) => x.path === path);
    if (p?.title) return p.title;
  }
  return path.split('/').pop() || path;
}

/** The keys of the tickets of a subject's pages, in their order, each once. */
export function subjectTickets(pages: { tickets: string[] }[]): string[] {
  const out: string[] = [];
  for (const p of pages) for (const k of p.tickets) if (!out.includes(k)) out.push(k);
  return out;
}
