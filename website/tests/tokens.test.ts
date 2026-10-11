import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../app/assets/main.css', import.meta.url), 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))![1];

/** WCAG relative luminance of #rrggbb. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

it('keeps every text colour readable on the page and on its surfaces (WCAG AA, 4.5:1)', () => {
  for (const ground of ['bg', 'surface', 'surface-2']) {
    for (const t of ['text', 'muted', 'dim']) expect(contrast(token(t), token(ground)), `${t} on ${ground}`).toBeGreaterThanOrEqual(4.5);
  }
});

it('keeps the main action’s words readable on its teal, at rest and under the pointer', () => {
  for (const teal of ['brand', 'brand-hi']) expect(contrast(token('ink'), token(teal)), teal).toBeGreaterThanOrEqual(4.5);
});
