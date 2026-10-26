// How each screenshot of the app is framed on the page. The shots are 1920×960, the app's window in the middle of
// a margin of its own backdrop; the hero shows the window whole, the features a close-up on what each one is about.
import type { FeatureId } from './site';

/** The app's window inside the shots that frame it alone (all but the notification and the phone): x, y, width, height. */
export const WINDOW = { x: 210, y: 70, w: 1500, h: 844 } as const;
export const SHOT = { w: 1920, h: 960 } as const;

/** What a feature's close-up shows: its centre (in % of the shot) and how far it zooms in. */
export interface Focus {
  x: number;
  y: number;
  zoom: number;
}

export const FOCUS: Record<FeatureId, Focus> = {
  agents: { x: 30, y: 42, zoom: 1.5 },
  chat: { x: 55, y: 45, zoom: 1.5 },
  notifications: { x: 52, y: 40, zoom: 1.5 },
  git: { x: 66, y: 42, zoom: 1.5 },
  editeur: { x: 58, y: 48, zoom: 1.6 },
  tableau: { x: 60, y: 42, zoom: 1.5 },
  test: { x: 50, y: 50, zoom: 1.7 },
  integrations: { x: 50, y: 52, zoom: 1.5 },
  lancement: { x: 36, y: 42, zoom: 1.5 },
  stats: { x: 52, y: 45, zoom: 1.5 },
  remote: { x: 46, y: 52, zoom: 1.4 },
};
