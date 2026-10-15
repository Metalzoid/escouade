import { describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { keyLabel, osOf, primaryKey } from './platform';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('platform', () => {
  it('tells the system from what the WebView says of it', () => {
    // WebView2, WKWebView, WebKitGTK.
    expect(osOf('Win32')).toBe('windows');
    expect(osOf('MacIntel')).toBe('mac');
    expect(osOf('Linux x86_64')).toBe('linux');
    // Without a platform, the user agent: the « darwin » jsdom says under macOS is no Windows.
    expect(osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('windows');
    expect(osOf('Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0')).not.toBe('windows');
    expect(osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('mac');
    expect(osOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15')).toBe('linux');
  });

  it('uses Cmd on macOS and Ctrl elsewhere', () => {
    expect(primaryKey(key({ key: 'j', metaKey: true }), true)).toBe(true);
    expect(primaryKey(key({ key: 'j', ctrlKey: true }), true)).toBe(false);
    expect(primaryKey(key({ key: 'j', ctrlKey: true }), false)).toBe(true);
    expect(primaryKey(key({ key: 'j', metaKey: true }), false)).toBe(false);
  });

  it('writes shortcuts the macOS way', () => {
    expect(keyLabel('Ctrl+J', true)).toBe('⌘J');
    expect(keyLabel('Ctrl+Shift+F', true)).toBe('⇧⌘F');
    expect(keyLabel('Ctrl+Maj+L', true)).toBe('⇧⌘L');
    expect(keyLabel('Ctrl+Tab', true)).toBe('Ctrl+Tab');
    expect(keyLabel('Ctrl+J', false)).toBe('Ctrl+J');
  });

  it('names the keys in French, whichever way the shortcut is written', () => {
    expect(keyLabel('Ctrl+Shift+F', false)).toBe('Ctrl+Maj+F');
    expect(keyLabel('Ctrl+Enter', false)).toBe('Ctrl+Entrée');
    expect(keyLabel('Ctrl+Maj+Entrée', false)).toBe('Ctrl+Maj+Entrée');
    expect(keyLabel('Esc', false)).toBe('Échap');
    expect(keyLabel('Ctrl+Entrée', true)).toBe('⌘Entrée');
    expect(keyLabel('Ctrl+,', false)).toBe('Ctrl+,');
  });

  it('names the keys in English once the interface is', () => {
    setLang('en');
    expect(keyLabel('Ctrl+Maj+F', false)).toBe('Ctrl+Shift+F');
    expect(keyLabel('Ctrl+Entrée', false)).toBe('Ctrl+Enter');
    expect(keyLabel('Échap', false)).toBe('Esc');
    expect(keyLabel('Ctrl+Maj+Entrée', true)).toBe('⇧⌘Enter');
    expect(keyLabel('Alt+1', false)).toBe('Alt+1');
  });
});
