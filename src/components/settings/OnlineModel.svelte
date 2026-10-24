<script lang="ts">
  import { t } from '../../lib/i18n';
  import { modelIn, modelsOf, onlineVoice } from '../../lib/online-voice.svelte';
  import Row from './Row.svelte';

  // « Modèle » of a service on line (ESC-132): its list (its API's when it gives one, read with the key, else its
  // documentation's), the default first; kept by service in `models`. A model the service no longer offers falls back
  // on its default, and says so.
  let {
    service,
    purpose,
    models = $bindable(),
    desc,
  }: {
    service: { id: string; label: string };
    purpose: 'transcribe' | 'speak';
    models: Record<string, string>;
    desc: string;
  } = $props();

  const c = $derived(onlineVoice.catalogs[service.id]);
  const current = $derived(modelIn(c, purpose, models[service.id]));
  const options = $derived(modelsOf(c, purpose));
  const def = $derived(c ? (purpose === 'transcribe' ? c.defaultTranscribe : c.defaultSpeak) : '');
  const label = (id: string) => {
    const m = options.find((o) => o.id === id);
    const name = m ? `${m.label}${m.note ? ` · ${m.note}` : ''}` : id;
    return id === def ? `${name} (${t('voice.settings.modelDefault')})` : name;
  };
  const listedOn = $derived(c?.listed && c.listedAt ? new Date(c.listedAt * 1000).toLocaleDateString() : '');

  function pick(id: string) {
    // The default is no choice: a user who touches nothing keeps today's model.
    const next = { ...models };
    if (id === def) delete next[service.id];
    else next[service.id] = id;
    models = next;
  }
</script>

<Row label={t('voice.settings.onlineModel')} {desc}>
  <div class="model" data-online-model={purpose}>
    <div class="line">
      <select
        class="field input"
        aria-label={purpose === 'speak' ? t('voice.speech.modelLabel') : t('voice.settings.onlineModel')}
        value={current.id}
        disabled={!c}
        onchange={(e) => pick(e.currentTarget.value)}
      >
        {#each options as m (m.id)}
          <option value={m.id}>{label(m.id)}</option>
        {/each}
      </select>
      <button
        class="btn ghost small"
        disabled={onlineVoice.loading[service.id] || !onlineVoice.keys.includes(service.id)}
        onclick={() => onlineVoice.load(service.id, true)}
        >{onlineVoice.loading[service.id] ? t('voice.settings.refreshing') : t('voice.settings.refresh')}</button
      >
    </div>
    {#if current.gone}
      <p class="warn" data-model-gone>
        {t('voice.settings.modelGone', { service: service.label, model: current.gone, default: def })}
      </p>
    {/if}
    {#if c?.error}
      <p class="warn">{t('voice.settings.listFailed', { error: c.error })}</p>
    {/if}
    <p class="meta">
      {listedOn
        ? t('voice.settings.listedOn', { service: service.label, date: listedOn })
        : t('voice.settings.listedNot', { service: service.label })}
    </p>
  </div>
</Row>

<style>
  .model {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    width: 360px;
    max-width: 100%;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  .input {
    flex: 1;
    min-width: 0;
  }
  .small {
    height: 24px;
    padding: 0 8px;
    font-size: 11.5px;
    flex: none;
  }
  .meta,
  .warn {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    text-align: right;
    color: var(--muted);
  }
  .warn {
    color: var(--warn-ink);
  }
</style>
