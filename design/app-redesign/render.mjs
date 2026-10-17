// Captures the preview beside it: `node design/app-redesign/render.mjs [name…]` writes each screen at the app's
// default size (1440×900), a few at the CI window's size (1028×779), another project's tint, and the screens of lot 0
// (ESC-116) in French and, where labels are tight, in English (`-en`, index.html?lang=en).

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(dir, 'index.html')).href;
const BIG = { width: 1440, height: 900 };
const SMALL = { width: 1028, height: 779 };
const EN = { lang: 'en' };
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
  { name: 'tint-studio-web', ...BIG, click: '.tab[data-hue="300"]' },
  { name: 'agents-small', ...SMALL },
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
];
const only = process.argv.slice(2);

const errors = [];
const browser = await chromium.launch();
for (const s of shots.filter((x) => !only.length || only.includes(x.name))) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
  // A script error would leave a screen half drawn: the capture fails instead.
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${url}${s.lang ? `?lang=${s.lang}` : ''}${s.hash ? `#${s.hash}` : ''}`);
  await page.evaluate(() => document.fonts.ready);
  if (s.click) await page.click(s.click);
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
