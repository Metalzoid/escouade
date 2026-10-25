// Cursor CLI (ESC-42): agents on the fake `agent acp` (tests/fixtures/fake-cursor.mjs), which speaks ACP v1 with the
// extensions `cursor/*` as Cursor CLI 2026.10.22 does, and whose message picks what a turn does. What the app sent it is
// in its log (FAKE_CURSOR_LOG).

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_CURSOR, send, test, type App } from './fixture';

type Entry = {
  launch?: { argv: string[]; configDir: string | null; msystem: string | null; apiKey?: string | null };
  dir?: string;
  msg?: any;
};

/** What the fake agent was told and said, launch by launch. */
function cursorLog(app: App): Entry[] {
  const file = path.join(app.root, 'fake-cursor.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The parameters of each request `method` the app sent, in order. */
const sent = (app: App, method: string) =>
  cursorLog(app)
    .filter((e) => e.dir === 'c2s' && e.msg?.method === method)
    .map((e) => e.msg.params);

/** The answers the app gave to the requests of the fake (permissions, questions, plans). */
const replies = (app: App) =>
  cursorLog(app)
    .filter((e) => e.dir === 'c2s' && e.msg && e.msg.method === undefined)
    .map((e) => e.msg.result);

/** A new agent on Cursor CLI, from the menu beside « Nouvel agent ». */
async function newCursorAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitemradio', { name: 'Cursor CLI' }).click();
  await expect(page.locator('main.conv header.head')).toContainText('Cursor');
  await expect(page.getByRole('textbox', { name: 'Décris la tâche à confier à Cursor…' })).toBeVisible();
}

test.describe('an agent on Cursor CLI', () => {
  // Started from Git Bash, Escouade would pass MSYSTEM on: Cursor's shell would be Git Bash, and its hooks would block.
  test.use({ appEnv: { ESCOUADE_CURSOR: FAKE_CURSOR, MSYSTEM: 'MINGW64' } });

  test('converses, asks its permissions with a write’s diff, « Pour cet agent » included, its questions, plans and tasks', async ({
    app,
  }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCursorAgent(page);
    await send(page, 'bonjour Cursor');
    await expect(page.getByText('Cursor a reçu : bonjour Cursor')).toBeVisible();
    // Started as Escouade drives Cursor: `agent acp`, without MSYSTEM, in a configuration folder of the agent's own
    // (its rules, model and sessions), asking for its subagents.
    const launch = cursorLog(app).find((e) => e.launch)!.launch!;
    expect(launch.argv).toEqual(['acp']);
    expect(launch.msystem).toBeNull();
    const homes = path.join(app.data, 'agent-homes');
    expect(path.dirname(launch.configDir!).toLowerCase()).toBe(homes.toLowerCase());
    expect(sent(app, 'initialize')[0].clientCapabilities._meta.subagents).toBe(true);
    const opened = sent(app, 'session/new')[0];
    expect(path.resolve(opened.cwd).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());

    // A command: why Cursor asks; « Pour cet agent », never « Toujours ». Its rule goes to the agent's folder only.
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('npm test');
    await expect(card).toContainText('Not in allowlist: npm');
    await expect(card.getByRole('button', { name: /Toujours/ })).toHaveCount(0);
    await card.getByRole('button', { name: 'Pour cet agent' }).click();
    await expect(page.getByText('La commande a marché.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-always' } });
    const rules = JSON.parse(fs.readFileSync(path.join(launch.configDir!, 'cli-config.json'), 'utf8'));
    expect(rules.permissions.allow).toContain('Shell(npm)');
    await expect(page.getByText('Autorisé pour cet agent')).toBeVisible();
    // Asked again, it asks no more.
    await send(page, 'commande encore');
    await expect(page.getByText('La commande a marché.')).toHaveCount(2);
    await expect(card).toHaveCount(0);

    // A write in its folder goes by Escouade's rules, without a card; one beside it asks, with its diff.
    await send(page, 'fichier');
    await expect(page.getByText('J’ai modifié notes.txt.')).toBeVisible();
    await send(page, 'fichier dehors');
    await expect(card).toContainText('Hors du dossier de l’agent');
    await expect(card.locator('.patch, .patch-view, pre').first()).toContainText('note de Cursor');
    await card.getByRole('button', { name: 'Autoriser', exact: true }).click();
    await expect(page.getByText('J’ai modifié cursor-dehors.txt.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } });

    // A question (cursor/ask_question): answered by the id of its choice.
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Quelle couleur préfères-tu ?');
    await question.getByRole('button', { name: 'bleu' }).click();
    await expect(page.getByText('Tu as choisi bleu.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({
      outcome: { outcome: 'answered', answers: [{ questionId: 'couleur', selectedOptionIds: ['b'] }] },
    });

    // A plan (cursor/create_plan): the card of a plan to approve, its tasks in the « Plan » banner.
    await send(page, 'propose un plan');
    const plan = page.getByRole('group', { name: 'Cursor propose un plan' });
    await expect(plan).toContainText('Ajouter sub');
    // The « Plan » banner (the card of a plan to approve has a `.plan` of its own).
    const banner = page.locator('main.conv .plan:has(> .inner)');
    await expect(banner).toContainText('0/2');
    await plan.getByRole('button', { name: 'Approuver le plan' }).click();
    await expect(page.getByText('Plan approuvé, je commence.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ outcome: { outcome: 'accepted' } });

    // Its tasks (cursor/update_todos) and its subagent (cursor/task), in the « Plan » banner; its tool under its Task.
    await send(page, 'sous-agent');
    await expect(page.getByText('Tâches faites, le sous-agent a résumé le README.')).toBeVisible();
    await expect(banner).toContainText('2/2');
    const fold = banner.locator('button.fold');
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
    await expect(banner).toContainText('Résumer');
    await expect(page.getByRole('button', { name: /^Agent Résumer le README terminé 1 outil/ })).toBeVisible();

    // Restarted, the app resumes its session (session/load).
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'Cursor' }).first().click();
    await send(page2, 'encore là ?');
    await expect(page2.getByText('Cursor a reçu : encore là ?')).toBeVisible();
    expect(sent(app, 'session/new').length).toBe(1);
    expect(sent(app, 'session/load').length).toBe(1);
    // The history it replayed is not shown twice.
    await expect(page2.getByText('Cursor a reçu : bonjour Cursor')).toHaveCount(1);
  });

  test('its models are the account’s, its modes say they have no sandbox, a message waits for the turn, and a turn stops', async ({
    app,
  }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCursorAgent(page);
    await send(page, 'bonjour');
    await expect(page.getByText('Cursor a reçu : bonjour')).toBeVisible();
    // The models of the account (session/new), Auto first.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio', { name: /Auto/ })).toBeVisible();
    await expect(menu.getByRole('menuitemradio', { name: /Claude Opus 5\.5/ })).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /GPT-5\.5/ }).click();
    await expect
      .poll(() => sent(app, 'session/set_config_option').map((p) => p.value))
      .toContain('gpt-5.5[context=272k,reasoning=medium,fast=false]');
    await send(page, 'modèle');
    await expect(page.getByText(/^Je tourne sur gpt-5\.5\[/)).toBeVisible();

    // The modes say Cursor has no sandbox; « Plan » is its mode Plan.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await expect(page.getByText(/Pas de bac à sable sous Windows/).first()).toBeVisible();
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click();
    await expect.poll(() => sent(app, 'session/set_mode').map((p) => p.modeId)).toContain('plan');
    await page.getByRole('button', { name: /^Mode/ }).click();
    await page.getByRole('menuitemradio', { name: /^Demander/ }).click();
    await expect.poll(() => sent(app, 'session/set_mode').at(-1)?.modeId).toBe('agent');

    // A message sent during a turn waits for its end (a second prompt would cancel it).
    await send(page, 'lent');
    await expect(page.getByText('Je commence un long travail…')).toBeVisible();
    await send(page, 'et maintenant');
    await expect(page.getByText('Long travail fini.')).toBeVisible();
    await expect(page.getByText('Cursor a reçu : et maintenant')).toBeVisible();
    const log = cursorLog(app);
    const second = log.findIndex((e) => e.dir === 'c2s' && e.msg?.params?.prompt?.[0]?.text === 'et maintenant');
    const firstEnd = log.findIndex((e, i) => i < second && e.dir === 's2c' && e.msg?.result?.stopReason === 'end_turn');
    expect(firstEnd).toBeGreaterThan(-1);

    // And one stopped (session/cancel).
    await send(page, 'lent');
    await expect(page.getByText('Je commence un long travail…').nth(1)).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect.poll(() => sent(app, 'session/cancel').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(page.getByText('Long travail fini.')).toHaveCount(1);
  });
});

test.describe('an agent on a model out of its Cursor plan', () => {
  test.use({ appEnv: { ESCOUADE_CURSOR: FAKE_CURSOR, FAKE_CURSOR_FREE: '1' } });

  test('ends its turn in error, saying to choose Auto', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCursorAgent(page);
    // Auto answers; then a model the plan does not offer.
    await send(page, 'bonjour');
    await expect(page.getByText('Cursor a reçu : bonjour')).toBeVisible();
    await page.getByRole('button', { name: /^Modèle/ }).click();
    await page
      .getByRole('menu', { name: 'Modèle' })
      .getByRole('menuitemradio', { name: /Composer 2\.5/ })
      .click();
    await send(page, 'bonjour encore');
    await expect(page.getByText(/n’est pas dans l’offre de ce compte Cursor/).first()).toBeVisible();
    await expect(page.getByText(/Choisis Auto/).first()).toBeVisible();
  });
});

// ESC-43: a second Cursor account is an API key, kept in the system keychain (the sandbox's entries, apart from the
// user's) and given to its agents by CURSOR_API_KEY, never on their command line nor in a file of Escouade's.
test.describe('a Cursor account added by its API key', () => {
  test.use({ appEnv: { ESCOUADE_CURSOR: FAKE_CURSOR } });

  test('is added by its name and key, links its usage to the dashboard, and its agents run as that key', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages' });
    await dialog.getByRole('tab', { name: 'Comptes' }).click();
    await dialog.getByRole('button', { name: 'Ajouter un compte Cursor CLI…' }).click();
    const modal = page.getByRole('dialog', { name: 'Ajouter un compte Cursor CLI' });
    // The machine's is there already: a new one, by its key.
    await expect(modal.getByRole('radio', { name: /Un nouveau compte/ })).toBeChecked();
    await modal.getByRole('textbox', { name: 'Nom' }).fill('Équipe');
    await modal.getByLabel('Clé d’API').fill('cle-essai-e2e-00000abcd');
    await modal.getByRole('button', { name: 'Ajouter le compte' }).click();
    const settings = page.getByRole('dialog', { name: 'Réglages' });
    const team = settings.getByRole('list', { name: 'Comptes Cursor CLI' }).getByRole('listitem', { name: 'Équipe' });
    await expect(team).toContainText('Connecté · clé …abcd');
    await expect(team.getByRole('button', { name: 'Changer la clé…' })).toBeVisible();
    await expect(team.getByRole('button', { name: 'Usage sur cursor.com' })).toBeVisible();
    // Nothing of it in the settings' file.
    expect(fs.readFileSync(path.join(app.data, 'settings.json'), 'utf8')).not.toContain('cle-essai');
    // The machine's account off: new Cursor agents go to the key's.
    const machine = settings.getByRole('list', { name: 'Comptes Cursor CLI' }).getByRole('listitem', { name: 'Principal' });
    await machine.getByRole('switch', { name: 'Actif' }).click();
    await expect(machine.getByRole('switch', { name: 'Actif' })).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    await newCursorAgent(page);
    await send(page, 'compte');
    await expect(page.getByText('Compte : clé …abcd')).toBeVisible();
    const launch = cursorLog(app).find((e) => e.launch)!.launch!;
    expect(launch.apiKey).toBe('cle-essai-e2e-00000abcd');
    expect(launch.argv.join(' ')).not.toContain('cle-essai');
  });
});

// ESC-43: what Cursor says in place of a turn, and a write refused, on the conversation.
test.describe('an agent on Cursor CLI at its limit', () => {
  test.use({ appEnv: { ESCOUADE_CURSOR: FAKE_CURSOR } });

  test('ends a turn stopped by the usage limit on a card that says it, and a write a hook refused fails', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCursorAgent(page);
    await send(page, 'limite');
    const card = page.locator('.card.error.limit');
    await expect(card).toContainText('Limite d’usage de ce compte Cursor atteinte');
    await expect(card).toContainText('cursor.com/dashboard');
    // A write refused (a hook of the user's, say): Cursor ends it with no diff, and the tool says so.
    await send(page, 'bloquée');
    await expect(page.getByText('Je n’ai pas pu écrire bloquee.txt.')).toBeVisible();
    const tool = page.locator('.tool.err', { hasText: 'bloquee.txt' });
    await tool.getByRole('button').first().click();
    await expect(tool).toContainText('Cursor n’a rien écrit');
  });
});
