<script lang="ts">
  import { t } from '../lib/i18n';
  import { keyLabel } from '../lib/platform';
  import { app } from '../lib/state.svelte';
  import type { Agent, Project } from '../lib/types';
  import FilesPanel from './FilesPanel.svelte';
  import GitGraph from './GitGraph.svelte';
  import WorkflowPanel from './WorkflowPanel.svelte';
  import { workflows } from '../lib/workflows.svelte';
  import { followers } from '../lib/workflow-view';
  import Icon from './Icon.svelte';
  import { tip } from '../lib/tip';

  // The agent's side panel: its uncommitted files, the repository history, the project's workflow (ESC-194), and the
  // place of the code hosts' pull requests, CI and deployments, kept for after the 2.0 (ESC-53 to 70) without drawing them.
  // `docked`: beside the conversation in the split layout (always shown), else an optional panel.
  let { project, agent, docked = false }: { project: Project; agent: Agent | null; docked?: boolean } = $props();

  let count = $state(0);
  const tab = $derived(app.panelTab);
  /** The agents that follow a workflow of the project (ESC-194): the count of its tab. */
  const following = $derived(followers(workflows.list(project.id).filter((tr) => app.agents[tr.agentId])));
  $effect(() => void workflows.loadTracks(project.id));
</script>

<aside class="git-side" class:docked aria-label={t('common.files')}>
  <div class="utabs" role="tablist">
    <button role="tab" id="side-tab-files" aria-selected={tab === 'files'} onclick={() => (app.panelTab = 'files')}>
      {t('nav.sidePanel.uncommitted')} <span class="n">{count}</span>
    </button>
    <button role="tab" id="side-tab-history" aria-selected={tab === 'history'} onclick={() => (app.panelTab = 'history')}>
      {t('nav.sidePanel.history')}
    </button>
    <button role="tab" id="side-tab-workflow" aria-selected={tab === 'workflow'} onclick={() => (app.panelTab = 'workflow')}>
      {t('workflow.tab')}{#if following}{' '}<span class="n">{following}</span>{/if}
    </button>
    <button role="tab" id="side-tab-hosts" aria-selected={tab === 'hosts'} onclick={() => (app.panelTab = 'hosts')}>
      {t('nav.sidePanel.hosts')} <span class="soon">{t('nav.sidePanel.soon')}</span>
    </button>
    <!-- Closed as it was opened (ESC-204): « Fichiers » of the header (Ctrl+Shift+B), or the layout side by side (Ctrl+Shift+L). -->
    <button
      class="icon-btn close"
      aria-label={t('nav.sidePanel.close')}
      use:tip={{
        title: t('nav.sidePanel.close'),
        kbd: keyLabel(docked ? 'Ctrl+Shift+L' : 'Ctrl+Shift+B'),
        rows: [t(docked ? 'nav.sidePanel.reopenSplit' : 'nav.sidePanel.reopen')],
        aria: false,
      }}
      onclick={() => {
        // Side by side, the classic layout again, without the panel « Fichiers » may have left open there.
        if (docked) app.toggleLayout();
        app.filesOpen = false;
      }}><Icon name="close" size={14} /></button
    >
  </div>
  <div class="pane" role="tabpanel" aria-labelledby="side-tab-{tab}">
    {#if tab === 'files'}
      <FilesPanel {project} {agent} {docked} bind:count />
    {:else if tab === 'history'}
      <GitGraph {project} {agent} />
    {:else if tab === 'workflow'}
      <WorkflowPanel {project} {agent} />
    {:else}
      <div class="later">
        <b>{t('nav.sidePanel.laterTitle')}</b>
        <span>{t('nav.sidePanel.laterBody')}</span>
        <ul>
          <li>{t('nav.sidePanel.laterPr')}</li>
          <li>{t('nav.sidePanel.laterCi')}</li>
          <li>{t('nav.sidePanel.laterDeploy')}</li>
        </ul>
        <span>{t('nav.sidePanel.laterCard')}</span>
      </div>
    {/if}
  </div>
</aside>

<style>
  .git-side {
    width: 340px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--line);
    container: git-side / inline-size;
  }
  /* Beside the conversation, as the preview lays it out: 44 % of the work, never under 340 pixels. */
  .git-side.docked {
    width: 44%;
    min-width: 340px;
  }
  /* Tabs underlined in the project's colour. */
  .utabs {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 18px;
    height: 60px;
    padding: 0 18px;
    border-bottom: 1px solid var(--line);
  }
  .utabs [role='tab'] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    margin-bottom: -1px;
    padding: 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 550;
    white-space: nowrap;
    cursor: pointer;
  }
  .utabs [role='tab']:hover {
    color: var(--text);
  }
  .utabs [role='tab'][aria-selected='true'] {
    border-bottom-color: var(--p-ink);
    color: var(--text);
  }
  .utabs .n {
    color: var(--dim);
    font-weight: 500;
  }
  .utabs .soon {
    color: var(--dim);
    font-size: 11px;
    font-weight: 500;
  }
  /* Narrow, « dans la 2.1 » goes: the tabs hold on one line. */
  @container git-side (max-width: 400px) {
    .utabs .soon {
      display: none;
    }
  }
  /* Narrower still (340 px beside the classic layout, the window of 1028 px), the tabs draw closer, the Workflow tab's
     count goes (choice 132) and « PR et CI », empty until the 2.1, leaves the strip for the × (choice 189). */
  @container git-side (max-width: 420px) {
    .utabs {
      gap: 12px;
      padding: 0 14px;
    }
    #side-tab-workflow .n,
    #side-tab-hosts {
      display: none;
    }
  }
  .close {
    align-self: center;
    margin-left: auto;
  }
  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* What comes after the 2.0 (code hosts): its place, not its detail. */
  .later {
    display: grid;
    gap: 10px;
    margin: 16px;
    padding: 18px;
    border-radius: 11px;
    border: 1px dashed var(--line-3);
    color: var(--muted);
    font-size: 12.5px;
  }
  .later b {
    color: var(--soft);
    font-weight: 600;
  }
  .later ul {
    margin: 0;
    padding-left: 18px;
  }
</style>
