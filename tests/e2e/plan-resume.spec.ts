// ESC-277, « Approuver le plan » resumes in the mode the agent was in before Plan, never in « Demander » by default:
// with the fake claude, an agent in Auto put in Plan from the message field's menu proposes a plan, its card says
// « Approuver le plan · Auto », and once approved the message field's mode is Auto again, without a reload (the fake goes
// out of Plan in the mode its answer's `setMode` says, else in `default`, as Claude Code does). The captures of the card,
// dark and light, go to ESCOUADE_E2E_SHOTS when it is set.

import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;

/** The theme of the app, set as « Thème » would (its effect without its dialog). */
const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }, t);

test('an approved plan resumes in Auto, the mode before Plan, and the message field follows', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  const mode = page.getByRole('button', { name: /^Mode/ });
  await expect(mode).toContainText('Auto');
  await mode.click();
  await page.getByRole('menuitemradio', { name: /^Plan/ }).click();
  await expect(mode).toContainText('Plan');

  await send(page, 'exit plan');
  const card = page.getByTestId('permission-pending');
  await expect(card).toContainText('Claude propose un plan');
  const approve = card.getByRole('button', { name: /^Approuver le plan · Auto/ });
  await expect(approve).toBeVisible();
  await card.locator('.then').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Le travail reprendra en mode Auto');
  // « Approuver et accepter les édits » keeps its words.
  await expect(card.getByRole('button', { name: /^Approuver et accepter les édits/ })).toBeVisible();
  if (SHOTS) {
    for (const t of ['dark', 'light'] as const) {
      await theme(page, t);
      await card.screenshot({ path: path.join(SHOTS, `plan-card-${t}.png`) });
    }
    await theme(page, 'dark');
  }

  await approve.click();
  await expect(page.getByText('Plan approuvé.')).toBeVisible();
  await expect(mode).toContainText('Auto');
  await expect(mode).not.toContainText('Demander');
  if (SHOTS) {
    for (const t of ['dark', 'light'] as const) {
      await theme(page, t);
      await page.locator('main.conv').screenshot({ path: path.join(SHOTS, `plan-approved-${t}.png`) });
    }
  }
});
