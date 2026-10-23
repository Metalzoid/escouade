<script lang="ts">
  import { iconId, type IconName } from '../lib/icons';

  // An icon of the app (lib/icons.ts): its symbol in the page (IconSprite.svelte), drawn in the colour of its text, at
  // 16 pixels by default (14 in a small control). Says nothing to a screen reader: its control has the name.
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" data-icon={name} width={size} height={size} aria-hidden="true"><use href="#{iconId(name)}" /></svg>

<style>
  .icon {
    display: block;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
