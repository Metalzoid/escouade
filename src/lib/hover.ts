/**
 * The pointer's own moves, for a list whose active row follows the mouse (ESC-188). Chromium sends a `mousemove` of its
 * own, the pointer standing still, when what is under it moves: a list that scrolls, a line that grows. Taken for a
 * hover, it made the row that came under the pointer the active one, which scrolled the list again, or took the cursor
 * back from the arrows. Only a move to another place counts: `moved(e)` says whether `e` is one, and keeps its place.
 */
export function pointerMoves() {
  let x = NaN;
  let y = NaN;
  return (e: MouseEvent) => {
    if (e.clientX === x && e.clientY === y) return false;
    x = e.clientX;
    y = e.clientY;
    return true;
  };
}
