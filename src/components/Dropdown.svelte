<script lang="ts" module>
  export interface DropdownOption {
    value: string;
    label: string;
    detail?: string;
    title?: string;
    disabled?: boolean;
    /** Marked as a favorite (the menu has favorites: `onFavorite`). */
    favorite?: boolean;
    /** The heading of the group it is shown under (the models' families, ESC-127): the options of a group follow each other. */
    group?: string;
  }
</script>

<script lang="ts">
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';
  import Star from './Star.svelte';

  // A compact picker whose menu opens upwards (the composer sits at the bottom of the window).
  let {
    caption,
    value,
    options,
    open,
    onToggle,
    onPick,
    showCaption = true,
    disabled = false,
    readonly = false,
    danger = false,
    title,
    searchable = false,
    onFavorite,
  }: {
    caption: string;
    value: string;
    options: DropdownOption[];
    open: boolean;
    onToggle: () => void;
    onPick: (value: string) => void;
    showCaption?: boolean;
    disabled?: boolean;
    /** Shown but not changeable (its title says why): it stays legible, where a disabled chip is dimmed. */
    readonly?: boolean;
    danger?: boolean;
    title?: string;
    /** A search field above a long list (OpenCode's models). */
    searchable?: boolean;
    /** A star on each option, which marks it as a favorite or no longer. */
    onFavorite?: (value: string, favorite: boolean) => void;
  } = $props();

  let query = $state('');
  let search = $state<HTMLInputElement>();
  // A menu opened again starts with every option, the search field ready.
  $effect(() => {
    if (!open) return;
    query = '';
    queueMicrotask(() => search?.focus());
  });
  const listed = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => `${o.label} ${o.detail ?? ''} ${o.value} ${o.group ?? ''}`.toLowerCase().includes(q));
  });
  // The options listed, by group (one without a heading when they have none): a group the search leaves empty is not shown.
  const sections = $derived.by(() => {
    const out: { name?: string; options: DropdownOption[] }[] = [];
    for (const o of listed) {
      const last = out.at(-1);
      if (last && last.name === o.group) last.options.push(o);
      else out.push({ name: o.group, options: [o] });
    }
    return out;
  });

  let menuEl = $state<HTMLElement>();
  // The arrows go from option to option (the headings and the stars skipped), from the search field too; Enter picks the
  // one reached, as a button does.
  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(menuEl?.querySelectorAll<HTMLButtonElement>('.item:not(:disabled)') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const active = document.activeElement;
    const at = items.findIndex((i) => i === active || i.parentElement?.contains(active));
    const down = e.key === 'ArrowDown';
    if (at < 0) (down ? items[0] : items.at(-1))?.focus();
    else if (!down && at === 0 && search) search.focus();
    else items[(at + (down ? 1 : -1) + items.length) % items.length].focus();
  }

  const shown = $derived(options.find((o) => o.value === value)?.label ?? (value || '—'));
  const label = $derived(t('nav.dropdown.label', { caption, shown }));

  // Escape closes the menu first, before it can reach the composer (where it interrupts Claude).
  function onKeydownCapture(e: KeyboardEvent) {
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  }
</script>

<svelte:window onkeydowncapture={onKeydownCapture} />

{#snippet option(o: DropdownOption)}
  <div class="row">
    <button
      class="item"
      role="menuitemradio"
      aria-checked={o.value === value}
      disabled={o.disabled}
      use:tip={o.title}
      onclick={() => onPick(o.value)}
    >
      <span class="check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
      <span class="ml">{o.label}</span>
      {#if o.detail}<span class="md">{o.detail}</span>{/if}
    </button>
    {#if onFavorite}
      <button
        class="star"
        class:on={o.favorite}
        aria-pressed={!!o.favorite}
        aria-label={t(o.favorite ? 'nav.dropdown.unfavorite' : 'nav.dropdown.favorite') + ' : ' + o.label}
        use:tip={t(o.favorite ? 'nav.dropdown.unfavorite' : 'nav.dropdown.favorite')}
        onclick={() => onFavorite(o.value, !o.favorite)}><Star on={o.favorite} /></button
      >
    {/if}
  </div>
{/snippet}

<div class="dd">
  <button
    class="trigger"
    class:danger
    class:readonly
    aria-haspopup={readonly ? undefined : 'menu'}
    aria-expanded={readonly ? undefined : open}
    aria-disabled={readonly ? 'true' : undefined}
    aria-label={label}
    use:tip={title ?? label}
    {disabled}
    onclick={readonly ? undefined : onToggle}
  >
    {#if showCaption}<span class="cap">{caption}</span>{/if}<span class="val">{shown}</span>{#if !readonly}<span class="chev">▾</span>{/if}
  </button>
  {#if open && !readonly}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={onToggle}></div>
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="menu" class:long={searchable} role="menu" aria-label={caption} bind:this={menuEl} onkeydown={onMenuKeydown}>
      {#if searchable}
        <input
          bind:this={search}
          bind:value={query}
          class="search"
          type="search"
          placeholder={t('nav.dropdown.search')}
          aria-label={t('nav.dropdown.search')}
          onkeydown={(e) => {
            if (e.key === 'Enter' && listed[0] && !listed[0].disabled) {
              e.preventDefault();
              onPick(listed[0].value);
            }
          }}
        />
      {/if}
      <div class="items">
        {#each sections as section, i (section.name ?? i)}
          {#if section.name}
            <div class="group" role="group" aria-label={section.name}>
              <div class="gtitle" aria-hidden="true">{section.name}</div>
              {#each section.options as o (o.value)}{@render option(o)}{/each}
            </div>
          {:else}
            {#each section.options as o (o.value)}{@render option(o)}{/each}
          {/if}
        {:else}
          <span class="none">{t('nav.dropdown.none')}</span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .dd {
    position: relative;
    min-width: 0;
    flex: 0 1 auto;
  }
  .trigger {
    height: 30px;
    max-width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--panel);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .trigger:hover:not(:disabled, .readonly) {
    border-color: var(--line2);
  }
  .trigger.readonly {
    cursor: default;
  }
  .trigger:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .trigger.danger {
    border-color: color-mix(in oklch, var(--del) 55%, transparent);
    color: var(--del);
  }
  .cap {
    font-family: var(--ui);
    color: var(--dim);
  }
  .val {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    flex: none;
    color: var(--dim);
    font-size: 9px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
  }
  .menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 30;
    width: max-content;
    min-width: 170px;
    max-width: 330px;
    display: flex;
    flex-direction: column;
    padding: 5px;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
  .menu.long {
    max-width: 420px;
  }
  .items {
    display: flex;
    flex-direction: column;
    max-height: min(360px, 60vh);
    overflow-y: auto;
  }
  .search {
    margin: 0 0 5px;
    padding: 6px 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--panel);
    font-size: 12.5px;
  }
  .row {
    display: flex;
    align-items: stretch;
  }
  .row .item {
    flex: 1;
    min-width: 0;
  }
  /* A star without a background or a border: an outline that shows more on its row's hover and on focus, filled in the
     accent's color for a favorite. */
  .menu .star {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 30px;
    padding: 0;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: color-mix(in oklch, var(--dim) 70%, transparent);
    cursor: pointer;
  }
  .row:hover .star,
  .menu .star:focus-visible {
    color: var(--muted);
  }
  .menu .star:hover {
    color: var(--text);
  }
  .menu .star.on {
    color: var(--accent);
  }
  .group + .group {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--line);
  }
  .gtitle {
    padding: 4px 10px 3px;
    font-size: 11px;
    font-weight: 600;
    color: var(--dim);
    user-select: none;
  }
  .none {
    padding: 7px 10px;
    font-size: 12.5px;
    color: var(--dim);
  }
  .menu .item {
    display: grid;
    grid-template-columns: 16px auto;
    column-gap: 6px;
    padding: 7px 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .menu .item:hover:not(:disabled),
  .menu .item:focus-visible {
    background: var(--elev2);
  }
  .menu .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .check {
    grid-row: span 2;
    color: var(--accent);
    font-size: 12px;
  }
  .ml {
    font-size: 13px;
    font-weight: 600;
  }
  .md {
    font-size: 11.5px;
    color: var(--dim);
  }
</style>
