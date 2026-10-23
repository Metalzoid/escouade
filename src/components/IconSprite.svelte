<script lang="ts">
  import { ICONS, iconId, type IconName } from '../lib/icons';

  // Every icon of the app, once in the page, each a <symbol> that Icon.svelte and the rich tooltip (lib/tip.ts) use:
  // the paths are the app's own (lib/icons.ts), never a text.
  const names = Object.keys(ICONS) as IconName[];
</script>

<svg class="sprite" aria-hidden="true" width="0" height="0">
  {#each names as name (name)}
    <symbol id={iconId(name)} viewBox="0 0 16 16">{@html ICONS[name]}</symbol>
  {/each}
</svg>

<style>
  .sprite {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>
