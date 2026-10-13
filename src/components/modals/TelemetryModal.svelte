<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import { privacyUrl } from '../../lib/telemetry';
  import Modal from './Modal.svelte';

  let busy = $state(false);

  /** The answer, kept at once; the question stays while it cannot be. */
  async function answer(consent: boolean) {
    busy = true;
    try {
      await api.telemetrySet(consent);
      app.settings = { ...app.settings, telemetry: consent };
      app.modal = null;
    } catch (e) {
      app.toast(String(e), 'error');
    } finally {
      busy = false;
    }
  }

  const more = () => openUrl(privacyUrl()).catch((e) => app.toast(String(e), 'error'));
</script>

<!-- Closed without an answer: asked again at the next start. -->
<Modal title={t('shell.telemetry.title')} width={500} onclose={() => (app.modal = null)}>
  <p class="p">{t('shell.telemetry.body')}</p>
  <p class="p">{t('shell.telemetry.detail')}</p>
  <button class="link" onclick={more}>{t('shell.telemetry.more')}</button>
  {#snippet footer()}
    <button class="btn ghost" disabled={busy} onclick={() => answer(false)}>{t('shell.telemetry.no')}</button>
    <button class="btn primary" disabled={busy} onclick={() => answer(true)}>{t('shell.telemetry.yes')}</button>
  {/snippet}
</Modal>

<style>
  .p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }
  .link {
    align-self: flex-start;
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    font-size: 13px;
    cursor: pointer;
  }
</style>
