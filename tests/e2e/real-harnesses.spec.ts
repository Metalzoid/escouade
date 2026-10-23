// The real trial of each harness before a release (ESC-52): the app (debug build, data of the test's) drives the real
// Claude Code, Codex, OpenCode and Copilot CLI of the machine, on the accounts it has. Each harness takes a small ticket in
// a worktree up to its commit and its merge, and an agent of its shows its terminal view; then an agent on Claude Code
// whose quota is spent (simulated: tests/fixtures/real-claude-quota.mjs) goes on on Codex (ESC-88).
//
// Skipped unless ESCOUADE_E2E_REAL names what to try (`claude,codex,opencode,copilot,handover`): each costs real usage.
// What each needs (docs/TODO-1.8.md, chapter 1, « Tests ») :
// - claude: Claude Code signed in as the user's own (Principal: no CLAUDE_CONFIG_DIR), ESCOUADE_REAL_CLAUDE its program;
//   on Haiku. What it writes in ~/.claude for the test's folders is taken out at the end.
// - codex: ESCOUADE_REAL_CODEX (0.163 or later), signed in in ~/.codex: its config.toml is put back as it was at the end,
//   the sessions of the test's folders taken out.
// - opencode: ESCOUADE_REAL_OPENCODE and an Ollama with REAL_OLLAMA_MODEL (default qwen3-coder:30b-32k); its config,
//   data and cache are the test's (XDG_*).
// - copilot: ESCOUADE_REAL_COPILOT, signed in by the user (`copilot login`, ~/.copilot, the token in the system's keychain):
//   its config.json and mcp-config.json are put back as they were at the end, the sessions of the trial taken out of its
//   session-state, and what it adds to %LOCALAPPDATA%\copilot.
// ESCOUADE_E2E_REAL_OUT: a folder kept for the screenshots (the terminals are drawn on a canvas).
// Run it with TMP and TEMP outside of %TEMP% (Codex accepts nothing by itself in a folder of %TEMP%), Claude Code's own
// variables unset (CLAUDECODE…) when it is run from Claude Code.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { addProject, expect, send, test, type App } from './fixture';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WANTED = new Set((process.env.ESCOUADE_E2E_REAL ?? '').split(',').map((s) => s.trim()));
const OUT = process.env.ESCOUADE_E2E_REAL_OUT ?? path.join(os.tmpdir(), 'escouade-real');
const HOME = os.homedir();
const CODEX_HOME = path.join(HOME, '.codex');
const MODEL = process.env.REAL_OLLAMA_MODEL ?? 'qwen3-coder:30b-32k';
const QUOTA = path.join(ROOT, 'tests', 'fixtures', 'real-claude-quota.cmd');

/** Up to half an hour for a ticket: a local model is slow. */
const LONG = 30 * 60_000;

type Harness = 'claude' | 'codex' | 'opencode' | 'copilot';
const NAMES: Record<Harness, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', copilot: 'Copilot CLI' };

let shot = 0;
/** A screenshot kept in OUT, for what the canvas of a terminal shows. */
async function snap(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`) }).catch(() => {});
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** The settings and variables of the app for the real harnesses (Claude Code's when it is tried, else the fake one). */
function realEnv(h: Harness | 'handover'): Record<string, string> {
  const env: Record<string, string | undefined> = {
    CLAUDECODE: undefined,
    CLAUDE_CODE_ENTRYPOINT: undefined,
    CLAUDE_CODE_CHILD_SESSION: undefined,
  };
  // The user's own Claude Code (Principal), not a folder of the test's.
  if (h === 'claude' || h === 'handover') env.CLAUDE_CONFIG_DIR = undefined;
  if (h === 'codex' || h === 'handover') {
    env.ESCOUADE_CODEX = process.env.ESCOUADE_REAL_CODEX;
    // The user's ~/.codex, signed in: its config.toml saved and put back (`keepCodex`).
    env.CODEX_HOME = undefined;
  }
  if (h === 'handover') {
    env.ESCOUADE_REAL_CLAUDE = process.env.ESCOUADE_REAL_CLAUDE;
    env.REAL_CLAUDE_LIMIT = path.join(os.tmpdir(), `real-claude-limit-${process.pid}`);
  }
  if (h === 'opencode') {
    env.ESCOUADE_OPENCODE = process.env.ESCOUADE_REAL_OPENCODE;
    // Its data, state and cache in the run's temporary folder (its config is the test's, by the fixture).
    for (const d of ['DATA', 'STATE', 'CACHE']) env[`XDG_${d}_HOME`] = path.join(os.tmpdir(), 'opencode-xdg', d.toLowerCase());
  }
  if (h === 'copilot') {
    env.ESCOUADE_COPILOT = process.env.ESCOUADE_REAL_COPILOT;
    // The user's own ~/.copilot, signed in (Principal): no token of the environment's.
    for (const k of ['COPILOT_HOME', 'GH_TOKEN', 'GITHUB_TOKEN', 'COPILOT_GITHUB_TOKEN']) env[k] = undefined;
  }
  return env as Record<string, string>;
}

function realSettings(h: Harness | 'handover', root: string): Record<string, unknown> {
  // Claude Code on Haiku; the others on their default model. Never `claude update` of the machine's Claude Code (ESC-133).
  const s: Record<string, unknown> = {
    claudeSelfUpdate: false,
    ...(h === 'claude' || h === 'handover' ? { defaultModel: 'haiku' } : {}),
  };
  if (h === 'claude') s.claudePath = process.env.ESCOUADE_REAL_CLAUDE;
  if (h === 'handover') s.claudePath = QUOTA;
  // The texts (commit messages…) written by the harness tried, Claude Code apart (Haiku).
  if (h === 'codex' || h === 'copilot') s.writerEngine = h;
  if (h === 'opencode') {
    s.writerEngine = 'opencode';
    s.writerModel = `ollama/${MODEL}`;
    // OpenCode's config: Ollama alone, the model fixed (without it OpenCode takes a model of its Zen).
    const config = path.join(root, 'xdg', 'opencode');
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(
      path.join(config, 'opencode.json'),
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          provider: {
            ollama: {
              npm: '@ai-sdk/openai-compatible',
              name: 'Ollama (local)',
              options: { baseURL: 'http://127.0.0.1:11434/v1' },
              models: { [MODEL]: { name: MODEL, tool_call: true, limit: { context: 32768, output: 8192 } } },
            },
          },
          model: `ollama/${MODEL}`,
          small_model: `ollama/${MODEL}`,
          enabled_providers: ['ollama'],
        },
        null,
        2,
      ),
    );
  }
  return s;
}

/** A new agent on `h`, from the menu beside « Nouvel agent » (Claude Code: the button itself, when it is alone). */
async function newAgent(page: Page, h: Harness) {
  const menu = page.getByRole('button', { name: 'Autres façons de créer un agent' });
  const item = page.getByRole('menuitemradio', { name: NAMES[h] });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
  }
  if (await item.isVisible()) await item.click();
  else {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Nouvel agent', exact: true }).first().click();
  }
  await expect(page.locator('main.conv header.head')).toContainText(NAMES[h]);
}

/** The card of the agent shown, in the sidebar. */
const shownCard = (page: Page) => page.locator('.card.sel').first();

/** Waits for the agent shown to be done with its turn (its card no longer « En cours »). */
async function idle(page: Page, timeout = LONG) {
  await expect.poll(async () => (await shownCard(page).textContent()) ?? '', { timeout, intervals: [2_000] }).not.toMatch(/En cours/);
}

/** The keys that answer the question of a harness's interface about the folder, as the user would (trust it). */
const TRUST: Record<Harness, string[]> = {
  // « No, exit » first, then « Yes, I trust this folder ».
  claude: ['ArrowDown', 'Enter'],
  // « Trust and continue » first.
  codex: ['Enter'],
  opencode: [],
  // « Yes, and remember this folder » second.
  copilot: ['ArrowDown', 'Enter'],
};

/**
 * The terminal view of an agent on `h`: a first turn in Escouade's view, then the harness's interface, a message typed
 * there, and back in Escouade's view, where that turn is in the conversation.
 */
async function terminalView(app: App, h: Harness) {
  const { page } = app;
  await newAgent(page, h);
  await snap(page, `${h}-agent`);
  await send(page, 'Réponds seulement par le mot : prêt.');
  await expect(page.getByTestId('turn-done').first()).toBeVisible({ timeout: LONG });
  await page.getByRole('button', { name: `Vue ${NAMES[h]}` }).click();
  const view = page.locator('main .tui');
  await expect(view.locator('.xterm')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(8_000);
  await snap(page, `${h}-view-open`);
  await view.locator('.xterm').click();
  for (const key of TRUST[h]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(5_000);
  await snap(page, `${h}-view-ready`);
  await page.keyboard.type('Crée le fichier vue.txt qui contient la seule ligne : vu du terminal');
  await page.keyboard.press('Enter');
  // Its permission to write the file, answered in the interface as the user would: Entrée takes the first choice, « Yes ».
  const file = path.join(app.repo, 'vue.txt');
  const started = Date.now();
  for (let i = 1; !fs.existsSync(file); i++) {
    expect(Date.now() - started, 'the file was written from the terminal view').toBeLessThan(LONG);
    await page.waitForTimeout(3_000);
    if (i % 5 === 0) {
      await snap(page, `${h}-view-wait`);
      await page.keyboard.press('Enter');
    }
  }
  await expect.poll(() => fs.readFileSync(file, 'utf8')).toMatch(/vu du terminal/);
  await page.waitForTimeout(10_000);
  await snap(page, `${h}-view-done`);
  await idle(page);
  await page.getByRole('button', { name: 'Vue Escouade' }).click();
  await expect(page.getByText(/vue\.txt/).first()).toBeVisible({ timeout: 60_000 });
  await snap(page, `${h}-view-back`);
  // The file left out of the project's branch: the ticket merges into a clean one.
  fs.rmSync(path.join(app.repo, 'vue.txt'), { force: true });
}

/** A small ticket on `h`, with a plan and a subagent where it has them, up to « À tester », then validated and merged. */
async function ticket(app: App, h: Harness) {
  const { page } = app;
  await page.getByRole('button', { name: /^Kanban/ }).click();
  await page.getByRole('button', { name: 'Nouveau ticket' }).click();
  await page.getByRole('textbox', { name: 'Titre du ticket' }).fill(`Ajouter bonjour.txt (${NAMES[h]})`);
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill(
      `Crée à la racine le fichier bonjour.txt qui contient la seule ligne « Bonjour depuis ${NAMES[h]} », puis commite-le. ` +
        'Commence par un plan court (ta liste de tâches), et fais relire le fichier par un sous-agent si tu peux en lancer un.',
    );
  await page
    .getByRole('textbox', { name: "Critères d'acceptation" })
    .fill(`bonjour.txt contient « Bonjour depuis ${NAMES[h]} » et il est commité`);
  if (h !== 'claude') {
    await page.getByRole('group', { name: 'Harness' }).getByRole('button').click();
    await page.getByRole('menuitem', { name: NAMES[h], exact: true }).click();
  }
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const review = page.getByRole('region', { name: 'À tester' });
  const started = Date.now();
  // Its permissions answered as the user would, in its agent's conversation (Haiku has no mode « Auto »).
  let n = 0;
  while (!(await review.getByText('DEM-1', { exact: true }).isVisible())) {
    expect(Date.now() - started, 'the ticket reached « À tester »').toBeLessThan(LONG);
    await page.waitForTimeout(15_000);
    const card = page.locator('.card', { hasText: 'DEM-1' }).first();
    if (await card.isVisible()) {
      await card.click();
      const ask = page.getByTestId('permission-pending').first();
      if (await ask.isVisible()) {
        await snap(page, `${h}-ticket-permission`);
        await ask.getByRole('button', { name: 'Autoriser', exact: true }).click();
      }
      if (++n % 4 === 0) await snap(page, `${h}-ticket`);
      await page.getByRole('button', { name: /^Kanban/ }).click();
    }
  }
  await snap(page, `${h}-ticket-review`);
  // What was done is the agent's work, not the protocol's example copied (ESC-123: a local model did so).
  const steps = (await review.locator('.card', { hasText: 'DEM-1' }).first().locator('.steps').allTextContents()).join(' | ');
  console.log(`${h}: what was done: ${steps.replace(/\s+/g, ' ')}`);
  expect(steps).toMatch(/bonjour/i);
  expect(steps).not.toMatch(/Tokens d|Middleware|Adaptateur des sessions|<ce que tu as fait>|<autre chose faite>/);
  const done = page.getByRole('region', { name: 'Terminé' });
  const validate = review.getByRole('button', { name: 'Valider et merger' });
  await validate.click();
  await page.waitForTimeout(1_000);
  console.log(`${h}: validate clicked; toast: ${await page.locator('.toasts').textContent()}`);
  await snap(page, `${h}-ticket-validate-clicked`);
  for (let i = 0; !(await done.getByText(/⤵ Mergé dans main/).isVisible()); i++) {
    expect(i, 'the ticket was merged').toBeLessThan(40);
    await page.waitForTimeout(15_000);
    await snap(page, `${h}-ticket-validating`);
    const toast = await page.locator('.toasts').textContent();
    console.log(`${h}: validating, card: ${(await review.textContent())?.replace(/\s+/g, ' ')}; toast: ${toast}`);
    // Refused (a toast says why): clicked again, as the user would once it is possible.
    if (await validate.isVisible()) await validate.click();
  }
  await snap(page, `${h}-ticket-merged`);
  expect(fs.readFileSync(path.join(app.repo, 'bonjour.txt'), 'utf8')).toMatch(new RegExp(`Bonjour depuis ${NAMES[h]}`));
  console.log(`${h}: ${git(app.repo, 'log', '-3', '--format=%h %s')}`);
  // Its agent's conversation, for the notes.
  await done.getByRole('button', { name: /DEM-1/ }).click();
  await page.waitForTimeout(2_000);
  await snap(page, `${h}-ticket-conversation`);
}

// ---------- what is put back at the end ----------

/** Files of `dir` (recursive) changed since `since`, whose text names a folder of the test's. */
function touched(dir: string, since: number, test: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[])
    .map((f) => path.join(dir, f))
    .filter((f) => {
      try {
        const st = fs.statSync(f);
        return st.isFile() && st.mtimeMs >= since && test(f);
      } catch {
        return false;
      }
    });
}

/** Whether a file names the folder of the test runs (the temporary folder of the run, outside of %TEMP%). */
const ours = (file: string) => fs.readFileSync(file, 'utf8').includes('escouade-js-tests');

/** Takes out of `file` the lines that name the test's folders. */
function dropLines(file: string) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const kept = text
    .split('\n')
    .filter((l) => !l.includes('escouade-js-tests'))
    .join('\n');
  if (kept !== text) fs.writeFileSync(file, kept);
}

/** Codex: config.toml put back as it was, the sessions of the test's folders taken out. */
function keepCodex() {
  const config = path.join(CODEX_HOME, 'config.toml');
  const saved = fs.existsSync(config) ? fs.readFileSync(config) : null;
  const since = Date.now();
  return () => {
    if (saved) fs.writeFileSync(config, saved);
    const sessions = touched(path.join(CODEX_HOME, 'sessions'), since, ours);
    const ids = sessions.map((f) => path.basename(f).match(/([0-9a-f-]{36})\.jsonl$/)?.[1]).filter(Boolean) as string[];
    for (const f of sessions) fs.rmSync(f);
    // Their lines in the index and in the history (what was typed in its interface).
    for (const name of ['session_index.jsonl', 'history.jsonl']) {
      const file = path.join(CODEX_HOME, name);
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const kept = text
        .split('\n')
        .filter((l) => !ids.some((id) => l.includes(id)))
        .join('\n');
      if (kept !== text) fs.writeFileSync(file, kept);
    }
    console.log(`codex: config.toml put back, ${sessions.length} sessions taken out`);
  };
}

/**
 * Claude Code: the transcripts, sessions, history and folder entries (~/.claude.json, the trust of the folder given in its
 * interface) of the test's folders taken out.
 */
function keepClaude() {
  const dir = path.join(HOME, '.claude');
  const since = Date.now();
  return () => {
    const projects = path.join(dir, 'projects');
    let gone = 0;
    for (const name of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
      if (name.includes('escouade-js-tests')) {
        // Its sessions' own folders of variables go with it.
        const sessions = (fs.readdirSync(path.join(projects, name), { recursive: true, encoding: 'utf8' }) as string[])
          .map((f) => path.basename(f).match(/^([0-9a-f-]{36}).jsonl$/)?.[1])
          .filter(Boolean) as string[];
        for (const id of sessions) fs.rmSync(path.join(dir, 'session-env', id), { recursive: true, force: true });
        fs.rmSync(path.join(projects, name), { recursive: true, force: true });
        gone++;
      }
    }
    // Read and written at once: the user's sessions write it too.
    const config = path.join(HOME, '.claude.json');
    if (fs.existsSync(config)) {
      const json = JSON.parse(fs.readFileSync(config, 'utf8'));
      const keys = Object.keys(json.projects ?? {}).filter((k) => k.includes('escouade-js-tests'));
      for (const k of keys) delete json.projects[k];
      if (keys.length) fs.writeFileSync(config, JSON.stringify(json, null, 2));
    }
    for (const f of touched(path.join(dir, 'sessions'), since, ours)) fs.rmSync(f);
    dropLines(path.join(dir, 'history.jsonl'));
    console.log(`claude: ${gone} project folders taken out of ~/.claude/projects`);
  };
}

/**
 * Copilot CLI: its Principal's config.json and mcp-config.json put back as they were (an mcp-config.json that was not
 * there taken out), the sessions of the trial's folders taken out of its session-state, and what the trial adds to
 * %LOCALAPPDATA%\copilot.
 */
function keepCopilot() {
  const home = path.join(HOME, '.copilot');
  const saved = ['config.json', 'mcp-config.json'].map(
    (name) => [name, fs.existsSync(path.join(home, name)) ? fs.readFileSync(path.join(home, name)) : null] as const,
  );
  const sessions = path.join(home, 'session-state');
  const had = new Set(fs.existsSync(sessions) ? fs.readdirSync(sessions) : []);
  // The locks Copilot keeps for its sessions, one a session, some of sessions it keeps no folder of.
  const locks = path.join(sessions, '.session-operation-locks');
  const locked = new Set(fs.existsSync(locks) ? fs.readdirSync(locks) : []);
  const cache = path.join(process.env.LOCALAPPDATA ?? '', 'copilot');
  const list = (dir: string) => (fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[]) : []);
  const before = new Set(list(cache));
  return () => {
    for (const [name, bytes] of saved) {
      if (bytes) fs.writeFileSync(path.join(home, name), bytes);
      else fs.rmSync(path.join(home, name), { force: true });
    }
    const ours = (fs.existsSync(sessions) ? fs.readdirSync(sessions) : []).filter((id) => {
      const workspace = path.join(sessions, id, 'workspace.yaml');
      return !had.has(id) && fs.existsSync(workspace) && fs.readFileSync(workspace, 'utf8').includes('escouade-js-tests');
    });
    for (const id of ours) fs.rmSync(path.join(sessions, id), { recursive: true, force: true });
    const stale = (fs.existsSync(locks) ? fs.readdirSync(locks) : []).filter(
      (lock) => !locked.has(lock) && !fs.existsSync(path.join(sessions, lock.replace(/\.lock$/, ''))),
    );
    for (const lock of stale) fs.rmSync(path.join(locks, lock), { force: true });
    const added = list(cache)
      .filter((f) => !before.has(f))
      .sort((a, b) => b.length - a.length);
    for (const f of added) fs.rmSync(path.join(cache, f), { recursive: true, force: true });
    console.log(`copilot: config put back, ${ours.length} sessions and ${added.length} entries of %LOCALAPPDATA%\\copilot taken out`);
  };
}

/** Réglages › Comptes: the Principal of Copilot CLI signed in as the user's account, with its credits of the month. */
async function copilotAccount(page: Page) {
  await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('tab', { name: 'Comptes' }).click();
  const list = settings.getByRole('list', { name: 'Comptes Copilot CLI' });
  await expect(list.getByRole('listitem').first()).toContainText(/Connecté/, { timeout: 60_000 });
  await snap(page, 'copilot-account');
  console.log(`copilot: ${(await list.textContent())?.replace(/\s+/g, ' ')}`);
  await page.keyboard.press('Escape');
}

// ---------- the trials ----------

for (const h of ['claude', 'codex', 'opencode', 'copilot'] as const) {
  test.describe(`the real ${NAMES[h]}`, () => {
    test.skip(!WANTED.has(h), `ESCOUADE_E2E_REAL does not name ${h}`);
    test.setTimeout(2 * LONG);
    test.use({
      actionTimeout: 60_000,
      appEnv: WANTED.has(h) ? realEnv(h) : {},
      preStart: {
        run: (root: string) => {
          if (!WANTED.has(h)) return {};
          return realSettings(h, root);
        },
      },
    });

    test(`takes a ticket up to its merge, and shows its terminal view`, async ({ app }) => {
      const back = [h === 'claude' && keepClaude(), h === 'codex' && keepCodex(), h === 'copilot' && keepCopilot()].filter(
        Boolean,
      ) as (() => void)[];
      try {
        await snap(app.page, `${h}-start`);
        await addProject(app.page, app.repo, { firstAgent: false });
        await snap(app.page, `${h}-project`);
        if (!process.env.REAL_SKIP_VIEW) await terminalView(app, h);
        await ticket(app, h);
        if (h === 'copilot') await copilotAccount(app.page);
      } finally {
        await snap(app.page, `${h}-end`);
        for (const b of back) b();
      }
    });
  });
}

test.describe('an agent on the real Claude Code whose quota is spent', () => {
  test.skip(!WANTED.has('handover'), 'ESCOUADE_E2E_REAL does not name handover');
  test.setTimeout(2 * LONG);
  test.use({
    actionTimeout: 60_000,
    appEnv: WANTED.has('handover') ? realEnv('handover') : {},
    preStart: { run: (root: string) => (WANTED.has('handover') ? realSettings('handover', root) : {}) },
  });

  test('goes on on Codex with its work, by « Continuer sur Codex » (ESC-88)', async ({ app }) => {
    const { page } = app;
    const back = [keepClaude(), keepCodex()];
    const limit = path.join(os.tmpdir(), `real-claude-limit-${process.pid}`);
    try {
      await addProject(page, app.repo, { firstAgent: false });
      // Codex used once in the project: its Principal is made at its first agent (ESC-37), and serves the project then.
      await newAgent(page, 'codex');
      await newAgent(page, 'claude');
      await send(page, 'Crée le fichier etapes.txt avec la seule ligne « étape 1 : Claude ». Ne fais rien d’autre.');
      await expect(page.getByTestId('turn-done').first()).toBeVisible({ timeout: LONG });
      await expect.poll(() => fs.existsSync(path.join(app.repo, 'etapes.txt'))).toBe(true);
      // The quota spent: the next message meets the usage limit.
      fs.writeFileSync(limit, '');
      await send(page, 'Ajoute à etapes.txt la ligne « étape 2 : suite », puis commite etapes.txt avec le message « Étapes ».');
      const go = page.getByRole('button', { name: 'Continuer sur Codex' });
      await expect(go).toBeVisible({ timeout: 120_000 });
      await snap(page, 'handover-limit');
      await go.click();
      await expect(page.getByTestId('handover')).toContainText(/Suite sur Codex · quota Claude/, { timeout: 60_000 });
      await expect(page.locator('main.conv header.head')).toContainText('Codex');
      await expect
        .poll(() => fs.readFileSync(path.join(app.repo, 'etapes.txt'), 'utf8'), { timeout: LONG, intervals: [3_000] })
        .toMatch(/étape 1 : Claude\r?\n.*étape 2 : suite/s);
      await expect.poll(() => git(app.repo, 'log', '-1', '--format=%s'), { timeout: LONG, intervals: [3_000] }).toBe('Étapes');
      await idle(page);
      await snap(page, 'handover-done');
    } finally {
      fs.rmSync(limit, { force: true });
      for (const b of back) b();
    }
  });
});
