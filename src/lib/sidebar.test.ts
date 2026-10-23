import { describe, expect, it } from 'vitest';
import { agent } from '../test/ipc';
import { cardActivity, listQuestion, sidebarOrder } from './sidebar';
import type { PendingRequest } from './types';

const question = (over: Partial<PendingRequest> = {}): PendingRequest => ({
  id: 'req_q',
  kind: 'question',
  tool: 'AskUserQuestion',
  arg: '',
  description: null,
  reason: null,
  questions: [{ question: 'Lancer toute la suite e2e (38 tests) ?', options: ['Oui', 'Seulement auth'] }],
  cut: false,
  defaultNo: false,
  ...over,
});

describe('the order of the sidebar', () => {
  it('puts the agents waiting for an answer first, the others in their order', () => {
    const list = [
      agent({ id: 'a', status: 'running' }),
      agent({ id: 'b', status: 'waiting' }),
      agent({ id: 'c', status: 'idle' }),
      agent({ id: 'd', status: 'waiting' }),
    ];
    expect(sidebarOrder(list).map((a) => a.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('what an agent does, on its card (2.0, new)', () => {
  it('says what it is doing during a turn: its verb, then what it acts on', () => {
    expect(cardActivity(agent({ status: 'running', activity: 'Lit src/auth/jwt.ts' }), 0)).toEqual({
      kind: 'doing',
      verb: 'Lit',
      what: 'src/auth/jwt.ts',
    });
    expect(cardActivity(agent({ status: 'running', activity: 'Réfléchit' }), 0)).toEqual({ kind: 'doing', verb: 'Réfléchit', what: '' });
  });

  it('says it thinks during a turn that has no tool running', () => {
    expect(cardActivity(agent({ status: 'running', activity: null }), 0)).toEqual({ kind: 'thinking' });
  });

  it('gives the result of a turn over: the files it changed', () => {
    expect(cardActivity(agent({ status: 'done' }), 2)).toEqual({ kind: 'result', files: 2 });
    expect(cardActivity(agent({ status: 'idle', prompts: 3 }), 1)).toEqual({ kind: 'result', files: 1 });
  });

  it('says nothing of an agent that changed nothing, nor of one waiting (its question is there)', () => {
    expect(cardActivity(agent({ status: 'done' }), 0)).toBeNull();
    expect(cardActivity(agent({ status: 'waiting', activity: 'Lit a.ts' }), 3)).toBeNull();
  });
});

describe('a question answered from the list (2.0, new)', () => {
  it('is the question an agent waits on, with its choices', () => {
    const a = agent({ status: 'waiting', requests: [question()] });
    expect(listQuestion(a)).toEqual({
      requestId: 'req_q',
      question: 'Lancer toute la suite e2e (38 tests) ?',
      options: ['Oui', 'Seulement auth'],
    });
  });

  it('is not one of several questions, one without choices, one cut short, nor a permission: those are answered in the conversation', () => {
    const two = question({
      questions: [
        { question: 'A ?', options: ['1', '2'] },
        { question: 'B ?', options: ['1', '2'] },
      ],
    });
    for (const r of [
      two,
      question({ questions: [{ question: 'Ton nom ?', options: [] }] }),
      question({ cut: true }),
      question({ kind: 'permission' }),
    ])
      expect(listQuestion(agent({ status: 'waiting', requests: [r] }))).toBeNull();
  });

  it('is none once the agent works again', () => {
    expect(listQuestion(agent({ status: 'running', requests: [question()] }))).toBeNull();
    expect(listQuestion(agent({ status: 'waiting', requests: [] }))).toBeNull();
  });
});
