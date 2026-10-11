// Finds elements by their tooltip, as Testing Library's `*ByTitle` did with `title`: `use:tip` writes it in `data-tip`.
// A string matches the whole tooltip, a regular expression any part of it, its spaces and line breaks as single spaces.
import { buildQueries, fireEvent } from '@testing-library/dom';

/** The focus given to `el` by Tab, which shows its tooltip (a focus given by the code, with no key to move it, does not). */
export function tabTo(el: HTMLElement) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });
  el.focus();
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

function queryAllByTip(container: HTMLElement, text: string | RegExp): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-tip]')].filter((el) => {
    const tip = normalize(el.getAttribute('data-tip') ?? '');
    return typeof text === 'string' ? tip === normalize(text) : text.test(tip);
  });
}

const [queryByTip, getAllByTip, getByTip, findAllByTip, findByTip] = buildQueries(
  queryAllByTip,
  (_, text) => `Found several elements with the tooltip ${text}`,
  (_, text) => `Found no element with the tooltip ${text}`,
);

export { findAllByTip, findByTip, getAllByTip, getByTip, queryAllByTip, queryByTip };
