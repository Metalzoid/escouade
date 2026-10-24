<script lang="ts">
  import { onMount } from 'svelte';
  import { conversation, type ConvPhase } from '../lib/conversation.svelte';
  import { onlineService } from '../lib/dictation';
  import { t } from '../lib/i18n';
  import { keyLabel } from '../lib/platform';
  import { draftIfAny } from '../lib/question-answers.svelte';
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tip';
  import EngineMark from './EngineMark.svelte';
  import Icon from './Icon.svelte';

  // The voice conversation over the whole window (ESC-97, « A · Orbe » chosen on preview, design/voice-conversation):
  // an orb in the middle, in the project's colour, that swells with the sound (the agent's voice as played while it
  // speaks, the microphone while it listens) and breathes while Whisper transcribes and the agent works; captions at
  // the bottom, one or two lines, who speaks named soberly (2.0 design). Escape or « Arrêter » ends the conversation. The animation
  // runs only while this panel is there (requestAnimationFrame, stopped when it goes).
  const agent = $derived(conversation.agentId ? app.agents[conversation.agentId] : undefined);
  const project = $derived(agent ? app.projects.find((p) => p.id === agent.projectId) : undefined);
  const phase = $derived(conversation.phase);
  const name = $derived(agent?.name ?? '');
  // « Transcription : En ligne »: the service of the dictation hears each sentence (ESC-134).
  const said = $derived(
    phase === 'transcribing' && app.settings.voice?.transcription === 'online'
      ? t('voice.panel.transcribingOnline', { service: onlineService(app.settings.voice.onlineService).label })
      : t(`voice.conversation.phase.${phase}` as 'voice.conversation.phase.working', { name }),
  );
  const subtitle = $derived(conversation.subtitle);
  /** The end of what is being said (ESC-136): its last words, as two lines hold them. */
  function tail(text: string, max = 110): string {
    if (text.length <= max) return text;
    const cut = text.slice(-max);
    const space = cut.indexOf(' ');
    return '…' + (space > 0 && space < 20 ? cut.slice(space) : cut);
  }
  // The question asked aloud (ESC-131): its choices show under the orb, the voice does not read them; what was
  // understood is lit a moment before the next question.
  const ask = $derived(conversation.ask);
  const understood = $derived(conversation.understood);
  const ticked = $derived(ask ? (draftIfAny(ask.itemId)?.picks[ask.question] ?? []) : []);

  let orb = $state<HTMLDivElement>();

  /** What the orb follows now: the voice played while the agent speaks, the microphone while it listens. */
  function target(): number {
    const p = conversation.phase;
    if (p === 'speaking' || p === 'question') return Math.max(conversation.played, p === 'question' ? conversation.level * 0.6 : 0);
    if (p === 'listening' || p === 'hearing') return conversation.level;
    return 0;
  }

  const thinking = (p: ConvPhase) => p === 'transcribing' || p === 'working' || p === 'starting';

  // The orb swells with the sound, quickly up and slower down: a voice, not a flicker. Still with prefers-reduced-motion.
  onMount(() => {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let level = 0;
    function draw() {
      const goal = still ? 0 : target();
      level += (goal - level) * (goal > level ? 0.45 : 0.18);
      orb?.style.setProperty('--lvl', level.toFixed(3));
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });

  // Escape ends it, before anything else of the window takes the key; while a question is asked, the key of a
  // choice's rank chooses it, Enter confirms the choices ticked of a question of several.
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      conversation.stop();
      return;
    }
    if (!ask || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
    if (n && n <= ask.options.length) {
      e.preventDefault();
      e.stopPropagation();
      conversation.choose(n - 1);
    } else if (e.key === 'Enter' && ask.multi) {
      e.preventDefault();
      e.stopPropagation();
      conversation.validate();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div
  class="overlay"
  class:asking={!!ask}
  class:thinking={thinking(phase)}
  role="dialog"
  aria-modal="true"
  aria-label={t('voice.conversation.overlay.label', { name })}
  data-conversation-overlay
  data-conversation-phase={phase}
>
  <div class="top">
    <Icon name="wave" size={14} />
    <b class="who">{name}</b>
    {#if project}<span class="muted">· {project.name}</span>{/if}
    <span class="muted">· {t('voice.conversation.overlay.context')}</span>
    <EngineMark engine={agent?.engine} />
    <span class="quit"><kbd>{keyLabel('Esc')}</kbd> {t('voice.conversation.overlay.quit')}</span>
  </div>
  <div class="mid">
    <!-- The orb, in the project's colour: it swells with the sound (the agent's voice as played, the microphone while it
         listens), and breathes while Whisper transcribes and the agent works. -->
    <div class="orb" bind:this={orb} aria-hidden="true"></div>
    <div class="state" role="status" aria-live="polite">
      {#if thinking(phase) || phase === 'speaking' || phase === 'question'}<span class="dots3" aria-hidden="true"
          ><i></i><i></i><i></i></span
        >{/if}
      {said}
    </div>
  </div>
  <div class="caps">
    <div class="subs" aria-live="polite">
      {#if subtitle}
        <!-- Written as it is said (ESC-136): one subtitle, its text growing, its end shown. -->
        {#key subtitle.live ? 'live' : subtitle}
          <div class="sub" class:user={subtitle.who === 'user'} data-subtitle={subtitle.who} data-live={subtitle.live ? '' : undefined}>
            <span class="speaker">{subtitle.who === 'user' ? t('voice.conversation.overlay.you') : name}</span>
            <p class="line">{subtitle.live ? tail(subtitle.text) : subtitle.text}</p>
          </div>
        {/key}
      {/if}
    </div>
    {#if ask}
      <section class="ask" aria-label={t('voice.conversation.overlay.choices')} data-conversation-ask={ask.index}>
        <div class="meta">
          {#if ask.total > 1}<span data-step>{t('voice.conversation.overlay.step', { n: ask.index + 1, total: ask.total })}</span>{/if}
          {#if ask.multi}<span>{t('voice.conversation.overlay.several')}</span>{/if}
        </div>
        <p class="question">{ask.question}</p>
        {#if ask.options.length}
          <ol class="choices">
            {#each ask.options as o, i (i)}
              {@const on = ticked.includes(o.label)}
              <li>
                <button
                  class="choice"
                  class:on
                  class:lit={!!understood?.picks.includes(o.label)}
                  aria-pressed={ask.multi ? on : undefined}
                  aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                  use:tip={o.description}
                  onclick={() => conversation.choose(i)}
                >
                  <kbd class="rank" aria-hidden="true">{i + 1}</kbd>
                  <span class="label">{o.label}</span>
                  {#if o.description}<span class="desc">{o.description}</span>{/if}
                </button>
              </li>
            {/each}
          </ol>
        {/if}
        {#if understood?.text}
          <p class="yours" data-understood>{t('voice.conversation.overlay.yourAnswer', { text: understood.text })}</p>
        {:else if conversation.missed}
          <p class="missed" role="alert">{t('voice.conversation.overlay.missed')}</p>
        {:else if ask.free}
          <p class="other">{t('voice.conversation.overlay.other')}</p>
        {/if}
        {#if ask.multi}
          <button class="btn primary validate" onclick={() => conversation.validate()}>
            {t('voice.conversation.overlay.validate')}<kbd aria-hidden="true"><Icon name="enter" size={12} /></kbd>
          </button>
        {/if}
      </section>
    {/if}
  </div>
  <div class="bar">
    {#if phase === 'paused'}
      <button class="btn" onclick={() => conversation.resume()}><Icon name="play" size={14} />{t('voice.conversation.resume')}</button>
    {/if}
    <button class="btn danger stop" onclick={() => conversation.stop()}><Icon name="stop" size={14} />{t('voice.conversation.stop')}</button
    >
    <span class="hint">{t('voice.conversation.hint')}</span>
  </div>
</div>

<style>
  /* The whole window, in the project's colour (direction A of the 2.0 design): the orb, its state, the captions. */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    background:
      radial-gradient(700px 520px at 50% 40%, color-mix(in oklch, var(--p) 16%, transparent), transparent 70%),
      color-mix(in oklch, var(--p) 6%, var(--vo-base));
    color: var(--text);
    animation: in 0.3s ease-out;
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 22px;
    color: var(--muted);
    font-size: 13px;
  }
  .who {
    color: var(--text);
    font-weight: 600;
  }
  .quit {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .mid {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 26px;
    min-height: 0;
  }
  .orb {
    --lvl: 0;
    position: relative;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 38% 32%, color-mix(in oklch, var(--p) 55%, white) 0, transparent 46%),
      radial-gradient(circle at 60% 70%, color-mix(in oklch, var(--p) 80%, black), transparent 60%),
      color-mix(in oklch, var(--p) 70%, var(--orb-base));
    box-shadow:
      0 0 0 1px rgba(var(--fg-rgb), 0.08),
      0 0 calc(80px + var(--lvl) * 60px) 10px color-mix(in oklch, var(--p) 30%, transparent);
    transform: scale(calc(1 + var(--lvl) * 0.12));
  }
  .orb::after {
    content: '';
    position: absolute;
    inset: -18px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--p) 40%, transparent);
  }
  .thinking .orb::after {
    animation: breathe 3.2s var(--ease) infinite;
  }
  @keyframes breathe {
    50% {
      transform: scale(1.04);
    }
  }
  /* A question asked: the orb smaller, its choices under the captions. */
  .asking .orb {
    width: 120px;
    height: 120px;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--soft);
    font-size: 15px;
    font-weight: 550;
  }
  .dots3 {
    display: inline-flex;
    gap: 3px;
  }
  .dots3 i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--run);
    animation: ccBlink 1.2s infinite;
  }
  .dots3 i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots3 i:nth-child(3) {
    animation-delay: 0.3s;
  }
  .caps {
    display: grid;
    gap: 10px;
    width: min(720px, 100% - 64px);
    margin: 0 auto 18px;
    font-size: 15px;
    line-height: 1.55;
  }
  .sub {
    display: flex;
    align-items: baseline;
    gap: 8px;
    animation: in 0.2s ease-out;
  }
  .speaker {
    flex: none;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  /* One or two lines at a time: a longer sentence keeps its end, the part being heard. */
  .line {
    margin: 0;
    color: var(--text);
    text-wrap: pretty;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub.user .line {
    color: var(--muted);
  }
  .ask {
    display: grid;
    justify-items: center;
    gap: 10px;
    max-height: 40vh;
    overflow-y: auto;
    animation: in 0.2s ease-out;
  }
  .meta {
    display: flex;
    gap: 10px;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 550;
  }
  .meta span + span::before {
    content: '·';
    margin-right: 10px;
    color: var(--sep);
  }
  .question {
    margin: 0;
    font-size: 16px;
    text-align: center;
    text-wrap: balance;
  }
  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .choice {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 12px 0 6px;
    border: none;
    border-radius: 8px;
    background: rgba(var(--fg-rgb), 0.04);
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }
  .choice:hover {
    background: rgba(var(--fg-rgb), 0.08);
    box-shadow: inset 0 0 0 1px var(--line-3);
  }
  .choice:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: 2px;
  }
  .label {
    font-weight: 550;
  }
  .desc {
    max-width: 220px;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Ticked, or understood a moment before the next question: in the project's colour. */
  .choice.on,
  .choice.lit {
    background: color-mix(in oklch, var(--p) 16%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--p) 60%, transparent);
  }
  .choice.on .rank,
  .choice.lit .rank {
    border-color: transparent;
    background: var(--p-ink);
    color: var(--on-primary);
  }
  .other,
  .yours,
  .missed {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  .yours {
    padding: 6px 12px;
    border-radius: 9px;
    background: color-mix(in oklch, var(--p) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--p) 50%, transparent);
    color: var(--text);
  }
  .missed {
    color: var(--del);
  }
  .bar {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 0 22px 30px;
  }
  .bar .btn {
    height: 36px;
    padding: 0 14px;
  }
  .stop :global(.icon) {
    color: var(--del);
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .sub,
    .ask {
      animation: none;
    }
    .thinking .orb::after,
    .dots3 i {
      animation: none;
    }
  }
</style>
