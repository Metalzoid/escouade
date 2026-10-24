import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { NoticeItem } from '../../lib/types';
import Notice from './Notice.svelte';

const notice = (over: Partial<NoticeItem>): NoticeItem => ({ kind: 'notice', id: 'n1', ts: 1, level: 'info', text: '', ...over });

describe('Notice', () => {
  it('says a line as it is', () => {
    render(Notice, { item: notice({ text: 'Compacté : 12 k tokens' }) });
    expect(screen.getByText('Compacté : 12 k tokens')).toHaveClass('notice', 'info');
  });

  it('draws the switch of account past the threshold as a separator, the account it goes on on in bold (choice 24)', () => {
    render(Notice, {
      item: notice({ level: 'switch', text: 'L’agent passe sur le compte Pro : Principal est à 90 % de sa fenêtre de 5 h.' }),
    });
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAccessibleName('L’agent passe sur le compte Pro : Principal est à 90 % de sa fenêtre de 5 h.');
    expect(sep.querySelector('b')).toHaveTextContent(/^L’agent passe sur le compte Pro$/);
  });
});
