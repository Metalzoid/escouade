<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { hueOf, initialOf } from '../../lib/sharing';
  import { app } from '../../lib/state.svelte';
  import Icon from '../Icon.svelte';
  import Modal from './Modal.svelte';

  // The first launch's question (ESC-190, choice 112): the user's name for the team, offered from `git config user.name`.
  // « Plus tard » puts it off: asked again at the first share. `then`: what waited for the name (a share).
  let { projectId, then }: { projectId?: string; then?: () => void } = $props();

  let name = $state(app.settings.userName ?? '');
  /** The name came from git: the help says so. */
  let fromGit = $state(false);
  let busy = $state(false);
  const id = $props.id();

  onMount(async () => {
    if (name.trim()) return;
    const git = await api.gitUserName(projectId).catch(() => '');
    if (git && !name.trim()) {
      name = git;
      fromGit = true;
    }
  });

  /** Kept in the settings (the app's name, never `.escouade.yml`), the question marked asked. */
  async function keep(given: string | null) {
    busy = true;
    const next = { ...$state.snapshot(app.settings), nameAsked: true, ...(given === null ? {} : { userName: given }) };
    const saved = await app.run(api.saveSettings(next).then(() => true));
    busy = false;
    if (!saved) return;
    app.settings = next;
    app.modal = null;
    if (given) then?.();
  }
</script>

<Modal title={t('share.name.title')} width={500} onclose={() => keep(null)}>
  {#snippet lead()}<span class="lead"><Icon name="user" /></span>{/snippet}
  <p class="p">{t('share.name.body')}</p>
  <div class="fld">
    <label for="{id}-name">{t('share.name.label')}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="{id}-name"
      class="field"
      bind:value={name}
      autofocus
      onkeydown={(e) => e.key === 'Enter' && name.trim() && keep(name.trim())}
    />
    <span class="help">{fromGit ? t('share.name.help') : t('share.name.helpEmpty')}</span>
  </div>
  {#if name.trim()}
    <div class="prev">
      <span>{t('share.name.preview')}</span>
      <span class="who"><i style:--h={hueOf(app.settings.userId || name)} aria-hidden="true">{initialOf(name)}</i>{name.trim()}</span>
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn" disabled={busy} style="margin-right: auto" onclick={() => keep(null)}>{t('share.name.later')}</button>
    <button class="btn primary" disabled={busy || !name.trim()} onclick={() => keep(name.trim())}>{t('share.name.save')}</button>
  {/snippet}
</Modal>

<style>
  .lead {
    display: inline-flex;
    color: var(--muted);
  }
  .p {
    margin: 0;
    color: var(--soft);
    line-height: 1.55;
  }
  .fld {
    display: grid;
    gap: 6px;
  }
  .fld label {
    color: var(--soft);
    font-size: 12.5px;
    font-weight: 550;
  }
  .help {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }
  .prev {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(var(--fg-rgb), 0.035);
    color: var(--muted);
    font-size: 12px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--soft);
    font-weight: 550;
  }
  .who > i {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: light-dark(oklch(0.9 0.05 var(--h)), oklch(0.42 0.08 var(--h)));
    color: light-dark(oklch(0.36 0.1 var(--h)), oklch(0.97 0.02 var(--h)));
    font: normal 600 9.5px/1 var(--font);
  }
</style>
