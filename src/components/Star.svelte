<script lang="ts">
  import { iconId } from '../lib/icons';

  // The star of a favorite (the icon `star` of lib/icons.ts): an outline, filled for a favorite, in the colour of its
  // button.
  let { on = false, size = 14 }: { on?: boolean; size?: number } = $props();
</script>

<svg class="icon star-icon" class:on data-icon="star" width={size} height={size} aria-hidden="true"><use href="#{iconId('star')}" /></svg>

<style>
  .star-icon {
    display: block;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .star-icon.on {
    fill: currentColor;
  }
</style>
