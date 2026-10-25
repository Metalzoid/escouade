// The width of the projects' rail (ESC-168): its right edge dragged, the same for all projects, kept in the app's
// settings (`railWidth`) as the zoom is. Until it is dragged, the rail has its usual width: 52 px, or 72 px once a
// project has its label under its tile. Its tiles keep their 36 px; from 160 px each has its name on its right, a row
// each (the rail's `@container`).

import { api } from './ipc';
import { clamp } from './resize';
import { app } from './state.svelte';

/** The narrowest: the tiles alone, as before ESC-168. */
export const RAIL_MIN = 52;
/** The widest: a list of names, as the sidebar of the agents (276 px) is a list. */
export const RAIL_MAX = 300;
/** The usual width once a project has its label under its tile: ten letters at 10.5 px. */
export const RAIL_LABELLED = 72;
/** From this width, the names go on the tiles' right: twelve letters at 13 px beside a tile. */
export const RAIL_LIST = 160;
/** What the rest of the window keeps beside the rail: the room a window of 1 000 px (the narrowest) leaves it today. */
export const ROOM_BESIDE = 948;
/** How long after the edge is let go the width is saved: a few presses of an arrow are one save. */
export const SAVE_DELAY_MS = 400;

/** The usual width: with labels under the tiles, or not. */
export const railUsual = (labelled: boolean) => (labelled ? RAIL_LABELLED : RAIL_MIN);

/** The widest the rail is drawn in a window `width` px wide: what the rest leaves, between its narrowest and its widest. */
export const railRoom = (width: number) => clamp(width - ROOM_BESIDE, RAIL_MIN, RAIL_MAX);

/** The width drawn: the one chosen (else the usual one), narrower when the window has no room for it. */
export const railShown = (chosen: number | null, labelled: boolean, width: number) =>
  clamp(chosen ?? railUsual(labelled), RAIL_MIN, railRoom(width));

/** The width the settings keep, null for the usual one (0, absent, or not a width). */
export function chosenWidth(kept: number | undefined): number | null {
  return kept && Number.isFinite(kept) && kept > 0 ? clamp(Math.round(kept), RAIL_MIN, RAIL_MAX) : null;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

class RailWidth {
  /** The window's width (App binds it). */
  window = $state(typeof window === 'undefined' ? 1440 : window.innerWidth);

  /** Chosen by its edge; null for the usual width. */
  get chosen() {
    return chosenWidth(app.settings.railWidth);
  }
  /** A project has its label under its tile. */
  get labelled() {
    return app.projects.some((p) => p.tileLabel);
  }
  get usual() {
    return railUsual(this.labelled);
  }
  get max() {
    return railRoom(this.window);
  }
  get shown() {
    return railShown(this.chosen, this.labelled, this.window);
  }

  /** The edge moving: the width follows, saved once it is let go. */
  set(width: number) {
    app.settings.railWidth = Math.round(width);
  }
  commit(width: number) {
    this.set(width);
    this.#save();
  }
  /** A double click on the edge: the usual width again, which follows the labels. */
  reset() {
    app.settings.railWidth = 0;
    this.#save();
  }

  #save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      app.run(api.saveSettings($state.snapshot(app.settings)));
    }, SAVE_DELAY_MS);
  }
}

export const railWidth = new RailWidth();
