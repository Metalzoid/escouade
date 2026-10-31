import { CATALOGS } from '~/data/catalogs';
import { DOC_SLUGS, docPath, type DocSlug } from '~/data/docs';
import { LANGS, redirectScript, type Lang } from '~/data/language';
import { renderDoc, type RenderedDoc } from '~/data/render';
import { SITE, imageOf } from '~/data/site';

// The pages' Markdown, each loaded when it is needed: the page shown, or all those of a language for the search.
const SOURCES = import.meta.glob<string>('../../content/docs/*/**/*.md', { query: '?raw', import: 'default' });

/** The documentation's pages, rendered with the site's addresses. */
export function useDocs() {
  const asset = useAsset();
  /** A page of `lang`, or null if it has no such page. */
  async function load(lang: Lang, slug: DocSlug): Promise<RenderedDoc | null> {
    const source = SOURCES[`../../content/docs/${lang}/${slug}.md`];
    return source ? renderDoc(await source(), { lang, link: asset, callouts: CATALOGS[lang].docs.callouts }) : null;
  }
  /** Every page of `lang`, in the sidebar's order. */
  async function all(lang: Lang): Promise<{ slug: DocSlug; doc: RenderedDoc }[]> {
    const pages = await Promise.all(DOC_SLUGS.map(async (slug) => ({ slug, doc: await load(lang, slug) })));
    return pages.filter((p): p is { slug: DocSlug; doc: RenderedDoc } => p.doc !== null);
  }
  return { load, all };
}

/**
 * The head of a page of the documentation (its home without a slug): its name and description for search engines
 * and social networks, the address to index and that of the same page in the other language. Like the site's French
 * root, a French page sends a first visit from a browser without French to its English version.
 */
export function useDocHead(o: { title: string; description: string; slug?: DocSlug }) {
  const { lang } = useLang();
  const asset = useAsset();
  const url = (l: Lang) => `${SITE}${docPath(l, o.slug).slice(1)}`;
  const image = `${SITE}${imageOf(lang.value, 'poster.jpg')}`;
  const other = LANGS.find((l) => l.code !== lang.value)!.code;

  useSeoMeta({
    title: o.title,
    description: o.description,
    ogTitle: o.title,
    ogDescription: o.description,
    ogType: o.slug ? 'article' : 'website',
    ogUrl: url(lang.value),
    ogImage: image,
    ogSiteName: 'Escouade',
    ogLocale: CATALOGS[lang.value].meta.locale,
    ogLocaleAlternate: CATALOGS[other].meta.locale,
    twitterCard: 'summary_large_image',
    twitterTitle: o.title,
    twitterDescription: o.description,
    twitterImage: image,
  });
  useHead({
    htmlAttrs: { lang: lang.value },
    link: [
      { rel: 'canonical', href: url(lang.value) },
      ...LANGS.map((l) => ({ rel: 'alternate' as const, hreflang: l.code, href: url(l.code) })),
      { rel: 'alternate', hreflang: 'x-default', href: url('fr') },
    ],
  });
  if (lang.value === 'fr') {
    useServerHead({ script: [{ innerHTML: redirectScript(asset(docPath('en', o.slug))), tagPriority: 'critical' }] });
  }
}
