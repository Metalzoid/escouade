// The projects' rail (ESC-158, lot 2 of the 2.0 design): a tile per project on the left, as Slack's workspaces, in place
// of the tabs of the title bar. Chosen by a click or Ctrl+1…9, reordered by a drag or Alt+↑/↓ and found again in that
// order after a restart, the active one kept in view and the projects out of view that wait signalled, at 1440 × 900 and
// at CI's 1028 × 779.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

/** A git repository with one commit, named `name`, in the test's folder. */
function repoNamed(root: string, name: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'e2e@test');
  git('config', 'user.name', 'e2e');
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

const tile = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const order = (page: Page) =>
  page
    .getByRole('tablist', { name: 'Projets ouverts' })
    .getByRole('tab')
    .evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label')!.split(',')[0]));
/** The project the title bar names. */
const named = (page: Page) => page.locator('header .proj .name');

for (const size of [
  { width: 1440, height: 900 },
  { width: 1028, height: 779 },
])
  test(`a project is chosen by its tile and by Ctrl+2, reordered, and found in that order after a restart, at ${size.width} × ${size.height}`, async ({
    app,
  }) => {
    let { page } = app;
    await page.setViewportSize(size);
    await addProject(page, app.repo);
    await addProject(page, repoNamed(app.root, 'studio-web'), { firstAgent: false });
    await addProject(page, repoNamed(app.root, 'infra'), { firstAgent: false });
    expect(await order(page)).toEqual(['demo-api', 'studio-web', 'infra']);
    await expect(tile(page, 'infra')).toHaveAttribute('aria-selected', 'true');
    await expect(named(page)).toHaveText('infra');

    // A click, then Ctrl+2.
    await tile(page, 'demo-api').click();
    await expect(tile(page, 'demo-api')).toHaveAttribute('aria-selected', 'true');
    await expect(named(page)).toHaveText('demo-api');
    await page.keyboard.press('Control+2');
    await expect(tile(page, 'studio-web')).toHaveAttribute('aria-selected', 'true');
    await expect(named(page)).toHaveText('studio-web');

    // The rail, the title bar and the status bar where the design puts them.
    const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
    const rail = await box('nav.rail');
    expect([Math.round(rail.x), Math.round(rail.width), Math.round(rail.y)]).toEqual([0, 52, 44]);
    expect(Math.round((await box('header.bar')).height)).toBe(44);
    expect(Math.round((await box('footer.bar')).height)).toBe(30);
    expect(Math.round((await box('aside.side')).width)).toBe(276);
    const tileBox = (await tile(page, 'demo-api').boundingBox())!;
    expect([Math.round(tileBox.width), Math.round(tileBox.height), Math.round(tileBox.x)]).toEqual([36, 36, 8]);

    // Alt+↓ moves the tile that has the focus; a drag puts infra first.
    await tile(page, 'studio-web').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => order(page)).toEqual(['demo-api', 'infra', 'studio-web']);
    await expect(tile(page, 'studio-web')).toBeFocused();
    const first = (await tile(page, 'demo-api').boundingBox())!;
    await tile(page, 'infra').dragTo(tile(page, 'demo-api'), { targetPosition: { x: 18, y: 4 } });
    await expect.poll(() => order(page)).toEqual(['infra', 'demo-api', 'studio-web']);
    expect(first.y).toBeGreaterThan(0);

    // The same order after a restart.
    page = await app.restart();
    await page.setViewportSize(size);
    await expect.poll(() => order(page)).toEqual(['infra', 'demo-api', 'studio-web']);
  });

// demo-api is the fixture's repository; the others are made here. More than the rail shows at 1028 × 779 (twelve fit).
const NAMES = [
  'demo-api',
  'studio-web',
  'facturation',
  'appli-mobile',
  'documentation',
  'infrastructure',
  'design-system',
  'analytique',
  'service-auth',
  'recherche',
  'paiements',
  'catalogue',
  'support',
  'notifications',
];

test('fifteen projects scroll in the rail, the active one kept in view, one out of view that waits signalled', async ({ app }) => {
  test.setTimeout(240_000);
  const { page } = app;
  await page.setViewportSize({ width: 1028, height: 779 });
  const list = page.getByRole('tablist', { name: 'Projets ouverts' });
  const add = page.getByRole('button', { name: 'Ajouter un projet' });
  /** Whether the whole of a tile is in the room of the list. */
  const inView = (name: string) =>
    tile(page, name).evaluate((el) => {
      const room = el.closest('[role="tablist"]')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.top >= room.top - 1 && r.bottom <= room.bottom + 1;
    });

  // Each project added is the one on screen: its tile comes into view, and « + » stays there for the next.
  for (const name of NAMES) {
    await addProject(page, name === 'demo-api' ? app.repo : repoNamed(app.root, name), { firstAgent: name === 'notifications' });
    await expect(tile(page, name)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => inView(name)).toBe(true);
    await expect(add).toBeInViewport({ ratio: 1 });
  }
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 40)).toBe(true);
  expect(await inView('demo-api')).toBe(false);
  await expect(list).toHaveClass(/more-up/);
  // Stats and the settings stay at the bottom, in view.
  await expect(page.getByRole('button', { name: 'Stats' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Réglages (Ctrl+,)' })).toBeInViewport({ ratio: 1 });

  // A shortcut brings the first project, out of view: its tile comes in.
  await page.keyboard.press('Control+1');
  await expect(tile(page, 'demo-api')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => inView('demo-api')).toBe(true);

  // The last project's agent finishes out of sight: a pill below the list says it, and brings it into view.
  await tile(page, 'notifications').click();
  await send(page, 'slow 3s');
  await expect(page.getByText('Je commence…')).toBeVisible();
  await page.keyboard.press('Control+1');
  await expect.poll(() => inView('notifications')).toBe(false);
  await expect(tile(page, 'notifications')).toHaveClass(/alert/, { timeout: 20_000 });
  const more = page.getByRole('button', { name: /^notifications : 1 en attente, plus bas$/ });
  await expect(more).toBeVisible();
  await more.click();
  await expect.poll(() => inView('notifications')).toBe(true);

  // An agent picked in « Vue d’ensemble » brings its project's tile into view.
  await page.keyboard.press('Control+1');
  await page.getByRole('button', { name: 'Vue d’ensemble' }).click();
  await page.locator('main.overview li.row').first().click();
  await expect(tile(page, 'notifications')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => inView('notifications')).toBe(true);
});
