<script lang="ts">
  import { engineName } from '../../lib/engines';
  import { fTime } from '../../lib/format';
  import { t } from '../../lib/i18n';
  import type { HandoverItem } from '../../lib/types';

  // The change of harness in the conversation (ESC-88): « Suite sur Codex · quota Claude Code épuisé jusqu’à 18:00 ».
  let { item }: { item: HandoverItem } = $props();

  const text = $derived.by(() => {
    const words = { harness: engineName(item.to), from: engineName(item.from) };
    if (!item.limited) return t('handover.separator.asked', words);
    if (item.until === null) return t('handover.separator.limited', words);
    return t('handover.separator.limitedUntil', { ...words, time: fTime(item.until) });
  });
</script>

<div class="sep mono" role="separator" aria-label={text} data-testid="handover">
  <span class="line"></span>
  <span class="text">{text}</span>
  <span class="line"></span>
</div>

<style>
  .sep {
    margin-left: 34px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11.5px;
    color: var(--accent);
  }
  .text {
    flex: none;
    max-width: 80%;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .line {
    flex: 1;
    height: 1px;
    background: color-mix(in oklch, var(--accent) 40%, transparent);
  }
</style>
