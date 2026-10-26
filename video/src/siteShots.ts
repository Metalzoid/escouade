// What the website takes from the video (`npm run site-images`): its poster, and where each language's file goes. The
// website's screenshots are no longer the video's: they are taken in the real app (`npm run site-shots` at the root,
// tests/site-shots/README.md).

import type { Lang } from './lang';
import { sceneOf, type SceneId } from './timeline';

/** The poster: the Kanban scene's last moments, with its title. */
export const POSTER_SCENE: SceneId = 'board';
export const posterFrame = () => {
  const board = sceneOf(POSTER_SCENE);
  return board.from + board.durationInFrames - 8;
};

/** A picture of the website, relative to `website/public`: French at the root of `images/`, the others in their folder. */
export const imagePath = (lang: Lang, name: string) => (lang === 'fr' ? `images/${name}.jpg` : `images/${lang}/${name}.jpg`);

/** The subtitles file, beside the video. */
export const subtitlesFile = (lang: Lang) => (lang === 'fr' ? 'escouade.vtt' : `escouade.${lang}.vtt`);
