// Captures the store's preview beside it: `node design/store/render.mjs [name…]` writes each page (#home, #search,
// #plugin, #account, #submit, #review) at 1440×900, at 1028×779 (`-small`) and on a phone, 390×844 (`-mobile`), each
// dark then light (`-light`, index.html?theme=light).

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(dir, 'index.html')).href;
const SIZES = [
  ['', { width: 1440, height: 900 }],
  ['-small', { width: 1028, height: 779 }],
  ['-mobile', { width: 390, height: 844 }],
];
const PAGES = ['home', 'search', 'plugin', 'account', 'submit', 'review'];
const shots = PAGES.flatMap((p) =>
  SIZES.flatMap(([s, v]) =>
    ['dark', 'light'].map((theme) => ({ name: `store-${p}${s}${theme === 'light' ? '-light' : ''}`, hash: p, theme, ...v })),
  ),
);
const only = process.argv.slice(2);

const errors = [];
const browser = await chromium.launch();
for (const s of shots.filter((x) => !only.length || only.includes(x.name))) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.width < 500 ? 2 : 1 });
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: s.theme });
  await page.goto(`${url}?theme=${s.theme}#${s.hash}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
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
