<script lang="ts">
  import Modal from '../modals/Modal.svelte';
  import { t } from '../../lib/i18n';
  import { draftsBySubject } from '../../lib/docs';
  import { docsStore } from '../../lib/docs.svelte';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { DocsCandidate, DocsDraft, Project } from '../../lib/types';

  // « Importer » a spec the project already has (ESC-258): how Escouade would cut it by its titles, subject by subject,
  // each page to keep or leave out; nothing is written before « Importer ».
  let { project, candidate, onclose }: { project: Project; candidate: DocsCandidate; onclose: () => void } = $props();

  let drafts = $state<DocsDraft[] | null>(null);
  let failed = $state('');
  /** The pages left out by the user. */
  let left = $state<Record<string, boolean>>({});
  let busy = $state(false);

  $effect(() => {
    api.docsImportPlan(project.id, candidate.path).then(
      (d) => (drafts = d),
      (e) => (failed = String(e)),
    );
  });

  const groups = $derived(draftsBySubject(drafts ?? []));
  const chosen = $derived((drafts ?? []).filter((d) => !d.exists && !left[d.path]).map((d) => d.path));

  async function go() {
    busy = true;
    const done = await app.run(api.docsImport(project.id, candidate.path, chosen));
    busy = false;
    if (!done) return;
    app.toast(t('docs.import.done', { count: done.written.length }));
    await docsStore.load(project.id);
    app.openDocs(project.id, 'spec', null);
    onclose();
  }
</script>

<Modal title={t('docs.import.title', { path: candidate.path })} width={640} tall {onclose}>
  <p class="intro">{t('docs.import.intro')}</p>
  {#if failed}
    <p class="error" role="alert">{failed}</p>
  {:else if !drafts}
    <p class="muted">{t('docs.import.loading')}</p>
  {:else if !drafts.length}
    <p class="muted">{t('docs.import.nothing')}</p>
  {:else}
    <div class="cut" data-import-cut>
      {#each groups as g (g.subject)}
        <section class="subj">
          <h3>{g.subject}</h3>
          <ul>
            {#each g.pages as d (d.path)}
              <li class:exists={d.exists} data-draft={d.path}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={t('docs.import.pageLabel', { name: d.title })}
                    checked={!d.exists && !left[d.path]}
                    disabled={d.exists}
                    onchange={(e) => (left[d.path] = !e.currentTarget.checked)}
                  />
                  <span class="title">{d.title}</span>
                  <span class="n">{d.exists ? t('docs.import.exists') : t('docs.import.lines', { count: d.lines })}</span>
                </label>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn ghost" onclick={onclose}>{t('docs.page.cancel')}</button>
    <button class="btn primary" disabled={busy || !chosen.length} onclick={go}>{t('docs.import.go', { count: chosen.length })}</button>
  {/snippet}
</Modal>

<style>
  .intro,
  .muted {
    margin: 0 0 12px;
    color: var(--muted);
    line-height: 1.5;
  }
  .error {
    color: var(--del);
  }
  .cut {
    display: grid;
    gap: 14px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 13.5px;
    font-weight: 620;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
    padding: 0 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  label:hover {
    background: var(--hover);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--soft);
  }
  .exists .title {
    color: var(--dim);
  }
  .n {
    flex: none;
    color: var(--dim);
    font-size: 12px;
  }
</style>
