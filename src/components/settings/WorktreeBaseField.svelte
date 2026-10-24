<script lang="ts">
  import Icon from '../Icon.svelte';
  import { t } from '../../lib/i18n';
  import type { WorktreeBase } from '../../lib/types';
  import BranchPicker from '../branches/BranchPicker.svelte';

  // « Branche de départ des nouveaux worktrees » (ESC-160): the folder's branch, the board's target, or a branch named.
  // With `projectId` the branch is chosen in the branch picker, searched, local and remote; without (the assistant on a
  // folder not added yet), among the folder's `branches`. Under the choices, what it means.
  let {
    value = $bindable(),
    projectId,
    branches = [],
    target,
  }: {
    value: WorktreeBase;
    projectId?: string;
    branches?: string[];
    /** The board's target as drafted, said under « Branche cible du Kanban ». */
    target: string;
  } = $props();

  let choosing = $state(false);
  let branchButton = $state<HTMLButtonElement>();
  const named = $derived(value.kind === 'branch' ? value.branch : '');

  function chooseBranch() {
    if (projectId) choosing = true;
    else if (value.kind !== 'branch') value = { kind: 'branch', branch: branches[0] ?? '' };
  }

  const at = $derived(
    value.kind === 'head'
      ? t('settings.project.worktreeBaseHeadAt')
      : value.kind === 'target'
        ? t('settings.project.worktreeBaseTargetAt', { branch: target })
        : named
          ? t('settings.project.worktreeBaseBranchAt', { branch: named })
          : '',
  );
</script>

<div class="field-base">
  <div class="segmented chips" role="group" aria-label={t('settings.project.worktreeBase')}>
    {#each ['head', 'target'] as const as kind (kind)}
      <button class="chip" class:on={value.kind === kind} aria-pressed={value.kind === kind} onclick={() => (value = { kind })}
        >{t(`settings.project.worktreeBases.${kind}`)}</button
      >
    {/each}
    <button
      class="chip"
      class:mono={!!named}
      class:on={value.kind === 'branch'}
      aria-pressed={value.kind === 'branch'}
      aria-haspopup={projectId ? 'dialog' : undefined}
      aria-label={named ? t('settings.project.worktreeBaseChoose', { branch: named }) : undefined}
      bind:this={branchButton}
      onclick={chooseBranch}
      >{#if named}<Icon name="branch" size={14} />{t('settings.project.worktreeBaseBranch', { branch: named })}<Icon
          name="down"
          size={14}
        />{:else}{t('settings.project.worktreeBases.branch')}{/if}</button
    >
  </div>
  {#if value.kind === 'branch' && !projectId}
    <select
      class="field mono"
      aria-label={t('settings.project.worktreeBase')}
      value={named}
      onchange={(e) => (value = { kind: 'branch', branch: e.currentTarget.value })}
    >
      {#each branches.includes(named) || !named ? branches : [named, ...branches] as b (b)}<option value={b}>{b}</option>{/each}
    </select>
  {/if}
  {#if at}<p class="at">{at}</p>{/if}
</div>

{#if choosing && projectId}
  <BranchPicker
    over
    {projectId}
    anchor={branchButton}
    mode="base"
    chosen={named}
    onclose={() => (choosing = false)}
    onpick={(b) => (value = { kind: 'branch', branch: b.name })}
  />
{/if}

<style>
  .field-base {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .chips {
    flex-wrap: wrap;
    max-width: 100%;
  }
  .chip.mono {
    font-family: var(--mono);
    font-size: 11.5px;
  }
  select {
    min-width: 200px;
    font-size: 12px;
  }
  .at {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
</style>
