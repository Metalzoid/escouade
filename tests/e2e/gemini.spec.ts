// Gemini CLI (ESC-274): agents on the fake `gemini --acp` (tests/fixtures/fake-gemini.mjs), which speaks ACP as Gemini CLI
// 0.66.0 does in the study (tests/fixtures/gemini/), and whose message picks what a turn does. What the app sent it is in
// its log (FAKE_GEMINI_LOG). ESCOUADE_E2E_SHOTS=<folder>: its screenshots, in both themes.

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_GEMINI, send, test, type App } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;

type Entry = {
  launch?: { argv: string[]; cwd: string; home: string | null; trust: boolean; policy: string | null; auth: string | null };
  dir?: 'in' | 'out';
  msg?: { method?: string; params?: Record<string, unknown> };
};

function geminiLog(app: App): Entry[] {
  const file = path.join(app.root, 'fake-gemini.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The launches of an agent's process: not those of its models read nor of a text written, each in a home of their own. */
function agentLaunches(app: App) {
  return geminiLog(app)
    .filter((e) => e.launch && !path.basename(e.launch.home ?? '').startsWith('escouade-gemini-'))
    .map((e) => e.launch!);
}

/** The methods the app asked the fake, in order. */
const asked = (app: App) => geminiLog(app).flatMap((e) => (e.dir === 'out' && e.msg?.method ? [e.msg] : []));

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

/** A new agent on Gemini CLI, from the menu beside « Nouvel agent ». */
async function newGeminiAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Gemini CLI' })).toBeVisible();
  await shots(page, 'harness-menu');
  await page.getByRole('menuitemradio', { name: 'Gemini CLI' }).click();
  await expect(page.locator('main.conv header.head')).toContainText('Gemini');
  await expect(page.getByRole('textbox', { name: 'Décris la tâche à confier à Gemini…' })).toBeVisible();
}

test.describe('an agent on Gemini CLI', () => {
  test.use({ appEnv: { ESCOUADE_GEMINI: FAKE_GEMINI } });

  test('converses over ACP, asks its permissions and questions from the window and the list, and resumes', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    // Réglages › Harness: found, with its version.
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const settings = page.getByRole('dialog', { name: 'Réglages' });
    await settings.getByRole('tab', { name: 'Harness' }).click();
    const gemini = settings.getByRole('region', { name: 'Gemini CLI' });
    await expect(gemini.locator('[data-state]')).toHaveText('0.66.0');
    await gemini.scrollIntoViewIfNeeded();
    await shots(page, 'harness');
    await page.keyboard.press('Escape');

    await newGeminiAgent(page);
    await send(page, 'bonjour Gemini');
    await expect(page.getByText('Gemini a reçu : bonjour Gemini')).toBeVisible();
    // Started as Escouade drives it: `--acp`, in a GEMINI_CLI_HOME of the agent's own (never the user's ~/.gemini), its
    // folder trusted, its settings written there; Escouade's server by its session, never on its command line.
    const launch = agentLaunches(app)[0];
    expect(launch.argv).toEqual(['--acp']);
    expect(launch.trust).toBe(true);
    const homes = path.join(app.data, 'agent-homes');
    expect(path.dirname(launch.home!).toLowerCase()).toBe(homes.toLowerCase());
    expect(path.resolve(launch.cwd).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());
    const settingsFile = JSON.parse(fs.readFileSync(path.join(launch.home!, '.gemini', 'settings.json'), 'utf8'));
    expect(settingsFile.general.enableAutoUpdate).toBe(false);
    expect(launch.argv.join(' ')).not.toContain('Bearer');

    // A command: its card; « Pour cet agent » is « Allow for this session », asked no more.
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('npm test');
    await shots(page, 'permission');
    await card.getByRole('button', { name: 'Pour cet agent' }).click();
    await expect(page.getByText('La commande a marché.')).toBeVisible();
    await send(page, 'commande encore');
    await expect(page.getByText('La commande a marché.')).toHaveCount(2);
    await expect(card).toHaveCount(0);

    // A write in its folder goes by Escouade's rules, its diff on its row.
    await send(page, 'fichier');
    await expect(page.getByText('J’ai modifié notes.txt.')).toBeVisible();
    await expect(page.locator('main.conv').getByText('notes.txt').first()).toBeVisible();
    expect(fs.readFileSync(path.join(app.repo, 'notes.txt'), 'utf8')).toContain('note de Gemini');

    // A question (its block, Gemini having no tool to ask in ACP): its card, answered from the list (Ctrl+J then 1).
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Quelle couleur préfères-tu ?');
    await expect(page.locator('main.conv')).not.toContainText('escouade_question');
    await shots(page, 'question');
    await page.waitForTimeout(600);
    await page.locator('body').evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+j');
    await page.keyboard.press('1');
    await expect(page.getByText('Tu as choisi rouge.')).toBeVisible();
    await shots(page, 'turn');

    // Restarted, the app resumes its session (`session/load`), its history not told again.
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'Gemini' }).first().click();
    await send(page2, 'tu te souviens ?');
    await expect(page2.getByText('Gemini a reçu : tu te souviens ?')).toBeVisible();
    expect(asked(app).some((m) => m.method === 'session/load')).toBe(true);
    await expect(page2.getByText('Gemini a reçu : bonjour Gemini')).toHaveCount(1);
  });

  test('its models are its session’s, its mode plan asks a plan to approve, and a turn stops', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newGeminiAgent(page);
    await send(page, 'bonjour');
    await expect(page.getByText('Gemini a reçu : bonjour')).toBeVisible();
    // The models of its session (`session/new`), set by `session/set_model`.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio', { name: /gemini-3\.8-flash/ })).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /gemini-2\.5-pro/ }).click();
    await send(page, 'modèle');
    await expect(page.getByText('Je tourne sur gemini-2.5-pro, mode default.')).toBeVisible();

    // « Plan »: its mode plan, its plan read from the file it wrote, approved on its card, then carried out.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click();
    await send(page, 'propose un plan');
    const plan = page.getByRole('group', { name: 'Gemini propose un plan' });
    await expect(plan).toContainText('Écrire son test.');
    await shots(page, 'plan');
    await plan.getByRole('button', { name: 'Approuver le plan' }).click();
    await expect(page.getByText('Plan approuvé, je le mets en œuvre.')).toBeVisible();
    expect(asked(app).some((m) => m.method === 'session/set_mode' && m.params?.modeId === 'plan')).toBe(true);
    await expect(page.locator('main.conv')).not.toContainText('MODE_UPDATE');

    // A turn stopped (`session/cancel`), the next message goes.
    await send(page, 'lent');
    await expect(page.getByText('Je commence un long travail…')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    expect(asked(app).some((m) => m.method === 'session/cancel')).toBe(true);
    await page.waitForTimeout(4500);
    await expect(page.getByText('Long travail fini.')).toHaveCount(0);
    await send(page, 'encore');
    await expect(page.getByText('Gemini a reçu : encore')).toBeVisible();
  });
});
