// The foundations of the 2.0 design (ESC-71): the icons, the marks (harness, favorite, private project), the segments,
// and what a menu says of an entry it cannot offer.

import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ICONS } from '../lib/icons';
import { menu } from '../lib/menu.svelte';
import { agent, resetApp } from '../test/ipc';
import ContextMenu from './ContextMenu.svelte';
import Dropdown from './Dropdown.svelte';
import EngineMark from './EngineMark.svelte';
import Icon from './Icon.svelte';
import IconSprite from './IconSprite.svelte';
import PrivateMark from './PrivateMark.svelte';
import Star from './Star.svelte';

describe('the icons', () => {
  it('are in the page once, each a symbol drawn on a 16 grid, with the preview’s paths', () => {
    const { container } = render(IconSprite);
    const symbols = [...container.querySelectorAll('symbol')];
    expect(symbols.map((s) => s.id)).toEqual(Object.keys(ICONS).map((n) => `i-${n}`));
    expect(symbols.every((s) => s.getAttribute('viewBox') === '0 0 16 16')).toBe(true);
    // Drawn in the SVG namespace, as the preview has them.
    const check = container.querySelector('#i-check path');
    expect(check?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(check).toHaveAttribute('d', 'M3.5 8.5l3 3 6-6.5');
    // Every icon the app draws in place of a character: × ✓ ↑ ↓ ▾ ▶ ▸ ■ ⌕ ⟳ ⚙.
    for (const n of [
      'close',
      'check',
      'up',
      'down',
      'right',
      'play',
      'stop',
      'search',
      'restart',
      'sliders',
      'lock',
      'star',
      'file',
      'user',
      'shield',
    ])
      expect(ICONS).toHaveProperty(n);
  });

  it('shows one by its name, in the colour of its text, saying nothing to a screen reader', () => {
    const { container } = render(Icon, { name: 'search', size: 14 });
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '14');
    expect(svg.querySelector('use')).toHaveAttribute('href', '#i-search');
  });
});

describe('the marks', () => {
  beforeEach(() => resetApp());

  it('name the four harnesses in a word, once agents run on two of them', () => {
    const { container, unmount } = render(EngineMark, { engine: 'codex' });
    // One harness: the mark says nothing.
    expect(container.querySelector('[data-engine]')).toBeNull();
    unmount();
    resetApp({ agents: [agent({ id: 'a' }), agent({ id: 'b', engine: 'opencode' })] });
    const words = (['claude', 'codex', 'opencode', 'copilot'] as const).map((engine) => {
      const r = render(EngineMark, { engine });
      const mark = r.container.querySelector('[data-engine]')!;
      const word = [mark.textContent, mark.getAttribute('aria-label')];
      r.unmount();
      return word;
    });
    expect(words).toEqual([
      ['Claude', 'Harness : Claude Code'],
      ['Codex', 'Harness : Codex'],
      ['OpenCode', 'Harness : OpenCode'],
      ['Copilot', 'Harness : Copilot CLI'],
    ]);
  });

  it('draw a favorite’s star filled, another’s in outline, and a private project’s lock, named', () => {
    const off = render(Star, { on: false }).container.querySelector('svg')!;
    const on = render(Star, { on: true }).container.querySelector('svg')!;
    expect(off).not.toHaveClass('on');
    expect(on).toHaveClass('on');
    expect(on.querySelector('use')).toHaveAttribute('href', '#i-star');
    render(PrivateMark);
    const lock = screen.getByRole('img', { name: /^Projet privé/ });
    expect(lock.querySelector('use')).toHaveAttribute('href', '#i-lock');
    expect(lock.textContent).toBe('');
  });
});

describe('an entry a menu cannot offer', () => {
  beforeEach(() => menu.close());

  it('stays in its place in a context menu, greyed, its reason written under it', async () => {
    render(ContextMenu);
    menu.open = {
      x: 10,
      y: 10,
      items: [
        { label: 'Lancer…', icon: 'play', onClick: () => {} },
        { label: 'Auto', disabled: true, reason: 'OpenCode n’a pas de mode Auto' },
      ],
    };
    const off = await screen.findByRole('menuitem', { name: /Auto/ });
    expect(off).toBeDisabled();
    expect(off).toHaveTextContent('AutoOpenCode n’a pas de mode Auto');
    expect(screen.getByRole('menuitem', { name: 'Lancer…' }).querySelector('svg use')).toHaveAttribute('href', '#i-play');
  });

  it('stays in its place in a picker, greyed, its reason written under it, and is not picked', async () => {
    const picked: string[] = [];
    render(Dropdown, {
      caption: 'Mode',
      value: 'default',
      open: true,
      onToggle: () => {},
      onPick: (v: string) => picked.push(v),
      options: [
        { value: 'default', label: 'Demander' },
        { value: 'auto', label: 'Auto', disabled: true, reason: 'OpenCode n’a pas de mode Auto' },
      ],
    });
    const [ask, auto] = screen.getAllByRole('menuitemradio');
    expect(auto).toBeDisabled();
    expect(auto).toHaveTextContent('Auto OpenCode n’a pas de mode Auto');
    await userEvent.click(auto);
    expect(picked).toEqual([]);
    // The one chosen is checked by the icon, never by a character.
    expect(ask.querySelector('svg use')).toHaveAttribute('href', '#i-check');
    expect(ask.textContent?.trim()).toBe('Demander');
    expect(within(screen.getByRole('button', { name: /Mode/ })).queryByText('▾')).toBeNull();
  });
});

describe('the segments', () => {
  it('are the common control of the settings’ choices', async () => {
    const { default: Chips } = await import('./settings/Chips.svelte');
    render(Chips, {
      label: 'Thème',
      value: 'system',
      options: [
        { value: 'system', label: 'Système' },
        { value: 'light', label: 'Clair' },
      ],
    });
    const group = screen.getByRole('group', { name: 'Thème' });
    expect(group).toHaveClass('segmented');
    expect(within(group).getByRole('button', { name: 'Système' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the gauges', () => {
  it('draw the microphone’s level in seven bars that grow with the voice, a meter for screen readers', async () => {
    const { default: Level } = await import('./Level.svelte');
    const heights = (level: number) => {
      const r = render(Level, { level, label: 'Niveau du micro' });
      const meter = screen.getByRole('meter', { name: 'Niveau du micro' });
      const out = { now: meter.getAttribute('aria-valuenow'), bars: [...meter.querySelectorAll('i')].map((i) => parseInt(i.style.height)) };
      r.unmount();
      return out;
    };
    const quiet = heights(0);
    const loud = heights(1);
    expect(quiet.now).toBe('0');
    expect(loud.now).toBe('100');
    expect(loud.bars).toHaveLength(7);
    expect(loud.bars.every((h, i) => h > quiet.bars[i])).toBe(true);
    // Loudest in the middle.
    expect(Math.max(...loud.bars)).toBe(loud.bars[3]);
    expect(heights(3).now).toBe('100');
  });
});
