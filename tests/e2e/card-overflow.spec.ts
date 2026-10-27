// The card of an agent held to the sidebar at any of its widths (ESC-249): a question with a very long choice, a long
// name and a long branch, at 220 px and at its usual width in the runner's window (1024 × 728) and up to 480 px in a
// wide one; then its other requests (a permission with a long summary, a question with several answers, a plan) and
// the cards of a subagent and of a background task, in both themes. Nothing of a card past the sidebar, its status
// seen, its name and branch cut with « … », its question and its long choice on more lines. The captures go to
// ESCOUADE_E2E_SHOTS when it is set.

import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;
const LONG = 'checkout-sdk-surcharge-avec-la-bascule-sandbox';

const side = (page: Page) => page.locator('aside.side');
const edge = (page: Page) => page.getByRole('separator', { name: 'Largeur de la barre des agents' });
const width = async (page: Page) => Math.round((await side(page).boundingBox())!.width);
/** Two frames: the container queries of a new width apply. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** The theme of the app, set as « Thème » would (its effect without its dialog). */
const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }, t);

/** The sidebar at its narrowest (Home), its usual width (a double click on its edge) or its widest (End). */
async function sideAt(page: Page, at: 'narrowest' | 'usual' | 'widest') {
  if (at === 'usual') await edge(page).dblclick();
  else {
    await edge(page).focus();
    await page.keyboard.press(at === 'widest' ? 'End' : 'Home');
  }
  await page.mouse.move(600, 700);
  await settle(page);
}

/**
 * What goes past its card or past the sidebar: a card or the list scrolled sideways, an element of a card out of it,
 * an element of the list out of the sidebar, a status hidden.
 */
function overflows(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const aside = document.querySelector('aside.side')!;
    const s = aside.getBoundingClientRect();
    const list = aside.querySelector<HTMLElement>('.agents')!;
    if (list.scrollWidth > list.clientWidth + 1) out.push(`the list scrolls sideways: ${list.scrollWidth} > ${list.clientWidth}`);
    for (const el of list.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('.sr')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const what = `${el.tagName.toLowerCase()}.${el.className} « ${el.textContent?.trim().slice(0, 30)} »`;
      if (r.left < s.left - 1 || r.right > s.right + 1) out.push(`${what} out of the sidebar: ${r.left}–${r.right}`);
      const card = el.parentElement?.closest<HTMLElement>('.agent');
      if (!card) continue;
      const c = card.getBoundingClientRect();
      if (r.left < c.left - 1 || r.right > c.right + 1) out.push(`${what} out of its card: ${r.left}–${r.right} (${c.left}–${c.right})`);
    }
    for (const card of list.querySelectorAll<HTMLElement>('.agent')) {
      if (card.scrollWidth > card.clientWidth + 1) out.push(`a card scrolls sideways: ${card.scrollWidth} > ${card.clientWidth}`);
      const st = card.querySelector<HTMLElement>('.a-state');
      if (!st) continue;
      const r = st.getBoundingClientRect();
      if (r.width < 20 || st.scrollWidth > st.clientWidth + 1) out.push(`the status « ${st.textContent} » hidden: ${r.width} px`);
    }
    return out;
  });
}

/** Cut with « … »: wider than its box, its text ending on an ellipsis. */
const cut = (el: Locator) =>
  el.evaluate((n) => ({ ellipsis: getComputedStyle(n).textOverflow === 'ellipsis', cut: n.scrollWidth > n.clientWidth }));

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await side(page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test('a question with a very long choice holds in its card, at 220 px and at the usual width, in the runner’s window', async ({ app }) => {
  test.setTimeout(150_000);
  const { page } = app;
  await page.setViewportSize({ width: 1024, height: 728 });
  await addProject(page, app.repo, { worktrees: true });
  const card = side(page).locator('.agent').first();
  await expect(card.locator('.bn')).toHaveText('agent-1', { timeout: 60_000 });
  // A long name, and with it a long branch (ESC-155: the rename renames its branch).
  await card.locator('.name').dblclick();
  await card.locator('.rename').fill(LONG);
  await card.locator('.rename').press('Enter');
  await expect(card.locator('.bn')).toContainText('checkout-sdk-surcharge', { timeout: 45_000 });
  await send(page, 'questions longues');
  await expect(card).toContainText('Question 1 sur 4', { timeout: 30_000 });
  const usual = await width(page);
  expect(usual).toBe(276);
  const long = card.locator('.opt', { hasText: 'Simulé + bascule sandbox' });
  // Read whole by a screen reader: its number and its words.
  await expect(long).toHaveAccessibleName(
    /^1 Simulé \+ bascule sandbox \(Recommandé\), par une variable d’environnement lue au démarrage$/,
  );

  for (const t of ['dark', 'light'] as const)
    for (const at of ['narrowest', 'usual', 'widest'] as const) {
      await sideAt(page, at);
      await theme(page, t);
      await settle(page);
      expect(await width(page)).toBe({ narrowest: 220, usual, widest: 300 }[at]);
      const where = `${t}, sidebar at ${await width(page)} px`;
      expect.soft(await overflows(page), where).toEqual([]);
      await expect.soft(card.locator('.a-state'), where).toHaveText('Question');
      // The name and the branch cut with « … », the question and the long choice on more lines, read whole.
      expect.soft(await cut(card.locator('.name')), `its name, ${where}`).toEqual({ ellipsis: true, cut: true });
      expect.soft((await cut(card.locator('.bn'))).ellipsis, `its branch, ${where}`).toBe(true);
      const q = await card
        .locator('.a-ask > p')
        .last()
        .evaluate((n) => n.getBoundingClientRect().height);
      expect.soft(q, `the question on more lines, ${where}`).toBeGreaterThan(30);
      const choice = await long.evaluate((n) => {
        const r = n.getBoundingClientRect();
        const k = n.querySelector('kbd')!.getBoundingClientRect();
        return { cut: n.scrollWidth > n.clientWidth + 1, height: r.height, kbdTop: Math.round(k.top - r.top) };
      });
      expect.soft(choice.cut, `the long choice whole, ${where}`).toBe(false);
      expect.soft(choice.height, `the long choice on more lines, ${where}`).toBeGreaterThan(30);
      // Its number on its first line, as on a short choice.
      const short = await card
        .locator('.opt', { hasText: 'Autre' })
        .evaluate((n) => Math.round(n.querySelector('kbd')!.getBoundingClientRect().top - n.getBoundingClientRect().top));
      expect.soft(choice.kbdTop, `its number on its first line, ${where}`).toBe(short);
      await shot(page, `question-${t}-${await width(page)}`);
    }

  // Still answered from the list: the long choice by its key.
  await theme(page, 'dark');
  await card.focus();
  await page.waitForTimeout(600);
  await page.keyboard.press('1');
  await expect(card).toContainText('Question 2 sur 4');
});

test('the other requests, the subagents and the background tasks hold in their cards, from 220 to 480 px, in both themes', async ({
  app,
}) => {
  test.setTimeout(180_000);
  const { page } = app;
  await page.setViewportSize({ width: 1440, height: 900 });
  await addProject(page, app.repo);
  const cards = side(page).locator('.agent');
  const asks = ['permission longue', 'question multiple', 'exit plan', 'sous-agent long', 'commande de fond 600s'];
  const open = side(page).locator('.agent[aria-current="true"]');
  for (const [i, text] of asks.entries()) {
    if (i) {
      await page.keyboard.press('Control+N');
      await expect(cards).toHaveCount(i + 1);
      await expect(open).toContainText('Aucun message');
    }
    await send(page, text);
    // Its message taken before the next agent is made.
    await expect(open).not.toContainText('Aucun message', { timeout: 30_000 });
  }
  // The permission answered from here, the question and the plan in their conversation.
  await expect(cards.filter({ hasText: 'npx playwright test' }).locator('.opt')).toHaveCount(2, { timeout: 30_000 });
  for (const asked of ['Quels environnements', 'ExitPlanMode'])
    await expect(cards.filter({ hasText: asked }).locator('.in-conv')).toBeVisible({ timeout: 30_000 });
  await expect(side(page).locator('[data-sub-chip]')).toHaveCount(1, { timeout: 30_000 });
  await expect(side(page).locator('.subl .sub[data-kind]')).not.toHaveCount(0, { timeout: 30_000 });

  for (const t of ['dark', 'light'] as const)
    for (const at of ['narrowest', 'usual', 'widest'] as const) {
      await sideAt(page, at);
      await theme(page, t);
      await settle(page);
      const w = await width(page);
      expect(w).toBe({ narrowest: 220, usual: 276, widest: 480 }[at]);
      expect.soft(await overflows(page), `${t}, sidebar at ${w} px`).toEqual([]);
      await shot(page, `requests-${t}-${w}`);
      // The cards of the subagent and of the background task, at the end of the list.
      await side(page)
        .locator('.agents')
        .evaluate((n) => n.scrollTo(0, n.scrollHeight));
      await settle(page);
      await shot(page, `requests-${t}-${w}-end`);
      await side(page)
        .locator('.agents')
        .evaluate((n) => n.scrollTo(0, 0));
    }
});
