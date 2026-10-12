// Captures the preview beside it: `node design/app-redesign/render.mjs [name…]` writes each screen at the app's
// default size (1440×900), a few at the CI window's size (1028×779), and another project's tint.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(dir, 'index.html')).href;
const BIG = { width: 1440, height: 900 };
const SMALL = { width: 1028, height: 779 };
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
];
const only = process.argv.slice(2);

const browser = await chromium.launch();
for (const s of shots.filter((x) => !only.length || only.includes(x.name))) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(s.hash ? `${url}#${s.hash}` : url);
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
