// OpenCode (ESC-44): agents on the fake `opencode serve` (tests/fixtures/fake-opencode.mjs), which plays OpenCode
// 1.19.3's HTTP API and its event stream, and whose message picks what a turn does. What the app asked of it is in its
// log (FAKE_OPENCODE_LOG).

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_OPENCODE, send, test, type App } from './fixture';

type Entry = {
  launch?: { argv: string[]; config: any; password: boolean };
  attach?: { argv: string[]; password: boolean; passwordInArgv: boolean };
  /** A line the fake `opencode attach` shows. */
  shown?: string;
  req?: { method: string; path: string; directory: string | null; body: any };
};

/** What the fake opencode was asked, launch by launch. */
function opencodeLog(app: App): Entry[] {
  const file = path.join(app.root, 'fake-opencode.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const requests = (app: App, method: string, re: RegExp) =>
  opencodeLog(app)
    .map((e) => e.req)
    .filter((r): r is NonNullable<Entry['req']> => !!r && r.method === method && re.test(r.path));

/** A new agent on OpenCode, from the menu beside « Nouvel agent ». */
async function newOpencodeAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitem', { name: 'Nouvel agent sur OpenCode' }).click();
  // Shown before anything is typed: a message typed sooner would go to the agent shown before it.
  await expect(page.locator('main.conv header.head')).toContainText('OpenCode');
  await expect(page.getByRole('textbox', { name: 'Décris la tâche à confier à OpenCode…' })).toBeVisible();
}

test.describe('an agent on OpenCode', () => {
  test.use({ appEnv: { ESCOUADE_OPENCODE: FAKE_OPENCODE, FAKE_OPENCODE_STEP_MS: '1500', FAKE_OPENCODE_SUB_MS: '5000' } });

  test('converses, asks its permissions and its questions, fills the plan, holds a message for after its turn', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newOpencodeAgent(page);
    await send(page, 'bonjour OpenCode');
    await expect(page.getByText('Bonjour, tu as dit : bonjour OpenCode')).toBeVisible();
    // Started as Escouade drives OpenCode: `serve` behind a password, its model given, Escouade's server kept out; a
    // session in the agent's folder, with the rules of its mode.
    const launch = opencodeLog(app).find((e) => e.launch)!.launch!;
    expect(launch.argv).toEqual(['serve', '--hostname', '127.0.0.1', '--port', '0']);
    expect(launch.password).toBe(true);
    expect(launch.config.mcp.escouade.enabled).toBe(false);
    const session = requests(app, 'POST', /^\/session$/)[0]!;
    expect(path.resolve(session.directory!).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());
    expect(session.body.permission.some((r: any) => r.permission === 'bash' && r.action === 'ask')).toBe(true);
    const prompt = requests(app, 'POST', /prompt_async$/)[0]!.body;
    expect(prompt.model).toEqual({ providerID: 'ollama', modelID: 'qwen3-coder:30b-32k' });
    expect(prompt.agent).toBe('build');

    // The modes say that OpenCode has no sandbox.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await expect(page.getByText(/pas de bac à sable/).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // A command its rules ask for: « Toujours autoriser » says the pattern it keeps; allowed, it runs.
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('rm -rf build');
    await expect(card).toContainText('« Toujours autoriser » retiendra : rm *');
    await expect(card.getByRole('button', { name: 'Toujours autoriser' })).toBeVisible();
    await card.getByRole('button', { name: 'Autoriser', exact: true }).click();
    await expect(page.getByText('La commande est passée.')).toBeVisible();
    await expect.poll(() => requests(app, 'POST', /^\/permission\/.+\/reply$/).map((r) => r.body.reply)).toEqual(['once']);

    // A question: its card, answered.
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Quel langage préfères-tu ?');
    await question.getByRole('button', { name: /Rust/ }).click();
    await expect(page.getByText('Tu as choisi : Rust')).toBeVisible();
    expect(requests(app, 'POST', /^\/question\/.+\/reply$/)[0]!.body).toEqual({ answers: [['Rust']] });

    // The « Plan » banner: the task list of todo.updated (its steps slowed down), then a subagent and its tools. A message
    // sent during the turn waits for its end, then goes as a turn of its own.
    const plan = page.locator('main.conv .plan');
    const before = requests(app, 'POST', /prompt_async$/).length;
    await send(page, 'étapes');
    // Folded in a window under its height (the 1024 × 768 screen of the Windows runner): unfolded to read its tasks.
    await expect(plan).toContainText('/3 tâches');
    const fold = plan.locator('button.fold');
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
    await expect(plan).toContainText('Lire le code');
    await send(page, 'et ensuite');
    // Held by Escouade while the turn runs (OpenCode would take it into the turn, the first request lost).
    expect(requests(app, 'POST', /prompt_async$/).length).toBe(before + 1);
    await expect(page.getByText('Les trois étapes sont faites.')).toBeVisible();
    await expect(page.getByText('Bonjour, tu as dit : et ensuite')).toBeVisible();
    await expect.poll(() => requests(app, 'POST', /prompt_async$/).length).toBe(before + 2);
    await expect(plan).toContainText('3/3');
    // The subagent, while it runs: its row, and its tool under its Task.
    await send(page, 'sous-agent');
    await expect(plan).toContainText('1 sous-agent actif');
    await expect(page.getByText('Le sous-agent a fini.')).toBeVisible();
    await expect(page.locator('.tool', { hasText: 'Explorer le dépôt' }).first()).toBeVisible();

    // Restarted, the app resumes its session.
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'OpenCode' }).first().click();
    await send(page2, 'encore là ?');
    await expect(page2.getByText('Bonjour, tu as dit : encore là ?')).toBeVisible();
    expect(requests(app, 'POST', /^\/session$/).length).toBe(1);
  });

  test('its models are searched, marked as favorites, and the variant of one is its effort', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newOpencodeAgent(page);
    await send(page, 'bonjour');
    await expect(page.getByText('Bonjour, tu as dit : bonjour')).toBeVisible();
    // The models of the connected providers, with a search.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
    await menu.getByRole('searchbox', { name: 'Rechercher' }).fill('studio');
    await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
    await expect(menu.getByRole('menuitemradio', { name: /Devstral Small/ })).toContainText('LM Studio (local)');
    // Marked as a favorite: first in the menu, kept.
    await menu.getByRole('button', { name: /Ajouter aux favoris : Devstral Small/ }).click();
    await menu.getByRole('searchbox', { name: 'Rechercher' }).fill('');
    await expect(menu.getByRole('menuitemradio').first()).toContainText('Devstral Small');
    // gpt-oss has its variants: the effort's menu offers them, and the prompt sends the one chosen.
    await menu.getByRole('menuitemradio', { name: /gpt-oss/ }).click();
    await page.getByRole('button', { name: /^Effort/ }).click();
    await page.getByRole('menuitemradio', { name: /Élevé|High/ }).click();
    await send(page, 'salut');
    await expect(page.getByText('Bonjour, tu as dit : salut (variante high)')).toBeVisible();
    const prompt = requests(app, 'POST', /prompt_async$/).at(-1)!.body;
    expect(prompt.model).toEqual({ providerID: 'ollama', modelID: 'gpt-oss:20b-32k' });
    // The settings list them too, searched, the favorite marked.
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages' });
    await dialog.getByRole('tab', { name: 'Harness' }).click();
    const favorites = dialog.getByTestId('model-favorites-opencode');
    await expect(favorites.getByRole('button', { name: /Retirer des favoris : Devstral Small/ })).toBeVisible();
    await favorites.getByRole('searchbox', { name: 'Rechercher un modèle' }).fill('qwen');
    await expect(favorites.locator('li')).toHaveCount(1);
  });
});

test.describe('« Vue OpenCode » (ESC-46)', () => {
  test.use({ appEnv: { ESCOUADE_OPENCODE: FAKE_OPENCODE } });

  /** What the fake `opencode attach` showed. */
  const shown = (app: App) => opencodeLog(app).flatMap((e) => (e.shown ? [e.shown] : []));

  test('joins the agent’s session beside Escouade: what is done in the interface, a permission answered there among it, is in the conversation', async ({
    app,
  }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newOpencodeAgent(page);
    await send(page, 'bonjour OpenCode');
    await expect(page.getByText('Bonjour, tu as dit : bonjour OpenCode')).toBeVisible();

    await page.getByRole('button', { name: 'Vue OpenCode' }).click();
    const view = page.locator('main .tui');
    await expect(view.locator('.xterm')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => shown(app).some((l) => l.startsWith('fake opencode attach: ')), { timeout: 20_000 }).toBe(true);
    // On the agent's server and session, in its folder; its password in its environment, never among its arguments.
    const attach = opencodeLog(app).find((e) => e.attach)!.attach!;
    expect(requests(app, 'POST', /^\/session$/)).toHaveLength(1);
    expect(attach.argv[0]).toBe('attach');
    expect(attach.argv[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(attach.argv[2]).toBe('--session');
    expect(attach.argv[3]).toMatch(/^ses_/);
    expect(attach.argv[4]).toBe('--dir');
    expect(path.resolve(attach.argv[5]).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());
    expect(attach.password).toBe(true);
    expect(attach.passwordInArgv).toBe(false);

    // A message typed in the interface: its permission, shown there and answered there (Entrée, « Allow once »).
    await view.locator('.xterm').click();
    await page.keyboard.type('commande');
    await page.keyboard.press('Enter');
    await expect.poll(() => shown(app), { timeout: 20_000 }).toContain('permission bash: rm -rf build (Enter: allow once)');
    // Escouade sees it waiting on the agent’s card (« Question »: it waits for an answer).
    await expect.poll(() => page.locator('.card').allTextContents()).toContainEqual(expect.stringMatching(/OpenCode.*Question/s));
    await page.keyboard.press('Enter');
    await expect.poll(() => shown(app), { timeout: 20_000 }).toContain('text: La commande est passée.');

    // Back in Escouade's view: the turn is in the conversation, its permission answered; the same server went on.
    await page.getByRole('button', { name: 'Vue Escouade' }).click();
    await expect(page.getByText('La commande est passée.')).toBeVisible();
    // The message typed in the interface too, once, as the user's.
    await expect(page.locator('main.conv .bubble', { hasText: /^\s*commande\s*$/ })).toHaveCount(1);
    await expect(page.getByTestId('permission-pending')).toHaveCount(0);
    await send(page, 'encore');
    await expect(page.getByText('Bonjour, tu as dit : encore')).toBeVisible();
    expect(opencodeLog(app).filter((e) => e.launch)).toHaveLength(1);
  });
});

test.describe('OpenCode 2', () => {
  test.use({ appEnv: { ESCOUADE_OPENCODE: FAKE_OPENCODE, FAKE_OPENCODE_VERSION: 'opencode v2.0.32' } });

  test('is recognized and said unsupported, in the settings and when an agent starts', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newOpencodeAgent(page);
    await send(page, 'bonjour');
    const refusal = /OpenCode 2\.0\.32 est la ligne 2 d’OpenCode, que Escouade ne prend pas en charge/;
    await expect(page.getByText(refusal).first()).toBeVisible();
    expect(opencodeLog(app).filter((e) => e.launch)).toEqual([]);
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages' });
    await dialog.getByRole('tab', { name: 'Harness' }).click();
    const group = dialog.locator('section[data-engine="opencode"]');
    await expect(group.locator('[data-engine-state]')).toHaveText('Non pris en charge');
    await expect(group.getByText(refusal)).toBeVisible();
  });
});
