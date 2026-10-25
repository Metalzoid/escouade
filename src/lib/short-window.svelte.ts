// A short window, 820 px tall or less (choice 9 of the 2.0 design): Lancement and Terminaux fold to their header, which
// unfolds them on a click. A laptop's 768 px screen is one, and so is a 1080 px one at 150 %.

export const SHORT_WINDOW = '(max-height: 820px)';

const query = typeof matchMedia === 'function' ? matchMedia(SHORT_WINDOW) : null;

class ShortWindow {
  /** The window is short now: the folding sections start folded. */
  now = $state(query?.matches ?? false);
}

export const shortWindow = new ShortWindow();

query?.addEventListener('change', (e) => (shortWindow.now = e.matches));
