<script lang="ts">
  import { engineName } from '../../lib/engines';
  import { forwardTargets } from '../../lib/handover';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { Agent, EngineId } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // A message refused for want of an account of the agent's harness (ESC-128, choice 19 of the 2.0 design): nothing
  // starts in silence, and the way out is a click away: add an account of that harness, or go on on another one.
  let { agent, engine, text }: { agent: Agent; engine: EngineId; text: string } = $props();

  const harness = $derived(engineName(engine));
  const other = $derived(forwardTargets(agent)[0] ?? null);
</script>

<div class="limit" role="group" aria-label={text} data-testid="no-account">
  <div class="lt"><Icon name="user" size={14} />{text}</div>
  <p>{t('conv.noAccount.body', { harness })}</p>
  <div class="row-btns">
    <button class="btn primary" onclick={() => (app.modal = { kind: 'account', engine })}>{t('accounts.tab.addTo', { harness })}</button>
    {#if other}
      <button class="btn" onclick={() => app.run(api.continueOnEngine(agent.id, other))}
        >{t('handover.continueOn', { harness: engineName(other) })}</button
      >
    {/if}
  </div>
</div>

<style>
  .limit {
    display: grid;
    gap: 10px;
    margin: 4px 0;
    padding: 13px 14px;
    border-radius: 11px;
    background: var(--wait-bg);
    box-shadow: inset 0 0 0 1px var(--wait-line);
  }
  .lt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .lt :global(.icon) {
    color: var(--wait);
  }
  p {
    margin: 0;
    color: var(--soft);
    font-size: 12.5px;
  }
  .row-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
