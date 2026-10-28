<script lang="ts">
  import Icon from '../Icon.svelte';
  import { docsStore } from '../../lib/docs.svelte';
  import { fAgo } from '../../lib/format';
  import { t } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import { tip } from '../../lib/tip';
  import type { DocsPlan, Project } from '../../lib/types';

  // What a « Planifier » made (ESC-262): its tickets in « À faire », each opening the Kanban, those the board had
  // already, and « Annuler », which removes the ones not started yet. Under a discussion, and on top of the Specification.
  let { project, plan }: { project: Project; plan: DocsPlan } = $props();

  const when = $derived(fAgo(plan.at / 1000, app.now));
  /** The tickets made that are still on the board. */
  const left = $derived(plan.made.filter((m) => app.tickets[m.id]));
  let cancelling = $state(false);

  async function cancel() {
    cancelling = true;
    await docsStore.cancelPlan(project.id, plan.id);
    cancelling = false;
  }
</script>

<section class="plan" data-plan={plan.id} aria-label={t('docs.plan.heading')}>
  <p class="line">
    <Icon name="kanban" size={14} />
    <span>{plan.made.length ? t('docs.plan.made', { count: plan.made.length, when }) : t('docs.plan.none', { when })}</span>
  </p>
  {#if plan.made.length}
    <ul class="made">
      {#each plan.made as m (m.id)}
        {@const ticket = app.tickets[m.id]}
        <li data-made={m.key}>
          <button class="tk" disabled={!ticket} aria-label={t('docs.plan.open', { key: m.key })} onclick={() => app.openBoard(project.id)}
            ><span class="key">{m.key}</span><span class="title">{m.title}</span>{#if ticket}<span class="col"
                >{t(`board.columns.${ticket.column}`)}</span
              >{/if}</button
          >
        </li>
      {/each}
    </ul>
    <p class="note">{t('docs.plan.notStarted')}</p>
  {/if}
  {#if plan.skipped.length}
    <p class="note" data-skipped>
      {t('docs.plan.skipped', { count: plan.skipped.length, keys: [...new Set(plan.skipped.map((s) => s.key))].join(', ') })}
    </p>
  {/if}
  {#if left.length}
    <div class="acts">
      <button class="btn ghost" data-plan-cancel disabled={cancelling} use:tip={t('docs.plan.cancelTip')} onclick={cancel}
        >{t('docs.plan.cancel')}</button
      >
    </div>
  {/if}
</section>

<style>
  .plan {
    margin-bottom: 12px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--raise);
    font-size: 13px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-weight: 560;
  }
  .made {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }
  .tk {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .tk:hover:not(:disabled) {
    background: var(--hover);
  }
  .tk:disabled {
    color: var(--dim);
    cursor: default;
    text-decoration: line-through;
  }
  .key {
    flex: none;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col {
    flex: none;
    color: var(--dim);
    font-size: 12px;
  }
  .note {
    margin: 4px 0 0;
    color: var(--dim);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
</style>
