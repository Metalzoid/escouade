<script lang="ts">
  import { fileLines, parseUnifiedDiff, type DiffFile } from '../lib/diff';
  import { t } from '../lib/i18n';
  import { api } from '../lib/ipc';
  import { trapFocus } from '../lib/focus';
  import { keyLabel } from '../lib/platform';
  import { app } from '../lib/state.svelte';
  import DiffView from './DiffView.svelte';
  import Icon from './Icon.svelte';
  import { tip } from '../lib/tip';

  // Uncommitted changes (`paths` of the agent's checkout), what `commit` changed, what changes from one ref to
  // another (`refs`: branches or commits, the git graph's comparison) or, with `wholeProject`, every file the
  // project's list shows: the project's checkout and each agent's worktree.
  let {
    projectId,
    agentId,
    paths,
    title,
    commit = null,
    refs = null,
    wholeProject = false,
    repo = null,
  }: {
    projectId: string;
    agentId: string | null;
    paths: string[];
    title: string;
    commit?: string | null;
    refs?: { from: string; to: string } | null;
    wholeProject?: boolean;
    /** The repository of `commit` and `refs`, in a project of several (ESC-169). */
    repo?: string | null;
  } = $props();

  // `agentId`: the agent a whole-project file is listed under, as in the files panel. `key`: the same
  // path can be modified in the project and in a worktree, so the path alone does not identify a file.
  type Shown = DiffFile & { key: string; agentId: string | null };
  const shown = (diff: string, owner: string | null, group: number): Shown[] =>
    parseUnifiedDiff(diff).map((f) => ({ ...f, key: `${group}:${f.path}`, agentId: owner }));

  let files = $state<Shown[]>([]);
  let current = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const agentName = (id: string) => app.agents[id]?.name ?? '?';

  $effect(() => {
    (refs
      ? api.gitDiffRefs(projectId, refs.from, refs.to, repo).then((d) => shown(d, null, 0))
      : commit
        ? api.gitShow(projectId, commit, repo).then((d) => shown(d, null, 0))
        : wholeProject
          ? api.gitProjectDiff(projectId).then((parts) => parts.flatMap((p, i) => shown(p.diff, p.agentId, i)))
          : api.gitDiff(projectId, agentId, paths).then((d) => shown(d, null, 0))
    )
      .then((list) => {
        files = list;
        loading = false;
      })
      .catch((e) => {
        error = String(e);
        loading = false;
      });
  });

  const file = $derived(files[current]);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={() => (app.modal = null)}>
  <div class="win" use:trapFocus onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-label={title}>
    <div class="head">
      <h2>{title}</h2>
      <span class="n">{t('common.count.files', { count: files.length })}</span>
      <div class="segmented small">
        <button class:on={!app.diffSplit} onclick={() => app.setDiffSplit(false)}>{t('git.diff.unified')}</button>
        <button class:on={app.diffSplit} onclick={() => app.setDiffSplit(true)}>{t('git.diff.split')}</button>
      </div>
      <button
        class="icon-btn close"
        aria-label={t('common.close')}
        use:tip={t('git.diff.closeTitle', { key: keyLabel('Esc') })}
        onclick={() => (app.modal = null)}><Icon name="close" size={16} /></button
      >
    </div>
    <div class="body">
      {#if files.length > 1}
        <nav class="files">
          {#each files as f, i (f.key)}
            <button class="file" aria-current={i === current ? 'true' : undefined} onclick={() => (current = i)}>
              <span class="letter {f.status.toLowerCase()}">{f.status}</span>
              <span class="p">{f.path}</span>
              {#if f.agentId}<span class="tag">{agentName(f.agentId)}</span>{/if}
              <!-- A file whose diff was not sent has no counts to show. -->
              {#if !f.tooLarge}<span class="cnt"><span class="add">+{f.add}</span><span class="del">−{f.del}</span></span>{/if}
            </button>
          {/each}
        </nav>
      {/if}
      <div class="diff">
        {#if loading}
          <div class="msg">{t('common.loading')}</div>
        {:else if error}
          <div class="msg">{error}</div>
        {:else if !file}
          <div class="msg">{t('git.diff.none')}</div>
        {:else}
          <div class="fhead">
            <span class="path">{file.path}</span>
            {#if file.agentId}<span class="tag">{agentName(file.agentId)}</span>{/if}
            {#if !file.tooLarge}<span class="cnt"><span class="add">+{file.add}</span><span class="del">−{file.del}</span></span>{/if}
          </div>
          {#if file.binary}
            <div class="msg">{t('git.diff.binary')}</div>
          {:else}
            <!-- Another file starts folded again. -->
            {#key file.key}
              <DiffView lines={fileLines(file)} split={app.diffSplit} tooLarge={file.tooLarge} />
            {/key}
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: var(--scrim);
    animation: fade 0.2s ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* The window of the 2.0 design (the preview's modal), as large as the screen allows: a diff wants room. */
  .win {
    width: calc(100vw - 80px);
    height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 14px;
    background: var(--raise);
    box-shadow:
      inset 0 0 0 1px var(--line-2),
      0 24px 64px -12px rgba(0, 0, 0, calc(0.75 * var(--shade)));
    animation: rise 0.35s var(--ease);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.985);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .win {
      animation: none;
    }
  }
  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 54px;
    padding: 0 12px 0 20px;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 15px;
    font-weight: 620;
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n {
    flex: none;
    color: var(--muted);
    font-size: 12px;
  }
  .segmented {
    flex: none;
    margin-left: auto;
  }
  .close {
    width: 30px;
    height: 30px;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .files {
    width: 300px;
    flex: none;
    display: grid;
    grid-auto-rows: max-content;
    align-content: start;
    gap: 1px;
    overflow: auto;
    padding: 8px;
    border-right: 1px solid var(--line);
  }
  .file {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--soft);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .file:hover {
    background: var(--hover);
  }
  .file[aria-current='true'] {
    background: rgba(var(--fg-rgb), 0.06);
    color: var(--text);
  }
  .letter {
    font: 600 11.5px var(--mono);
    text-align: center;
    color: var(--git-m);
  }
  .letter.a {
    color: var(--add);
  }
  .letter.d {
    color: var(--del);
  }
  /* The end of a long path matters most: cut at its start. */
  .p {
    min-width: 0;
    overflow: hidden;
    font: 12px var(--mono);
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  /* The agent a file is listed under, as in the files panel. */
  .tag {
    flex: none;
    max-width: 96px;
    overflow: hidden;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--hover);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--muted);
    font-size: 11px;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cnt {
    display: inline-flex;
    gap: 6px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .add {
    color: var(--add);
  }
  .del {
    color: var(--del);
  }
  .diff {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--well);
  }
  .msg {
    padding: 40px;
    text-align: center;
    color: var(--muted);
    font-size: 12.5px;
  }
  .fhead {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 14px;
    border-bottom: 1px solid var(--line);
    background: var(--well);
    color: var(--soft);
    font-size: 12px;
  }
  .path {
    min-width: 0;
    overflow: hidden;
    font-family: var(--mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
