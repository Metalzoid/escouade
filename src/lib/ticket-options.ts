// « Compte », « Modèle » and « Effort » of a ticket (ESC-153): what its form offers, what « Auto » gives, and what a
// change sets back to « Auto ». Empty is « Auto » for each: the current account of the ticket's harness, the Kanban's
// model and effort, else those of the account that takes it (`tickets::ticket_agent_options`).

import { accountDefaults, accountName, newAgentAccount, usableFor } from './accounts';
import { effortsOf, modelMenu, modelTakes, modelsOf, searchesModels } from './engines';
import { t } from './i18n';
import { EFFORTS, modelLabel, modelOptions } from './models';
import { app } from './state.svelte';
import type { Account, EngineId, Project } from './types';

/** What the form chose: empty strings for « Auto ». */
export interface TicketOptions {
  account: string;
  model: string;
  effort: string;
}

/** A choice of one of the three menus. */
export interface OptionChoice {
  value: string;
  label: string;
  /** Its group in a long list of models (favorites, families). */
  group?: string;
}

/** The ticket's harness and project, as the menus read them. */
export interface OptionsOf {
  project: Project;
  engine: EngineId;
}

/** The account `id`, if the settings have it. */
function accountOf(id: string): Account | undefined {
  return (app.settings.accounts ?? []).find((a) => a.id === id);
}

/** The accounts of « Compte »: those of the ticket's harness its project may use (a private one, those ESC-141 allows). */
export function accountChoices(of: OptionsOf): OptionChoice[] {
  return usableFor(of.project.id, of.engine).map((a) => ({ value: a.id, label: accountName(a) }));
}

/** The account its agent would start on: the one chosen, else the current one of its harness for its project. */
function accountUsed(of: OptionsOf, account: string): Account | undefined {
  return (account ? accountOf(account) : undefined) ?? newAgentAccount(of.project, of.engine);
}

/** The account whose models « Modèle » lists: the one chosen, else the current one (`modelsOf` of every account without). */
function who(of: OptionsOf, account: string): { engine: EngineId; account?: string } {
  return { engine: of.engine, account: accountUsed(of, account)?.id };
}

/** The models of « Modèle », as the composer's menu lists them for that account (ESC-124, OpenCode's favorites first). */
export function modelChoices(of: OptionsOf, account: string): OptionChoice[] {
  const w = who(of, account);
  if (searchesModels(w)) return modelMenu(w).map((m) => ({ value: m.id, label: m.label, group: m.group }));
  return modelOptions(app.models, modelsOf(w));
}

/** The model « Auto » gives, and where it comes from: the Kanban's, else the account's (its harness's default). */
function autoModel(of: OptionsOf, account: string): { model: string; from: 'board' | 'account' } {
  if (of.project.board.model) return { model: of.project.board.model, from: 'board' };
  return { model: accountDefaults(accountUsed(of, account), of.engine).model, from: 'account' };
}

/** The model its agent would run: the one chosen, else « Auto »'s. */
function modelUsed(of: OptionsOf, o: Pick<TicketOptions, 'account' | 'model'>): string {
  return o.model || autoModel(of, o.account).model;
}

/** The efforts of « Effort »: those the model its agent would run takes, as the composer's menu has them; none when it takes none. */
export function effortChoices(of: OptionsOf, o: Pick<TicketOptions, 'account' | 'model'>): OptionChoice[] {
  const w = who(of, o.account);
  const model = modelUsed(of, o);
  if (model && !modelTakes(w, model, 'effort')) return [];
  return effortsOf({ ...w, model }, EFFORTS).map((e) => ({ value: e.value, label: e.label }));
}

/** Why « Effort » is greyed out: its harness, or the model its agent would run, takes none. Null when it is not. */
export function effortRefusal(of: OptionsOf, o: Pick<TicketOptions, 'account' | 'model'>): string | null {
  if (effortChoices(of, o).length) return null;
  const model = modelUsed(of, o);
  return model ? t('board.form.options.noEffort', { model: modelLabel(model, app.models) }) : t('board.form.options.noEffortHarness');
}

/** « Auto · Principal »: the account « Auto » gives now; « Auto » alone when none would take the ticket. */
export function autoAccountLabel(of: OptionsOf): string {
  const a = newAgentAccount(of.project, of.engine);
  return a ? t('board.form.options.autoIs', { what: accountName(a) }) : t('board.form.options.auto');
}

/** « Auto · Opus 5.5 (Kanban) »: the model « Auto » gives, and from where. */
export function autoModelLabel(of: OptionsOf, account: string): string {
  const { model, from } = autoModel(of, account);
  if (!model) return t('board.form.options.auto');
  return t(from === 'board' ? 'board.form.options.autoFromBoard' : 'board.form.options.autoFromAccount', {
    what: modelLabel(model, app.models),
  });
}

/** « Auto · Moyen (Kanban) »: the effort « Auto » gives, and from where. */
export function autoEffortLabel(of: OptionsOf, account: string): string {
  const board = of.project.board.effort;
  const effort = board || accountDefaults(accountUsed(of, account), of.engine).effort;
  const what = EFFORTS.find((e) => e.value === effort)?.label ?? effort;
  if (!what) return t('board.form.options.auto');
  return t(board ? 'board.form.options.autoFromBoard' : 'board.form.options.autoFromAccount', { what });
}

/** The label of a choice of `list` (`fallback`, by default `value` itself, when it is not there: a model the list does not have). */
export function labelOf(list: OptionChoice[], value: string, fallback = value): string {
  return list.find((c) => c.value === value)?.label ?? fallback;
}

/**
 * What a change leaves of the three: an account the harness or the project no longer offers, a model the account does not
 * have, an effort the model does not take, each set back to « Auto », with what the form says of it. A list not known yet
 * (the models of an account not read) keeps what was chosen.
 */
export function fitOptions(of: OptionsOf, o: TicketOptions): { options: TicketOptions; notices: string[] } {
  const out = { ...o };
  const notices: string[] = [];
  if (out.account && !accountChoices(of).some((c) => c.value === out.account)) {
    const a = accountOf(out.account);
    notices.push(t('board.form.options.accountReset', { account: a ? accountName(a) : out.account }));
    out.account = '';
  }
  const models = modelChoices(of, out.account);
  if (out.model && models.length && !models.some((c) => c.value === out.model)) {
    const a = accountUsed(of, out.account);
    notices.push(t('board.form.options.modelReset', { account: a ? accountName(a) : '', model: modelLabel(out.model, app.models) }));
    out.model = '';
  }
  if (out.effort && !effortChoices(of, out).some((c) => c.value === out.effort)) {
    const effort = EFFORTS.find((e) => e.value === out.effort)?.label ?? out.effort;
    notices.push(t('board.form.options.effortReset', { model: modelLabel(modelUsed(of, out), app.models), effort }));
    out.effort = '';
  }
  return { options: out, notices };
}
