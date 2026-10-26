// The shared Kanban (ESC-190), by two users of Escouade on the same repository: two data folders, one after the other.
// Alice shares a ticket: its file is in the project's folder, never committed by Escouade. Bob opens the same folder: the
// ticket is in his « À faire » with her name, his autopilot leaves it, he launches it by hand; his file says so, and Alice,
// started again, finds it under way, taken by Bob. In the runner's window (1024 × 728).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, test } from './fixture';

const ALICE = { userName: 'Alice Martin', userId: 'a91f03c2', nameAsked: true };
const BOB = { userName: 'Bob Durand', userId: '5d0e77b1', nameAsked: true };

test.use({ preStart: { run: () => ALICE } });

/** The shared tickets' files of the repository: name → text. */
function files(repo: string): Record<string, string> {
  const dir = path.join(repo, '.escouade', 'tickets');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
}

async function board(page: Page) {
  await page.getByRole('button', { name: /^Kanban/ }).click();
  await expect(page.getByRole('region', { name: 'À faire' })).toBeVisible();
}

test('Alice shares a ticket, Bob sees it in « À faire » with her name, launches it by hand, and its status comes back to her', async ({
  app,
}) => {
  test.setTimeout(240_000);
  let { page } = app;
  await page.setViewportSize({ width: 1024, height: 728 });

  // Alice: a ticket of her own, shared from its form, her autopilot off so that it waits.
  await addProject(page, app.repo, { firstAgent: false });
  await board(page);
  await page.getByRole('switch', { name: 'Pilote auto' }).click();
  await page.getByRole('button', { name: 'Nouveau ticket' }).click();
  const form = page.getByRole('dialog', { name: 'Nouveau ticket' });
  await form.getByRole('textbox', { name: 'Titre du ticket' }).fill('Export des factures en PDF');
  await form.getByRole('switch', { name: 'Partager avec l’équipe' }).click();
  await form.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(form).toBeHidden();
  const todo = page.getByRole('region', { name: 'À faire' });
  const card = todo.getByRole('button', { name: /DEM-1 Export des factures en PDF/ });
  await expect(card).toBeVisible();
  await expect(card.locator('.mark')).toHaveAccessibleName(/Partagé avec l’équipe · \.escouade\/tickets\/[a-z0-9]{8}\.yml/);
  // Its file, in the project's folder: hers, « À faire ».
  await expect.poll(() => Object.keys(files(app.repo)).length).toBe(1);
  const [name] = Object.keys(files(app.repo));
  let text = files(app.repo)[name];
  expect(text).toContain('key: DEM-1');
  expect(text).toContain('status: todo');
  expect(text).toContain('author: { name: Alice Martin, id: a91f03c2 }');
  // Never committed by Escouade: the file waits in git's status, the history has the first commit alone.
  const git = (...args: string[]) => execFileSync('git', args, { cwd: app.repo, encoding: 'utf8' });
  expect(git('status', '--porcelain', '--untracked-files=all')).toContain(`.escouade/tickets/${name}`);
  expect(git('log', '--oneline').trim().split('\n')).toHaveLength(1);
  // Alice commits it herself, with her work: Bob gets it as a pull would bring it.
  git('add', '.escouade');
  git('commit', '-qm', 'chore(tickets): DEM-1 partagé');

  // Bob: the same folder, a data folder of his own, his autopilot on.
  const bobData = path.join(app.root, 'bob-data');
  fs.mkdirSync(bobData);
  const aliceSettings = JSON.parse(fs.readFileSync(path.join(app.data, 'settings.json'), 'utf8'));
  fs.writeFileSync(path.join(bobData, 'settings.json'), JSON.stringify({ ...aliceSettings, ...BOB }));
  page = await app.restartAs(bobData);
  await page.setViewportSize({ width: 1024, height: 728 });
  await addProject(page, app.repo, { firstAgent: false });
  await board(page);
  await expect(page.getByRole('switch', { name: 'Pilote auto' })).toHaveAttribute('aria-checked', 'true');
  const hers = page.getByRole('region', { name: 'À faire' }).getByRole('button', { name: /DEM-1 Export des factures en PDF/ });
  await expect(hers).toBeVisible();
  await expect(hers.locator('.who')).toHaveAccessibleName('Ajouté par Alice Martin');
  await expect(hers.getByText('Ajouté par Alice Martin · le pilote auto ne le lance pas')).toBeVisible();
  // His autopilot leaves it: still « À faire » a while later, no agent started.
  await page.waitForTimeout(3000);
  await expect(hers).toBeVisible();
  // (The fake CLI's launches count its readings too, its update and its models: the agents' list says it.)
  await expect(page.getByText('Aucun agent.')).toBeVisible();
  // Nothing written by reading it.
  expect(files(app.repo)[name]).toBe(text);
  // Launched by hand: under way on his machine, his file says he took it.
  await hers.getByRole('button', { name: 'Lancer' }).click();
  // Out of « À faire » (its fake agent may go on to « À tester » at once).
  await expect(hers).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /DEM-1 Export des factures en PDF/ })).toBeVisible();
  await expect.poll(() => files(app.repo)[name], { timeout: 15_000 }).toMatch(/status: (in-progress|review|done)/);
  text = files(app.repo)[name];
  expect(text).toContain('taken_by: { name: Bob Durand, id: 5d0e77b1 }');
  expect(text).toContain('author: { name: Alice Martin, id: a91f03c2 }');
  // Still nothing committed by Escouade: Alice's commit is the last one, the file changed, for Bob to commit.
  expect(git('log', '--oneline').trim().split('\n')).toHaveLength(2);
  expect(git('status', '--porcelain')).toContain(`M .escouade/tickets/${name}`);

  // Alice again, on her data folder: her ticket follows its file, taken by Bob; her autopilot has nothing to start.
  page = await app.restartAs(app.data);
  // Bob's agent may have gone on to « À tester » meanwhile: what his file says once his app is closed.
  const status = /status: ([a-z-]+)/.exec(files(app.repo)[name])![1];
  await page.setViewportSize({ width: 1024, height: 728 });
  await board(page);
  const column = { 'in-progress': 'En cours', review: 'À tester', done: 'Terminé' }[status]!;
  const back = page.getByRole('region', { name: column }).getByRole('button', { name: /DEM-1 Export des factures en PDF/ });
  await expect(back).toBeVisible({ timeout: 15_000 });
  const line = { 'in-progress': 'Pris par Bob Durand', review: 'À tester chez Bob Durand', done: 'Fait par Bob Durand' }[status]!;
  await expect(back.getByText(line)).toBeVisible();
  // Only who took it validates it: nothing to validate or launch here.
  await expect(back.getByRole('button', { name: /Valider|Lancer/ })).toHaveCount(0);
  // The runner's window holds the board: no card sticks out of its column.
  const out = await page.locator('.card').evaluateAll(
    (cards) =>
      cards.filter((c) => {
        const r = c.getBoundingClientRect();
        const col = c.parentElement!.getBoundingClientRect();
        return r.right > col.right + 1 || r.left < col.left - 1;
      }).length,
  );
  expect(out).toBe(0);
});
