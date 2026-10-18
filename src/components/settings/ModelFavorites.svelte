<script lang="ts">
  import { t } from '../../lib/i18n';
  import { favoritesOf, setFavorite } from '../../lib/engines';
  import { app } from '../../lib/state.svelte';
  import type { EngineId } from '../../lib/types';

  // The models a harness listed for its providers (OpenCode), searched, each marked as a favorite or not: the favorites
  // come first in the composer's menu. Kept at once, as the accounts are (not part of the settings' draft).
  let { engine }: { engine: EngineId } = $props();

  let query = $state('');
  const favorites = $derived(favoritesOf(engine));
  const models = $derived(app.engineModels[engine] ?? []);
  const listed = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const all = q ? models.filter((m) => `${m.label} ${m.provider ?? ''} ${m.id}`.toLowerCase().includes(q)) : models;
    const rank = (id: string) => (favorites.includes(id) ? favorites.indexOf(id) : favorites.length);
    return [...all].sort((a, b) => rank(a.id) - rank(b.id));
  });
</script>

<div class="favorites" data-testid="model-favorites-{engine}">
  <input
    class="field search"
    type="search"
    bind:value={query}
    placeholder={t('settings.claude.models.search')}
    aria-label={t('settings.claude.models.search')}
  />
  {#if !models.length}
    <p class="empty">{t('settings.claude.models.none')}</p>
  {:else}
    <ul aria-label={t('settings.claude.models.label')}>
      {#each listed as m (m.id)}
        {@const on = favorites.includes(m.id)}
        <li>
          <button
            class="star"
            class:on
            aria-pressed={on}
            aria-label={t(on ? 'nav.dropdown.unfavorite' : 'nav.dropdown.favorite') + ' : ' + m.label}
            onclick={() => setFavorite(engine, m.id, !on)}>{on ? '★' : '☆'}</button
          >
          <span class="name">{m.label}</span>
          {#if m.provider}<span class="provider">{m.provider}</span>{/if}
          <span class="id mono">{m.id}</span>
        </li>
      {:else}
        <li class="empty">{t('nav.dropdown.none')}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .favorites {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .search {
    max-width: 320px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    font-size: 12.5px;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  .star {
    border: none;
    background: transparent;
    color: var(--dim);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
  }
  .star.on {
    color: var(--accent);
  }
  .name {
    font-weight: 600;
  }
  .provider,
  .id {
    color: var(--dim);
  }
  .id {
    margin-left: auto;
    font-size: 11px;
  }
  .empty {
    color: var(--dim);
    font-size: 12.5px;
    margin: 0;
  }
</style>
