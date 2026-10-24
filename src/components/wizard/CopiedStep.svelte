<script lang="ts">
  import { t } from '../../lib/i18n';
  import { COPY_GROUPS, type CopyGroup } from '../../lib/wizard';
  import type { WizardForm } from '../../lib/wizard-form.svelte';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../../lib/icons';

  // « Réglages copiés »: the other project's settings by group, each to take or not, with what checking it in the new
  // folder found.
  let { form }: { form: WizardForm } = $props();

  const groups = $derived(
    COPY_GROUPS.map((g) => ({ id: g, items: form.items.filter((i) => i.group === g) })).filter((g) => g.items.length),
  );
  const on = (id: string) => form.checked.includes(id);
  /** A group's box: checked when all of it is taken, mixed when some is. */
  function groupState(g: CopyGroup): boolean | 'mixed' {
    const ids = form.items.filter((i) => i.group === g).map((i) => i.id);
    const n = ids.filter(on).length;
    return n === ids.length ? true : n ? 'mixed' : false;
  }
  /** What checking an item found, as an icon: there, missing, or replaced. */
  const NOTE_ICON: Record<string, IconName> = { ok: 'check-c', bad: 'close', warn: 'info' };
  function toggleGroup(g: CopyGroup) {
    const all = groupState(g) !== true;
    for (const i of form.items.filter((x) => x.group === g)) form.toggle(i.id, all);
  }
</script>

{#each groups as g (g.id)}
  {@const state = groupState(g.id)}
  <section class="set" aria-label={t(`wizard.copy.groups.${g.id}`)}>
    <label class="w-tick gh">
      <input
        type="checkbox"
        checked={state === true}
        indeterminate={state === 'mixed'}
        onchange={() => toggleGroup(g.id)}
        aria-label={t(`wizard.copy.groups.${g.id}`)}
      /><span class="tick-box" aria-hidden="true"><Icon name="check" size={12} /></span>
      <span class="gt">{t(`wizard.copy.groups.${g.id}`)}</span>
      <span class="c">{t('wizard.copy.count', { count: g.items.length })}</span>
    </label>
    {#each g.items as i (i.id)}
      <label class="w-tick it" class:off={!on(i.id)} data-item={i.id}>
        <input type="checkbox" checked={on(i.id)} onchange={(e) => form.toggle(i.id, e.currentTarget.checked)} aria-label={i.label} /><span
          class="tick-box"
          aria-hidden="true"><Icon name="check" size={12} /></span
        >
        <span class="k">{i.label}</span>
        <span class="v"
          ><span class="val mono">{i.value}</span>{#if i.note}<span class="note {i.status}"
              >{#if NOTE_ICON[i.status]}<Icon name={NOTE_ICON[i.status]} size={12} />{/if}{i.note}</span
            >{/if}</span
        >
      </label>
    {/each}
  </section>
{/each}
<p class="not">{t('wizard.copy.notCopied')}</p>

<style>
  /* A group of settings copied: its title and how many, then a row each (rules between them, as the summary's). */
  .set {
    display: grid;
    flex: none;
  }
  .gh {
    gap: 10px;
    padding: 0 0 8px;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    font-weight: 600;
  }
  .c {
    color: var(--dim);
    font-size: 11.5px;
    font-weight: 450;
  }
  .it {
    display: grid;
    grid-template-columns: 16px minmax(120px, 170px) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid rgba(var(--fg-rgb), 0.05);
    font-size: 12.5px;
  }
  .k {
    color: var(--muted);
  }
  .v {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    min-width: 0;
  }
  .val {
    color: var(--soft);
    font-size: 11.5px;
    overflow-wrap: anywhere;
  }
  .off .k,
  .off .val {
    color: var(--dim);
    text-decoration: line-through;
  }
  .note {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
  }
  .note :global(.icon) {
    align-self: center;
  }
  .note.ok {
    color: var(--add);
  }
  .note.warn {
    color: var(--wait);
  }
  .note.bad {
    color: var(--del);
  }
  .note.plain {
    color: var(--muted);
  }
  .not {
    margin: 0;
    color: var(--muted);
    font-size: 11.5px;
  }
</style>
