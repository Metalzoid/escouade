import { describe, expect, it } from 'vitest';
import { discussionState, discussionsOf, pageLines, proposedCount, holds } from './discussions';
import { app } from './state.svelte';
import { BARE_ENGINE, CLAUDE_ENGINE, resetApp } from '../test/ipc';
import type { Agent, Discussion } from './types';

const disc = (o: Partial<Discussion> = {}): Discussion => ({ kind: 'discussion', subject: 'S', pages: [], decisions: [], ...o });
const agent = (id: string, o: Partial<Agent> = {}) =>
  ({ id, projectId: 'p1', status: 'idle', pending: [], archived: false, createdAt: 1, ...o }) as unknown as Agent;
const page = (path: string, before: string | null, body: string) => ({
  path,
  before,
  page: { path, title: path, body } as never,
  added: 0,
  removed: 0,
});

describe('discussions', () => {
  it('lists the discussions of a project, newest first, the other agents left out', () => {
    const all = {
      a: agent('a', { discussion: disc(), createdAt: 1 }),
      b: agent('b', { discussion: disc({ kind: 'brainstorm' }), createdAt: 3 }),
      c: agent('c', { createdAt: 5 }),
      d: agent('d', { discussion: disc(), projectId: 'p2' }),
      e: agent('e', { discussion: disc(), archived: true }),
    };
    expect(discussionsOf(all, 'p1').map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('says its state: a question, answering, poured, a draft or nothing yet', () => {
    expect(discussionState(agent('a', { status: 'waiting', discussion: disc() }))).toBe('question');
    expect(discussionState(agent('a', { status: 'running', discussion: disc() }))).toBe('answering');
    const proposed = disc({ pages: [page('a/b', null, 'x')] });
    expect(discussionState(agent('a', { status: 'idle', discussion: proposed }))).toBe('draft');
    // Poured, then nothing more proposed.
    const poured = disc({ poured: { at: 1, pages: ['a/b'], decisions: [14] } });
    expect(discussionState(agent('a', { status: 'done', discussion: poured }))).toBe('poured');
    expect(discussionState(agent('a', { status: 'done', discussion: { ...poured, pages: proposed.pages } }))).toBe('draft');
    expect(discussionState(agent('a', { status: 'done', discussion: disc() }))).toBe('idle');
  });

  it('counts what it proposes', () => {
    expect(proposedCount(disc({ pages: [page('a/b', null, 'x')], decisions: [{} as never, {} as never] }))).toBe(3);
  });

  it('shows a page line by line: a new one all added, a changed one its old lines struck then its new ones', () => {
    expect(pageLines(null, '# Relances\n\nTrois relances.')).toEqual([
      { kind: 'add', text: '# Relances' },
      { kind: 'add', text: 'Trois relances.' },
    ]);
    expect(pageLines('Aucune notification.\nLe reste.', 'Les relances sont planifiées.\nLe reste.')).toEqual([
      { kind: 'del', text: 'Aucune notification.' },
      { kind: 'add', text: 'Les relances sont planifiées.' },
    ]);
    // Nothing changed in the text (its title, its links): nothing to show.
    expect(pageLines('Pareil.', 'Pareil.')).toEqual([]);
  });
});

describe('the harnesses of a discussion', () => {
  it('are those Escouade keeps from writing, as they declare it', () => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, id: 'cursor' }];
    expect(holds('claude')).toBe(true);
    // Cursor CLI writes the files of its folder without going through Escouade.
    expect(holds('cursor')).toBe(false);
    // One the backend does not know: none.
    expect(holds('vibe')).toBe(false);
  });
});
