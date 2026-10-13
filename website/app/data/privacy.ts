// The site’s pages of their own, the privacy page and the legal notice: one Markdown file per language,
// content/<page>/<lang>.md, rendered like a page of the documentation (data/render.ts) but standing on their own,
// at /privacy/ and /en/privacy/, /legal/ and /en/legal/.
import { pathIn, type Lang } from './language';

export type PageId = 'privacy' | 'legal';
export const PAGE_IDS: readonly PageId[] = ['privacy', 'legal'];

/** Where a page lives in `lang` (a route, without the base URL). */
export const pagePath = (id: PageId, lang: Lang) => pathIn(lang, `/${id}/`);

/** The Markdown file of a page, from the website’s folder: what the “edit this page” link opens on GitHub. */
export const pageSource = (id: PageId, lang: Lang) => `content/${id}/${lang}.md`;

export const privacyPath = (lang: Lang) => pagePath('privacy', lang);
export const privacySource = (lang: Lang) => pageSource('privacy', lang);
export const legalPath = (lang: Lang) => pagePath('legal', lang);
export const legalSource = (lang: Lang) => pageSource('legal', lang);
