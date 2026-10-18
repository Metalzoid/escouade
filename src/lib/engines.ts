// What a harness can do, as it declares it (`EngineCaps`, docs/ENGINES.md): the window shows a function from these,
// never from the name of the agent's harness. A function its harness lacks is hidden, not greyed out.

import { api } from './ipc';
import { app } from './state.svelte';
import type { EngineCaps, EngineDecl, EngineId, ToldModel } from './types';

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

/** The harnesses offered (menus « Harness », brand): those declared whose program is found, in the backend's order. */
export function offered(): EngineDecl[] {
  return app.engines.filter((e) => app.enginesFound.includes(e.id));
}

/** Whether there is a harness to choose: the menus « Harness » show from two harnesses found on. */
export function choosesEngine(): boolean {
  return offered().length > 1;
}

/** The harnesses offered, as the options of a menu « Harness »; `current` stays listed even if it is not found any more. */
export function engineOptions(current?: EngineId | null): { value: EngineId; label: string }[] {
  const list = offered();
  const kept = current && !list.some((e) => e.id === current) ? app.engines.filter((e) => e.id === current) : [];
  return [...list, ...kept].map((e) => ({ value: e.id, label: e.name }));
}

/** The usual names of the harnesses, for one this version does not write yet (an account of it saved by a later one). */
const NAMES: Record<EngineId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  copilot: 'Copilot CLI',
  cursor: 'Cursor CLI',
  opencode: 'OpenCode',
};

/** The name of a harness as the interface says it: as the backend declares it, else its usual name, else its id. */
export function engineName(engine: EngineId | null | undefined): string {
  return engineOf(engine)?.name ?? (engine ? (NAMES[engine] ?? engine) : '');
}

/**
 * The name of the agents of a harness as the texts speak of them (« {engine} attend ta réponse »): `Claude` for Claude Code,
 * as it declares it (null: the default harness's); its name when it does not say one.
 */
export function speakerOf(engine: EngineId | null | undefined): string {
  const decl = engineOf(engine);
  return decl?.speaker || decl?.name || engine || '';
}

/** The harnesses the agents run on (archived ones aside). */
export function enginesInUse(): Set<EngineId> {
  return new Set(
    Object.values(app.agents)
      .filter((a) => !a.archived)
      .map((a) => a.engine ?? 'claude'),
  );
}

/** Whether the brand of an agent's harness shows (its card, the sidebar, the overview, its header): once agents run on two. */
export function showsMark(): boolean {
  return enginesInUse().size > 1;
}

/** The models the harness of `who` listed for its account (Codex: `model/list`), none until it has. */
function toldOf(who: { engine: EngineId | null | undefined }): ToldModel[] {
  const id = who.engine ?? engineOf(null)?.id;
  return (id && app.engineModels[id]) || [];
}

/** The name a harness that lists its models gives `model` (`gpt-6-luna` → `GPT-6-Luna`), if one does. */
export function toldLabel(model: string): string | undefined {
  for (const list of Object.values(app.engineModels)) {
    const found = list?.find((m) => m.id === model);
    if (found) return found.label;
  }
  return undefined;
}

/**
 * The models of the composer's menu for the harness of `who`: those it listed for its account when it lists them, else
 * those it declares (none for a harness the backend does not know).
 */
export function modelsOf(who: { engine: EngineId | null | undefined }): { id: string; label: string }[] {
  const told = toldOf(who);
  if (told.length) return told.map((m) => ({ id: m.id, label: m.label }));
  return engineOf(who.engine)?.models ?? [];
}

/** The efforts of the harness of `who`, among `all` (in their order): none when it takes none. */
export function effortsOf<T extends { value: string }>(who: { engine: EngineId | null | undefined; model?: string }, all: T[]): T[] {
  const decl = engineOf(who.engine);
  if (!decl?.caps.effort) return [];
  // Those of its model, as its harness listed it.
  const told = toldOf(who).find((m) => m.id === who.model);
  const efforts = told ? told.efforts : decl.efforts;
  return all.filter((e) => efforts.includes(e.value));
}

/**
 * Whether `model` takes an effort or the mode `auto` on the harness of `who`, as its declaration says: by its id, else by
 * the declared model its full id holds (`claude-haiku-4-5` is Haiku). A model it does not declare takes them.
 */
export function modelTakes(who: { engine: EngineId | null | undefined }, model: string, what: 'effort' | 'auto'): boolean {
  const m = model.toLowerCase();
  const told = toldOf(who).find((x) => x.id.toLowerCase() === m);
  if (told) return what === 'effort' ? told.efforts.length > 0 : true;
  const models = engineOf(who.engine)?.models ?? [];
  const decl = models.find((x) => x.id === m) ?? models.find((x) => m.includes(x.id));
  return decl ? decl[what] : true;
}

/**
 * The harness the texts written by a model go to (« Modèle des textes rédigés »), as the backend picks it
 * (`oneshot::writer`): the one `chosen` while it is found, else Claude Code when it is (its Haiku), else the first found;
 * null when none is.
 */
export function writerOf(chosen: EngineId | null | undefined): EngineId | null {
  const found = offered().map((e) => e.id);
  if (chosen && found.includes(chosen)) return chosen;
  return found.includes('claude') ? 'claude' : (found[0] ?? null);
}

/** The choices of « Modèle des textes rédigés »: the model each harness found writes them with (`Claude Haiku`). */
export function writerOptions(): { value: EngineId; label: string }[] {
  return offered().map((e) => ({ value: e.id, label: e.writer || e.name }));
}

/** The models of `engine` marked as favorites, in the order they were marked. */
export function favoritesOf(engine: EngineId | null | undefined): string[] {
  const id = engine ?? engineOf(null)?.id;
  return (id && app.settings.favoriteModels?.[id]) || [];
}

/** `model` of `engine` marked as a favorite, or no longer: kept at once (not part of the settings' draft). */
export async function setFavorite(engine: EngineId, model: string, favorite: boolean): Promise<void> {
  const all = await app.run(api.favoriteModelSet(engine, model, favorite));
  if (all) app.settings = { ...app.settings, favoriteModels: all };
}

/** Whether the menu of the models of `who` takes a search and favorites: its harness lists many, or from several providers. */
export function searchesModels(who: { engine: EngineId | null | undefined }): boolean {
  const told = toldOf(who);
  return told.length > 8 || told.some((m) => !!m.provider);
}

/**
 * The models of the composer's menu for `who`, the favorites first (in their order), each with its provider: what
 * `modelsOf` gives, for a harness that lists them from its providers (OpenCode).
 */
export function modelMenu(who: {
  engine: EngineId | null | undefined;
}): { id: string; label: string; provider?: string; favorite: boolean }[] {
  const favorites = favoritesOf(who.engine);
  const told = toldOf(who);
  const all = told.length ? told.map((m) => ({ id: m.id, label: m.label, provider: m.provider })) : modelsOf(who);
  const rank = (id: string) => {
    const i = favorites.indexOf(id);
    return i < 0 ? favorites.length : i;
  };
  return all.map((m) => ({ ...m, favorite: favorites.includes(m.id) })).sort((a, b) => rank(a.id) - rank(b.id));
}
