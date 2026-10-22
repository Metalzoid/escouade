<script lang="ts">
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { settingsForm } from '../../lib/settings.svelte';
  import { keptKeys, sharedState } from '../../lib/shared-file';
  import { app } from '../../lib/state.svelte';
  import type { Project } from '../../lib/types';

  // Where a setting of the project comes from, when its .escouade.yml sets it: the file, the file but waiting for the
  // user's approval (a command), or this machine, ahead of the file (written into it, or given back to it, from here).
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
  <span class="mark local" data-shared="local">
    <span>{t('settings.shared.local')}</span>
    <span class="acts">
      <button class="link" onclick={write}>{t('settings.shared.writeKey')}</button>
      <button class="link" onclick={useFile}>{t('settings.shared.useFile')}</button>
    </span>
  </span>
{:else if state}
  <span class="mark" data-shared={state}>{state === 'pending' ? t('settings.shared.fromFilePending') : t('settings.shared.fromFile')}</span>
{/if}

<style>
  .mark {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--accent);
  }
  .mark::before {
    content: '⧉';
    margin-right: -6px;
  }
  .mark[data-shared='pending'] {
    color: var(--wait);
  }
  .local {
    color: var(--muted);
  }
  .acts {
    display: inline-flex;
    gap: 10px;
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
