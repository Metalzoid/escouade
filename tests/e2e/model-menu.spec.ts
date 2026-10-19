import fs from 'node:fs';
import path from 'node:path';
import { addProject, expect, test } from './fixture';

// The menu of the models of a Claude Code agent whose `claude` lists many (ESC-127): the favorites first, then a group by
// family, each under its heading, the newest first; a star without a background on each model. The fake `claude` of
// Principal (the app's CLAUDE_CONFIG_DIR) lists five more models than its own, and one of no family Escouade knows.

const SIGNED_IN = JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'ref', expiresAt: 4_102_444_800_000 } });

const told = (value: string, resolvedModel: string, displayName: string) => ({ value, resolvedModel, displayName, supportsAutoMode: true });
const MORE = [
  told('claude-opus-5', 'claude-opus-5', 'Opus 5'),
  told('claude-sonnet-4-6', 'claude-sonnet-4-6', 'Sonnet 4.6'),
  told('claude-sonnet-5', 'claude-sonnet-5', 'Sonnet 5'),
  told('mythos', 'claude-mythos-1', 'Mythos'),
  told('labs-preview', 'labs-preview', 'Aperçu du labo'),
];

test.describe('the menu of the models of a Claude Code agent (ESC-127)', () => {
  test.use({
    preStart: {
      run: (root) => {
        const dir = path.join(root, 'claude');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, '.credentials.json'), SIGNED_IN);
        fs.writeFileSync(path.join(dir, 'fake-models.json'), JSON.stringify({ add: MORE }));
      },
    },
  });

  test('groups them by family, searches in the groups, and a favorite added goes up into « Favoris »', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo);
    await page.getByRole('button', { name: /^Modèle/ }).click();
    const menu = page.getByRole('menu', { name: 'Modèle' });
    await expect(menu.getByRole('menuitemradio')).toHaveCount(10, { timeout: 30_000 });
    if (process.env.ESCOUADE_E2E_SHOT) await menu.screenshot({ path: process.env.ESCOUADE_E2E_SHOT });

    // A group by family in a stable order, each under its heading, the newest first; what is of none in « Autres ».
    const titles = menu.locator('[role="group"] > .gtitle');
    await expect(titles).toHaveText(['Fable', 'Opus', 'Sonnet', 'Haiku', 'Mythos', 'Autres']);
    const group = (name: string) => menu.getByRole('group', { name, exact: true }).getByRole('menuitemradio');
    await expect(group('Opus')).toHaveText([/Opus 5\.5/, /Opus 5\s*$/]);
    await expect(group('Sonnet')).toHaveText([/Sonnet 5\.5/, /Sonnet 5\s*$/, /Sonnet 4\.6/]);
    await expect(group('Haiku')).toHaveText([/Haiku 5\.5/, /Haiku 4\.5/]);
    await expect(group('Autres')).toHaveText([/Aperçu du labo/]);

    // The star of a model that is no favorite: no background, no border.
    const star = menu.getByRole('button', { name: 'Ajouter aux favoris : Opus 5', exact: true });
    const look = await star.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, border: s.borderTopStyle, svg: !!el.querySelector('svg') };
    });
    expect(look).toEqual({ background: 'rgba(0, 0, 0, 0)', border: 'none', svg: true });

    // Marked as a favorite: it goes up into « Favoris », first, and leaves its family.
    await star.click();
    await expect(titles.first()).toHaveText('Favoris');
    await expect(group('Favoris')).toHaveText([/Opus 5\s*$/]);
    await expect(group('Opus')).toHaveText([/Opus 5\.5/]);
    if (process.env.ESCOUADE_E2E_SHOT) await menu.screenshot({ path: process.env.ESCOUADE_E2E_SHOT.replace(/\.png$/, '-favori.png') });
    await expect(menu.getByRole('button', { name: 'Retirer des favoris : Opus 5', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // The search filters in the groups, and hides those left empty.
    await menu.getByRole('searchbox', { name: 'Rechercher' }).fill('sonnet');
    await expect(titles).toHaveText(['Sonnet']);
    await expect(group('Sonnet')).toHaveCount(3);
    // The arrows go from model to model (the headings are skipped), Enter picks the one reached.
    await page.keyboard.press('ArrowDown');
    await expect(group('Sonnet').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(group('Sonnet').nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Modèle : Sonnet 5' })).toBeVisible();
  });
});
