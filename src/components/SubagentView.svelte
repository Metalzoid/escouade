<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../lib/i18n';
  import { api } from '../lib/ipc';
  import { conversationOf } from '../lib/conversations.svelte';
  import { fDur, fInt, fTok } from '../lib/format';
  import { modelLabel } from '../lib/models';
  import { app } from '../lib/state.svelte';
  import { menu } from '../lib/menu.svelte';
  import { crumbs, subagentInfo, subDuration, threadOf } from '../lib/subagents';
  import type { Agent, ConvItem, Project, TranscriptCursor } from '../lib/types';
  import Markdown from './conv/Markdown.svelte';
  import PermissionCard from './conv/PermissionCard.svelte';
  import QuestionCard from './conv/QuestionCard.svelte';
  import Thinking from './conv/Thinking.svelte';
  import ToolRow from './conv/ToolRow.svelte';
  import { tip } from '../lib/tip';

  // The conversation of a subagent of `agent`, in place of the agent's (ESC-13): `call` is the call that launched it.
  // Its thread is the items of the agent's conversation that name the call (`parent`), and the requests it made; its
  // head says what it is, its end what it handed back. « Arrêter » stops it alone (Claude Code's `stop_task`); a
  // message to it goes through the agent, which is said (Claude Code lets no host write to a subagent). In the Claude
  // Code view the stream tells nothing of it: its thread is read, and only read, from the transcript Claude Code keeps.
  let { agent, project, call }: { agent: Agent; project: Project; call: string } = $props();

  /** A prompt longer than that is folded to its first lines. */
  const LONG_PROMPT = 360;

  const conv = $derived(conversationOf(agent.id));
  const info = $derived(subagentInfo(agent, conv.items, call));
  const thread = $derived(threadOf(conv.items, call));
  const chain = $derived(crumbs(agent, conv.items, call));
  // The items of each thread, for the calls drawn: a tool row unfolds what its subagent did.
  const children = $derived.by(() => {
    const m = new Map<string, ConvItem[]>();
    for (const i of conv.items) {
      if (!i.parent) continue;
      let list = m.get(i.parent);
      if (!list) m.set(i.parent, (list = []));
      list.push(i);
    }
    return m;
  });
  const running = $derived(info?.status === 'running');
  /** Known to be over (a status nothing tells is not). */
  const ended = $derived(!!info?.status && info.status !== 'running');
  const duration = $derived(info ? subDuration(info, app.now) : null);
  /** In the Claude Code view, its thread is in Claude Code's transcript, and its interface acts on it. */
  const inTerminal = $derived(agent.terminal);
  // In the background only: in the foreground the agent waits for it (its own « Arrêter » stops it with its turn), and
  // stopping one alone there was never tried on a real stream.
  const stoppable = $derived(running && info?.background === true && !inTerminal);
  const canStop = $derived(stoppable && !!info?.taskId);
  // While it runs, and in the background: the plan never opens an ended row again, so one taken up again by a message
  // would still say it ended; in the foreground the agent waits for it, and would pass the message on once it ended.
  const canWrite = $derived(running && !!info?.taskId && info?.background === true && !inTerminal && !agent.archived);
  const statusWord = $derived(info ? t(`subagents.status.${info.status ?? 'unknown'}`) : '');
  const editorSource = $derived(agent.worktree ? agent.id : 'project');
  const openFile = (abs: string, line: number | null) =>
    app.openEditor({ projectId: project.id, source: editorSource, abs, line: line ?? undefined });
  const openSub = (id: string) => app.openSubagent(agent.id, id);

  let promptOpen = $state(false);
  let stopping = $state(false);
  let sending = $state(false);

  // What is typed to it is the app's, not the view's: it outlives the subagent and a change of view.
  const draftKey = $derived(`${agent.id}:${call}`);
  const message = $derived(app.subDrafts[draftKey] ?? '');
  const setMessage = (v: string) => {
    if (v) app.subDrafts[draftKey] = v;
    else delete app.subDrafts[draftKey];
  };
  const hasDraft = $derived(message.trim() !== '');
  // The field stays for a draft once it ended, even emptied: it does not vanish under the cursor.
  let kept = $state(false);
  $effect(() => {
    if (hasDraft) kept = true;
  });
  const showWrite = $derived(!!info && !inTerminal && (canWrite || (ended && (hasDraft || kept))));

  async function stop() {
    if (!canStop || stopping) return;
    stopping = true;
    await app.run(api.stopSubagent(agent.id, call));
    stopping = false;
  }

  async function send() {
    const text = message.trim();
    if (!text || sending || !canWrite) return;
    sending = true;
    const sent = await app.run(api.messageSubagent(agent.id, call, text).then(() => true));
    sending = false;
    if (sent) {
      setMessage('');
      app.toast(t('subagents.writeSent', { name: agent.name }));
    }
  }

  // Its transcript, in the Claude Code view: read when the view opens, then every 2 s while the subagent runs (and once
  // more when it ends, for what it said last). Each read gives back the cursor of the one before, and the backend answers
  // null while its files are as that read left them: nothing is read or parsed, and nothing is touched here. A read that
  // finds it ended (stopped in Claude Code's interface, an API error) has the backend end its row of the plan and send the
  // agent: the row changes, `running` with it, and the timer stops.
  const agentId = $derived(agent.id);
  const reading = $derived(inTerminal && info !== null);
  // The list is replaced as a whole by each read, never changed in place.
  let side = $state.raw<ConvItem[]>([]);
  let sideError = $state<string | null>(null);
  let sideRead = $state(false);
  // Not state: only the next read looks at it. Whose it is, for a view that goes to another agent's subagent.
  let cursor: TranscriptCursor | null = null;
  let cursorOf = '';
  $effect(() => {
    if (!reading) return;
    const id = agentId;
    const live = running;
    let gone = false;
    let busy = false;
    async function read() {
      // A read slower than the timer is not stacked on the next.
      if (busy) return;
      busy = true;
      try {
        if (cursorOf !== `${id}:${call}`) {
          cursorOf = `${id}:${call}`;
          cursor = null;
        }
        const got = await api.subagentTranscript(id, call, cursor);
        if (!gone) {
          if (got) {
            side = got.items;
            cursor = got.cursor;
          }
          sideError = null;
        }
      } catch (e) {
        if (!gone) sideError = String(e);
      } finally {
        busy = false;
        if (!gone) sideRead = true;
      }
    }
    read();
    const timer = live ? setInterval(read, 2_000) : undefined;
    return () => {
      gone = true;
      clearInterval(timer);
    };
  });
  /** What it handed back, as its transcript tells it: the message of its last `SubagentHandback`. */
  const handedBack = $derived.by(() => {
    for (let i = side.length - 1; i >= 0; i--) {
      const item = side[i];
      const text = item.kind === 'tool' && item.name === 'SubagentHandback' ? item.input?.message : undefined;
      if (typeof text === 'string' && text.trim()) return text;
    }
    return undefined;
  });
  const report = $derived(info?.report ?? (inTerminal ? handedBack : undefined));
  /** The items drawn: its thread in the agent's conversation, else its transcript, whose calls without a result are over with it. */
  const shown = $derived(
    inTerminal
      ? side.map((i) => (ended && i.kind === 'tool' && i.status === 'running' ? { ...i, status: 'interrupted' as const } : i))
      : thread,
  );

  // Escape goes back to the agent's conversation. Seen before the others (capture): a dialog or a menu open closes
  // first, alone; a field with text in it keeps its Escape (a draft is not lost to a key).
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || app.modal || menu.open) return;
    const typed = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement ? e.target.value.trim() : '';
    if (typed) return;
    app.closeSubagent(agent.id);
  }

  /** Where the focus goes when the view opens: the crumb it is at, so that the keyboard is in the view (and Escape heard). */
  function focusHere(node: HTMLElement) {
    node.focus({ preventScroll: true });
  }

  // The view follows the bottom of its thread while the reader is there, as the agent's conversation does.
  let scroller = $state<HTMLDivElement>();
  let content = $state<HTMLDivElement>();
  let stick = true;
  const atBottom = () => !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
  function toBottom() {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }
  $effect(() => {
    if (!content) return;
    const ro = new ResizeObserver(() => stick && toBottom());
    ro.observe(content);
    return () => ro.disconnect();
  });
  onMount(() => {
    // Shown, the conversation stays in memory (read again if it had left it).
    const shown = conv.show();
    tick().then(toBottom);
    return shown;
  });

  /** Items that draw nothing: an empty block of text, the calls whose question or plan has its own card. */
  function shows(item: ConvItem) {
    if (item.kind === 'text' || item.kind === 'thinking') return !!item.text.trim() || item.streaming;
    // Its hand-back, in the Claude Code view, is the report below.
    if (item.kind === 'tool')
      return item.name !== 'AskUserQuestion' && item.name !== 'ExitPlanMode' && !(inTerminal && item.name === 'SubagentHandback');
    return item.kind === 'permission' || item.kind === 'question';
  }
</script>

<svelte:window onkeydowncapture={onWindowKey} />

<!-- `.conv`: the keys answering a waiting request apply here too (answersHere, in shortcuts.ts). -->
<main class="conv subview">
  <header class="head">
    <nav class="crumbs" aria-label={t('subagents.crumbs')}>
      <button class="crumb" use:tip={t('subagents.back', { name: agent.name })} onclick={() => app.closeSubagent(agent.id)}
        >{agent.name}</button
      >
      {#each chain as c, i (c.call)}
        <span class="sep" aria-hidden="true">›</span>
        {#if i < chain.length - 1}
          <button class="crumb" onclick={() => openSub(c.call)}>{c.title}</button>
        {:else}
          <span class="crumb here" aria-current="page" tabindex="-1" use:focusHere use:tip={{ text: c.title, cut: true }}>{c.title}</span>
        {/if}
      {/each}
    </nav>
    {#if info}
      <span class="st {info.status ?? 'unknown'}"><span class="dot" aria-hidden="true"></span>{statusWord}</span>
    {/if}
    <div style="flex:1"></div>
    {#if stoppable}
      <!-- aria-disabled, not disabled: focusable and hovered still, for its tooltip to say why it cannot stop it yet. -->
      <button
        class="btn stop"
        aria-disabled={!canStop || stopping}
        use:tip={canStop ? t('subagents.stopHint') : t('subagents.stopLater')}
        onclick={stop}><span class="glyph" aria-hidden="true">■</span>{t('subagents.stop')}</button
      >
    {/if}
  </header>

  <div class="scroll" bind:this={scroller} onscroll={() => (stick = atBottom())}>
    <div class="msgs" bind:this={content}>
      {#if conv.error}
        <div class="note err">{t('conv.loadError', { error: conv.error })}</div>
      {:else if !info}
        {#if conv.loaded}<div class="note">{t('subagents.gone')}</div>{/if}
      {:else}
        <section class="brief">
          <dl class="facts" role="group" aria-label={info.title}>
            {#if info.kind}<div>
                <dt>{t('subagents.facts.kind')}</dt>
                <dd>{info.kind}</dd>
              </div>{/if}
            {#if info.model}<div>
                <dt>{t('subagents.facts.model')}</dt>
                <dd>{modelLabel(info.model, app.models)}</dd>
              </div>{/if}
            <div>
              <dt>{t('subagents.facts.tokens')}</dt>
              <dd class="mono">{info.tokens !== undefined ? fTok(info.tokens) : '—'}</dd>
            </div>
            {#if info.tools !== undefined}<div>
                <dt>{t('subagents.facts.tools')}</dt>
                <dd class="mono">{fInt(info.tools)}</dd>
              </div>{/if}
            <div>
              <dt>{t('subagents.facts.duration')}</dt>
              <dd class="mono">{duration !== null ? fDur(duration) : '—'}</dd>
            </div>
          </dl>
          {#if info.prompt}
            {@const long = info.prompt.length > LONG_PROMPT || info.prompt.split('\n').length > 6}
            <div class="prompt">
              <div class="k">{t('subagents.prompt')}</div>
              <div class="ptext" class:folded={long && !promptOpen}>{info.prompt}</div>
              {#if long}
                <button class="more" aria-expanded={promptOpen} onclick={() => (promptOpen = !promptOpen)}
                  >{promptOpen ? t('subagents.promptLess') : t('subagents.promptMore')}</button
                >
              {/if}
            </div>
          {/if}
        </section>

        {#if inTerminal}
          <div class="note">{t('subagents.terminal')}</div>
          {#if sideError}<div class="note err">{t('subagents.terminalError', { error: sideError })}</div>{/if}
        {/if}

        {#each shown as item (item.id)}
          {#if shows(item)}
            <div class="item" data-item={item.id}>
              {#if item.kind === 'text'}
                <div class="assistant">
                  <span class="avatar" aria-hidden="true">↳</span>
                  <div class="blocks"><Markdown text={item.text} streaming={item.streaming} /></div>
                </div>
              {:else if item.kind === 'thinking'}
                <Thinking {item} />
              {:else if item.kind === 'tool'}
                <ToolRow
                  {item}
                  cwd={agent.cwd}
                  childrenOf={(id) => children.get(id) ?? []}
                  onOpenFile={openFile}
                  onOpenSub={inTerminal ? undefined : openSub}
                />
              {:else if item.kind === 'question'}
                <QuestionCard {item} agentId={agent.id} pending={agent.pending.includes(item.id)} current={agent.pending[0] === item.id} />
              {:else if item.kind === 'permission'}
                <PermissionCard
                  {item}
                  agentId={agent.id}
                  cwd={agent.cwd}
                  pending={agent.pending.includes(item.id)}
                  current={agent.pending[0] === item.id}
                />
              {/if}
            </div>
          {/if}
        {:else}
          {#if inTerminal ? sideRead && !sideError : conv.loaded}<div class="note">{t('subagents.empty')}</div>{/if}
        {/each}

        {#if running}
          <div class="working"><span class="dots"><span></span><span></span><span></span></span>{t('subagents.working')}</div>
        {:else if report}
          <section class="report" aria-label={t('subagents.report')}>
            <h3>{t('subagents.report')}</h3>
            <Markdown text={report} />
          </section>
        {:else if info.status}
          <div class="note">{t('subagents.noReport')}</div>
        {/if}
      {/if}
    </div>
  </div>

  {#if showWrite}
    <!-- Its keys are its own: Ctrl+Entrée sends the message, it answers no request waiting (answersHere). -->
    <form
      class="write"
      data-own-keys
      onsubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label for="sub-write-{call}">{t('subagents.write', { name: agent.name })}</label>
      <textarea
        id="sub-write-{call}"
        rows="2"
        placeholder={t('subagents.writePlaceholder')}
        bind:value={() => message, setMessage}
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      ></textarea>
      <div class="wrow">
        <span class="hint">{canWrite ? t('subagents.writeHint', { name: agent.name }) : t('subagents.writeEnded')}</span>
        <button class="btn primary" type="submit" disabled={!canWrite || !message.trim() || sending}
          >{t('subagents.writeSend', { name: agent.name })}</button
        >
      </div>
    </form>
  {/if}
</main>

<style>
  .conv {
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
  .stop[aria-disabled='true'] {
    opacity: 0.5;
    cursor: default;
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
  .stop .glyph {
    font-size: 9px;
    color: var(--del);
  }
  .scroll {
    flex: 1;
    min-height: 160px;
    overflow: auto;
  }
  .msgs {
    max-width: 780px;
    margin: 0 auto;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .brief {
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
  }
  .facts dt {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dim);
  }
  .facts dd {
    margin: 0;
    font-size: 13px;
  }
  .prompt .k {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dim);
    margin-bottom: 5px;
  }
  .ptext {
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
  .ptext.folded {
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
  .item {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .assistant {
    display: flex;
    gap: 12px;
    min-width: 0;
  }
  .blocks {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .avatar {
    width: 22px;
    height: 22px;
    flex: none;
    margin-top: 1px;
    border-radius: var(--r-sm);
    background: var(--elev2);
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .note {
    padding: 10px 14px;
    border-radius: var(--r);
    border: 1px dashed var(--line2);
    font-size: 12.5px;
    color: var(--muted);
  }
  .note.err {
    border-style: solid;
    border-color: color-mix(in oklch, var(--del) 50%, transparent);
  }
  .working {
    margin-left: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    animation: ccBlink 1.2s infinite;
  }
  .dots span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots span:nth-child(3) {
    animation-delay: 0.3s;
  }
  .report {
    padding: 14px 16px;
    border-radius: var(--r);
    border: 1px solid color-mix(in oklch, var(--ok) 40%, transparent);
    background: color-mix(in oklch, var(--ok) 5%, var(--panel));
  }
  .report h3 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ok);
  }
  .write {
    max-width: 780px;
    width: calc(100% - 56px);
    margin: 0 auto 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--line2);
    border-radius: var(--r);
    background: var(--panel);
  }
  .write label {
    font-size: 12px;
    font-weight: 600;
  }
  .write textarea {
    resize: vertical;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid var(--line2);
    border-radius: var(--r-sm);
    background: var(--bg);
    font: inherit;
    font-size: 13px;
    color: var(--text);
  }
  .write textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .wrow {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .hint {
    flex: 1;
    font-size: 11.5px;
    color: var(--dim);
    line-height: 1.4;
  }
  @media (prefers-reduced-motion: reduce) {
    .dots span {
      animation: none;
    }
  }
</style>
