// The search in the file, floating at the top right of the text (2.0 design, `#editor`): the field with its count
// (« 1 sur 3 ») and its three toggles (case, regular expression, whole word), previous, next and close in icons; the
// replacement under it, « Remplacer » and « Tout ». CodeMirror's own panel, its behaviour kept, drawn otherwise.

import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import { runScopeHandlers, type EditorView, type Panel, type ViewUpdate } from '@codemirror/view';
import { t, type Key } from '../i18n';
import { iconId, type IconName } from '../icons';
import { tip } from '../tip';

/** Past this many matches, the count stops: « 1 000+ ». */
export const COUNT_MAX = 1000;

/** The matches of `query` in `state`: how many (up to `max`), and which one the main selection is, null for none. */
export function countMatches(
  state: EditorState,
  query: SearchQuery,
  max = COUNT_MAX,
): { index: number | null; total: number; more: boolean } {
  if (!query.valid || !query.search) return { index: null, total: 0, more: false };
  const sel = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let index: number | null = null;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    if (total === max) return { index, total, more: true };
    total++;
    if (r.value.from === sel.from && r.value.to === sel.to) index = total;
  }
  return { index, total, more: false };
}

/** What the field says of its matches: « 1 sur 3 », « 3 résultats », « Aucun résultat »; nothing before a word is typed. */
export function countLabel(c: { index: number | null; total: number; more: boolean }, searched: boolean): string {
  if (!searched) return '';
  if (!c.total) return t('editor.find.none');
  const n = c.more ? `${c.total}+` : String(c.total);
  return c.index === null ? t('editor.find.total', { count: c.total, n }) : t('editor.find.of', { i: c.index, n });
}

const SVG = 'http://www.w3.org/2000/svg';

function icon(name: IconName, flip = false): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'cm-find-icon');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  if (flip) svg.style.transform = 'rotate(180deg)';
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#${iconId(name)}`);
  svg.append(use);
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string>, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const TOGGLES = [
  { key: 'caseSensitive', text: 'Aa', label: 'editor.find.matchCase' },
  { key: 'regexp', text: '.*', label: 'editor.find.regexp' },
  { key: 'wholeWord', text: 'ab', label: 'editor.find.wholeWord' },
] as const satisfies readonly { key: keyof SearchQuery; text: string; label: Key }[];

class FindPanel implements Panel {
  dom: HTMLElement;
  private query: SearchQuery;
  private search: HTMLInputElement;
  private replace: HTMLInputElement;
  private count: HTMLElement;
  private toggles: HTMLButtonElement[];
  private tips: { destroy: () => void }[] = [];

  constructor(private view: EditorView) {
    this.query = getSearchQuery(view.state);
    const commit = () => this.commit();
    this.search = el('input', { class: 'cm-find-input', name: 'search', 'main-field': 'true', autocomplete: 'off', spellcheck: 'false' });
    this.search.placeholder = t('editor.find.find');
    this.search.setAttribute('aria-label', t('editor.find.find'));
    this.search.value = this.query.search;
    this.search.addEventListener('input', commit);
    this.count = el('span', { class: 'cm-find-count', 'aria-live': 'polite' });
    this.toggles = TOGGLES.map((o) => {
      const b = el('button', { type: 'button', class: 'cm-find-tog', 'aria-pressed': String(this.query[o.key]) }, o.text);
      this.named(b, t(o.label));
      // The focus stays in the field when the mouse presses a toggle.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        commit();
      });
      return b;
    });
    const button = (name: IconName, label: Key, run: () => void, flip = false) => {
      const b = el('button', { type: 'button', class: 'cm-find-btn' }, icon(name, flip));
      this.named(b, t(label));
      b.addEventListener('click', run);
      return b;
    };
    const first = el(
      'div',
      { class: 'cm-find-row' },
      el('div', { class: 'cm-find-field' }, this.search, this.count, ...this.toggles),
      button('down', 'editor.find.previous', () => findPrevious(view), true),
      button('down', 'editor.find.next', () => findNext(view)),
      button('close', 'editor.find.close', () => closeSearchPanel(view)),
    );
    this.replace = el('input', { class: 'cm-find-input', name: 'replace', autocomplete: 'off', spellcheck: 'false' });
    this.replace.placeholder = t('editor.find.replace');
    this.replace.setAttribute('aria-label', t('editor.find.replace'));
    this.replace.value = this.query.replace;
    this.replace.addEventListener('input', commit);
    const mini = (text: string, label: string, run: () => void) => {
      const b = el('button', { type: 'button', class: 'cm-find-mini', 'aria-label': label }, text);
      b.addEventListener('click', run);
      return b;
    };
    const second = el(
      'div',
      { class: 'cm-find-row' },
      el('div', { class: 'cm-find-field' }, this.replace),
      mini(t('editor.find.replaceOne'), t('editor.find.replaceOne'), () => replaceNext(view)),
      mini(t('editor.find.replaceAll'), t('editor.find.replaceAllLabel'), () => replaceAll(view)),
    );
    this.dom = el('div', { class: 'cm-find', role: 'search', 'aria-label': t('editor.find.label') }, first);
    if (!view.state.readOnly) this.dom.append(second);
    this.dom.addEventListener('keydown', (e) => this.keydown(e));
    this.recount();
  }

  /** A control in icons or letters: its name for a screen reader, the same in its tooltip. */
  private named(b: HTMLElement, label: string) {
    b.setAttribute('aria-label', label);
    this.tips.push(tip(b, label));
  }

  private commit() {
    const pressed = (i: number) => this.toggles[i].getAttribute('aria-pressed') === 'true';
    const query = new SearchQuery({
      search: this.search.value,
      caseSensitive: pressed(0),
      regexp: pressed(1),
      wholeWord: pressed(2),
      replace: this.replace.value,
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  private keydown(e: KeyboardEvent) {
    if (runScopeHandlers(this.view, e, 'search-panel')) return e.preventDefault();
    if (e.key !== 'Enter') return;
    if (e.target === this.search) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(this.view);
    } else if (e.target === this.replace) {
      e.preventDefault();
      replaceNext(this.view);
    }
  }

  private recount() {
    const state = this.view.state;
    const query = getSearchQuery(state);
    this.count.textContent = countLabel(countMatches(state, query), !!query.search);
    this.dom.classList.toggle('cm-find-invalid', !!query.search && !query.valid);
  }

  update(u: ViewUpdate) {
    let queried = false;
    for (const tr of u.transactions)
      for (const e of tr.effects)
        if (e.is(setSearchQuery)) {
          queried = true;
          if (!e.value.eq(this.query)) this.show(e.value);
        }
    if (queried || u.docChanged || u.selectionSet) this.recount();
  }

  private show(query: SearchQuery) {
    this.query = query;
    this.search.value = query.search;
    this.replace.value = query.replace;
    TOGGLES.forEach((o, i) => this.toggles[i].setAttribute('aria-pressed', String(query[o.key])));
  }

  mount() {
    this.search.select();
  }

  destroy() {
    for (const x of this.tips) x.destroy();
  }

  get top() {
    return true;
  }
}

/** The panel of `search({ createPanel })`. */
export const findPanel = (view: EditorView): Panel => new FindPanel(view);
