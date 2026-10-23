// The agents' sidebar of the 2.0 design (ESC-73, lot 3): Agents | Kanban, « Nouvel agent » and its menu « Harness », the
// cards, Lancement and Terminaux, the folder and the branch, as the preview draws them (design/app-redesign/index.html),
// read in both themes at 1440 × 900 and at CI's 1028 × 779; a question answered from the list; the English labels in
// their room; the motion stopped by prefers-reduced-motion. The captures of the app and of the preview go to
// ESCOUADE_E2E_SHOTS when it is set, to be looked at side by side.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Locator, type Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PREVIEW = path.join(ROOT, 'design', 'app-redesign', 'index.html');
/** The preview loads Inter from the site's packages: without them, its text is not the app's. */
const PREVIEW_FONT = path.join(ROOT, 'website', 'node_modules', '@fontsource-variable', 'inter', 'opsz.css');
const SHOTS = process.env.ESCOUADE_E2E_SHOTS;
const SIZES = [
  { width: 1440, height: 900, name: '' },
  { width: 1028, height: 779, name: '-small' },
];
/** The colour both are tinted with: the preview's first project's, the app's first project's. */
const TINT = 'oklch(0.72 0.12 48)';

/** The look of an element, as the browser computes it: what the app and the preview must share. */
function look(el: Locator) {
  return el.evaluate((node) => {
    const s = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      background: s.backgroundColor,
      color: s.color,
      shadow: s.boxShadow,
      radius: s.borderRadius,
      padding: s.padding,
      font: `${s.fontWeight} ${s.fontSize} ${s.fontFamily.split(',')[0]}`,
    };
  });
}

/** Its look without some of its keys: what differs by content (a width, a height). */
const lookBut = (el: Locator, ...keys: string[]) =>
  look(el).then((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !keys.includes(k))));

/** Where an element is, rounded. */
const place = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  });

/** Tints a page with `TINT` at once, nothing gliding nor breathing, for both to be read alike. */
const still = (page: Page) =>
  page.evaluate((p) => {
    if (!document.getElementById('still')) {
      const style = document.createElement('style');
      style.id = 'still';
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.append(style);
    }
    document.documentElement.style.setProperty('--p', p);
  }, TINT);

/** The theme of the app, set as « Thème » would (its effect without its dialog). */
const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }, t);

test('the sidebar looks as the preview draws it, in both themes, at both sizes', async ({ app }) => {
  const exe = chromium.executablePath();
  test.skip(
    !fs.existsSync(exe) || !fs.existsSync(PREVIEW_FONT),
    'the preview needs Playwright’s Chromium and the site’s packages (website/npm ci)',
  );
  const { page } = app;
  await addProject(page, app.repo);
  const side = page.locator('aside.side');
  await expect(side.locator('.agent')).toHaveCount(1);
  const browser = await chromium.launch();
  const preview = await browser.newPage();
  try {
    for (const t of ['dark', 'light'] as const)
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await preview.setViewportSize(size);
        await preview.goto(`${pathToFileURL(PREVIEW).href}?theme=${t}`);
        await preview.evaluate(() => document.fonts.ready);
        await theme(page, t);
        await still(page);
        await still(preview);
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(size.width / 2, size.height / 2);
        await preview.mouse.move(size.width / 2, size.height / 2);
        const where = `${t} ${size.width}×${size.height}`;
        const ps = preview.locator('aside.sidebar');

        // Agents | Kanban: the segments, the one shown, their places.
        expect.soft(await place(side.locator('.seg')), `segments' place, ${where}`).toEqual(await place(ps.locator('.seg')));
        expect.soft(await look(side.locator('.seg')), `segments, ${where}`).toEqual(await look(ps.locator('.seg')));
        expect
          .soft(await lookBut(side.locator('.seg button[aria-pressed="true"]'), 'width'), `Agents, ${where}`)
          .toEqual(await lookBut(ps.locator('.seg button[aria-selected="true"]'), 'width'));

        // « Nouvel agent Ctrl N » and the arrow of its menu « Harness ».
        expect.soft(await place(side.locator('.new-agent')), `new agent's place, ${where}`).toEqual(await place(ps.locator('.new-agent')));
        expect.soft(await look(side.locator('.new-agent')), `new agent, ${where}`).toEqual(await look(ps.locator('.new-agent')));
        expect.soft(await look(side.locator('.new-agent kbd')), `its key, ${where}`).toEqual(await look(ps.locator('.new-agent kbd')));
        expect.soft(await place(side.locator('.new-more')), `its arrow, ${where}`).toEqual(await place(ps.locator('#new-more')));

        // A card: the agent never written to, as « fix-login »; the one open in relief, as « pagination-users ».
        const card = side.locator('.agent').first();
        const idle = ps.locator('.agent.idle').last();
        for (const part of ['.a-top', '.a-meta'])
          expect
            .soft(await lookBut(card.locator(part), 'width'), `card ${part}, ${where}`)
            .toEqual(await lookBut(idle.locator(part), 'width'));
        expect
          .soft(await lookBut(card.locator('.name'), 'width'), `card's name, ${where}`)
          .toEqual(await lookBut(idle.locator('.a-name'), 'width'));
        expect
          .soft(await lookBut(card.locator('.a-state'), 'width'), `card's state, ${where}`)
          .toEqual(await lookBut(idle.locator('.a-state'), 'width'));
        expect.soft(await look(card.locator('.state-dot')), `card's dot, ${where}`).toEqual(await look(idle.locator('.state-dot')));
        expect.soft(await lookBut(card, 'height'), `the card open, ${where}`).toEqual(await lookBut(ps.locator('#ag-pag'), 'height'));
        expect
          .soft((await place(card)).slice(0, 3), `the card's place, ${where}`)
          .toEqual((await place(ps.locator('#ask-agent'))).slice(0, 3));

        // Lancement, Terminaux, the folder and the branch at the bottom: the headers fold in the short window.
        expect.soft(await place(side.locator('.side-foot')), `footer's place, ${where}`).toEqual(await place(ps.locator('.side-foot')));
        expect
          .soft(await lookBut(side.locator('.side-foot .foot-row').first(), 'width'), `folder, ${where}`)
          .toEqual(await lookBut(ps.locator('.side-foot .foot-row').first(), 'width'));
        for (const [name, sel] of [
          ['Lancement', '.runs'],
          ['Terminaux', '.terms'],
        ]) {
          const a = side.locator(`${sel} .sec-h`);
          const p = ps.locator(`section[aria-label="${name}"] .sec-h`);
          expect.soft(await lookBut(a, 'width'), `${name}'s header, ${where}`).toEqual(await lookBut(p, 'width'));
          if (size.height < 820) expect.soft(await place(a), `${name}'s place, ${where}`).toEqual(await place(p));
        }
        if (size.height < 820) {
          await expect(side.locator('.runs .rows')).toBeHidden();
          await expect(side.locator('.terms .rows')).toBeHidden();
        } else {
          await expect(side.locator('.runs .rows')).toBeVisible();
        }

        if (SHOTS) {
          fs.mkdirSync(SHOTS, { recursive: true });
          const n = `sidebar${size.name}${t === 'light' ? '-light' : ''}`;
          await page.screenshot({ path: path.join(SHOTS, `${n}.app.png`) });
          await preview.screenshot({ path: path.join(SHOTS, `${n}.preview.png`) });
        }
      }
  } finally {
    await browser.close();
  }
});

test('the menu « Harness » opens on Ctrl+Shift+N, as the preview draws it, and makes the agent of its number', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const side = page.locator('aside.side');
  await expect(side.locator('.agent')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+N');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Harness', { exact: true })).toBeVisible();
  const claude = menu.getByRole('menuitemradio', { name: /Claude Code/ });
  await expect(claude).toHaveAttribute('aria-checked', 'true');
  await expect(claude).toContainText('Celui du projet');
  await expect(claude.locator('kbd')).toHaveText('1');
  await expect(menu.getByRole('menuitem', { name: /Nouvel agent dans un worktree/ })).toBeVisible();
  // Under « Worktree », the agent of a worktree that starts from another branch (ESC-160), with its icon.
  const from = menu.getByRole('menuitem', { name: 'Nouvel agent depuis une autre branche…' });
  await expect(from.locator('[data-icon="merge"]')).toHaveCount(1);
  const tops = await menu.locator('[role^="menuitem"]').evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
  expect(tops.findIndex((x) => x.startsWith('Nouvel agent depuis'))).toBe(
    tops.findIndex((x) => x.startsWith('Nouvel agent sur une branche')) + 1,
  );
  await expect(menu.getByRole('menuitem', { name: /Harness par défaut du projet/ })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'new-agent.app.png') });
  await page.keyboard.press('1');
  await expect(menu).toBeHidden();
  await expect(side.locator('.agent')).toHaveCount(2);
});

test('a question is answered from the list, the conversation open staying where it is', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const side = page.locator('aside.side');
  await send(page, 'question');
  const asking = side.locator('.agent.waiting');
  await expect(asking).toContainText('Quelle base de données ?');
  const asker = await asking.getAttribute('data-agent');
  // Another agent, open: the one asking stays first, its choices on its card.
  await page.keyboard.press('Control+N');
  await expect(side.locator('.agent')).toHaveCount(2);
  await expect(side.locator('.agent').first()).toHaveClass(/waiting/);
  const open = await side.locator('.agent[aria-current="true"]').getAttribute('data-agent');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'waiting.app.png') });
  await asking.getByRole('button', { name: '2 SQLite' }).click();
  await expect(side.locator('.agent.waiting')).toHaveCount(0);
  expect(await side.locator('.agent[aria-current="true"]').getAttribute('data-agent')).toBe(open);
  // The answer reached the agent, which went on.
  await side.locator(`.agent[data-agent="${asker}"]`).click();
  await expect(page.getByText('Choix retenu : SQLite')).toBeVisible();
});

test('the ring of the agent that asks stops with prefers-reduced-motion', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, 'question');
  const dot = page.locator('aside.side .agent.waiting .state-dot');
  await expect(dot).toBeVisible();
  const ring = () => dot.evaluate((el) => getComputedStyle(el, '::after').animationName);
  expect(await ring()).toMatch(/ring/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await ring()).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test.describe('in English', () => {
  test.use({ language: 'en' });

  test('the labels of the sidebar fit in their place at 1028 × 779, its menu « Harness » open', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo, { lang: 'en' });
    await page.setViewportSize({ width: 1028, height: 779 });
    const side = page.locator('aside.side');
    await expect(side.locator('.new-agent')).toContainText('New agent');
    await expect(side.locator('.runs .sec-h')).toContainText('Launch');
    await expect(side.locator('.terms .sec-h')).toContainText('Terminals');
    await side.locator('.new-more').click();
    await expect(page.getByRole('menu')).toBeVisible();
    // What is cut short, or overflows its box: none of it.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('aside.side *, [role="menu"] *')]
        .filter(
          (el) =>
            el.offsetParent &&
            el.children.length === 0 &&
            !el.closest('.mono, .name, .model') &&
            (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
        )
        .map((el) => `${el.tagName.toLowerCase()}.${el.className} « ${el.textContent?.trim().slice(0, 40)} »`),
    );
    expect(cut).toEqual([]);
    const box = (await page.getByRole('menu').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1028);
    expect(box.y + box.height).toBeLessThanOrEqual(779);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'new-agent-small-en.app.png') });
  });
});
