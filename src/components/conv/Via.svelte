<script lang="ts">
  import { t } from '../../lib/i18n';

  // Who answered a request through Escouade's MCP server, and not the user in the window: « par chef-escouade », then
  // « via Escouade » in the teal of Escouade (2.0 design).
  let { author }: { author: string } = $props();
</script>

<span class="who">{t('composer.permission.by')} <b>{author}</b></span>
<span class="via">{t('composer.permission.via')}</span>

<style>
  .who b {
    color: var(--soft);
    font-weight: 550;
  }
  .via {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 5px;
    background: color-mix(in oklch, var(--brand) 12%, transparent);
    color: var(--teal-ink);
    font-size: 11px;
    font-weight: 560;
    white-space: nowrap;
  }
</style>
