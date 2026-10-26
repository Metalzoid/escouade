<script lang="ts">
  import Icon from './Icon.svelte';
  import { conversationOf } from '../lib/conversations.svelte';
  import { trapFocus } from '../lib/focus';
  import { pointerMoves } from '../lib/hover';
  import { fAgo, fInt } from '../lib/format';
  import { t } from '../lib/i18n';
  import { api } from '../lib/ipc';
  import { keyLabel } from '../lib/platform';
  import { app } from '../lib/state.svelte';
  import type { ConvHit, ConvSearchResult } from '../lib/types';

  // « Rechercher dans les conversations » (Ctrl+K): what the agents' conversations said, found by the backend in their
  // logs; a result opens its agent at the message.

  /** Characters typed before a search starts, and the pause after the last key. */
  const MIN_CHARS = 2;
  const PAUSE_MS = 150;

  let field = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();
  let text = $state('');
  // Without a project on screen, there is no "this project".
  let everywhere = $state(!app.project);
  let archived = $state(true);
  let result = $state<ConvSearchResult | null>(null);
  let loading = $state(false);
  let failure = $state<string | null>(null);
  /** The result Enter opens, by its rank among all of them. */
  let active = $state(0);
  /** Whether the cursor moved last by the keyboard (the arrows, new results): not by the mouse. */
  let byKeys = true;
  const moved = pointerMoves();
  /** Only the last search's answer counts. */
  let asked = 0;

  const query = $derived(text.trim());
  const short = $derived([...query].length < MIN_CHARS);
  const hits = $derived(short ? [] : (result?.hits ?? []));

  /** The results agent by agent, in the backend's order (agents are not mixed in it), each with its rank. */
  const groups = $derived.by(() => {
    const out: { agentId: string; name: string; project: string; archived: boolean; hits: { hit: ConvHit; rank: number }[] }[] = [];
    hits.forEach((hit, rank) => {
      let g = out.at(-1);
      if (g?.agentId !== hit.agentId) {
        const a = app.agents[hit.agentId];
        g = {
          agentId: hit.agentId,
          name: a?.name ?? hit.agentName,
          project: app.projects.find((p) => p.id === hit.projectId)?.name ?? '',
          archived: a?.archived ?? hit.archived,
          hits: [],
        };
        out.push(g);
      }
      g.hits.push({ hit, rank });
    });
    return out;
  });

  const status = $derived.by(() => {
    if (short) return t('conv.search.hint');
    if (loading && !result) return t('conv.search.searching');
    if (!hits.length) return t('conv.search.none');
    const count = hits.length;
    const n = fInt(count);
    if (result?.capped) return t('conv.search.capped', { n });
    if (result?.timedOut) return t('conv.search.timedOut', { count, n });
    return t('conv.search.results', { count, n });
  });

  $effect(() => {
    const q = query;
    const projectId = everywhere ? null : (app.project?.id ?? null);
    const withArchived = archived;
    const n = ++asked;
    if (short) {
      loading = false;
      return;
    }
    loading = true;
    const timer = setTimeout(() => {
      api
        .searchConversations(q, projectId, withArchived)
        .then((r) => {
          if (n !== asked) return;
          result = r;
          failure = null;
          loading = false;
          byKeys = true;
          active = 0;
        })
        .catch((e) => {
          if (n !== asked) return;
          result = null;
          failure = String(e);
          loading = false;
        });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  });

  // The chosen result stays in view as the arrows move through a long list; never under the mouse (ESC-188).
  $effect(() => {
    void hits;
    const at = active;
    if (byKeys) list?.querySelector(`#${optionId(at)}`)?.scrollIntoView({ block: 'nearest' });
  });

  /** The result the pointer moves onto becomes the cursor's. */
  function hover(e: MouseEvent, rank: number) {
    if (!moved(e)) return;
    byKeys = false;
    active = rank;
  }

  function optionId(rank: number) {
    return `conv-hit-${rank}`;
  }

  function close() {
    app.modal = null;
  }

  function move(by: number) {
    const n = hits.length;
    if (!n) return;
    byKeys = true;
    active = (active + by + n) % n;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const hit = hits[active];
      if (hit) open(hit);
    }
  }

  /**
   * Shows the agent of a result (an archived one in reading, as its card opens it), its conversation rather than the
   * editor, scrolled to the message: asked for before its view is made, which shows it once loaded.
   */
  function open(hit: ConvHit) {
    close();
    const a = app.agents[hit.agentId];
    if (!a) {
      app.toast(t('conv.search.agentGone'));
      return;
    }
    if (a.archived) app.showArchived = true;
    conversationOf(a.id).reveal(hit.itemId);
    app.selectAgent(a.id);
    app.closeEditor(a.projectId);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={close}>
  <div
    class="palette"
    use:trapFocus
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={t('conv.search.title')}
  >
    <div class="search">
      <span class="ic" aria-hidden="true"><Icon name="search" size={16} /></span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={field}
        bind:value={text}
        autofocus
        spellcheck="false"
        placeholder={t('conv.search.title')}
        role="combobox"
        aria-label={t('conv.search.title')}
        aria-expanded={hits.length > 0}
        aria-controls="conv-hits"
        aria-autocomplete="list"
        aria-activedescendant={hits.length ? optionId(active) : undefined}
        onkeydown={onKeydown}
      />
      <button class="icon-btn close" onclick={close} aria-label={t('common.close')}><Icon name="close" size={14} /></button>
    </div>
    <div class="scope">
      <div class="segmented small" role="group" aria-label={t('conv.search.scope')}>
        <button class:on={!everywhere} aria-pressed={!everywhere} disabled={!app.project} onclick={() => (everywhere = false)}
          >{t('conv.search.thisProject')}</button
        >
        <button class:on={everywhere} aria-pressed={everywhere} onclick={() => (everywhere = true)}>{t('conv.search.allProjects')}</button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={archived} />{t('conv.search.archivedAgents')}</label>
    </div>
    <div class="list" id="conv-hits" role="listbox" aria-label={t('conv.search.resultsLabel')} aria-busy={loading} bind:this={list}>
      {#each groups as g (g.agentId)}
        <div
          class="group"
          role="group"
          aria-label={[g.name, g.project, g.archived ? t('conv.search.archived') : ''].filter(Boolean).join(', ')}
        >
          <div class="who" aria-hidden="true">
            <span class="name">{g.name}</span>
            {#if g.project}<span class="proj">{g.project}</span>{/if}
            {#if g.archived}<span class="tag">{t('conv.search.archived')}</span>{/if}
          </div>
          {#each g.hits as { hit, rank } (rank)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="hit"
              class:on={rank === active}
              id={optionId(rank)}
              role="option"
              tabindex="-1"
              aria-selected={rank === active}
              onclick={() => open(hit)}
              onmousemove={(e) => hover(e, rank)}
            >
              <span class="snip"
                >{hit.snippet.slice(0, hit.mark[0])}<mark>{hit.snippet.slice(hit.mark[0], hit.mark[1])}</mark>{hit.snippet.slice(
                  hit.mark[1],
                )}</span
              >
              <span class="when">{fAgo(hit.at / 1000, app.now)}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
    <div class="foot">
      {#if failure}
        <span class="status error" role="alert">{failure}</span>
      {:else}
        <span class="status" role="status">{status}</span>
      {/if}
      <div style="flex:1"></div>
      <span class="keys" aria-hidden="true"
        ><kbd><Icon name="up" size={11} /><Icon name="pull" size={11} /></kbd>
        {t('conv.search.keyChoose')} <span class="sep">·</span> <kbd>{keyLabel('Enter')}</kbd>
        {t('conv.search.keyOpen')} <span class="sep">·</span>
        <kbd>{keyLabel('Esc')}</kbd>
        {t('conv.search.keyClose')}</span
      >
    </div>
  </div>
</div>

<style>
  /* A palette of the 2.0 design: over the window's scrim, a raised panel 14 px round, the field at its top with its
     icon, the list, the keys at the foot. */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: var(--scrim);
    animation: fade 0.12s var(--ease);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .palette {
    width: 680px;
    max-width: calc(100vw - 40px);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    background: var(--raise);
    box-shadow:
      inset 0 0 0 1px var(--line-2),
      0 24px 64px -12px rgba(0, 0, 0, calc(0.8 * var(--shade)));
    overflow: hidden;
    animation: ccFadeIn 0.15s var(--ease);
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .palette {
      animation: none;
    }
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 54px;
    padding: 0 12px 0 18px;
    border-bottom: 1px solid var(--line);
  }
  .ic {
    display: grid;
    color: var(--muted);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    outline: none;
  }
  .search input::placeholder {
    color: var(--muted);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px;
  }
  .list:empty {
    display: none;
  }
  .hit {
    border-radius: 7px;
    cursor: pointer;
  }
  .hit.on {
    background: rgba(var(--fg-rgb), 0.06);
  }
  .tag {
    flex: none;
    padding: 0 6px;
    border-radius: 5px;
    box-shadow: inset 0 0 0 1px var(--line-2);
    font-size: 11px;
    line-height: 18px;
    color: var(--muted);
  }
  mark {
    border-radius: 3px;
    background: color-mix(in oklch, var(--p) 32%, transparent);
    color: var(--text);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 18px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--muted);
  }
  .status {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status.error {
    color: var(--del);
  }
  .keys {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .keys kbd {
    gap: 2px;
  }
  .sep {
    margin: 0 4px;
    color: var(--sep);
  }
  .scope {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--soft);
    cursor: pointer;
  }
  .check input {
    margin: 0;
    accent-color: var(--p);
  }
  .group + .group {
    margin-top: 6px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 4px;
    font-size: 11.5px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .who .name {
    font-weight: 600;
    color: var(--soft);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 7px 10px;
  }
  .snip {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: var(--soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit.on .snip {
    color: var(--text);
  }
  .when {
    flex: none;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
