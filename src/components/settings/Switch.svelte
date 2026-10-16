<script lang="ts">
  // `describedby`: the id of the text that says more of the switch (why it cannot be changed, for instance).
  let {
    on = $bindable(),
    label,
    disabled = false,
    describedby,
  }: { on: boolean; label: string; disabled?: boolean; describedby?: string } = $props();
</script>

<button
  class="switch"
  class:on
  role="switch"
  aria-checked={on}
  aria-label={label}
  aria-describedby={describedby}
  {disabled}
  onclick={() => (on = !on)}
></button>

<style>
  .switch:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
