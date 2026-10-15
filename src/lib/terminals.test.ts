import { createEvent, fireEvent, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, resetApp } from '../test/ipc';

// What xterm.js was given to paste, in the order it came, and the key handlers it was given.
const pasted = vi.hoisted(() => [] as string[]);
const keyHandlers = vi.hoisted(() => [] as ((e: KeyboardEvent) => boolean)[]);

// xterm.js draws on a canvas: stood in for, only the spawn, the keys and what is pasted are looked at.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    options = {};
    unicode = { activeVersion: '' };
    loadAddon() {}
    open() {}
    attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean) {
      keyHandlers.push(handler);
    }
    hasSelection() {
      return false;
    }
    onData() {}
    onResize() {}
    paste(text: string) {
      pasted.push(text);
    }
    dispose() {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() {}
  },
}));

import { app } from './state.svelte';
import { getXTerm, openAgentTerminal, openTerminal, pastedContent } from './terminals';

beforeEach(() => {
  // The theme's colors are read back from a 1px canvas, which jsdom does not draw.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {},
    getImageData: () => ({ data: [0, 0, 0] }),
  } as unknown as CanvasRenderingContext2D);
});

const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
const capture = () => new File([new Uint8Array(PNG)], 'image.png', { type: 'image/png' });

/** A paste's clipboard as the WebView gives it: its text (none: no text/plain) and its files. */
function clipboard(o: { text?: string; files?: File[]; types?: string[] }) {
  const types = o.types ?? [...(o.text === undefined ? [] : ['text/plain']), ...(o.files?.length ? ['Files'] : [])];
  return {
    types,
    files: o.files ?? [],
    getData: (type: string) => (type === 'text/plain' ? (o.text ?? '') : ''),
  };
}

describe('what a paste in Claude Code’s interface carries', () => {
  it('leaves text to the terminal', () => {
    expect(pastedContent(clipboard({ text: 'npm test' }))).toEqual({ kind: 'text', text: 'npm test' });
  });

  it('leaves text to the terminal even with an image beside it (cells of a spreadsheet)', () => {
    expect(pastedContent(clipboard({ text: 'a\tb', files: [capture()] }))).toEqual({ kind: 'text', text: 'a\tb' });
  });

  it('takes a screenshot, an image without text', () => {
    const image = capture();
    expect(pastedContent(clipboard({ files: [image] }))).toEqual({ kind: 'image', files: [image] });
  });

  it('takes the images among the files copied, by their type or their name, in their order', () => {
    const notes = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const photo = new File([new Uint8Array(PNG)], 'photo.JPG', { type: '' });
    const image = capture();
    expect(pastedContent(clipboard({ files: [photo, notes, image] }))).toEqual({ kind: 'image', files: [photo, image] });
  });

  it('leaves files that are no image to the terminal', () => {
    const doc = new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' });
    expect(pastedContent(clipboard({ files: [doc] }))).toEqual({ kind: 'text', text: '' });
  });

  it('takes an empty text, or a blank one beside an image, for none', () => {
    const image = capture();
    expect(pastedContent(clipboard({ text: '', files: [image] }))).toEqual({ kind: 'image', files: [image] });
    // Some applications give a line break with the image they copy.
    expect(pastedContent(clipboard({ text: '\r\n', files: [image] }))).toEqual({ kind: 'image', files: [image] });
    // Alone, a blank is pasted as it is.
    expect(pastedContent(clipboard({ text: ' ' }))).toEqual({ kind: 'text', text: ' ' });
  });

  it('looks at the system’s clipboard when the WebView gives neither text nor file (WebKitGTK)', () => {
    expect(pastedContent(clipboard({}))).toEqual({ kind: 'clipboard' });
    // A browser's « Copier l'image »: the page only sees its HTML.
    expect(pastedContent(clipboard({ types: ['text/html'] }))).toEqual({ kind: 'clipboard' });
    expect(pastedContent(null)).toEqual({ kind: 'clipboard' });
  });
});

describe('pasting in Claude Code’s interface', () => {
  const info = { id: 'tui-1', projectId: '', name: 'agent', shell: 'claude' };
  const PATH = 'C:\\Users\\Jean Dupont\\.escouade\\tui\\pastes\\4f2a.png';

  beforeEach(() => {
    resetApp();
    pasted.length = 0;
  });

  /**
   * The text field of a new terminal, where `paste` pastes and says whether the WebView's paste
   * was stopped; `xterm` counts the pastes xterm.js got (its own `paste` listener stands for it).
   */
  async function terminalField(open: () => Promise<{ id: string }> = () => openAgentTerminal('a1')) {
    const { id } = await open();
    const field = document.createElement('textarea');
    getXTerm(id)!.host.appendChild(field);
    let xterm = 0;
    field.addEventListener('paste', () => xterm++);
    return {
      paste(data: ReturnType<typeof clipboard>) {
        const e = createEvent.paste(field, { clipboardData: data });
        fireEvent(field, e);
        return e.defaultPrevented;
      },
      xterm: () => xterm,
    };
  }

  async function paste(data: ReturnType<typeof clipboard>, open?: () => Promise<{ id: string }>) {
    const field = await terminalField(open);
    const prevented = field.paste(data);
    return { prevented, xterm: () => field.xterm() > 0 };
  }

  it('writes a pasted image to a file of the agent and types its path, which Claude Code takes for the image', async () => {
    const backend = fakeBackend({ agent_terminal: () => info, paste_image: () => PATH });
    const { prevented, xterm } = await paste(clipboard({ files: [capture()] }));
    expect(prevented).toBe(true);
    expect(xterm()).toBe(false);
    await waitFor(() => expect(pasted).toEqual([PATH]));
    expect(backend.called('paste_image')[0].args).toEqual({ id: 'a1', mediaType: 'image/png', data: btoa(String.fromCharCode(...PNG)) });
    expect(backend.called('clipboard_image')).toHaveLength(0);
  });

  it('pastes each image copied on its own, in their order: Claude Code takes one path a paste, spaces and all', async () => {
    const backend = fakeBackend({
      agent_terminal: () => info,
      paste_image: ({ mediaType }: { mediaType: string }) => (mediaType === 'image/png' ? PATH : 'C:\\x\\b.jpg'),
    });
    await paste(clipboard({ files: [capture(), new File([new Uint8Array(PNG)], 'b.jpg', { type: 'image/jpeg' })] }));
    await waitFor(() => expect(pasted).toEqual([PATH, 'C:\\x\\b.jpg']));
    expect(backend.called('paste_image').map((c) => c.args.mediaType)).toEqual(['image/png', 'image/jpeg']);
  });

  it('keeps the order of the pastes: text pasted while an image is being kept comes after it', async () => {
    let keep: (path: string) => void = () => {};
    fakeBackend({ agent_terminal: () => info, paste_image: () => new Promise((r) => (keep = r)) });
    const field = await terminalField();
    expect(field.paste(clipboard({ files: [capture()] }))).toBe(true);
    expect(field.paste(clipboard({ text: ' décris-la' }))).toBe(true);
    expect(field.xterm()).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(pasted).toEqual([]);
    keep(PATH);
    await waitFor(() => expect(pasted).toEqual([PATH, ' décris-la']));
    // Nothing waiting: text goes to xterm.js again.
    expect(field.paste(clipboard({ text: 'npm test' }))).toBe(false);
    expect(field.xterm()).toBe(1);
  });

  it('gives a JPEG copied without a type its type from its name', async () => {
    const backend = fakeBackend({ agent_terminal: () => info, paste_image: () => PATH });
    await paste(clipboard({ files: [new File([new Uint8Array(PNG)], 'photo.jpeg', { type: '' })] }));
    await waitFor(() => expect(backend.called('paste_image')).toHaveLength(1));
    expect(backend.called('paste_image')[0].args.mediaType).toBe('image/jpeg');
  });

  it('leaves pasted text to xterm.js, as before', async () => {
    const backend = fakeBackend({ agent_terminal: () => info, paste_image: () => PATH });
    const { prevented, xterm } = await paste(clipboard({ text: 'npm test', files: [capture()] }));
    expect(prevented).toBe(false);
    expect(xterm()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.called('paste_image')).toHaveLength(0);
    expect(backend.called('clipboard_image')).toHaveLength(0);
    expect(pasted).toEqual([]);
  });

  it('reads the image WebKitGTK leaves out of a paste (Linux) from the system clipboard', async () => {
    const backend = fakeBackend({
      agent_terminal: () => info,
      clipboard_image: () => new Uint8Array(PNG).buffer,
      paste_image: () => '/home/jean/.escouade/tui/pastes/4f2a.png',
    });
    const { prevented, xterm } = await paste(clipboard({}));
    expect(prevented).toBe(true);
    expect(xterm()).toBe(false);
    await waitFor(() => expect(pasted).toEqual(['/home/jean/.escouade/tui/pastes/4f2a.png']));
    expect(backend.called('paste_image')[0].args).toEqual({ id: 'a1', mediaType: 'image/png', data: btoa(String.fromCharCode(...PNG)) });
  });

  it('pastes nothing but an empty paste, as xterm.js did, when the system clipboard holds no image either', async () => {
    const backend = fakeBackend({ agent_terminal: () => info, clipboard_image: () => new ArrayBuffer(0) });
    await paste(clipboard({}));
    await waitFor(() => expect(pasted).toEqual(['']));
    expect(backend.called('clipboard_image')).toHaveLength(1);
    expect(backend.called('paste_image')).toHaveLength(0);
    expect(app.toasts).toEqual([]);
  });

  it('says why when the image cannot be kept', async () => {
    fakeBackend({
      agent_terminal: () => info,
      paste_image: () => Promise.reject('disque plein'),
    });
    await paste(clipboard({ files: [capture()] }));
    await waitFor(() => expect(app.toasts.at(-1)).toMatchObject({ text: 'disque plein', kind: 'error' }));
    expect(pasted).toEqual([]);
  });

  it('refuses an image over 18 MB before reading it, and pastes the others', async () => {
    const backend = fakeBackend({ agent_terminal: () => info, paste_image: () => PATH });
    const huge = new File([new Uint8Array(PNG)], 'ecran-5k.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 18 * 1024 * 1024 + 1 });
    await paste(clipboard({ files: [huge, capture()] }));
    await waitFor(() => expect(pasted).toEqual([PATH]));
    expect(app.toasts.at(-1)).toMatchObject({ text: 'ecran-5k.png dépasse 18 Mo : Claude Code ne la recevra pas.', kind: 'error' });
    expect(backend.called('paste_image')).toHaveLength(1);
  });

  it('leaves the pastes of a shell’s terminal to xterm.js', async () => {
    const backend = fakeBackend({ term_spawn: () => ({ ...info, id: 'sh-1', shell: 'pwsh' }) });
    const { prevented, xterm } = await paste(clipboard({ files: [capture()] }), () => openTerminal('p1', 'pwsh', 'pwsh-1'));
    expect(prevented).toBe(false);
    expect(xterm()).toBe(true);
    expect(backend.called('paste_image')).toHaveLength(0);
  });
});

describe('Ctrl+V in a terminal', () => {
  /** The key handler of a terminal opened on macOS or elsewhere. */
  async function keys(mac: boolean) {
    vi.resetModules();
    vi.doMock('./platform', async (original) => ({ ...(await original<typeof import('./platform')>()), IS_MAC: mac }));
    const terminals = await import('./terminals');
    fakeBackend({ term_spawn: () => ({ id: `t-${mac}`, projectId: 'p1', name: 'zsh-1', shell: 'zsh' }) });
    await terminals.openTerminal('p1', 'zsh', 'zsh-1');
    return keyHandlers.at(-1)!;
  }
  const press = (handler: (e: KeyboardEvent) => boolean, init: KeyboardEventInit) =>
    handler(new KeyboardEvent('keydown', { key: 'v', ...init }));

  afterEach(() => {
    vi.doUnmock('./platform');
    vi.resetModules();
  });

  it('pastes under Windows and Linux: the WebView’s paste follows', async () => {
    expect(press(await keys(false), { ctrlKey: true })).toBe(false);
  });

  it('goes to the terminal under macOS, where Cmd+V pastes: Claude Code reads the clipboard’s image on it', async () => {
    const handler = await keys(true);
    expect(press(handler, { ctrlKey: true })).toBe(true);
    expect(press(handler, { metaKey: true })).toBe(false);
  });
});

describe('opening a terminal', () => {
  const info = { id: 't1', projectId: 'p1', name: 'pwsh-1', shell: 'pwsh' };

  it('opens in the project’s folder when no place is given', async () => {
    const backend = fakeBackend({ term_spawn: () => info });
    await openTerminal('p1', 'pwsh', 'pwsh-1');
    expect(backend.called('term_spawn')[0].args).toMatchObject({ projectId: 'p1', shell: 'pwsh', name: 'pwsh-1', cols: 100, rows: 30 });
    expect(backend.called('term_spawn')[0].args).not.toHaveProperty('agentId');
    expect(backend.called('term_spawn')[0].args).not.toHaveProperty('subdir');
  });

  it('asks the backend for the agent’s worktree and the folder of it', async () => {
    const backend = fakeBackend({ term_spawn: () => info });
    await openTerminal('p1', 'pwsh', 'pwsh · lib', { agentId: 'a1', subdir: 'src/lib' });
    expect(backend.called('term_spawn')[0].args).toMatchObject({ projectId: 'p1', agentId: 'a1', subdir: 'src/lib', name: 'pwsh · lib' });
  });

  it('passes on the backend’s refusal of a place', async () => {
    fakeBackend({ term_spawn: () => Promise.reject('chemin hors du dossier : ..') });
    await expect(openTerminal('p1', 'pwsh', 'pwsh · ..', { subdir: '..' })).rejects.toBe('chemin hors du dossier : ..');
  });
});
