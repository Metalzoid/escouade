<script lang="ts">
  import type { NoticeItem } from '../../lib/types';

  let { item }: { item: NoticeItem } = $props();
</script>

<div class="notice {item.level}">{item.text}</div>

<style>
  .notice {
    margin-left: 34px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--dim);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* What a local command printed: its lines and their columns as it wrote them (the table of /context). */
  .output {
    padding: 8px 12px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line2);
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11.5px;
    white-space: pre;
    overflow: auto;
    max-height: 360px;
  }
  .warn {
    color: var(--wait);
  }
  .error {
    padding: 10px 14px;
    border-radius: var(--r-sm);
    border: 1px solid color-mix(in oklch, var(--del) 50%, transparent);
    background: color-mix(in oklch, var(--del) 8%, transparent);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11.5px;
    max-height: 260px;
    overflow: auto;
  }
</style>
