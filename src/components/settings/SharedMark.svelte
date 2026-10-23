<script lang="ts">
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { settingsForm } from '../../lib/settings.svelte';
  import { keptKeys, sharedState } from '../../lib/shared-file';
  import { app } from '../../lib/state.svelte';
  import type { Project } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // Where a setting of the project comes from, when its .escouade.yml sets it: the file, the file but waiting for the
  // user's approval (a command), or this machine, ahead of the file (written into it, or given back to it, from here).
  // Three marks (choice 29 of the 2.0 design): teal for the file, amber while it waits, neutral for this machine.
  let { keys }: { keys: string | string[] } = $props();

  const project = $derived(app.projects.find((p) => p.id === settingsForm.projectId));
  const state = $derived(sharedState(project, keys));
  const kept = $derived(keptKeys(project, keys));

  async function write() {
    if (!project) return;
    const p = await app.run(api.sharedWrite(project.id, kept));
    if (p) {
      app.replaceProject(p);
      app.toast(t('settings.shared.written'));
    }
  }

  async function useFile() {
    if (!project) return;
    let p: Project | undefined;
    for (const k of kept) p = (await app.run(api.sharedUnkeep(project.id, k))) ?? p;
    if (p) {
      app.replaceProject(p);
      // The file's value, shown from now on.
      settingsForm.refresh(p);
    }
  }
</script>

{#if state === 'local'}
  <span class="shared">
    <span class="mark" data-shared="local"><Icon name="user" size={12} /><span>{t('settings.shared.local')}</span></span>
    <span class="acts">
      <button class="link" onclick={write}>{t('settings.shared.writeKey')}</button>
      <button class="link" onclick={useFile}>{t('settings.shared.useFile')}</button>
    </span>
  </span>
{:else if state}
  <span class="mark" data-shared={state}
    ><Icon name={state === 'pending' ? 'shield' : 'file'} size={12} /><span
      >{state === 'pending' ? t('settings.shared.fromFilePending') : t('settings.shared.fromFile')}</span
    ></span
  >
{/if}

<style>
  .shared {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    margin-top: 2px;
  }
  .mark {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    max-width: 100%;
    min-height: 19px;
    padding: 1px 6px;
    border-radius: 5px;
    background: rgba(var(--fg-rgb), 0.05);
    color: var(--soft);
    font-size: 11px;
    font-weight: 550;
    line-height: 1.4;
  }
  .mark :global(.icon) {
    color: var(--muted);
  }
  .mark[data-shared='file'] {
    background: color-mix(in oklch, var(--brand) 12%, transparent);
    color: var(--teal-ink);
  }
  .mark[data-shared='pending'] {
    background: var(--wait-bg);
    box-shadow: inset 0 0 0 1px var(--wait-line);
    color: var(--warn-ink);
  }
  .mark[data-shared='file'] :global(.icon),
  .mark[data-shared='pending'] :global(.icon) {
    color: currentColor;
  }
  .acts {
    display: inline-flex;
    gap: 10px;
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--p-ink);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
</style>
