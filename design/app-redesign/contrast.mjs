// Checks the preview's colours in both themes: `node design/app-redesign/contrast.mjs [--verbose]`. For every project
// colour (PROJECT_COLORS, then Escouade's teal of the overview and the stats), each text token is read by the browser on
// each surface it sits on (hovers, the waiting card and the project's light included) and must reach WCAG AA, 4.5:1;
// marks that are not text (dots, rings) must reach 3:1. The worst ratio of each pair is printed. The light theme must pass
// (exit code 1 otherwise); the dark one, validated before and left as it is by ESC-129, prints its shortfalls for lot 1.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(dir, 'index.html')).href;
const verbose = process.argv.includes('--verbose');

// src/lib/theme.ts, PROJECT_COLORS; then BRAND of the preview (overview, stats).
const HUES = [48, 300, 200, 150, 250, 0, 25, 70, 110, 175, 225, 275, 325];
const COLORS = [...HUES.map((h) => [`projet ${h}`, `oklch(0.72 0.12 ${h})`]), ['gris', 'oklch(0.8 0.02 60)'], ['teal', 'oklch(0.74 0.115 190)']];

// A surface is a stack of layers, bottom first; each layer a CSS colour, translucent or not.
const FRAME = ['var(--frame)'];
const PANEL = ['var(--panel)'];
const S = {
  cadre: FRAME,
  'cadre + lumière': [...FRAME, 'color-mix(in oklch, var(--p) var(--glow), transparent)'],
  'cadre + survol': [...FRAME, 'var(--hover)'],
  panneau: PANEL,
  'panneau + survol': [...PANEL, 'var(--hover)'],
  relief: ['var(--raise)'],
  'relief 2': ['var(--raise-2)'],
  puits: ['var(--well)'],
  'carte qui attend': [...FRAME, 'var(--wait-bg)'],
  'puce du projet': [...PANEL, 'var(--p-soft)'],
};
const ALL = Object.keys(S);
const PLAIN = ['cadre', 'cadre + lumière', 'cadre + survol', 'panneau', 'panneau + survol', 'relief', 'relief 2', 'puits'];
const CODE = ['puits', 'relief', 'panneau'];
// [token, surfaces, minimum]
const TEXT = 4.5;
const MARK = 3;
const PAIRS = [
  ...['--text', '--soft', '--muted', '--dim'].map((t) => [t, ALL, TEXT]),
  ['--text-ai', ['panneau', 'puits'], TEXT],
  ['--p-ink', PLAIN, TEXT],
  ['--run', PLAIN, TEXT],
  ['--wait', [...PLAIN, 'carte qui attend'], TEXT],
  ['--del', PLAIN, TEXT],
  ['--add', [...PLAIN], TEXT],
  ['--git-m', PLAIN, TEXT],
  ['--warn-ink', PLAIN, TEXT],
  ['--teal-ink', PLAIN, TEXT],
  ['--teal-ink-2', PLAIN, TEXT],
  ['--done', PLAIN, TEXT],
  // Code, diffs, the terminal (xterm) and the editor (CodeMirror).
  ...['--code-fg', '--code-dim', '--syn-k', '--syn-f', '--syn-s', '--syn-t', '--syn-n', '--ansi-y', '--ansi-cy', '--ansi-cy-2', '--add', '--del'].map((t) => [t, CODE, TEXT]),
  // Marks: state dots, empty rings, the logo's teal. The project's own colour is the product's, kept as it is: its dot
  // and its bars always carry the project's name.
  ...['--idle', '--ring', '--brand'].map((t) => [t, PLAIN, MARK]),
];
// Text on a filled colour: [label, text, background layers].
const ON = [
  ['bouton principal', '--on-primary', ['var(--primary)']],
  ['bouton principal survolé', '--on-primary', ['var(--primary-hover)']],
  ['pastille qui attend', '--on-wait', ['var(--wait)']],
  // A project's tile on the rail (ESC-158): its initials on its own colour, for every project colour.
  ['initiales d’une tuile', '--on-tile', ['var(--p)']],
  ['initiales d’une tuile survolée', '--on-tile', ['color-mix(in oklch, var(--p) 88%, var(--text))']],
  ['sélection du terminal', '--term-sel-fg', ['var(--term-sel-bg)']],
  ['occurrence courante (éditeur)', '--on-hit', ['var(--well)', 'color-mix(in oklch, var(--p) 55%, transparent)']],
  ['texte sélectionné', '--text', ['var(--panel)', 'color-mix(in oklch, var(--p) var(--sel), transparent)']],
];

const browser = await chromium.launch();
const page = await browser.newPage();
let failures = 0;
for (const theme of ['dark', 'light']) {
  await page.goto(`${url}?theme=${theme}`);
  const rows = await page.evaluate(
    ({ COLORS, S, PAIRS, ON }) => {
      // --p glides from one project to the next: no glide here, each colour is read at once.
      document.documentElement.style.transition = 'none';
      const probe = document.createElement('div');
      document.body.append(probe);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // The browser resolves the token (color-mix, relative colours, var()), the canvas composites the layers.
      const resolve = (css) => {
        probe.style.color = css;
        return getComputedStyle(probe).color;
      };
      const paint = (layers) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1, 1);
        for (const l of layers) {
          ctx.fillStyle = resolve(l);
          ctx.fillRect(0, 0, 1, 1);
        }
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
      };
      const out = [];
      for (const [name, c] of COLORS) {
        document.documentElement.style.setProperty('--p', c);
        for (const [token, surfaces, min] of PAIRS)
          for (const s of surfaces) {
            const bg = paint(S[s]);
            out.push({ pair: `${token} sur ${s}`, color: name, min, r: ratio(paint([...S[s], `var(${token})`]), bg) });
          }
        for (const [label, token, layers] of ON) {
          const bg = paint(layers);
          out.push({ pair: `${token} sur ${label}`, color: name, min: 4.5, r: ratio(paint([...layers, `var(${token})`]), bg) });
        }
      }
      return out;
    },
    { COLORS, S, PAIRS, ON },
  );
  // The worst colour of each pair.
  const worst = new Map();
  for (const row of rows) if (!worst.has(row.pair) || row.r < worst.get(row.pair).r) worst.set(row.pair, row);
  const bad = [...worst.values()].filter((w) => w.r < w.min);
  if (theme === 'light') failures += bad.length;
  console.log(`\n${theme === 'dark' ? 'Sombre' : 'Clair'} : ${worst.size} paires × ${COLORS.length} couleurs, ${bad.length} sous le seuil`);
  for (const w of verbose ? worst.values() : bad)
    console.log(`  ${w.r < w.min ? 'ÉCHEC' : 'ok   '} ${w.r.toFixed(2).padStart(5)} (≥ ${w.min})  ${w.pair}  [pire : ${w.color}]`);
}
await browser.close();
process.exit(failures ? 1 : 0);
