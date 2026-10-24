<script lang="ts">
  import { fInt } from '../../lib/format';
  import { t } from '../../lib/i18n';
  import { tip } from '../../lib/tip';
  import type { Agent, GitInfo, Project } from '../../lib/types';
  import { worktreeLabel } from '../../lib/worktrees';
  import Icon from '../Icon.svelte';
  import StatusDot from '../StatusDot.svelte';

  let {
    project,
    source,
    agents,
    git,
    onpick,
  }: { project: Project; source: string; agents: Agent[]; git: GitInfo | undefined; onpick: (source: string) => void } = $props();

  let open = $state(false);
  let box = $state<HTMLDivElement>();

  const branch = $derived(git?.branch || t('editor.source.noBranch'));
  const current = $derived(source === 'project' ? null : (agents.find((a) => a.id === source) ?? null));
  // `git` tallies the project's own changes together with those of every worktree: take the worktrees out.
  const projectCount = $derived(
    git ? Math.max(0, git.modified + git.added + git.deleted - agents.reduce((n, a) => n + (git.agents[a.id] ?? 0), 0)) : 0,
  );

  function pick(s: string) {
    open = false;
    onpick(s);
  }
</script>

<svelte:window onpointerdown={(e) => open && box && !box.contains(e.target as Node) && (open = false)} />

<div class="picker" bind:this={box}>
  <button
    class="src"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('editor.source.label', { name: current ? current.name : branch })}
    onclick={() => (open = !open)}
  >
    {#if current}<StatusDot status={current.status} size={7} />{:else}<span class="glyph"><Icon name="branch" size={14} /></span>{/if}
    <span class="nm" use:tip={{ text: current ? current.name : branch, cut: true }}>{current ? current.name : branch}</span>
    <span class="kind">{current ? t('editor.source.kindWorktree') : t('editor.source.kindBranch')}</span>
    <span class="chev"><Icon name="down" size={14} /></span>
  </button>
  {#if open}
    <div class="menu" role="menu" aria-label={t('common.browse')}>
      <span class="title">{t('common.browse')}</span>
      <button class="opt" role="menuitemradio" aria-checked={source === 'project'} onclick={() => pick('project')}>
        <span class="ic"><Icon name="branch" size={14} /></span>
        <span class="txt"
          ><span class="nm">{branch}</span><span class="sub mono">{t('editor.source.projectBranch', { path: project.path })}</span></span
        >
        <span class="count mono" class:some={projectCount > 0}
          >{projectCount ? t('editor.source.delta', { count: projectCount }) : t('editor.source.clean')}</span
        >
        <span class="check"
          >{#if source === 'project'}<Icon name="check" size={14} />{/if}</span
        >
      </button>
      {#each agents as a (a.id)}
        {@const n = git?.agents[a.id] ?? 0}
        <button class="opt" role="menuitemradio" aria-checked={source === a.id} onclick={() => pick(a.id)}>
          <span class="ic"><StatusDot status={a.status} size={7} /></span>
          <span class="txt"
            ><span class="nm">{a.name}</span><span class="sub mono"
              >{a.worktree ? worktreeLabel(project.path, a.worktree.path) : a.name} · {a.model}</span
            ></span
          >
          <span class="count mono" class:some={n > 0}
            >{n ? t('editor.count.changes', { count: n, n: fInt(n) }) : t('editor.source.clean')}</span
          >
          <span class="check"
            >{#if source === a.id}<Icon name="check" size={14} />{/if}</span
          >
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* In a narrow window, the name gives way (cut short, whole in its tooltip) rather than pushing what follows it out. */
  .picker {
    position: relative;
    min-width: 0;
  }
  /* The source (the design's .agent-pick): a 30 px button in a line, the agent's dot, its name, « worktree », a chevron. */
  .src {
    height: 30px;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--text);
    font-size: 13px;
    font-weight: 550;
    cursor: pointer;
  }
  .src:hover {
    background: var(--hover);
  }
  .src:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: 1px;
  }
  .src > * {
    flex: none;
  }
  .src .nm {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kind {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 500;
  }
  .chev,
  .glyph {
    display: grid;
    color: var(--muted);
  }
  .menu {
    position: absolute;
    top: 36px;
    left: 0;
    z-index: 30;
    width: 380px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px;
    border-radius: 11px;
    background: var(--raise-2);
    box-shadow:
      inset 0 0 0 1px var(--line-2),
      0 18px 48px -10px rgba(0, 0, 0, calc(0.8 * var(--shade)));
    animation: ccFadeIn 0.2s var(--ease);
  }
  .title {
    padding: 7px 9px 5px;
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 600;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .opt:hover,
  .opt[aria-checked='true'] {
    background: rgba(var(--fg-rgb), 0.06);
  }
  .opt:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: -2px;
  }
  .ic {
    width: 16px;
    flex: none;
    display: flex;
    justify-content: center;
    color: var(--muted);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .txt .nm {
    font-weight: 600;
  }
  .sub {
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    font-size: 11px;
    color: var(--muted);
  }
  .count.some {
    color: var(--git-m);
  }
  .check {
    width: 14px;
    display: grid;
    color: var(--p-ink);
  }
  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
    }
  }
</style>
