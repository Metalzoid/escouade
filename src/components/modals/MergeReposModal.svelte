<script lang="ts">
  // « Merger… » of an agent of several repositories (ESC-169): each repository as its merge would find it, checked
  // first; nothing is merged while one it changed can't be. « Merger api seul » merges one by hand, « L'agent résout le
  // conflit » hands the conflict to the agent (« Intégrer » its bases).
  import { integrateBase } from '../../lib/agent-actions';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { repoLabel } from '../../lib/repos';
  import { app } from '../../lib/state.svelte';
  import type { RepoMerge } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import Modal from './Modal.svelte';

  let { agentId }: { agentId: string } = $props();

  const agent = $derived(app.agents[agentId] ?? null);
  let repos = $state<RepoMerge[] | null>(null);
  let error = $state<string | null>(null);
  let squash = $state(true);
  let busy = $state(false);

  $effect(() => {
    const id = agentId;
    api
      .agentMergeCheck(id)
      .then((r) => (repos = r))
      .catch((e) => (error = String(e)));
  });

  const changed = $derived((repos ?? []).filter((r) => r.commits > 0));
  const refused = $derived(changed.filter((r) => r.problem));
  const ready = $derived(changed.filter((r) => !r.problem));
  const conflicted = $derived(refused.some((r) => r.conflicts.length));

  const close = () => (app.modal = null);

  async function merge(only: string[] | null, switchToBase = false) {
    if (!agent) return;
    busy = true;
    try {
      const out = only
        ? await api.mergeAgentRepos(agent.id, squash, switchToBase, only)
        : await api.mergeAgent(agent.id, squash, switchToBase);
      app.toast(out || t('git.agent.merged'), 'ok');
      close();
    } catch (e) {
      // A repository's folder on another branch: switched to its base on the user's word, as for one repository.
      const current = /^NOT_ON_BASE:([^:]*):(.*)$/.exec(String(e));
      if (current && !switchToBase) {
        busy = false;
        const [, on, base] = current;
        app.modal = {
          kind: 'confirm',
          title: t('git.agent.switchTitle', { base }),
          body: on
            ? t('git.agent.switchBodyOnBranch', { current: on, base, branch: agent.worktree?.branch ?? '' })
            : t('git.agent.switchBodyDetached', { base, branch: agent.worktree?.branch ?? '' }),
          confirm: t('git.agent.switchConfirm'),
          onConfirm: () => merge(only, true),
        };
        return;
      }
      error = String(e);
    }
    busy = false;
  }

  function resolve() {
    if (!agent) return;
    close();
    void integrateBase(agent);
  }
</script>

<Modal title={t('repos.merge.title', { name: agent?.name ?? '' })} width={640} onclose={close}>
  {#snippet lead()}<span class="lead"><Icon name="merge" size={16} /></span>{/snippet}
  {#if agent?.worktree}
    <span class="scope">{t('repos.merge.scope', { branch: agent.worktree.branch })}</span>
  {/if}
  {#if repos === null && !error}
    <p class="muted">{t('repos.merge.checking')}</p>
  {:else if repos}
    <div class="rlist">
      {#each repos as r (r.repo)}
        {@const idle = r.commits === 0}
        <div class="rrow" class:ok={!idle && !r.problem} class:bad={!idle && !!r.problem} class:idle>
          <Icon name={idle ? 'circle' : r.problem ? 'shield' : 'check-c'} size={14} />
          <span class="rn">{repoLabel(r.repo)}</span>
          <span class="rb">{idle ? t('repos.merge.nothing') : t('repos.merge.commits', { base: r.base, count: r.commits })}</span>
          {#if !idle && r.problem}
            <span class="st">{r.conflicts.length ? t('repos.merge.conflict') : ''}</span>
            <span class="why">{r.conflicts.length ? r.conflicts.join(', ') : r.problem}</span>
          {:else if !idle}
            <span class="cnt"><span class="add">+{r.add}</span><span class="del">−{r.del}</span></span>
          {:else}
            <span></span>
          {/if}
        </div>
      {/each}
    </div>
    {#if refused.length}
      <p class="notice">
        <Icon name="info" size={14} /><span>{t('repos.merge.blocked', { repos: refused.map((r) => repoLabel(r.repo)).join(', ') })}</span>
      </p>
    {/if}
    <label class="opt"><input type="checkbox" bind:checked={squash} />{t('repos.merge.squash')}</label>
  {/if}
  {#if error}<p class="err">{error}</p>{/if}
  {#snippet footer()}
    <button class="btn" style="margin-right: auto" onclick={close}>{t('common.cancel')}</button>
    {#if refused.length && ready.length === 1}
      <button class="btn" disabled={busy} onclick={() => merge([ready[0].repo])}
        >{t('repos.merge.alone', { repo: repoLabel(ready[0].repo) })}</button
      >
    {/if}
    {#if conflicted}
      <button class="btn primary" disabled={busy} onclick={resolve}>{t('repos.merge.resolve')}</button>
    {:else}
      <button class="btn primary" disabled={busy || !changed.length || refused.length > 0} onclick={() => merge(null)}
        >{t('repos.merge.confirm')}</button
      >
    {/if}
  {/snippet}
</Modal>

<style>
  .lead {
    display: inline-flex;
    color: var(--muted);
  }
  .scope,
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .rlist {
    display: grid;
    gap: 6px;
  }
  .rrow {
    display: grid;
    grid-template-columns: 16px minmax(72px, auto) minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 10px;
    padding: 9px 12px;
    border-radius: 9px;
    box-shadow: inset 0 0 0 1px var(--line);
    font-size: 12.5px;
    color: var(--muted);
  }
  .rrow.ok :global(svg) {
    color: var(--add);
  }
  .rrow.bad {
    background: oklch(from var(--del) l c h / 0.06);
    box-shadow: inset 0 0 0 1px oklch(from var(--del) l c h / 0.35);
  }
  .rrow.bad :global(svg),
  .rrow.bad .st {
    color: var(--del);
  }
  .rrow.idle {
    box-shadow: inset 0 0 0 1px rgba(var(--fg-rgb), 0.05);
  }
  .rn {
    color: var(--text);
    font: 600 12px var(--mono);
  }
  .idle .rn {
    color: var(--muted);
  }
  .rb {
    min-width: 0;
    overflow: hidden;
    font: 11px var(--mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st {
    font-size: 11.5px;
  }
  .why {
    grid-column: 2 / -1;
    color: var(--soft);
    font-size: 12px;
    overflow-wrap: anywhere;
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
  .notice {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 0;
    padding: 10px 12px;
    border-radius: 9px;
    background: rgba(var(--fg-rgb), 0.035);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--soft);
    font-size: 12.5px;
  }
  .notice :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--wait);
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .err {
    margin: 0;
    color: var(--del);
    font-size: 12.5px;
  }
</style>
