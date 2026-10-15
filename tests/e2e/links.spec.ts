// A link never takes the window away from the app's interface (ESC-101): it opens in the system's browser, or nowhere.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

const PR = 'https://example.com/pr/1';

/**
 * What the app asks to open outside, seen on its way to the opener plugin, and the native confirmations it asks for
 * (xterm.js's own, for an OSC 8 link, went through tauri-plugin-dialog). The opening is answered here: no browser opens.
 */
async function watch(page: Page) {
  const opened: string[] = [];
  const confirms: string[] = [];
  page.on('request', (r) => {
    const command = decodeURIComponent(r.url());
    if (command.includes('plugin:opener|open_url')) opened.push(JSON.parse(r.postData() ?? '{}').url);
    if (command.includes('plugin:dialog|confirm')) confirms.push(r.postData() ?? '');
  });
  await page.route(/ipc\.localhost\/plugin%3Aopener%7Copen_url/, (route) =>
    // As Tauri's own answer: the page may read `Tauri-Response` only once exposed.
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Tauri-Response': 'ok',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Tauri-Response',
      },
      body: 'null',
    }),
  );
  return { opened, confirms };
}

/** Marks the page: the mark is gone if the window navigated, or reloaded the interface. */
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { esc101: boolean }).esc101 = true));
/**
 * The window is still on the app, its interface there. Read with `evaluate`: after a navigation the app refused,
 * Playwright's locators wait for that navigation to finish, which never comes.
 */
const stillHere = async (page: Page, home: string) => {
  expect(page.url()).toBe(home);
  const shown = await page.evaluate(() => ({
    marked: (window as unknown as { esc101?: boolean }).esc101 ?? false,
    tab: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('demo-api')),
  }));
  expect(shown).toEqual({ marked: true, tab: true });
};

test('a link of the conversation opens in the browser, whatever the click, and the window stays on the app', async ({ app }) => {
  const { page } = app;
  const { opened, confirms } = await watch(page);
  await addProject(page, app.repo);
  // The fake Claude says the message back: its reply has the links, as markdown.
  await send(page, `[la PR](${PR}) et [rien]()`);
  const link = page.locator('.md a', { hasText: 'la PR' });
  await expect(link).toBeVisible();
  const home = page.url();
  await mark(page);

  await link.click();
  await expect.poll(() => opened.length).toBe(1);
  await link.click({ button: 'middle' });
  await expect.poll(() => opened.length).toBe(2);
  await link.click({ modifiers: ['Control'] });
  await expect.poll(() => opened.length).toBe(3);
  await link.click({ modifiers: ['Shift'] });
  await expect.poll(() => opened.length).toBe(4);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => opened.length).toBe(5);
  expect(opened).toEqual([PR, PR, PR, PR, PR]);

  // `[rien]()` has an empty href: it used to reload the interface.
  await page.locator('.md a', { hasText: 'rien' }).click();
  await page.waitForTimeout(1000);
  await stillHere(page, home);
  expect(opened).toHaveLength(5);

  // A link outside the markdown, which nothing of the app handles.
  await page.evaluate((href) => {
    const a = document.createElement('a');
    a.href = href;
    a.id = 'stray';
    a.textContent = 'lien perdu';
    a.style.cssText = 'position:fixed;left:50%;top:50%;z-index:9999';
    document.body.appendChild(a);
  }, 'https://example.com/stray');
  await page.locator('#stray').click();
  await expect.poll(() => opened.length).toBe(6);
  expect(opened[5]).toBe('https://example.com/stray');
  await page.waitForTimeout(1000);
  await stillHere(page, home);
  expect(confirms).toEqual([]);
});

test('an OSC 8 hyperlink of a terminal opens in the browser, without a confirmation', async ({ app }) => {
  const { page } = app;
  const { opened, confirms } = await watch(page);
  await addProject(page, app.repo);
  // Written by node, as Claude Code writes its links: through the pseudo-console, which passes OSC 8 on.
  const script = path.join(app.root, 'osc8.js');
  fs.writeFileSync(script, `process.stdout.write('\\x1b]8;;${PR}\\x1b\\\\LIEN-OSC8-LIEN-OSC8\\x1b]8;;\\x1b\\\\ fin\\r\\n');\n`);
  await page.getByRole('button', { name: 'Nouveau terminal' }).click();
  await page.getByRole('menuitem', { name: /PowerShell/ }).click();
  const term = page.locator('.xterm:visible');
  await expect(term).toBeVisible();
  await page.waitForTimeout(2500); // PowerShell start-up
  await term.click();
  await page.keyboard.type(`Clear-Host; node '${script}'`);
  await page.keyboard.press('Enter');
  const home = page.url();
  await mark(page);
  // The link is the first row's text once node has written it: hovered, then clicked. xterm.js keeps the links it found
  // on a row while the pointer stays on it: the pointer leaves the row before each try.
  const screenEl = page.locator('.xterm:visible .xterm-screen');
  const screen = (await screenEl.boundingBox())!;
  const at = { x: screen.x + 60, y: screen.y + 8 };
  await expect
    .poll(
      async () => {
        await page.mouse.move(at.x, at.y + 100);
        await page.mouse.move(at.x, at.y);
        await page.waitForTimeout(300);
        return screenEl.evaluate((el) => getComputedStyle(el).cursor);
      },
      { timeout: 15_000 },
    )
    .toBe('pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => opened).toEqual([PR]);
  await page.waitForTimeout(1000);
  await stillHere(page, home);
  expect(confirms).toEqual([]);
});

test('the window refuses to leave the app when a script asks it to, and to open another window', async ({ app }) => {
  const { page } = app;
  await watch(page);
  await addProject(page, app.repo);
  const home = page.url();
  await mark(page);
  const log = () => fs.readFileSync(path.join(app.data, 'app.log'), 'utf8');

  // From a click, so that no popup blocker stands in the way.
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'popup';
    b.textContent = 'popup';
    b.style.cssText = 'position:fixed;left:50%;top:50%;z-index:9999';
    b.onclick = () => window.open('about:blank#popup');
    document.body.appendChild(b);
  });
  await page.locator('#popup').click();
  await expect.poll(log).toContain('new window refused: about:');
  await page.waitForTimeout(1000);
  await stillHere(page, home);
  expect(page.context().pages()).toHaveLength(1);

  // Last: Playwright's locators would then wait for the navigation the app refused.
  await page.evaluate(() => {
    location.href = 'about:blank';
  });
  await expect.poll(log).toContain('navigation refused: about:');
  await page.waitForTimeout(1000);
  await stillHere(page, home);
});
