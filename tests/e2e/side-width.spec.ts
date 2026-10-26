// The sidebar of the agents and the Kanban widened by its right edge (ESC-204), as the projects' rail is: its bounds,
// its width kept after a restart, the keyboard, a double click, held to the room a narrow window leaves the work; then
// the side panel closed by its × and opened again as before, beside the classic layout and side by side. In the
// runner's window (its screen is 1024 × 768), where the room counts most, and at 1440 × 900.

import type { Page } from '@playwright/test';
import { addProject, expect, test } from './fixture';

const side = (page: Page) => page.locator('aside.side');
const edge = (page: Page) => page.getByRole('separator', { name: 'Largeur de la barre des agents' });
const railEdge = (page: Page) => page.getByRole('separator', { name: 'Largeur de la barre des projets' });
const width = async (page: Page) => Math.round((await side(page).boundingBox())!.width);

/** Two frames: the container queries of a new width apply. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * What breaks in the sidebar, or around it: the page scrolled sideways, the sidebar over the work, the work under its
 * narrowest, something of the sidebar out of it, « Nouvel agent », a name or the head of Lancement and Terminaux on two
 * lines.
 */
function breaks(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.scrollingElement!;
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`the page scrolls: ${doc.scrollWidth} > ${window.innerWidth}`);
    const aside = document.querySelector('aside.side')!;
    const s = aside.getBoundingClientRect();
    const work = document.querySelector('.work')!.getBoundingClientRect();
    if (s.right > work.left + 1) out.push(`the sidebar over the work: ${s.right} > ${work.left}`);
    if (work.width < 664) out.push(`the work narrower than it was in a window of 1 000 px: ${work.width}`);
    for (const el of aside.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('.edge')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.left < s.left - 1 || r.right > s.right + 1)
        out.push(`${el.tagName.toLowerCase()}.${el.className} out of the sidebar: ${r.left}–${r.right}`);
    }
    const oneLine = (sel: string, max: number) => {
      for (const el of aside.querySelectorAll<HTMLElement>(sel)) {
        const h = el.getBoundingClientRect().height;
        if (h > max) out.push(`« ${el.textContent?.trim()} » on two lines (${h} px)`);
      }
    };
    oneLine('.new-agent', 40);
    // Whole: « Nouvel agent », the titles of Lancement and Terminaux.
    for (const el of aside.querySelectorAll<HTMLElement>('.new-agent .nl, .sec-h .fold'))
      if (el.scrollWidth > el.clientWidth + 1) out.push(`« ${el.textContent?.trim()} » cut: ${el.scrollWidth} > ${el.clientWidth}`);
    oneLine('.sec-h', 40);
    oneLine('.name, .nm', 24);
    return out;
  });
}

/** Drags the edge `e` by `dx` px. */
async function drag(page: Page, dx: number) {
  const e = (await edge(page).boundingBox())!;
  const y = e.y + e.height / 2;
  await page.mouse.move(e.x + e.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(e.x + dx / 2, y, { steps: 4 });
  await page.mouse.move(e.x + dx, y, { steps: 4 });
  await page.mouse.up();
  await settle(page);
}

for (const size of [
  { width: 1024, height: 728 },
  { width: 1440, height: 900 },
])
  test(`the sidebar is widened by its edge, kept, held to the window; the side panel is closed and opened again, at ${size.width} × ${size.height}`, async ({
    app,
  }) => {
    test.setTimeout(150_000);
    let { page } = app;
    await page.setViewportSize(size);
    await addProject(page, app.repo);
    await expect(page.locator('main.conv')).toBeVisible();
    await settle(page);
    // Its usual width, its bounds said to a screen reader.
    expect(await width(page)).toBe(276);
    const widest = Math.min(480, size.width - 52 - 672);
    await expect(edge(page)).toHaveAttribute('aria-valuenow', '276');
    await expect(edge(page)).toHaveAttribute('aria-valuemin', '220');
    await expect(edge(page)).toHaveAttribute('aria-valuemax', String(widest));
    expect(await breaks(page)).toEqual([]);

    // Dragged far to the right: held at its widest, which the window gives.
    await drag(page, 600);
    expect(await width(page)).toBe(widest);
    await expect(edge(page)).toHaveAttribute('aria-valuenow', String(widest));
    expect(await breaks(page)).toEqual([]);

    // Kept after a restart.
    page = await app.restart();
    await page.setViewportSize(size);
    await expect(page.locator('main.conv')).toBeVisible();
    await settle(page);
    expect(await width(page)).toBe(widest);

    // The keyboard: an arrow moves it by 16 px, Home to its narrowest, where nothing breaks.
    await edge(page).focus();
    await page.keyboard.press('ArrowLeft');
    await settle(page);
    expect(await width(page)).toBe(widest - 16);
    await page.keyboard.press('Home');
    await settle(page);
    expect(await width(page)).toBe(220);
    expect(await breaks(page)).toEqual([]);
    // Dragged far to the left: held at its narrowest.
    await page.keyboard.press('End');
    await drag(page, -600);
    expect(await width(page)).toBe(220);

    // In the runner's window, the rail widened too: the sidebar gives way, the work keeps its room.
    if (size.width === 1024) {
      await page.keyboard.press('End');
      await settle(page);
      expect(await width(page)).toBe(300);
      await railEdge(page).focus();
      await page.keyboard.press('End');
      await settle(page);
      const rail = Math.round((await page.getByRole('navigation', { name: 'Projets' }).boundingBox())!.width);
      expect(rail).toBe(76);
      expect(await width(page)).toBe(1024 - rail - 672);
      await expect(edge(page)).toHaveAttribute('aria-valuemax', String(1024 - rail - 672));
      expect(await breaks(page)).toEqual([]);
      await railEdge(page).dblclick();
      await settle(page);
      expect(await width(page)).toBe(300);
    }

    // A double click: its usual width.
    await edge(page).dblclick();
    await settle(page);
    expect(await width(page)).toBe(276);

    // The side panel beside the classic layout: closed by its ×, opened again by Ctrl+Shift+B as its tooltip says.
    const panel = page.locator('aside.git-side');
    const close = panel.getByRole('button', { name: 'Fermer le panneau' });
    await page.keyboard.press('Control+Shift+B');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/docked/);
    await close.hover();
    await expect(page.getByRole('tooltip')).toContainText('Pour le rouvrir : « Fichiers » dans l’en-tête de la conversation');
    await close.click();
    await expect(panel).toBeHidden();
    await page.keyboard.press('Control+Shift+B');
    await expect(panel).toBeVisible();
    // Or by « Fichiers » of the header, which it names.
    await close.click();
    await expect(panel).toBeHidden();
    await page.locator('main.conv header.head .fig.files').evaluate((b: HTMLElement) => b.click());
    await expect(panel).toBeVisible();
    await close.click();

    // Side by side: closed by its ×, back to the classic layout; opened again by the layout's button, kept after a restart.
    await page.keyboard.press('Control+Shift+L');
    await expect(panel).toHaveClass(/docked/);
    await close.click();
    await expect(panel).toBeHidden();
    page = await app.restart();
    await page.setViewportSize(size);
    await expect(page.locator('main.conv')).toBeVisible();
    await expect(page.locator('aside.git-side')).toBeHidden();
    await page
      .locator('main.conv .layout-seg button')
      .nth(1)
      .evaluate((b: HTMLElement) => b.click());
    await expect(page.locator('aside.git-side.docked')).toBeVisible();
    expect(await breaks(page)).toEqual([]);
  });
