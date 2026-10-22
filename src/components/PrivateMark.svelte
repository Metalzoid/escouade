<script lang="ts">
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';

  // The lock of a private project (« Projet privé »): on its tab and among the settings' projects. What it means is its
  // name to a screen reader, and its tooltip.
</script>

<span class="private-mark" role="img" aria-label={t('nav.titleBar.private')} use:tip={{ text: t('nav.titleBar.private'), aria: false }}>
  <svg width="9" height="11" viewBox="0 0 9 11" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"
    ><rect x="1" y="4.8" width="7" height="5.4" rx="1.2" /><path d="M2.6 4.8V3.3a1.9 1.9 0 0 1 3.8 0v1.5" /></svg
  >
</span>

<style>
  .private-mark {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--muted);
  }
</style>
