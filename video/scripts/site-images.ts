// The website's poster, video and subtitles, from the video: `npm run site-images` (after `npm run render` and
// `npm run web-video`). The poster and the subtitles are made in each language, the interface in English for the English
// page. `-- --lang=en` makes one language only. The tests compare the subtitles files byte for byte to the script's.
// The website's screenshots are not the video's: they are taken in the real app (`npm run site-shots` at the root,
// tests/site-shots/README.md).

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { LANGS } from '../src/lang';
import { imagePath, posterFrame, subtitlesFile } from '../src/siteShots';
import { webvtt } from '../src/subtitles';
import { TIMELINE } from '../src/timeline';

const SITE = '../website/public';
const only = process.argv.find((a) => a.startsWith('--lang='))?.slice(7);
const langs = LANGS.filter((l) => !only || l === only);
if (!langs.length) throw new Error(`Langue inconnue : ${only}`);

const serveUrl = await bundle({ entryPoint: fileURLToPath(new URL('../src/index.ts', import.meta.url)) });
for (const lang of langs) {
  // The poster: the board, with the scene's title.
  const inputProps = { lang };
  mkdirSync(dirname(`${SITE}/${imagePath(lang, 'poster')}`), { recursive: true });
  const presentation = await selectComposition({ serveUrl, id: 'Presentation', inputProps });
  await renderStill({
    composition: presentation,
    serveUrl,
    output: `${SITE}/${imagePath(lang, 'poster')}`,
    frame: posterFrame(),
    inputProps,
    imageFormat: 'jpeg',
    jpegQuality: 85,
  });
  writeFileSync(`${SITE}/${subtitlesFile(lang)}`, webvtt(TIMELINE, lang));
  console.log(`${imagePath(lang, 'poster')}, ${subtitlesFile(lang)}`);
}
// The video is the French one, for both pages; the logo is shared.
if (existsSync('out/escouade-web.mp4')) {
  copyFileSync('out/escouade-web.mp4', `${SITE}/escouade.mp4`);
  console.log('escouade.mp4');
} else console.log('out/escouade-web.mp4 absent : escouade.mp4 reste celui du site (npm run render, puis npm run web-video)');
copyFileSync('../public/logo.svg', `${SITE}/logo.svg`);
