<script lang="ts">
  import { tileSize } from '../lib/project-rail';

  // What a project's tile shows (ESC-167), wherever it is drawn: its logo, in the tile's shape and on its colour where
  // it is transparent, else its letters. Inside a tile that is `position: relative` and sets its radius; its badges
  // (agents, lock) go over it.
  let { text, logo }: { text: string; logo: string | null } = $props();

  const size = $derived(tileSize(text));
</script>

{#if logo}
  <!-- An image, never markup: an SVG's scripts do not run. -->
  <img class="logo" src={logo} alt="" draggable="false" aria-hidden="true" />
{:else}
  <span class="ini" class:three={size === 'three'} class:emoji={size === 'emoji'} aria-hidden="true">{text}</span>
{/if}

<style>
  .logo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }
  .ini.three {
    font-size: 0.85em;
    letter-spacing: -0.02em;
  }
  .ini.emoji {
    font-size: 1.4em;
    font-weight: 400;
  }
</style>
