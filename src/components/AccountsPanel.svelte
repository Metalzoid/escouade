<script lang="ts">
  import { onMount } from 'svelte';
  import { accountName, metersShown, quotaGroups } from '../lib/accounts';
  import { capsOf } from '../lib/engines';
  import { trapFocus } from '../lib/focus';
  import { t } from '../lib/i18n';
  import { estimateHint, fSpentUsd } from '../lib/spend';
  import { app } from '../lib/state.svelte';
  import QuotaMeter from './QuotaMeter.svelte';
  import { tip } from '../lib/tip';

  // The panel the quota group of the status bar opens, above it, when there are several accounts: a group per harness, in
  // « Ordre des harness », each account's meters with the percentage written, the current account of the harness first.
  // `anchor`: that button, to open over it and to give the focus back to. `id`: what the button's `aria-controls` names.
  let { anchor, id, onclose }: { anchor?: HTMLElement; id?: string; onclose: () => void } = $props();

  /** The width of the panel. */
  const WIDTH = 360;

  const groups = $derived(quotaGroups(app.now));
  let place = $state({ left: 16, bottom: 38 });

  onMount(() => {
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      place = {
        left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
        bottom: Math.max(8, window.innerHeight - r.top + 6),
      };
    }
    // The focus goes back to the button, which a click may not have focused (Safari's): the keyboard goes on from there.
    return () => anchor?.focus();
  });

  /** Escape closes the panel before it can reach what is under it (the composer, where it interrupts Claude). */
  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={onWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div
  class="panel"
  {id}
  use:trapFocus
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={t('accounts.panel.title')}
  style:left="{place.left}px"
  style:bottom="{place.bottom}px"
  style:width="{WIDTH}px"
>
  {#each groups as g (g.engine)}
    {@const noQuota = capsOf(g.engine)?.quota === 'none'}
    <section class="harness" aria-label={t('accounts.tab.group', { harness: g.name })}>
      <h3 class="title">{g.name}</h3>
      {#each g.rows as r (r.account.id)}
        {@const u = r.usage}
        {@const meters = metersShown(u, g.engine)}
        <div
          class="acct"
          class:off={r.reasons.length > 0}
          role="group"
          aria-label={accountName(r.account)}
          aria-current={r.current ? 'true' : undefined}
        >
          <div class="head">
            <span class="name">{accountName(r.account)}</span>
            {#if r.current}<span class="tag cur">{t('accounts.panel.current')}</span>{/if}
            {#if r.over}<span class="tag over">{t('accounts.panel.over')}</span>{/if}
            <span class="today" use:tip={r.today.estimated ? estimateHint(r.today) : undefined}
              >{t('accounts.panel.today', { amount: fSpentUsd(r.today) })}</span
            >
          </div>
          {#if r.reasons.length}<div class="why">{r.reasons.join(' · ')}</div>{/if}
          {#if noQuota}
            <div class="why">{t('accounts.panel.noQuota')}</div>
          {:else if !u || u.connected || u.meters.length}
            <!-- An account that is not signed in and was never read has no meters to show. -->
            {#each meters as m (m.minutes ?? 'credits')}
              <QuotaMeter minutes={m.minutes} usage={m.usage} now={app.now} detail />
            {/each}
          {/if}
        </div>
      {/each}
    </section>
  {/each}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .panel {
    position: fixed;
    z-index: 41;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 60px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    background: var(--elev);
    border: 1px solid var(--line2);
    border-radius: var(--r);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    color: var(--muted);
    animation: ccFadeIn 0.1s ease-out;
    outline: none;
  }
  .panel:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation: none;
    }
  }
  .acct {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 14px;
  }
  .acct + .acct,
  .harness + .harness {
    border-top: 1px solid var(--line);
  }
  .title {
    margin: 0;
    padding: 9px 14px 0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .acct.off {
    opacity: 0.55;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-weight: 600;
    color: var(--text);
  }
  .tag {
    padding: 1px 6px;
    border-radius: var(--r-sm);
    background: var(--elev2);
    font-size: 10.5px;
  }
  .cur {
    color: var(--accent);
  }
  .over {
    color: var(--wait);
    background: var(--wait-soft);
  }
  .today {
    margin-left: auto;
    font-size: 11.5px;
    color: var(--muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .why {
    color: var(--muted);
  }
</style>
