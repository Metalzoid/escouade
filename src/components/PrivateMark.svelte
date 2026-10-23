<script lang="ts">
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';
  import Icon from './Icon.svelte';

  // The lock of a private project (« Projet privé »): on its tab and among the settings' projects. What it means is its
  // name to a screen reader, and its tooltip.
  let { size = 12 }: { size?: number } = $props();
</script>

<span class="private-mark" role="img" aria-label={t('nav.titleBar.private')} use:tip={{ text: t('nav.titleBar.private'), aria: false }}>
  <Icon name="lock" {size} />
</span>

<style>
  .private-mark {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--muted);
  }
</style>
