<script lang="ts" module>
  import { disposeTerminal, getXTerm, openAgentTerminal } from '../lib/terminals';

  /** The interface being started, by agent: a view shown twice (classic, then split) starts it once. */
  const starting = new Map<string, Promise<string>>();

  /**
   * The terminal of the agent's Claude Code interface: the one it has when the window holds it, else a new one (the
   * backend stops the one it had, which this window cannot show: a reload lost its output).
   */
  export function agentTerminal(agentId: string, current: string | null): Promise<string> {
    if (current && getXTerm(current)) return Promise.resolve(current);
    let p = starting.get(agentId);
    if (!p) {
      p = openAgentTerminal(agentId)
        .then((info) => {
          // The one before, if this window still held it, is gone.
          if (current && current !== info.id) disposeTerminal(current);
          return info.id;
        })
        .finally(() => starting.delete(agentId));
      starting.set(agentId, p);
    }
    return p;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../lib/i18n';
  import { mountTerminal } from '../lib/terminals';
  import { app } from '../lib/state.svelte';
  import type { Agent } from '../lib/types';

  // « Vue Claude Code »: the agent's conversation in Claude Code's own interface. Escouade still follows it (status,
  // notifications, cost, plan) through its hooks and its transcript.
  let { agent }: { agent: Agent } = $props();

  let box = $state<HTMLDivElement>();
  let term = $state<string | null>(null);
  let error = $state<string | null>(null);
  /** How many times « Relancer » was asked. */
  let asked = $state(0);

  const exited = $derived(term !== null && app.exitedTerms[term] !== undefined);

  // Its interface, started when the view opens, and again on « Relancer ».
  $effect(() => {
    const id = agent.id;
    void asked;
    const current = untrack(() => agent.terminalId);
    error = null;
    let gone = false;
    agentTerminal(id, current)
      .then((tid) => {
        if (!gone) term = tid;
      })
      .catch((e) => {
        if (!gone) error = String(e);
      });
    return () => {
      gone = true;
    };
  });

  $effect(() => {
    const id = term;
    const el = box;
    if (!id || !el) return;
    mountTerminal(id, el);
    const ro = new ResizeObserver(() => {
      try {
        getXTerm(id)?.fit.fit();
      } catch {
        /* hidden */
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      mountTerminal(id, null);
    };
  });

  function restart() {
    if (term) disposeTerminal(term);
    term = null;
    asked += 1;
  }
</script>

<div class="tui">
  <div class="box" bind:this={box} aria-label={t('conv.header.toTerminal')}></div>
  {#if !term && !error}
    <div class="note">{t('conv.terminal.starting')}</div>
  {/if}
  {#if error}
    <div class="note err" role="alert">
      {t('conv.terminal.failed', { error })}
      <button class="btn" onclick={restart}>{t('conv.terminal.restart')}</button>
    </div>
  {:else if exited}
    <div class="note">
      {t('conv.terminal.exited')}
      <button class="btn" onclick={restart}>{t('conv.terminal.restart')}</button>
    </div>
  {/if}
</div>

<style>
  .tui {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--term);
  }
  .box {
    flex: 1;
    min-height: 0;
    padding: 8px 4px 4px 12px;
  }
  .note {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-radius: var(--r);
    border: 1px solid var(--line);
    background: var(--panel);
    font-size: 12.5px;
    color: var(--muted);
  }
  .note.err {
    color: var(--del);
  }
</style>
