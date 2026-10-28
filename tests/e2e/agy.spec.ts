// Antigravity CLI (ESC-270): agents on the fake `agy` (tests/fixtures/fake-agy.mjs), which speaks stream-json as `agy`
// 1.4.9 does in `-p`, and whose message picks what a turn does. What the app sent it is in its log (FAKE_AGY_LOG).
// ESCOUADE_E2E_SHOTS=<folder>: its screenshots, in both themes.

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_AGY, send, test, type App } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;

type Entry = {
  launch?: { argv: string[]; cwd: string; home: string; geminiKey: string | null };
  user?: string;
};

function agyLog(app: App): Entry[] {
  const file = path.join(app.root, 'fake-agy.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The launches of an agent's program: not `agy models` nor a text written, each in a home of their own. */
function agentLaunches(app: App) {
  return agyLog(app)
    .filter((e) => e.launch && e.launch.argv[0] === '-p=' && !path.basename(e.launch.home).startsWith('escouade-agy-'))
    .map((e) => e.launch!);
}

/** The messages the app sent the fake, in order. */
const said = (app: App) => agyLog(app).flatMap((e) => (e.user === undefined ? [] : [e.user]));

/** The theme of the app, set as « Thème » would. */
const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }, t);

async function shots(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const t of ['dark', 'light'] as const) {
    await theme(page, t);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${t}.png`) });
  }
  await theme(page, 'dark');
}

/** A new agent on Antigravity CLI, from the menu beside « Nouvel agent ». */
async function newAgyAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitemradio', { name: 'Antigravity CLI' }).click();
  await expect(page.locator('main.conv header.head')).toContainText('Antigravity');
  await expect(page.getByRole('textbox', { name: 'Décris la tâche à confier à Antigravity…' })).toBeVisible();
}

test.describe('an agent on Antigravity CLI', () => {
  test.use({ appEnv: { ESCOUADE_AGY: FAKE_AGY } });

  test('converses, asks its permissions once its turn is over, from the window and the list, with a write’s diff, and resumes', async ({
    app,
  }) => {
    const { page } = app;
    await addProject(page, app.repo);
    // Réglages › Harness: found, with its version.
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const settings = page.getByRole('dialog', { name: 'Réglages' });
    await settings.getByRole('tab', { name: 'Harness' }).click();
    const agy = settings.getByRole('region', { name: 'Antigravity CLI' });
    await expect(agy.locator('[data-state]')).toHaveText('1.4.9');
    await agy.scrollIntoViewIfNeeded();
    await shots(page, 'harness');
    await page.keyboard.press('Escape');

    await newAgyAgent(page);
    await send(page, 'bonjour Antigravity');
    await expect(page.getByText('Antigravity a reçu : bonjour Antigravity')).toBeVisible();
    // Started as Escouade drives it: `-p=` in stream-json, in a home of the agent's own (never the user's ~/.gemini),
    // without the machine's Gemini key; Escouade's server in its own MCP config, never on its command line.
    const launch = agentLaunches(app)[0];
    expect(launch.argv.slice(0, 5)).toEqual(['-p=', '--input-format', 'stream-json', '--output-format', 'stream-json']);
    expect(launch.geminiKey).toBeNull();
    const homes = path.join(app.data, 'agent-homes');
    expect(path.dirname(launch.home).toLowerCase()).toBe(homes.toLowerCase());
    expect(path.resolve(launch.cwd).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());
    expect(launch.argv.join(' ')).not.toContain('Bearer');
    // Its MCP config is its own folder's (the server's entry there when the agents may drive Escouade).
    expect(fs.existsSync(path.join(launch.home, '.gemini', 'config', 'mcp_config.json'))).toBe(true);

    // A command: refused by `agy`, asked once the turn is over; « Pour cet agent » keeps the rule in its own settings, and
    // the turn goes on with it.
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('npm test');
    await shots(page, 'permission');
    await card.getByRole('button', { name: 'Pour cet agent' }).click();
    await expect(page.getByText('Fait.')).toBeVisible();
    expect(said(app).at(-1)).toContain('The user allowed the command `npm test`');
    const rules = fs.readFileSync(path.join(launch.home, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8');
    expect(rules).toContain('command(npm test)');
    await send(page, 'commande encore');
    await expect(page.getByText('Tests passés.')).toBeVisible();
    await expect(card).toHaveCount(0);

    // A write in its folder goes by its rules, its diff on its row; one beside it asks, with its diff, answered from the
    // list (Ctrl+J then 1).
    await send(page, 'fichier');
    await expect(page.getByText('Fichier écrit.')).toBeVisible();
    await expect(page.locator('main.conv').getByText('notes.txt').first()).toBeVisible();
    await send(page, 'fichier dehors');
    await expect(card).toContainText('Hors du dossier de l’agent');
    await expect(card.locator('.patch, .patch-view, pre').first()).toContainText('bonjour');
    await shots(page, 'write-outside');
    await page.waitForTimeout(600);
    await page.locator('body').evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+j');
    await page.keyboard.press('1');
    await expect(page.getByText('Fait.')).toHaveCount(2);
    expect(fs.existsSync(path.join(path.dirname(app.repo), 'dehors.txt'))).toBe(true);

    // A question `agy` skipped: its card, the answer sent as the turn goes on.
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Bleu ou rouge ?');
    await shots(page, 'question');
    await question.getByRole('button', { name: 'Rouge' }).click();
    await expect(page.getByText('Réponse reçue : Rouge')).toBeVisible();
    await shots(page, 'turn');

    // Restarted, the app resumes its conversation (`--conversation`).
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'Antigravity' }).first().click();
    await send(page2, 'tu te souviens ?');
    // It remembers its last message: the answers Escouade sent it.
    await expect(page2.getByText(/^Tu as dit : The user answered your questions/)).toBeVisible();
    const last = agentLaunches(app).at(-1)!;
    expect(last.argv.join(' ')).toMatch(/--conversation [0-9a-f-]{36}/);
  });

  test('its models and efforts are its account’s, its mode Plan asks a plan to approve, and a turn stops', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newAgyAgent(page);
    await send(page, 'bonjour');
    await expect(page.getByText('Antigravity a reçu : bonjour')).toBeVisible();
    // The models of `agy models`, Gemini's efforts apart; a model changed starts its program again on the conversation.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio', { name: /Gemini 3\.8 Flash/ })).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /Claude Sonnet 4\.6/ }).click();
    await send(page, 'modèle');
    await expect(page.getByText(/^Modèle : claude-sonnet-4-6, effort : aucun, mode : default$/)).toBeVisible();

    // « Plan »: its mode `plan`, its plan written in its conversation's files, approved on its card, then carried out.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click();
    await send(page, 'propose un plan');
    const plan = page.getByRole('group', { name: 'Antigravity propose un plan' });
    await expect(plan).toContainText('Écrire notes.txt');
    await shots(page, 'plan');
    await plan.getByRole('button', { name: 'Approuver le plan' }).click();
    await expect(page.getByText('Plan mis en œuvre.')).toBeVisible();
    expect(agentLaunches(app).some((l) => l.argv.includes('plan'))).toBe(true);
    expect(agentLaunches(app).at(-1)!.argv).not.toContain('plan');

    // A turn stopped: its program killed, the next message resumes the conversation.
    await send(page, 'lent');
    await expect(page.getByText('Je commence un long travail…')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await page.waitForTimeout(6500);
    await expect(page.getByText('Fini.')).toHaveCount(0);
    await send(page, 'encore');
    await expect(page.getByText('Antigravity a reçu : encore')).toBeVisible();
  });
});
