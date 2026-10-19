import path from 'node:path';
import { addProject, expect, FAKE, send, test } from './fixture';

// Choosing the harness (ESC-29): Réglages › Harness lists each one with its executable and its version; its accounts sign
// in from Réglages › Comptes (1.8.2). With none found, the first start says « Aucun harness trouvé » with the command that
// installs each.

test('Réglages › Harness shows Claude Code’s executable and version, and sends to Comptes, where its account signs in', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('tab', { name: 'Harness' }).click();
  const claude = settings.getByRole('region', { name: 'Claude Code' });
  await expect(claude.getByRole('textbox', { name: "Chemin de l'exécutable" })).toBeVisible();
  await expect(claude.locator('[data-state]')).toHaveText('2.1.301');
  // The test's Claude Code folder has no sign-in: the version's line says where to sign in, the tab itself does not.
  await expect(claude).toContainText('Aucun compte connecté : ajoute ou connecte un compte de ce harness dans l’onglet Comptes.');
  await expect(settings.getByRole('button', { name: 'Se connecter…' })).toHaveCount(0);
  await settings.getByRole('tab', { name: 'Comptes' }).click();
  await settings.getByRole('listitem', { name: 'Principal' }).getByRole('button', { name: 'Se connecter…' }).click();
  const signIn = page.getByRole('dialog', { name: 'Se connecter au compte « Principal »' });
  await expect(signIn).toBeVisible();
  // Its × (Escape may go to the sign-in's terminal once it has the focus).
  await signIn.getByRole('button', { name: 'Fermer' }).click();
  await expect(signIn).toHaveCount(0);
});

test('« Modèle des textes rédigés » offers Claude Haiku alone with Claude Code alone, and Haiku names a new agent', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('tab', { name: 'Application' }).click();
  const writer = settings.getByRole('group', { name: 'Modèle des textes rédigés' });
  await expect(writer.getByRole('button')).toHaveText(['Claude Haiku']);
  await expect(writer.getByRole('button', { name: 'Claude Haiku' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  // The question goes to Claude Code, as before (the fake CLI answers the naming call).
  await send(page, 'Bonjour');
  await expect(page.locator('.card .name').first()).toHaveText('bonjour-fake');
});

test.describe('with no harness found', () => {
  test.use({ preStart: { run: (root: string) => ({ claudePath: path.join(root, 'absent', 'claude.cmd') }) } });

  test('the first start says « Aucun harness trouvé » with the command that installs each, and goes once one is found', async ({ app }) => {
    const { page } = app;
    const none = page.getByRole('region', { name: 'Aucun harness trouvé' });
    await expect(none).toBeVisible();
    await expect(none.getByRole('listitem').filter({ hasText: 'Claude Code' })).toContainText('irm https://claude.ai/install.ps1 | iex');
    // Réglages › Harness: not found, with its installer.
    await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
    const settings = page.getByRole('dialog', { name: 'Réglages' });
    await settings.getByRole('tab', { name: 'Harness' }).click();
    const claude = settings.getByRole('region', { name: 'Claude Code' });
    await expect(claude.locator('[data-engine-state="absent"]')).toHaveText('Introuvable');
    await expect(claude.getByText('irm https://claude.ai/install.ps1 | iex')).toBeVisible();
    // No harness to write the texts: « Modèle des textes rédigés » is not offered.
    await settings.getByRole('tab', { name: 'Application' }).click();
    await expect(settings.getByRole('heading', { name: 'Langue' })).toBeVisible();
    await expect(settings.getByRole('group', { name: 'Modèle des textes rédigés' })).toHaveCount(0);
    await settings.getByRole('tab', { name: 'Harness' }).click();
    // Its path given and saved: it is found, Escouade works.
    await claude.getByRole('textbox', { name: "Chemin de l'exécutable" }).fill(FAKE);
    await settings.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(none).toHaveCount(0);
  });
});
