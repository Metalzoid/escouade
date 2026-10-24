import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import { BARE_ENGINE, CLAUDE_ENGINE } from '../../test/ipc';
import UserMessage from './UserMessage.svelte';

beforeEach(() => {
  app.engines = [CLAUDE_ENGINE, BARE_ENGINE];
});

const item = (queued: boolean) => ({ kind: 'user' as const, id: 'u1', text: 'Ajoute aussi les tests', images: 0, ts: 1, queued });

describe('UserMessage', () => {
  it('says a message sent during a turn was passed on to Claude, which takes it at its next step', () => {
    render(UserMessage, { item: item(true) });
    expect(screen.getByText('transmis pendant le tour')).toBeInTheDocument();
    expect(screen.queryByText(/en file/)).not.toBeInTheDocument();
  });

  it('names the harness of its agent in the note of a message sent during a turn', () => {
    const { unmount } = render(UserMessage, { item: item(true), engine: 'claude' });
    expect(screen.getByText('transmis pendant le tour')).toHaveAttribute('data-tip', 'Claude en tient compte dès sa prochaine étape');
    unmount();
    render(UserMessage, { item: item(true), engine: 'codex' });
    expect(screen.getByText('transmis pendant le tour')).toHaveAttribute('data-tip', 'Nu en tient compte dès sa prochaine étape');
  });

  it('shows nothing more for a message sent between turns', () => {
    render(UserMessage, { item: item(false) });
    expect(screen.queryByText('transmis pendant le tour')).not.toBeInTheDocument();
  });
});

describe('UserMessage with attachments', () => {
  it('shows the images count and each attached file by name, in a row of chips drawn with their icon', () => {
    const { container } = render(UserMessage, { item: { ...item(false), images: 2, files: ['rapport.pdf', 'notes.md'] } });
    const chips = [...container.querySelectorAll('.atts .att')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['2 images', 'rapport.pdf', 'notes.md']);
    expect(chips.map((c) => c.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual(['image', 'file', 'file']);
  });

  it('shows a message saved before files could be attached as before', () => {
    const { container } = render(UserMessage, { item: item(false) });
    expect(container.querySelector('.atts')).toBeNull();
  });

  it('says under the message that it was said aloud, without the instruction Escouade added for the agent', () => {
    const { container } = render(UserMessage, {
      item: { ...item(false), text: 'Garde 50 par page\n\n<escouade-voice>Réponds en une phrase.</escouade-voice>' },
    });
    const said = container.querySelector('[data-said-aloud]')!;
    expect(said).toHaveTextContent('Dit à voix haute');
    expect(said.querySelector('[data-icon="wave"]')).not.toBeNull();
    expect(said.closest('.bubble')).toBeNull();
  });
});

describe('UserMessage from claude.ai', () => {
  it('says the message was sent from claude.ai or the Claude app', () => {
    render(UserMessage, { item: { ...item(false), origin: 'remote' as const } });
    expect(screen.getByText('depuis claude.ai')).toBeInTheDocument();
  });
});

describe('UserMessage in English', () => {
  it('counts the images with a plural, and words the notes in English', () => {
    setLang('en');
    const { unmount } = render(UserMessage, { item: { ...item(true), images: 1, origin: 'remote' as const } });
    expect(screen.getByText('1 image')).toBeInTheDocument();
    expect(screen.getByText('sent during the turn')).toHaveAttribute('data-tip', 'Claude takes it into account at its next step');
    expect(screen.getByText('from claude.ai')).toBeInTheDocument();
    unmount();
    render(UserMessage, { item: { ...item(false), images: 2 }, waiting: true });
    expect(screen.getByText('2 images')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the setup…')).toBeInTheDocument();
  });
});
