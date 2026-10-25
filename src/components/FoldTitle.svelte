<script lang="ts">
  import Icon from './Icon.svelte';

  // The title of a sidebar section that folds in a short window (Lancement, Terminaux; choice 9 of the 2.0 design): there,
  // a button that unfolds it and folds it again, its chevron turned while folded; elsewhere, its plain text.

  let { title, short, folded, ontoggle }: { title: string; short: boolean; folded: boolean; ontoggle: () => void } = $props();
</script>

{#if short}
  <button type="button" class="fold" aria-expanded={!folded} onclick={ontoggle}><Icon name="down" size={12} />{title}</button>
{:else}
  {title}
{/if}

<style>
  .fold {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    margin-left: -6px;
    padding: 0 5px 0 2px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .fold:hover {
    background: rgba(var(--fg-rgb), 0.06);
    color: var(--text);
  }
  .fold:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: 1px;
  }
  .fold :global(.icon) {
    transition: transform 0.2s var(--ease);
  }
  .fold[aria-expanded='false'] :global(.icon) {
    transform: rotate(-90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .fold :global(.icon) {
      transition: none;
    }
  }
</style>
