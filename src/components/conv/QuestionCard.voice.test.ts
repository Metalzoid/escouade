// ESC-131: the answers said in the voice conversation are ticked in the card at once, and an option ticked by hand is
// taken by the voice, which goes on to the next question.

import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conversation } from '../../lib/conversation.svelte';
import { setLang } from '../../lib/i18n';
import { draftOf } from '../../lib/question-answers.svelte';
import { app } from '../../lib/state.svelte';
import type { QuestionItem, VoiceEvent } from '../../lib/types';
import { agent, fakeBackend, resetApp } from '../../test/ipc';
import QuestionCard from './QuestionCard.svelte';

const SESSION = 9;
const item: QuestionItem = {
  kind: 'question',
  id: 'req-3',
  toolUseId: 't1',
  ts: 1,
  answers: null,
  questions: [
    { question: 'Quelle base ?', header: 'Base', options: [{ label: 'PostgreSQL' }, { label: 'SQLite' }] },
    {
      question: 'Quels tests ?',
      header: 'Tests',
      multiSelect: true,
      options: [{ label: 'Unitaires' }, { label: 'E2E' }, { label: 'Lint' }],
    },
    { question: 'Quel nom ?', header: 'Nom', options: [{ label: 'web-shop' }, { label: 'admin' }] },
  ],
};
const later = () => new Promise((r) => setTimeout(r, 5));

describe('the card of a request asked aloud', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let reading = 0;
  const ev = (e: Record<string, unknown>) => conversation.take({ session: SESSION, ...e } as VoiceEvent);
  const said = () => backend.called('conversation_say').map((c) => c.args.text as string);

  beforeEach(async () => {
    setLang('fr');
    reading = 0;
    resetApp({ agents: [agent({ id: 'a1', name: 'Alice', pending: ['req-3'] })] });
    conversation.flashMs = 0;
    backend = fakeBackend({
      conversation_start: () => ({ kind: 'listening', session: SESSION }),
      conversation_say: () => ++reading,
      get_conversation: () => [],
    });
    await conversation.start('a1');
    conversation.observe(app.agents.a1, [item]);
  });

  afterEach(() => conversation.clear());

  async function answer(text: string) {
    ev({ kind: 'convSpoken', reading, error: null });
    ev({ kind: 'convHeard', text, error: null });
    await later();
  }

  const box = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

  it('ticks each answer said as it is understood, the free one written under its question', async () => {
    render(QuestionCard, { item, agentId: 'a1', pending: true });
    expect(said()[0]).toBe('Question 1 sur 3. Quelle base ?');
    await answer('SQLite');
    await tick();
    expect(box('SQLite').classList.contains('on')).toBe(true);
    expect(box('PostgreSQL').classList.contains('on')).toBe(false);
    await answer('La première et la troisième');
    await tick();
    expect(box('Unitaires').textContent).toContain('☑');
    expect(box('Lint').textContent).toContain('☑');
    expect(box('E2E').textContent).toContain('☐');
    // The button of the card: not yet, a question has no answer.
    expect(screen.getByRole('button', { name: /Envoyer|Répondre|Valider/ })).toBeDisabled();
    await answer('Escouade-front');
    await tick();
    expect(document.querySelector('[data-free-answer]')?.textContent).toBe('Réponse dite : « Escouade-front »');
    expect(backend.called('answer_question')[0].args).toMatchObject({
      requestId: 'req-3',
      answers: { 'Quelle base ?': 'SQLite', 'Quels tests ?': 'Unitaires, Lint', 'Quel nom ?': 'Escouade-front' },
    });
  });

  it('an option ticked by hand answers the question asked: the voice goes on to the next', async () => {
    render(QuestionCard, { item, agentId: 'a1', pending: true });
    await userEvent.click(box('PostgreSQL'));
    await later();
    expect(said().at(-1)).toBe('Question 2 sur 3. Quels tests ? Plusieurs réponses possibles.');
    expect(conversation.ask?.index).toBe(1);
  });

  it('sends what it shows, the answers said and the ones ticked by hand together', async () => {
    conversation.stop();
    draftOf('req-3').picks['Quelle base ?'] = ['SQLite'];
    draftOf('req-3').picks['Quels tests ?'] = ['E2E'];
    draftOf('req-3').texts['Quel nom ?'] = 'Mon appli';
    render(QuestionCard, { item, agentId: 'a1', pending: true });
    await userEvent.click(screen.getByRole('button', { name: /Envoyer|Répondre|Valider/ }));
    expect(backend.called('answer_question')[0].args.answers).toEqual({
      'Quelle base ?': 'SQLite',
      'Quels tests ?': 'E2E',
      'Quel nom ?': 'Mon appli',
    });
  });
});
