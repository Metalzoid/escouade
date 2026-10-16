<script lang="ts">
  import { t } from '../../lib/i18n';
  import { COPY_GROUPS, type CopyGroup } from '../../lib/wizard';
  import type { WizardForm } from '../../lib/wizard-form.svelte';

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
  function toggleGroup(g: CopyGroup) {
    const all = groupState(g) !== true;
    for (const i of form.items.filter((x) => x.group === g)) form.toggle(i.id, all);
  }
</script>

{#each groups as g (g.id)}
  {@const state = groupState(g.id)}
  <section class="set" aria-label={t(`wizard.copy.groups.${g.id}`)}>
    <label class="gh">
      <input
        type="checkbox"
        checked={state === true}
        indeterminate={state === 'mixed'}
        onchange={() => toggleGroup(g.id)}
        aria-label={t(`wizard.copy.groups.${g.id}`)}
      />
      <span class="gt">{t(`wizard.copy.groups.${g.id}`)}</span>
      <span class="c">{t('wizard.copy.count', { count: g.items.length })}</span>
    </label>
    {#each g.items as i (i.id)}
      <label class="it" class:off={!on(i.id)} data-item={i.id}>
        <input type="checkbox" checked={on(i.id)} onchange={(e) => form.toggle(i.id, e.currentTarget.checked)} aria-label={i.label} />
        <span class="k">{i.label}</span>
        <span class="v"
          ><span class="val mono">{i.value}</span>{#if i.note}<span class="note {i.status}"
              >{i.status === 'ok' ? '✓' : i.status === 'bad' ? '✕' : i.status === 'warn' ? '⚠' : ''} {i.note}</span
            >{/if}</span
        >
      </label>
    {/each}
  </section>
{/each}
<p class="not">{t('wizard.copy.notCopied')}</p>

<style>
  .set {
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    overflow: hidden;
    flex: none;
  }
  .gh {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    background: var(--elev);
    font-weight: 700;
    font-size: 12.5px;
    cursor: pointer;
  }
  .c {
    color: var(--dim);
    font-weight: 400;
    font-size: 11.5px;
  }
  .it {
    display: grid;
    grid-template-columns: 16px minmax(120px, 170px) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 5px 12px;
    border-top: 1px solid var(--line);
    font-size: 12.5px;
    cursor: pointer;
  }
  input[type='checkbox'] {
    margin: 0;
    accent-color: var(--accent);
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
    font-size: 11.5px;
    overflow-wrap: anywhere;
  }
  .off .k,
  .off .val {
    color: var(--dim);
    text-decoration: line-through;
  }
  .note {
    font-size: 11.5px;
  }
  .note.ok {
    color: var(--ok);
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
    font-size: 11.5px;
    color: var(--dim);
  }
</style>
