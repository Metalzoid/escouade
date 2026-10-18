import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './state.svelte';
import { BARE_ENGINE, CLAUDE_ENGINE } from '../test/ipc';
import { setLang } from './i18n';
import { displayModel, EFFORTS, modelLabel, MODES, modelOptions, modeTitle, supportsAuto, supportsEffort, toldAuto } from './models';

beforeEach(() => {
  app.engines = [CLAUDE_ENGINE];
});
import type { ModelInfo } from './types';

/** What Claude Code 2.1.284 answers to `initialize` (abridged): Fable only by its full id. */
const CATALOG: ModelInfo[] = [
  { value: 'default', resolvedModel: 'claude-opus-5-5' },
  { value: 'opus', resolvedModel: 'claude-opus-5-5' },
  { value: 'claude-fable-5-1', resolvedModel: 'claude-fable-5-1' },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5' },
  { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' },
  { value: 'claude-sonnet-5', resolvedModel: 'claude-sonnet-5' },
  { value: 'claude-fable-5', resolvedModel: 'claude-fable-5' },
];

describe('displayModel', () => {
  it.each([
    ['claude-opus-5-5', 'Opus 5.5'],
    ['claude-sonnet-5', 'Sonnet 5'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-fable-5-1', 'Fable 5.1'],
    ['claude-opus-4-8', 'Opus 4.8'],
    ['claude-sonnet-4-20250514', 'Sonnet 4'],
    ['claude-3-7-sonnet-20250219', 'Sonnet'],
    ['gpt-unknown', 'gpt-unknown'],
  ])('%s → %s', (id, want) => expect(displayModel(id)).toBe(want));
});

describe('modelLabel', () => {
  it('names CLI aliases and full ids', () => {
    expect(modelLabel('opus')).toBe('Opus');
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5');
  });

  it('gives an alias the version Claude Code resolves it to', () => {
    expect(modelLabel('sonnet', CATALOG)).toBe('Sonnet 5.5');
    expect(modelLabel('Opus', CATALOG)).toBe('Opus 5.5');
    expect(modelLabel('haiku', CATALOG)).toBe('Haiku 4.5');
  });

  it('gives an alias that Claude Code lists only by full ids the newest of its family', () => {
    const olderFirst = [...CATALOG].reverse();
    expect(modelLabel('fable', olderFirst)).toBe('Fable 5.1');
    const dated = [...CATALOG, { value: 'claude-fable-5-20261001', resolvedModel: 'claude-fable-5-20261001' }];
    expect(modelLabel('fable', dated)).toBe('Fable 5.1');
  });

  it('keeps the bare name of an alias that Claude Code does not report', () => {
    expect(modelLabel('haiku', [{ value: 'sonnet', resolvedModel: 'claude-sonnet-5-5' }])).toBe('Haiku');
  });

  it('names a full id after itself, whatever the catalog', () => {
    expect(modelLabel('claude-sonnet-5', CATALOG)).toBe('Sonnet 5');
  });
});

describe('modelOptions', () => {
  it('labels each choice with the version it stands for', () => {
    expect(modelOptions(CATALOG)).toEqual([
      { value: 'fable', label: 'Fable 5.1' },
      { value: 'opus', label: 'Opus 5.5' },
      { value: 'sonnet', label: 'Sonnet 5.5' },
      { value: 'haiku', label: 'Haiku 4.5' },
    ]);
  });

  it('falls back to the bare names before Claude Code has reported its models', () => {
    expect(modelOptions([]).map((o) => o.label)).toEqual(['Fable', 'Opus', 'Sonnet', 'Haiku']);
  });
});

describe('capabilities', () => {
  it('Haiku takes no effort, and the auto mode from Haiku 5 on (its alias as from Claude Code 2.1.293)', () => {
    expect(supportsEffort('haiku')).toBe(false);
    expect(supportsEffort('opus')).toBe(true);
    for (const m of ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-3-5-haiku-20241022', 'claude-3-haiku']) {
      expect(supportsAuto(m), m).toBe(false);
    }
    for (const m of ['haiku', 'Haiku', 'claude-haiku-5-5', 'claude-haiku-6', 'fable', 'claude-sonnet-4-5', '']) {
      expect(supportsAuto(m), m).toBe(true);
    }
  });

  it('the auto mode follows what a claude told of its models, by alias or full id', () => {
    // As Claude Code 2.1.302 answers `initialize` (ESC-121).
    const told = [
      { value: 'opus', resolvedModel: 'claude-opus-5-5', supportsAutoMode: true },
      { value: 'haiku', resolvedModel: 'claude-haiku-5-5', supportsAutoMode: true },
      { value: 'claude-haiku-4-5-20251001', resolvedModel: 'claude-haiku-4-5-20251001' },
    ];
    expect(toldAuto(told, 'haiku')).toBe(true);
    expect(toldAuto(told, 'claude-haiku-5-5')).toBe(true);
    expect(toldAuto(told, 'claude-haiku-4-5')).toBe(false);
    expect(toldAuto(told, 'sonnet')).toBeUndefined();
    // As 2.1.292: its alias on Haiku 4.5, without the mode.
    expect(toldAuto([told[0], { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }], 'haiku')).toBe(false);
    // A version that tells it of none, or nothing told: the rule decides.
    expect(toldAuto([{ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }], 'haiku')).toBeUndefined();
    expect(toldAuto([], 'haiku')).toBeUndefined();
  });
});

describe('EFFORTS and MODES', () => {
  const words = (list: { label: string; title: string }[]) => list.map((x) => [x.label, x.title]);

  it('are read in the language of the interface each time they are shown', () => {
    expect(EFFORTS.map((e) => e.value)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(words(EFFORTS)[0]).toEqual(['Bas', 'Réponses rapides, peu de réflexion']);
    expect(EFFORTS.map((e) => e.label)).toEqual(['Bas', 'Moyen', 'Élevé', 'Très élevé', 'Max']);
    expect(MODES.map((m) => m.label)).toEqual(['Auto', 'Demander', 'Plan', 'Édits auto', 'Bypass']);
    setLang('en');
    expect(words(EFFORTS)[0]).toEqual(['Low', 'Quick answers, little thinking']);
    expect(EFFORTS.map((e) => e.label)).toEqual(['Low', 'Medium', 'High', 'Very high', 'Max']);
    expect(MODES.map((m) => m.label)).toEqual(['Auto', 'Ask', 'Plan', 'Accept edits', 'Bypass']);
    expect(MODES.find((m) => m.value === 'default')?.title).toBe('Claude asks for your approval before each sensitive action');
  });

  it('name the agents of a mode as their harness does, those of the default harness in the settings', () => {
    expect(modeTitle('plan', 'Claude')).toBe('Claude analyse et propose un plan sans rien modifier');
    expect(modeTitle('default', 'Codex')).toBe('Codex demande ton accord avant chaque action sensible');
    // A mode whose words name no agent keeps them.
    expect(modeTitle('acceptEdits', 'Codex')).toBe(MODES.find((m) => m.value === 'acceptEdits')?.title);
    expect(MODES.find((m) => m.value === 'plan')?.title).toBe('Claude analyse et propose un plan sans rien modifier');
    app.engines = [BARE_ENGINE, CLAUDE_ENGINE];
    expect(MODES.find((m) => m.value === 'plan')?.title).toBe('Nu analyse et propose un plan sans rien modifier');
  });

  it('keep their values, which are the CLI’s', () => {
    expect(MODES.map((m) => m.value)).toEqual(['auto', 'default', 'plan', 'acceptEdits', 'bypassPermissions']);
  });
});
