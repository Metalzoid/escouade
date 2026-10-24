<script lang="ts">
  import { t } from '../../lib/i18n';
  import { parseAgentMessage, parseTaskNotification, plainText } from '../../lib/events';
  import Icon from '../Icon.svelte';
  import Markdown from './Markdown.svelte';
  import { tip } from '../../lib/tip';

  // What Claude Code passed on to Claude by itself: `source` "task" (a background task), "agent"
  // (a subagent or another session), "wake" (the wake-up of a loop, `text` the command it runs again), or another origin. `label`: the task a subagent was given.
  let { source, text, label = null }: { source: string; text: string; label?: string | null } = $props();

  // How a background task ended, as a whole sentence (the status the CLI reports is shown as is when it is another).
  function taskEnded(status: string): string {
    switch (status) {
      case 'completed':
        return t('conv.event.taskCompleted');
      case 'failed':
        return t('conv.event.taskFailed');
      case 'killed':
      case 'stopped':
        return t('conv.event.taskStopped');
      default:
        return t('conv.event.taskStatus', { status });
    }
  }

  const task = $derived(source === 'task' ? parseTaskNotification(text) : null);
  const message = $derived(source === 'agent' ? parseAgentMessage(text) : null);
  const line = $derived.by(() => {
    if (task?.status) return { what: taskEnded(task.status), detail: task.summary };
    // A notification that does not say a task ended (a scheduled trigger, a check-in…).
    if (task) return { what: t('conv.event.notification'), detail: task.summary ?? plainText(text) };
    if (source === 'wake') return { what: t('conv.event.wake'), detail: text };
    return { what: t('conv.event.fromClaudeCode', { source }), detail: plainText(text) };
  });
  const title = $derived.by(() => {
    if (!message) return '';
    if (message.handback) return label ? t('conv.event.handbackNamed', { label }) : t('conv.event.handback');
    return label ? t('conv.event.messageNamed', { label }) : t('conv.event.message');
  });
</script>

{#if message}
  <div class="event agent">
    <div class="head"><Icon name="sub" size={14} />{title}</div>
    <Markdown text={message.report} />
  </div>
{:else}
  <div class="event line" class:failed={task?.status === 'failed'}>
    <span class="ico" aria-hidden="true"><Icon name={source === 'wake' ? 'restart' : 'clock'} size={14} /></span>
    <span class="what">{line.what}</span>
    {#if line.detail}<span class="detail" use:tip={{ text: line.detail, cut: true }}>{line.detail}</span>{/if}
  </div>
{/if}

<style>
  /* A line of what the harness passed on by itself: an icon, what happened, its detail. */
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .ico {
    flex: none;
    display: flex;
    color: var(--muted);
  }
  .line .what {
    flex: none;
    color: var(--soft);
    font-weight: 550;
  }
  .line.failed .what,
  .line.failed .ico {
    color: var(--del);
  }
  .detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A subagent's or another session's message, in a card. */
  .agent {
    display: grid;
    gap: 9px;
    min-width: 0;
    padding: 12px 14px;
    border-radius: 11px;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
</style>
