// What an agent has used, including its running turn: the CLI reports a turn's exact cost only
// when it ends, until then the backend estimates it from list prices. A harness that tells no cost
// (Codex) has all of it estimated by the backend, from its tokens.

import { capsOf } from './engines';
import { fInt, fPct, fUsd } from './format';
import { t } from './i18n';
import type { Agent, EngineId } from './types';

export interface Spent {
  tokens: number;
  cost: number;
  /** Part of it comes from a running turn, or its harness tells no cost: the cost is an estimate. */
  estimated: boolean;
  /** Its harness tells no cost: all of it is estimated (said by `estimateHint`). */
  byHarness?: boolean;
}

/** Whether the harness `engine` tells no cost, Escouade estimating it from the tokens. */
export function estimatedBy(engine: EngineId | null | undefined): boolean {
  return capsOf(engine)?.cost === 'estimated';
}

export function spent(a: Pick<Agent, 'tokens' | 'cost' | 'liveTokens' | 'liveCost'> & { engine?: EngineId | null }): Spent {
  const liveTokens = a.liveTokens ?? 0;
  const byHarness = estimatedBy(a.engine);
  return {
    tokens: a.tokens + liveTokens,
    cost: a.cost + (a.liveCost ?? 0),
    estimated: byHarness || liveTokens > 0 || (a.liveCost ?? 0) > 0,
    ...(byHarness ? { byHarness } : {}),
  };
}

export function fSpentUsd(s: { cost: number; estimated: boolean }): string {
  // A non-breaking space, as in fUsd: « ≈ » never ends a line alone.
  return (s.estimated ? '≈\u00a0' : '') + fUsd(s.cost);
}

/**
 * Why the cost is an estimate (read where it is shown, so that it follows the language): its harness tells none, or it
 * comes from a running turn.
 */
export const estimateHint = (s?: { byHarness?: boolean }) => (s?.byHarness ? t('stats.cost.estimatedHint') : t('shell.spend.estimateHint'));

export interface ContextUse {
  /** Percent of the model's window. */
  pct: number;
  /** In the language of the interface when `contextUse` is called: call it where it is shown. */
  title: string;
  /** Nearly full: Claude Code compacts it soon. */
  full: boolean;
}

/** How full an agent's context is, out of the window of its conversation's model: null until a turn told the window. */
export function contextUse(a: Pick<Agent, 'contextTokens' | 'contextWindow'>): ContextUse | null {
  const size = a.contextWindow;
  if (!size) return null;
  const pct = Math.round((a.contextTokens / size) * 100);
  return {
    pct,
    title: t('shell.spend.context', { pct: fPct(pct), used: fInt(a.contextTokens), size: fInt(size) }),
    full: pct >= 80,
  };
}
