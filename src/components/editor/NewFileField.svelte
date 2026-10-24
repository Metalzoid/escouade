<script lang="ts">
  import { untrack } from 'svelte';
  import type { EntryKind } from '../../lib/editor/create';
  import { t } from '../../lib/i18n';

  let {
    check,
    onsubmit,
    oncancel,
    value = '',
    label,
    kind = 'file',
  }: {
    /** Why `name` cannot be taken, or null. */
    check: (name: string) => string | null;
    /** Creates (or renames to) `name`: null once done, else what refused it. */
    onsubmit: (name: string) => Promise<string | null>;
    oncancel: () => void;
    /** The name to start from: a file or folder renamed has its own. */
    value?: string;
    /** What the field is called, for those who cannot see it; the name of a new file or folder when not given. */
    label?: string;
    /** A folder's name has no file icon. */
    kind?: EntryKind;
  } = $props();

  let input = $state<HTMLInputElement>();
  let name = $state(untrack(() => value));
  /** What refused `name`: shown until another name is typed; Enter tries it again. */
  let refused = $state<{ name: string; error: string } | null>(null);
  let busy = false;
  /** Given up or done: the focus lost as the field goes away decides nothing. */
  let done = false;

  const fieldLabel = $derived(label ?? t(kind === 'dir' ? 'editor.newField.folderName' : 'editor.newField.fileName'));
  const invalid = $derived(name.trim() ? check(name) : null);
  const problem = $derived(refused?.name === name ? refused.error : invalid);

  function cancel() {
    done = true;
    oncancel();
  }

  async function commit() {
    if (busy || done) return;
    if (!name.trim()) return cancel();
    if (invalid) return;
    busy = true;
    const typed = name;
    const error = await onsubmit(typed).catch((e) => String(e));
    busy = false;
    if (!error) {
      done = true;
      return;
    }
    refused = { name: typed, error };
    // Refused after the field was left: it takes the focus back for its error to be read.
    if (input?.isConnected) input.focus();
  }

  // As VS Code does: leaving the field creates the file named, or gives it up when there is none to create (or the
  // disk refused it). Decided once the blur is over: a field the app takes away (its source changed) is out of the page
  // by then, and one whose window was left still holds the focus, to get it back with the window.
  function onblur() {
    queueMicrotask(() => {
      if (busy || done || !input?.isConnected || document.activeElement === input) return;
      if (!name.trim() || problem) oncancel();
      else commit();
    });
  }

  // A name given is selected but its extension, as VS Code does: what is typed replaces the name, `.ts` stays. A folder's,
  // or a name with nothing before its dot (`.env`), is selected whole.
  function take(node: HTMLInputElement) {
    node.focus();
    // Given before the binding does, for the selection to be made in it.
    node.value = name;
    const dot = kind === 'file' ? name.lastIndexOf('.') : -1;
    node.setSelectionRange(0, dot > 0 ? dot : name.length);
    node.scrollIntoView?.({ block: 'nearest' });
  }
</script>

<input
  use:take
  bind:this={input}
  bind:value={name}
  aria-label={fieldLabel}
  aria-invalid={!!problem}
  spellcheck="false"
  autocomplete="off"
  onkeydown={(e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  }}
  {onblur}
/>
{#if problem}<div class="problem" role="alert">{problem}</div>{/if}

<style>
  input {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    border: none;
    border-radius: 5px;
    outline: none;
    background: var(--well);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--p) 60%, transparent);
    color: var(--text);
    font-size: 12.5px;
  }
  input[aria-invalid='true'] {
    box-shadow: inset 0 0 0 1px var(--del);
  }
  .problem {
    position: absolute;
    z-index: 2;
    top: 100%;
    left: var(--field-left);
    right: 8px;
    padding: 5px 8px;
    border-radius: 0 0 6px 6px;
    background: var(--raise-2);
    box-shadow: inset 0 0 0 1px var(--del);
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
    white-space: normal;
  }
</style>
