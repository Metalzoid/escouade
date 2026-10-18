// Model / effort / permission-mode catalogs used by the composer and the settings.

import { t } from './i18n';
import { speakerOf, toldLabel } from './engines';
import type { ModelInfo } from './types';

/** The aliases offered: Claude Code runs the latest model of the family it knows. */
export const MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

/** A choice whose label and title are read when shown, so that they follow the language of the interface. */
function choice(value: string, label: () => string, title: () => string): { value: string; label: string; title: string } {
  return {
    value,
    get label() {
      return label();
    },
    get title() {
      return title();
    },
  };
}

export const EFFORTS = [
  choice(
    'low',
    () => t('composer.effort.low.label'),
    () => t('composer.effort.low.title'),
  ),
  choice(
    'medium',
    () => t('composer.effort.medium.label'),
    () => t('composer.effort.medium.title'),
  ),
  choice(
    'high',
    () => t('composer.effort.high.label'),
    () => t('composer.effort.high.title'),
  ),
  choice(
    'xhigh',
    () => t('composer.effort.xhigh.label'),
    () => t('composer.effort.xhigh.title'),
  ),
  choice(
    'max',
    () => t('composer.effort.max.label'),
    () => t('composer.effort.max.title'),
  ),
];

/**
 * What a mode means, its agents named `engine` as their harness names them (« Claude demande ton accord… »). The menu
 * of the settings names the default harness's.
 */
export function modeTitle(mode: string, engine: string): string {
  switch (mode) {
    case 'default':
      return t('composer.mode.default.title', { engine });
    case 'plan':
      return t('composer.mode.plan.title', { engine });
    default:
      return MODES.find((m) => m.value === mode)?.title ?? '';
  }
}

export const MODES = [
  choice(
    'auto',
    () => t('composer.mode.auto.label'),
    () => t('composer.mode.auto.title'),
  ),
  choice(
    'default',
    () => t('composer.mode.default.label'),
    () => modeTitle('default', speakerOf(null)),
  ),
  choice(
    'plan',
    () => t('composer.mode.plan.label'),
    () => modeTitle('plan', speakerOf(null)),
  ),
  choice(
    'acceptEdits',
    () => t('composer.mode.acceptEdits.label'),
    () => t('composer.mode.acceptEdits.title'),
  ),
  choice(
    'bypassPermissions',
    () => t('composer.mode.bypassPermissions.label'),
    () => t('composer.mode.bypassPermissions.title'),
  ),
];

/**
 * "sonnet" → "Sonnet 5.5" once Claude Code has told which model the alias runs (`catalog`),
 * "claude-sonnet-5" → "Sonnet 5", "gpt-6-luna" → "GPT-6-Luna" once Codex has listed it.
 */
export function modelLabel(model: string, catalog: ModelInfo[] = []): string {
  const m = model.toLowerCase();
  const known = MODELS.find((x) => x.value === m);
  // A model of a harness that lists its own (Codex): the name it gives it.
  if (!known) return toldLabel(model) ?? displayModel(model);
  const id = resolveAlias(m, catalog);
  return id ? displayModel(id) : known.label;
}

/**
 * The models of a harness's menu (its declaration's, Claude Code's aliases by default), each labelled with the version
 * the harness runs for it once it has told (`catalog`), else with its declared name.
 */
export function modelOptions(
  catalog: ModelInfo[],
  models: { id: string; label: string }[] = MODELS.map((m) => ({ id: m.value, label: m.label })),
): { value: string; label: string }[] {
  return models.map((m) => {
    const id = resolveAlias(m.id.toLowerCase(), catalog);
    return { value: m.id, label: id ? displayModel(id) : m.label };
  });
}

/**
 * The full id Claude Code runs for an alias: the one it reports for it, else the newest of the
 * family it lists (it lists some, like Fable, only by their full ids).
 */
function resolveAlias(alias: string, catalog: ModelInfo[]): string | undefined {
  const own = catalog.find((x) => x.value.toLowerCase() === alias && x.resolvedModel);
  if (own) return own.resolvedModel;
  let best: { id: string; major: number; minor: number } | undefined;
  for (const x of catalog) {
    const p = parseModel(x.resolvedModel);
    if (p?.family !== alias || p.major === undefined) continue;
    const minor = p.minor ?? 0;
    if (!best || p.major > best.major || (p.major === best.major && minor > best.minor)) {
      best = { id: x.resolvedModel, major: p.major, minor };
    }
  }
  return best?.id;
}

/** A trailing date (`-20250514`) is no part of the version. */
function parseModel(id: string): { family: string; major?: number; minor?: number } | null {
  const m = id.toLowerCase().match(/(fable|opus|sonnet|haiku)[-_]?(?:(\d{1,2})(?!\d))?(?:[-_.](\d{1,2})(?!\d))?/);
  if (!m) return null;
  return { family: m[1], major: m[2] ? Number(m[2]) : undefined, minor: m[3] ? Number(m[3]) : undefined };
}

/** "claude-opus-5-5" → "Opus 5.5", "claude-haiku-4-5-20251001" → "Haiku 4.5". */
export function displayModel(id: string): string {
  const p = parseModel(id);
  if (!p) return id;
  const name = p.family[0].toUpperCase() + p.family.slice(1);
  if (p.major === undefined) return name;
  return p.minor !== undefined ? `${name} ${p.major}.${p.minor}` : `${name} ${p.major}`;
}

export function supportsEffort(model: string): boolean {
  return !model.toLowerCase().includes('haiku');
}

/**
 * Whether a model of Claude Code takes the mode `auto`, before the `claude` of its account has told (`toldAuto`): every
 * one but a Haiku older than 5 (`claude-haiku-4-5`, `claude-3-5-haiku`). The alias `haiku` takes it, as from Claude Code
 * 2.1.293 on, where it runs Haiku 5.5. The rule of `supports_auto` (engine/claude/mod.rs).
 */
export function supportsAuto(model: string): boolean {
  const m = model.toLowerCase();
  const at = m.indexOf('haiku');
  if (at < 0) return true;
  // A version has a digit or two: more is a date (`claude-3-5-haiku-20241022`).
  const after = m.slice(at + 5).match(/^[-_]?(\d{1,2})(?!\d)/);
  const before = m.slice(0, at).match(/^claude-(\d{1,2})(?!\d)/);
  const major = after?.[1] ?? before?.[1];
  return major === undefined || Number(major) >= 5;
}

/**
 * Whether `model` takes the mode `auto`, as a `claude` told it (`initialize`, its models' `supportsAutoMode`): by its alias
 * or its full id (with or without its date). Undefined when it tells nothing of the mode or does not list `model`. The
 * rule of `told_auto` (engine/claude/mod.rs).
 */
export function toldAuto(told: ModelInfo[], model: string): boolean | undefined {
  if (told.every((t) => t.supportsAutoMode === undefined)) return undefined;
  const m = model.toLowerCase();
  const found =
    told.find((t) => t.value.toLowerCase() === m) ??
    told.find((t) => {
      const r = t.resolvedModel.toLowerCase();
      return r === m || r.startsWith(`${m}-`);
    });
  return found ? found.supportsAutoMode === true : undefined;
}
