<script lang="ts">
  import { t } from '../../lib/i18n';
  import type { ThinkingItem } from '../../lib/types';
  import Icon from '../Icon.svelte';

  let { item }: { item: ThinkingItem } = $props();
  let open = $state(false);
</script>

{#if item.text.trim() || item.streaming}
  <div class="think">
    <button class="head" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="chev" aria-hidden="true"><Icon name="right" size={14} /></span>{t('conv.thinking.title')}{#if item.streaming}<span
          class="live">…</span
        >{/if}
    </button>
    {#if open}
      <div class="body">{item.text}</div>
    {/if}
  </div>
{/if}

<style>
  .think {
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .head {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
  }
  .head:hover {
    color: var(--text);
  }
  .chev {
    display: flex;
    transition: transform 0.2s var(--ease);
  }
  .head[aria-expanded='true'] .chev {
    transform: rotate(90deg);
  }
  .live {
    animation: ccBlink 1.2s infinite;
  }
  .body {
    padding: 2px 0 2px 12px;
    border-left: 1px solid var(--line-3);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    max-height: 360px;
    overflow: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
    .live {
      animation: none;
    }
  }
</style>
