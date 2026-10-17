// Codex (ESC-37): agents on the fake `codex app-server` (tests/fixtures/fake-codex.mjs), which plays Codex 0.163.0's
// JSON-RPC protocol and whose message picks what a turn does. What the app sent it is in its log (FAKE_CODEX_LOG).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { addProject, expect, FAKE_CODEX, send, test, type App } from './fixture';

/** What the fake codex was sent, launch by launch: its arguments, then the messages of the app. */
function codexLog(
  app: App,
): { launch?: { argv: string[]; codexHome: string | null }; in?: { method?: string; params?: any; result?: any } }[] {
  const file = path.join(app.root, 'fake-codex.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The requests of `method` the app sent Codex. */
const requests = (app: App, method: string) =>
  codexLog(app)
    .map((e) => e.in)
    .filter((m) => m?.method === method);

/** A new agent on Codex, from the menu beside « Nouvel agent ». */
async function newCodexAgent(page: Page) {
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitem', { name: 'Nouvel agent sur Codex' }).click();
}

test.describe('an agent on Codex', () => {
  test.use({ appEnv: { ESCOUADE_CODEX: FAKE_CODEX } });

  test('answers live, runs a command once allowed, changes a file with its diff, plans, steers, resumes and is copied', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCodexAgent(page);
    // Its brand, since agents run on two harnesses now.
    await expect(page.locator('main.conv header.head')).toContainText('Codex');
    await send(page, 'bonjour Codex');
    await expect(page.getByText('Bonjour, tu as dit : bonjour Codex')).toBeVisible();
    // Started as Escouade drives Codex: its app-server, the plan tool given to the model, a thread in the agent's folder.
    const launch = codexLog(app).find((e) => e.launch)!.launch!;
    expect(launch.argv.slice(0, 3)).toEqual(['app-server', '-c', 'tools.update_plan.enabled=true']);
    expect(requests(app, 'initialize')[0]?.params.capabilities.experimentalApi).toBe(true);
    const start = requests(app, 'turn/start')[0]!.params;
    expect(start.approvalPolicy).toBe('on-request');
    expect(start.sandboxPolicy.type).toBe('workspaceWrite');
    expect(start.collaborationMode.mode).toBe('default');

    // The models and their efforts are those model/list gave.
    await page.getByRole('button', { name: /^Modèle/ }).click();
    await expect(
      page.getByRole('menuitemradio', { name: /GPT-5\.6-Terra/ }).or(page.getByRole('option', { name: /GPT-5\.6-Terra/ })),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    // The modes say what they mean in Codex, sandbox included.
    await page.getByRole('button', { name: /^Mode/ }).click();
    await expect(page.getByText(/bac à sable en lecture seule/).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // A command, run once allowed: its card says why Codex asks, and offers « Pour cette session ».
    await send(page, 'commande');
    const card = page.getByTestId('permission-pending');
    await expect(card).toContainText('rm -rf build');
    await expect(card).toContainText('Autorisez-vous la suppression du dossier build ?');
    await expect(card.getByRole('button', { name: 'Pour cette session' })).toBeVisible();
    await card.getByRole('button', { name: 'Autoriser' }).click();
    await expect(page.getByText('Commande exécutée.')).toBeVisible();
    await expect.poll(() => codexLog(app).some((e) => e.in?.result?.decision === 'accept')).toBe(true);

    // A file changed, its diff in the conversation, as Claude Code's Edit.
    await send(page, 'fichier');
    await expect(page.getByText('Fichier modifié.')).toBeVisible();
    const edit = page.locator('.tool', { hasText: 'app.ts' }).last();
    await expect(edit).toContainText('+1');
    await expect(edit).toContainText('−1');
    expect(fs.readFileSync(path.join(app.repo, 'src', 'app.ts'), 'utf8')).toBe('const a = 2;\n');

    // The « Plan » banner: the steps of the plan tool, then a subagent.
    await send(page, 'étapes');
    await expect(page.getByText('Les trois étapes sont faites.')).toBeVisible();
    const plan = page.locator('main.conv .plan');
    await expect(plan).toContainText('3/3');
    await send(page, 'sous-agent');
    await expect(page.getByText('Rapport reçu : le filtre refuse les PDF.')).toBeVisible();
    await expect(page.getByText('cause du bug').first()).toBeVisible();

    // A message sent while a turn runs goes into it (turn/steer).
    await send(page, 'lent');
    await expect(page.getByText('Je commence…')).toBeVisible();
    await send(page, 'ajoute aussi un test');
    await expect(page.getByText("J'ai bien reçu en cours de route : ajoute aussi un test")).toBeVisible();
    expect(requests(app, 'turn/steer').length).toBe(1);
    // And one interrupted.
    await send(page, 'lent');
    await expect(page.getByText('Je commence…').nth(1)).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect.poll(() => requests(app, 'turn/interrupt').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);

    // Restarted, the app resumes its thread.
    const page2 = await app.restart();
    await page2.locator('.card', { hasText: 'Codex' }).first().click();
    await send(page2, 'encore là ?');
    await expect(page2.getByText('Bonjour, tu as dit : encore là ?')).toBeVisible();
    const thread = requests(app, 'thread/start')[0]!;
    expect(requests(app, 'thread/resume').length).toBeGreaterThanOrEqual(1);
    // Copied: a thread of its own, forked from the original at its last turn.
    await page2.locator('.card', { hasText: 'Codex' }).first().click({ button: 'right' });
    await page2.getByRole('menuitem', { name: 'Dupliquer la conversation' }).click();
    await send(page2, 'et la copie ?');
    await expect(page2.getByText('Bonjour, tu as dit : et la copie ?')).toBeVisible();
    const fork = requests(app, 'thread/fork')[0]!;
    expect(fork.params.threadId).toMatch(/^thr-/);
    expect(fork.params.lastTurnId).toMatch(/^turn-/);
    expect(thread).toBeTruthy();
  });

  test('a question of the mode Plan is answered on its card, and the plan approved starts its work', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCodexAgent(page);
    await send(page, 'question');
    const question = page.getByTestId('question-pending');
    await expect(question).toContainText('Quelle base de données ?');
    await question.getByRole('button', { name: 'SQLite' }).click();
    await expect(page.getByText('Choix retenu : SQLite')).toBeVisible();
    await send(page, 'propose un plan');
    const plan = page.getByTestId('permission-pending');
    await expect(plan).toContainText('Codex propose un plan');
    await expect(plan).toContainText('Script de la date');
    await plan.getByRole('button', { name: 'Approuver le plan' }).click();
    await expect(page.getByText('Plan mis en œuvre.')).toBeVisible();
    // Its work in the mode left for it, « Demander ».
    const last = requests(app, 'turn/start').at(-1)!.params;
    expect(last.collaborationMode.mode).toBe('default');
    expect(last.input[0].text).toBe('Mets le plan en œuvre.');
  });
});

test.describe('a ticket on Codex', () => {
  test.use({ appEnv: { ESCOUADE_CODEX: FAKE_CODEX } });

  test('is launched on Codex by the autopilot, and its agent reports until it is ready to test', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo, { firstAgent: false });
    await page.getByRole('button', { name: /^Kanban/ }).click();
    await page.getByRole('button', { name: 'Nouveau ticket' }).click();
    await page.getByRole('textbox', { name: 'Titre du ticket' }).fill('Ajouter le fichier [ok]');
    await page.getByRole('group', { name: 'Harness' }).getByRole('button').click();
    await page.getByRole('menuitem', { name: 'Codex', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const review = page.getByRole('region', { name: 'À tester' });
    await expect(review.getByText('DEM-1', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(review.getByText('2/2 critères')).toBeVisible();
    // Its protocol went to Codex as the instructions of its thread.
    const start = requests(app, 'thread/start')[0]!.params;
    expect(start.developerInstructions).toContain('DEM-1');
    expect(start.cwd).toContain('demo-api');
    const worktree = start.cwd as string;
    expect(fs.readFileSync(path.join(worktree, 'dem-1.txt'), 'utf8')).toMatch(/^Boucle \d+\n$/);
  });
});

// The voice conversation (ESC-97) whatever the harness: the passage to be read aloud is taken out of the agent's text by
// the common part of the conversation, for Codex as for Claude Code (see conversation.spec.ts for the WAV and the fakes).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUESTION = path.join(ROOT, 'src-tauri', 'src', 'voice', 'testdata', 'question-fr.wav');
const SAID = 'Ajoute un test pour la page des réglages, puis lance la suite.';
const SPOKEN_LOG = path.join(os.tmpdir(), `escouade-e2e-codex-spoken-${process.pid}.txt`);
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'voice', 'speech', 'voices.json'), 'utf8')) as {
  id: string;
  onnxSize: number;
  jsonSize: number;
}[];

/** A file of `size` bytes that holds nothing (the fake transcriber and voice read nothing of it). */
function sparse(file: string, size: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  fs.ftruncateSync(fd, size);
  fs.closeSync(fd);
}

test.describe('a voice conversation with an agent on Codex', () => {
  test.use({
    appEnv: { ESCOUADE_CODEX: FAKE_CODEX, ESCOUADE_VOICE_WAV: QUESTION, ESCOUADE_VOICE_TRANSCRIPT: SAID, ESCOUADE_SPEECH_FAKE: SPOKEN_LOG },
    preStart: {
      run: (root: string) => {
        sparse(path.join(root, 'data', 'voice', 'models', 'ggml-base.bin'), 147_951_465);
        const v = VOICES.find((x) => x.id === 'fr_FR-siwis-medium')!;
        sparse(path.join(root, 'data', 'voice', 'voices', `${v.id}.onnx`), v.onnxSize);
        sparse(path.join(root, 'data', 'voice', 'voices', `${v.id}.onnx.json`), v.jsonSize);
        fs.rmSync(SPOKEN_LOG, { force: true });
      },
    },
  });

  test('has the passage of its answer shown apart and read aloud', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await newCodexAgent(page);
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    // Sent to Codex with the instruction to end with a passage to be read.
    await expect
      .poll(() => requests(app, 'turn/start').find((m) => m?.params.input[0].text.includes('réglages'))?.params.input[0].text ?? '', {
        timeout: 20_000,
      })
      .toContain('<escouade-voice>');
    await expect(page.locator('[data-spoken]')).toContainText("C'est noté, je m'en occupe avec Codex.");
    await expect(page.getByText('détail technique', { exact: false })).toBeVisible();
    await expect(page.getByText('<spoken>')).toHaveCount(0);
    await expect
      .poll(() => (fs.existsSync(SPOKEN_LOG) ? fs.readFileSync(SPOKEN_LOG, 'utf8').split('\n').filter(Boolean) : []), {
        timeout: 15_000,
      })
      .toEqual(["C'est noté, je m'en occupe avec Codex."]);
    await page.keyboard.press('Escape');
  });
});
