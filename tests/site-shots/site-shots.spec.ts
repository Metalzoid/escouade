// The website's screenshots (`npm run site-shots`, README.md here): the real app 2.0, on the made-up demo of demo.ts, in the
// language of each project of the config (fr, en). Each picture is the app's window at 1500 × 844 on the backdrop the site
// crops it from (website/app/data/shots.ts: WINDOW), 1920 × 960, JPEG quality 85, under the name the site reads
// (website/app/data/site.ts: FEATURE_SHOTS).

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { fr } from '../../src/lib/i18n/fr';
import { startFakeTrackers } from '../fixtures/fake-trackers.mjs';
import { FAKE_CODEX, FAKE_CURSOR, expect, test as base } from '../e2e/fixture';
import { PROJECTS, makeDemo, textOf, trackersOf } from './demo';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SITE = path.join(ROOT, 'website', 'public', 'images');
/** Where the shots go: the site's images, or `ESCOUADE_SHOTS_OUT` to look at them first. */
const OUT = process.env.ESCOUADE_SHOTS_OUT ?? SITE;
/** The app's window inside a shot (website/app/data/shots.ts). */
const WINDOW = { x: 210, y: 70, w: 1500, h: 844 };
const SHOT = { w: 1920, h: 960 };

/** A port nobody listens on, from the system. */
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
/** The first of two free ports in a row, for the ticket to test (its api and its web). */
async function twoPorts(): Promise<number> {
  for (;;) {
    const p = await freePort();
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer().once('error', () => resolve(false));
      s.listen(p + 1, () => s.close(() => resolve(true)));
    });
    if (free) return p;
  }
}

let trackers: { url: string; close: () => Promise<void> };
let ports = 0;

const test = base.extend<{ trackersUp: void }>({
  // The fake harnesses of the three the demo runs on, and the turns the fake `claude` plays.
  appEnv: async ({ language }, use) => {
    await use({
      ESCOUADE_CODEX: FAKE_CODEX,
      ESCOUADE_CURSOR: FAKE_CURSOR,
      FAKE_CLAUDE_DEMO: path.join(process.env.ESCOUADE_E2E_ROOT!, 'demo-turns.json'),
      FAKE_CLAUDE_REMOTE_MESSAGE: textOf(language).remote,
    });
  },
  preStart: async ({ language }, use) => {
    await use({
      run: (root: string) => {
        makeDemo(root, language, ports);
        return { theme: 'dark', sound: false };
      },
    });
  },
});

test.beforeEach(async ({ language }) => {
  // Jira for the import, with the demo's issues; read by the app the fixture starts next.
  trackers = await startFakeTrackers(0, trackersOf(language));
  process.env.ESCOUADE_TRELLO_API = `${trackers.url}/1`;
  process.env.ESCOUADE_GITHUB_API = `${trackers.url}/github`;
  ports = await twoPorts();
});
test.afterEach(async ({ app, language }, info) => {
  // What the window showed when a step failed, in the test's results.
  if (info.status !== info.expectedStatus) await app.page.screenshot({ path: info.outputPath(`failed-${language}.png`) }).catch(() => {});
  await trackers?.close();
});

/** Nothing the app opens outside reaches the machine: no browser, no file manager (as links.spec.ts catches them). */
async function keepInside(page: Page) {
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const command = decodeURIComponent(String(input instanceof Request ? input.url : input));
      if (/\/(plugin:opener\|)?(open_url|open_path|reveal_item_in_dir)(\?|$)/.test(command))
        return Promise.resolve(new Response('null', { headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' } }));
      return fetch(input, init);
    };
  });
}

/** The pictures an agent sends in a conversation: a phone's profile screen, light and dark. */
async function profilePictures(dir: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
  fs.mkdirSync(dir, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    const [bg, card, text, dim, accent] =
      theme === 'light' ? ['#f6f7f9', '#ffffff', '#111827', '#6b7280', '#0e9fae'] : ['#0d1117', '#161b22', '#f0f3f6', '#8b949e', '#39c5d4'];
    const stats = ['24|Projects', '1.2k|Followers', '180|Following']
      .map((s) => s.split('|'))
      .map(
        ([n, l]) =>
          `<div style="flex:1;background:${card};border-radius:14px;padding:12px;text-align:center"><b style="font-size:18px">${n}</b><div style="color:${dim};font-size:12px">${l}</div></div>`,
      )
      .join('');
    const rows = ['Notifications', 'Privacy', 'Appearance', 'Help']
      .map(
        (l) =>
          `<div style="padding:14px 16px;border-bottom:1px solid ${dim}22;display:flex;justify-content:space-between">${l}<span style="color:${dim}">›</span></div>`,
      )
      .join('');
    await page.setContent(`<body style="margin:0;font:15px system-ui,sans-serif;background:${bg};color:${text}">
      <div style="padding:56px 24px 24px;display:grid;gap:18px;justify-items:center">
        <div style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,${accent},#7c5cff)"></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:650">Alex Morgan</div><div style="color:${dim}">alex@example.com</div></div>
        <div style="display:flex;gap:10px;width:100%">${stats}</div>
        <div style="width:100%;background:${card};border-radius:14px">${rows}</div>
        <div style="width:100%;padding:12px;border-radius:12px;background:${accent};color:#fff;text-align:center;font-weight:600">Sign out</div>
      </div></body>`);
    await page.screenshot({ path: path.join(dir, `profile-${theme}.png`) });
  }
  await browser.close();
}

/** The picture of the window: on the backdrop the site crops it from, 1920 × 960, JPEG quality 85. */
async function compose(png: Buffer, file: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SHOT.w, height: SHOT.h }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;width:${SHOT.w}px;height:${SHOT.h}px;overflow:hidden;
      background:radial-gradient(ellipse at 50% 45%, #15191d 0%, #0b0d0f 60%, #08090a 100%)">
    <img src="data:image/png;base64,${png.toString('base64')}" style="position:absolute;left:${WINDOW.x}px;top:${WINDOW.y}px;
      width:${WINDOW.w}px;height:${WINDOW.h}px;border-radius:12px;
      box-shadow:0 0 0 1px rgba(255,255,255,.1),0 40px 90px -20px rgba(0,0,0,.85)"></body>`);
  await page.evaluate(() => document.images[0].decode());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
  await browser.close();
}

/** `text` with its `{placeholders}` as a pattern that takes anything in their place. */
const like = (text: string) => new RegExp(`^${text.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.*')}$`);

test('the website’s screenshots', async ({ app, language }) => {
  test.setTimeout(900_000);
  const t = textOf(language);
  const L = language === 'fr' ? fr : en;
  const { page } = app;
  const out = (name: string) => path.join(OUT, language === 'fr' ? '' : language, `${name}.jpg`);
  await page.setViewportSize({ width: WINDOW.w, height: WINDOW.h });
  await keepInside(page);
  await profilePictures(path.join(app.root, PROJECTS.mobile.name, '.escouade-shots'));

  /**
   * Still: no pointer over anything, no caret, nothing moving, no toast unless it is what the picture shows; then the window's
   * picture.
   */
  const shot = async (name: string, { toasts = false } = {}) => {
    await page.mouse.move(WINDOW.w - 2, WINDOW.h / 2);
    await page.evaluate((hide) => {
      const style = document.getElementById('shots-style') ?? document.head.appendChild(document.createElement('style'));
      style.id = 'shots-style';
      style.textContent = hide ? '.toasts { display: none !important; }' : '';
    }, !toasts);
    await page.waitForTimeout(700);
    const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    await compose(png, out(name));
  };
  const project = (p: keyof typeof PROJECTS) =>
    page
      .locator('nav.rail')
      .getByRole('tab', { name: new RegExp(PROJECTS[p].name) })
      .first()
      .click();
  /** The sidebar's two tabs: its agents, its Kanban. */
  const tab = (name: 'Agents' | 'Kanban') =>
    page
      .locator('aside.side')
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click();
  const card = (name: string) => page.locator('aside.side .agent', { hasText: name }).first();
  const say = async (name: string, text: string) => {
    await card(name).click();
    const box = page.locator('.composer textarea');
    await box.fill(text);
    await box.press('Enter');
  };

  // The agents at work.
  await say(t.agents.pagination, t.pagination.prompt);
  await expect(page.getByText('npm run test:e2e').first()).toBeVisible();
  await say(t.agents.auth, t.auth.prompt);
  await say(t.agents.e2e, t.e2e.prompt);
  await say(t.agents.csv, 'lent 900s');
  await say(t.agents.attempts, 'lent 900s');
  await expect(page.locator('aside.side .agent.waiting')).toHaveCount(1);

  // « agents »: the projects' rail, the agents of demo-api on three harnesses, a conversation with its plan.
  // The list from its top: the one that asks first.
  await card(t.agents.pagination).click();
  await card(t.agents.e2e).evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
  // The models of its account, as its `claude` told them, in the composer's menu.
  await page
    .locator('.composer')
    .getByRole('button', { name: /Sonnet 5\.5/ })
    .first()
    .click();
  await expect(
    page
      .getByRole('menuitemradio', { name: /Fable 5\.1/ })
      .or(page.getByRole('option', { name: /Fable 5\.1/ }))
      .first(),
  ).toBeVisible();
  await shot('agents');
  await page.keyboard.press('Escape');

  // « notifications »: the agent that asks, its question on its card and in its conversation.
  await card(t.agents.e2e).click();
  await shot('notifications');

  // « editor »: the editor on the files the agents changed.
  await card(t.agents.pagination).click();
  const editor = page.getByRole('button', { name: L.nav.titleBar.openEditor });
  await editor.click();
  const item = (name: string) => page.locator('.tree, aside, nav').getByText(name, { exact: true }).first();
  // A folder opened once, whether the editor opened it already or not.
  const open = async (folder: string, child: string) => {
    await expect(item(folder)).toBeVisible();
    await expect(async () => {
      if (!(await item(child).isVisible())) await item(folder).click();
      await expect(item(child)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
  };
  await open('src', 'db');
  await open('db', 'paginate.ts');
  await item('paginate.ts').click();
  await open('routes', 'users.ts');
  await item('users.ts').click();
  await shot('editor');
  // Back to the conversation.
  await page
    .getByRole('button', { name: /^Conversation/ })
    .first()
    .click();

  // « launch »: the launch commands of demo-api, the worker failed, the front's log.
  await page.getByRole('button', { name: L.runs.action.runAll }).click();
  await page.getByText('Front', { exact: true }).first().click();
  // Its log is xterm's canvas: a few lines of it, the server's banner still on top.
  await page.waitForTimeout(4000);
  await shot('launch', { toasts: true });

  // « board »: demo-api's Kanban, a ticket in each column.
  await tab('Kanban');
  await expect(page.getByRole('region', { name: L.board.columns.review })).toBeVisible();
  await shot('board');

  // « integrations »: Jira connected, its project linked, the import with three issues checked.
  await page.getByRole('button', { name: like(L.nav.rail.settingsLabel) }).click();
  const settings = page.getByRole('dialog', { name: L.common.settings });
  await settings.getByRole('tab', { name: L.settings.tabs.integrations.label }).click();
  await settings.getByRole('button', { name: L.integrations.accounts.connectEllipsis }).first().click();
  const jira = settings.getByRole('form', { name: like(L.integrations.accounts.formLabel) }).first();
  await jira.getByLabel(L.integrations.accounts.site).fill(trackers.url);
  await jira.getByLabel(L.integrations.accounts.email).fill('camille@example.com');
  await jira.getByLabel(L.integrations.accounts.apiToken).fill('demo');
  await jira.getByRole('button', { name: L.integrations.accounts.connect, exact: true }).click();
  await settings.getByRole('combobox', { name: L.integrations.sources.pick.jira }).selectOption('ATL');
  await settings.getByRole('button', { name: L.common.save }).click();
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: L.common.import, exact: true }).click();
  const imp = page.getByRole('dialog', { name: L.integrations.modal.title });
  for (const key of ['ATL-1287', 'ATL-1290', 'ATL-1293']) await imp.getByRole('checkbox', { name: new RegExp(key) }).click();
  await shot('integrations');
  await page.keyboard.press('Escape');
  await expect(imp).toBeHidden();

  // « test »: « Tester » on the ticket to test, its recipe (approved already) launched at once.
  await page.getByRole('region', { name: L.board.columns.review }).getByRole('button', { name: L.board.card.test }).click();
  const tester = page.getByRole('dialog', { name: /DEM-4/ });
  await expect(tester.locator('.opened.done')).toBeVisible({ timeout: 60_000 });
  await shot('test');
  await tester.getByRole('button', { name: L.common.stopAll }).click();
  await page.keyboard.press('Escape');
  await expect(tester).toBeHidden();

  // « chat »: the profile screen of mobile-app, its diff unfolded and the pictures the agent sent.
  await project('mobile');
  await say(t.agents.profile, t.profile.prompt);
  await expect(page.locator('main.conv img').first()).toBeVisible();
  // Unfolded by its row (its path opens the editor).
  await page.locator('.tool .row', { hasText: 'ProfileScreen.tsx' }).first().locator('.badge').click();
  await shot('chat');

  // « remote »: remote control on the same agent, a message from claude.ai, and its menu.
  await card(t.agents.profile).click({ button: 'right' });
  await page.getByRole('menuitem', { name: new RegExp(L.nav.sidebar.menu.remoteOn) }).click();
  await expect(page.getByText(t.remoteAnswer.split('**')[0].trim()).first()).toBeVisible();
  await card(t.agents.profile).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: L.nav.sidebar.menu.openRemote })).toBeVisible();
  await shot('remote');
  await page.keyboard.press('Escape');

  // « git »: studio-web, two repositories changed by one agent, the conversation and the files side by side.
  await project('studio');
  await say(t.agents.header, t.header.prompt);
  await expect(page.getByText('npm run dev').first()).toBeVisible();
  await page.getByRole('button', { name: L.conv.header.layoutSplit }).click();
  const side = page.locator('aside.git-side');
  await side
    .getByRole('button', { name: L.git.files.scopeProject })
    .or(side.getByRole('tab', { name: L.git.files.scopeProject }))
    .first()
    .click();
  await side.getByText('Header.tsx').first().click();
  await page.waitForTimeout(1000);
  await shot('git');

  // « stats »: the statistics of every project over two weeks.
  await page.getByRole('button', { name: L.nav.rail.stats, exact: true }).first().click();
  await shot('stats');
});
