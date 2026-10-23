import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { agent, BARE_ENGINE, CLAUDE_ENGINE, resetApp } from '../test/ipc';
import { setLang } from './i18n';
import { cardActivity, cardSpend, listQuestion, sidebarOrder } from './sidebar';
import { app } from './state.svelte';
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

  it('says its turn is over and what goes on, when it left work running (« Attend »)', () => {
    const pending = { subagents: 1, background: 1, driven: [] };
    expect(cardActivity(agent({ status: 'done' }), 2, pending)).toEqual({ kind: 'over', goes: '1 sous-agent, 1 tâche de fond' });
    const driven = { subagents: 0, background: 0, driven: [agent({ id: 'x' }), agent({ id: 'y' })] };
    expect(cardActivity(agent({ status: 'idle' }), 0, driven)).toEqual({ kind: 'over', goes: '2 agents pilotés' });
    setLang('en');
    onTestFinished(() => setLang('fr'));
    expect(cardActivity(agent({ status: 'done' }), 0, { subagents: 2, background: 1, driven: [agent()] })).toEqual({
      kind: 'over',
      goes: '2 subagents, 1 background task, 1 driven agent',
    });
  });

  it('keeps its result when all it waits for is its wake-up, said on its status', () => {
    const wake = { subagents: 0, background: 0, driven: [], wake: { at: 2, schedule: null, prompt: null } };
    expect(cardActivity(agent({ status: 'done' }), 2, wake as never)).toEqual({ kind: 'result', files: 2 });
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

describe('the spending of a card', () => {
  afterEach(() => setLang('fr'));
  /** Its words, the no-break space before « $ » and after « ≈ » read as a space. */
  const spend = (...args: Parameters<typeof cardSpend>) => cardSpend(...args).replace(/ /g, ' ');
  const harness = (caps: Partial<typeof BARE_ENGINE.caps>) => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, caps: { ...BARE_ENGINE.caps, ...caps } }];
  };

  it('gives its tokens and its cost, exact or « ≈ » while a turn runs', () => {
    resetApp();
    expect(spend(agent({ tokens: 184_300, cost: 2.41 }))).toBe('184,3 k · 2,41 $');
    expect(spend(agent({ tokens: 1000, cost: 0.2, liveTokens: 500, liveCost: 0.1 }))).toBe('1,5 k · ≈ 0,30 $');
  });

  it('marks « ≈ » all the cost of a harness that tells none (Codex), its turn over too', () => {
    harness({ cost: 'estimated' });
    expect(spend(agent({ engine: 'codex', status: 'done', tokens: 41_000, cost: 0.52 }))).toBe('41,0 k · ≈ 0,52 $');
  });

  it('gives its tokens alone when its harness tells no cost', () => {
    harness({ cost: 'none' });
    expect(spend(agent({ engine: 'codex', tokens: 12_400, cost: 0 }))).toBe('12,4 k');
  });

  it('counts in credits a harness whose limit is the month’s credits (Copilot CLI), a credit being 0,01 $', () => {
    harness({ cost: 'exact', quota: 'credits' });
    expect(spend(agent({ engine: 'codex', tokens: 30_000, cost: 0.5 }))).toBe('50 crédits · 0,50 $');
    expect(spend(agent({ engine: 'codex', tokens: 300, cost: 0.01 }))).toBe('1 crédit · 0,010 $');
    expect(spend(agent({ engine: 'codex', tokens: 9e6, cost: 12.34 }))).toBe('1 234 crédits · 12,34 $');
    setLang('en');
    expect(spend(agent({ engine: 'codex', tokens: 30_000, cost: 0.5 }))).toBe('50 credits · $0.50');
  });
});
