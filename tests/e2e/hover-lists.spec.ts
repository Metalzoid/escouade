// The lists that follow the mouse hold still under it (ESC-188): a row half cut at the bottom of the list, hovered, does
// not scroll the list (Chromium then sends a mousemove of its own, the pointer still, which made the next row the
// active one, which scrolled again: the list blinked), and the line that describes the active row keeps its height.
// In the runner's window (1024 × 728).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Locator, Page } from '@playwright/test';
import { addProject, expect, test } from './fixture';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Waits for what moves on the page to be done (the picker opening). */
const settled = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))),
  );

/** Scrolls `list` so that a row below its first screen is cut in half at its bottom, then puts the pointer on its visible half. */
async function hoverHalfCut(page: Page, list: Locator) {
  await settled(page);
  const id = await list.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const offset = (row: HTMLElement) => row.getBoundingClientRect().top - box.top + el.scrollTop;
    const row = [...el.querySelectorAll<HTMLElement>('[role="option"]')].find((r) => offset(r) > el.clientHeight + 40)!;
    el.scrollTop = offset(row) + row.offsetHeight / 2 - el.clientHeight;
    return row.id;
  });
  // Whatever the scroll set off has settled before the pointer comes.
  await settled(page);
  await page.waitForTimeout(300);
  const at = await list.evaluate((el, id) => {
    const box = el.getBoundingClientRect();
    const r = el.querySelector(`#${id}`)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: (r.top + box.bottom) / 2, cut: r.bottom - box.bottom, before: el.scrollTop };
  }, id);
  // Cut indeed: part of it below the list's bottom.
  expect(at.cut).toBeGreaterThan(5);
  await page.mouse.move(at.x, at.y);
  return { ...at, id };
}

/** What the list does for a while, the pointer still: its scroll and its active row, read every 50 ms. */
async function watch(list: Locator, ms = 1500) {
  return list.evaluate(async (el, ms) => {
    const seen: { top: number; active: string | undefined }[] = [];
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50)))
      seen.push({ top: el.scrollTop, active: el.querySelector('[aria-selected="true"]')?.id });
    return seen;
  }, ms);
}

test('the branch picker holds still under the mouse: no scroll on hover, and a description of one height (ESC-188)', async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 1024, height: 728 });
  // Enough branches to scroll, with long names: half of them have lost their remote branch, one remote branch tracks
  // none. Their descriptions go from nothing to three lines.
  const bare = `${app.repo}-remote.git`;
  git(app.repo, 'init', '-q', '--bare', '-b', 'main', bare);
  git(app.repo, 'remote', 'add', 'origin', bare);
  git(app.repo, 'push', '-qu', 'origin', 'main');
  const names = Array.from(
    { length: 24 },
    (_, i) => `feature/esc-188-une-branche-au-nom-vraiment-assez-long-pour-deux-lignes-${String(i).padStart(2, '0')}`,
  );
  for (const n of names) git(app.repo, 'branch', '-q', n);
  git(app.repo, 'push', '-qu', 'origin', ...names);
  git(app.repo, 'push', '-q', 'origin', '--delete', ...names.filter((_, i) => i % 2));
  git(app.repo, 'push', '-q', 'origin', 'main:orphan');
  git(app.repo, 'fetch', '-q', '--prune');
  await addProject(page, app.repo);

  await page.locator('footer .sync').click();
  const picker = page.getByRole('dialog', { name: 'Branches' });
  const list = picker.getByRole('listbox');
  await expect(list.getByRole('option')).toHaveCount(1 + 24 + 1 + 12 + 1);
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true);
  // A long name in a tag (« suivie par … ») is cut short: no scroll bar across the bottom of the list.
  expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

  // A row cut at the bottom, hovered: it is the active one, and nothing moves while the pointer stays.
  const at = await hoverHalfCut(page, list);
  const seen = await watch(list);
  expect(seen.map((s) => s.top)).toEqual(seen.map(() => at.before));
  expect(seen.map((s) => s.active)).toEqual(seen.map(() => at.id));

  // From one row to the next, the description changes and its line keeps its height: the list does not move.
  const note = picker.locator('.note');
  const sizes: { note: number; list: string; said: string }[] = [];
  for (const name of [names[3], names[4], 'origin/orphan', 'main', `origin/${names[4]}`]) {
    const row = list.getByRole('option', { name: new RegExp(`^${name.replace(/[/.]/g, '\\$&')}`) });
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(100);
    await row.hover();
    await expect(row).toHaveAttribute('aria-selected', 'true');
    const box = (await list.boundingBox())!;
    sizes.push({
      note: (await note.boundingBox())!.height,
      list: `${box.y},${box.height}`,
      said: (await picker.locator('#branch-description').textContent()) ?? '',
    });
  }
  // Nothing, one line, more than two: the line shows them in the same room.
  expect(new Set(sizes.map((s) => s.said)).size).toBe(sizes.length);
  expect(sizes.map((s) => s.note)).toEqual(sizes.map(() => sizes[0].note));
  expect(sizes.map((s) => s.list)).toEqual(sizes.map(() => sizes[0].list));

  // The keyboard still brings the cursor into view: up from the first row, to the last one, at the bottom.
  await page.mouse.move(0, 0);
  // A search typed then wiped puts the cursor back on the first row.
  await picker.getByRole('combobox').fill('f');
  await picker.getByRole('combobox').fill('');
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await list.evaluate((el) => (el.scrollTop = 0));
  await picker.getByRole('combobox').press('ArrowUp');
  const last = list.getByRole('option').last();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(last).toBeInViewport();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
});

test('« Ouvrir un fichier » holds still under the mouse too (ESC-188)', async ({ app }) => {
  const { page } = app;
  await page.setViewportSize({ width: 1024, height: 728 });
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(app.repo, `fichier-${String(i).padStart(2, '0')}.txt`), `${i}\n`);
  git(app.repo, 'add', '.');
  git(app.repo, 'commit', '-qm', 'files');
  await addProject(page, app.repo);

  await page.keyboard.press('Control+P');
  const dialog = page.getByRole('dialog', { name: 'Ouvrir un fichier' });
  const list = dialog.getByRole('listbox');
  await expect(list.getByRole('option').nth(40)).toBeAttached();
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 100)).toBe(true);

  const at = await hoverHalfCut(page, list);
  const seen = await watch(list);
  expect(seen.map((s) => s.top)).toEqual(seen.map(() => at.before));
  expect(seen.map((s) => s.active)).toEqual(seen.map(() => at.id));
});
