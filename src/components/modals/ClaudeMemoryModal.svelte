<script lang="ts">
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { OfferedMemory } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import Modal from './Modal.svelte';

  // What Claude Code remembers of a project, offered once to its shared memory (ESC-255): memory by memory, none ticked
  // at first, so that nothing goes without the user's say. « Ne rien reprendre » and « Reprendre » both settle it for
  // good; closed without a choice, it comes back at the next start.
  let { projectId, offered }: { projectId: string; offered: OfferedMemory[] } = $props();

  let ticked = $state<Record<string, boolean>>({});
  let busy = $state(false);
  const names = $derived(offered.filter((m) => ticked[m.name]).map((m) => m.name));
  const id = $props.id();

  function tickAll(on: boolean) {
    ticked = Object.fromEntries(offered.map((m) => [m.name, on]));
  }

  async function settle(take: string[]) {
    busy = true;
    const project = await app.run(api.claudeMemoryTake(projectId, take));
    busy = false;
    if (!project) return;
    app.replaceProject(project);
    app.modal = null;
    if (take.length) app.toast(t('memory.claude.taken', { count: take.length }), 'ok');
  }
</script>

<Modal title={t('memory.claude.title')} width={620} onclose={() => (app.modal = null)}>
  {#snippet lead()}<span class="lead"><Icon name="spark" size={16} /></span>{/snippet}
  <p class="p">{t('memory.claude.body')}</p>
  <div class="bar">
    <button class="btn ghost small" disabled={busy} onclick={() => tickAll(names.length < offered.length)}
      >{names.length < offered.length ? t('memory.claude.all') : t('memory.claude.none')}</button
    >
  </div>
  <ul class="offered" aria-label={t('memory.claude.title')}>
    {#each offered as m, i (m.name)}
      <li>
        <input id="{id}-{i}" type="checkbox" bind:checked={ticked[m.name]} disabled={busy} />
        <div class="what">
          <label for="{id}-{i}">
            <span class="name mono">{m.name}</span>
            <span class="kind">{t(`memory.kinds.${m.kind}`)}</span>
            {#if m.exists}<span class="kind warn">{t('memory.claude.replaces')}</span>{/if}
          </label>
          <span class="desc">{m.description}</span>
          <details>
            <summary>{t('memory.claude.show')}</summary>
            <pre class="body">{m.body}</pre>
          </details>
        </div>
      </li>
    {/each}
  </ul>
  {#snippet footer()}
    <button class="btn" disabled={busy} style="margin-right: auto" onclick={() => settle([])}>{t('memory.claude.skip')}</button>
    <button class="btn primary" disabled={busy || !names.length} onclick={() => settle(names)}
      >{names.length ? t('memory.claude.take', { count: names.length }) : t('memory.claude.takeNone')}</button
    >
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
  .bar {
    display: flex;
    justify-content: flex-end;
    margin: 4px 0 -4px;
  }
  .offered {
    display: grid;
    max-height: 46vh;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }
  .offered li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 9px 2px;
    border-top: 1px solid var(--line);
  }
  .offered li:first-child {
    border-top: none;
  }
  input {
    margin-top: 2px;
  }
  .what {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  label {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    cursor: pointer;
  }
  .name {
    color: var(--text);
    font-size: 12.5px;
    font-weight: 550;
  }
  .kind {
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(var(--fg-rgb), 0.06);
    color: var(--muted);
    font-size: 11px;
  }
  .kind.warn {
    background: var(--wait-bg);
    color: var(--warn-ink);
  }
  .desc {
    color: var(--soft);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  summary {
    width: fit-content;
    color: var(--muted);
    font-size: 11.5px;
    cursor: pointer;
  }
  .body {
    max-height: 200px;
    margin: 6px 0 0;
    padding: 9px 11px;
    overflow: auto;
    border-radius: 8px;
    background: rgba(var(--fg-rgb), 0.035);
    color: var(--soft);
    font: 12px/1.5 var(--mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
