<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { fDate } from '../../lib/format';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import { PROJECT_COLORS } from '../../lib/theme';
  import type { Start, StepId } from '../../lib/wizard';
  import { WizardForm } from '../../lib/wizard-form.svelte';
  import AccountStep from '../wizard/AccountStep.svelte';
  import Checks from '../wizard/Checks.svelte';
  import CopiedStep from '../wizard/CopiedStep.svelte';
  import IntegrationsStep from '../wizard/IntegrationsStep.svelte';
  import KanbanStep from '../wizard/KanbanStep.svelte';
  import LaunchStep from '../wizard/LaunchStep.svelte';
  import SummaryStep from '../wizard/SummaryStep.svelte';
  import WorktreesStep from '../wizard/WorktreesStep.svelte';
  import Modal from './Modal.svelte';

  // The new project's assistant, in steps: the folder, its name and color and where its settings start from, then its
  // worktrees, launch, Kanban, account and integrations, each to skip, and a summary that says what would keep the way
  // of working from working. Opened again on an existing project (Réglages › Projets), it sets that one up anew.
  const from = app.modal?.kind === 'newProject' ? app.modal : null;
  const existing = from?.projectId ? (app.projects.find((p) => p.id === from.projectId) ?? null) : null;
  const form = new WizardForm(existing ? $state.snapshot(existing) : null);
  // Opened by « Rouvrir » on a closed project, the window starts from its folder, and from that history of it.
  const startPath = existing ? existing.path : (from?.path?.trim() ?? '');
  /** The history asked for holds for the folder it was asked for: another path typed, it is forgotten. */
  const historyFor = (p: string) => (p === startPath ? from?.historyId : undefined);

  const used = new Set(app.projects.map((p) => p.color));
  form.path = startPath;
  let name = $state(existing?.name ?? '');
  let nameTouched = !!existing;
  const freeColor = PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[0];
  let color = $state(existing?.color ?? freeColor);
  let colorTouched = !!existing;
  /** The folder `info` was read for: until the one typed is, nothing is created or reopened with another's history. */
  let infoPath = $state('');
  /** « Partir d'un projet vierge »: the folder's history stays where it is, the project is a new one. */
  let fresh = $state(false);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Until the first look at the path: a folder the window opened on is read at once, a typed one after a pause. */
  let opening = true;

  $effect(() => {
    const p = form.path.trim();
    const now = opening;
    opening = false;
    clearTimeout(timer);
    if (!p) {
      form.info = null;
      form.setup = null;
      return;
    }
    const read = async () => {
      const i = await api.inspectFolder(p, historyFor(p)).catch(() => null);
      if (form.path.trim() !== p) return;
      // Another folder, another choice.
      if (i?.history?.id !== form.info?.history?.id) fresh = false;
      form.info = i;
      infoPath = p;
      if (i) prefill();
      // Its .escouade.yml, if it has one: the settings the project starts from.
      await form.readShared();
      // Another folder: what is copied by default is checked again in it.
      if (form.start === 'copy' && form.sourceId) form.chooseSource(form.sourceId);
      else await form.check();
    };
    if (now) void read();
    else timer = setTimeout(read, 200);
  });

  const info = $derived(form.info);
  const history = $derived(existing ? null : (info?.history ?? null));
  /** The folder gets its history back (same project, same agents and tickets): it is reopened, not created. */
  const restoring = $derived(!!history && !fresh);
  /** The folder typed is read, and is one: the steps may go on. */
  const ready = $derived((!!existing || (!!info?.exists && infoPath === form.path.trim())) && !form.copying);

  /** What the window starts from: the history's name, color and worktrees when it comes back, else the usual ones. Not what the user chose. */
  function prefill() {
    const h = restoring ? history : null;
    if (!nameTouched) name = h?.name ?? info?.name ?? name;
    if (!colorTouched) color = h?.color ?? freeColor;
  }

  const gitLine = $derived(
    !info
      ? { text: t('shell.newProject.git.choose'), color: 'var(--dim)' }
      : !info.exists
        ? { text: t('shell.newProject.git.missing'), color: 'var(--del)' }
        : info.isRepo
          ? {
              text: info.dirty
                ? t('shell.newProject.git.repoDirty', { branch: info.branch || '—', count: info.dirty })
                : t('shell.newProject.git.repoClean', { branch: info.branch || '—' }),
              color: 'var(--ok)',
            }
          : { text: t('shell.newProject.git.none'), color: 'var(--muted)' },
  );

  const STARTS = $derived<{ id: Start; label: string; desc: string }[]>(
    (existing ? (['current', 'copy', 'recommended', 'blank'] as const) : (['file', 'copy', 'recommended', 'blank'] as const))
      .filter((id) => (id !== 'copy' || form.sources.length) && (id !== 'file' || form.shared))
      .map((id) => ({ id, label: t(`wizard.start.${id}`), desc: id === 'file' ? fileDesc : t(`wizard.start.${id}Desc`) })),
  );

  /** What the folder's .escouade.yml sets, and whether its commands will wait for the user. */
  const fileDesc = $derived.by(() => {
    const file = form.shared?.shared?.file;
    if (!file) return '';
    const read = t('wizard.start.fileDesc', { count: file.keys.length });
    return file.pending ? `${read} ${t('wizard.start.filePending')}` : read;
  });

  const at = $derived(form.steps.indexOf(form.step));
  const last = $derived(form.step === 'summary');
  /** The steps « Passer » leaves as they are: not the start, the copy or the summary. */
  const skippable = $derived(!['start', 'copied', 'summary'].includes(form.step));

  async function browse() {
    const dir = await open({ directory: true, multiple: false, title: t('shell.newProject.folderTitle') });
    if (typeof dir === 'string') form.path = dir;
  }

  /** Shows the project made and closes the window, its first agent opened if asked for. */
  async function show(p: import('../../lib/types').Project, agent: string | null) {
    if (app.projects.some((x) => x.id === p.id)) app.replaceProject(p);
    else app.projects.push(p);
    app.selectProject(p.id);
    app.modal = null;
    if (!agent) return;
    const a = await app.run(api.createAgent(p.id, agent));
    if (a) {
      app.agents[a.id] = a;
      app.selectAgent(a.id);
    }
  }

  /**
   * « Créer » (`withSettings`: with what the steps set; else, « Créer sans l'assistant », as a project is made with
   * Escouade's defaults), « Rouvrir le projet » for a folder that gets its history back, « Enregistrer » for an
   * existing project.
   */
  async function create(withSettings: boolean) {
    if (!ready || busy) return;
    busy = true;
    try {
      if (existing) {
        const saved = await form.save({ ...$state.snapshot(existing), name: name.trim() || existing.name, color });
        if (saved) {
          app.replaceProject(saved);
          app.modal = null;
        }
        return;
      }
      const path = form.path.trim();
      const historyId = historyFor(path);
      const agent = !restoring && form.firstAgent ? form.model : null;
      const p = await app.run(
        api.createProject({
          path,
          name: name.trim(),
          color,
          worktreePerAgent: restoring ? !!history?.worktreePerAgent : withSettings && form.config.worktreePerAgent,
          // The first agent is made once the settings are saved: its worktree is set up as they say.
          firstAgent: restoring || withSettings ? null : agent,
          restore: restoring,
          // Nothing sent for a folder that was not asked for with a history.
          ...(historyId ? { historyId } : {}),
        }),
      );
      if (!p) return;
      if (restoring || !withSettings) return void show(p, null);
      // Made: shown even if its settings were refused (said by a toast), to be set in Réglages › Projets.
      const saved = await form.save(p);
      await show(saved ?? p, agent);
    } finally {
      busy = false;
    }
  }

  function goTo(step: StepId) {
    if (ready && !restoring) form.go(step);
  }
</script>

<Modal
  title={existing ? t('wizard.titleEdit', { name: existing.name }) : t('wizard.title')}
  width={840}
  tall
  onclose={() => (app.modal = null)}
>
  <div class="wizard">
    <nav class="rail" aria-label={t('wizard.stepsLabel')}>
      <ol>
        {#each form.steps as s, i (s)}
          <li>
            <button
              class="st"
              class:on={form.step === s}
              class:done={form.done.includes(s)}
              class:skip={form.skipped.includes(s)}
              aria-current={form.step === s ? 'step' : undefined}
              disabled={!ready || restoring}
              onclick={() => goTo(s)}
            >
              <span class="n"
                >{form.done.includes(s) && form.step !== s ? '✓' : form.skipped.includes(s) && form.step !== s ? '–' : i + 1}</span
              >
              <span class="l">{t(`wizard.steps.${s}`)}</span>
              {#if form.skipped.includes(s) && form.step !== s}<span class="tag">{t('wizard.skippedTag')}</span>
              {:else if s === 'integrations'}<span class="tag">{t('wizard.optionalTag')}</span>{/if}
            </button>
          </li>
        {/each}
      </ol>
    </nav>
    <div class="page" data-step={form.step}>
      <p class="of">{t('wizard.stepOf', { n: at + 1, count: form.steps.length })}</p>
      {#if form.step === 'start'}
        {#if !existing}
          <div class="grp">
            <span class="lab">{t('common.folder')}</span>
            <div class="row">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="field mono"
                style="flex:1;font-size:12.5px"
                bind:value={form.path}
                placeholder={t('shell.newProject.pathPlaceholder')}
                autofocus
              />
              <button class="btn" style="height:36px" onclick={browse}>{t('shell.newProject.browse')}</button>
            </div>
            <span class="git mono" style:color={gitLine.color}><span class="d" style:background={gitLine.color}></span>{gitLine.text}</span>
          </div>
        {/if}
        {#if history}
          <div class="history">
            <p class="found">
              {t('shell.newProject.history.found', {
                agents: t('common.count.agents', { count: history.agents }),
                tickets: t('common.count.tickets', { count: history.tickets }),
                date: fDate(history.lastActivity),
              })}
            </p>
            <div class="toggle">
              <div class="tx">
                <span class="tt">{t('shell.newProject.history.fresh')}</span>
                <span class="ts">{t('shell.newProject.history.freshDesc')}</span>
              </div>
              <button
                class="switch"
                role="switch"
                aria-checked={fresh}
                class:on={fresh}
                aria-label={t('shell.newProject.history.fresh')}
                onclick={() => {
                  fresh = !fresh;
                  prefill();
                }}
              ></button>
            </div>
          </div>
        {/if}
        <div class="two">
          <div class="grp">
            <span class="lab">{t('common.name')}</span>
            <input class="field" style="font-weight:600;font-size:13.5px" bind:value={name} oninput={() => (nameTouched = true)} />
          </div>
          <div class="grp">
            <span class="lab">{t('shell.newProject.tabPreview')}</span>
            <div class="preview" style:border-bottom-color={color}>
              <span class="sw" style:background={color}></span>{name || t('shell.newProject.untitled')}
            </div>
          </div>
        </div>
        <div class="grp">
          <span class="lab">{t('common.color')}</span>
          <div class="colors">
            {#each PROJECT_COLORS as c, i (c)}
              <button
                class="swatch"
                aria-label={t('shell.newProject.colorN', { n: i + 1 })}
                aria-pressed={color === c}
                style:background={c}
                style:box-shadow={color === c ? '0 0 0 2px var(--panel), 0 0 0 4px var(--text)' : 'none'}
                onclick={() => {
                  color = c;
                  colorTouched = true;
                }}
              ></button>
            {/each}
          </div>
        </div>
        {#if !restoring}
          <Checks {form} step="start" />
          <div class="grp" role="radiogroup" aria-label={t('wizard.start.label')}>
            <span class="lab">{t('wizard.start.label')}</span>
            {#each STARTS as s (s.id)}
              <div class="card" class:on={form.start === s.id}>
                <button class="pick" role="radio" aria-checked={form.start === s.id} onclick={() => form.chooseStart(s.id)}>
                  <span class="radio"></span>
                  <span class="ct">{s.label}</span>
                  <span class="cd">{s.desc}</span>
                </button>
                {#if s.id === 'copy' && form.start === 'copy'}
                  <select
                    class="field source"
                    aria-label={t('wizard.start.copyFrom')}
                    value={form.sourceId}
                    onchange={(e) => form.chooseSource(e.currentTarget.value)}
                  >
                    {#each form.sources as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
                  </select>
                {/if}
              </div>
            {/each}
            {#if form.privateLeftOut}
              <p class="cd private">{t('wizard.start.privateLeftOut', { count: form.privateLeftOut })}</p>
            {/if}
          </div>
        {/if}
      {:else}
        <h2 class="h2">
          {t(`wizard.steps.${form.step}`)}{#if form.step === 'copied' && form.source}<span class="from" style:color={form.source.color}
              >{` · ${form.source.name}`}</span
            >{/if}
        </h2>
        {#if form.step === 'copied'}
          <p class="lead">{t('wizard.leads.copied', { name: name.trim() || t('shell.newProject.untitled') })}</p>
          <CopiedStep {form} />
        {:else}
          <p class="lead">{t(`wizard.leads.${form.step}`)}</p>
          {#if form.step === 'worktrees'}<WorktreesStep {form} />
          {:else if form.step === 'launch'}<LaunchStep {form} />
          {:else if form.step === 'kanban'}<KanbanStep {form} />
          {:else if form.step === 'account'}<AccountStep {form} />
          {:else if form.step === 'integrations'}<IntegrationsStep {form} />
          {:else}<SummaryStep {form} />{/if}
        {/if}
      {/if}
    </div>
  </div>
  {#snippet footer()}
    {#if !existing && !restoring}
      <button class="btn link" disabled={!ready || busy} onclick={() => create(false)}>{t('wizard.buttons.withoutWizard')}</button>
    {/if}
    <span class="sp"></span>
    {#if at > 0}
      <button class="btn ghost" onclick={() => form.back()}>{t('wizard.buttons.back')}</button>
    {:else}
      <button class="btn ghost" onclick={() => (app.modal = null)}>{t('common.cancel')}</button>
    {/if}
    {#if restoring}
      <button class="btn primary" style:background={color} disabled={!ready || busy} onclick={() => create(false)}>
        {busy ? t('shell.newProject.history.reopening') : t('shell.newProject.history.reopen')}
      </button>
    {:else if last}
      <button class="btn primary" style:background={color} disabled={!ready || busy} onclick={() => create(true)}>
        {#if existing}{busy ? t('wizard.buttons.saving') : t('wizard.buttons.save')}
        {:else}{busy ? t('wizard.buttons.creating') : t('wizard.buttons.create')}{/if}
      </button>
    {:else}
      {#if skippable}<button class="btn" onclick={() => form.next(true)}>{t('wizard.buttons.skip')}</button>{/if}
      <button class="btn primary" style:background={color} disabled={!ready} onclick={() => form.next()}>{t('wizard.buttons.next')}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .wizard {
    display: flex;
    gap: 22px;
    min-height: 100%;
  }
  .rail {
    width: 178px;
    flex: none;
    padding-right: 14px;
    border-right: 1px solid var(--line);
  }
  .rail ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 0;
  }
  .st {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .st:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .st:hover:not(:disabled) {
    background: var(--elev);
  }
  .st.on {
    background: var(--elev);
    color: var(--text);
    opacity: 1;
  }
  .n {
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--line2);
    display: grid;
    place-items: center;
    font: 10.5px var(--mono);
    color: var(--dim);
  }
  .st.done .n {
    border-color: transparent;
    background: color-mix(in oklch, var(--ok) 22%, transparent);
    color: var(--ok);
  }
  .st.on .n {
    border-color: transparent;
    background: var(--accent);
    color: var(--accent-ink);
  }
  .st.skip:not(.on) {
    color: var(--dim);
  }
  .l {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 10.5px;
    font-weight: 400;
    color: var(--dim);
  }
  .page {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .of {
    margin: 0 0 -8px;
    font-size: 11px;
    color: var(--dim);
  }
  .h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .from {
    white-space: pre;
  }
  .lead {
    margin: -8px 0 0;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .grp {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .lab {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .git {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
  }
  .d {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--line2);
    border-left: 2px solid var(--accent);
    border-radius: var(--r-sm);
    background: var(--elev);
  }
  .found {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: end;
  }
  .preview {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 14px;
    border: 1px solid var(--line2);
    border-bottom: 2px solid;
    border-radius: var(--r-sm);
    background: var(--bg);
    font-weight: 600;
    white-space: nowrap;
    max-width: 220px;
    overflow: hidden;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .tx {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tt {
    font-size: 13.5px;
    font-weight: 600;
  }
  .ts {
    font-size: 12px;
    color: var(--muted);
    text-wrap: pretty;
  }
  .card {
    border: 1px solid var(--line2);
    border-radius: 9px;
    background: var(--bg);
  }
  .card.on {
    border-color: var(--accent);
    background: color-mix(in oklch, var(--accent) 7%, var(--bg));
  }
  .pick {
    width: 100%;
    display: grid;
    grid-template-columns: 16px 1fr;
    column-gap: 12px;
    row-gap: 3px;
    padding: 11px 14px;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .radio {
    grid-row: span 2;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border-radius: 50%;
    border: 1.5px solid var(--line2);
  }
  .card.on .radio {
    border: 5px solid var(--accent);
  }
  .ct {
    font-weight: 700;
    font-size: 13px;
  }
  .cd {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .private {
    margin: 0;
  }
  .source {
    margin: 0 14px 12px 42px;
    height: 30px;
    max-width: 260px;
    font-size: 12.5px;
  }
  .sp {
    flex: 1;
  }
  .btn.link {
    border: none;
    background: none;
    color: var(--muted);
    padding: 0 6px;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--line2);
  }
</style>
