// The documentation's search: the pages of a language, cut into their sections, and the sections that hold every word
// asked, best first. It runs in the browser, on the pages it loads when the search opens.
import type { DocSlug } from './docs';
import type { RenderedDoc } from './render';

export interface SearchEntry {
  slug: DocSlug;
  /** The page's title. */
  page: string;
  /** The section's anchor and heading; a page's introduction (its lede and what comes before its first heading) has none. */
  id: string;
  heading: string;
  text: string;
}

export interface SearchHit extends SearchEntry {
  /** The text around the first word found: `match` is that word, as written. */
  snippet: { before: string; match: string; after: string };
}

/**
 * What the search compares: lowercase, without accents, the pages' typographic apostrophe as the keyboard types it,
 * one character for each character of `s`, so that a place found in it is the same place in `s`.
 */
const fold = (s: string) =>
  s
    .split('')
    .map((c) => (/[’‘ʼ]/.test(c) ? "'" : c.normalize('NFD')[0].toLowerCase()[0]))
    .join('');

/** What the search looks through in a page. */
export function searchEntries(slug: DocSlug, doc: RenderedDoc): SearchEntry[] {
  const intro = doc.sections.find((s) => !s.id)?.text;
  return [
    { slug, page: doc.title, id: '', heading: '', text: intro ? `${doc.lede} ${intro}` : doc.lede },
    ...doc.sections.filter((s) => s.id).map((s) => ({ slug, page: doc.title, id: s.id, heading: s.heading, text: s.text })),
  ];
}

/** How much the words found in a heading, a page's title and a text weigh. A page's introduction has its title for heading. */
const WEIGHT = { heading: 4, page: 2, text: 1 };
const BEFORE = 60;
const AFTER = 100;

function snippet(text: string, words: string[]): SearchHit['snippet'] {
  const folded = fold(text);
  const found = words.map((w) => ({ at: folded.indexOf(w), length: w.length })).filter((f) => f.at >= 0);
  if (!found.length) return { before: cut(text, AFTER + BEFORE), match: '', after: '' };
  const first = found.reduce((a, b) => (b.at < a.at ? b : a));
  let before = text.slice(0, first.at);
  let after = text.slice(first.at + first.length);
  // Whole words only, where the text is cut.
  if (before.length > BEFORE) before = `…${before.slice(-BEFORE).replace(/^\S*\s/, '')}`;
  if (after.length > AFTER) after = `${after.slice(0, AFTER).replace(/\s\S*$/, '')}…`;
  return { before, match: text.slice(first.at, first.at + first.length), after };
}

const cut = (text: string, length: number) => (text.length > length ? `${text.slice(0, length).replace(/\s\S*$/, '')}…` : text);

/** The entries that hold every word of `query`, best first, then in the pages' order. */
export function searchDocs(entries: readonly SearchEntry[], query: string, limit = 12): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries
    .map((e, order) => {
      const heading = fold(e.id ? e.heading : e.page);
      const page = e.id ? fold(e.page) : '';
      const text = fold(e.text);
      let score = 0;
      for (const w of words) {
        const inHeading = heading.includes(w);
        const inPage = page.includes(w);
        const inText = text.includes(w);
        if (!inHeading && !inPage && !inText) return null;
        score += (inHeading ? WEIGHT.heading : 0) + (inPage ? WEIGHT.page : 0) + (inText ? WEIGHT.text : 0);
      }
      return { e, order, score };
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ e }) => ({ ...e, snippet: snippet(e.text, words) }));
}
