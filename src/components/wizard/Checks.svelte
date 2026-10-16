<script lang="ts">
  import { t } from '../../lib/i18n';
  import { CONTROL_STEP, type ControlId, type StepId } from '../../lib/wizard';
  import type { WizardForm } from '../../lib/wizard-form.svelte';

  // What would keep the way of working from working, each with its correction: those of one step (`step`), or all of
  // them (the summary, which also says when there is none).
  let { form, step }: { form: WizardForm; step?: StepId } = $props();

  const shown = $derived(form.problems.filter((id) => !step || CONTROL_STEP[id] === step));
  /** The checks the assistant corrects by itself. */
  const FIXES: Partial<Record<ControlId, string>> = {
    noCommit: 'wizard.checks.noCommit.fix',
    noTarget: 'wizard.checks.noTarget.fix',
    tracked: 'wizard.checks.tracked.fix',
  };
  let busy = $state(false);

  async function fix(id: ControlId) {
    busy = true;
    try {
      await form.fix(id);
    } finally {
      busy = false;
    }
  }
</script>

{#if shown.length}
  <ul class="checks">
    {#each shown as id (id)}
      <li class="check" data-check={id}>
        <span class="ic" aria-hidden="true">!</span>
        <div class="tx">
          <span class="tt">{t(`wizard.checks.${id}.title`, { branch: form.config.board.target })}</span>
          <span class="td">{t(`wizard.checks.${id}.desc`)}</span>
        </div>
        {#if FIXES[id]}
          <button class="btn fix" disabled={busy} onclick={() => fix(id)}>{t(FIXES[id] as 'wizard.checks.noCommit.fix')}</button>
        {/if}
      </li>
    {/each}
  </ul>
{:else if !step}
  <p class="check ok"><span class="ic" aria-hidden="true">✓</span>{t('wizard.checks.ok')}</p>
{/if}

<style>
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--r-sm);
    border: 1px solid color-mix(in oklch, var(--del) 45%, transparent);
    background: var(--bg);
  }
  .check.ok {
    border-color: var(--line);
    font-weight: 600;
    font-size: 12.5px;
  }
  .ic {
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 800;
    background: color-mix(in oklch, var(--del) 25%, transparent);
    color: var(--del);
  }
  .ok .ic {
    background: color-mix(in oklch, var(--ok) 22%, transparent);
    color: var(--ok);
  }
  .tx {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tt {
    font-weight: 700;
    font-size: 12.5px;
  }
  .td {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.45;
    text-wrap: pretty;
  }
  .fix {
    height: 26px;
    padding: 0 10px;
    font-size: 11.5px;
  }
</style>
