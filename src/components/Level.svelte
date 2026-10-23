<script lang="ts">
  // The level of the microphone, as the 2.0 design draws it: seven bars in the project's colour, the middle ones taller,
  // all growing with the voice. A meter for screen readers, its value in percent.
  let { level, label }: { level: number; label: string } = $props();

  /** The shape of the bars at full voice, in pixels: a voice is loudest in its middle. */
  const SHAPE = [7, 12, 17, 18, 15, 11, 7];
  const value = $derived(Math.min(1, Math.max(0, level)));
</script>

<span class="level" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(value * 100)}>
  {#each SHAPE as h, i (i)}<i style:height="{Math.max(3, Math.round(h * (0.2 + 0.8 * value)))}px"></i>{/each}
</span>

<style>
  .level {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 18px;
    flex: none;
  }
  i {
    width: 3px;
    border-radius: 2px;
    background: var(--p-ink);
  }
</style>
