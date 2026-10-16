<script lang="ts">
  import { t } from '../lib/i18n';
  import { api } from '../lib/ipc';
  import { fDur, fInt, fTok } from '../lib/format';
  import {
    bgDuration,
    bgRow,
    cleanOutput,
    exitCode,
    hasOutput,
    isRunning,
    kindLabel,
    ownerOf,
    rowTitle,
    statusLabel,
  } from '../lib/bgtasks';
  import { menu } from '../lib/menu.svelte';
  import { app } from '../lib/state.svelte';
  import { tip } from '../lib/tip';
  import type { Agent, TaskOutput } from '../lib/types';

  // The view of a task Claude Code runs in the background for `agent` (a command, a monitor, a workflow, a remote agent,
  // a teammate), in place of the agent's conversation (ESC-14): `task` is Claude Code's id of the task. Its head says what
  // it is and how it is going, and « Arrêter » stops it (Claude Code's `stop_task`); the end of what a command or a monitor
  // writes is read from the backend as it comes, and only read. The facts are the plan's (`agent.plan`), which the backend
  // keeps current: a task that is no longer in it (a new session) closes the view (state.svelte.ts).
  let { agent, task }: { agent: Agent; task: string } = $props();

  /** A command longer than that is folded to its first lines. */
  const LONG_COMMAND = 360;
  const LONG_LINES = 6;
  /** How often the output is read while the task runs. */
  const POLL_MS = 1_500;
  /** Within that many pixels of the end, the log is read at its end. */
  const AT_END = 24;

  const plan = $derived(agent.plan);
  const row = $derived(bgRow(plan, task));
  const title = $derived(row ? rowTitle(row) : task);
  const running = $derived(!!row && isRunning(row));
  /** In the Claude Code view, the task is acted on in Claude Code's own interface. */
  const inTerminal = $derived(agent.terminal);
  const stoppable = $derived(running && !inTerminal);
  const duration = $derived(row ? bgDuration(row, app.now) : null);
  const code = $derived(row && !running ? exitCode(row) : null);
  const owner = $derived(row ? ownerOf(plan, row) : undefined);
  /** A command and a monitor write to an output that is followed; the other kinds write to none of their own. */
  const followed = $derived(!!row && hasOutput(row.kind));
  const command = $derived(row?.command?.trim() ? row.command.trim() : undefined);
  const description = $derived(!command && row?.title.trim() ? row.title.trim() : undefined);
  const longCommand = $derived(!!command && (command.length > LONG_COMMAND || command.split('\n').length > LONG_LINES));
  /** What Claude Code said of it once it ended; for a task stopped it is only its description, which is said already. */
  const summary = $derived(
    row && !running && row.summary?.trim() && row.summary.trim() !== row.title.trim() ? row.summary.trim() : undefined,
  );

  let commandOpen = $state(false);
  let stopping = $state(false);
  // The log follows what comes while it is read at its end, not once the reader went up in it.
  let log = $state<HTMLPreElement>();
  let stick = $state(true);

  async function stop() {
    if (!row || !stoppable || stopping) return;
    stopping = true;
    await app.run(api.stopBgTask(agent.id, row.id));
    stopping = false;
  }

  // Its output: the end of it (8 KiB at most while the task runs, 256 KiB once it ended), read when the view opens, then
  // every 1.5 s while the task runs and the window is seen, and once more when the task ends (for what it wrote last): a
  // task that ended is read once, with no timer, so the longer end of it is cleaned (`text`) once per read. Each read gives
  // the whole of the end and REPLACES what is shown, nothing is added to it. One read at a time: a tick during a slow read
  // waits for the next; the last read, asked by the end of the task, waits for the one under way and goes after it. A read
  // that fails is told quietly and the next one tries again. Not state: only `read` looks at them.
  interface Reader {
    agentId: string;
    task: string;
    /** The view or the task it reads for is gone: its answer is dropped. */
    gone: boolean;
  }
  let reader: Reader | null = null;
  let inflight = false;
  let queued = false;
  let readKey = '';
  let got = $state.raw<TaskOutput | null>(null);
  let readError = $state<string | null>(null);
  let loaded = $state(false);

  async function read(last: boolean) {
    const r = reader;
    if (!r || r.gone) return;
    if (inflight) {
      if (last) queued = true;
      return;
    }
    inflight = true;
    try {
      const answer = await api.bgTaskOutput(r.agentId, r.task);
      if (!r.gone) {
        got = answer;
        readError = null;
      }
    } catch (e) {
      if (!r.gone) readError = String(e);
    } finally {
      inflight = false;
      if (!r.gone) loaded = true;
      if (queued) {
        queued = false;
        void read(true);
      }
    }
  }

  $effect(() => {
    if (!followed) return;
    const r: Reader = { agentId: agent.id, task, gone: false };
    reader = r;
    // Another task: nothing of the last one stays.
    const key = `${r.agentId}:${r.task}`;
    if (key !== readKey) {
      readKey = key;
      got = null;
      readError = null;
      loaded = false;
      stick = true;
    }
    const seen = () => document.visibilityState !== 'hidden';
    // Run at the start, and again as the task ends (the effect runs anew when `running` changes).
    void read(true);
    let timer: ReturnType<typeof setInterval> | undefined;
    let onSeen: (() => void) | undefined;
    if (running) {
      timer = setInterval(() => seen() && void read(false), POLL_MS);
      onSeen = () => seen() && void read(false);
      document.addEventListener('visibilitychange', onSeen);
    }
    return () => {
      r.gone = true;
      clearInterval(timer);
      if (onSeen) document.removeEventListener('visibilitychange', onSeen);
    };
  });

  const text = $derived(got ? cleanOutput(got.output) : '');
  /** What the empty log says, if anything. */
  const placeholder = $derived.by(() => {
    if (text) return null;
    if (!loaded) return t('bgtasks.reading');
    if (!got) return null;
    if (got.source === 'none') return t('bgtasks.noOutputFile');
    return running ? t('bgtasks.emptyRunning') : t('bgtasks.emptyDone');
  });

  // Where the reader is, measured before the new output is drawn: one who went up in it just before (whose scroll event has
  // not come yet) is not brought back to the end by it.
  let atEndBefore = true;
  $effect.pre(() => {
    void text;
    atEndBefore = !log || log.scrollHeight - log.scrollTop - log.clientHeight < AT_END;
  });
  $effect(() => {
    void text;
    if (log && stick && atEndBefore) log.scrollTop = log.scrollHeight;
  });
  /** « Suivre la fin »: to the end now, and following it from there. */
  function followEnd() {
    stick = true;
    if (log) log.scrollTop = log.scrollHeight;
  }
  function onScroll() {
    if (log) stick = log.scrollHeight - log.scrollTop - log.clientHeight < AT_END;
  }

  // Escape goes back to the agent's conversation. Seen before the others (capture): a dialog or a menu open closes first,
  // alone; a field with text in it keeps its Escape (a draft is not lost to a key). The view has no field of its own: it is
  // one elsewhere in the window (the composer of the agent) that has the focus.
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || app.modal || menu.open) return;
    const typed = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement ? e.target.value.trim() : '';
    if (typed) return;
    app.closeTask(agent.id);
  }

  /** Where the focus goes when the view opens: the crumb it is at, so that the keyboard is in the view (and Escape heard). */
  function focusHere(node: HTMLElement) {
    node.focus({ preventScroll: true });
  }
</script>

<svelte:window onkeydowncapture={onWindowKey} />

<main class="taskview" data-task-view data-task={task} data-kind={row?.kind} data-status={row?.status}>
  <header class="head">
    <nav class="crumbs" aria-label={t('bgtasks.crumbs')}>
      <button class="crumb" use:tip={t('bgtasks.back', { name: agent.name })} onclick={() => app.closeTask(agent.id)}>{agent.name}</button>
      <span class="sep" aria-hidden="true">›</span>
      <span class="crumb here" aria-current="page" tabindex="-1" use:focusHere use:tip={{ text: title, cut: true }}>{title}</span>
    </nav>
    {#if row}
      <span class="st {row.status}" data-task-state><span class="dot" aria-hidden="true"></span>{statusLabel(row.status)}</span>
    {/if}
    <div style="flex:1"></div>
    {#if stoppable}
      <button class="btn stop" data-task-stop disabled={stopping} use:tip={t('bgtasks.stopHint')} onclick={stop}
        ><span class="glyph" aria-hidden="true">■</span>{t('bgtasks.stop')}</button
      >
    {:else if running && inTerminal}
      <span class="where">{t('bgtasks.stopInTerminal')}</span>
    {/if}
  </header>

  <div class="page">
    {#if !row}
      <div class="note">{t('bgtasks.gone')}</div>
    {:else}
      <section class="brief">
        <dl class="facts" role="group" aria-label={title}>
          <div>
            <dt>{t('bgtasks.facts.kind')}</dt>
            <dd>{kindLabel(row.kind)}</dd>
          </div>
          <div>
            <dt>{t('bgtasks.facts.duration')}</dt>
            <dd class="mono" data-task-duration>{duration !== null ? fDur(duration) : '—'}</dd>
          </div>
          {#if code !== null}
            <div>
              <dt>{t('bgtasks.facts.exit')}</dt>
              <dd class="mono" data-task-exit>{code}</dd>
            </div>
          {/if}
          {#if owner}
            <div>
              <dt>{t('bgtasks.facts.by')}</dt>
              <dd>{owner.title}</dd>
            </div>
          {/if}
          {#if row.kind === 'workflow'}
            {#if row.now}
              <div>
                <dt>{t('bgtasks.facts.phase')}</dt>
                <dd>{row.now}</dd>
              </div>
            {/if}
            <div>
              <dt>{t('bgtasks.facts.tools')}</dt>
              <dd class="mono">{fInt(row.tools ?? 0)}</dd>
            </div>
            <div>
              <dt>{t('bgtasks.facts.tokens')}</dt>
              <dd class="mono">{fTok(row.tokens ?? 0)}</dd>
            </div>
          {/if}
        </dl>
        {#if command}
          <div class="block">
            <div class="k">{t('bgtasks.command')}</div>
            <div class="cmd mono" class:folded={longCommand && !commandOpen} data-task-command>{command}</div>
            {#if longCommand}
              <button class="more" aria-expanded={commandOpen} onclick={() => (commandOpen = !commandOpen)}
                >{commandOpen ? t('bgtasks.commandLess') : t('bgtasks.commandMore')}</button
              >
            {/if}
          </div>
        {:else if description}
          <div class="block">
            <div class="k">{t('bgtasks.description')}</div>
            <div class="cmd" data-task-description>{description}</div>
          </div>
        {/if}
      </section>

      {#if summary}
        <section class="summary" class:bad={row.status === 'failed'} aria-label={t('bgtasks.summary')} data-task-summary>
          <h3>{t('bgtasks.summary')}</h3>
          <p>{summary}</p>
        </section>
      {/if}

      <section class="outsec" aria-labelledby="task-out-{task}">
        <div class="outhead">
          <h3 class="k" id="task-out-{task}">{t('bgtasks.output')}</h3>
          {#if followed && got}
            {#if got.truncated}<span class="meta" data-task-truncated>{t('bgtasks.truncated')}</span>{/if}
            {#if got.source === 'file'}<span class="meta" data-task-source="file">{t('bgtasks.fromFile')}</span>{/if}
          {/if}
          {#if readError}
            <span class="meta err" data-task-read-error
              >{t('bgtasks.readError', { error: readError })}{running ? ` ${t('bgtasks.readRetry')}` : ''}</span
            >
          {/if}
        </div>
        {#if followed}
          <div class="logwrap">
            <!-- Focusable, as every scrolled region: read from the keyboard too. Not read aloud as it comes (a build writes
                 hundreds of lines). -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <pre
              class="log"
              role="log"
              aria-live="off"
              aria-label={t('bgtasks.outputLabel', { name: title })}
              tabindex="0"
              data-task-output
              bind:this={log}
              onscroll={onScroll}>{text}</pre>
            {#if placeholder}<p class="ph">{placeholder}</p>{/if}
            {#if !stick}
              <button class="follow" data-task-follow onclick={followEnd}>{t('bgtasks.follow')}</button>
            {/if}
          </div>
        {:else}
          <div class="note">{t('bgtasks.noOutputType')}</div>
        {/if}
      </section>
    {/if}
  </div>
</main>

<style>
  .taskview {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .head {
    height: 60px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 24px;
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 14px;
    white-space: nowrap;
  }
  .crumb {
    min-width: 0;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    border: none;
    background: none;
    padding: 2px 4px;
    border-radius: var(--r-sm);
    font: inherit;
    color: var(--muted);
    cursor: pointer;
  }
  button.crumb:hover {
    color: var(--text);
    background: var(--elev);
  }
  button.crumb:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .crumb.here {
    color: var(--text);
    font-weight: 700;
    cursor: default;
  }
  /* The view puts the focus here when it opens: the keyboard shows where it is. */
  .crumb.here:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .sep {
    color: var(--dim);
  }
  .st {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .st .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dim);
  }
  .st.running {
    color: var(--ok);
  }
  .st.running .dot {
    background: var(--ok);
  }
  .st.failed {
    color: var(--del);
  }
  .st.failed .dot {
    background: var(--del);
  }
  .st.stopped .dot,
  .st.interrupted .dot {
    background: var(--wait);
  }
  .stop {
    height: 28px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    font-size: 12px;
    font-weight: 600;
    flex: none;
  }
  .stop:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .stop .glyph {
    font-size: 9px;
    color: var(--del);
  }
  .where {
    flex: none;
    max-width: 320px;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--dim);
    text-align: right;
  }
  /* The page fills what is left under the head: the log takes the room the facts do not, and the whole scrolls when the
     window is too short for both. */
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 28px 24px;
  }
  .page > * {
    width: 100%;
    max-width: 980px;
    margin-inline: auto;
    box-sizing: border-box;
  }
  .brief {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--panel);
  }
  .facts {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 26px;
  }
  .facts div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .facts dt,
  .k {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dim);
  }
  .facts dd {
    margin: 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  h3.k {
    margin: 0;
    font-weight: inherit;
  }
  .block .k {
    margin-bottom: 5px;
  }
  .cmd {
    padding: 8px 12px;
    border-left: 2px solid var(--line2);
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 420px;
    overflow: auto;
  }
  .cmd.folded {
    max-height: 7.5em;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 60%, transparent);
  }
  .more {
    margin-top: 6px;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
  }
  .more:hover {
    text-decoration: underline;
  }
  .summary {
    flex: none;
    padding: 12px 16px;
    border-radius: var(--r);
    border: 1px solid color-mix(in oklch, var(--ok) 40%, transparent);
    background: color-mix(in oklch, var(--ok) 5%, var(--panel));
  }
  .summary.bad {
    border-color: color-mix(in oklch, var(--del) 50%, transparent);
    background: color-mix(in oklch, var(--del) 6%, var(--panel));
  }
  .summary h3 {
    margin: 0 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ok);
  }
  .summary.bad h3 {
    color: var(--del);
  }
  .summary p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .outsec {
    flex: 1 1 260px;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .outhead {
    flex: none;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .meta {
    font-size: 11.5px;
    color: var(--dim);
  }
  .meta.err {
    color: var(--del);
  }
  .logwrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .log {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--term);
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .log:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .ph {
    position: absolute;
    inset: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 20px;
    text-align: center;
    font-size: 12.5px;
    color: var(--dim);
    pointer-events: none;
  }
  .follow {
    position: absolute;
    right: 18px;
    bottom: 12px;
    height: 26px;
    padding: 0 11px;
    border: 1px solid var(--line2);
    border-radius: var(--r-sm);
    background: var(--elev);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .follow:hover {
    border-color: var(--accent);
  }
  .follow:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .note {
    flex: none;
    padding: 10px 14px;
    border-radius: var(--r);
    border: 1px dashed var(--line2);
    font-size: 12.5px;
    color: var(--muted);
  }
</style>
