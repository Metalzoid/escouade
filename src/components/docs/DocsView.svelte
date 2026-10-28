<script lang="ts">
  import { docsStore } from '../../lib/docs.svelte';
  import { app } from '../../lib/state.svelte';
  import type { Project } from '../../lib/types';
  import DecisionsSpace from './DecisionsSpace.svelte';
  import DocumentsSpace from './DocumentsSpace.svelte';
  import SpecSpace from './SpecSpace.svelte';

  // The main area of the Docs tab (ESC-258): the space chosen in the sidebar. Its docs are read on opening, then again
  // each time what is left to share changes (a page written here, by an agent, a « Partager »).
  let { project }: { project: Project } = $props();

  const space = $derived(app.docsSpace[project.id] ?? 'spec');
  const pending = $derived(app.docsShare[project.id]?.pending);

  $effect(() => {
    void pending;
    void project.docsBranch;
    void docsStore.load(project.id);
  });
</script>

<div class="docs" data-space={space}>
  {#if space === 'spec'}
    <SpecSpace {project} />
  {:else if space === 'decisions'}
    <DecisionsSpace {project} />
  {:else}
    <DocumentsSpace {project} />
  {/if}
</div>

<style>
  .docs {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
