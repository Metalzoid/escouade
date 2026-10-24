<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { PrProposal } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import Modal from './Modal.svelte';

  // « Ouvrir une PR » on an ordinary agent's branch (ESC-64): the title and the description the model of the written
  // texts proposes, which the user reads and edits; « Pousser et ouvrir » is the only thing that publishes.
  let { agentId }: { agentId: string } = $props();

  const agent = $derived(app.agents[agentId]);
  let proposal = $state<PrProposal | null>(null);
  /** Why nothing can be proposed (no remote, nothing to propose, a host without a client yet…). */
  let failure = $state<string | null>(null);
  let proposing = $state(false);
  let title = $state('');
  let body = $state('');
  let base = $state('');
  let draft = $state(false);
  let opening = $state(false);
  /** The host's refusal of the pull request, or the push's. */
  let refused = $state<string | null>(null);
  let gone = false;
  let asked = 0;
  onDestroy(() => (gone = true));

  const word = $derived(proposal?.word ?? agent?.prWord ?? 'PR');

  onMount(propose);

  async function propose() {
    const mine = ++asked;
    proposing = true;
    failure = null;
    try {
      const p = await api.agentPrPropose(agentId);
      if (mine !== asked) return;
      proposal = p;
      title = p.title;
      body = p.body;
      base ||= p.base;
    } catch (e) {
      if (mine === asked) failure = String(e);
    } finally {
      if (mine === asked) proposing = false;
    }
  }

  async function open() {
    if (!title.trim() || opening || !proposal) return;
    opening = true;
    refused = null;
    try {
      const pr = await api.agentPrOpen(agentId, { title, body, base, draft });
      if (!gone) app.modal = null;
      app.toast(t('prs.modal.opened', { word, number: pr.number }), 'ok');
    } catch (e) {
      if (gone) app.toast(String(e), 'error');
      else refused = String(e);
    } finally {
      opening = false;
    }
  }

  /** « agent · head → base », the branches in mono (the order the language gives). */
  const scope = $derived(
    proposal
      ? t('prs.modal.scope', { agent: agent?.name ?? '', head: '{head}', base: '{base}' })
          .split(/({head}|{base})/)
          .map((part) =>
            part === '{head}'
              ? { mono: true, text: proposal!.head }
              : part === '{base}'
                ? { mono: true, text: base || proposal!.base }
                : { mono: false, text: part },
          )
      : [],
  );

  function close() {
    if (!opening) app.modal = null;
  }
</script>

<Modal title={t('prs.modal.title', { word, host: proposal?.host ?? '…' })} width={760} onclose={close}>
  {#snippet lead()}<span class="lead"><Icon name="pr" /></span>{/snippet}
  {#if proposal}
    <p class="scope">
      {#each scope as part, i (i)}{#if part.mono}<span class="mono">{part.text}</span>{:else}{part.text}{/if}{/each}
    </p>
  {/if}
  {#if failure}
    <p class="error" role="alert">{failure}</p>
  {:else}
    <div class="w-fld">
      <label class="lab" for="pr-title">{t('prs.modal.titleLabel')}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="pr-title" class="field" bind:value={title} disabled={!proposal} autofocus />
    </div>
    <div class="w-fld">
      <label class="lab" for="pr-body">{t('prs.modal.bodyLabel')}</label>
      <textarea id="pr-body" class="field ta" rows="7" bind:value={body} disabled={!proposal}></textarea>
    </div>
    <div class="two">
      <div class="w-fld">
        <label class="lab" for="pr-base">{t('prs.modal.baseLabel')}</label>
        <input id="pr-base" class="field mono base" spellcheck="false" bind:value={base} disabled={!proposal} />
      </div>
      {#if proposal?.canDraft}
        <label class="w-tick draft"
          ><input type="checkbox" bind:checked={draft} /><span class="tick-box" aria-hidden="true"><Icon name="check" size={12} /></span>{t(
            'prs.modal.draft',
          )}</label
        >
      {/if}
    </div>
    {#if proposing || proposal?.fallback}
      <p class="said" aria-live="polite">{proposing ? t('prs.modal.proposing') : t('prs.modal.fallback')}</p>
    {/if}
    {#if proposal?.uncommitted}
      <p class="w-notice"><Icon name="info" /><span>{t('prs.modal.uncommitted', { count: proposal.uncommitted, word })}</span></p>
    {/if}
    {#if refused}<p class="error" role="alert">{refused}</p>{/if}
  {/if}
  {#snippet footer()}
    {#if !failure}
      <button class="btn regen" disabled={proposing || opening} onclick={propose}
        ><Icon name="sparkle" size={14} />{t('prs.modal.regenerate')}</button
      >
    {/if}
    <button class="btn" disabled={opening} onclick={close}>{t('common.cancel')}</button>
    {#if !failure}
      <button class="btn primary" disabled={!proposal || !title.trim() || opening || proposing} onclick={open}
        ><Icon name="push" size={14} />{opening ? t('prs.modal.opening') : t('prs.modal.submit')}</button
      >
    {/if}
  {/snippet}
</Modal>

<style>
  .lead {
    display: inline-flex;
    color: var(--muted);
  }
  .scope {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .scope .mono {
    font-size: 0.92em;
  }
  /* The description as the preview's: in a well, in mono, the colour of code. */
  .ta {
    min-height: 150px;
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--code-fg);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
    resize: vertical;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: end;
    gap: 12px;
  }
  .base {
    height: 32px;
    font-size: 12px;
  }
  .draft {
    height: 32px;
  }
  .said {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .regen {
    margin-right: auto;
  }
  .error {
    margin: 0;
    font-size: 12.5px;
    color: var(--del);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
