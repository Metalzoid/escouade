<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { IS_MAC } from '../../lib/platform';
  import { app } from '../../lib/state.svelte';
  import type { WorktreeStep } from '../../lib/types';
  import { tip } from '../../lib/tip';
  import Icon from '../Icon.svelte';

  // The commands a project runs in its worktrees (their setup, or their teardown, `kind`), in order: shell, command
  // line, folder of the worktree.
  let { steps = $bindable(), kind, onadd }: { steps: WorktreeStep[]; kind: 'setup' | 'teardown'; onadd: () => void } = $props();

  /** Alt as the system writes it in a shortcut. */
  const ALT = IS_MAC ? t('settings.steps.altMac') : 'Alt+';

  /**
   * Moves step `i` one place up (-1) or down (1). The focus stays on what had it in the step, which moves with it
   * (its rows are keyed); on the other button when the one pressed has no way left to go.
   */
  async function move(i: number, by: -1 | 1) {
    const to = i + by;
    if (to < 0 || to >= steps.length) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const [step] = steps.splice(i, 1);
    steps.splice(to, 0, step);
    await tick();
    if (!focused?.isConnected) return;
    const other = focused.closest('.step')?.querySelector<HTMLButtonElement>(by < 0 ? '.down' : '.up');
    if (focused instanceof HTMLButtonElement && focused.disabled && other) other.focus();
    else if (document.activeElement !== focused) focused.focus();
  }

  /** Alt+↑ / Alt+↓ on any field of a step moves it: not with Ctrl (Ctrl+Alt is AltGr), Shift or Cmd. */
  function onKeydown(e: KeyboardEvent, i: number) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // Taken from the field: a list would open, a cursor would go to the start of the line.
    e.preventDefault();
    move(i, e.key === 'ArrowUp' ? -1 : 1);
  }
</script>

<div class="steps">
  {#each steps as s, i (s.id)}
    <!-- The keys come from the step's fields and buttons, which keep their own. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="step" role="group" aria-label={t(`settings.steps.${kind}.group`, { n: i + 1 })} onkeydown={(e) => onKeydown(e, i)}>
      <span class="n" aria-hidden="true">{i + 1}</span>
      <input
        class="field mono cmd"
        aria-label={t('common.command')}
        placeholder={t('settings.steps.commandPlaceholder')}
        spellcheck="false"
        bind:value={s.command}
      />
      <input
        class="field mono dir"
        aria-label={t('settings.fields.subfolder')}
        use:tip={t('settings.steps.subfolderTitle')}
        placeholder={t('settings.steps.subfolderPlaceholder')}
        spellcheck="false"
        bind:value={s.cwd}
      />
      <select class="field" aria-label={t('settings.fields.shell')} bind:value={s.shell}>
        {#each app.shells as sh (sh.id)}<option value={sh.id}>{sh.label}</option>{/each}
        {#if !app.shells.some((sh) => sh.id === s.shell)}<option value={s.shell}
            >{t('settings.fields.shellNotFound', { name: s.shell || t('settings.fields.shell') })}</option
          >{/if}
      </select>
      <span class="acts">
        <button
          class="icon-btn up"
          use:tip={t('settings.steps.up', { keys: t('settings.steps.upKeys', { alt: ALT }) })}
          aria-label={t('settings.steps.upN', { n: i + 1 })}
          aria-keyshortcuts="Alt+ArrowUp"
          disabled={i === 0}
          onclick={() => move(i, -1)}><Icon name="up" size={14} /></button
        >
        <button
          class="icon-btn down"
          use:tip={t('settings.steps.down', { keys: t('settings.steps.downKeys', { alt: ALT }) })}
          aria-label={t('settings.steps.downN', { n: i + 1 })}
          aria-keyshortcuts="Alt+ArrowDown"
          disabled={i === steps.length - 1}
          onclick={() => move(i, 1)}><Icon name="up" size={14} /></button
        >
        <button
          class="icon-btn del"
          use:tip={t('common.delete')}
          aria-label={t('settings.steps.deleteN', { n: i + 1 })}
          onclick={() => steps.splice(i, 1)}><Icon name="trash" size={14} /></button
        >
      </span>
    </div>
  {:else}
    <p class="empty">{t('settings.project.noCommands')}</p>
  {/each}
  <div>
    <button class="add-line" aria-label={t(`settings.steps.${kind}.add`)} onclick={onadd}
      ><Icon name="plus" size={14} />{t(`settings.steps.${kind}.add`)}</button
    >
  </div>
</div>

<style>
  /* A worktree's commands on a grid (`.cmd-row.steps-row` of the 2.0 design): rank, command, folder, shell, arrows. */
  .steps {
    display: grid;
    gap: 6px;
    margin-top: 4px;
  }
  .step {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 130px 140px auto;
    align-items: center;
    gap: 8px;
  }
  .step .field {
    width: 100%;
    min-width: 0;
  }
  .n {
    color: var(--dim);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .acts {
    display: inline-flex;
  }
  .down :global(.icon) {
    transform: rotate(180deg);
  }
  .del:hover:not(:disabled) {
    color: var(--del);
  }
  .empty {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .add-line {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    margin-top: 2px;
    padding: 0 8px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 550;
    cursor: pointer;
  }
  .add-line:hover {
    background: var(--hover);
    color: var(--text);
  }
  /* Narrow: the shell and the arrows under the command. */
  @container settings (max-width: 560px) {
    .step {
      grid-template-columns: 22px minmax(0, 1fr) 110px;
    }
    .step select,
    .acts {
      grid-column: 2 / span 1;
    }
  }
</style>
