<script lang="ts">
  import { accountName, accountsOf, defaultEngine, hasAccount, serves } from '../../lib/accounts';
  import { engineName } from '../../lib/engines';
  import { t } from '../../lib/i18n';
  import AccountModal from '../modals/AccountModal.svelte';
  import { app } from '../../lib/state.svelte';
  import type { CommitMode } from '../../lib/types';
  import type { WizardForm } from '../../lib/wizard-form.svelte';
  import Chips from '../settings/Chips.svelte';
  import Row from '../settings/Row.svelte';
  import Switch from '../settings/Switch.svelte';
  import Checks from './Checks.svelte';

  // « Compte et commit »: the Claude account the project's agents go to, who writes the commits, Remote Control.
  let { form }: { form: WizardForm } = $props();

  const ACCOUNTS = $derived([
    { value: '', label: t('accounts.project.auto'), title: t('accounts.project.autoTitle') },
    ...accountsOf(form.config.engine ?? undefined)
      .filter((a) => a.active && serves(a, form.project?.id))
      .map((a) => ({ value: a.id, label: accountName(a) })),
  ]);
  const COMMIT_MODES = $derived<{ value: CommitMode; label: string }[]>(
    (['agent', 'direct'] as const).map((value) => ({ value, label: t(`settings.project.commitModes.${value}`) })),
  );
  const all = $derived(!!app.settings.remoteControlAll);
  /** The project's harness, and whether it has an account (ESC-128): without one, « Ajouter un compte… » over the assistant. */
  const engine = $derived(form.config.engine ?? defaultEngine());
  const missing = $derived(!hasAccount(engine));
  let adding = $state(false);
</script>

<Checks {form} step="account" />
{#if missing}
  <div class="missing" role="status">
    <span>{t('wizard.account.noAccount', { harness: engineName(engine) })}</span>
    <button class="btn" onclick={() => (adding = true)}>{t('accounts.tab.add')}</button>
  </div>
{/if}
{#if adding}<AccountModal {engine} onclose={() => (adding = false)} />{/if}
<div class="box">
  <Row label={t('accounts.project.label')} desc={t('accounts.project.desc')}>
    <Chips label={t('accounts.project.label')} options={ACCOUNTS} bind:value={form.config.account} />
  </Row>
  <Row label={t('settings.project.commit')} desc={t('settings.project.commitDesc')}>
    <Chips label={t('settings.project.commit')} options={COMMIT_MODES} bind:value={form.config.commitMode} />
  </Row>
  <Row label={t('settings.project.remote')} desc={all ? t('wizard.account.remoteAll') : t('settings.project.remoteDesc')}>
    <Switch
      label={t('settings.project.remote')}
      disabled={all}
      bind:on={() => all || form.config.remoteControl, (v) => (form.config.remoteControl = v)}
    />
  </Row>
</div>

<style>
  .missing {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--wait);
  }
  .box {
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--bg);
  }
</style>
