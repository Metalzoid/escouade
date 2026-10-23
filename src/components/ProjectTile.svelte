<script lang="ts">
  import { t } from '../lib/i18n';
  import { initials, type TileState } from '../lib/project-rail';
  import { tip, type TipRow } from '../lib/tip';
  import type { Project } from '../lib/types';
  import Icon from './Icon.svelte';

  // A project's tile on the rail (ESC-158): its colour and its two letters; its agents waiting in an amber pill, at work in
  // a green dot, the lock of a private project; its name, its shortcut, its changes and the rest in a tooltip beside it.
  // The rail handles the clicks, the menu, the keys and the drag (ProjectRail).
  let {
    project,
    state,
    selected,
    shortcut,
    dragging = false,
    focusable,
    el = $bindable(),
    ...handlers
  }: {
    project: Project;
    state: TileState;
    /** The project on screen. */
    selected: boolean;
    /** « Ctrl 1 » for the first nine. */
    shortcut: string | null;
    dragging?: boolean;
    /** In the tab order (the rail's one tile that is: the selected one, else the first). */
    focusable: boolean;
    el?: HTMLButtonElement;
    onclick: (e: MouseEvent) => void;
    oncontextmenu: (e: MouseEvent) => void;
    onauxclick: (e: MouseEvent) => void;
    onkeydown: (e: KeyboardEvent) => void;
    ondragstart: (e: DragEvent) => void;
    ondragover: (e: DragEvent) => void;
    ondrop: (e: DragEvent) => void;
    ondragend: (e: DragEvent) => void;
  } = $props();

  const rows = $derived.by(() => {
    const out: TipRow[] = [];
    const s = state;
    if (s.attention.length && !selected)
      out.push({ dot: s.alert ?? undefined, text: t('nav.titleBar.attention', { names: s.attention.join(', ') }) });
    if (s.waiting) out.push({ dot: 'var(--wait)', text: t('nav.rail.waiting', { count: s.waiting }) });
    if (s.running) out.push({ dot: 'var(--run)', text: t('nav.rail.running', { count: s.running }) });
    if (s.changes) out.push({ dot: 'var(--git-m)', text: t('nav.rail.delta', { count: s.changes }) });
    if (project.private) out.push({ icon: 'lock', text: t('nav.rail.private') });
    if (!out.length) out.push({ text: t('nav.rail.idle') });
    return out;
  });

  /** Its name to a screen reader, and what the badges say. */
  const label = $derived(
    [
      project.name,
      state.waiting && t('nav.rail.waitingShort', { count: state.waiting }),
      state.running && t('nav.rail.runningShort', { count: state.running }),
      state.changes && `Δ ${state.changes}`,
      project.private && t('nav.rail.privateShort'),
    ]
      .filter(Boolean)
      .join(', '),
  );
</script>

<button
  class="tile proj"
  class:alert={!!state.alert && !selected}
  class:dragging
  role="tab"
  aria-selected={selected}
  aria-label={label}
  tabindex={focusable ? 0 : -1}
  style:--c={project.color}
  style:--alert={state.alert}
  draggable="true"
  bind:this={el}
  use:tip={{ title: project.name, kbd: shortcut ?? undefined, rows, side: 'right', aria: false }}
  {...handlers}
>
  <span class="ini" aria-hidden="true">{initials(project.name)}</span>
  {#if project.private}<span class="lock" aria-hidden="true"><Icon name="lock" size={12} /></span>{/if}
  {#if state.waiting}<span class="ask" aria-hidden="true">{state.waiting}</span>{/if}
  {#if state.running}<span class="busy" aria-hidden="true"></span>{/if}
</button>

<style>
  .tile {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--c);
    color: var(--on-tile);
    font: 650 13px/1 var(--font);
    letter-spacing: 0.01em;
    cursor: pointer;
    transition:
      background-color 0.15s,
      box-shadow 0.2s var(--ease);
  }
  .tile:hover {
    background: color-mix(in oklch, var(--c) 88%, var(--text));
  }
  /* The trait on the rail's edge: short when hovered, long when active. */
  .tile::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    width: 4px;
    height: 22px;
    border-radius: 0 3px 3px 0;
    background: var(--line-3);
    transform: translateY(-50%) scaleY(0);
    transition: transform 0.2s var(--ease);
  }
  .tile:hover::before {
    transform: translateY(-50%) scaleY(0.4545);
  }
  .tile[aria-selected='true']::before {
    transform: translateY(-50%) scaleY(1);
    background: var(--p-ink);
  }
  .tile[aria-selected='true'] {
    box-shadow:
      0 0 0 2px var(--frame),
      0 0 0 4px var(--p-ink);
  }
  .tile:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--frame),
      0 0 0 4px var(--p-ink);
  }
  /* An agent of this project to look at: a ring in the colour of what happened (an error, a question, an end), which
     breathes until it is seen. */
  .tile.alert {
    box-shadow:
      0 0 0 2px var(--frame),
      0 0 0 4px var(--alert);
    animation: tile-alert 1.1s ease-in-out infinite alternate;
  }
  @keyframes tile-alert {
    from {
      box-shadow:
        0 0 0 2px var(--frame),
        0 0 0 4px color-mix(in oklch, var(--alert) 35%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile.alert {
      animation: none;
    }
  }
  /* Being dragged: its place stays hollow. */
  .tile.dragging {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-3);
  }
  .tile.dragging > * {
    visibility: hidden;
  }
  .ask {
    position: absolute;
    top: -6px;
    right: -7px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--wait);
    color: var(--on-wait);
    box-shadow: 0 0 0 2px var(--frame);
    font-size: 11px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  .busy {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--run);
    box-shadow: 0 0 0 2px var(--frame);
  }
  .lock {
    position: absolute;
    left: -5px;
    bottom: -5px;
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--frame);
    color: var(--soft);
  }
</style>
