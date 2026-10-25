<script lang="ts">
  import { onMount } from 'svelte';
  import { trapFocus } from '../../lib/focus';
  import { t } from '../../lib/i18n';
  import Icon from '../Icon.svelte';

  // The images an agent sent, seen full size (ESC-171): one at a time, the previous and the next by the buttons or the
  // arrows, Échap or a click beside it to close. An image is an `<img>` of a `data:` URL the core read: an SVG's scripts
  // never run.
  let {
    images,
    index = $bindable(0),
    onclose,
  }: { images: { name: string; url: string }[]; index?: number; onclose: () => void } = $props();

  const current = $derived(images[Math.min(index, images.length - 1)]);
  const many = $derived(images.length > 1);
  let overlay = $state<HTMLDivElement>();
  let closer = $state<HTMLButtonElement>();

  const go = (step: number) => (index = (index + step + images.length) % images.length);

  function onkeydown(e: KeyboardEvent) {
    // A window opened over it closes first.
    const all = document.querySelectorAll('.overlay');
    if (all.length > 1 && all[all.length - 1] !== overlay) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowLeft' && many) go(-1);
    else if (e.key === 'ArrowRight' && many) go(1);
    else return;
    e.preventDefault();
  }

  onMount(() => closer?.focus());

  /** Out of the conversation, under the body: a column with `container-type` holds a `position: fixed` child in it. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={overlay}
  class="overlay viewer"
  role="dialog"
  aria-modal="true"
  aria-label={t('conv.sent.viewer')}
  tabindex="-1"
  use:portal
  use:trapFocus
  onclick={(e) => e.target === e.currentTarget && onclose()}
>
  <div class="bar">
    <b class="name">{current?.name}</b>
    {#if many}<span class="count">{t('conv.sent.counter', { n: index + 1, count: images.length })}</span>{/if}
    <button bind:this={closer} class="round" aria-label={t('conv.sent.close')} onclick={onclose}><Icon name="close" size={16} /></button>
  </div>
  {#if many}
    <button class="round side prev" aria-label={t('conv.sent.prev')} onclick={() => go(-1)}><Icon name="right" size={18} /></button>
    <button class="round side next" aria-label={t('conv.sent.next')} onclick={() => go(1)}><Icon name="right" size={18} /></button>
  {/if}
  {#if current}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img src={current.url} alt={current.name} onclick={(e) => e.stopPropagation()} />
  {/if}
</div>

<style>
  /* Over everything, the image on a dark scrim in both themes: an image is seen as it is, not on the theme's paper. */
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 56px 72px 32px;
    background: rgba(8, 9, 12, 0.88);
    outline: none;
    animation: fade 0.16s var(--ease);
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 6px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
    /* A transparent PNG or an SVG drawn in black still reads. */
    background: repeating-conic-gradient(#2a2c31 0 25%, #222428 0 50%) 0 0 / 16px 16px;
  }
  .bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 12px 0 20px;
    color: #e8e9ec;
    font-size: 13px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 550;
  }
  .count {
    color: #a3a6ad;
    font-variant-numeric: tabular-nums;
  }
  .round {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #e8e9ec;
    cursor: pointer;
  }
  .round:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .round:focus-visible {
    outline: 2px solid var(--p-ink, #8ab4ff);
    outline-offset: 2px;
  }
  .side {
    position: absolute;
    top: 50%;
    width: 40px;
    height: 40px;
    transform: translateY(-50%);
  }
  .prev {
    left: 16px;
  }
  .prev :global(svg) {
    transform: rotate(180deg);
  }
  .next {
    right: 16px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .viewer {
      animation: none;
    }
  }
</style>
