<script lang="ts">
  import Rich from '../../lib/i18n/Rich.svelte';
  import { t } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import type { Agent } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // The setup of the agent's new worktree under way: the step running and, unfolded, what it writes as it comes (its
  // last lines: the whole output goes to the agent's setup log).
  let { agent }: { agent: Agent } = $props();

  let open = $state(false);
  let out = $state<HTMLPreElement>();
  // The output follows what comes while it is read at its end, not once the reader scrolled up in it.
  let stick = true;
  const lines = $derived(app.setupOutput[agent.id]?.lines ?? []);
  const outId = $derived(`setup-out-${agent.id}`);

  // After the lines are drawn: at the end of the new ones.
  $effect(() => {
    void lines;
    if (out && stick) out.scrollTop = out.scrollHeight;
  });

  function onScroll() {
    if (out) stick = out.scrollHeight - out.scrollTop - out.clientHeight < 8;
  }

  function toggle() {
    open = !open;
    stick = true;
  }
</script>

<div class="setup">
  <div class="line">
    <span class="spark" aria-hidden="true"><Icon name="spark" size={14} /></span>
    <span role="status"><Rich k="conv.setup.running">{#snippet step()}<span class="mono">{agent.setup}</span>{/snippet}</Rich></span>
    <button class="see" aria-expanded={open} aria-controls={open ? outId : undefined} onclick={toggle}>
      <span class="chev" aria-hidden="true"><Icon name="right" size={14} /></span>{t('conv.setup.showOutput')}
    </button>
  </div>
  {#if open}
    <!-- Focusable, as every scrolled region: read from the keyboard too. Not read aloud as it comes (a build writes
         hundreds of lines). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre
      id={outId}
      class="out"
      class:empty={!lines.length}
      role="log"
      aria-live="off"
      aria-label={t('conv.setup.outputLabel', { step: agent.setup ?? '' })}
      tabindex="0"
      bind:this={out}
      onscroll={onScroll}>{lines.length ? lines.join('\n') : t('conv.setup.noOutput')}</pre>
  {/if}
</div>

<style>
  .setup {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .spark {
    display: flex;
    color: var(--p-ink);
    animation: spin 3.2s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .see {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px 0 5px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .see:hover,
  .see[aria-expanded='true'] {
    background: var(--hover);
    color: var(--text);
  }
  .chev {
    display: flex;
    transition: transform 0.2s var(--ease);
  }
  .see[aria-expanded='true'] .chev {
    transform: rotate(90deg);
  }
  .out {
    margin: 0;
    padding: 10px 12px;
    max-height: 260px;
    overflow: auto;
    border-radius: 10px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--code-fg);
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .out:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: 1px;
  }
  .out.empty {
    color: var(--code-dim);
  }
  @media (prefers-reduced-motion: reduce) {
    .spark {
      animation: none;
    }
    .chev {
      transition: none;
    }
  }
</style>
