// Captures the preview beside it: `node design/app-redesign/render.mjs [name…]` writes each screen at the app's
// default size (1440×900), a few at the CI window's size (1028×779), another project's tint, and the screens of lot 0
// (ESC-116) in French and, where labels are tight, in English (`-en`, index.html?lang=en). Each one is dark; every screen
// at the default size has its light twin (`-light`, index.html?theme=light, ESC-129), and so do a few small and English ones.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(dir, 'index.html')).href;
const BIG = { width: 1440, height: 900 };
const SMALL = { width: 1028, height: 779 };
const EN = { lang: 'en' };
const DIAGRAM = ['loops-diagram', 'loops-diagram-choice', 'loops-diagram-simple', 'loops-diagram-tickets', 'loops-diagram-big', 'loops-diagram-copied', 'loops-diagram-compare'];
const SHARE = ['share', 'share-theirs', 'share-ticket', 'share-name', 'share-settings', 'share-settings-project', 'share-git', 'share-file', 'share-edge'];
const shots = [
  { name: 'agents', ...BIG },
  { name: 'kanban', ...BIG, hash: 'board' },
  { name: 'git', ...BIG, hash: 'git' },
  { name: 'history', ...BIG, hash: 'history' },
  { name: 'terminal', ...BIG, hash: 'terminal' },
  { name: 'run', ...BIG, hash: 'run' },
  { name: 'test', ...BIG, hash: 'test' },
  { name: 'test-run', ...BIG, hash: 'test-run' },
  { name: 'editor', ...BIG, hash: 'editor' },
  { name: 'overview', ...BIG, hash: 'overview' },
  { name: 'stats', ...BIG, hash: 'stats', hover: '.col[data-i="9"]' },
  { name: 'settings', ...BIG, hash: 'settings' },
  { name: 'settings-accounts', ...BIG, hash: 'settings-accounts' },
  { name: 'settings-projects', ...BIG, hash: 'settings-projects' },
  { name: 'settings-board', ...BIG, hash: 'settings-board' },
  { name: 'settings-small', ...SMALL, hash: 'settings-notifications' },
  { name: 'tint-studio-web', ...BIG, click: '.tile[data-hue="300"]' },
  { name: 'agents-small', ...SMALL },
  { name: 'kanban-small', ...SMALL, hash: 'board' },
  { name: 'git-small', ...SMALL, hash: 'git' },
  { name: 'overview-small', ...SMALL, hash: 'overview' },

  // Lot 0: harness, accounts, handover.
  { name: 'new-agent', ...BIG, hash: 'new-agent' },
  { name: 'codex', ...BIG, hash: 'codex' },
  { name: 'modes', ...BIG, hash: 'modes' },
  { name: 'handover', ...BIG, hash: 'handover' },
  { name: 'agent-menu', ...BIG, hash: 'agent-menu' },
  { name: 'quota', ...BIG, hash: 'quota' },
  { name: 'account-codex', ...BIG, hash: 'account-codex' },
  { name: 'terminal-view', ...BIG, hash: 'terminal-view' },
  { name: 'welcome', ...BIG, hash: 'welcome' },
  { name: 'settings-harness', ...BIG, hash: 'settings-claude' },
  // Voice and attachments.
  { name: 'dictation', ...BIG, hash: 'dictation' },
  { name: 'dictation-offer', ...BIG, hash: 'dictation-offer' },
  { name: 'voice', ...BIG, hash: 'voice' },
  { name: 'voice-question', ...BIG, hash: 'voice-question' },
  { name: 'attachments', ...BIG, hash: 'attachments' },
  { name: 'drop', ...BIG, hash: 'drop' },
  { name: 'ticket', ...BIG, hash: 'ticket' },
  { name: 'settings-voice', ...BIG, hash: 'settings-voice' },
  // Subagents, background tasks, new project, MCP, the rest.
  { name: 'subagent', ...BIG, hash: 'subagent' },
  { name: 'task', ...BIG, hash: 'task' },
  { name: 'wizard', ...BIG, hash: 'wizard' },
  { name: 'wizard-summary', ...BIG, hash: 'wizard-summary' },
  { name: 'settings-mcp', ...BIG, hash: 'settings-mcp' },
  { name: 'telemetry', ...BIG, hash: 'telemetry' },
  { name: 'update', ...BIG, hash: 'update' },
  { name: 'update-failed', ...BIG, hash: 'update-failed' },
  { name: 'settings-about', ...BIG, hash: 'settings-about' },
  { name: 'settings-integrations', ...BIG, hash: 'settings-integrations' },
  { name: 'hosts', ...BIG, hash: 'hosts' },
  // The small window, in French then in English where it is tight.
  { name: 'codex-small', ...SMALL, hash: 'codex' },
  { name: 'handover-small', ...SMALL, hash: 'handover' },
  { name: 'subagent-small', ...SMALL, hash: 'subagent' },
  { name: 'agents-small-en', ...SMALL, ...EN },
  { name: 'new-agent-small-en', ...SMALL, ...EN, hash: 'new-agent' },
  { name: 'modes-small-en', ...SMALL, ...EN, hash: 'modes' },
  { name: 'handover-small-en', ...SMALL, ...EN, hash: 'handover' },
  { name: 'quota-small-en', ...SMALL, ...EN, hash: 'quota' },
  { name: 'terminal-view-small-en', ...SMALL, ...EN, hash: 'terminal-view' },
  { name: 'dictation-small-en', ...SMALL, ...EN, hash: 'dictation' },
  { name: 'attachments-small-en', ...SMALL, ...EN, hash: 'attachments' },
  { name: 'voice-small-en', ...SMALL, ...EN, hash: 'voice' },
  { name: 'subagent-small-en', ...SMALL, ...EN, hash: 'subagent' },
  { name: 'ticket-small-en', ...SMALL, ...EN, hash: 'ticket' },
  { name: 'wizard-small-en', ...SMALL, ...EN, hash: 'wizard' },
  { name: 'settings-harness-small-en', ...SMALL, ...EN, hash: 'settings-claude' },
  { name: 'settings-accounts-small-en', ...SMALL, ...EN, hash: 'settings-accounts' },
  // Lot 0 bis (ESC-150): what the 1.8.0 to 1.8.9 added, in French, then in English at 1028×779 where it is tight.
  { name: 'overage', ...BIG, hash: 'overage' },
  { name: 'harness-opencode', ...BIG, hash: 'harness-opencode' },
  { name: 'accounts-copilot', ...BIG, hash: 'accounts-copilot' },
  { name: 'accounts-quotas', ...BIG, hash: 'accounts-quotas' },
  { name: 'account-machine', ...BIG, hash: 'account-machine' },
  { name: 'opencode', ...BIG, hash: 'opencode' },
  { name: 'modes-opencode', ...BIG, hash: 'modes-opencode' },
  { name: 'copilot', ...BIG, hash: 'copilot' },
  { name: 'models', ...BIG, hash: 'models' },
  { name: 'switch-account', ...BIG, hash: 'switch-account' },
  { name: 'no-account', ...BIG, hash: 'no-account' },
  { name: 'waiting', ...BIG, hash: 'waiting' },
  { name: 'voice-live', ...BIG, hash: 'voice-live' },
  { name: 'dictation-live', ...BIG, hash: 'dictation-live' },
  { name: 'settings-voice-online', ...BIG, hash: 'settings-voice-online' },
  { name: 'voice-online-voice', ...BIG, hash: 'voice-online-voice' },
  { name: 'code-hosts', ...BIG, hash: 'code-hosts' },
  { name: 'private', ...BIG, hash: 'private' },
  { name: 'private-accounts', ...BIG, hash: 'private-accounts' },
  { name: 'escouade-yml', ...BIG, hash: 'escouade-yml' },
  { name: 'escouade-yml-pending', ...BIG, hash: 'escouade-yml-pending' },
  { name: 'escouade-yml-board', ...BIG, hash: 'escouade-yml-board' },
  { name: 'worktree-cleanup', ...BIG, hash: 'worktree-cleanup' },
  { name: 'run-worktree', ...BIG, hash: 'run-worktree' },
  { name: 'run-conflict', ...BIG, hash: 'run-conflict' },
  { name: 'pr-open', ...BIG, hash: 'pr-open' },
  { name: 'pr', ...BIG, hash: 'pr' },
  { name: 'worktree-kept', ...BIG, hash: 'worktree-kept' },
  { name: 'wizard-private', ...BIG, hash: 'wizard-private' },
  { name: 'opencode-view', ...BIG, hash: 'opencode-view' },
  { name: 'copilot-view', ...BIG, hash: 'copilot-view' },
  { name: 'welcome-account', ...BIG, hash: 'welcome-account' },
  // Lot 0 bis in English at 1028×779, where the labels are tight.
  { name: 'accounts-quotas-small-en', ...SMALL, ...EN, hash: 'accounts-quotas' },
  { name: 'opencode-small-en', ...SMALL, ...EN, hash: 'opencode' },
  { name: 'copilot-small-en', ...SMALL, ...EN, hash: 'copilot' },
  { name: 'models-small-en', ...SMALL, ...EN, hash: 'models' },
  { name: 'waiting-small-en', ...SMALL, ...EN, hash: 'waiting' },
  { name: 'pr-small-en', ...SMALL, ...EN, hash: 'pr' },
  { name: 'pr-open-small-en', ...SMALL, ...EN, hash: 'pr-open' },
  { name: 'code-hosts-small-en', ...SMALL, ...EN, hash: 'code-hosts' },
  { name: 'private-small-en', ...SMALL, ...EN, hash: 'private' },
  { name: 'escouade-yml-pending-small-en', ...SMALL, ...EN, hash: 'escouade-yml-pending' },
  { name: 'settings-voice-online-small-en', ...SMALL, ...EN, hash: 'settings-voice-online' },
  { name: 'voice-question-small-en', ...SMALL, ...EN, hash: 'voice-question' },
  { name: 'overage-small-en', ...SMALL, ...EN, hash: 'overage' },
  { name: 'agent-menu-small-en', ...SMALL, ...EN, hash: 'agent-menu' },
  { name: 'opencode-view-small-en', ...SMALL, ...EN, hash: 'opencode-view' },
  // The projects' rail (ESC-158): many projects, a tile hovered and one dragged, a tile's menu, « + », macOS's title bar.
  { name: 'rail', ...BIG, hash: 'rail' },
  { name: 'rail-menu', ...BIG, hash: 'rail-menu' },
  { name: 'rail-add', ...BIG, hash: 'rail-add' },
  { name: 'agents-mac', ...BIG, os: 'mac' },
  { name: 'rail-small', ...SMALL, hash: 'rail' },
  { name: 'rail-small-en', ...SMALL, ...EN, hash: 'rail' },
  { name: 'rail-menu-small-en', ...SMALL, ...EN, hash: 'rail-menu' },
  { name: 'rail-add-small-en', ...SMALL, ...EN, hash: 'rail-add' },
  // The tile made one's own (ESC-167): letters chosen, an opaque logo, a transparent one, an emoji, then the setting.
  { name: 'tile', ...BIG, hash: 'tile' },
  { name: 'tile-settings', ...BIG, hash: 'tile-settings' },
  { name: 'tile-small', ...SMALL, hash: 'tile' },
  { name: 'tile-settings-small-en', ...SMALL, ...EN, hash: 'tile-settings' },
  // The rail's width and the labels (ESC-168): labels under the tiles (72 px), the rail at 300 px with every name on the
  // right, the setting; at 1028 px the rail is held to the window's room.
  { name: 'labels', ...BIG, hash: 'labels' },
  { name: 'labels-wide', ...BIG, hash: 'labels-wide' },
  { name: 'labels-settings', ...BIG, hash: 'labels-settings' },
  { name: 'labels-small', ...SMALL, hash: 'labels' },
  { name: 'labels-wide-small-en', ...SMALL, ...EN, hash: 'labels-wide' },
  { name: 'labels-settings-small-en', ...SMALL, ...EN, hash: 'labels-settings' },
  // The sidebar's width and the side panel's × (ESC-204): dragged to 400 px, its edge lit, the × hovered; at its narrowest;
  // each at 1440×900 and 1028×779 (held to the window there), dark and light.
  ...['side-wide', 'side-narrow'].flatMap((h) => [
    { name: h, ...BIG, hash: h },
    { name: h + '-small', ...SMALL, hash: h },
  ]),
  // A project of several git repositories (ESC-169): the folder holds front, api, infra and docs.
  ...['repos', 'repos-history', 'repos-branch', 'repos-commit', 'repos-merge', 'repos-pr', 'repos-board', 'repos-wizard', 'repos-settings', 'repos-new-agent', 'repos-editor', 'repos-run', 'repos-overview'].map((h) => ({ name: h, ...BIG, hash: h })),
  ...['repos', 'repos-two', 'repos-board', 'repos-merge', 'repos-branch'].map((h) => ({ name: h + '-small', ...SMALL, hash: h })),
  // The shared Kanban (ESC-190): Bob's board with Alice's tickets, the card's menu, the form, the first launch, the settings,
  // the files to commit, a ticket's file, what can go wrong; each at 1440×900 and 1028×779, dark and light.
  ...SHARE.map((h) => ({ name: h, ...BIG, hash: h })),
  ...SHARE.map((h) => ({ name: h + '-small', ...SMALL, hash: h })),
  // The loops of a project (ESC-191): the workflow tab (GSD), the history folded, the settings, a loop of one prompt,
  // nothing found, the edge cases; each at 1440 and 1028 px.
  ...['loops', 'loops-history', 'loops-settings', 'loops-simple', 'loops-empty', 'loops-edge', 'loops-next'].flatMap((h) => [
    { name: h, ...BIG, hash: h },
    { name: h + '-small', ...SMALL, hash: h },
  ]),
  { name: 'loops-settings-steps', ...BIG, hash: 'loops-settings-steps' },
  // The Diagram view of a workflow (ESC-245): GSD, a workflow with choices, a loop of one prompt, « Tickets », enlarged,
  // « Copier en Mermaid », and the comparison with Mermaid; each at 1440 and 1028 px, dark and light.
  ...DIAGRAM.flatMap((h) => [
    { name: h, ...BIG, hash: h },
    { name: h + '-small', ...SMALL, hash: h },
  ]),
  // The plugins' store in the app (ESC-202): Réglages › Plugins › « Parcourir le store », a plugin's page, the install window
  // (verified, then not), the installed plugins with an update not yet verified and one withdrawn; each at 1440 and 1028 px.
  ...['store', 'store-plugin', 'store-install', 'store-unverified', 'store-installed'].flatMap((h) => [
    { name: h, ...BIG, hash: h },
    { name: h + '-small', ...SMALL, hash: h },
  ]),
  // The theme selector, on Système (its default): the window follows the emulated system theme.
  { name: 'settings-app', ...BIG, hash: 'settings-app', system: true },
];
const LIGHT_SMALL = ['kanban-small', 'pr-small-en', 'models-small-en', 'waiting-small-en', 'private-small-en', 'agents-small', 'git-small', 'overview-small', 'settings-small', 'agents-small-en', 'quota-small-en', 'terminal-view-small-en', 'settings-harness-small-en', 'rail-small', 'rail-small-en', 'tile-small', 'tile-settings-small-en', 'labels-small', 'labels-wide-small-en', 'labels-settings-small-en', 'repos-small', 'repos-two-small', 'repos-board-small', 'repos-merge-small', 'repos-branch-small', ...['loops', 'loops-history', 'loops-settings', 'loops-simple', 'loops-empty', 'loops-edge', 'loops-next'].map((h) => h + '-small'), ...SHARE.map((h) => h + '-small'), ...DIAGRAM.map((h) => h + '-small'), ...['store', 'store-plugin', 'store-install', 'store-unverified', 'store-installed'].map((h) => h + '-small'), 'side-wide-small', 'side-narrow-small'];
shots.push(
  ...shots
    .filter((s) => (s.width === BIG.width && !s.lang) || LIGHT_SMALL.includes(s.name))
    .map((s) => ({ ...s, name: s.name.replace(/(-en)?$/, '-light$1'), theme: 'light' })),
);
const only = process.argv.slice(2);

const errors = [];
const browser = await chromium.launch();
for (const s of shots.filter((x) => !only.length || only.includes(x.name))) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
  // A script error would leave a screen half drawn: the capture fails instead.
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  const theme = s.theme ?? 'dark';
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  const query = new URLSearchParams({ theme: s.system ? 'system' : theme, ...(s.lang ? { lang: s.lang } : {}), ...(s.os ? { os: s.os } : {}) });
  await page.goto(`${url}?${query}${s.hash ? `#${s.hash}` : ''}`);
  await page.evaluate(() => document.fonts.ready);
  // A click leaves the mouse on its target: moved away, so no hover bubble stays on the capture.
  if (s.click) (await page.click(s.click), await page.mouse.move(s.width - 10, s.height / 2));
  await page.waitForTimeout(300);
  if (s.hover) await page.hover(s.hover);
  const out = join(dir, `${s.name}.png`);
  await page.screenshot({ path: out });
  console.log(out);
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
