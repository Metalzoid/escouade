// The size of the editor's left column (Fichiers / Recherche), kept in the preferences for all projects.

import { readPref, writePref } from '../prefs';

export const TREE_MIN = 160;
export const TREE_DEFAULT = 240;
/** The usual width in a narrow editor (the 2.0 design's 200 px, its editor 692 px wide at 1 028 × 779). */
export const TREE_NARROW = 200;
/** The widest editor area the narrow width is for: the design's at a window of 1 240 px. */
export const NARROW_AREA = 904;

/** The usual width in an editor area `area` px wide, until the column is resized: its own room, not the window's. */
export const treeDefault = (area: number) => (area <= NARROW_AREA ? TREE_NARROW : TREE_DEFAULT);

const PREF = 'editor.treeWidth';

/** The widest the column may be in an editor area `area` px wide: half of it, and never less than its minimum. */
export const treeMax = (area: number) => Math.max(TREE_MIN, Math.floor(area / 2));

/** The width kept, null when none is (or the preference is not a width): the usual one then. Not held to the area: it varies. */
export function readTreeWidth(): number | null {
  const n = Number(readPref(PREF));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export const writeTreeWidth = (width: number) => writePref(PREF, String(Math.round(width)));
