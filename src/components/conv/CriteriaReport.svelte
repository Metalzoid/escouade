<script lang="ts">
  import type { Report } from '../../lib/escouade';
  import { t } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import { canTest, testAgent } from '../../lib/test-launch.svelte';
  import type { Agent, Criterion } from '../../lib/types';
  import Icon from '../Icon.svelte';

  let { report, criteria = [], agent }: { report: Report; criteria?: Criterion[]; agent: Agent } = $props();

  const met = $derived(report.criteria?.filter((c) => c.ok).length ?? 0);
  const project = $derived(app.projects.find((p) => p.id === agent.projectId));
</script>

<div class="report">
  {#if report.criteria}
    <div class="head">
      <span class="t">{t('board.report.title')}</span>
      <span class="n mono">{met}/{report.criteria.length}</span>
    </div>
    <ul aria-label={t('board.report.title')}>
      {#each report.criteria as c, i (i)}
        <li class:ok={c.ok}>
          <span class="mark" role="img" aria-label={c.ok ? t('board.report.met') : t('board.report.unmet')}
            ><Icon name={c.ok ? 'check-c' : 'circle'} size={14} /></span
          ><span class="text">{criteria[c.n - 1]?.text ?? t('board.report.criterion', { n: c.n })}</span>{#if c.note}<span class="note"
              >{c.note}</span
            >{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if report.progress}
    <div class="head"><span class="t">{t('board.report.doneHeading')}</span></div>
    <ul class="steps" aria-label={t('board.report.progressLabel')}>
      {#each report.progress as p, i (i)}
        <li>{p}</li>
      {/each}
    </ul>
  {/if}
  {#if report.recipe}
    <div class="head"><span class="t">{t('board.report.testLaunch')}</span></div>
    <!-- A recipe has a step at least: a preparation alone shows as such. -->
    <ul aria-label={t('board.report.testLaunch')}>
      {#each report.recipe.prepare as s, i (i)}
        <li><span class="mono name">{t('board.report.prepare')}</span><span class="mono cmd">{s.command}</span></li>
      {/each}
      {#each report.recipe.processes as p, i (i)}
        <li>
          <span class="mono name">{p.name || t('board.report.process', { n: i + 1 })}</span><span class="mono cmd">{p.command}</span
          >{#if p.url}<span class="mono url">{p.url}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if project && canTest(agent)}
      <button class="btn test" onclick={() => testAgent(agent, project)}><Icon name="play" size={14} />{t('board.report.test')}</button>
    {/if}
  {/if}
</div>

<style>
  /* The agent's report of its ticket's criteria, of what it did, of how to test it: a card with a hairline. */
  .report {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 11px;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .t {
    font-weight: 600;
  }
  .n {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 5px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 7px;
    color: var(--soft);
    font-size: 12.5px;
    line-height: 1.45;
    /* Long commands, addresses and notes wrap rather than widen the card. */
    overflow-wrap: anywhere;
  }
  .mark {
    flex: none;
    align-self: center;
    display: flex;
    color: var(--muted);
  }
  li.ok .mark {
    color: var(--add);
  }
  .note {
    color: var(--muted);
    font-size: 11.5px;
  }
  .note::before {
    content: '— ';
  }
  .steps li {
    flex-wrap: nowrap;
    color: var(--muted);
  }
  .steps li::before {
    content: '·';
    width: 14px;
    flex: none;
    text-align: center;
    color: var(--sep);
  }
  .name {
    font-weight: 600;
  }
  .cmd,
  .url {
    color: var(--muted);
    font-size: 11.5px;
  }
  .test {
    justify-self: start;
    height: 30px;
  }
</style>
