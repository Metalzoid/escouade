// The Claude Code view of an agent created in it (« Ouvrir les nouveaux agents dans l'interface de Claude Code ») takes the whole
// height of the conversation: the xterm.js rows fill its box, and Claude Code, whose full-screen interface draws on the rows of its
// pseudo-console and nowhere else, is started with as many (the fake interface notes each size it reads in fake-tui-size.jsonl).

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, test } from './fixture';

test.use({ preStart: { run: () => ({ terminalView: true }) } });

/** What the box of the Claude Code view has to draw in, and what xterm.js draws in it. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('main .tui .box') as HTMLElement;
    const screen = box.querySelector('.xterm-screen') as HTMLElement;
    const style = getComputedStyle(box);
    return {
      room: box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      screen: screen.getBoundingClientRect().height,
    };
  });
}

/** The sizes of its pseudo-console that the fake Claude Code interface read, in order. */
function sizesOf(root: string) {
  const file = path.join(root, 'claude', 'fake-tui-size.jsonl');
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { cols: number; rows: number })
    : [];
}

/** The height of a row, from the first size the fake interface read: it does not change while the test runs. */
async function rowHeight(page: Page, root: string) {
  await expect.poll(() => sizesOf(root).length).toBeGreaterThan(0);
  const { screen } = await measure(page);
  return screen / sizesOf(root)[0].rows;
}

/**
 * Waits for the pseudo-console to have as many rows as the box can hold (a row is `cell` pixels), and for xterm.js to draw
 * them: the box is then filled but for less than a row.
 */
async function filled(page: Page, root: string, cell: number) {
  await expect
    .poll(
      async () => {
        const { room, screen } = await measure(page);
        const rows = sizesOf(root).at(-1)?.rows ?? 0;
        const fit = Math.floor(room / cell + 1e-6);
        return rows === fit && Math.abs(screen - rows * cell) < 1 && room - screen < cell
          ? 'filled'
          : `box ${room}px holds ${fit} rows, the pseudo-console has ${rows}, xterm.js draws ${screen}px (a row: ${cell}px)`;
      },
      { timeout: 15_000 },
    )
    .toBe('filled');
}

test('a new agent in the Claude Code view starts at the size of its box, with no resize to wait for', async ({ app }) => {
  const { page } = app;
  // The message that tells the pseudo-console the box's size is slow (a busy window): Claude Code must not depend on it.
  const resizes: string[] = [];
  await page.route(/ipc[.]localhost[/]term_resize/, async (route) => {
    resizes.push(route.request().postData() ?? '');
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => {});
  });
  await addProject(page, app.repo);
  await expect(page.locator('main [data-pastes="images"] .xterm')).toBeVisible({ timeout: 20_000 });

  // Before any resize could get through, its interface already has all the rows of the box.
  const cell = await rowHeight(page, app.root);
  await filled(page, app.root, cell);
  // Started at the right size, there is nothing to correct: no resize at all, and the interface read one size only.
  await page.waitForTimeout(1500);
  expect(resizes).toEqual([]);
  expect(sizesOf(app.root)).toHaveLength(1);
});

test('a window resize reaches the interface of an agent in the Claude Code view, bigger or smaller', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await expect(page.locator('main [data-pastes="images"] .xterm')).toBeVisible({ timeout: 20_000 });
  const cell = await rowHeight(page, app.root);
  await filled(page, app.root, cell);

  /** Sets the window's size, waits for the box to have followed it (its height changed), then for the box to be filled again. */
  const resizeTo = async (width: number, height: number) => {
    const { room } = await measure(page);
    await page.setViewportSize({ width, height });
    await expect.poll(async () => (await measure(page)).room).not.toBe(room);
    await filled(page, app.root, cell);
    return sizesOf(app.root).at(-1)!;
  };

  const { height } = await page.evaluate(() => ({ height: window.innerHeight }));
  const smaller = await resizeTo(1100, height - 200);
  const bigger = await resizeTo(1100, height + 100);
  // Each size reached the interface, which has more rows in the taller window.
  expect(bigger.rows).toBeGreaterThan(smaller.rows);
  expect(sizesOf(app.root).length).toBeGreaterThanOrEqual(3);
});
