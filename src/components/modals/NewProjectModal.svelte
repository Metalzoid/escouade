<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { fDate } from '../../lib/format';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { modelOptions } from '../../lib/models';
  import { app } from '../../lib/state.svelte';
  import { PROJECT_COLORS } from '../../lib/theme';
  import type { FolderInfo } from '../../lib/types';
  import Modal from './Modal.svelte';

  // Opened by « Rouvrir » on a closed project, the window starts from its folder, and from that history of it.
  const from = app.modal?.kind === 'newProject' ? app.modal : null;
  const startPath = from?.path?.trim() ?? '';
  /** The history asked for holds for the folder it was asked for: another path typed, it is forgotten. */
  const historyFor = (p: string) => (p === startPath ? from?.historyId : undefined);

  const used = new Set(app.projects.map((p) => p.color));
  let path = $state(startPath);
  let name = $state('');
  let nameTouched = false;
  const freeColor = PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[0];
  let color = $state(freeColor);
  let colorTouched = false;
  let firstAgent = $state(true);
  let model = $state(app.settings.defaultModel || 'sonnet');
  let worktree = $state(false);
  let worktreeTouched = false;
  let info = $state<FolderInfo | null>(null);
  /** The folder `info` was read for: until the one typed is, nothing is created or reopened with another's history. */
  let infoPath = $state('');
  /** « Partir d'un projet vierge »: the folder's history stays where it is, the project is a new one. */
  let fresh = $state(false);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Until the first look at the path: a folder the window opened on is read at once, a typed one after a pause. */
  let opening = true;

  $effect(() => {
    const p = path.trim();
    const now = opening;
    opening = false;
    clearTimeout(timer);
    if (!p) {
      info = null;
      return;
    }
    const read = async () => {
      const i = await api.inspectFolder(p, historyFor(p)).catch(() => null);
      if (path.trim() !== p) return;
      // Another folder, another choice.
      if (i?.history?.id !== info?.history?.id) fresh = false;
      info = i;
      infoPath = p;
      if (i) prefill();
    };
    if (now) void read();
    else timer = setTimeout(read, 200);
  });

  const history = $derived(info?.history ?? null);
  /** The folder gets its history back (same project, same agents and tickets): it is reopened, not created. */
  const restoring = $derived(!!history && !fresh);

  /** What the window starts from: the history's name, color and worktrees when it comes back, else the usual ones. Not what the user chose. */
  function prefill() {
    const h = restoring ? history : null;
    if (!nameTouched) name = h?.name ?? info?.name ?? name;
    if (!colorTouched) color = h?.color ?? freeColor;
    if (!worktreeTouched) worktree = h?.worktreePerAgent ?? false;
  }

  const gitLine = $derived(
    !info
      ? { text: t('shell.newProject.git.choose'), color: 'var(--dim)' }
      : !info.exists
        ? { text: t('shell.newProject.git.missing'), color: 'var(--del)' }
        : info.isRepo
          ? {
              text: info.dirty
                ? t('shell.newProject.git.repoDirty', { branch: info.branch || '—', count: info.dirty })
                : t('shell.newProject.git.repoClean', { branch: info.branch || '—' }),
              color: 'var(--ok)',
            }
          : { text: t('shell.newProject.git.none'), color: 'var(--muted)' },
  );

  async function browse() {
    const dir = await open({ directory: true, multiple: false, title: t('shell.newProject.folderTitle') });
    if (typeof dir === 'string') path = dir;
  }

  async function create() {
    if (!info?.exists || busy || infoPath !== path.trim()) return;
    busy = true;
    const historyId = historyFor(path.trim());
    const p = await app.run(
      api.createProject({
        path: path.trim(),
        name: name.trim(),
        color,
        worktreePerAgent: worktree,
        // A project coming back has its agents: none is asked for.
        firstAgent: !restoring && firstAgent ? model : null,
        restore: restoring,
        // Nothing sent for a folder that was not asked for with a history.
        ...(historyId ? { historyId } : {}),
      }),
    );
    busy = false;
    if (!p) return;
    app.projects.push(p);
    app.selectProject(p.id);
    app.modal = null;
  }
</script>

<Modal title={t('shell.newProject.title')} onclose={() => (app.modal = null)}>
  <div class="grp">
    <span class="lab">{t('common.folder')}</span>
    <div class="row">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="field mono"
        style="flex:1;font-size:12.5px"
        bind:value={path}
        placeholder={t('shell.newProject.pathPlaceholder')}
        autofocus
      />
      <button class="btn" style="height:36px" onclick={browse}>{t('shell.newProject.browse')}</button>
    </div>
    <span class="git mono" style:color={gitLine.color}><span class="d" style:background={gitLine.color}></span>{gitLine.text}</span>
  </div>
  {#if history}
    <div class="history">
      <p class="found">
        {t('shell.newProject.history.found', {
          agents: t('common.count.agents', { count: history.agents }),
          tickets: t('common.count.tickets', { count: history.tickets }),
          date: fDate(history.lastActivity),
        })}
      </p>
      <div class="toggle">
        <div class="tx">
          <span class="tt">{t('shell.newProject.history.fresh')}</span>
          <span class="ts">{t('shell.newProject.history.freshDesc')}</span>
        </div>
        <button
          class="switch"
          role="switch"
          aria-checked={fresh}
          class:on={fresh}
          aria-label={t('shell.newProject.history.fresh')}
          onclick={() => {
            fresh = !fresh;
            prefill();
          }}
        ></button>
      </div>
    </div>
  {/if}
  <div class="two">
    <div class="grp">
      <span class="lab">{t('common.name')}</span>
      <input class="field" style="font-weight:600;font-size:13.5px" bind:value={name} oninput={() => (nameTouched = true)} />
    </div>
    <div class="grp">
      <span class="lab">{t('shell.newProject.tabPreview')}</span>
      <div class="preview" style:border-bottom-color={color}>
        <span class="sw" style:background={color}></span>{name || t('shell.newProject.untitled')}
      </div>
    </div>
  </div>
  <div class="grp">
    <span class="lab">{t('common.color')}</span>
    <div class="colors">
      {#each PROJECT_COLORS as c, i (c)}
        <button
          class="swatch"
          aria-label={t('shell.newProject.colorN', { n: i + 1 })}
          aria-pressed={color === c}
          style:background={c}
          style:box-shadow={color === c ? '0 0 0 2px var(--panel), 0 0 0 4px var(--text)' : 'none'}
          onclick={() => {
            color = c;
            colorTouched = true;
          }}
        ></button>
      {/each}
    </div>
  </div>
  <div class="hr"></div>
  <div class="grp" style="gap:14px">
    {#if !restoring}
      <div class="toggle">
        <div class="tx">
          <span class="tt">{t('shell.newProject.firstAgent')}</span>
          <span class="ts">{t('shell.newProject.firstAgentDesc')}</span>
        </div>
        <button
          class="switch"
          role="switch"
          aria-checked={firstAgent}
          class:on={firstAgent}
          aria-label={t('shell.newProject.firstAgent')}
          onclick={() => (firstAgent = !firstAgent)}
        ></button>
      </div>
      {#if firstAgent}
        <div class="models">
          <span class="ts">{t('common.model')}</span>
          {#each modelOptions(app.models) as m (m.value)}
            <button class="mbtn mono" class:on={model === m.value} onclick={() => (model = m.value)}>{m.label}</button>
          {/each}
        </div>
      {/if}
    {/if}
    <div class="toggle">
      <div class="tx">
        <span class="tt">{t('shell.newProject.worktree')}</span>
        <span class="ts">{t('shell.newProject.worktreeDesc')}</span>
      </div>
      <button
        class="switch"
        role="switch"
        aria-checked={worktree}
        class:on={worktree}
        aria-label={t('shell.newProject.worktree')}
        onclick={() => {
          worktree = !worktree;
          worktreeTouched = true;
        }}
      ></button>
    </div>
  </div>
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (app.modal = null)}>{t('common.cancel')}</button>
    <button class="btn primary" style:background={color} disabled={!info?.exists || busy || infoPath !== path.trim()} onclick={create}>
      {#if restoring}
        {busy ? t('shell.newProject.history.reopening') : t('shell.newProject.history.reopen')}
      {:else}
        {busy ? t('shell.newProject.creating') : t('shell.newProject.create')}
      {/if}
    </button>
  {/snippet}
</Modal>

<style>
  .grp {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .lab {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .git {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
  }
  .d {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--line2);
    border-left: 2px solid var(--accent);
    border-radius: var(--r-sm);
    background: var(--elev);
  }
  .found {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: end;
  }
  .preview {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 14px;
    border: 1px solid var(--line2);
    border-bottom: 2px solid;
    border-radius: var(--r-sm);
    background: var(--bg);
    font-weight: 600;
    white-space: nowrap;
    max-width: 220px;
    overflow: hidden;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .hr {
    height: 1px;
    background: var(--line);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .tx {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tt {
    font-size: 13.5px;
    font-weight: 600;
  }
  .ts {
    font-size: 12px;
    color: var(--muted);
    text-wrap: pretty;
  }
  .models {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 2px;
  }
  .mbtn {
    height: 26px;
    padding: 0 11px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line2);
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .mbtn.on {
    background: var(--elev2);
    color: var(--text);
  }
</style>
