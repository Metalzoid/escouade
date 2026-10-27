// The comparison of ESC-245: the four workflows of diagram.js rendered by Mermaid, in the tokens of the design, dark and
// light, written to mermaid/*.svg for the preview (#loops-diagram-compare), with the time each render took.
// `node design/app-redesign/mermaid.mjs <path to mermaid.min.js>`: Mermaid is no dependency of the app before the build.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname(fileURLToPath(import.meta.url));
const lib = process.argv[2];
if (!lib) throw new Error('usage: node mermaid.mjs <mermaid.min.js>');
mkdirSync(join(dir, 'mermaid'), { recursive: true });

// The tokens of DESIGN.md, the project's tint left out (Mermaid takes plain colors, not var()).
const THEMES = {
  dark: { bg: '#0e0f11', node: '#15161a', line: '#3a3c42', text: '#f7f8f8', muted: '#989da6', edge: '#6d717a', label: '#1b1c20' },
  light: { bg: '#fdfdfd', node: '#f4f5f7', line: '#c5c8ce', text: '#15171c', muted: '#555a63', edge: '#8a8e96', label: '#ffffff' },
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: readFileSync(lib, 'utf8') });
await page.addScriptTag({ path: join(dir, 'diagram.js') });
const report = {};
for (const [theme, c] of Object.entries(THEMES)) {
  for (const key of ['gsd', 'ship', 'ralph', 'tickets']) {
    const out = await page.evaluate(
      async ({ key, c, theme }) => {
        const code = window.Diagram.toMermaid(window.Diagram.WF[key]);
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'Inter, Segoe UI, sans-serif',
          flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false, nodeSpacing: 24, rankSpacing: 34 },
          themeVariables: {
            darkMode: theme === 'dark',
            background: c.bg,
            fontSize: '12.5px',
            primaryColor: c.node,
            primaryBorderColor: c.line,
            primaryTextColor: c.text,
            secondaryColor: c.node,
            tertiaryColor: c.bg,
            lineColor: c.edge,
            edgeLabelBackground: c.label,
            textColor: c.muted,
          },
        });
        const t0 = performance.now();
        const { svg: html } = await window.mermaid.render(`m-${key}-${theme}`, code);
        const ms = performance.now() - t0;
        // Mermaid writes HTML (`<br>`): as XML, for an <img> to show it.
        const host = document.createElement('div');
        host.innerHTML = html;
        const svg = new XMLSerializer().serializeToString(host.firstElementChild);
        return { svg, ms, code };
      },
      { key, c, theme },
    );
    writeFileSync(join(dir, 'mermaid', `${key}-${theme}.svg`), out.svg);
    if (theme === 'dark') writeFileSync(join(dir, 'mermaid', `${key}.mmd`), out.code + '\n');
    const w = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(out.svg);
    report[`${key}-${theme}`] = { ms: Math.round(out.ms), width: w && Math.round(+w[1]), height: w && Math.round(+w[2]) };
  }
}
// A step name set as a trap: it must neither run nor break the schema.
const trap = await page.evaluate(async () => {
  const w = structuredClone(window.Diagram.WF.gsd);
  w.steps[0].name = '<img src=x onerror="window.__pwned=1">"]-->x click s1 call alert(1) %%';
  w.steps[1].cmd = 'javascript:alert(1)';
  const code = window.Diagram.toMermaid(w);
  window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } });
  const { svg } = await window.mermaid.render('m-trap', code);
  const host = document.createElement('div');
  host.innerHTML = svg;
  document.body.append(host);
  await new Promise((r) => setTimeout(r, 200));
  return { pwned: !!window.__pwned, img: !!host.querySelector('img'), nodes: host.querySelectorAll('g.node').length, code };
});
console.log(JSON.stringify({ report, trap }, null, 2));
await browser.close();
