<script lang="ts">
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { revealHidden } from '../../lib/recipe';
  import { settingsForm } from '../../lib/settings.svelte';
  import { pendingGroups, sharedFile } from '../../lib/shared-file';
  import { app } from '../../lib/state.svelte';
  import type { Project } from '../../lib/types';
  import Group from './Group.svelte';
  import Row from './Row.svelte';

  // The project's .escouade.yml (ESC-146): what it set, what of it was left out, its commands waiting for the user's
  // approval, read here in full; and « Exporter vers .escouade.yml ».
  let { project }: { project: Project } = $props();

  const file = $derived(sharedFile(project));
  const groups = $derived(pendingGroups(project));
  let busy = $state(false);

  /** The project as the backend has it now: in the window, and in the draft unless the user changed it. */
  function took(p: Project | null | undefined) {
    if (!p) return false;
    app.replaceProject(p);
    settingsForm.refresh(p);
    return true;
  }

  async function trust() {
    const hash = file?.pending?.hash;
    if (!hash || busy) return;
    busy = true;
    if (took(await app.run(api.sharedTrust(project.id, hash)))) app.toast(t('settings.shared.trusted'));
    busy = false;
  }

  async function exportFile() {
    if (busy) return;
    busy = true;
    if (took(await app.run(api.sharedWrite(project.id)))) app.toast(t('settings.shared.exported'));
    busy = false;
  }
</script>

<Group title={t('settings.shared.title')} anchor="shared">
  <div class="state">
    {#if !file}
      <p>{t('settings.shared.none')}</p>
    {:else if file.error}
      <p class="error">
        {t('settings.shared.error', {
          text: file.error.line ? t('settings.shared.warningAt', { line: file.error.line, text: file.error.text }) : file.error.text,
        })}
      </p>
    {:else}
      <p>{t('settings.shared.read', { count: file.keys.length, version: file.version })}</p>
    {/if}
    {#if file?.warnings.length}
      <p class="sub">{t('settings.shared.warningsTitle')}</p>
      <ul class="warnings">
        {#each file.warnings as w, i (i)}
          <li>{w.line ? t('settings.shared.warningAt', { line: w.line, text: w.text }) : w.text}</li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if file?.pending}
    <div class="pending" role="region" aria-label={t('settings.shared.pendingTitle')}>
      <h4 class="section-label">{t('settings.shared.pendingTitle')}</h4>
      <p class="notice">{t('settings.shared.pendingDesc')}</p>
      {#each groups as g (g.kind)}
        <section class="part">
          <h5>{t(`settings.shared.keys.${g.kind}`)}</h5>
          {#if g.commands.length}
            <ol class="steps">
              {#each g.commands as c, i (i)}
                <li>
                  {#if c.name}<span class="name">{revealHidden(c.name)}</span>{/if}
                  <pre class="command mono">{revealHidden(c.command)}</pre>
                  {#if c.cwd || c.shell}
                    <dl class="facts">
                      {#if c.shell}<dt>{t('settings.fields.shell')}</dt>
                        <dd>{revealHidden(c.shell)}</dd>{/if}
                      {#if c.cwd}<dt>{t('common.folder')}</dt>
                        <dd class="mono">{revealHidden(c.cwd)}</dd>{/if}
                    </dl>
                  {/if}
                </li>
              {/each}
            </ol>
          {:else}
            <p class="none">{t('settings.project.noCommands')}</p>
          {/if}
        </section>
      {/each}
      <div class="actions">
        <button class="btn primary" disabled={busy} onclick={trust}>{t('settings.shared.trust')}</button>
      </div>
    </div>
  {/if}
  <Row label={t('settings.shared.export')} desc={t('settings.shared.exportDesc')} descId="shared-export-desc">
    <button class="btn" aria-describedby="shared-export-desc" disabled={busy} onclick={exportFile}>{t('settings.shared.export')}</button>
  </Row>
</Group>

<style>
  .state {
    padding: 12px 16px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--muted);
  }
  .state p {
    margin: 0;
  }
  .state .error {
    color: var(--del);
  }
  .sub {
    margin-top: 8px !important;
    color: var(--text);
    font-weight: 600;
  }
  .warnings {
    margin: 4px 0 0;
    padding-left: 18px;
    color: var(--wait);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .pending {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
  h4,
  h5 {
    margin: 0;
  }
  h5 {
    font-size: 12px;
    font-weight: 600;
  }
  .notice {
    margin: 0;
    padding: 8px 12px;
    border-left: 2px solid var(--wait);
    background: var(--wait-soft);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text);
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .steps li {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Read as the shell reads it: right-to-left letters must not reorder a « ; » or a « | ». */
  .name,
  .command,
  .facts dd {
    unicode-bidi: bidi-override;
    direction: ltr;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
  }
  /* The whole command, as written: never cut, however long. */
  .command {
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--elev);
    font-size: 11.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px 10px;
    font-size: 11.5px;
  }
  .facts dt {
    color: var(--dim);
  }
  .facts dd {
    margin: 0;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .none {
    margin: 0;
    font-size: 12px;
    color: var(--dim);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
