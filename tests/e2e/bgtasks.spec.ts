import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

// The fake CLI runs tasks in the background as Claude Code does (ESC-14): « commande de fond Ns » a `Bash` command with
// `run_in_background` (title « Ticker », a line « tick N » every 200 ms), « surveillance de fond Ns » a `Monitor` (« Watch loop
// output », lines « watch N »), « commande premier plan Ns » a command that stays in the foreground (the turn waits for it).
// They end by themselves after N seconds (the exit code 0, `Background command "Ticker" completed (exit code 0)`) or by a
// `stop_task`; `get_task_output` and `stop_task` are written to fake-claude.control.jsonl.

/**
 * The name of the first agent, read on its card once the app has named it after its first message (the fake CLI answers
 * with the first word and « -fake », « -fake-en » in English): the name is the app's pick, and it changes under the test's
 * hands before that.
 */
async function agentName(page: Page): Promise<string> {
  const name = page.locator('.card .name').first();
  await expect(name).toHaveText(/-fake(-en)?$/);
  return (await name.innerText()).trim();
}

/** The card of the agent called `name` in the sidebar, and the chip it carries while tasks run in the background. */
function cardOf(page: Page, name: string) {
  const card = page.locator('aside.side .card', { hasText: name });
  return { card, chip: card.locator('[data-bg-chip]') };
}

/** The fold under the card of an agent: its group (named `label`), its buttons and its rows. */
function sidebar(page: Page, label: string) {
  const group = page.getByRole('group', { name: label, exact: true });
  return {
    group,
    toggle: group.locator('.subs-toggle'),
    /** The button that unfolds the finished ones (« 1 tâche finie »). */
    finished: group.locator('.done-toggle'),
    rows: group.locator('button[data-bg-row]'),
    /** The row of the task titled `title`. */
    row: (title: string) => group.locator('button[data-bg-row]', { has: page.locator('.stitle', { hasText: new RegExp(`^${title}$`) }) }),
  };
}

/** The conversation of the agent, and the view of a task that takes its place. */
function views(page: Page) {
  return { agent: page.locator('main.conv:not(.subview)'), task: page.locator('main[data-task-view]') };
}

/** What the view of a task says of it. */
function brief(view: Locator) {
  return {
    crumbs: view.getByRole('navigation'),
    here: view.locator('nav .crumb.here'),
    state: view.locator('[data-task-state]'),
    duration: view.locator('[data-task-duration]'),
    exit: view.locator('[data-task-exit]'),
    command: view.locator('[data-task-command]'),
    summary: view.locator('section[data-task-summary]'),
    log: view.locator('pre[role="log"][data-task-output]'),
    stop: view.locator('button[data-task-stop]'),
    fact: (label: string) =>
      view
        .locator('dl.facts > div')
        .filter({ has: view.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) })
        .locator('dd'),
  };
}

/** The lines of a log of the fake CLI (one JSON each): none while it was not written. */
function lines(file: string): Record<string, any>[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** The rank of the last « <word> N » line an output shows (0 while it shows none). */
async function lastRank(log: Locator, word: string): Promise<number> {
  const ranks = [...(await log.innerText()).matchAll(new RegExp(`^${word} (\\d+)$`, 'gm'))].map((m) => Number(m[1]));
  return ranks.at(-1) ?? 0;
}

/** Whether a scrolled area shows its end (within the 24 px the view counts as the end). */
function atEnd(log: Locator): Promise<boolean> {
  return log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 24);
}

const TICKER_COMMAND = 'for i in $(seq 1 10); do echo tick $i; sleep 2; done';

// How long the commands of the fake CLI run, in seconds. They are timed by the clock, not by the test: a slow CI (macOS) takes
// longer than the test thinks to open a view or reach a check, so the margins are wide.
/** A command the test does not wait for the end of: it outlasts the test (Playwright's 90 s), so it is running at every check. */
const FOREVER = 150;
/** A command whose end the test waits for: long enough for a slow machine to open its view and see « En cours » first. */
const ENDS_BY_ITSELF = 40;
/** Same, for a command that stays in the foreground (the turn of the agent waits for it). */
const IN_FOREGROUND = 25;
/** What a test waits for the end of such a command: its duration, and as much again. */
const END_WAIT = 60_000;

test('a command in the background is listed under its agent and its output is followed live in its view', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${FOREVER}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const side = sidebar(page, `Tâches de fond de ${name}`);

  // The chip on the card counts what runs in the background.
  await expect(chip).toHaveText('1 en fond');
  await expect(chip).toHaveAttribute('data-count', '1');
  await expect(chip).toHaveAttribute('aria-label', '1 tâche de fond en cours');

  // Under the card, unfolded while it runs: its title, what it is, its command, how long it runs.
  await expect(side.group).toBeVisible();
  await expect(side.toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(side.toggle).toContainText('Tâches de fond');
  await expect(side.toggle).toContainText('1 en cours');
  await expect(side.toggle).not.toContainText('finie');
  await expect(side.rows).toHaveCount(1);
  const row = side.row('Ticker');
  await expect(row).toHaveAttribute('data-kind', 'command');
  await expect(row).toHaveAttribute('data-status', 'running');
  await expect(row.locator('.sdot')).toHaveClass(/running/);
  await expect(row.locator('.sdoing')).toHaveText(`Commande en fond · ${TICKER_COMMAND}`);
  await expect(row.locator('.sdur')).toHaveText(/^\d+m \d\ds$/);
  await expect(row).not.toHaveAttribute('aria-current', 'page');
  const id = await row.getAttribute('data-bg-row');
  expect(id).toMatch(/^fakebg\d+$/);

  // A click opens its view, in place of the agent's conversation.
  const { agent: conv, task: view } = views(page);
  const task = brief(view);
  await expect(conv).toBeVisible();
  await row.click();
  await expect(view).toBeVisible();
  await expect(conv).toHaveCount(0);
  await expect(view).toHaveAttribute('data-task', id!);
  await expect(view).toHaveAttribute('data-kind', 'command');
  await expect(view).toHaveAttribute('data-status', 'running');
  await expect(row).toHaveAttribute('aria-current', 'page');
  await expect(task.crumbs).toHaveAccessibleName('Fil d’Ariane');
  await expect(task.crumbs.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(task.here).toHaveText('Ticker');
  await expect(task.here).toHaveAttribute('aria-current', 'page');
  // The focus is in the view, at its last crumb: the keyboard is there, and Escape heard.
  await expect(task.here).toBeFocused();
  await expect(task.state).toHaveText('En cours');
  await expect(task.fact('Type')).toHaveText('Commande en fond');
  await expect(task.command).toHaveText(TICKER_COMMAND);
  await expect(task.stop).toBeVisible();
  await expect(task.exit).toHaveCount(0);
  await expect(task.summary).toHaveCount(0);
  // Read-only: no field to write in, a log to read.
  await expect(view.getByRole('textbox')).toHaveCount(0);
  await expect(task.log).toHaveAttribute('aria-label', 'Sortie de Ticker, en lecture seule');

  // The duration runs.
  const was = await task.duration.innerText();
  expect(was).toMatch(/^\d+m \d\ds$/);
  await expect(task.duration).not.toHaveText(was);

  // The output is live: it starts, then grows, in the same element, with no reload (the end of it is read from the process
  // while it lives, never from a file).
  await expect(task.log).toContainText('tick 1');
  await task.log.evaluate((el) => (el.dataset.kept = 'yes'));
  const first = await lastRank(task.log, 'tick');
  expect(first).toBeGreaterThan(0);
  await expect.poll(() => lastRank(task.log, 'tick'), { timeout: 20_000 }).toBeGreaterThan(first);
  await expect(task.log).toHaveAttribute('data-kept', 'yes');
  await expect(view.locator('[data-task-source], [data-task-truncated], [data-task-read-error]')).toHaveCount(0);
  const control = path.join(app.root, 'fake-claude.control.jsonl');
  expect(lines(control).filter((r) => r.subtype === 'get_task_output' && r.task_id === id).length).toBeGreaterThan(1);

  // Escape goes back to the conversation of the agent, and the focus to the row it was opened from. The task goes on, and
  // nothing was stopped: the view only reads.
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(conv).toBeVisible();
  await expect(conv.getByText('Lancé en arrière-plan.')).toBeVisible();
  await expect(row).not.toHaveAttribute('aria-current', 'page');
  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute('data-status', 'running');
  await expect(chip).toHaveAttribute('data-count', '1');
  expect(lines(control).filter((r) => r.subtype === 'stop_task')).toHaveLength(0);

  // The agent's name in the breadcrumb leads back as well.
  await row.click();
  await expect(view).toBeVisible();
  await task.crumbs.getByRole('button', { name, exact: true }).click();
  await expect(view).toHaveCount(0);
  await expect(conv).toBeVisible();
});

test('a command that ends by itself is finished in the list, and its view tells how it ended', async ({ app }) => {
  // The test waits for the end of a command that lasts ENDS_BY_ITSELF seconds: it needs more than the 90 s of the others.
  test.setTimeout(150_000);
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${ENDS_BY_ITSELF}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  const { agent: conv, task: view } = views(page);
  const task = brief(view);

  // Its view is open when it ends.
  const row = side.row('Ticker');
  await expect(chip).toHaveAttribute('data-count', '1');
  await row.click();
  await expect(view).toHaveAttribute('data-status', 'running');
  await expect(task.state).toHaveText('En cours');
  await expect(task.stop).toBeVisible();
  await expect(task.log).toContainText('tick 1');

  // The state says it, the button goes; what Claude Code said of it and its exit code come.
  await expect(task.state).toHaveText('Terminée', { timeout: END_WAIT });
  await expect(view).toHaveAttribute('data-status', 'done');
  await expect(task.stop).toHaveCount(0);
  await expect(task.exit).toHaveText('0');
  await expect(task.summary).toBeVisible();
  await expect(task.summary.getByRole('heading', { name: 'Résumé' })).toBeVisible();
  await expect(task.summary).toContainText('Background command "Ticker" completed (exit code 0)');
  // The last read has the end of what it wrote.
  await expect(task.log).toContainText('[exited with code 0]');
  // The duration stopped with it.
  await expect(task.duration).toHaveText(/^\d+m \d\ds$/);
  const lasted = await task.duration.innerText();
  await page.waitForTimeout(2100);
  await expect(task.duration).toHaveText(lasted);

  // Back in the conversation: Claude Code opened a turn about it. In the sidebar nothing runs, the group folds and counts one
  // finished, the chip is gone.
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(conv.getByText('La tâche de fond est finie.')).toBeVisible();
  await expect(chip).toHaveCount(0);
  await expect(side.toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(side.toggle).toContainText('1 finie');
  await expect(side.toggle).not.toContainText('en cours');
  await expect(row).toHaveCount(0);

  // The finished are one more click away; the row says how it ended.
  await side.toggle.click();
  await expect(side.toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(side.finished).toContainText('1 tâche finie');
  await side.finished.click();
  await expect(row).toHaveAttribute('data-status', 'done');
  await expect(row.locator('.sdot')).toHaveClass(/done/);
  await expect(row.locator('.sdoing')).toHaveText('Commande en fond · Terminée (code 0)');
  await expect(row.locator('.sdur')).toHaveText(/^\d+m \d\ds$/);

  // Opened again, once over: the same facts, still the output, nothing to stop.
  await row.click();
  await expect(view).toHaveAttribute('data-status', 'done');
  await expect(task.state).toHaveText('Terminée');
  await expect(task.exit).toHaveText('0');
  await expect(task.summary).toContainText('Background command "Ticker" completed (exit code 0)');
  await expect(task.log).toContainText('tick 1');
  await expect(task.log).toContainText('[exited with code 0]');
  await expect(task.stop).toHaveCount(0);
});

test('« Arrêter » stops a command in the background: one stop_task, its state and the chip follow', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${FOREVER}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  const { agent: conv, task: view } = views(page);
  const task = brief(view);

  const row = side.row('Ticker');
  await expect(chip).toHaveAttribute('data-count', '1');
  await row.click();
  await expect(task.state).toHaveText('En cours');
  const id = await view.getAttribute('data-task');
  expect(id).toMatch(/^fakebg\d+$/);
  await expect(task.log).toContainText('tick 1');
  const control = path.join(app.root, 'fake-claude.control.jsonl');
  expect(lines(control).filter((r) => r.subtype === 'stop_task')).toHaveLength(0);

  // One request to Claude Code, for this task.
  await task.stop.click();
  await expect.poll(() => lines(control).filter((r) => r.subtype === 'stop_task')).toHaveLength(1);
  expect(lines(control).filter((r) => r.subtype === 'stop_task')[0]).toMatchObject({ subtype: 'stop_task', task_id: id });

  // It says « Arrêtée », the button is gone, the chip with it; the output ends where it was killed.
  await expect(task.state).toHaveText('Arrêtée');
  await expect(view).toHaveAttribute('data-status', 'stopped');
  await expect(task.stop).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  await expect(task.log).toContainText('[killed]');
  // A task stopped has no exit code, and Claude Code's words for it are its description, said already.
  await expect(task.exit).toHaveCount(0);
  await expect(task.summary).toHaveCount(0);
  expect(lines(control).filter((r) => r.subtype === 'stop_task')).toHaveLength(1);

  // The agent was told, and answered in its conversation; the list has it among the finished.
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(conv.getByText('La tâche de fond a été arrêtée.')).toBeVisible();
  await expect(side.toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(side.toggle).toContainText('1 finie');
  await expect(side.toggle).not.toContainText('en cours');
  await side.toggle.click();
  await side.finished.click();
  await expect(row).toHaveAttribute('data-status', 'stopped');
  await expect(row.locator('.sdoing')).toHaveText('Commande en fond · Arrêtée');
});

test('a monitor is listed as a monitor and its output is followed', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `surveillance de fond ${FOREVER}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  const { task: view } = views(page);
  const task = brief(view);

  // A monitor counts among what runs in the background.
  await expect(chip).toHaveText('1 en fond');
  await expect(chip).toHaveAttribute('data-count', '1');
  await expect(side.toggle).toContainText('1 en cours');
  const row = side.row('Watch loop output');
  await expect(row).toHaveAttribute('data-kind', 'monitor');
  await expect(row).toHaveAttribute('data-status', 'running');
  await expect(row.locator('.sdoing')).toContainText('Surveillance');
  await expect(row.locator('.sdoing')).not.toContainText('Commande en fond');

  // Its view says what it is, and follows what it writes.
  await row.click();
  await expect(view).toHaveAttribute('data-kind', 'monitor');
  await expect(view).toHaveAttribute('data-status', 'running');
  await expect(task.state).toHaveText('En cours');
  await expect(task.fact('Type')).toHaveText('Surveillance');
  await expect(task.here).toHaveText('Watch loop output');
  await expect(task.command).toHaveText('for i in $(seq 1 6); do echo watch $i; sleep 3; done');
  await expect(task.stop).toBeVisible();
  await expect(task.log).toContainText('watch 1');
  await expect(task.log).not.toContainText('tick');
  const first = await lastRank(task.log, 'watch');
  expect(first).toBeGreaterThan(0);
  await expect.poll(() => lastRank(task.log, 'watch'), { timeout: 20_000 }).toBeGreaterThan(first);
});

test('two tasks at once are counted together, each with its own output, and a view is not left behind', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${FOREVER}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  const { agent: conv, task: view } = views(page);
  const task = brief(view);
  const control = path.join(app.root, 'fake-claude.control.jsonl');

  // The first one is running and its turn is over, before the second goes: the agent waits for it.
  await expect(chip).toHaveAttribute('data-count', '1');
  await expect(conv.getByText('Lancé en arrière-plan.')).toBeVisible();
  const status = page.locator('aside.side .card .status').first();
  await expect(status).toHaveText('Attend');
  await expect(status).toHaveAttribute('data-tip', 'Son tour est fini, mais il attend :\n1 tâche de fond en cours');
  await send(page, `surveillance de fond ${FOREVER}s`);

  // The chip says two, the section lists both: the oldest first.
  await expect(chip).toHaveAttribute('data-count', '2');
  await expect(chip).toHaveText('2 en fond');
  await expect(chip).toHaveAttribute('aria-label', '2 tâches de fond en cours');
  await expect(side.toggle).toContainText('2 en cours');
  await expect(side.rows).toHaveCount(2);
  await expect(side.rows.nth(0).locator('.stitle')).toHaveText('Ticker');
  await expect(side.rows.nth(1).locator('.stitle')).toHaveText('Watch loop output');
  const ticker = side.row('Ticker');
  const watch = side.row('Watch loop output');
  await expect(ticker).toHaveAttribute('data-kind', 'command');
  await expect(watch).toHaveAttribute('data-kind', 'monitor');
  const tickerId = await ticker.getAttribute('data-bg-row');
  const watchId = await watch.getAttribute('data-bg-row');
  expect(tickerId).not.toBe(watchId);

  // The view of one shows its own output, and its own alone.
  await ticker.click();
  await expect(view).toHaveAttribute('data-task', tickerId!);
  await expect(task.here).toHaveText('Ticker');
  await expect(task.log).toContainText('tick 1');
  const rank = await lastRank(task.log, 'tick');
  await expect.poll(() => lastRank(task.log, 'tick'), { timeout: 20_000 }).toBeGreaterThan(rank);
  await expect(task.log).not.toContainText('watch');
  await expect(ticker).toHaveAttribute('aria-current', 'page');
  await expect(watch).not.toHaveAttribute('aria-current', 'page');

  // Another row of the sidebar takes its place, with nothing left of the first.
  await watch.click();
  await expect(view).toHaveCount(1);
  await expect(view).toHaveAttribute('data-task', watchId!);
  await expect(view).toHaveAttribute('data-kind', 'monitor');
  await expect(task.here).toHaveText('Watch loop output');
  await expect(task.fact('Type')).toHaveText('Surveillance');
  await expect(task.log).toContainText('watch 1');
  await expect(task.log).not.toContainText('tick');
  await expect(watch).toHaveAttribute('aria-current', 'page');
  await expect(ticker).not.toHaveAttribute('aria-current', 'page');

  // Stopping one leaves the other alone: its row, its chip, its view.
  await task.stop.click();
  await expect(task.state).toHaveText('Arrêtée');
  await expect(task.log).toContainText('[killed]');
  await expect(chip).toHaveAttribute('data-count', '1');
  await expect(chip).toHaveText('1 en fond');
  await expect(side.toggle).toContainText('1 en cours');
  await expect(side.toggle).toContainText('1 finie');
  await expect(ticker).toHaveAttribute('data-status', 'running');
  const stops = lines(control).filter((r) => r.subtype === 'stop_task');
  expect(stops).toHaveLength(1);
  expect(stops[0]).toMatchObject({ task_id: watchId });
  await ticker.click();
  await expect(view).toHaveAttribute('data-task', tickerId!);
  await expect(task.state).toHaveText('En cours');
  await expect(task.stop).toBeVisible();
  await expect(task.log).toContainText('tick 1');
  await expect(task.log).not.toContainText('[killed]');

  // Leaving the agent for another one leaves no view behind: a new agent has the conversation of its own, and coming back to
  // the first shows its conversation, not the task it was reading.
  await page.getByRole('button', { name: '+ Nouvel agent' }).first().click();
  await expect(page.locator('aside.side .card')).toHaveCount(2);
  await expect(conv).toBeVisible();
  await expect(view).toHaveCount(0);
  await expect(page.locator('[data-bg-group]')).toHaveCount(1);
  await expect(page.locator('[data-bg-chip]')).toHaveCount(1);
  await page.locator('aside.side .card', { hasText: name }).click();
  await expect(conv).toBeVisible();
  await expect(conv.locator('.bubble', { hasText: `commande de fond ${FOREVER}s` })).toBeVisible();
  await expect(view).toHaveCount(0);
  await expect(ticker).not.toHaveAttribute('aria-current', 'page');
  await expect(chip).toHaveAttribute('data-count', '1');
});

test('a command that stays in the foreground is not a background task', async ({ app }) => {
  test.setTimeout(120_000);
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande premier plan ${IN_FOREGROUND}s`);
  const name = await agentName(page);
  const { chip } = cardOf(page, name);
  const { agent: conv } = views(page);
  const card = page.locator('aside.side .card', { hasText: name });

  // It runs and the agent waits for it: its call is in the conversation, the agent at work, and the sidebar lists nothing.
  await expect(conv.locator('.tool', { hasText: 'echo fg' })).toBeVisible();
  await expect(card.locator('.status')).toHaveText('En cours');
  await page.waitForTimeout(1000);
  await expect(chip).toHaveCount(0);
  await expect(page.locator('[data-bg-group]')).toHaveCount(0);

  // Over, its turn goes on, and it was never a task of the background.
  await expect(conv.getByText('La commande est finie.')).toBeVisible({ timeout: END_WAIT });
  await expect(card.locator('.status')).toHaveText('Terminé');
  await expect(chip).toHaveCount(0);
  await expect(page.locator('[data-bg-group]')).toHaveCount(0);
  await expect(page.locator('[data-bg-row]')).toHaveCount(0);
});

test('the output follows its end until the reader goes up in it, and « Suivre la fin » brings the reader back', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${FOREVER}s`);
  const name = await agentName(page);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  const { task: view } = views(page);
  const task = brief(view);

  await side.row('Ticker').click();
  await expect(view).toBeVisible();
  // Five lines a second: the log fills its area, and shows the end of what is written. It overflows by far more than the
  // 24 px the view counts as its end: its top must not be « at the end » too, else no button comes (seen on a CI runner).
  await expect.poll(() => task.log.evaluate((el) => el.scrollHeight - el.clientHeight > 200), { timeout: 40_000 }).toBe(true);
  await expect.poll(() => atEnd(task.log)).toBe(true);
  await expect(view.locator('[data-task-follow]')).toHaveCount(0);

  // Gone up in it, the reader stays where he is while it goes on, and the button to follow the end comes.
  await task.log.evaluate((el) => {
    el.scrollTop = 0;
  });
  const follow = view.locator('[data-task-follow]');
  await expect(follow).toBeVisible();
  await expect(follow).toHaveText('Suivre la fin');
  const seen = await lastRank(task.log, 'tick');
  await expect.poll(() => lastRank(task.log, 'tick'), { timeout: 20_000 }).toBeGreaterThan(seen);
  expect(await task.log.evaluate((el) => el.scrollTop)).toBeLessThan(24);

  // The button leads to the end again, and the log follows it from there.
  await follow.click();
  await expect(follow).toHaveCount(0);
  await expect.poll(() => atEnd(task.log)).toBe(true);
  const rank = await lastRank(task.log, 'tick');
  await expect.poll(() => lastRank(task.log, 'tick'), { timeout: 20_000 }).toBeGreaterThan(rank);
  await expect.poll(() => atEnd(task.log)).toBe(true);
});

test('a task that ran when the app stopped is interrupted once it starts again, and its output is still read', async ({ app }) => {
  const { page } = app;
  await addProject(page, app.repo);
  await send(page, `commande de fond ${FOREVER}s`);
  const name = await agentName(page);
  const side = sidebar(page, `Tâches de fond de ${name}`);
  await side.row('Ticker').click();
  const task = brief(views(page).task);
  await expect(task.state).toHaveText('En cours');
  await expect(task.log).toContainText('tick 1');
  const id = await views(page).task.getAttribute('data-task');

  // The app stopped and started again, on the same data: the process that ran the command is gone with the old one.
  const back = await app.restart();
  expect(back).toBe(app.page);
  await back.locator('aside.side .card', { hasText: name }).first().click();
  const { agent: conv, task: view } = views(back);
  const kept = brief(view);
  const after = sidebar(back, `Tâches de fond de ${name}`);
  await expect(after.group).toBeVisible();
  await expect(cardOf(back, name).chip).toHaveCount(0);
  await expect(after.toggle).toContainText('1 finie');
  await expect(after.toggle).not.toContainText('en cours');
  if ((await after.toggle.getAttribute('aria-expanded')) !== 'true') await after.toggle.click();
  await after.finished.click();
  const row = after.row('Ticker');
  await expect(row).toHaveAttribute('data-status', 'interrupted');
  await expect(row.locator('.sdoing')).toHaveText('Commande en fond · Interrompue');
  await expect(conv).toBeVisible();

  // Its view says so, has nothing to stop, and reads what the command wrote from its output file.
  await row.click();
  await expect(view).toHaveAttribute('data-task', id!);
  await expect(view).toHaveAttribute('data-status', 'interrupted');
  await expect(kept.state).toHaveText('Interrompue');
  await expect(kept.stop).toHaveCount(0);
  await expect(kept.command).toHaveText(TICKER_COMMAND);
  await expect(kept.log).toContainText('tick 1');
  await expect(view.locator('[data-task-source="file"]')).toHaveText('lue dans le fichier de sortie');
  await expect(view.locator('[data-task-read-error]')).toHaveCount(0);
});

test.describe('in English', () => {
  test.use({ language: 'en' });

  test('the tasks in the background are told in English', async ({ app }) => {
    const { page } = app;
    await addProject(page, app.repo, { lang: 'en' });
    await send(page, `background command ${FOREVER}s`);
    const name = await agentName(page);
    const { chip } = cardOf(page, name);
    const side = sidebar(page, `Background tasks of ${name}`);
    const { task: view } = views(page);
    const task = brief(view);

    await expect(chip).toHaveText('1 in background');
    await expect(chip).toHaveAttribute('data-count', '1');
    await expect(chip).toHaveAttribute('aria-label', '1 background task running');
    await expect(side.group).toBeVisible();
    await expect(side.toggle).toContainText('Background tasks');
    await expect(side.toggle).toContainText('1 running');
    const row = side.row('Ticker');
    await expect(row.locator('.sdoing')).toHaveText(`Background command · ${TICKER_COMMAND}`);

    await row.click();
    await expect(view).toBeVisible();
    await expect(task.crumbs).toHaveAccessibleName('Breadcrumb');
    await expect(task.state).toHaveText('Running');
    await expect(task.fact('Type')).toHaveText('Background command');
    await expect(task.log).toHaveAttribute('aria-label', 'Output of Ticker, read-only');
    await expect(task.log).toContainText('tick 1');

    // Stopped: « Stopped », and the fold counts it finished.
    await task.stop.click();
    await expect(task.stop).toHaveCount(0);
    await expect(task.state).toHaveText('Stopped');
    await expect(chip).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(view).toHaveCount(0);
    await expect(side.toggle).toContainText('1 finished');
    await side.toggle.click();
    await expect(side.finished).toContainText('1 finished task');
  });
});
