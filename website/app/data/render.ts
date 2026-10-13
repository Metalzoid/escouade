// A page of the documentation, from its Markdown to what the site shows: its title, its lede, its HTML, the sections
// its summary lists and the plain text the search looks through. The format is in content/docs/README.md.
import { Marked, type Token, type Tokens } from 'marked';
import { docPath, isDocSlug, type DocSlug } from './docs';
import type { Lang } from './language';

export interface DocHeading {
  /** Its anchor. */
  id: string;
  text: string;
  depth: 2 | 3;
}

/** A section's words, without their markup: what the search looks through. The text before the first heading has no id. */
export interface DocSection {
  id: string;
  heading: string;
  text: string;
}

/** A link to another page, maybe to one of its sections. */
export interface DocLink {
  slug: DocSlug;
  anchor: string;
}

export interface RenderedDoc {
  title: string;
  /** The paragraph under the title, as plain text: the page's description too. */
  lede: string;
  /** Everything after the lede. */
  html: string;
  /** The `##` and `###`, for the page's summary. */
  headings: DocHeading[];
  sections: DocSection[];
  links: DocLink[];
  /** The page's own sections it links to. */
  anchors: string[];
  /** As written: `/images/board.jpg`. */
  images: string[];
}

export interface RenderOptions {
  lang: Lang;
  /** A route of the site made into an address, under the base URL. */
  link: (path: string) => string;
  /** The callouts' names, in the page's language. */
  callouts: { note: string; tip: string; warning: string };
}

/** The screenshots the pages show are the site's, all of this size: the browser keeps their room before they load. */
const IMAGE_SIZE = 'width="1920" height="960"';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** The anchor of a heading: its text in lowercase, without accents, a dash for each run of other characters. */
export function slugify(text: string): string {
  return text
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The words of inline tokens, without their markup. */
function plain(tokens: Token[] | undefined): string {
  return (tokens ?? [])
    .map((t) => {
      if ('tokens' in t && t.tokens) return plain(t.tokens);
      if (t.type === 'html' || t.type === 'br') return ' ';
      return 'text' in t ? unescape(t.text) : '';
    })
    .join('');
}

/** The words of a block, without its markup. */
function blockText(t: Token): string {
  switch (t.type) {
    case 'paragraph':
    case 'heading':
    case 'text':
      return t.tokens ? plain(t.tokens) : unescape(t.text);
    case 'list':
      return (t as Tokens.List).items.map((i) => i.tokens.map(blockText).join(' ')).join(' ');
    case 'table': {
      const table = t as Tokens.Table;
      return [...table.header, ...table.rows.flat()].map((c) => plain(c.tokens)).join(' ');
    }
    case 'blockquote':
      return t
        .tokens!.map(blockText)
        .join(' ')
        .replace(/^\[!\w+\]\s*/, '');
    case 'code':
      return t.text;
    default:
      return '';
  }
}

const CALLOUT = /^\[!(NOTE|TIP|WARNING)\][ \t]*\n?/;

export function renderDoc(source: string, o: RenderOptions): RenderedDoc {
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(source);
  const [h1, lede] = tokens.filter((t) => t.type !== 'space');
  if (h1?.type !== 'heading' || h1.depth !== 1) throw new Error('A page opens with its title: “# …”');
  const title = plain(h1.tokens);
  if (lede?.type !== 'paragraph') throw new Error(`“${title}”: a lede, one paragraph, follows the title`);
  const body = Object.assign(
    tokens.filter((t) => t !== h1 && t !== lede),
    { links: tokens.links },
  );

  // The headings' anchors, decided before the rendering so that the summary and the HTML agree; a heading nested in
  // a quote gets its own while rendering, after them. No two are the same.
  const used = new Map<string, number>();
  const anchorOf = (text: string) => {
    const base = slugify(text) || 'section';
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  const ids = new Map<Token, string>();
  const headings: DocHeading[] = [];
  for (const t of body) {
    if (t.type !== 'heading') continue;
    if (t.depth === 1) throw new Error(`“${title}”: one title per page, then ## and ###`);
    const text = plain(t.tokens);
    const id = anchorOf(text);
    ids.set(t, id);
    if (t.depth === 2 || t.depth === 3) headings.push({ id, text, depth: t.depth });
  }

  const links: DocLink[] = [];
  const anchors: string[] = [];
  const images: string[] = [];

  /** Where a link written in a page leads: another page by its slug, a section of this one, or another site. */
  const resolve = (href: string): { href: string; external?: boolean } => {
    if (/^(?:https?|mailto):/i.test(href)) return { href, external: true };
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) throw new Error(`“${title}”: a link that is neither a page nor a web address, “${href}”`);
    if (href.startsWith('#')) {
      anchors.push(href.slice(1));
      return { href };
    }
    if (href.startsWith('/')) return { href: o.link(href) };
    const [slug, anchor = ''] = href.split('#');
    if (!isDocSlug(slug)) throw new Error(`“${title}”: a link to a page that does not exist, “${href}”`);
    links.push({ slug, anchor });
    return { href: o.link(docPath(o.lang, slug)) + (anchor ? `#${anchor}` : '') };
  };

  marked.use({
    renderer: {
      heading(t) {
        const id = ids.get(t) ?? anchorOf(plain(t.tokens));
        return `<h${t.depth} id="${id}">${this.parser.parseInline(t.tokens)}</h${t.depth}>\n`;
      },
      // The pages are Markdown only: HTML in them is shown as written, and so is the text after a tag that would
      // make marked pass it on raw (`<code>`, `<pre>`, `<script>`…).
      html(t) {
        return escape(t.text);
      },
      text(t) {
        return 'tokens' in t && t.tokens ? this.parser.parseInline(t.tokens) : escape(t.text);
      },
      // A short code (a key, a value) stays on one line; a long one (a path, a command) may wrap on a narrow screen.
      codespan(t) {
        return `<code${t.text.length <= 20 && !/\s/.test(t.text) ? ' class="key"' : ''}>${escape(t.text)}</code>`;
      },
      link(t) {
        const to = resolve(t.href);
        const title = t.title ? ` title="${escape(t.title)}"` : '';
        return `<a href="${escape(to.href)}"${to.external ? ' rel="noopener"' : ''}${title}>${this.parser.parseInline(t.tokens)}</a>`;
      },
      image(t) {
        images.push(t.href);
        const src = t.href.startsWith('/') ? o.link(t.href) : t.href;
        return `<img src="${escape(src)}" alt="${escape(t.text)}" ${IMAGE_SIZE} loading="lazy" decoding="async">`;
      },
      blockquote(t) {
        const inner = this.parser.parse(t.tokens);
        const m = CALLOUT.exec(t.text);
        if (!m) return `<blockquote>\n${inner}</blockquote>\n`;
        const kind = m[1].toLowerCase() as keyof RenderOptions['callouts'];
        // The quote rendered like the rest of the page, without its first words, [!NOTE]: their paragraph goes too
        // when they were alone in it.
        const body = inner.replace(/^<p>\[!\w+\]\s*/, '<p>').replace(/^<p><\/p>\n?/, '');
        return `<div class="callout ${kind}"><p class="callout-title">${escape(o.callouts[kind])}</p>${body}</div>\n`;
      },
    },
  });

  const html = (marked.parser(body) as string)
    // A wide table scrolls within its own frame rather than widening the page.
    .replace(/<table>/g, '<div class="table"><table>')
    .replace(/<\/table>/g, '</table></div>');

  const sections: DocSection[] = [];
  let current = { id: '', heading: '', parts: [] as string[] };
  const flush = () => {
    const text = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (current.id || text) sections.push({ id: current.id, heading: current.heading, text });
  };
  for (const t of body) {
    if (t.type === 'heading') {
      flush();
      current = { id: ids.get(t)!, heading: plain(t.tokens), parts: [] };
    } else current.parts.push(blockText(t));
  }
  flush();

  return { title, lede: plain(lede.tokens), html, headings, sections, links, anchors, images };
}
