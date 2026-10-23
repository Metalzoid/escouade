// The tooltip of the app (`use:tip`), in place of the browser's (`title`), which has the look of the system (white
// under Windows), comes after a second and never shows to the keyboard. This one has the look of the app, comes after a
// short stay of the pointer (at once for the next one, along a toolbar), shows to the keyboard with the focus ring, and
// goes with Escape (WCAG 1.4.13), a click, a scroll, or the window losing the focus. One at a time.
//   - `data-tip` on the element holds its text: what the tests and the e2e read;
//   - a screen reader gets it as the browser gave `title`: the name of a control that only shows a symbol (⚙, ×) or an
//     icon, else the description of a control (`aria-describedby` to a hidden text: not every engine reads
//     `aria-description`), or of what is out of the tab order (`aria-description`, see `apply`).

import { iconId, type IconName } from './icons';

/**
 * A tooltip: its text (several lines with `\n`; none: no tooltip), or the text and
 * - `cut`: the whole of a text the element (or what it holds) cuts short, shown only while it is cut, and nothing more to a
 *   screen reader, which reads the whole text already;
 * - `aria: false`: the element already says it to a screen reader (`aria-valuetext`, a description of its own);
 * - `title` and `rows`: a rich tooltip, its title in bold over lines that may start with an icon (« Attend », a pull
 *   request). Its text, when none is given, is theirs, a line each: what `data-tip` holds and a screen reader gets.
 */
export type TipContent =
  | string
  | null
  | undefined
  | false
  | { text?: string | null | undefined; cut?: boolean; aria?: boolean; title?: string; rows?: (TipRow | string)[] };

/** A line of a rich tooltip: its text, after an icon of the app. */
export interface TipRow {
  icon?: IconName;
  text: string;
}

/** How long the pointer stays on an element before its tooltip shows. */
export const SHOW_DELAY = 400;
/** After a tooltip went, how long the next one shows at once. */
export const WARM_FOR = 300;
/** The room between the tooltip and the edges of the window. */
const MARGIN = 8;
/** The room between the tooltip and its element. */
const GAP = 6;

interface Options {
  text: string;
  cut: boolean;
  aria: boolean;
  title?: string;
  rows: TipRow[];
}

function options(content: TipContent): Options {
  if (content && typeof content === 'object') {
    const rows = (content.rows ?? []).map((r) => (typeof r === 'string' ? { text: r } : r));
    const own = [content.title, ...rows.map((r) => r.text)].filter(Boolean).join('\n');
    return { text: content.text ?? own, cut: !!content.cut, aria: content.aria !== false, title: content.title, rows };
  }
  return { text: content || '', cut: false, aria: true, rows: [] };
}

const SVG = 'http://www.w3.org/2000/svg';

/** Writes a tooltip into its box: its text, or its title and its lines. */
function fill(el: HTMLElement, o: Options) {
  const rich = !!(o.title || o.rows.length);
  el.classList.toggle('rich', rich);
  if (!rich) {
    el.textContent = o.text;
    return;
  }
  el.replaceChildren();
  if (o.title) {
    const b = document.createElement('b');
    b.textContent = o.title;
    el.append(b);
  }
  for (const r of o.rows) {
    const row = document.createElement('span');
    row.className = 'tip-row';
    if (r.icon) {
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('aria-hidden', 'true');
      svg.dataset.icon = r.icon;
      const use = document.createElementNS(SVG, 'use');
      use.setAttribute('href', `#${iconId(r.icon)}`);
      svg.append(use);
      row.append(svg);
    }
    row.append(r.text);
    el.append(row);
  }
}

/** An element with a tooltip, as the shared state knows it. */
interface Tipped {
  node: HTMLElement;
  text(): string;
  /** What its tooltip shows. */
  options(): Options;
  /** Whether its tooltip would say something now (a cut text that is not cut says nothing). */
  says(): boolean;
  /** Whether the element is described by its tooltip while it is up (a control that its text names and says no more of). */
  describes(): boolean;
}

/** The id of the tooltip, which the element it is up for points to. */
const BOX = 'tip-box';

/** Adds `id` to what describes `node`, or takes it off, leaving the others. */
function pointing(node: HTMLElement, id: string, on: boolean) {
  const ids = (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id);
  if (on) ids.push(id);
  if (ids.length) node.setAttribute('aria-describedby', ids.join(' '));
  else node.removeAttribute('aria-describedby');
}

/** The tooltip shown, and whose. */
let box: HTMLElement | null = null;
let owner: Tipped | null = null;
/** The tooltip waiting for the pointer to stay. */
let pending: ReturnType<typeof setTimeout> | undefined;
let pendingFor: Tipped | null = null;
/** When the last tooltip went (the next one shows at once for a while). */
let goneAt = -Infinity;

function cancel(t?: Tipped) {
  if (t && pendingFor !== t) return;
  clearTimeout(pending);
  pending = undefined;
  pendingFor = null;
}

function close(t?: Tipped) {
  if (!box || (t && owner !== t)) return;
  if (owner?.describes()) pointing(owner.node, BOX, false);
  box.remove();
  box = null;
  owner = null;
  goneAt = Date.now();
}

function position() {
  if (!box || !owner) return;
  const at = place(owner.node.getBoundingClientRect(), box.getBoundingClientRect(), {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  box.style.left = `${at.left}px`;
  box.style.top = `${at.top}px`;
}

function open(t: Tipped) {
  cancel();
  if (owner === t) return;
  close();
  if (!t.says()) return;
  const el = document.createElement('div');
  el.className = 'tip-box';
  el.id = BOX;
  el.setAttribute('role', 'tooltip');
  fill(el, t.options());
  document.body.append(el);
  box = el;
  owner = t;
  if (t.describes()) pointing(t.node, BOX, true);
  position();
}

/**
 * Shows `t`'s tooltip after the pointer stayed, or at once while another is up or has just gone. An element inside `t`
 * that has or awaits its own keeps it: the pointer is on both, the innermost says more (the entries into an element and
 * the ones around it do not come in the same order everywhere).
 */
function schedule(t: Tipped) {
  const inner = [owner, pendingFor].some((x) => x && x !== t && t.node.contains(x.node));
  if (inner || owner === t) return;
  cancel();
  if (box || Date.now() - goneAt < WARM_FOR) return open(t);
  pendingFor = t;
  pending = setTimeout(() => {
    pending = undefined;
    pendingFor = null;
    open(t);
  }, SHOW_DELAY);
}

/** The keys that move the focus: a focus they give shows the tooltip, not one the code gives (a dialog that closes gives it back). */
const MOVES = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
/** The last key pressed moves the focus, and no pointer was pressed since. */
let navigating = false;
/** The focus events an element inside took: the innermost element with something to say has the focus's tooltip. */
const taken = new WeakSet<Event>();
/** Each element's tooltip, to find the one around an element the pointer goes back to. */
const tipped = new WeakMap<Element, Tipped>();

let installed = false;
/** What puts any tooltip away: Escape pressed anywhere (the key still does its work), a scroll, the window left. */
function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => (navigating = MOVES.has(e.key)), true);
  window.addEventListener('mousedown', () => (navigating = false), true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    cancel();
    if (!owner) return;
    // Away without the focus moving. The element still had the key (Svelte hands it from the root of the app), but
    // with the focus on it, nothing of the window's closes with this Escape (a dialog, the agent's turn).
    if (e.target instanceof Node && owner.node.contains(e.target)) e.stopPropagation();
    close();
  });
  // What scrolls moves what it holds away from its tooltip; anything else may scroll (a conversation that follows the
  // reply streaming in, a terminal) without taking the tooltip away.
  document.addEventListener(
    'scroll',
    (e) => {
      const scrolled = e.target instanceof Node ? e.target : document;
      if (pendingFor && scrolled.contains(pendingFor.node)) cancel();
      if (owner && scrolled.contains(owner.node)) close();
    },
    true,
  );
  window.addEventListener('blur', () => {
    cancel();
    close();
  });
}

/** Where a tooltip of `size` stands for an element at `anchor`: above it and centered, below when there is no room above, in the window. */
export function place(
  anchor: { left: number; top: number; width: number; bottom: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  let top = anchor.top - GAP - size.height;
  if (top < MARGIN) top = Math.min(anchor.bottom + GAP, view.height - MARGIN - size.height);
  const left = anchor.left + anchor.width / 2 - size.width / 2;
  return {
    left: Math.max(MARGIN, Math.min(left, view.width - MARGIN - size.width)),
    top: Math.max(MARGIN, top),
  };
}

/** The controls a screen reader names: a symbol alone on one of them says nothing. */
const CONTROL =
  'button,a[href],input,select,textarea,summary,[tabindex],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="switch"]';
const WORD = /[\p{L}\p{N}]/u;

/** An element that shows less of its text than it has (an ellipsis, a clamp). */
const cutShort = (el: Element) => el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1;

export function tip(node: HTMLElement, content: TipContent): { update: (content: TipContent) => void; destroy: () => void } {
  let o = options(content);
  let hovered = false;
  /** The focus is the keyboard's, on the element or in it. */
  let focused = false;
  /** A press of the pointer: neither the focus it gives nor the stay of the pointer shows the tooltip, until it leaves. */
  let pressed = false;
  /** The aria-label and the aria-description this action put. */
  let named = false;
  let noted = false;
  /** A control its tooltip describes while it is up. */
  let describing = false;

  const self: Tipped = {
    node,
    text: () => o.text,
    options: () => o,
    says: () => !!o.text && (!o.cut || [node, ...node.querySelectorAll('*')].some(cutShort)),
    describes: () => describing,
  };

  /**
   * What a screen reader gets. A control: its tooltip as its name when it shows only a symbol or an icon, else as its
   * description while the tooltip is up (the keyboard's focus puts it up), as Radix does: a hidden copy of the text,
   * always there, would be met twice by a search of the page's texts (a find, the tests'). Out of the tab order, where
   * the focus never comes: `aria-description`.
   * Read again only when the tooltip changes: a symbol button whose text later gets words keeps the label put here,
   * and a label the template sets only sometimes would not be put back by Svelte once taken off here (none does).
   */
  function apply() {
    if (o.text) node.setAttribute('data-tip', o.text);
    else node.removeAttribute('data-tip');
    if (named) node.removeAttribute('aria-label');
    if (noted) node.removeAttribute('aria-description');
    named = noted = describing = false;
    if (!o.text || !o.aria || o.cut) return;
    const label = node.getAttribute('aria-label');
    const control = node.matches(CONTROL);
    if (control && label === null && !node.hasAttribute('aria-labelledby') && !WORD.test(node.textContent ?? '')) {
      node.setAttribute('aria-label', o.text);
      named = true;
    } else if (label !== null && label.trim() === o.text.trim()) {
      // The name says it all already.
    } else if (control) describing = true;
    else {
      node.setAttribute('aria-description', o.text);
      noted = true;
    }
  }

  const onEnter = () => {
    hovered = true;
    pressed = false;
    // Nothing to say (a cut text that is not cut): the element around, if it has a tooltip, keeps it.
    if (self.says()) schedule(self);
  };
  const onLeave = (e: MouseEvent) => {
    hovered = false;
    pressed = false;
    cancel(self);
    if (!focused) close(self);
    // Back on the element around this one, which the pointer never left: its tooltip again.
    for (let el = e.relatedTarget instanceof Element ? e.relatedTarget : null; el; el = el.parentElement) {
      const around = tipped.get(el);
      if (!around) continue;
      if (around !== self && around.node.contains(node)) schedule(around);
      break;
    }
  };
  const onPress = () => {
    pressed = true;
    cancel(self);
    close(self);
  };
  const onClick = () => {
    cancel(self);
    close(self);
  };
  const onFocusIn = (e: FocusEvent) => {
    // The event goes up through the elements around: the innermost one with something to say takes it.
    if (!self.says() || taken.has(e)) return;
    taken.add(e);
    if (pressed || !navigating) return;
    focused = true;
    open(self);
  };
  const onFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && node.contains(e.relatedTarget)) return;
    focused = false;
    pressed = false;
    if (!hovered) close(self);
  };

  install();
  tipped.set(node, self);
  apply();
  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mouseleave', onLeave);
  node.addEventListener('mousedown', onPress);
  node.addEventListener('click', onClick);
  node.addEventListener('focusin', onFocusIn);
  node.addEventListener('focusout', onFocusOut);

  return {
    update(content: TipContent) {
      o = options(content);
      apply();
      if (owner !== self || !box) return;
      if (!self.says()) return close(self);
      fill(box, o);
      pointing(node, BOX, describing);
      position();
    },
    destroy() {
      cancel(self);
      close(self);
      tipped.delete(node);
      if (named) node.removeAttribute('aria-label');
      if (noted) node.removeAttribute('aria-description');
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mouseleave', onLeave);
      node.removeEventListener('mousedown', onPress);
      node.removeEventListener('click', onClick);
      node.removeEventListener('focusin', onFocusIn);
      node.removeEventListener('focusout', onFocusOut);
    },
  };
}
