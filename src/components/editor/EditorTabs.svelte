<script lang="ts">
  import { tabHints } from '../../lib/editor/tabs';
  import type { FileStatus } from '../../lib/editor/tree';
  import { t } from '../../lib/i18n';
  import { tip } from '../../lib/tip';
  import Icon from '../Icon.svelte';

  let {
    tabs,
    onselect,
    onclose,
  }: {
    tabs: { path: string; name: string; dirty: boolean; status: FileStatus | null; active: boolean }[];
    onselect: (path: string) => void;
    onclose: (path: string) => void;
  } = $props();

  /** The folder that tells a tab from the open ones of the same name; '' for a name that is alone. */
  const hints = $derived(tabHints(tabs.map((tab) => tab.path)));
</script>

<div class="tabs" role="tablist" aria-label={t('editor.tabs.label')}>
  {#each tabs as tab (tab.path)}
    {@const hint = hints[tab.path]}
    <div
      class="tab"
      class:on={tab.active}
      role="tab"
      tabindex="0"
      aria-selected={tab.active}
      use:tip={tab.path}
      onclick={() => onselect(tab.path)}
      onkeydown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onselect(tab.path)}
      onauxclick={(e) => e.button === 1 && onclose(tab.path)}
    >
      <span class="label"
        ><span class="name">{tab.name}</span>{#if hint}<span class="hint">{' · ' + hint}</span>{/if}</span
      >
      <button
        class="close"
        class:dirty={tab.dirty}
        aria-label={hint ? t('editor.tabs.closeIn', { name: tab.name, folder: hint }) : t('editor.tabs.close', { name: tab.name })}
        use:tip={tab.dirty ? t('editor.tabs.closeUnsaved') : t('common.close')}
        onclick={(e) => {
          e.stopPropagation();
          onclose(tab.path);
        }}><span class="dot"></span><span class="x"><Icon name="close" size={10} /></span></button
      >
    </div>
  {/each}
</div>

<style>
  /* The open files (the design's .ed-tabs): 38 px, the one shown lit and underlined in the project's colour. */
  .tabs {
    height: 38px;
    flex: none;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 14px;
    border-right: 1px solid var(--line);
    white-space: nowrap;
    cursor: pointer;
    color: var(--muted);
    font-size: 12.5px;
  }
  .tab:hover {
    color: var(--soft);
  }
  .tab.on {
    background: rgba(var(--fg-rgb), 0.03);
    box-shadow: inset 0 -2px 0 var(--p-ink);
    color: var(--text);
  }
  .tab:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: -2px;
  }
  .hint {
    color: var(--dim);
  }
  .close {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--dim);
    cursor: pointer;
  }
  .close:hover {
    background: var(--hover);
    color: var(--text);
  }
  .x {
    display: grid;
  }
  .dot {
    display: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text);
  }
  .close.dirty .dot {
    display: block;
  }
  .close.dirty .x {
    display: none;
  }
  .close.dirty:hover .dot,
  .close.dirty:focus-visible .dot {
    display: none;
  }
  .close.dirty:hover .x,
  .close.dirty:focus-visible .x {
    display: grid;
  }
</style>
