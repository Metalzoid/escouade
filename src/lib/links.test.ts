import { openUrl } from '@tauri-apps/plugin-opener';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The system's browser is never started: what it was asked to open is looked at.
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));

import { guardLinks, openOutside, opensOutside, terminalLinks } from './links';
import { handleMarkdownClick, renderMarkdown } from './markdown';

const opened = () => vi.mocked(openUrl).mock.calls.map((c) => c[0]);

beforeEach(() => vi.mocked(openUrl).mockClear());

describe('opensOutside', () => {
  it.each([
    ['https://example.com/pr/1', true],
    ['http://localhost:4111/connexion', true],
    ['MAILTO:jean@example.com', true],
    [' https://example.com ', true],
    ['', false],
    ['#x', false],
    ['src/a.ts', false],
    ['//evil.com', false],
    ['javascript:alert(1)', false],
    ['file:///C:/x', false],
    ['tel:1', false],
    ['ftp://example.com', false],
  ])('%j opens outside: %s', (href, expected) => {
    expect(opensOutside(href)).toBe(expected);
  });
});

describe('openOutside', () => {
  it('asks the system to open a web page or an address', () => {
    openOutside('https://example.com/pr/1');
    openOutside('mailto:jean@example.com');
    expect(opened()).toEqual(['https://example.com/pr/1', 'mailto:jean@example.com']);
  });

  it('opens nothing else', () => {
    openOutside('file:///C:/x');
    openOutside('javascript:alert(1)');
    openOutside('');
    expect(opened()).toEqual([]);
  });

  it('says nothing when the system cannot open it', async () => {
    // Not itself a promise: the mock would otherwise handle the refusal on its own account.
    const refused = Promise.reject(new Error('no browser'));
    vi.mocked(openUrl).mockReturnValueOnce({ catch: refused.catch.bind(refused) } as unknown as Promise<void>);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      openOutside('https://example.com');
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('terminalLinks', () => {
  it('opens a hyperlink of a terminal outside, without xterm.js’s own confirm() and window.open()', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const open = vi.spyOn(window, 'open');
    terminalLinks.activate(new MouseEvent('click'), 'https://example.com/pr/1', {} as never);
    expect(opened()).toEqual(['https://example.com/pr/1']);
    expect(confirm).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves the protocols xterm.js does not offer as links on their own', () => {
    expect(terminalLinks.allowNonHttpProtocols).toBeFalsy();
  });
});

describe('guardLinks', () => {
  let dispose: () => void;
  let page: HTMLElement;

  beforeEach(() => {
    dispose = guardLinks(document);
    page = document.body.appendChild(document.createElement('div'));
  });
  afterEach(() => {
    dispose();
    page.remove();
  });

  /** An anchor of the page, the way the markdown of a reply builds one. */
  function link(href: string | null, html = 'lien') {
    const a = document.createElement('a');
    if (href !== null) a.setAttribute('href', href);
    a.innerHTML = html;
    page.appendChild(a);
    return a;
  }
  const click = (init: MouseEventInit = {}) => new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  const aux = (button: number) => new MouseEvent('auxclick', { bubbles: true, cancelable: true, button });

  it.each(['https://example.com/pr/1', 'http://localhost:4111', 'mailto:jean@example.com'])(
    'opens %s outside on a click, once, and keeps the window where it is',
    (href) => {
      const e = click();
      link(href).dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(opened()).toEqual([href]);
    },
  );

  it.each([{ ctrlKey: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }])(
    'opens it outside, once, whatever the key held (%o)',
    (mod) => {
      const e = click(mod);
      link('https://example.com').dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(opened()).toEqual(['https://example.com']);
    },
  );

  it('opens it on a single click (a count of 1)', () => {
    const e = click({ detail: 1 });
    link('https://example.com').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it.each([2, 3])('stops the click number %i of a double or triple click, and opens nothing more', (detail) => {
    const e = click({ detail });
    link('https://example.com').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual([]);
  });

  it('opens it once on a double click', () => {
    const a = link('https://example.com');
    a.dispatchEvent(click({ detail: 1 }));
    a.dispatchEvent(click({ detail: 2 }));
    expect(opened()).toEqual(['https://example.com']);
  });

  it('opens it on a click with no count, as the Enter of a link gives', () => {
    const e = click({ detail: 0 });
    link('https://example.com').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it('opens it on a middle click', () => {
    const e = aux(1);
    link('https://example.com').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it('only stops a right click, whose menu is the app’s to give', () => {
    const e = aux(2);
    link('https://example.com').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual([]);
  });

  it('opens it on the Enter of a focused link, which the browser turns into a click', () => {
    const a = link('https://example.com');
    const seen: Event[] = [];
    document.addEventListener('click', (e) => seen.push(e), { once: true });
    a.click();
    expect(seen[0].defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it('handles a click on what is inside the link', () => {
    const a = link('https://example.com', 'voir <code>PR 1</code>');
    const e = click();
    a.querySelector('code')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it('handles a click whose target is the text of the link', () => {
    const a = link('https://example.com', 'voir la PR');
    const e = click();
    a.firstChild!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it('handles the links of an image map too', () => {
    const map = page.appendChild(document.createElement('map'));
    const area = map.appendChild(document.createElement('area'));
    area.setAttribute('href', 'https://example.com');
    const e = click();
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com']);
  });

  it.each(['', '#x', 'src/a.ts', '//evil.com', 'javascript:alert(1)', 'file:///C:/x'])(
    'stops a click on a link to %j, which would take the window away or lead nowhere, and opens nothing',
    (href) => {
      const e = click();
      link(href).dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(opened()).toEqual([]);
    },
  );

  it('leaves alone what is no link: an anchor without href, a button, the page itself', () => {
    const anchor = click();
    link(null).dispatchEvent(anchor);
    const button = click();
    page.appendChild(document.createElement('button')).dispatchEvent(button);
    const doc = click();
    document.dispatchEvent(doc);
    expect([anchor.defaultPrevented, button.defaultPrevented, doc.defaultPrevented]).toEqual([false, false, false]);
    expect(opened()).toEqual([]);
  });

  it('opens a link of a rendered reply once, though the reply handles its own clicks too', () => {
    const md = page.appendChild(document.createElement('div'));
    md.className = 'md';
    md.addEventListener('click', handleMarkdownClick);
    md.innerHTML = renderMarkdown('voir [la PR](https://example.com/pr/1)');
    const e = click();
    md.querySelector('a')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(opened()).toEqual(['https://example.com/pr/1']);
  });

  it('stops the `[text]()` of a rendered reply from reloading the interface', () => {
    const md = page.appendChild(document.createElement('div'));
    md.innerHTML = renderMarkdown('vide [ici]() et [là](#x)');
    const events = [...md.querySelectorAll('a')].map((a) => {
      const e = click();
      a.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(events).toEqual([true, true]);
    expect(opened()).toEqual([]);
  });

  it('runs before the handlers of the app, which see the click already stopped', () => {
    const order: string[] = [];
    const a = link('https://example.com');
    a.addEventListener('click', (e) => order.push(e.defaultPrevented ? 'app after the guard' : 'app before the guard'));
    a.dispatchEvent(click());
    expect(order).toEqual(['app after the guard']);
  });

  it('stops guarding once disposed', () => {
    dispose();
    // A link to the page itself, so that jsdom has no navigation to refuse.
    const e = click();
    link('#x').dispatchEvent(e);
    const m = aux(1);
    link('https://example.com').dispatchEvent(m);
    expect([e.defaultPrevented, m.defaultPrevented]).toEqual([false, false]);
    expect(opened()).toEqual([]);
  });
});
