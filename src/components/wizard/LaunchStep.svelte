<script lang="ts">
  import { t } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import { tip } from '../../lib/tip';
  import type { WizardForm } from '../../lib/wizard-form.svelte';
  import Row from '../settings/Row.svelte';

  // « Lancement »: the commands that launch the project, each in its own terminal (« Remplir automatiquement »: Claude
  // reads the folder). A folder of a command that is not in the project is said.
  let { form }: { form: WizardForm } = $props();

  const missing = (cwd: string) => !!cwd.trim() && !!form.setup?.missingDirs.includes(cwd.trim().replace(/\\/g, '/').replace(/\/+$/, ''));

  function add() {
    form.config.runCommands.push({ id: crypto.randomUUID(), name: '', command: '', shell: app.shells[0]?.id ?? 'pwsh', cwd: '' });
  }

  // A folder typed is looked for after a pause.
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void form.config.runCommands.map((c) => c.cwd).join('\n');
    clearTimeout(timer);
    timer = setTimeout(() => void form.check(), 300);
    return () => clearTimeout(timer);
  });
</script>

<div class="box">
  <Row label={t('settings.project.fill')} desc={t('settings.project.fillLaunchDesc')}>
    <button class="btn" disabled={!!form.filling} onclick={() => form.fill('launch')}>
      {form.filling === 'launch' ? t('wizard.buttons.filling') : t('wizard.buttons.fill')}
    </button>
  </Row>
</div>
{#each form.config.runCommands as c, i (c.id)}
  <fieldset class="cmd">
    <legend class="sr">{t('settings.project.commandN', { n: i + 1 })}</legend>
    <div class="line">
      <label class="f grow"
        ><span>{t('common.name')}</span><input
          class="field"
          bind:value={c.name}
          placeholder={t('settings.project.namePlaceholder')}
        /></label
      >
      <label class="f"
        ><span>{t('settings.fields.shell')}</span>
        <select class="field" bind:value={c.shell}>
          {#each app.shells as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
          {#if !app.shells.some((s) => s.id === c.shell)}<option value={c.shell}
              >{t('settings.fields.shellNotFound', { name: c.shell })}</option
            >{/if}
        </select>
      </label>
      <button class="del" use:tip={t('common.delete')} aria-label={t('common.delete')} onclick={() => form.config.runCommands.splice(i, 1)}
        >×</button
      >
    </div>
    <label class="f"
      ><span>{t('common.command')}</span><input
        class="field mono"
        bind:value={c.command}
        placeholder={t('settings.project.commandPlaceholder')}
      /></label
    >
    <label class="f"
      ><span>{t('settings.fields.subfolder')} <em>{t('settings.project.subfolderHint')}</em></span><input
        class="field mono"
        aria-invalid={missing(c.cwd)}
        bind:value={c.cwd}
        placeholder={t('settings.project.subfolderPlaceholder')}
      /></label
    >
    {#if missing(c.cwd)}<p class="warn">⚠ {t('wizard.copy.dirMissing', { dir: c.cwd.trim() })}</p>{/if}
  </fieldset>
{:else}
  <p class="empty">{t('wizard.launch.none')}</p>
{/each}
<div><button class="btn" onclick={add}>{t('wizard.buttons.addCommand')}</button></div>

<style>
  .box {
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--bg);
  }
  .cmd {
    margin: 0;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11.5px;
    color: var(--muted);
    font-weight: 600;
    min-width: 0;
  }
  .f em {
    font-style: normal;
    font-weight: 400;
    color: var(--dim);
  }
  .grow {
    flex: 1;
  }
  .f .field {
    height: 30px;
    font-size: 12.5px;
    background: var(--panel);
  }
  .field[aria-invalid='true'] {
    border-color: var(--wait);
  }
  .del {
    width: 30px;
    height: 30px;
    border: 1px solid var(--line2);
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 15px;
  }
  .warn {
    margin: 0;
    font-size: 11.5px;
    color: var(--wait);
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
