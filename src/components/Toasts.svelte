<script lang="ts">
  import { app, type Toast } from '../lib/state.svelte';
  import Icon from './Icon.svelte';

  // The notifications of the 2.0 design: centred over the status bar, an icon of their kind before their text (done in
  // green, a failure in red, the rest neutral: a change of account, a worktree kept), and their button underlined.

  const ICON = { ok: 'check', error: 'shield', info: 'info' } as const;

  function act(t: Toast) {
    app.dismissToast(t.id);
    t.action?.onClick();
  }
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.kind}">
      <span class="ic"><Icon name={ICON[t.kind]} size={14} /></span>
      <!-- A click leaves the focus where it was (a dialog's field): the button goes with its toast, which would leave the
           focus to the page behind the dialog. The keyboard still reaches it and presses it. -->
      <span class="text"
        >{t.text}{#if t.action}<button class="act" onmousedown={(e) => e.preventDefault()} onclick={() => act(t)}>{t.action.label}</button
          >{/if}</span
      >
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 46px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: min(560px, calc(100vw - 32px));
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 14px 9px 12px;
    border-radius: 10px;
    background: var(--raise-2);
    box-shadow:
      inset 0 0 0 1px var(--line-2),
      0 12px 32px -8px rgba(0, 0, 0, calc(0.7 * var(--shade)));
    color: var(--text);
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    animation: toast-in 0.4s var(--ease);
    pointer-events: auto;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
  .ic {
    display: inline-flex;
    margin-top: 2px;
    color: var(--muted);
  }
  .ok .ic {
    color: var(--add);
  }
  .error .ic {
    color: var(--del);
  }
  .error {
    box-shadow:
      inset 0 0 0 1px oklch(from var(--del) l c h / 0.4),
      0 12px 32px -8px rgba(0, 0, 0, calc(0.7 * var(--shade)));
  }
  .act {
    margin-left: 8px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: var(--line-3);
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .act:hover {
    text-decoration-color: currentColor;
  }
</style>
