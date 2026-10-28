// The discussions of the Docs tab (ESC-261, docs/FACTORY.md « Nouvelle discussion »): agents of Escouade like the
// others, each a discussion with the spec writer or a brainstorm with the product agent. Their cards in the tab, their
// state, and what « Ce qui ira dans la spec » shows of a page they propose.
import { can } from './engines';
import type { Agent, Discussion, EngineId } from './types';

/**
 * Whether a discussion may run on `engine` (`discussion::holds`): a harness Escouade keeps from writing (`readOnly`).
 * Not Cursor CLI nor Mistral Vibe, which write the files of their folder without going through Escouade.
 */
export function holds(engine: EngineId): boolean {
  return can({ engine }, 'readOnly');
}

/** The state a card says (question, répond, versé, brouillon), or nothing to say yet. */
export type DiscussionState = 'question' | 'answering' | 'poured' | 'draft' | 'idle';

/** The discussions of a project, the newest first; those set aside left out. */
export function discussionsOf(agents: Record<string, Agent>, projectId: string): Agent[] {
  return Object.values(agents)
    .filter((a) => a.discussion && a.projectId === projectId && !a.archived)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** What it proposes and was not poured yet: its pages and its decisions. */
export function proposedCount(d: Discussion): number {
  return d.pages.length + d.decisions.length;
}

export function discussionState(a: Agent): DiscussionState {
  const d = a.discussion;
  if (a.status === 'waiting') return 'question';
  if (a.status === 'running') return 'answering';
  if (d && proposedCount(d)) return 'draft';
  if (d?.poured) return 'poured';
  return 'idle';
}

/** A line of a page as « Ce qui ira dans la spec » shows it: added, or taken away. */
export interface PageLine {
  kind: 'add' | 'del';
  text: string;
}

/**
 * What a page proposed changes, line by line: the lines taken away, then those added (blank lines are layout, left out).
 * A new page (`before` null) is all added.
 */
export function pageLines(before: string | null, after: string): PageLine[] {
  const lines = (s: string) => s.split('\n').filter((l) => l.trim());
  const old = lines(before ?? '');
  const neu = lines(after);
  const left = new Set(neu);
  const was = new Set(old);
  return [
    ...old.filter((l) => !left.has(l)).map((text) => ({ kind: 'del' as const, text })),
    ...neu.filter((l) => !was.has(l)).map((text) => ({ kind: 'add' as const, text })),
  ];
}
