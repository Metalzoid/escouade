import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import type { EngineDecl, HandoverItem, UserItem } from '../../lib/types';
import { BARE_ENGINE, CLAUDE_ENGINE, resetApp } from '../../test/ipc';
import Handover from './Handover.svelte';
import UserMessage from './UserMessage.svelte';

// The change of harness in the conversation (ESC-88): its separator and the handover file, folded.

const CODEX: EngineDecl = { ...BARE_ENGINE, id: 'codex', name: 'Codex', speaker: 'Codex' };
const UNTIL = new Date(2026, 9, 10, 18, 0).getTime();

const sep = (over: Partial<HandoverItem> = {}): HandoverItem => ({
  kind: 'handover',
  id: 'h1',
  ts: 1,
  from: 'claude',
  to: 'codex',
  limited: true,
  until: UNTIL,
  ...over,
});

describe('the change of harness in the conversation', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, CODEX];
    setLang('fr');
  });

  it('draws a hairline on each side, the harness it goes on on in bold', () => {
    render(Handover, { item: sep() });
    expect(screen.getByRole('separator').querySelector('b')).toHaveTextContent(/^Suite sur Codex$/);
  });

  it('says where the agent goes on, why, and until when', () => {
    const { unmount } = render(Handover, { item: sep() });
    expect(screen.getByRole('separator')).toHaveTextContent('Suite sur Codex · quota Claude Code épuisé jusqu’à 18:00');
    unmount();
    const unknown = render(Handover, { item: sep({ until: null }) });
    expect(screen.getByRole('separator')).toHaveTextContent(/^Suite sur Codex · quota Claude Code épuisé$/);
    unknown.unmount();
    render(Handover, { item: sep({ from: 'codex', to: 'claude', limited: false, until: null }) });
    expect(screen.getByRole('separator')).toHaveTextContent('Suite sur Claude Code · l’agent était sur Codex');
  });

  it('says it in English', () => {
    setLang('en');
    render(Handover, { item: sep() });
    expect(screen.getByRole('separator')).toHaveTextContent('Continued on Codex · Claude Code quota spent until 6:00 PM');
  });

  it('folds the handover file under its title', async () => {
    const file: UserItem = { kind: 'user', id: 'u1', text: '# Passation : suite…', images: 0, ts: 1, queued: false, origin: 'handover' };
    render(UserMessage, { item: file, engine: 'codex' });
    const fold = screen.getByRole('button', { name: /Dossier de passation/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(fold).toHaveTextContent('Écrit par Escouade depuis la conversation : le premier message de l’agent sur Codex.');
    expect(screen.queryByText('# Passation : suite…')).not.toBeInTheDocument();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('# Passation : suite…')).toBeInTheDocument();
  });
});
