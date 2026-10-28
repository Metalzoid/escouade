<script lang="ts">
  import { t } from '../../lib/i18n';
  import { DOCS_SPACES, specSummary, type DocsSpaceId } from '../../lib/docs';
  import { docsStore } from '../../lib/docs.svelte';
  import { app } from '../../lib/state.svelte';
  import type { Project } from '../../lib/types';

  // Under « Agents · Kanban · Docs » when Docs is on (ESC-258, design/factory/2-specification.png): the three spaces of
  // the docs, the spec with its gaps. « Nouvelle discussion » and the discussions (ESC-261) come above them.
  let { project }: { project: Project } = $props();

  const space = $derived(app.docsSpace[project.id] ?? 'spec');
  const tree = $derived(docsStore.tree[project.id]);
  const summary = $derived(tree ? specSummary(tree) : null);

  function count(id: DocsSpaceId): string {
    if (id === 'spec') {
      if (!summary?.pages) return '';
      return summary.gaps ? t('docs.count.gaps', { count: summary.gaps }) : t('docs.count.pages', { count: summary.pages });
    }
    const n = id === 'decisions' ? docsStore.decisions[project.id]?.length : docsStore.documents[project.id]?.length;
    return n === undefined ? '' : String(n);
  }

  /** The dot of a space: the spec in the colour of a gap when it has one, the decisions when one waits to be accepted. */
  function tone(id: DocsSpaceId) {
    if (id === 'spec') return summary?.gaps ? 'gap' : summary?.pages ? 'ok' : 'none';
    if (id === 'decisions') {
      const list = docsStore.decisions[project.id] ?? [];
      return list.some((d) => d.state === 'proposed') ? 'gap' : list.length ? 'ok' : 'none';
    }
    return 'none';
  }
</script>

<div class="docs-side">
  <!-- « Nouvelle discussion » (Ctrl+B) and the discussions, in cards as the agents, take this place (ESC-261). -->
  <section class="spaces" aria-label={t('docs.side.spacesLabel')}>
    <h3 class="sh">{t('docs.side.spaces')}</h3>
    {#each DOCS_SPACES as id (id)}
      <button
        class="space"
        class:sel={space === id}
        aria-current={space === id ? 'page' : undefined}
        data-space={id}
        onclick={() => {
          app.openDocs(project.id, id, null);
          // A click on a space reads it again: what an agent or a comparison wrote meanwhile.
          void docsStore.load(project.id);
        }}
      >
        <span class="dot {tone(id)}" aria-hidden="true"></span>
        <span class="name">{t(`docs.spaces.${id}`)}</span>
        <span class="n" class:gap={id === 'spec' && !!summary?.gaps}>{count(id)}</span>
      </button>
    {/each}
  </section>
</div>

<style>
  .docs-side {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    padding-top: 14px;
  }
  .sh {
    margin: 0 0 6px;
    padding: 0 10px;
    color: var(--dim);
    font-size: 11px;
    font-weight: 560;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .spaces {
    display: grid;
    gap: 2px;
  }
  .space {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--soft);
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .space:hover {
    background: var(--hover);
  }
  .space.sel {
    background: var(--raise-2);
    color: var(--text);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n {
    flex: none;
    color: var(--dim);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--idle);
  }
  .dot.ok {
    background: var(--run);
  }
  .dot.gap {
    background: var(--wait);
  }
</style>
