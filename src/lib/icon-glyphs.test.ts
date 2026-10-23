// No character of Unicode serves as an icon in the components the 2.0 design has redrawn: they draw the icons of
// lib/icons.ts (Icon.svelte). Each lot of the redesign adds its components here (docs/TODO-2.0.md).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The components redrawn, by lot. */
const REDRAWN = {
  'lot 1 (ESC-71)': [
    'src/components/Icon.svelte',
    'src/components/IconSprite.svelte',
    'src/components/Level.svelte',
    'src/components/EngineMark.svelte',
    'src/components/Star.svelte',
    'src/components/PrivateMark.svelte',
    'src/components/ContextMenu.svelte',
    'src/components/Dropdown.svelte',
    'src/components/settings/Chips.svelte',
    'src/components/settings/Switch.svelte',
    'src/components/settings/SharedMark.svelte',
    'src/components/settings/Row.svelte',
    'src/components/settings/Group.svelte',
    'src/components/settings/ApplicationTab.svelte',
  ],
  'lot 2 (ESC-72)': [
    'src/App.svelte',
    'src/components/TitleBar.svelte',
    'src/components/ProjectRail.svelte',
    'src/components/ProjectTile.svelte',
    'src/components/StatusBar.svelte',
    'src/components/QuotaMeter.svelte',
    'src/components/AccountsPanel.svelte',
    'src/components/Toasts.svelte',
    'src/components/Welcome.svelte',
  ],
};

/**
 * What draws an icon with a character: arrows, mathematical and technical signs, geometric shapes, dingbats,
 * pictographs, and the few others the 1.x interface used (× ✓ ✦ ⧉ ⋯ •).
 */
const ICON_GLYPH = /[×•←-⇿⋯⌀-⏿■-◿☀-➿⟀-⟿⤀-⥿⧉⬀-⯿]|[🌀-🫿]/u;

/** The lines of a component that hold one, outside its comments. */
function glyphs(file: string): string[] {
  const text = readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return text
    .split('\n')
    .map((line, i) => [line.replace(/(^|[^:])\/\/.*$/, '$1'), i + 1] as const)
    .filter(([line]) => ICON_GLYPH.test(line))
    .map(([line, n]) => `${file}:${n}: ${line.trim()}`);
}

describe('the icons of the redrawn components', () => {
  it('knows a glyph used as an icon from a letter', () => {
    expect(['×', '✓', '▾', '▶', '⌕', '⟳', '⚙', '⧉', '✦', '↑', '■'].filter((g) => !ICON_GLYPH.test(g))).toEqual([]);
    expect(['é', '«', '»', '’', '…', '·', '—', '%', '$', '€'].filter((g) => ICON_GLYPH.test(g))).toEqual([]);
  });

  for (const [lot, files] of Object.entries(REDRAWN))
    it(`are drawn, not written, in ${lot}`, () => {
      expect(files.flatMap(glyphs)).toEqual([]);
    });
});
