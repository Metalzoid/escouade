<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../../lib/i18n';

  // « Branche des docs » (ESC-258, docs/FACTORY.md « La branche des docs »): the current branch (empty), or a fixed one
  // named, which Escouade keeps in a worktree of its own and never merges. The backend checks the name on saving.
  let { value = $bindable() }: { value: string } = $props();

  let fixed = $state(untrack(() => !!value.trim()));
  /** The name typed, kept while « La branche courante » is chosen, to come back to. */
  let name = $state(untrack(() => value.trim() || 'docs'));

  function choose(on: boolean) {
    fixed = on;
    value = on ? name.trim() : '';
  }
  function typed(v: string) {
    name = v;
    value = v.trim();
  }
</script>

<div class="field-docs">
  <div class="segmented chips" role="group" aria-label={t('docs.branch.label')}>
    <button class="chip" class:on={!fixed} aria-pressed={!fixed} onclick={() => choose(false)}>{t('docs.branch.current')}</button>
    <button class="chip" class:on={fixed} aria-pressed={fixed} onclick={() => choose(true)}>{t('docs.branch.fixed')}</button>
  </div>
  {#if fixed}
    <input
      class="field input mono setting"
      spellcheck="false"
      aria-label={t('docs.branch.name')}
      value={name}
      oninput={(e) => typed(e.currentTarget.value)}
    />
  {/if}
  <p class="at">{fixed && name.trim() ? t('docs.branch.fixedAt', { branch: name.trim() }) : t('docs.branch.currentAt')}</p>
</div>

<style>
  .field-docs {
    display: grid;
    gap: 8px;
    justify-items: start;
  }
  .at {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
</style>
