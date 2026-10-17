// Derived KPIs of the Stats tab.

import { capsOf } from './engines';
import { fUsd } from './format';
import { t } from './i18n';
import type { EngineCaps, EngineId, StatsView } from './types';

export type Range = 'day' | 'week' | 'month';

export interface Kpis {
  span: string;
  /** Token evolution vs the previous period, in percent (null when there is no reference). */
  delta: number | null;
  costPerPrompt: number | null;
  tokensPerPrompt: number | null;
  promptsPerBucket: number;
}

export function kpis(v: StatsView): Kpis {
  // A range the backend does not know is read as the default one, the days.
  const range: Range = v.range === 'week' || v.range === 'month' ? v.range : 'day';
  return {
    span: t(`stats.span.${range}`),
    delta: v.tokensPrev > 0 ? Math.round(((v.tokens - v.tokensPrev) / v.tokensPrev) * 100) : null,
    costPerPrompt: v.prompts > 0 ? v.cost / v.prompts : null,
    tokensPerPrompt: v.prompts > 0 ? v.tokens / v.prompts : null,
    promptsPerBucket: v.buckets.length ? v.prompts / v.buckets.length : 0,
  };
}

/** How the cost of the turns of `engines` is known: told exactly, estimated by Escouade, or not at all. */
export type CostKind = EngineCaps['cost'];

/**
 * How the cost of what several harnesses ran is known, as each one declares it: unknown when none of them gives one,
 * estimated as soon as one of them is only estimated, exact otherwise. A harness the window does not know is taken as exact
 * (its turns have the cost they were written with).
 */
export function costKindOf(engines: string[]): CostKind {
  const kinds = engines.map((e) => capsOf(e as EngineId)?.cost ?? 'exact');
  if (kinds.length && kinds.every((k) => k === 'none')) return 'none';
  return kinds.includes('estimated') ? 'estimated' : 'exact';
}

/** A cost as the statistics write it: « — » when the harness gives none, « ≈ 1,20 $ » when it is an estimate. */
export function fCost(cost: number, kind: CostKind): string {
  if (kind === 'none') return '—';
  // A non-breaking space, as in fUsd: « ≈ » never ends a line alone.
  return (kind === 'estimated' ? '≈ ' : '') + fUsd(cost);
}

/** Why a cost is shown so, for its tooltip: an estimate, or none given. */
export function costHint(kind: CostKind): string | undefined {
  if (kind === 'estimated') return t('stats.cost.estimatedHint');
  if (kind === 'none') return t('stats.cost.noneHint');
  return undefined;
}

/** Lines of the lists of agents and tickets before « Tout voir ». */
export const ROWS = 20;

export function shown<T>(list: T[], all: boolean): T[] {
  return all ? list : list.slice(0, ROWS);
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × 10^n. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}
