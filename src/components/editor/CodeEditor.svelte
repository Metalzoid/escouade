<script lang="ts">
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
  import { search, searchKeymap } from '@codemirror/search';
  import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { LineChanges } from '../../lib/editor/changes';
  import { comparison, relabelComparison, showComparison, type Comparison } from '../../lib/editor/compare';
  import {
    charColumn,
    columnOffset,
    gotoExtension,
    type NavFollowed,
    type NavFrom,
    type NavResolver,
    type NavTarget,
  } from '../../lib/editor/goto';
  import { findPanel } from '../../lib/editor/find';
  import { changeGutter, setChanges } from '../../lib/editor/gutter';
  import { reloadChange } from '../../lib/editor/reload';
  import { editorTheme, phrases } from '../../lib/editor/theme';
  import { shownTheme } from '../../lib/appearance';
  import { locale } from '../../lib/i18n';
  import { app } from '../../lib/state.svelte';
  import { observeWidth } from '../../lib/resize';

  // `docKey` names the file shown: another one replaces the whole editor state. `version` changes
  // when the same file's text was replaced from disk.
  let {
    docKey,
    text,
    version,
    language = null,
    indent,
    changes,
    compare = null,
    reveal = null,
    nav = null,
    onchange,
    oncursor,
    onrevealed,
    ontargets,
    onnaverror,
    onback,
    onforward,
    onreferences,
  }: {
    docKey: string;
    text: string;
    version: number;
    language?: Extension | null;
    indent: { tabs: boolean; size: number };
    changes: LineChanges;
    /** The version of the file the text is compared with, in the text itself; null for none. */
    compare?: Comparison | null;
    /** A line to bring into view, the cursor on `col` (in characters) when given. */
    reveal?: { line: number; col?: number; seq: number } | null;
    /** What leads elsewhere in the file `path` of a source whose tree has `files` (resolvers read for each file shown). */
    nav?: { path: string; files: readonly string[]; resolvers: NavResolver[] } | null;
    onchange: (text: string) => void;
    /** The cursor's line and column, 1-based, the column in characters as links and searches count it. */
    oncursor: (pos: { line: number; col: number }) => void;
    /** The line of request `seq` is in view: the request is done, it must not move the cursor again. */
    onrevealed?: (seq: number) => void;
    /** A link followed (Ctrl+click, F12): where it leads, where it was followed from, and the spot. */
    ontargets?: (targets: NavTarget[], from: NavFrom, spot: NavFollowed) => void;
    /** Where a followed link leads could not be worked out. */
    onnaverror?: (e: unknown) => void;
    onback?: () => void;
    onforward?: () => void;
    /** Maj+F12 on an identifier: its uses are looked for. */
    onreferences?: (name: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  const lang = new Compartment();
  const ind = new Compartment();
  const compared = new Compartment();
  const words = new Compartment();
  const look = new Compartment();
  /** A text replaced from outside is not the user typing. */
  let applying = false;
  let shownKey = untrack(() => docKey);
  let shownVersion = untrack(() => version);

  /** The text of the main selection, '' when nothing is selected. */
  export function selectedText(): string {
    const s = view?.state.selection.main;
    return view && s ? view.state.sliceDoc(s.from, s.to) : '';
  }

  const indentExt = (i: { tabs: boolean; size: number }) => [
    indentUnit.of(i.tabs ? '\t' : ' '.repeat(i.size)),
    EditorState.tabSize.of(i.tabs ? 4 : i.size),
  ];

  function reportCursor(state: EditorState) {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    oncursor({ line: line.number, col: charColumn(state.sliceDoc(line.from, head), head - line.from) });
  }

  function makeState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        // Ctrl+click (Cmd+click) follows a link: Alt+click (Option+click) adds a cursor, as in VS Code.
        EditorView.clickAddsSelectionRange.of((e) => e.altKey),
        gotoExtension({
          resolvers: untrack(() => nav?.resolvers ?? []),
          context: () => (nav ? { path: nav.path, files: nav.files } : null),
          onTargets: (t, from, spot) => ontargets?.(t, from, spot),
          onError: (e) => onnaverror?.(e),
          onBack: () => onback?.(),
          onForward: () => onforward?.(),
          onReferences: (name) => onreferences?.(name),
        }),
        // The numbers, then the marks of the changes between them and the text, as the design draws them.
        lineNumbers(),
        changeGutter(),
        highlightActiveLineGutter(),
        history(),
        // The caret does not blink with prefers-reduced-motion (the design's three moments of motion stop there).
        drawSelection({ cursorBlinkRate: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 }),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        search({ top: true, createPanel: findPanel }),
        comparison(
          compared,
          untrack(() => compare),
        ),
        words.of(EditorState.phrases.of(phrases())),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
        look.of(editorTheme(shownTheme() === 'dark')),
        lang.of(untrack(() => language) ?? []),
        ind.of(indentExt(untrack(() => indent))),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applying) onchange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) reportCursor(u.state);
        }),
      ],
    });
  }

  onMount(() => {
    view = new EditorView({ state: makeState(untrack(() => text)), parent: host });
    view.dispatch({ effects: setChanges.of(untrack(() => changes)) });
    reportCursor(view.state);
  });
  // The window's theme changed (« Thème », or the system's): CodeMirror's own base theme follows it, at once; the
  // colours are tokens, which follow by themselves.
  const themeWatch =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => view?.dispatch({ effects: look.reconfigure(editorTheme(shownTheme() === 'dark')) }));
  themeWatch?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  onDestroy(() => {
    themeWatch?.disconnect();
    view?.destroy();
  });

  // « Taille du texte de l’éditeur » changed (`--editor-font`): its lines and gutters measured again.
  $effect(() => {
    void app.settings.editorFontSize;
    requestAnimationFrame(() => view?.requestMeasure());
  });

  $effect(() => {
    const k = docKey;
    const v = version;
    untrack(() => {
      if (!view) return;
      if (k !== shownKey) {
        shownKey = k;
        shownVersion = v;
        view.setState(makeState(text));
        view.dispatch({ effects: setChanges.of(changes) });
        reportCursor(view.state);
      } else if (v !== shownVersion) {
        shownVersion = v;
        // Only what differs is replaced, outside of the history: the selections follow the text they were on,
        // and undo never brings back what was there before the reload.
        const change = reloadChange(view.state.doc.toString(), view.state.toText(text).toString());
        if (change) {
          applying = true;
          try {
            view.dispatch({ changes: change, annotations: Transaction.addToHistory.of(false) });
          } finally {
            applying = false;
          }
        }
      }
    });
  });

  // A file shown in place of another comes with its comparison (`makeState`), which is then the one shown already. A
  // text reloaded from disk is not another version to compare with: the blocks follow it as they follow what is typed.
  $effect(() => {
    const c = compare;
    untrack(() => {
      const tr = view && showComparison(view.state, compared, c);
      if (tr) view!.dispatch(tr);
    });
  });

  $effect(() => {
    const l = language;
    untrack(() => view?.dispatch({ effects: lang.reconfigure(l ?? []) }));
  });

  // CodeMirror's own texts follow the language of the interface, and so do the buttons of the blocks compared. A panel
  // already open keeps the words it was drawn with until it is opened again.
  let shownLang = untrack(() => locale.ui);
  $effect(() => {
    const l = locale.ui;
    if (l === shownLang) return;
    shownLang = l;
    untrack(() => {
      if (!view) return;
      const relabel = relabelComparison(view.state, compared);
      view.dispatch({
        effects: relabel
          ? [words.reconfigure(EditorState.phrases.of(phrases())), relabel]
          : words.reconfigure(EditorState.phrases.of(phrases())),
      });
    });
  });

  $effect(() => {
    const i = indent;
    untrack(() => view?.dispatch({ effects: ind.reconfigure(indentExt(i)) }));
  });

  $effect(() => {
    const c = changes;
    untrack(() => view?.dispatch({ effects: setChanges.of(c) }));
  });

  $effect(() => {
    const r = reveal;
    if (!r) return;
    untrack(() => {
      if (!view) return;
      const line = view.state.doc.line(Math.min(Math.max(1, r.line), view.state.doc.lines));
      const pos = line.from + columnOffset(line.text, r.col ?? 1);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      view.focus();
      onrevealed?.(r.seq);
    });
  });
</script>

<!-- CodeMirror watches its scroller too, but ignores a resize within 75 ms of its own last update: the width changes a
     step at a time while a column next to it is dragged, and the last step must be measured. -->
<div class="code" bind:this={host} use:observeWidth={() => view?.requestMeasure()}></div>

<style>
  .code {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .code :global(.cm-editor) {
    height: 100%;
  }
  .code :global(.cm-editor.cm-focused) {
    outline: none;
  }
  /* The search in the file (lib/editor/find.ts), as the design's .find: a raised box, its field in a well with its
     count and toggles, the icons of the app. */
  .code :global(.cm-find) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    /* 400 px, 340 in a narrow pane (EditorView sets --find-width by a container query), never wider than the text. */
    width: min(var(--find-width, 400px), calc(100cqw - 36px));
    padding: 8px;
    border-radius: 10px;
    background: var(--raise-2);
    box-shadow:
      inset 0 0 0 1px var(--line-2),
      0 12px 32px -10px rgba(0, 0, 0, calc(0.7 * var(--shade)));
    font-family: var(--font);
    font-size: 13px;
    line-height: 1.45;
  }
  .code :global(.cm-find-row) {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .code :global(.cm-find-field) {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 6px;
    height: 28px;
    padding: 0 4px 0 9px;
    border-radius: 7px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line-2);
    font-size: 12.5px;
  }
  .code :global(.cm-find-field:focus-within) {
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--p) 60%, transparent),
      0 0 0 3px color-mix(in oklch, var(--p) 14%, transparent);
  }
  .code :global(.cm-find-invalid .cm-find-row:first-child .cm-find-field) {
    box-shadow: inset 0 0 0 1px var(--del);
  }
  .code :global(.cm-find-input) {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: inherit;
    font-size: inherit;
  }
  .code :global(.cm-find-input::placeholder) {
    color: var(--muted);
    opacity: 1;
  }
  .code :global(.cm-find-count) {
    flex: none;
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .code :global(.cm-find-tog) {
    display: grid;
    place-items: center;
    min-width: 22px;
    height: 20px;
    padding: 0 3px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .code :global(.cm-find-tog:hover) {
    background: var(--hover);
    color: var(--text);
  }
  .code :global(.cm-find-tog[aria-pressed='true']) {
    background: color-mix(in oklch, var(--p) 24%, transparent);
    color: var(--text);
  }
  .code :global(.cm-find-btn),
  .code :global(.cm-find-mini) {
    flex: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .code :global(.cm-find-btn) {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
  }
  .code :global(.cm-find-mini) {
    height: 26px;
    padding: 0 8px;
    font-family: var(--font);
    font-size: 12px;
    font-weight: 550;
  }
  .code :global(.cm-find-btn:hover),
  .code :global(.cm-find-mini:hover) {
    background: var(--hover);
    color: var(--text);
  }
  .code :global(.cm-find-icon) {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .code :global(.cm-find button:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px var(--p-ink);
  }
</style>
