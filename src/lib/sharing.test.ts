import { describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { canStart, waitLabel } from './board';
import {
  alsoOn,
  authorName,
  heldHere,
  hueOf,
  initialOf,
  isTheirs,
  isTicketPath,
  myName,
  sharedFile,
  shownOnBoard,
  theirsLine,
  ticketOfPath,
} from './sharing';
import { board, project, SETTINGS, ticket } from '../test/ipc';
import type { Shared, Ticket } from './types';

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

const hers = (over: Partial<Ticket> = {}, s: Partial<Shared> = {}) => ticket({ key: 'DEM-12', shared: shared(s), ...over });

describe('the shared Kanban (ESC-190)', () => {
  it('tells whose a ticket is, and its file', () => {
    expect(isTheirs(ticket())).toBe(false);
    expect(isTheirs(hers())).toBe(true);
    expect(isTheirs(hers({}, { mine: true, author: bob }))).toBe(false);
    expect(sharedFile(hers())).toBe('.escouade/tickets/h8m2v6kd.yml');
    expect(sharedFile(ticket())).toBeNull();
    expect(authorName(hers())).toBe('Alice Martin');
    setLang('fr');
    expect(authorName(hers({}, { author: { name: '', id: '' } }))).toBe('quelqu’un');
  });

  it('says who has another one’s ticket in each column, nothing for ours or one held here', () => {
    setLang('fr');
    expect(theirsLine(hers())).toBe('Ajouté par Alice Martin · le pilote auto ne le lance pas');
    expect(theirsLine(hers({ column: 'doing' }, { takenBy: bob }))).toBe('Pris par Bob Durand');
    expect(theirsLine(hers({ column: 'review' }, { takenBy: alice }))).toBe('À tester chez Alice Martin');
    expect(theirsLine(hers({ column: 'done' }))).toBe('Fait par Alice Martin');
    expect(theirsLine(ticket())).toBeNull();
    // Taken here by hand: its card is one of ours, with its agent.
    expect(theirsLine(hers({ column: 'doing', agentId: 'a1' }))).toBeNull();
    expect(heldHere(hers({ column: 'doing', agentId: 'a1' }))).toBe(true);
    // One of ours a teammate took: who has it; one we started: our own card.
    expect(theirsLine(hers({ column: 'doing' }, { mine: true, author: bob, takenBy: alice }))).toBe('Pris par Alice Martin');
    expect(theirsLine(hers({ column: 'todo' }, { mine: true, author: bob }))).toBeNull();
    expect(theirsLine(hers({ column: 'done', startedAt: 5 }, { takenBy: bob }))).toBeNull();
    setLang('en');
    expect(theirsLine(hers())).toBe('Added by Alice Martin · the autopilot never starts it');
    setLang('fr');
  });

  it('says when someone else took it too while an agent here holds it', () => {
    const held = hers({ column: 'doing', agentId: 'a1' }, { mine: true, author: bob, takenBy: alice });
    expect(alsoOn(held, bob.id)).toBe('Alice Martin');
    expect(alsoOn(hers({ column: 'doing', agentId: 'a1' }, { takenBy: bob }), bob.id)).toBeNull();
    expect(alsoOn(hers({ column: 'doing' }, { takenBy: alice }), bob.id)).toBeNull();
  });

  it('launches another one’s ticket by hand whatever the autopilot, never one that cannot be read', () => {
    setLang('fr');
    const on = board({ autopilot: true, maxParallel: 2 });
    expect(canStart(ticket(), on, 0, null)).toBe(false);
    expect(canStart(hers(), on, 0, null)).toBe(true);
    expect(canStart(hers({}, { problem: 'Ligne 3 : …' }), board({ autopilot: false }), 0, null)).toBe(false);
    expect(canStart(hers(), on, 2, null)).toBe(false);
    // Its wait line is who added it, not the autopilot's queue.
    expect(waitLabel(hers(), 0, on, 0)).toBe('Ajouté par Alice Martin · le pilote auto ne le lance pas');
  });

  it('draws a person the same way everywhere', () => {
    expect(hueOf('a91f03c2')).toBe(hueOf('a91f03c2'));
    expect(hueOf('a91f03c2')).not.toBe(hueOf('5d0e77b1'));
    expect(hueOf('x')).toBeGreaterThanOrEqual(0);
    expect(hueOf('x')).toBeLessThan(360);
    expect(initialOf(' bob')).toBe('B');
    expect(initialOf('')).toBe('?');
  });

  it('takes the project’s name before the app’s', () => {
    expect(myName({ ...SETTINGS, userName: 'Bob Durand' }, project())).toBe('Bob Durand');
    expect(myName({ ...SETTINGS, userName: 'Bob Durand' }, project({ userName: ' Robert ' }))).toBe('Robert');
    expect(myName({ ...SETTINGS }, project())).toBe('');
  });

  it('finds the shared tickets’ files among the folder’s, and hides those hidden here', () => {
    expect(isTicketPath('.escouade/tickets/h8m2v6kd.yml')).toBe(true);
    expect(isTicketPath('api/.escouade/tickets/h8m2v6kd/maquette.png')).toBe(true);
    expect(isTicketPath('src/.escouade.yml')).toBe(false);
    expect(isTicketPath('.escouade.yml')).toBe(false);
    const list = [ticket({ id: 'a' }), hers({ id: 'b' }), hers({ id: 'c' }, { id: 'x3t9f5rb', hidden: true })];
    expect(ticketOfPath('.escouade/tickets/h8m2v6kd.yml', list)?.id).toBe('b');
    expect(ticketOfPath('.escouade/tickets/nope.yml', list)).toBeUndefined();
    expect(shownOnBoard(list, false).map((x) => x.id)).toEqual(['a', 'b']);
    expect(shownOnBoard(list, true)).toHaveLength(3);
  });
});
