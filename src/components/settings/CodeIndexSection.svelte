<script lang="ts">
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { fAgo, fInt, fList, fSize } from '../../lib/format';
  import { app } from '../../lib/state.svelte';
  import type { CodeIndexInfo, Project } from '../../lib/types';
  import Group from './Group.svelte';
  import Row from './Row.svelte';
  import Switch from './Switch.svelte';
  import VectorsModelRow from './VectorsModelRow.svelte';

  // « Index du code » of a project's settings (ESC-254, docs/FACTORY.md « Proposé d'office, en option »): what it does,
  // that nothing leaves the machine, what a private project's fence leaves out, its switch (saved at once: it is not of
  // the draft, `update_project` leaves it alone), and the model of the search by meaning.
  let { project }: { project: Project } = $props();

  let info = $state<CodeIndexInfo | null>(null);
  /** The project is being read (turned on) or its index erased (turned off). */
  let busy = $state(false);

  async function load(id: string) {
    const got = await api.getCodeIndex(id).catch(() => null);
    if (id === project.id && !busy) info = got;
  }
  $effect(() => void load(project.id));

  const live = $derived(app.projects.find((p) => p.id === project.id) ?? project);
  const enabled = $derived(info?.enabled ?? !!live.codeIndex);

  async function toggle(on: boolean) {
    if (busy) return;
    const id = project.id;
    busy = true;
    // Shown on at once: the reading of a big project takes a while.
    if (info) info = { ...info, enabled: on };
    const got = await app.run(api.setCodeIndex(id, on));
    busy = false;
    if (id !== project.id) return;
    if (!got) return void load(id);
    info = got;
    app.toast(on ? t('codeindex.settings.turnedOn', { files: fInt(got.status.files) }) : t('codeindex.settings.turnedOff'));
  }

  const status = $derived.by(() => {
    if (busy && enabled) return t('codeindex.settings.reading');
    const s = info?.status;
    if (!enabled || !s?.indexedAt) return '';
    return t('codeindex.settings.status', {
      files: fInt(s.files),
      symbols: fInt(s.symbols),
      size: fSize(s.bytes),
      when: fAgo(s.indexedAt / 1000, app.now),
    });
  });
  const excluded = $derived(info?.excluded ?? []);
</script>

<Group title={t('codeindex.settings.title')} anchor="code-index" note={`${t('codeindex.what')} ${t('codeindex.local')}`}>
  <Row label={t('codeindex.settings.on')} desc={t('codeindex.settings.onDesc')}>
    {#snippet extra()}
      {#if status}<span class="status" data-code-index-status aria-live="polite">{status}</span>{/if}
    {/snippet}
    <Switch label={t('codeindex.settings.on')} disabled={busy} bind:on={() => enabled, (on) => void toggle(on)} />
  </Row>
  {#if live.private || excluded.length}
    <div class="fenced" data-code-index-fence>
      {#if live.private}<p>{t('codeindex.privateNote')}</p>{/if}
      {#if excluded.length}<p>{t('codeindex.excluded', { count: excluded.length, list: fList(excluded) })}</p>{/if}
    </div>
  {/if}
  <VectorsModelRow />
</Group>

<style>
  .status {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .fenced {
    max-width: 64ch;
    margin: 2px 0 10px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .fenced p {
    margin: 0 0 4px;
  }
</style>
