// The tint of the whole window: `--p`, the active project's colour, from which src/app.css draws every surface (frame,
// panel, reliefs, wells), the focus, the selection and the project's light (`.root::before` in App.svelte, at `--glow`).
// `--p` is a registered property (`@property` in app.css): it glides in 0.7 s from one project to the next, and stops
// gliding with prefers-reduced-motion. The overview, the stats and a window without a project take Escouade's teal.

/** Escouade's teal, the colour of the views over every project (the overview, the stats) and of no project at all. */
export const BRAND = 'oklch(0.74 0.115 190)';

export const PROJECT_COLORS = [48, 300, 200, 150, 250, 0, 25, 70, 110, 175, 225, 275, 325]
  .map((h) => `oklch(0.72 0.12 ${h})`)
  .concat(['oklch(0.8 0.02 60)']);

let applied = '';

/** Tints the window with a project's colour, or Escouade's teal (`null`: the overview, the stats, no project). */
export function applyTheme(color: string | null) {
  const c = color ?? BRAND;
  if (applied === c) return;
  applied = c;
  document.documentElement.style.setProperty('--p', c);
}

/** The colour the window is tinted with now. */
export function tint(): string {
  return applied || BRAND;
}
