<script lang="ts">
  import type { Snippet } from 'svelte';

  // A group of settings under its title, a hairline above the next (`.sg` of the 2.0 design): its note under the title,
  // then its rows. Beside the title, `state` (a harness's, « Prêt · 2.1.301 ») and `action` (« Ajouter un compte… », on
  // the right); other attributes go to the section. `anchor`: what the modal scrolls to when opened on it. `plain` is kept for the callers that laid out
  // their own box: there is none any more.
  let {
    title,
    note,
    plain: _plain = false,
    anchor,
    state,
    action,
    children,
    ...rest
  }: {
    title?: string;
    note?: string;
    plain?: boolean;
    anchor?: string;
    state?: Snippet;
    action?: Snippet;
    children: Snippet;
    [attr: string]: unknown;
  } = $props();
</script>

<section class="sg" data-anchor={anchor} {...rest}>
  {#if state || action}
    <div class="hg">
      <h2>{title}</h2>
      {#if state}{@render state()}{/if}
      {#if action}<span class="act">{@render action()}</span>{/if}
    </div>
  {:else if title}
    <h2>{title}</h2>
  {/if}
  {#if note}<p class="note">{note}</p>{/if}
  {@render children()}
</section>

<style>
  .sg {
    padding: 20px 0 4px;
  }
  :global(.sg) + .sg {
    border-top: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 620;
  }
  .hg {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .hg h2 {
    flex: none;
  }
  .act {
    display: inline-flex;
    gap: 8px;
    margin-left: auto;
  }
  .note {
    max-width: 64ch;
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
    text-wrap: pretty;
  }
</style>
