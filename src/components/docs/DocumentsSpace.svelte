<script lang="ts">
  import Icon from '../Icon.svelte';
  import { t } from '../../lib/i18n';
  import { docsStore } from '../../lib/docs.svelte';
  import { fSize } from '../../lib/format';
  import type { Project } from '../../lib/types';
  import SpaceHead from './SpaceHead.svelte';

  // « Documents » (ESC-258): the files of the drive as the backend lists them. The drive itself (folders, dropping,
  // search, what the agents read) is ESC-260's.
  let { project }: { project: Project } = $props();
  const list = $derived(docsStore.documents[project.id] ?? []);
</script>

<SpaceHead title={t('docs.spaces.documents')} />
<div class="body">
  {#if !list.length}
    <p class="empty">{t('docs.documents.empty')}</p>
  {:else}
    <ul class="list">
      {#each list as f (f.path)}
        <li class="row" data-document={f.path}>
          <Icon name={f.kind === 'image' ? 'image' : 'file'} size={14} />
          <span class="name">{f.name}</span>
          <span class="folder">{f.folder}</span>
          <span class="size">{fSize(f.size)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 18px 22px;
  }
  .empty {
    color: var(--muted);
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--soft);
  }
  .row:hover {
    background: var(--hover);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder,
  .size {
    color: var(--dim);
    font-size: 12px;
  }
</style>
