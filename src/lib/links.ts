// Links: the window never follows one, and the ones that lead out of the app open in the system's browser.

import { openUrl } from '@tauri-apps/plugin-opener';
import type { ILinkHandler } from '@xterm/xterm';
import { locale } from './i18n';

/** The website, in the language of the interface (Réglages › À propos). */
export const siteUrl = () => (locale.ui === 'en' ? 'https://escouade.dev/en/' : 'https://escouade.dev/');

/** The Discord server of Escouade's community (Réglages › À propos; also on the site and in the README). */
export const DISCORD_URL = 'https://discord.gg/m3KYtN8gxP';

/** The page to offer a coffee to support Escouade (a Stripe payment link, any amount), in the language of the interface
 * (Réglages › À propos). */
export const supportUrl = () =>
  locale.ui === 'fr' ? 'https://buy.stripe.com/8x2fZh20z7rM87067200001' : 'https://buy.stripe.com/00w7sLcFdaDYaf8cvq00000';

/** What the system opens for the app: a page of the web, or a mail address. Any other address is not trusted to it. */
const OUTSIDE = /^(https?:|mailto:)/i;

export function opensOutside(href: string): boolean {
  return OUTSIDE.test(href.trim());
}

/** Opens `href` in the system's browser (or mail client), if it is one of the addresses that go outside; else nothing. */
export function openOutside(href: string): void {
  if (opensOutside(href)) openUrl(href.trim()).catch(() => {});
}

/**
 * For the terminals' hyperlinks (OSC 8, which Claude Code writes). Without a handler xterm.js asks
 * `confirm()`, which here is a native dialog that always answers yes, then `window.open()`, which
 * the WebView does not give: the link never opens. Left as it is, `allowNonHttpProtocols` keeps
 * the files (`file://`) plain text.
 */
export const terminalLinks: ILinkHandler = { activate: (_e, uri) => openOutside(uri) };

/**
 * The window never follows a link: it has no way back, so the interface would be gone for good (a
 * `[text]()` in a reply reloads it, an address that leads nowhere replaces it). Every click on a
 * link is stopped; the ones that go outside open in the browser (once, however many times it is
 * clicked in a row), with any key held, by the keyboard or with the middle button. A right click is
 * only stopped. Caught on its way down, before any
 * handler of the app: this is the one place that opens links, and the app's must not open them again.
 */
export function guardLinks(doc: Document): () => void {
  const guard = (e: MouseEvent) => {
    // A text in the link may be the target (old WebKit did): its element is looked at.
    const at = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
    const link = at?.closest('a[href], area[href]');
    if (!link) return;
    e.preventDefault();
    // The Enter of a focused link comes as a click with no count (detail 0), a single click is 1: the
    // second and third clicks of a double or triple click are stopped but do not open it again.
    const opens = e.type === 'click' ? e.detail <= 1 : e.button === 1;
    if (opens) openOutside(link.getAttribute('href')!);
  };
  doc.addEventListener('click', guard, true);
  doc.addEventListener('auxclick', guard, true);
  return () => {
    doc.removeEventListener('click', guard, true);
    doc.removeEventListener('auxclick', guard, true);
  };
}
