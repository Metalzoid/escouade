import { describe, expect, it } from 'vitest';
import { localCommandViews, parseLocalCommand } from './localcmd';
import type { ConvItem, UserItem } from './types';

const user = (id: string, text: string, origin?: UserItem['origin']): UserItem => ({
  kind: 'user',
  id,
  text,
  images: 0,
  ts: 0,
  queued: false,
  ...(origin && { origin }),
});

describe('parseLocalCommand', () => {
  it('reads a command as typed, with its arguments, and one of the ! mode', () => {
    expect(
      parseLocalCommand(
        '<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>',
      ),
    ).toEqual([{ kind: 'typed', text: '/compact' }]);
    expect(
      parseLocalCommand('<command-message>loop</command-message>\n<command-name>/loop</command-name>\n<command-args>check</command-args>'),
    ).toEqual([{ kind: 'typed', text: '/loop check' }]);
    expect(parseLocalCommand('<bash-input>git status</bash-input>')).toEqual([{ kind: 'typed', text: '! git status' }]);
  });

  it('keeps the lines of an output, without its ANSI codes, and reads an error as an error', () => {
    expect(parseLocalCommand('<local-command-stdout>\r\n \u001b[1mContext\u001b[22m\r\n   ⛁ 12k  \r\n</local-command-stdout>')).toEqual([
      { kind: 'output', text: ' Context\n   ⛁ 12k' },
    ]);
    expect(parseLocalCommand('<bash-stdout>a</bash-stdout><bash-stderr>boom</bash-stderr>')).toEqual([
      { kind: 'output', text: 'a' },
      { kind: 'error', text: 'boom' },
    ]);
    expect(parseLocalCommand('<local-command-stderr>Unknown model</local-command-stderr>')).toEqual([
      { kind: 'error', text: 'Unknown model' },
    ]);
  });

  it('shows nothing of the caveat nor of an empty output, and leaves any other text alone', () => {
    expect(parseLocalCommand('<local-command-caveat>Caveat: x</local-command-caveat>')).toEqual([]);
    expect(parseLocalCommand('<local-command-stdout> </local-command-stdout>')).toEqual([]);
    expect(parseLocalCommand('Bonjour')).toBeNull();
    expect(parseLocalCommand('/compact')).toBeNull();
  });
});

describe('localCommandViews', () => {
  it('shows the tags a conversation saved before kept: the command as typed, its output, its error', () => {
    const items: ConvItem[] = [
      user('a', 'Bonjour'),
      user('b', '<local-command-stdout>Compacted </local-command-stdout>', 'remote'),
      user(
        'c',
        '<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>',
        'remote',
      ),
      user('d', '<local-command-stderr>no</local-command-stderr>', 'remote'),
      user('e', '<local-command-caveat>Caveat</local-command-caveat>', 'remote'),
    ];
    const views = localCommandViews(items);
    expect(views.get('a')).toBeUndefined();
    expect(views.get('b')).toEqual({ kind: 'notices', notices: [{ level: 'output', text: 'Compacted' }] });
    expect(views.get('c')).toEqual({ kind: 'user', text: '/model opus' });
    expect(views.get('d')).toEqual({ kind: 'notices', notices: [{ level: 'error', text: 'no' }] });
    expect(views.get('e')).toEqual({ kind: 'notices', notices: [] });
  });

  it('shows the wake-up of a loop as a wake-up, and a command the app sent once only', () => {
    const items: ConvItem[] = [
      user('a', '/loop check'),
      user(
        'b',
        '<command-message>loop</command-message>\n<command-name>/loop</command-name>\n<command-args>check</command-args>',
        'remote',
      ),
      user('c', '/compact'),
      user(
        'd',
        '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>',
        'remote',
      ),
    ];
    const views = localCommandViews(items);
    expect(views.get('b')).toEqual({ kind: 'wake', text: '/loop check' });
    expect(views.get('d')).toEqual({ kind: 'notices', notices: [] });
  });
});
