<script lang="ts">
  import { accountName, accountsOf, serves } from '../../lib/accounts';
  import { t } from '../../lib/i18n';
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
</script>

<Checks {form} step="account" />
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
  .box {
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--bg);
  }
</style>
