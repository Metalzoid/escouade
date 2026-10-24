<script lang="ts">
  import { fileCategory, type DraftAttachment } from '../lib/attachments';
  import { fPct, fSize } from '../lib/format';
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';
  import Icon from './Icon.svelte';

  // A file of the message that has no preview (a PDF, a text, any file sent by its path): its icon by type, name and size, a
  // mark for a file attached where it lies, a warning for a big one, how far its copy went, and the button that takes it away (and
  // stops the copy).
  let { attachment, onremove }: { attachment: DraftAttachment; onremove: () => void } = $props();

  const category = $derived(fileCategory(attachment.name));
  const percent = $derived(Math.round((attachment.progress ?? 0) * 100));
  const warning = $derived(
    attachment.warn
      ? t(attachment.file?.origin ? 'composer.attachments.warnOrigin' : 'composer.attachments.warnCopy', { size: fSize(attachment.size) })
      : '',
  );
  // A file attached where it lies has no copy: Claude reads the user's own file, which the chip must say (and removing the chip
  // never erases it).
  const original = $derived(!!attachment.file?.origin);
</script>

<div class="att file" class:warn={!!warning} class:copying={attachment.copying} use:tip={{ text: attachment.name, cut: true }}>
  <span class="th" data-icon={category} aria-hidden="true"><Icon name={category === 'code' ? 'code' : 'file'} size={14} /></span>
  <span class="nm2">
    <b class="fname">{attachment.name}</b>
    <span class="sub">
      <span class="fsize">{fSize(attachment.size)}</span>
      {#if attachment.copying}<span class="pct">{fPct(percent)}</span>{/if}
      {#if original}
        <span class="origin" role="img" aria-label={t('composer.attachments.original')} use:tip={t('composer.attachments.original')}
          ><Icon name="link" size={12} /></span
        >
      {/if}
      {#if warning}
        <span class="badge" role="img" aria-label={warning} use:tip={warning}><Icon name="info" size={12} /></span>
      {/if}
    </span>
  </span>
  {#if attachment.copying}
    <span
      class="meter"
      role="progressbar"
      aria-label={t('composer.attachments.copying', { name: attachment.name })}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={percent}
    >
      <span style:transform="scaleX({percent / 100})"></span>
    </span>
  {/if}
  <!-- `rm`: the form that holds it moves the focus from one to the next (TicketForm). -->
  <button class="x rm" aria-label={t('composer.attachments.remove', { name: attachment.name })} onclick={onremove}
    ><Icon name="close" size={14} /></button
  >
</div>

<style>
  /* A file of the message (2.0 design): its icon, its name over its size, what becomes of it, the button that takes it
     away (and stops its copy). */
  .att {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
    height: 40px;
    padding: 0 6px;
    overflow: hidden;
    border-radius: 9px;
    background: rgba(var(--fg-rgb), 0.04);
    box-shadow: inset 0 0 0 1px var(--line-2);
    font-size: 12px;
  }
  .att.warn {
    box-shadow: inset 0 0 0 1px var(--wait-line);
  }
  .th {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: rgba(var(--fg-rgb), 0.06);
    color: var(--soft);
  }
  .nm2 {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .fname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 550;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .warn .sub {
    color: var(--wait);
  }
  .pct {
    color: var(--p-ink);
  }
  .origin,
  .badge {
    display: flex;
    cursor: help;
  }
  .origin {
    color: var(--p-ink);
  }
  .badge {
    color: var(--wait);
  }
  /* The copy under way: a thin line at the bottom of the chip. */
  .meter {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
  }
  .meter > span {
    display: block;
    height: 100%;
    background: var(--p-ink);
    transform-origin: left;
    transition: transform 0.15s;
  }
  .x {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .x:hover {
    background: var(--hover);
    color: var(--text);
  }
  @media (prefers-reduced-motion: reduce) {
    .meter > span {
      transition: none;
    }
  }
</style>
