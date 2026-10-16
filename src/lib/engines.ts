// What a harness can do, as it declares it (`EngineCaps`, docs/ENGINES.md): the window shows a function from these,
// never from the name of the agent's harness. A function its harness lacks is hidden, not greyed out.

import { app } from './state.svelte';
import type { EngineCaps, EngineDecl, EngineId } from './types';

/** The flags of `EngineCaps` that say yes or no. */
type Flag = { [K in keyof EngineCaps]: EngineCaps[K] extends boolean ? K : never }[keyof EngineCaps];

/**
 * What `engine` declares, null for one the backend does not know (none of its functions shown). No harness yet (null):
 * the default one, which the backend lists first.
 */
export function engineOf(engine: EngineId | null | undefined): EngineDecl | null {
  return (engine ? app.engines.find((e) => e.id === engine) : app.engines[0]) ?? null;
}

/** The capabilities of `engine` (null: the default harness's). */
export function capsOf(engine: EngineId | null | undefined): EngineCaps | null {
  return engineOf(engine)?.caps ?? null;
}

/** Whether the harness of `who` (an agent, or anything that runs on one) has the capability `flag`. */
export function can(who: { engine: EngineId | null | undefined }, flag: Flag): boolean {
  return capsOf(who.engine)?.[flag] === true;
}

/** Whether the harness of `who` copies a conversation (« Dupliquer la conversation »). */
export function canFork(who: { engine: EngineId | null | undefined }): boolean {
  const fork = capsOf(who.engine)?.fork;
  return !!fork && fork !== 'none';
}

/** Whether the harness of `who` tells what a turn costs, exactly or estimated (none: no cost shown). */
export function showsCost(who: { engine: EngineId | null | undefined }): boolean {
  const cost = capsOf(who.engine)?.cost;
  return !!cost && cost !== 'none';
}

/** The modes the harness of `who` takes, among `all` (in their order). */
export function modesOf<T extends { value: string }>(who: { engine: EngineId | null | undefined }, all: T[]): T[] {
  const ids = new Set(capsOf(who.engine)?.modes.map((m) => m.id) ?? []);
  return all.filter((m) => ids.has(m.value));
}

/** Whether any harness Escouade knows has the capability `flag` (for a setting of them all). */
export function anyCan(flag: Flag): boolean {
  return app.engines.some((e) => e.caps[flag]);
}
