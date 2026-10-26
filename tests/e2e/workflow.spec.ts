// The Workflow tab of the side panel (ESC-194) on the fake agent of ESC-193: a project laid out as GSD (the copy of
// tests/fixtures/workflows/gsd, its commands in the project's own `.claude`), two agents that go through its steps by
// its doors (`faits-workflow` of tests/fixtures/fake-claude.mjs), each on its step of the rail, the list of the agents,
// the history of one and of the other, a door put in the composer, and the history found again after a restart. At the
// runner's size (1024 × 728), where the panel is narrower than 400 px.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, send, test } from './fixture';

const GSD = path.resolve(import.meta.dirname, '..', 'fixtures', 'workflows', 'gsd');

/** GSD in the repository: the user's folder of the fixture as the project's `.claude`, its `@~/.claude/` made the project's. */
function layOutGsd(repo: string) {
  const copy = (from: string, to: string) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, e.name);
      const dst = path.join(to, e.name);
      if (e.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        copy(src, dst);
      } else fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').split('@~/.claude/').join('@.claude/'));
    }
  };
  copy(path.join(GSD, 'home'), repo);
  copy(path.join(GSD, 'project'), repo);
  // Committed: the project is added as a clean repository.
  execFileSync('git', ['-c', 'user.email=e2e@test', '-c', 'user.name=e2e', 'add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=e2e@test', '-c', 'user.name=e2e', 'commit', '-qm', 'GSD'], { cwd: repo });
}

/** A door typed with the facts the fake agent plays in its turn. */
const door = (cmd: string, facts: object[]) => `${cmd} faits-workflow: ${JSON.stringify(facts)}`;

/** Sends `text` to the open agent and waits for the end of its turn. */
async function play(page: Page, text: string) {
  const ends = await page.getByText('Fait.', { exact: true }).count();
  await send(page, text);
  await expect(page.getByText('Fait.', { exact: true })).toHaveCount(ends + 1);
}

/** The open agent's name, once its first message named it (`agent-N` until then). */
async function openName(page: Page): Promise<string> {
  const name = page.locator('.card[aria-current="true"] .name');
  await expect(name).not.toHaveText(/^agent-\d+$/);
  return (await name.textContent())!.trim();
}

test('two agents go through a GSD project: each on its step of the rail, the list, their history, a door, a restart', async ({ app }) => {
  test.setTimeout(180_000);
  let { page } = app;
  await page.setViewportSize({ width: 1024, height: 728 });
  layOutGsd(app.repo);
  await addProject(page, app.repo);

  // One agent discusses the phase, then plans it with its two subagents.
  await play(page, door('/gsd:discuss-phase 3', [{ write: '.planning/CONTEXT.md', text: '# Contexte' }]));
  const a1 = await openName(page);
  await play(page, door('/gsd:plan-phase 3', [{ agent: 'gsd-planner' }, { agent: 'gsd-plan-checker' }]));
  // Another executes it.
  await page.getByRole('button', { name: 'Nouvel agent', exact: true }).first().click();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.getByText('Fait.', { exact: true })).toHaveCount(0);
  await play(page, door('/gsd:execute-phase 3', [{ agent: 'gsd-executor' }, { wait: 300 }]));
  const a2 = await openName(page);

  // The tab, beside Historique.
  await page.keyboard.press('Control+Shift+B');
  const side = page.locator('aside.git-side');
  await side.getByRole('tab', { name: /^Workflow/ }).click();
  const tab = side.getByTestId('workflow');
  const step = (name: string) => tab.locator('.wf-step').filter({ has: page.locator('.wf-name', { hasText: name }) });
  await expect(tab.locator('.wf-step .wf-name')).toHaveText(['Discuss phase', 'Plan phase', 'Execute phase', 'Verify work']);
  await expect(tab.locator('.wf-cap').first()).toContainText('4 étapes · phase 3 sur 6 d’après .planning/STATE.md');
  // 340 px beside the classic layout: the count of the tab goes, « PR et CI » leaves the strip for the × (choice 189),
  // nothing of the strip sticks out; the pills go under their step.
  expect(Math.round((await side.boundingBox())!.width)).toBe(340);
  await expect(side.getByRole('tab', { name: /^Workflow/ }).locator('.n')).toBeHidden();
  await expect(side.getByRole('tab', { name: /^PR et CI/ })).toBeHidden();
  const strip = await side.locator('.utabs').evaluate((u) => {
    const box = u.getBoundingClientRect();
    const out = [...u.children].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
    });
    return { cut: u.scrollWidth > u.clientWidth, out: out.map((c) => c.textContent?.trim() || c.className) };
  });
  expect(strip).toEqual({ cut: false, out: [] });
  await expect(side.getByRole('button', { name: 'Fermer le panneau' })).toBeInViewport({ ratio: 1 });

  // Each agent on its step; the open one's pill current, its step singled out.
  await expect(step('Plan phase').getByRole('button', { name: a1 })).toBeVisible();
  await expect(step('Execute phase').getByRole('button', { name: a2 })).toHaveAttribute('aria-current', 'true');
  await expect(step('Execute phase')).toHaveClass(/\bhere\b/);
  await expect(step('Plan phase')).toHaveClass(/\bbusy\b/);
  await expect(step('Plan phase')).not.toHaveClass(/\bhere\b/);
  await expect(step('Verify work').locator('.wf-detail')).toContainText('retour à Plan phase');
  await expect(tab.locator('.wf-edges path')).toHaveCount(2);
  const pill = (await step('Execute phase').getByRole('button', { name: a2 }).boundingBox())!;
  const node = (await step('Execute phase').locator('.wf-node').boundingBox())!;
  expect(pill.y).toBeGreaterThan(node.y + node.height);

  // The agents in the workflow.
  await expect(tab.locator('.wf-h').first()).toContainText('Agents dans GSD 2 en cours');
  const rows = tab.locator('.wf-ag');
  await expect(rows).toHaveCount(2);
  const row = (name: string) => rows.filter({ hasText: name });
  await expect(row(a1).locator('.where')).toContainText('Plan phase');
  await expect(row(a2).locator('.where')).toContainText('Execute phase');
  await expect(row(a2)).toHaveAttribute('aria-current', 'true');

  // agent-2's history, then agent-1's by its row, the conversation staying agent-2's.
  const hist = tab.locator('.wf-hist .ev .what b');
  await expect(tab.getByText(`Historique de ${a2}`)).toBeVisible();
  await expect(hist).toHaveText(['Execute phase']);
  await expect(tab.locator('.wf-hist .ev').first()).toContainText('/gsd:execute-phase · gsd-executor');
  await expect(tab.locator('.wf-hist .ev').first()).toContainText('gsd-executor');
  await row(a1).click();
  await expect(tab.getByText(`Historique de ${a1}`)).toBeVisible();
  await expect(hist).toHaveText(['Discuss phase', 'Plan phase']);
  await expect(tab.locator('.wf-hist .ev').first()).toContainText('CONTEXT.md écrit');
  await expect(tab.locator('.wf-hist .ev').nth(1)).toContainText('gsd-planner · gsd-plan-checker');
  await expect(tab.locator('.wf-strip i')).toHaveCount(2);
  await expect(page.getByRole('textbox').last()).toHaveAttribute('placeholder', new RegExp(a2));

  // A door of the head goes to agent-2's composer, not sent.
  await tab.locator('.wf-gates').getByRole('button', { name: '/gsd:autonomous' }).click();
  await expect(page.getByRole('textbox').last()).toHaveValue('/gsd:autonomous ');
  await page.getByRole('textbox').last().fill('');

  // The first goes on to Verify, seen as it happens; then opened from its pill.
  await step('Plan phase').getByRole('button', { name: a1 }).click();
  await expect(page.getByRole('textbox').last()).toHaveAttribute('placeholder', new RegExp(a1));
  await play(page, door('/gsd:verify-work 3', [{ agent: 'gsd-verifier' }]));
  await expect(step('Verify work').getByRole('button', { name: a1 })).toHaveAttribute('aria-current', 'true');
  await expect(hist).toHaveText(['Discuss phase', 'Plan phase', 'Verify work']);

  // Folded: a line a step, kept for the project.
  await tab.getByRole('button', { name: 'Replier les étapes' }).click();
  await expect(tab.locator('.wf-graph')).toHaveClass(/\bfolded\b/);
  await expect(tab.locator('.wf-gates')).toHaveCount(0);
  // Kept for the project, whichever agent is open (in the WebView's preferences, which a restart of the tests loses).
  await page.locator('.card').filter({ hasText: a2 }).click();
  await expect(tab.locator('.wf-graph')).toHaveClass(/\bfolded\b/);
  await expect(step('Execute phase').getByRole('button', { name: a2 })).toHaveAttribute('aria-current', 'true');

  // After a restart: the history is the same, the agents on their steps.
  page = await app.restart();
  await page.setViewportSize({ width: 1024, height: 728 });
  await page.locator('.card').filter({ hasText: a1 }).click();
  await page.keyboard.press('Control+Shift+B');
  const side2 = page.locator('aside.git-side');
  await side2.getByRole('tab', { name: /^Workflow/ }).click();
  const tab2 = side2.getByTestId('workflow');
  await expect(tab2.locator('.wf-step').filter({ hasText: 'Verify work' }).getByRole('button', { name: a1 })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(tab2.locator('.wf-step').filter({ hasText: 'Execute phase' }).getByRole('button', { name: a2 })).toBeVisible();
  await expect(tab2.locator('.wf-hist .ev .what b')).toHaveText(['Discuss phase', 'Plan phase', 'Verify work']);
});
