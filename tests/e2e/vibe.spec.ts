// Mistral Vibe (ESC-266): agents on the fake `vibe-acp` (tests/fixtures/fake-vibe.mjs), which speaks ACP v1 as Mistral
// Vibe 3.0.3 does, and whose message picks what a turn does. What the app sent it is in its log (FAKE_VIBE_LOG).
// ESCOUADE_E2E_SHOTS=<folder>: its screenshots, in both themes.

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_VIBE, send, test, type App } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;

type Entry = {
  launch?: { argv: string[]; cwd: string; home: string | null; apiKey: string | null; telemetry: string | null };
  dir?: string;
  msg?: any;
};

function vibeLog(app: App): Entry[] {
  const file = path.join(app.root, 'fake-vibe.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The launch of an agent's process: not a `vibe-acp` that read its account's models, in a VIBE_HOME of its own. */
function agentLaunch(app: App) {
  return vibeLog(app).find((e) => e.launch && !path.basename(e.launch.home ?? '').startsWith('escouade-vibe-'))!.launch!;
}

/** The parameters of each request `method` the app sent, in order. */
const sent = (app: App, method: string) =>
  vibeLog(app)
    .filter((e) => e.dir === 'out' && e.msg?.method === method)
    .map((e) => e.msg.params);

/** The answers the app gave to the requests of the fake (permissions, questions). */
const replies = (app: App) =>
  vibeLog(app)
    .filter((e) => e.dir === 'out' && e.msg && e.msg.method === undefined)
    .map((e) => e.msg.result);

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

/** A new agent on Mistral Vibe, from the menu beside « Nouvel agent ». */
async function newVibeAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitemradio', { name: 'Mistral Vibe' }).click();
  await expect(page.locator('main.conv header.head')).toContainText('Mistral');
  await expect(page.getByRole('textbox', { name: 'Décris la tâche à confier à Vibe…' })).toBeVisible();
}

test.describe('an agent on Mistral Vibe', () => {
  test.use({ appEnv: { ESCOUADE_VIBE: FAKE_VIBE } });

  test('converses, asks its permissions with a write’s diff, from the window and the list, and ends its turns', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    // Réglages › Harness: found, with its version.
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const settings = page.getByRole('dialog', { name: 'Réglages' });
    await settings.getByRole('tab', { name: 'Harness' }).click();
    const vibe = settings.getByRole('region', { name: 'Mistral Vibe' });
    await expect(vibe.locator('[data-state]')).toHaveText('3.0.3');
    await vibe.scrollIntoViewIfNeeded();
    await shots(page, 'harness');
    await page.keyboard.press('Escape');

    await newVibeAgent(page);
    await send(page, 'bonjour Vibe');
    await expect(page.getByText('Vibe a reçu : bonjour Vibe')).toBeVisible();
    // Started as Escouade drives Vibe: `vibe-acp` without arguments, in a VIBE_HOME of the agent's own, its telemetry off,
    // asking for its questions; Escouade's server by its session, never its command line.
    const launch = agentLaunch(app);
    expect(launch.argv).toEqual([]);
    expect(launch.telemetry).toBe('false');
    const homes = path.join(app.data, 'agent-homes');
    expect(path.dirname(launch.home!).toLowerCase()).toBe(homes.toLowerCase());
    expect(sent(app, 'initialize').some((p) => p.clientCapabilities?.elicitation?.form)).toBe(true);
    const opened = sent(app, 'session/new').at(-1);
    expect(path.resolve(opened.cwd).toLowerCase()).toBe(path.resolve(app.repo).toLowerCase());
    // Its folder trusted in its own VIBE_HOME.
    expect(fs.readFileSync(path.join(launch.home!, 'trusted_folders.toml'), 'utf8')).toContain('trusted = [');

    // A command: its permission names its call alone, the card has its command; « Pour cet agent » keeps the rule in its
    // VIBE_HOME (Vibe's « Always allow »).
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('npm test');
    await shots(page, 'permission');
    await card.getByRole('button', { name: 'Pour cet agent' }).click();
    await expect(page.getByText('La commande a marché.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_always_permanent' } });
    expect(fs.readFileSync(path.join(launch.home!, 'config.toml'), 'utf8')).toContain('"npm"');
    await send(page, 'commande encore');
    await expect(page.getByText('La commande a marché.')).toHaveCount(2);
    await expect(card).toHaveCount(0);

    // A write in its folder goes by Escouade's rules, without a card, its diff on its row; one beside it asks, with its
    // diff, answered from the list (Ctrl+J then 1).
    await send(page, 'fichier');
    await expect(page.getByText('J’ai modifié notes.txt.')).toBeVisible();
    await send(page, 'fichier dehors');
    await expect(card).toContainText('Hors du dossier de l’agent');
    await expect(card.locator('.patch, .patch-view, pre').first()).toContainText('note de Vibe');
    await shots(page, 'write-outside');
    await page.waitForTimeout(600);
    await page.locator('body').evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+j');
    await page.keyboard.press('1');
    await expect(page.getByText('J’ai modifié vibe-dehors.txt.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } });

    // A question (elicitation/create): its card, answered by its choice's value.
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Quelle couleur préfères-tu ?');
    await shots(page, 'question');
    await question.getByRole('button', { name: 'bleu' }).click();
    await expect(page.getByText('Tu as choisi bleu.')).toBeVisible();
    expect(replies(app).at(-1)).toEqual({ action: 'accept', content: { q0: 'bleu' } });

    // Its tasks and its subagent in the « Plan » banner.
    await send(page, 'sous-agent');
    await expect(page.getByText('Tâches faites, le sous-agent a résumé le README.')).toBeVisible();
    const banner = page.locator('main.conv .plan:has(> .inner)');
    await expect(banner).toContainText('2/2');
    await shots(page, 'turn');

    // Restarted, the app resumes its session (session/load).
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'Mistral' }).first().click();
    await send(page2, 'encore là ?');
    await expect(page2.getByText('Vibe a reçu : encore là ?')).toBeVisible();
    expect(sent(app, 'session/load').length).toBe(1);
    await expect(page2.getByText('Vibe a reçu : bonjour Vibe')).toHaveCount(1);
  });

  test('its models and thinking are its session’s, its mode Plan asks a plan to approve, and a turn stops', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newVibeAgent(page);
    await send(page, 'bonjour');
    await expect(page.getByText('Vibe a reçu : bonjour')).toBeVisible();
    // The models of its session (configOptions), and its thinking as the effort.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio', { name: /Mistral Medium 3\.5/ })).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /Devstral 2/ }).click();
    await expect.poll(() => sent(app, 'session/set_config_option').map((p) => `${p.configId}=${p.value}`)).toContain('model=devstral-2');
    await send(page, 'modèle');
    await expect(page.getByText(/^Je tourne sur devstral-2, réflexion high, agent ask\.$/)).toBeVisible();

    // « Plan »: Vibe stays in its agent `ask`, its last words a plan to approve; approved, carried out in the same turn.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await expect(page.getByText(/Vibe n’a pas de mode Plan/).first()).toBeVisible();
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click();
    await send(page, 'propose un plan');
    const plan = page.getByRole('group', { name: 'Vibe propose un plan' });
    await expect(plan).toContainText('Ajouter sub');
    await shots(page, 'plan');
    await plan.getByRole('button', { name: 'Approuver le plan' }).click();
    await expect(page.getByText('Plan approuvé, je le mets en œuvre.')).toBeVisible();
    await expect.poll(() => sent(app, 'session/set_mode').at(-1)?.modeId).toBe('ask');

    // A turn stopped (session/cancel).
    await send(page, 'lent');
    await expect(page.getByText('Je commence un long travail…')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect.poll(() => sent(app, 'session/cancel').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
    await expect(page.getByText('Long travail fini.')).toHaveCount(0);
  });
});
