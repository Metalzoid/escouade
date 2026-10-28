<script lang="ts">
  import { t } from '../../lib/i18n';
  import { docsStore } from '../../lib/docs.svelte';
  import type { Project } from '../../lib/types';
  import SpaceHead from './SpaceHead.svelte';

  // « Décisions » (ESC-258): the register as the backend reads it, numbered and dated. Its full screen (states, what each
  // changed in the spec, « Accepter ») is ESC-259's.
  let { project }: { project: Project } = $props();
  const list = $derived(docsStore.decisions[project.id] ?? []);
</script>

<SpaceHead title={t('docs.spaces.decisions')} />
<div class="body">
  {#if !list.length}
    <p class="empty">{t('docs.decisions.empty')}</p>
  {:else}
    <ol class="list">
      {#each list as d (d.number)}
        <li class="row" data-decision={d.number}>
          <span class="num mono">{String(d.number).padStart(3, '0')}</span>
          <span class="title">{d.title}</span>
          <span class="state {d.state}">{t(`docs.decisions.states.${d.state}`)}</span>
          <span class="date">{d.date}</span>
        </li>
      {/each}
    </ol>
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
    grid-template-columns: 44px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 8px;
  }
  .row:hover {
    background: var(--hover);
  }
  .num,
  .date {
    color: var(--dim);
    font-size: 12px;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    color: var(--muted);
    font-size: 12px;
  }
  .state.accepted {
    color: var(--run);
  }
  .state.proposed {
    color: var(--wait);
  }
</style>
