import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The system's theme, as `prefers-color-scheme` says it, and what listens to its changes. */
function fakeSystem(light: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: light,
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
  };
  vi.stubGlobal('matchMedia', (q: string) => (q === '(prefers-color-scheme: light)' ? query : { matches: false, addEventListener() {} }));
  return {
    set(l: boolean) {
      query.matches = l;
      for (const f of listeners) f();
    },
  };
}

/** The module anew: it keeps the choice it shows, and whether it listens to the system. */
const load = async () => {
  vi.resetModules();
  return import('./appearance');
};

describe('« Thème »', () => {
  let themes: unknown[];
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    themes = [];
    mockWindows('main');
    mockIPC((cmd, args) => {
      if (cmd === 'plugin:window|set_theme') themes.push((args as { value: unknown }).value);
    });
  });
  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  it('is Système for anything it does not know, and shows the system’s theme then', async () => {
    const { themeChoice, resolveTheme } = await load();
    expect(['system', 'light', 'dark', 'sepia', null, undefined, 3].map(themeChoice)).toEqual([
      'system',
      'light',
      'dark',
      'system',
      'system',
      'system',
      'system',
    ]);
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('shows, before the first render, the choice the page kept, else the system’s', async () => {
    fakeSystem(true);
    let a = await load();
    a.earlyAppearance();
    expect(document.documentElement.dataset.theme).toBe('light');
    localStorage.setItem(a.THEME_KEY, 'dark');
    a = await load();
    a.earlyAppearance();
    expect(document.documentElement.dataset.theme).toBe('dark');
    // Before the first render: nothing told to the window, which the backend gave its theme.
    expect(themes).toEqual([]);
  });

  it('applies a choice at once, keeps it for the next start, and gives the window its theme only when it changes', async () => {
    fakeSystem(false);
    const a = await load();
    a.earlyAppearance();
    a.applyAppearance('system');
    expect(themes).toEqual([]);
    a.applyAppearance('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(a.shownTheme()).toBe('light');
    expect(localStorage.getItem(a.THEME_KEY)).toBe('light');
    a.applyAppearance('light');
    a.applyAppearance('dark');
    a.applyAppearance('system');
    expect(themes).toEqual(['light', 'dark', null]);
    expect(localStorage.getItem(a.THEME_KEY)).toBe('system');
  });

  it('follows the system’s changes at once while it is Système, and not otherwise', async () => {
    const system = fakeSystem(false);
    const a = await load();
    a.earlyAppearance();
    expect(document.documentElement.dataset.theme).toBe('dark');
    system.set(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    a.applyAppearance('dark');
    system.set(false);
    system.set(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
