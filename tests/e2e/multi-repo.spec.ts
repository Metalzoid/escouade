// A project of several git repositories (ESC-169), in the window of the CI runner (1028 × 779): a folder that is no
// repository and holds api, docs and front, each its own. From its adding to the validation of a ticket whose agent
// changed two of them: each one's branch and changes, its files panel grouped, and the merge into each it changed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, openNewProject, test } from './fixture';

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** A repository at `dir` with one commit on main. */
function repo(dir: string) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'e2e@test');
  git(dir, 'config', 'user.name', 'e2e');
  git(dir, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'const a = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
}

test('a folder of three repositories is a project of them, from its adding to a ticket merged into each one it changed', async ({
  app,
}) => {
  const { page } = app;
  await page.setViewportSize({ width: 1028, height: 779 });
  const root = path.join(app.root, 'acme');
  for (const r of ['api', 'docs', 'front']) repo(path.join(root, r));
  fs.writeFileSync(path.join(root, 'README.md'), '# acme\n');

  // The assistant says what it found, and the folder is not made a repository.
  await openNewProject(page);
  const dialog = page.getByRole('dialog', { name: 'Nouveau projet' });
  await dialog.getByPlaceholder('C:\\chemin\\vers\\le\\projet').fill(root);
  await expect(dialog.getByText('3 dépôts git : api, docs, front')).toBeVisible();
  await dialog.getByRole('button', { name: /^Créer sans l.assistant$/ }).click();
  await expect(dialog).toBeHidden();
  expect(fs.existsSync(path.join(root, '.git'))).toBe(false);

  // The status bar: the branch they share, and how many they are; its menu, each one's.
  const branches = page.locator('footer .branch');
  await expect(branches).toContainText('main');
  await expect(branches).toContainText('3 dépôts');
  await branches.click();
  const menu = page.getByRole('menu');
  for (const r of ['api', 'docs', 'front']) await expect(menu.getByRole('menuitem', { name: new RegExp(`^${r}`) })).toBeVisible();
  await page.keyboard.press('Escape');

  // The files panel, by repository: a new file in api and in front, docs unchanged.
  fs.writeFileSync(path.join(root, 'api', 'notes.md'), 'api\n');
  fs.writeFileSync(path.join(root, 'front', 'notes.md'), 'front\n');
  await expect(page.locator('header .delta')).toHaveText('Δ 2');
  await page.keyboard.press('Control+Shift+B');
  await page.getByRole('button', { name: 'Tout le projet' }).click();
  const side = page.locator('aside.git-side');
  await expect(side.getByRole('button', { name: 'Replier api' })).toBeVisible();
  await expect(side.getByRole('button', { name: 'Replier front' })).toBeVisible();
  await expect(side.getByText('Sans changement : docs')).toBeVisible();
  await page.keyboard.press('Control+Shift+B');

  // A ticket whose agent writes its file in api and in front, in its own folder of worktrees.
  await page.getByRole('button', { name: /^Kanban/ }).click();
  await page.getByRole('button', { name: 'Nouveau ticket' }).click();
  await page.getByRole('textbox', { name: 'Titre du ticket' }).fill('Pagination [ok] [dans:api] [dans:front]');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const review = page.getByRole('region', { name: 'À tester' });
  await expect(review.getByText('ACM-1', { exact: true })).toBeVisible({ timeout: 60_000 });
  // Its folder has a worktree of each repository, on one branch.
  const worktrees = path.join(root, '.claude', 'worktrees');
  const folder = path.join(
    worktrees,
    fs.readdirSync(worktrees).find((d) => !d.startsWith('.'))!,
  );
  const branch = git(path.join(folder, 'api'), 'branch', '--show-current');
  for (const r of ['api', 'docs', 'front']) expect(git(path.join(folder, r), 'branch', '--show-current')).toBe(branch);
  expect(fs.existsSync(path.join(folder, 'README.md'))).toBe(true);
  // Nothing of the ticket's card sticks out of it, nor of the runner's window.
  const out = await review.locator('.card').evaluate((card) => {
    const c = card.getBoundingClientRect();
    return [...card.querySelectorAll('*')]
      .map((e) => [e, e.getBoundingClientRect()] as const)
      .filter(([, r]) => r.width && (r.right > Math.min(c.right, innerWidth) + 1 || r.left < c.left - 1))
      .map(([e, r]) => `${e.className} ${r.left}..${r.right} (card ${c.left}..${c.right})`);
  });
  expect(out).toEqual([]);

  // Validated: merged into api and front, each into its own main; docs untouched.
  await review.getByRole('button', { name: 'Valider et merger' }).click();
  const done = page.getByRole('region', { name: 'Terminé' });
  await expect(done.getByText(/api : Mergé dans main · squash · front : Mergé dans main · squash/)).toBeVisible({ timeout: 60_000 });
  for (const r of ['api', 'front']) {
    expect(fs.readFileSync(path.join(root, r, 'acm-1.txt'), 'utf8')).toBe('Boucle 1\n');
    expect(git(path.join(root, r), 'log', '-1', '--format=%s')).toBe('feat: travail du faux claude [ACM-1]');
  }
  expect(fs.existsSync(path.join(root, 'docs', 'acm-1.txt'))).toBe(false);
  expect(git(path.join(root, 'docs'), 'log', '-1', '--format=%s')).toBe('init');
});
