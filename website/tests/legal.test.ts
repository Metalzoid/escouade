import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOGS } from '../app/data/catalogs';
import { LANG_KEY, pathIn, type Lang } from '../app/data/language';
import { legalPath, legalSource, privacyPath } from '../app/data/privacy';
import { renderDoc } from '../app/data/render';
import { REPO, SITE } from '../app/data/site';
import { escapeText, headOf, tags } from './helpers';

const OUT = new URL('../.output/public/', import.meta.url);
const BASE = '/';
const LANGS: Lang[] = ['fr', 'en'];

const source = (lang: Lang) => readFileSync(new URL(`../${legalSource(lang)}`, import.meta.url), 'utf8');
const render = (lang: Lang) => renderDoc(source(lang), { lang, link: (p) => p, callouts: CATALOGS[lang].docs.callouts });
/** A text with its non-breaking spaces made ordinary, to look for figures. */
const plain = (s: string) => s.replace(/ /g, ' ');

describe('the addresses of the legal notice', () => {
  it('are the same page in both languages', () => {
    expect(legalPath('fr')).toBe('/legal/');
    expect(legalPath('en')).toBe('/en/legal/');
    expect(pathIn('en', '/legal/')).toBe('/en/legal/');
    expect(pathIn('fr', '/en/legal/')).toBe('/legal/');
  });
});

describe('the legal notice’s Markdown', () => {
  it('has a title and a lede in both languages, and the same sections', () => {
    expect(render('fr').title).toBe('Mentions légales');
    expect(render('en').title).toBe('Legal notice');
    const [fr, en] = LANGS.map(render);
    expect(en.headings.map((h) => h.depth)).toEqual(fr.headings.map((h) => h.depth));
    for (const lang of LANGS) expect(render(lang).lede.length, lang).toBeGreaterThan(40);
  });

  it('states the publisher, the host and the contact, exactly', () => {
    for (const lang of LANGS) {
      const text = plain(source(lang));
      for (const fact of [
        'GAGNAIRE DEVELOPPEMENT',
        '2 rue du Taillis, 33620 Cavignac',
        'RCS Libourne 953 269 263',
        'SIRET 953 269 263 00018',
        'Guillaume Gagnaire',
        '(mailto:guillaume@gagnaire.dev)',
        'Scaleway',
        '8 rue de la Ville-l’Évêque, 75008 Paris',
        'RCS Paris 433 115 904',
        'https://www.scaleway.com',
        `${REPO}/blob/main/LICENSE`,
        '© 2026 Guillaume Gagnaire',
        'escouade-lang',
        'Inter',
        'JetBrains Mono',
        'SIL Open Font License',
      ])
        expect(text, `${lang}: ${fact}`).toContain(fact);
      expect(text, lang).toMatch(lang === 'fr' ? /1 000 €/ : /€1,000/);
      expect(text, lang).toMatch(lang === 'fr' ? /142 050 €/ : /€142,050/);
      expect(text, lang).toContain(lang === 'fr' ? 'TVA intracommunautaire FR63953269263' : 'EU VAT number FR63953269263');
      expect(text, lang).toContain('+33 1 84 13 00 00');
      expect(text, lang).not.toMatch(/anonym/i);
      expect(text, lang).not.toMatch(/collecte aucune|collects no personal/);
    }
  });

  it('links to the privacy page of its language', () => {
    for (const lang of LANGS) expect(source(lang)).toContain(`(${privacyPath(lang)})`);
  });

  it('writes the typography the way the documentation does', () => {
    const prose = (s: string) => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const lang of LANGS) {
      const text = prose(source(lang));
      expect(text, lang).not.toMatch(/['"]/);
      expect(text, lang).not.toContain('...');
      if (lang === 'fr') expect(text).not.toMatch(/«(?! )|(?<! )»/);
      else expect(text).not.toMatch(/[«»]/);
    }
  });
});

describe.each(LANGS)('the legal notice (%s)', (lang) => {
  const other: Lang = lang === 'fr' ? 'en' : 'fr';
  const text = CATALOGS[lang];
  const path = legalPath(lang).slice(1);
  let html = '';
  const meta = (key: string) => tags(headOf(html), 'meta').find((t) => t.name === key || t.property === key)?.content;
  const links = (kind: string) => tags(headOf(html), 'link').filter((l) => l.rel === kind);

  beforeAll(() => {
    const file = new URL(`${path}index.html`, OUT);
    if (!existsSync(file)) throw new Error(`${path}index.html : génère d’abord le site (npm run generate)`);
    html = readFileSync(file, 'utf8');
  });

  it('is titled and described for search engines, in its language', () => {
    const doc = render(lang);
    expect(html).toContain(`<title>${escapeText(`${doc.title} · Escouade`)}</title>`);
    expect(html).toMatch(new RegExp(`<html[^>]*lang="${lang}"`));
    expect(meta('description')).toBe(doc.lede);
    expect(meta('og:url')).toBe(`${SITE}${path}`);
    expect(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]).toBe(escapeText(doc.title));
  });

  it('points search engines to itself and to its version in the other language', () => {
    expect(links('canonical').map((l) => l.href)).toEqual([`${SITE}${path}`]);
    expect(Object.fromEntries(links('alternate').map((l) => [l.hreflang, l.href]))).toEqual({
      fr: `${SITE}legal/`,
      en: `${SITE}en/legal/`,
      'x-default': `${SITE}legal/`,
    });
  });

  it('switches language to the same page', () => {
    const nav = html.match(/<nav[^>]*class="lang"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(tags(nav, 'a').map((l) => l.href)).toEqual([`${BASE}legal/?lang=fr`, `${BASE}en/legal/`]);
  });

  it('sends a first visit from a browser without French to the English page, from the French one only', () => {
    const redirect = headOf(html).includes(LANG_KEY);
    expect(redirect).toBe(lang === 'fr');
    if (redirect) expect(headOf(html)).toContain(`location.replace(${JSON.stringify(`${BASE}en/legal/`)})`);
  });

  it('shows the facts, the mail link and the link to the privacy page', () => {
    expect(html).toContain('GAGNAIRE DEVELOPPEMENT');
    expect(html).toContain('953 269 263 00018');
    const hrefs = tags(html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '', 'a').map((a) => a.href);
    expect(hrefs).toContain('mailto:guillaume@gagnaire.dev');
    expect(hrefs).toContain('https://www.scaleway.com');
    expect(hrefs).toContain(`${BASE}${privacyPath(lang).slice(1)}`);
  });

  it('is linked from the footer of the home page and of the privacy page, next to the privacy link', () => {
    for (const file of [lang === 'en' ? 'en/index.html' : 'index.html', `${privacyPath(lang).slice(1)}index.html`]) {
      const page = readFileSync(new URL(file, OUT), 'utf8');
      const footer = page.match(/<footer class="foot[\s\S]*?<\/footer>/)?.[0] ?? '';
      const hrefs = tags(footer, 'a').map((a) => a.href);
      expect(hrefs, file).toContain(`${BASE}${path}`);
      expect(hrefs.indexOf(`${BASE}${path}`), file).toBe(hrefs.indexOf(`${BASE}${privacyPath(lang).slice(1)}`) + 1);
      expect(footer).toContain(`>${escapeText(text.footer.legal)}</a>`);
      expect(footer).not.toContain(escapeText(CATALOGS[other].footer.legal));
    }
  });

  it('serves every local file and links to pages that exist', () => {
    const local = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
    for (const ref of local) {
      const file = decodeURI(ref.slice(BASE.length).split(/[?#]/)[0]);
      expect(existsSync(new URL(file.endsWith('/') || !file ? `${file}index.html` : file, OUT)), ref).toBe(true);
    }
  });
});
