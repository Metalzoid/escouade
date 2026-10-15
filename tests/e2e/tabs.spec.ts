import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

// demo-api is the fixture's repository; the others are made here.
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
];

test('ten projects scroll in the bar of their tabs, with « + », the fades and the window’s handle in view', async ({ app }) => {
  test.setTimeout(180_000);
  const { page } = app;
  // The window of the CI runners, close to the narrowest the app allows.
  await page.setViewportSize({ width: 1028, height: 779 });
  const strip = page.locator('header .scroller');
  const tab = (name: string) => strip.getByRole('button', { name: new RegExp(`^${name}`) });
  const add = page.getByRole('button', { name: 'Ajouter un projet' });
  // Whether the whole of a tab is in the room of the strip.
  const inView = (name: string) =>
    tab(name).evaluate((el) => {
      const room = el.closest('.scroller')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.left >= room.left - 1 && r.right <= room.right + 1;
    });
  const scrolled = () => strip.evaluate((el) => el.scrollLeft);
  const fade = (side: 'left' | 'right') => page.locator(`header .fade.${side}`);

  // Each project added is the one on screen: its tab comes into view, and « + » stays there for the next.
  for (const name of NAMES) {
    await addProject(page, name === 'demo-api' ? app.repo : repoNamed(app.root, name), { firstAgent: name === 'recherche' });
    await expect(tab(name)).toHaveClass(/active/);
    await expect.poll(() => inView(name)).toBe(true);
    await expect(add).toBeInViewport({ ratio: 1 });
  }
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 100)).toBe(true);
  expect(await inView('demo-api')).toBe(false);
  await expect(fade('left')).toBeVisible();
  await expect(fade('right')).toHaveCount(0);

  // A middle click on a tab opens its project's menu, as with fewer tabs: it does not start the browser's autoscroll
  // in the strip, which would scroll it as the mouse moves.
  const before = await scrolled();
  const middle = (await tab('recherche').boundingBox())!;
  await page.mouse.click(middle.x + middle.width / 2, middle.y + middle.height / 2, { button: 'middle' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.mouse.move(middle.x - 300, middle.y + 200, { steps: 5 });
  await page.mouse.move(20, 400, { steps: 5 });
  await page.waitForTimeout(300);
  expect(await scrolled()).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();

  // « + » is out of the strip, at its right; the window's handle is at the right of « + », as wide as before at least.
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const room = await box('header .scroller');
  const plus = (await add.boundingBox())!;
  const handle = await box('header .spacer');
  expect(plus.x).toBeGreaterThanOrEqual(room.x + room.width - 1);
  expect(handle.x).toBeGreaterThanOrEqual(plus.x + plus.width - 1);
  expect(handle.width).toBeGreaterThanOrEqual(24);
  await expect(page.locator('header .spacer')).toHaveAttribute('data-tauri-drag-region', '');

  // The window widened, then narrowed again: the tab on screen stays in view. Each size is drawn, as when the window is
  // resized by hand (two sizes set within one frame would leave the strip's size unchanged for its ResizeObserver).
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.setViewportSize({ width: 1300, height: 779 });
  await expect.poll(() => inView('recherche')).toBe(true);
  await frame();
  await page.setViewportSize({ width: 1028, height: 779 });
  await expect.poll(() => inView('recherche')).toBe(true);

  // The wheel scrolls the strip sideways, back toward the first tabs.
  const end = await scrolled();
  await tab('recherche').hover();
  await page.mouse.wheel(0, -200);
  await expect.poll(scrolled).toBeLessThan(end - 100);
  await expect(fade('right')).toBeVisible();
  // The thin scroll bar shows with the pointer over the tabs.
  await expect(page.locator('header .thumb')).toHaveCSS('opacity', '1');

  // A shortcut brings the first project, out of view: its tab comes in, the strip at its start.
  await page.keyboard.press('Control+1');
  await expect(tab('demo-api')).toHaveClass(/active/);
  await expect.poll(() => inView('demo-api')).toBe(true);
  await expect.poll(scrolled).toBe(0);
  await expect(fade('left')).toHaveCount(0);

  // The thin scroll bar lies on the very bottom of the tabs: a click just above it still picks the tab under it.
  await tab('demo-api').hover();
  await page.mouse.wheel(0, 250);
  await expect.poll(scrolled).toBeGreaterThan(200);
  const thumb = (await page.locator('header .thumb').boundingBox())!;
  const x = thumb.x + thumb.width / 2;
  const bottom = room.y + room.height;
  const under = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('.tab')?.querySelector('.name')?.textContent ?? null,
    [x, bottom - 15],
  );
  expect(under).not.toBeNull();
  expect(under).not.toBe('demo-api');
  await page.mouse.click(x, bottom - 6);
  await expect(tab(under!)).toHaveClass(/active/);

  // An agent picked in « Vue d’ensemble » brings its project's tab into view.
  await page.getByRole('button', { name: 'Vue d’ensemble' }).click();
  await page.locator('main.overview li.row').first().click();
  await expect(tab('recherche')).toHaveClass(/active/);
  await expect.poll(() => inView('recherche')).toBe(true);

  // Its agent finishes out of sight, while the first project is on screen: its tab, out of view, blinks in the fade.
  await send(page, 'slow 3s');
  await expect(page.getByText('Je commence…')).toBeVisible();
  await page.keyboard.press('Control+1');
  await expect.poll(() => inView('recherche')).toBe(false);
  await expect(tab('recherche')).toHaveClass(/alert/, { timeout: 20_000 });
  await expect(fade('right')).toHaveClass(/alert/);
  expect(await fade('right').evaluate((el) => el.style.getPropertyValue('--alert'))).toBe('var(--ok)');

  // A tab dragged to the right edge of the strip scrolls it, and is dropped among the tabs that came into view.
  const first = (await tab('demo-api').boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 20, first.y + first.height / 2, { steps: 4 });
  await page.mouse.move(room.x + room.width - 6, first.y + first.height / 2, { steps: 10 });
  // Held still near the edge, it goes on scrolling, past the tabs that were in view.
  await expect.poll(scrolled).toBeGreaterThan(400);
  const drop = { x: room.x + room.width / 2, y: first.y + first.height / 2 };
  await page.mouse.move(drop.x, drop.y, { steps: 4 });
  const target = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.tab')?.querySelector('.name')?.textContent ?? null,
    drop,
  );
  expect(NAMES.indexOf(target!)).toBeGreaterThanOrEqual(4);
  await page.mouse.up();
  // Dropped next to the tab it was over, which was out of view before the strip scrolled.
  const order = () => strip.locator('.tab .name').allTextContents();
  await expect.poll(async () => Math.abs((await order()).indexOf('demo-api') - (await order()).indexOf(target!))).toBe(1);
  expect((await order())[0]).not.toBe('demo-api');
});
