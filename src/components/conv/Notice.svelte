<script lang="ts">
  import type { NoticeItem } from '../../lib/types';

  let { item }: { item: NoticeItem } = $props();
</script>

{#if item.level === 'switch'}
  <!-- The switch of account past the threshold (ESC-148): a separator, as a handover's; where it goes on, in bold. -->
  {@const cut = item.text.indexOf(' : ') >= 0 ? item.text.indexOf(' : ') : item.text.indexOf(': ')}
  <div class="sep" role="separator" aria-label={item.text}>
    <span class="sep-text"
      >{#if cut > 0}<b>{item.text.slice(0, cut)}</b>{item.text.slice(cut)}{:else}{item.text}{/if}</span
    >
  </div>
{:else}
  <div class="notice {item.level}">{item.text}</div>
{/if}

<style>
  .notice {
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* What a local command printed: its lines and their columns as it wrote them (the table of /context). */
  .output {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--code-fg);
    font-family: var(--mono);
    font-size: 11.5px;
    white-space: pre;
    overflow: auto;
    max-height: 360px;
  }
  .warn {
    color: var(--warn-ink);
  }
  .sep {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .sep::before,
  .sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line-2);
  }
  .sep-text {
    flex: none;
    max-width: 80%;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .sep b {
    color: var(--soft);
    font-weight: 550;
  }
  .error {
    padding: 10px 14px;
    border-radius: 10px;
    background: oklch(from var(--del) l c h / 0.07);
    box-shadow: inset 0 0 0 1px oklch(from var(--del) l c h / 0.35);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11.5px;
    max-height: 260px;
    overflow: auto;
  }
</style>
