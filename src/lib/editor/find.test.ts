import { getSearchQuery, openSearchPanel, search, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { countLabel, countMatches, findPanel } from './find';

const doc = "import { paginate } from '../db/paginate';\nconst page = await paginate(db.users);\n";

describe('countMatches', () => {
  it('counts the matches and finds the one the selection is on', () => {
    const at = doc.indexOf('paginate', 20);
    const state = EditorState.create({ doc, selection: EditorSelection.single(at, at + 8) });
    expect(countMatches(state, new SearchQuery({ search: 'paginate' }))).toEqual({ index: 2, total: 3, more: false });
  });

  it('has no current match when the selection is on none', () => {
    const state = EditorState.create({ doc });
    expect(countMatches(state, new SearchQuery({ search: 'paginate' }))).toEqual({ index: null, total: 3, more: false });
  });

  it('follows the options: whole word, case', () => {
    const state = EditorState.create({ doc: 'Page page pages' });
    expect(countMatches(state, new SearchQuery({ search: 'page', wholeWord: true })).total).toBe(2);
    expect(countMatches(state, new SearchQuery({ search: 'page', caseSensitive: true })).total).toBe(2);
  });

  it('stops counting past the maximum, and counts nothing for an empty or invalid query', () => {
    const state = EditorState.create({ doc: 'a'.repeat(50) });
    expect(countMatches(state, new SearchQuery({ search: 'a' }), 10)).toEqual({ index: null, total: 10, more: true });
    expect(countMatches(state, new SearchQuery({ search: '' })).total).toBe(0);
    expect(countMatches(state, new SearchQuery({ search: '(', regexp: true })).total).toBe(0);
  });
});

describe('countLabel', () => {
  afterEach(() => setLang('fr'));

  it('says « 1 sur 3 », the total without a current match, « Aucun résultat », nothing before a word', () => {
    expect(countLabel({ index: 1, total: 3, more: false }, true)).toBe('1 sur 3');
    expect(countLabel({ index: null, total: 3, more: false }, true)).toBe('3 résultats');
    expect(countLabel({ index: 2, total: 1000, more: true }, true)).toBe('2 sur 1000+');
    expect(countLabel({ index: null, total: 0, more: false }, true)).toBe('Aucun résultat');
    expect(countLabel({ index: null, total: 0, more: false }, false)).toBe('');
  });

  it('in English', () => {
    setLang('en');
    expect(countLabel({ index: 1, total: 3, more: false }, true)).toBe('1 of 3');
    expect(countLabel({ index: null, total: 0, more: false }, true)).toBe('No results');
  });
});

describe('findPanel', () => {
  function open(text = doc) {
    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions: search({ top: true, createPanel: findPanel }) }),
      parent: document.body,
    });
    openSearchPanel(view);
    const panel = view.dom.querySelector<HTMLElement>('.cm-find')!;
    return { view, panel };
  }

  it('draws the field, its count and its toggles, the buttons in icons, the replacement under it', () => {
    const { view, panel } = open();
    expect(panel.getAttribute('role')).toBe('search');
    expect(panel.querySelector('input[name="search"]')?.getAttribute('aria-label')).toBe('Rechercher');
    expect([...panel.querySelectorAll('.cm-find-tog')].map((b) => [b.textContent, b.getAttribute('aria-label')])).toEqual([
      ['Aa', 'Respecter la casse'],
      ['.*', 'Expression régulière'],
      ['ab', 'Mot entier'],
    ]);
    expect([...panel.querySelectorAll('.cm-find-btn')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Précédent',
      'Suivant',
      'Fermer',
    ]);
    expect([...panel.querySelectorAll('.cm-find-btn use')].map((u) => u.getAttribute('href'))).toEqual(['#i-down', '#i-down', '#i-close']);
    expect([...panel.querySelectorAll('.cm-find-mini')].map((b) => b.textContent)).toEqual(['Remplacer', 'Tout']);
    // No character drawn as an icon.
    expect(panel.textContent).not.toMatch(/[×↑↓]/);
    view.destroy();
  });

  it('searches as the user types, counts, and goes to the next match on Enter', () => {
    const { view, panel } = open();
    const input = panel.querySelector<HTMLInputElement>('input[name="search"]')!;
    input.value = 'paginate';
    input.dispatchEvent(new Event('input'));
    expect(getSearchQuery(view.state).search).toBe('paginate');
    expect(panel.querySelector('.cm-find-count')?.textContent).toBe('3 résultats');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panel.querySelector('.cm-find-count')?.textContent).toBe('1 sur 3');
    view.destroy();
  });

  it('toggles an option from its button, and shows a query set from elsewhere', () => {
    const { view, panel } = open();
    const word = panel.querySelectorAll<HTMLButtonElement>('.cm-find-tog')[2];
    word.click();
    expect(word.getAttribute('aria-pressed')).toBe('true');
    expect(getSearchQuery(view.state).wholeWord).toBe(true);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'db', caseSensitive: true })) });
    expect(panel.querySelector<HTMLInputElement>('input[name="search"]')!.value).toBe('db');
    expect(panel.querySelectorAll('.cm-find-tog')[0].getAttribute('aria-pressed')).toBe('true');
    expect(word.getAttribute('aria-pressed')).toBe('false');
    expect(panel.querySelector('.cm-find-count')?.textContent).toBe('2 résultats');
    view.destroy();
  });

  it('replaces all the matches from « Tout »', () => {
    const { view, panel } = open('a b a');
    const [input, replace] = panel.querySelectorAll<HTMLInputElement>('input');
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    replace.value = 'x';
    replace.dispatchEvent(new Event('input'));
    panel.querySelectorAll<HTMLButtonElement>('.cm-find-mini')[1].click();
    expect(view.state.doc.toString()).toBe('x b x');
    view.destroy();
  });
});
