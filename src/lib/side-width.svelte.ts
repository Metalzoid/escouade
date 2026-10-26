// The width of the sidebar (ESC-204), the column of the agents and the Kanban beside the projects' rail: its right edge
// dragged, the same for all projects, kept in the app's settings (`sideWidth`) as the rail's is. Until it is dragged,
// it has its usual width, 276 px (`--side`). Narrow, the cards of the agents and the buttons « Nouvel agent »,
// Lancement and Terminaux still hold on their lines; wide, the cards' names and lines have more room.

import { api } from './ipc';
import { railWidth } from './rail-width.svelte';
import { clamp } from './resize';
import { app } from './state.svelte';

/** The narrowest: « Nouvel agent » and its arrow, a card's name, its harness and its time still on their lines. */
export const SIDE_MIN = 220;
/** The widest: past it, the conversation would give more than the sidebar gains. */
export const SIDE_MAX = 480;
/** The usual width, the design's (`--side`). */
export const SIDE_USUAL = 276;
/** What the work keeps beside the rail and the sidebar: the room a window of 1 000 px (the narrowest) leaves it today. */
export const ROOM_FOR_WORK = 1000 - 52 - SIDE_USUAL;
/** How long after the edge is let go the width is saved: a few presses of an arrow are one save. */
export const SAVE_DELAY_MS = 400;

/** The widest the sidebar is drawn in a window `width` px wide beside a rail `rail` px wide. */
export const sideRoom = (width: number, rail: number) => clamp(width - rail - ROOM_FOR_WORK, SIDE_MIN, SIDE_MAX);

/** The width drawn: the one chosen (else the usual one), narrower when the window has no room for it. */
export const sideShown = (chosen: number | null, width: number, rail: number) =>
  clamp(chosen ?? SIDE_USUAL, SIDE_MIN, sideRoom(width, rail));

/** The width the settings keep, null for the usual one (0, absent, or not a width). */
export function chosenSide(kept: number | undefined): number | null {
  return kept && Number.isFinite(kept) && kept > 0 ? clamp(Math.round(kept), SIDE_MIN, SIDE_MAX) : null;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

class SideWidth {
  /** Chosen by its edge; null for the usual width. */
  get chosen() {
    return chosenSide(app.settings.sideWidth);
  }
  get max() {
    return sideRoom(railWidth.window, railWidth.shown);
  }
  get shown() {
    return sideShown(this.chosen, railWidth.window, railWidth.shown);
  }

  /** The edge moving: the width follows, saved once it is let go. */
  set(width: number) {
    app.settings.sideWidth = Math.round(width);
  }
  commit(width: number) {
    this.set(width);
    this.#save();
  }
  /** A double click on the edge: the usual width again. */
  reset() {
    app.settings.sideWidth = 0;
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

export const sideWidth = new SideWidth();
