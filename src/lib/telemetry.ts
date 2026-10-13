// « Statistiques d’usage anonymes »: what is sent is told in full on the site.
import { locale } from './i18n';

/** The site's privacy page, in the language of the interface. */
export const privacyUrl = () => (locale.ui === 'en' ? 'https://escouade.dev/en/privacy/' : 'https://escouade.dev/privacy/');
