<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { t } from '../lib/i18n';
  import { pullTip, shownPulls } from '../lib/pulls';
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tip';
  import type { PullRequestLink } from '../lib/types';

  // The pull requests linked to an agent: the number of each, which opens its page, its state and, while it is to
  // merge, its checks and its reviews. One under the other on an agent's card (`max` of them, the others counted), in a
  // row in the header of its conversation (`inline`).
  let { pulls, max = Infinity, inline = false }: { pulls: PullRequestLink[]; max?: number; inline?: boolean } = $props();

  const all = $derived(shownPulls(pulls));
  const shown = $derived(all.slice(0, max));
  /** What the checks say, at a glance; their words are in the tip, and read to a screen reader. */
  const CHECKS = { pending: '●', passing: '✓', failing: '✗' } as const;

  function open(e: Event, pr: PullRequestLink) {
    // On a card: the click is the link's, not the card's.
    e.stopPropagation();
    void app.run(openUrl(pr.url));
  }
</script>

{#if shown.length}
  <ul class="pulls mono" class:inline aria-label={t('git.pulls.label')}>
    {#each shown as pr (pr.url)}
      <li class="pr" data-state={pr.state || 'unknown'}>
        <span class="glyph" aria-hidden="true">⇡</span>
        <button
          class="num"
          aria-label={t('git.pulls.open', { n: pr.number })}
          use:tip={pullTip(pr)}
          onclick={(e) => open(e, pr)}
          onkeydown={(e) => e.stopPropagation()}>#{pr.number}</button
        >
        {#if pr.state}<span class="state">{t(`git.pulls.state.${pr.state}`)}</span>{/if}
        {#if pr.checks}
          <span class="checks" data-checks={pr.checks} use:tip={t(`git.pulls.checks.${pr.checks}`)}
            ><span aria-hidden="true">{CHECKS[pr.checks]}</span><span class="sr">{t(`git.pulls.checks.${pr.checks}`)}</span></span
          >
        {/if}
        {#if pr.review}<span class="review" data-review={pr.review}>{t(`git.pulls.review.${pr.review}`)}</span>{/if}
      </li>
    {/each}
    {#if all.length > shown.length}
      <li class="more">{t('git.pulls.more', { count: all.length - shown.length })}</li>
    {/if}
  </ul>
{/if}

<style>
  .pulls {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font-size: 11px;
    color: var(--muted);
  }
  .pulls.inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0 12px;
  }
  .pr,
  .more {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    white-space: nowrap;
  }
  .glyph,
  .more {
    color: var(--dim);
  }
  .num {
    padding: 0;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .num:hover {
    text-decoration: underline;
  }
  .state {
    color: var(--muted);
  }
  .pr[data-state='open'] .state {
    color: var(--info);
  }
  .pr[data-state='merged'] .state {
    color: var(--ok);
  }
  .pr[data-state='closed'] .state {
    color: var(--dim);
  }
  .checks[data-checks='passing'] {
    color: var(--ok);
  }
  .checks[data-checks='pending'] {
    color: var(--wait);
  }
  .checks[data-checks='failing'] {
    color: var(--del);
  }
  .review {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .review[data-review='approved'] {
    color: var(--ok);
  }
  .review[data-review='changes'] {
    color: var(--wait);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
