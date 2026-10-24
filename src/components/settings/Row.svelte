<script lang="ts">
  import type { Snippet } from 'svelte';
  import SharedMark from './SharedMark.svelte';

  // A setting (`.sr` of the 2.0 design): its label (and hint), what it does, its control on the right, or under it when
  // `wide`; `shared`, the keys of the project's .escouade.yml it shows, marked when the file sets them; `extra`, more
  // lines under what it does (« Trouvé : … », « Claude Code seulement : … »).
  let {
    label,
    hint = '',
    desc = '',
    descId,
    wide = false,
    shared,
    extra,
    children,
  }: {
    label: string;
    hint?: string;
    desc?: string;
    descId?: string;
    wide?: boolean;
    shared?: string | string[];
    extra?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="sr" class:wide>
  <div class="lab">
    <b class="l"
      >{label}{#if hint}&nbsp;<span class="h">{hint}</span>{/if}</b
    >
    {#if desc}<span class="d" id={descId}>{desc}</span>{/if}
    {#if extra}{@render extra()}{/if}
    {#if shared}<SharedMark keys={shared} />{/if}
  </div>
  {#if children}<div class="ctl">{@render children()}</div>{/if}
</div>

<style>
  .sr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 28px;
    padding: 13px 0;
  }
  :global(.sg) > :global(h2) + .sr,
  :global(.sg) > :global(.hg) + .sr,
  :global(.sg) > :global(.note) + .sr {
    margin-top: 6px;
  }
  :global(.sr) + .sr {
    border-top: 1px solid rgba(var(--fg-rgb), 0.05);
  }
  .sr.wide {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .lab {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .l {
    font-weight: 550;
  }
  .h {
    color: var(--muted);
    font-weight: 400;
  }
  /* What it does, and the lines under it: `.found` (a check), `.only` (what a harness does not do), `.warn`, `.bad`. */
  .d,
  .lab > :global(.more),
  .lab > :global(.found),
  .lab > :global(.only),
  .lab > :global(.warn),
  .lab > :global(.bad) {
    max-width: 62ch;
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .lab > :global(.found),
  .lab > :global(.only) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lab > :global(.found) {
    margin-top: 3px;
  }
  .lab > :global(.found .icon) {
    color: var(--add);
  }
  .lab > :global(.warn) {
    color: var(--warn-ink);
  }
  .lab > :global(.bad) {
    color: var(--del);
  }
  .ctl {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
    /* What it sets keeps its room: a control wider than this wraps or goes under it. */
    max-width: 62cqw;
  }
  .wide > .ctl {
    max-width: none;
    justify-content: flex-start;
  }
  /* Narrow (the CI's window, a long label): the control goes under what it sets. */
  @container settings (max-width: 520px) {
    .sr {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .ctl {
      justify-content: flex-start;
      flex-wrap: wrap;
      max-width: none;
    }
  }
</style>
