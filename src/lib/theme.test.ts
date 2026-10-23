import { describe, expect, it } from 'vitest';
import { applyTheme, BRAND, PROJECT_COLORS, tint } from './theme';

describe('the tint of the window', () => {
  const p = () => document.documentElement.style.getPropertyValue('--p');

  it('is the active project’s colour, and Escouade’s teal over every project (the overview, the stats) or none', () => {
    applyTheme(PROJECT_COLORS[2]);
    expect(p()).toBe('oklch(0.72 0.12 200)');
    expect(tint()).toBe('oklch(0.72 0.12 200)');
    applyTheme(null);
    expect(p()).toBe(BRAND);
    expect(BRAND).toBe('oklch(0.74 0.115 190)');
  });

  it('glides from one colour to the next: --p is a registered colour, animated in 0.7 s, and not with reduced motion', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/app.css', 'utf8');
    expect(css).toMatch(/@property --p \{\s*syntax: '<color>';\s*inherits: true;/);
    expect(css).toMatch(/transition: --p 0\.7s var\(--ease\);/);
    expect(css).toMatch(/--ease: cubic-bezier\(0\.16, 1, 0\.3, 1\);/);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*transition: none;/);
    expect(reduced).toMatch(/animation-duration: 0\.01ms !important;/);
  });
});
