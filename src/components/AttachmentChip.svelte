<script lang="ts">
  import { fileCategory, type DraftAttachment } from '../lib/attachments';
  import { fPct, fSize } from '../lib/format';
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';

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

<div class="file" class:warn={!!warning} class:copying={attachment.copying} use:tip={{ text: attachment.name, cut: true }}>
  <span class="ico" data-icon={category} aria-hidden="true">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {#if category === 'archive'}
        <rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
      {:else if category === 'sheet'}
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
      {:else if category === 'video'}
        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" />
      {:else if category === 'audio'}
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      {:else if category === 'code'}
        <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
      {:else}
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
        {#if category === 'document'}<path d="M9 13h6M9 17h6" />{/if}
      {/if}
    </svg>
  </span>
  <span class="fname">{attachment.name}</span>
  <span class="fsize">{fSize(attachment.size)}</span>
  {#if original}
    <span class="origin" role="img" aria-label={t('composer.attachments.original')} use:tip={t('composer.attachments.original')}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </span>
  {/if}
  {#if attachment.copying}
    <span class="pct">{fPct(percent)}</span>
    <span
      class="meter"
      role="progressbar"
      aria-label={t('composer.attachments.copying', { name: attachment.name })}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={percent}
    >
      <span style:width="{percent}%"></span>
    </span>
  {/if}
  {#if warning}
    <span class="badge" role="img" aria-label={warning} use:tip={warning}>!</span>
  {/if}
  <button class="rm" aria-label={t('composer.attachments.remove', { name: attachment.name })} onclick={onremove}>×</button>
</div>

<style>
  .file {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 300px;
    height: 30px;
    padding: 0 5px 0 10px;
    overflow: hidden;
    border-radius: 99px;
    border: 1px solid var(--line2);
    background: var(--elev2);
    font-size: 12.5px;
    color: var(--muted);
  }
  .file.warn {
    border-color: color-mix(in oklch, var(--wait) 55%, var(--line2));
  }
  .ico {
    display: flex;
    flex: none;
    color: var(--dim);
  }
  .fname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fsize,
  .pct {
    flex: none;
    font-size: 11.5px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .pct {
    color: var(--accent);
  }
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
    background: var(--accent);
    transition: width 0.15s;
  }
  .origin {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: color-mix(in oklch, var(--accent) 16%, transparent);
    color: var(--accent);
    cursor: help;
  }
  .badge {
    display: grid;
    flex: none;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--wait);
    color: var(--accent-ink);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    cursor: help;
  }
  .rm {
    flex: none;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
</style>
