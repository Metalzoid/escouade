import { execFileSync } from 'node:child_process';
import { addProject, expect, test } from './fixture';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('a branch is created from the status bar, the folder switched to it, and the git graph shows it as the current one', async ({
  app,
}) => {
  const { page } = app;
  await addProject(page, app.repo);
  const branch = page.locator('footer .sync');
  await expect(branch).toContainText('main');

  // From the branch picker: « Nouvelle branche… », a name, « et y passer » (ticked by default).
  await branch.click();
  await page.getByRole('dialog', { name: 'Branches' }).getByRole('button', { name: 'Nouvelle branche…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle branche' });
  await dialog.getByRole('textbox', { name: 'Nom' }).fill('feat/e2e');
  await expect(dialog.getByRole('checkbox', { name: 'et y passer' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Branche « feat/e2e » créée : tu es dessus.')).toBeVisible();

  // The status bar and the repository agree on where the folder is.
  await expect(branch).toContainText('feat/e2e');
  expect(git(app.repo, 'branch', '--show-current')).toBe('feat/e2e');
  // It started where main is, and tracks nothing.
  expect(git(app.repo, 'rev-parse', 'feat/e2e')).toBe(git(app.repo, 'rev-parse', 'main'));

  // The graph (« Historique » of the side panel) labels the commit with the current branch, and keeps main as another.
  await page.getByRole('button', { name: /Fichiers/ }).click();
  await page.getByRole('tab', { name: /Historique/ }).click();
  const graph = page.locator('.graph');
  await expect(graph.locator('.ref.head')).toHaveText('feat/e2e');
  await expect(graph.locator('.ref.branch')).toHaveText('main');
});

test('the agents start from the target branch, brought up to date from the remote, and one is made without a worktree from the menu (ESC-144)', async ({
  app,
}) => {
  const { page } = app;
  await addProject(page, app.repo, { worktrees: true, firstAgent: false });
  // origin's main is a commit ahead of the local one, fetched but not pulled; the folder is on a branch of its own.
  const bare = `${app.repo}-remote.git`;
  git(app.repo, 'init', '-q', '--bare', '-b', 'main', bare);
  git(app.repo, 'remote', 'add', 'origin', bare);
  git(app.repo, 'push', '-qu', 'origin', 'main');
  git(app.repo, 'commit', '-q', '--allow-empty', '-m', 'on origin');
  git(app.repo, 'push', '-q', 'origin', 'main');
  const ahead = git(app.repo, 'rev-parse', 'main');
  git(app.repo, 'switch', '-q', '-c', 'work', 'main~1');
  git(app.repo, 'branch', '-qf', 'main', 'work');
  git(app.repo, 'commit', '-q', '--allow-empty', '-m', 'work');
  await expect(page.locator('footer .sync')).toContainText('work');

  // « Branche cible » in the branch picker, then the setting.
  await page.getByRole('button', { name: 'Réglages (Ctrl+,)' }).click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('tab', { name: 'Kanban' }).click();
  await settings.getByRole('button', { name: 'Branche cible : work. Choisir une autre branche' }).click();
  const picker = page.getByRole('dialog', { name: 'Branche cible' });
  await picker.getByRole('option', { name: /^main/ }).click();
  await expect(picker).toBeHidden();
  await settings.getByRole('switch', { name: 'Les agents partent de la branche cible' }).click();
  await settings.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(settings).toHaveCount(0);

  // A new agent: from origin's main, the local main moved to it, the folder left on work.
  await page.getByRole('button', { name: '+ Nouvel agent' }).first().click();
  await expect.poll(() => git(app.repo, 'branch', '--list', 'escouade/*')).toContain('escouade/agent-1');
  expect(git(app.repo, 'rev-parse', 'escouade/agent-1')).toBe(ahead);
  expect(git(app.repo, 'rev-parse', 'main')).toBe(ahead);
  expect(git(app.repo, 'branch', '--show-current')).toBe('work');

  // « Nouvel agent sans worktree », beside « Nouvel agent » in a project that gives each agent its own.
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitem', { name: 'Nouvel agent sans worktree' }).click();
  await expect(page.getByRole('button', { name: /agent-2/ }).first()).toBeVisible();
  expect(git(app.repo, 'worktree', 'list').split('\n')).toHaveLength(2);
});

test('« Nouvel agent sur une branche… » creates the branch typed, and the agent’s worktree is named after it (ESC-155)', async ({
  app,
}) => {
  const { page } = app;
  await addProject(page, app.repo, { firstAgent: false });
  const newOn = async (name: string) => {
    await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
    await page.getByRole('menuitem', { name: 'Nouvel agent sur une branche…' }).click();
    const picker = page.getByRole('dialog', { name: 'Choisir une branche' });
    await picker.getByRole('combobox').fill(name);
    const create = picker.getByRole('option', { name: new RegExp(`Créer la branche « ${name.replace('/', '\/')} » et y lancer un agent`) });
    // Where it starts is said: the folder's branch here.
    await expect(create).toContainText('depuis main');
    await create.click();
    await expect(picker).toBeHidden();
  };
  /** The folder of the worktree that has `branch`, as git lists it. */
  const folderOf = (branch: string) => {
    const blocks = git(app.repo, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/);
    const block = blocks.find((b) => b.includes(`branch refs/heads/${branch}`));
    return block?.split(/\r?\n/)[0].replace(/^worktree /, '') ?? '';
  };

  await newOn('feat/signup');
  await expect.poll(() => folderOf('feat/signup')).toMatch(/\.claude\/worktrees\/signup$/);
  expect(git(app.repo, 'rev-parse', 'feat/signup')).toBe(git(app.repo, 'rev-parse', 'main'));
  expect(git(folderOf('feat/signup'), 'branch', '--show-current')).toBe('feat/signup');
  // The folder stays on main, and the agent is shown.
  expect(git(app.repo, 'branch', '--show-current')).toBe('main');
  await expect(page.getByRole('button', { name: /agent-1/ }).first()).toBeVisible();

  // Another branch ending the same way: the next folder.
  await newOn('fix/signup');
  await expect.poll(() => folderOf('fix/signup')).toMatch(/\.claude\/worktrees\/signup-2$/);

  // A name git refuses is said, and nothing is made.
  await page.getByRole('button', { name: 'Autres façons de créer un agent' }).click();
  await page.getByRole('menuitem', { name: 'Nouvel agent sur une branche…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choisir une branche' });
  await picker.getByRole('combobox').fill('bad name');
  await expect(picker.getByRole('option', { name: /Créer la branche « bad name »/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(picker.getByText('« bad name » n’est pas un nom de branche valide', { exact: false })).toBeVisible();
  expect(git(app.repo, 'worktree', 'list').split('\n')).toHaveLength(3);
});
