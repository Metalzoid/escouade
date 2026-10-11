// The guard of `use:tip`: no element of a component takes the browser's tooltip (`title`) any more, whose look is the
// system's and which the keyboard never sees. A prop of a component named `title` is no attribute of the page (the
// component shows it as it likes), nor is the `<title>` of an SVG.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

type Node = { type: string; start: number; name?: string; attributes?: Node[]; [field: string]: unknown };

/** The `title` attributes of the elements of `source`, by line. */
function titles(source: string): number[] {
  const found: number[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const n = node as Node;
    if ((n.type === 'RegularElement' || n.type === 'SvelteElement') && n.attributes) {
      for (const a of n.attributes)
        if (a.type === 'Attribute' && a.name === 'title') found.push(source.slice(0, a.start).split('\n').length);
    }
    for (const [k, v] of Object.entries(n)) if (k !== 'parent' && v && typeof v === 'object') walk(v);
  };
  walk(parse(source, { modern: true }).fragment);
  return found;
}

function components(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return components(path);
    return name.endsWith('.svelte') ? [path] : [];
  });
}

describe('the guard of tooltips', () => {
  it('finds the title of an element, and leaves the prop of a component and the title of an SVG', () => {
    const source =
      '<Modal title="x" />\n<button title={t("a")}>x</button>\n<svg><title>x</title></svg>\n<svelte:element this="b" title="y" />';
    expect(titles(source)).toEqual([2, 4]);
  });

  it('finds no title left in the components: their tooltips are use:tip', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const root = resolve(src, '..');
    const left = components(src).flatMap((file) =>
      titles(readFileSync(file, 'utf8')).map((line) => `${relative(root, file).replace(/\\/g, '/')}:${line}`),
    );
    expect(left).toEqual([]);
  });
});
