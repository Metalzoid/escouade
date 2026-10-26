import { describe, expect, it } from 'vitest';
import { imagePath, POSTER_SCENE, posterFrame, subtitlesFile } from './siteShots';
import { sceneOf } from './timeline';

describe('what the website takes from the video', () => {
  it('goes to images/ in French and images/en/ in English, with the subtitles beside the video', () => {
    expect(imagePath('fr', 'poster')).toBe('images/poster.jpg');
    expect(imagePath('en', 'poster')).toBe('images/en/poster.jpg');
    expect(subtitlesFile('fr')).toBe('escouade.vtt');
    expect(subtitlesFile('en')).toBe('escouade.en.vtt');
  });

  it('has a poster: the last moments of the Kanban scene, with its title', () => {
    const scene = sceneOf(POSTER_SCENE);
    expect(posterFrame()).toBe(scene.from + scene.durationInFrames - 8);
  });
});
