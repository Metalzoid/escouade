<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { PrProposal } from '../../lib/types';
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

  function close() {
    if (!opening) app.modal = null;
  }
</script>

<Modal title={t('prs.modal.title', { word, host: proposal?.host ?? '…' })} width={620} onclose={close}>
  {#if proposal}
    <p class="scope mono">{t('prs.modal.scope', { agent: agent?.name ?? '', head: proposal.head, base: base || proposal.base })}</p>
  {/if}
  {#if failure}
    <p class="error" role="alert">{failure}</p>
  {:else}
    <div class="grp">
      <label class="lab" for="pr-title">{t('prs.modal.titleLabel')}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="pr-title" class="field" bind:value={title} disabled={!proposal} autofocus />
    </div>
    <div class="grp">
      <label class="lab" for="pr-body">{t('prs.modal.bodyLabel')}</label>
      <textarea id="pr-body" class="field mono body" rows="9" bind:value={body} disabled={!proposal}></textarea>
    </div>
    <div class="row">
      <div class="grp base">
        <label class="lab" for="pr-base">{t('prs.modal.baseLabel')}</label>
        <input id="pr-base" class="field mono" bind:value={base} disabled={!proposal} />
      </div>
      {#if proposal?.canDraft}
        <label class="opt"><input type="checkbox" bind:checked={draft} />{t('prs.modal.draft')}</label>
      {/if}
    </div>
    <p class="note" aria-live="polite">
      {proposing ? t('prs.modal.proposing') : proposal?.fallback ? t('prs.modal.fallback') : ''}
    </p>
    {#if proposal?.uncommitted}
      <p class="note">{t('prs.modal.uncommitted', { count: proposal.uncommitted, word })}</p>
    {/if}
    {#if refused}<p class="error" role="alert">{refused}</p>{/if}
  {/if}
  {#snippet footer()}
    <button class="btn ghost" disabled={opening} onclick={close}>{t('common.cancel')}</button>
    {#if !failure}
      <button class="btn" disabled={proposing || opening} onclick={propose}>{t('prs.modal.regenerate')}</button>
      <button class="btn primary" disabled={!proposal || !title.trim() || opening || proposing} onclick={open}
        >{opening ? t('prs.modal.opening') : t('prs.modal.submit')}</button
      >
    {/if}
  {/snippet}
</Modal>

<style>
  .scope {
    margin: -8px 0 0;
    font-size: 12.5px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .grp {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lab {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .body {
    height: auto;
    padding: 8px 12px;
    resize: vertical;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .base {
    flex: 1;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    font-size: 13px;
    cursor: pointer;
  }
  .note {
    margin: 0;
    min-height: 1em;
    font-size: 12px;
    color: var(--muted);
  }
  .error {
    margin: 0;
    font-size: 12.5px;
    color: var(--del);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
