<script lang="ts">
  import type { Snippet } from 'svelte';

  // The head of a space of the Docs tab (design/factory/2-specification.png): its title and what it says under it, its
  // buttons on the right.
  let { title, line, actions }: { title: string; line?: Snippet; actions?: Snippet } = $props();
</script>

<header class="head">
  <div class="h-title">
    <h1>{title}</h1>
    {#if line}<div class="line">{@render line()}</div>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 66px;
    padding: 10px 16px 10px 22px;
    border-bottom: 1px solid var(--line);
  }
  .h-title {
    display: grid;
    gap: 4px;
    min-width: 0;
    margin-right: auto;
  }
  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 640;
    letter-spacing: -0.015em;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    color: var(--muted);
    font-size: 13px;
  }
  .actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
