// xterm.js instances live outside of components so switching views keeps their scrollback.

import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { MAX_TOTAL, base64, clipboardImage, imageType, sizeLabel } from './attachments';
import { echoWatch, type InputKind } from './echo-watch';
import { t } from './i18n';
import { api } from './ipc';
import { openOutside, terminalLinks } from './links';
import { IS_MAC } from './platform';
import { isAppShortcut } from './shortcuts';
import { app } from './state.svelte';
import type { TermInfo } from './types';

/** What draws a terminal; the DOM renderer says why it is not WebGL, WebGL the GPU's name. */
export interface Renderer {
  renderer: 'webgl' | 'dom';
  detail?: string;
}

export interface XTerm {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  host: HTMLDivElement;
  /** A log: no input, no cursor. */
  readOnly?: boolean;
  /** The backend's id of an interactive terminal, once it has one. */
  id?: string;
  renderer: Renderer;
  /** When (`performance.now()`) a key went to the terminal, and the WebView's paste reached it: what tells the user's input from xterm.js's own. */
  keyAt?: number;
  pasteAt?: number;
}

const xterms = new Map<string, XTerm>();
let parking: HTMLDivElement | null = null;

function parkingLot(): HTMLDivElement {
  if (!parking) {
    parking = document.createElement('div');
    parking.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:500px;visibility:hidden;';
    document.body.appendChild(parking);
  }
  return parking;
}

/** Resolves any CSS color (oklch, color-mix, var()) to #rrggbb through a 1px canvas. */
export function resolveColor(css: string): string {
  const probe = document.createElement('div');
  probe.style.color = css;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function terminalTheme(readOnly = false): ITheme {
  const background = resolveColor('var(--term)');
  return {
    background,
    foreground: '#ede7df',
    cursor: readOnly ? background : resolveColor('var(--accent)'),
    cursorAccent: '#1b1512',
    selectionBackground: resolveColor('color-mix(in oklch, var(--accent) 35%, transparent)') + '99',
    black: '#2a2724',
    red: '#e2735f',
    green: '#7cc48d',
    yellow: '#e9c46a',
    blue: '#6fa8dc',
    magenta: '#c792ea',
    cyan: '#6cc5c1',
    white: '#d8d0c4',
    brightBlack: '#6f685f',
    brightRed: '#f08c78',
    brightGreen: '#9bd8a9',
    brightYellow: '#f4d68a',
    brightBlue: '#8fbfea',
    brightMagenta: '#d9aef2',
    brightCyan: '#8ad8d4',
    brightWhite: '#f5efe7',
  };
}

const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End']);

let gpu: { name?: string } | null = null;

/**
 * The GPU's name WebGL gives (a software one such as SwiftShader says so), read once per run of the app from a
 * context of its own, given back at once: Chromium keeps 16 WebGL contexts and drops the oldest of the others.
 */
function gpuName(): string | undefined {
  if (gpu) return gpu.name;
  gpu = {};
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      // Without it (hidden by the WebView) the generic name still tells WebGL is there.
      gpu.name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    }
  } catch {
    // The name is only for the log.
  }
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Left to the garbage collector.
  }
  return gpu.name;
}

/** Tells the log which renderer an interactive terminal has, once it has an id. */
function reportRenderer(x: XTerm) {
  if (x.id) api.termReport(x.id, { kind: 'renderer', ...x.renderer }).catch(() => {});
}

/** A parked xterm.js instance; a read-only one takes no input (launch command logs). */
function createXTerm(readOnly: boolean): XTerm {
  const term = new Terminal({
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 12.5,
    lineHeight: 1.2,
    cursorBlink: !readOnly,
    cursorInactiveStyle: readOnly ? 'none' : 'outline',
    disableStdin: readOnly,
    allowProposedApi: true,
    // The hyperlinks Claude Code writes (OSC 8) open in the system's browser, not through xterm.js's confirm() and window.open().
    linkHandler: terminalLinks,
    scrollback: 10000,
    theme: terminalTheme(readOnly),
    // Rows added by a resize stay blank at the bottom, as in the pseudo-console, which repaints
    // its screen at absolute positions: pulling scrollback down would shift the log under it.
    windowsPty: { backend: 'conpty' },
  });
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:100%;';
  parkingLot().appendChild(host);
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((_e, uri) => openOutside(uri)));
  term.open(host);
  const x: XTerm = { term, fit, search, host, readOnly, renderer: { renderer: 'dom' } };
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      x.renderer = { renderer: 'dom', detail: 'WebGL context lost' };
      reportRenderer(x);
    });
    term.loadAddon(webgl);
    x.renderer = { renderer: 'webgl', detail: gpuName() };
  } catch (e) {
    // Falls back to the DOM renderer.
    x.renderer = { renderer: 'dom', detail: e instanceof Error ? e.message : String(e) };
  }
  fit.fit();
  // The user's paste, noted on its way down, before xterm.js's own listeners get it.
  host.addEventListener('paste', () => (x.pasteAt = performance.now()), true);
  const keyToTerminal = (e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown') return true;
    // Navigation shortcuts go to the app (the event keeps bubbling to its window handler).
    if (isAppShortcut(e)) return false;
    // macOS: Cmd+C copies the selection, Cmd+V pastes (through the Edit menu's paste event);
    // Ctrl keys all go to the shell.
    if (IS_MAC && e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'c' && term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
      return !(k === 'c' || k === 'v');
    }
    // Windows Terminal conventions: Ctrl+C copies when there is a selection, Ctrl+V pastes.
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    // Not on macOS, where Cmd+V pastes: Ctrl+V is Claude Code's key to read the clipboard's image.
    if (!IS_MAC && e.ctrlKey && e.key.toLowerCase() === 'v') return false;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    // A log only scrolls (Shift+PageUp…): every other key goes on to the app's shortcuts.
    return !readOnly || (e.shiftKey && SCROLL_KEYS.has(e.key));
  };
  term.attachCustomKeyEventHandler((e) => {
    const toTerminal = keyToTerminal(e);
    if (toTerminal && e.type === 'keydown') x.keyAt = performance.now();
    return toTerminal;
  });
  return x;
}

function free(x: XTerm) {
  x.term.dispose();
  x.host.remove();
}

/**
 * Where a terminal opens when not in the project's folder: the worktree of an agent (the project's
 * folder for one without), or the folder `subdir` of it (a path of the editor's tree).
 */
export interface TermPlace {
  agentId?: string | null;
  subdir?: string;
}

export function openTerminal(projectId: string, shell: string, name: string, place?: TermPlace): Promise<TermInfo> {
  return interactive((cols, rows, onData) => api.termSpawn({ projectId, shell, name, ...place, cols, rows }, onData));
}

/** « Se connecter… »: the Claude account's `claude` in a terminal of its own, where the user signs in. */
export function openAccountLogin(accountId: string): Promise<TermInfo> {
  return interactive((cols, rows, onData) => api.accountLogin(accountId, cols, rows, onData));
}

/** Claude Code's interface for the agent (« Vue Claude Code »): its session resumed in a terminal. */
export async function openAgentTerminal(agentId: string): Promise<TermInfo> {
  const info = await interactive((cols, rows, onData) => api.agentTerminal(agentId, cols, rows, onData));
  pasteImages(xterms.get(info.id)!, agentId);
  return info;
}

/**
 * What a paste in Claude Code's interface carries: text, which xterm.js types (also beside an image:
 * the cells of a spreadsheet, but not a mere line break some applications add to one); images
 * without text (a screenshot, image files copied); or, the WebView giving neither text nor file,
 * maybe an image only the system's clipboard holds (WebKitGTK leaves it out).
 */
export type Pasted = { kind: 'text'; text: string } | { kind: 'image'; files: File[] } | { kind: 'clipboard' };

export function pastedContent(data: { getData(type: string): string; files: Iterable<File> } | null): Pasted {
  const text = data?.getData('text/plain') ?? '';
  const all = [...(data?.files ?? [])];
  const files = all.filter((f) => imageType(f));
  if (text.trim() || (text && !files.length)) return { kind: 'text', text };
  if (files.length) return { kind: 'image', files };
  return all.length ? { kind: 'text', text } : { kind: 'clipboard' };
}

/**
 * Claude Code reads the clipboard's image on a key of its own (Alt+V under Windows, Ctrl+V
 * elsewhere), never on the terminal's paste: a pasted image is written to a file of the agent's,
 * and its path pasted, which Claude Code takes for the image (« [Image #1] ») as it does a file
 * dropped on a terminal. Text goes on to xterm.js, unless an image pasted before it is still being
 * written: it then waits its turn.
 */
function pasteImages(x: XTerm, agentId: string) {
  let queue = Promise.resolve();
  let waiting = 0;
  // Caught on its way down, before xterm.js's own listeners.
  x.host.addEventListener(
    'paste',
    (e) => {
      const pasted = pastedContent(e.clipboardData);
      if (pasted.kind === 'text' && !waiting) return;
      e.preventDefault();
      e.stopPropagation();
      waiting++;
      queue = queue
        .then(() => paste(x.term, agentId, pasted))
        .catch((err) => app.toast(err instanceof Error ? err.message : String(err), 'error'))
        .finally(() => waiting--);
    },
    true,
  );
  // Said on the terminal once its pastes go through here (after its interface started): what the
  // end-to-end tests wait for before pasting.
  x.host.dataset.pastes = 'images';
}

async function paste(term: Terminal, agentId: string, pasted: Pasted) {
  if (pasted.kind === 'text') return term.paste(pasted.text);
  const files = pasted.kind === 'image' ? pasted.files : [await clipboardImage()].filter((f) => f !== null);
  // No image after all: the empty paste xterm.js would have made.
  if (!files.length) return term.paste('');
  // One paste a path: Claude Code reads two paths pasted at once only when neither has a space.
  for (const f of files) {
    // Refused before it is read, as the backend would after.
    if (f.size > MAX_TOTAL) {
      app.toast(t('conv.terminal.imageTooBig', { name: f.name, max: sizeLabel(MAX_TOTAL) }), 'error');
      continue;
    }
    const path = await api.pasteImage(agentId, imageType(f)!, await base64(f));
    await bracketed(term);
    term.paste(path);
  }
}

/**
 * How long an image's path waits for the interface to take pastes bracketed: Claude Code asks for
 * them as it starts, and a path pasted before is typed, never taken for the image.
 */
const BRACKETED_WAIT = 5000;

/** Once `term` takes pastes bracketed, or after `BRACKETED_WAIT` (a program that never asks). */
async function bracketed(term: Terminal) {
  const until = Date.now() + BRACKETED_WAIT;
  while (!term.modes.bracketedPasteMode && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
}

const decoder = new TextDecoder();

/**
 * How soon after a key or a paste xterm.js emits what it types (synchronously, from the keydown, keypress, input or
 * paste handling). What comes later is its own: focus, cursor and mouse reports, replies to the program's queries.
 */
const INPUT_WINDOW = 50;

/** What the data xterm.js emits at `at` is, when the user typed or pasted it; null for what it writes by itself. */
function userInput(x: XTerm, at: number): InputKind | null {
  if (x.pasteAt !== undefined && at - x.pasteAt <= INPUT_WINDOW) return 'paste';
  if (x.keyAt !== undefined && at - x.keyAt <= INPUT_WINDOW) return 'key';
  return null;
}

/** An interactive terminal that `spawn` starts at the size of a new xterm.js instance, which then shows it. */
async function interactive(spawn: (cols: number, rows: number, onData: (d: ArrayBuffer) => void) => Promise<TermInfo>): Promise<TermInfo> {
  const x = createXTerm(false);
  const { term } = x;
  // Made before the spawn, whose output can come in before its answer: what is told waits for the id.
  const watch = echoWatch({
    now: () => performance.now(),
    visible: () => document.visibilityState === 'visible',
    report: (r) => {
      if (x.id) api.termReport(x.id, r).catch(() => {});
    },
  });
  // Every read of the backend is one message of the same bytes, in order: the bytes received so far name the read of an
  // echo (measured or not, every chunk counts).
  let outputBytes = 0;
  let info: TermInfo;
  try {
    info = await spawn(term.cols, term.rows, (buf) => {
      outputBytes += buf.byteLength;
      // The text is only decoded while a typed key waits for its echo.
      const token = watch.received(() => decoder.decode(buf), outputBytes);
      // xterm.js calls back once the data is parsed: the next animation frame is when it is drawn.
      term.write(new Uint8Array(buf), token === null ? undefined : () => requestAnimationFrame(() => watch.painted(token)));
    });
  } catch (e) {
    // Nothing to attach to: free the xterm instance, its WebGL context and its host.
    free(x);
    throw e;
  }
  x.id = info.id;
  reportRenderer(x);
  term.onData((d) => {
    const kind = userInput(x, performance.now());
    // The write goes out first and waits for nothing: its number is only for the report of a slow echo.
    const seq = api.termWrite(info.id, d);
    seq.catch(() => {});
    if (kind) watch.sent({ data: d, kind, seq });
  });
  term.onResize(({ cols, rows }) => api.termResize(info.id, cols, rows).catch(() => {}));
  xterms.set(info.id, x);
  return info;
}

/** Key of a launch command's log among the terminals. */
export const logKey = (commandId: string) => `run:${commandId}`;

/**
 * The read-only log of a launch command, kept across its runs.
 * `onResize` gets the new size so the running process can follow it.
 */
export function launchLog(commandId: string, onResize: (cols: number, rows: number) => void): XTerm {
  const key = logKey(commandId);
  let x = xterms.get(key);
  if (!x) {
    x = createXTerm(true);
    x.term.onResize(({ cols, rows }) => onResize(cols, rows));
    xterms.set(key, x);
  }
  return x;
}

export function disposeLog(commandId: string) {
  const x = xterms.get(logKey(commandId));
  if (!x) return;
  free(x);
  xterms.delete(logKey(commandId));
}

export function getXTerm(id: string): XTerm | undefined {
  return xterms.get(id);
}

/** Moves the terminal's DOM into `container` (or back to the parking lot). */
export function mountTerminal(id: string, container: HTMLElement | null) {
  const x = xterms.get(id);
  if (!x) return;
  (container ?? parkingLot()).appendChild(x.host);
  if (container) {
    x.term.options.theme = terminalTheme(x.readOnly);
    requestAnimationFrame(() => {
      try {
        x.fit.fit();
      } catch {
        /* not measurable yet */
      }
      x.term.focus();
    });
  }
}

export function disposeTerminal(id: string) {
  const x = xterms.get(id);
  if (!x) return;
  free(x);
  xterms.delete(id);
  api.termKill(id).catch(() => {});
}
