<script lang="ts" generics="T extends string | number">
  import { tip } from '../../lib/tip';
  // One choice among a few, in segments (the common control of src/app.css, `.segmented`); `lang`: the language a
  // choice is written in, when not the interface's (a language named in itself), for screen readers.
  let {
    value = $bindable(),
    options,
    label,
    mono = false,
  }: {
    value: T;
    options: { value: T; label: string; title?: string; lang?: string; disabled?: boolean }[];
    label: string;
    mono?: boolean;
  } = $props();
</script>

<div class="segmented chips" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button
      class="chip"
      class:mono
      class:on={value === o.value}
      aria-pressed={value === o.value}
      lang={o.lang}
      disabled={o.disabled}
      use:tip={o.title}
      onclick={() => (value = o.value)}>{o.label}</button
    >
  {/each}
</div>

<style>
  /* On one line, as the preview has them; in a narrow window, the segments wrap rather than overflow. */
  .chips {
    flex: 0 1 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 100%;
  }
  .chip.mono {
    font-family: var(--mono);
    font-size: 11.5px;
  }
</style>
