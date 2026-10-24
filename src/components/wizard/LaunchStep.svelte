<script lang="ts">
  import { t } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import { tip } from '../../lib/tip';
  import type { WizardForm } from '../../lib/wizard-form.svelte';
  import Icon from '../Icon.svelte';

  // « Lancement »: the commands that launch the project, each in its own terminal (« Remplir automatiquement »: Claude
  // reads the folder). A folder of a command that is not in the project is said.
  let { form }: { form: WizardForm } = $props();

  const missing = (cwd: string) => !!cwd.trim() && !!form.setup?.missingDirs.includes(cwd.trim().replace(/\\/g, '/').replace(/\/+$/, ''));

  function add() {
    form.config.runCommands.push({ id: crypto.randomUUID(), name: '', command: '', shell: app.shells[0]?.id ?? 'pwsh', cwd: '' });
  }

  /** How many commands Claude has just proposed: said above them, to read before creating. */
  let filled = $state(0);
  async function fill() {
    const before = form.config.runCommands;
    await form.fill('launch');
    if (form.config.runCommands !== before) filled = form.config.runCommands.length;
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

{#if filled}
  <p class="w-notice"><Icon name="sparkle" /><span>{t('wizard.filled', { count: filled })}</span></p>
{/if}
{#if form.config.runCommands.length}
  <div class="cmds">
    <div class="cmd head" aria-hidden="true">
      <span>{t('common.name')}</span><span>{t('common.command')}</span><span>{t('settings.fields.subfolder')}</span><span
        >{t('settings.fields.shell')}</span
      >
    </div>
    {#each form.config.runCommands as c, i (c.id)}
      <fieldset class="cmd">
        <legend class="sr">{t('settings.project.commandN', { n: i + 1 })}</legend>
        <input class="field" aria-label={t('common.name')} bind:value={c.name} placeholder={t('settings.project.namePlaceholder')} />
        <input
          class="field mono"
          aria-label={t('common.command')}
          spellcheck="false"
          bind:value={c.command}
          placeholder={t('settings.project.commandPlaceholder')}
        />
        <input
          class="field mono"
          aria-label={`${t('settings.fields.subfolder')} ${t('settings.project.subfolderHint')}`}
          aria-invalid={missing(c.cwd)}
          spellcheck="false"
          bind:value={c.cwd}
          placeholder={t('settings.project.subfolderPlaceholder')}
        />
        <select class="field" aria-label={t('settings.fields.shell')} bind:value={c.shell}>
          {#each app.shells as sh (sh.id)}<option value={sh.id}>{sh.label}</option>{/each}
          {#if !app.shells.some((sh) => sh.id === c.shell)}<option value={c.shell}
              >{t('settings.fields.shellNotFound', { name: c.shell })}</option
            >{/if}
        </select>
        <button
          class="icon-btn"
          use:tip={t('common.delete')}
          aria-label={t('common.delete')}
          onclick={() => form.config.runCommands.splice(i, 1)}><Icon name="close" size={14} /></button
        >
        {#if missing(c.cwd)}<p class="warn">{t('wizard.copy.dirMissing', { dir: c.cwd.trim() })}</p>{/if}
      </fieldset>
    {/each}
  </div>
{:else}
  <p class="empty">{t('wizard.launch.none')}</p>
{/if}
<div class="acts">
  <button class="btn" onclick={add}><Icon name="plus" size={14} />{t('wizard.buttons.addCommand')}</button>
  <button class="btn" disabled={!!form.filling} use:tip={t('settings.project.fillLaunchDesc')} onclick={fill}
    ><Icon name="sparkle" size={14} />{form.filling === 'launch' ? t('wizard.buttons.filling') : t('wizard.buttons.fill')}</button
  >
</div>

<style>
  /* The commands in a table, a row each (the preview's `.cmd-row.launch-row`). */
  .cmds {
    display: grid;
    gap: 6px;
  }
  .cmd {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr) 120px 128px 28px;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }
  .cmd.head {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 550;
  }
  .cmd .field {
    width: 100%;
    min-width: 0;
    height: 30px;
  }
  .cmd .field.mono {
    font-size: 12px;
  }
  .field[aria-invalid='true'] {
    box-shadow: inset 0 0 0 1px var(--wait-line);
  }
  .warn {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--wait);
    font-size: 11.5px;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
