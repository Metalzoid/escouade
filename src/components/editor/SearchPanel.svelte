<script lang="ts">
  import { untrack } from 'svelte';
  import { dirOf } from '../../lib/editor/links';
  import { pieces, SEARCH_MAX, type FileSearch, type Piece, type SearchOption } from '../../lib/editor/search.svelte';
  import { basename, fInt } from '../../lib/format';
  import { t, type Key } from '../../lib/i18n';
  import type { SearchMatch } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import FileIcon from './FileIcon.svelte';
  import { tip } from '../../lib/tip';

  // « Rechercher dans les fichiers »: the field and its options, then what the search of the source shown found, file by
  // file, in a tree the keys walk as the files' one; a line found opens its file there.
  let { search, onopen }: { search: FileSearch; onopen: (m: SearchMatch) => void } = $props();

  const uid = $props.id();
  let field = $state<HTMLInputElement>();
  let scroller = $state<HTMLDivElement>();

  /** The field takes the focus, its text selected: what is typed replaces it. */
  export function focus() {
    field?.focus();
    field?.select();
  }

  const OPTIONS = [
    { key: 'caseSensitive', label: 'editor.search.caseSensitive', glyph: 'Aa' },
    { key: 'wholeWord', label: 'editor.search.wholeWord', glyph: 'ab' },
    { key: 'regex', label: 'editor.search.regex', glyph: '.*' },
  ] as const satisfies { key: SearchOption; label: Key; glyph: string }[];

  interface Line {
    m: SearchMatch;
    /** Its rank among all the lines found. */
    i: number;
    /** Its text as shown: cut once for each answer, not again at each fold. */
    ps: Piece[];
  }

  const result = $derived(search.result);
  /** The files found, in git's order, with their lines. */
  const files = $derived.by(() => {
    const by = new Map<string, Line[]>();
    (result?.matches ?? []).forEach((m, i) => {
      const line = { m, i, ps: pieces(m) };
      const lines = by.get(m.path);
      if (lines) lines.push(line);
      else by.set(m.path, [line]);
    });
    return [...by].map(([path, lines]) => ({ path, lines }));
  });

  /** The files folded: all open again with each answer. A set rather than keys of a `$state` object, which drops `constructor`. */
  let folded = $state.raw(new Set<string>());
  /** The row holding the focus: the tree's one Tab stop, and its row selected (the first row until one does). */
  let focused = $state<string | null>(null);
  $effect(() => {
    void result;
    untrack(() => {
      folded = new Set();
      focused = null;
      scroller?.scrollTo?.(0, 0);
    });
  });

  function fold(path: string) {
    const s = new Set(folded);
    if (!s.delete(path)) s.add(path);
    folded = s;
  }

  type Row = { kind: 'file'; key: string; path: string; count: number; open: boolean } | { kind: 'line'; key: string; line: Line };
  const rows = $derived(
    files.flatMap(({ path, lines }): Row[] => {
      const open = !folded.has(path);
      const head: Row = { kind: 'file', key: `f:${path}`, path, count: lines.length, open };
      return open ? [head, ...lines.map((line): Row => ({ kind: 'line', key: `l:${line.i}`, line }))] : [head];
    }),
  );
  const stop = $derived(focused && rows.some((r) => r.key === focused) ? focused : (rows[0]?.key ?? null));

  const results = (n: number) => t('editor.count.results', { count: n, n: fInt(n) });
  const status = $derived.by(() => {
    if (search.error || !search.text) return null;
    if (!result) return search.pending ? t('editor.search.searching') : null;
    const n = result.matches.length;
    return n
      ? t('editor.search.found', {
          results: results(n),
          files: t('editor.count.files', { count: files.length, n: fInt(files.length) }),
        })
      : t('editor.search.none');
  });
  const limit = $derived(
    result?.timedOut ? t('editor.search.timedOut') : result?.truncated ? t('editor.search.truncated', { max: fInt(SEARCH_MAX) }) : null,
  );

  const focusRow = (i: number) => scroller?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus();

  // The keys of a tree (WAI-ARIA), as the files' tree has them: ↑ from the first row goes back to the field.
  function onkeydown(e: KeyboardEvent) {
    const i = Number((e.target as HTMLElement).dataset.index);
    const r = rows[i];
    if (!r) return;
    const move: Record<string, () => void> = {
      ArrowDown: () => i + 1 < rows.length && focusRow(i + 1),
      ArrowUp: () => (i > 0 ? focusRow(i - 1) : field?.focus()),
      Home: () => focusRow(0),
      End: () => focusRow(rows.length - 1),
      ArrowRight: () => {
        if (r.kind !== 'file') return;
        if (!r.open) fold(r.path);
        else if (rows[i + 1]?.kind === 'line') focusRow(i + 1);
      },
      ArrowLeft: () => {
        if (r.kind === 'file') return r.open && fold(r.path);
        let head = i - 1;
        while (head > 0 && rows[head].kind !== 'file') head--;
        focusRow(head);
      },
    };
    if (!Object.hasOwn(move, e.key)) return;
    e.preventDefault();
    move[e.key]();
  }

  function onfieldkey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      search.now();
    } else if (e.key === 'ArrowDown' && rows.length) {
      e.preventDefault();
      focusRow(0);
    }
  }
</script>

<div class="search">
  <div class="box" class:invalid={!!search.error}>
    <input
      bind:this={field}
      value={search.text}
      oninput={(e) => search.type(e.currentTarget.value)}
      onkeydown={onfieldkey}
      placeholder={t('common.search')}
      aria-label={t('common.search')}
      aria-invalid={!!search.error}
      aria-describedby={search.error ? `${uid}-error` : undefined}
      spellcheck="false"
      autocomplete="off"
    />
    {#each OPTIONS as o (o.key)}
      <!-- The focus stays in the field when the mouse presses an option. -->
      <button
        class="opt mono"
        class:on={search[o.key]}
        aria-pressed={search[o.key]}
        aria-label={t(o.label)}
        use:tip={t(o.label)}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => search.toggle(o.key)}>{o.glyph}</button
      >
    {/each}
  </div>
  {#if search.error}
    <div class="problem" id="{uid}-error" role="alert">{search.error}</div>
  {/if}
  <div class="scroll" bind:this={scroller}>
    <!-- A click on the free space focuses the tree itself: its Tab stop takes the focus, for the arrows to work. -->
    <div
      class="results"
      class:stale={search.pending && !!result}
      role="tree"
      aria-label={t('editor.search.results')}
      aria-busy={search.pending}
      tabindex="-1"
      {onkeydown}
      onfocus={(e) =>
        e.target === e.currentTarget &&
        e.currentTarget.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus({ preventScroll: true })}
    >
      {#each rows as r, i (r.key)}
        {#if r.kind === 'file'}
          {@const dir = dirOf(r.path)}
          <button
            class="row file"
            role="treeitem"
            aria-level={1}
            aria-expanded={r.open}
            aria-label={dir
              ? t('editor.search.fileRowIn', { name: basename(r.path), dir, results: results(r.count) })
              : t('editor.search.fileRow', { name: basename(r.path), results: results(r.count) })}
            aria-selected={r.key === stop}
            tabindex={r.key === stop ? 0 : -1}
            use:tip={r.path}
            data-index={i}
            onfocus={() => (focused = r.key)}
            onclick={() => fold(r.path)}
          >
            <span class="twistie"><Icon name={r.open ? 'down' : 'right'} size={14} /></span>
            <FileIcon />
            <span class="name">{basename(r.path)}</span>
            {#if dir}<span class="dir">{dir}</span>{/if}
            <span class="count mono">{r.count}</span>
          </button>
        {:else}
          {@const { m, ps } = r.line}
          <button
            class="row line"
            role="treeitem"
            aria-level={2}
            aria-label={t('editor.search.lineRow', { line: m.line, text: ps.map((p) => p.text).join('') })}
            aria-selected={r.key === stop}
            tabindex={r.key === stop ? 0 : -1}
            data-index={i}
            onfocus={() => (focused = r.key)}
            onclick={() => onopen(m)}
          >
            <span class="text mono"
              >{#each ps as p, j (j)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span
            >
          </button>
        {/if}
      {/each}
    </div>
  </div>
  <!-- Always there, only its words change: a screen reader tells a status's changes only once it knows it. -->
  <div class="foot" class:idle={!status} role="status">
    {#if status}
      <span>{status}</span>
      {#if limit}<span class="limit">{limit}</span>{/if}
    {/if}
  </div>
</div>

<style>
  /* The search through the files, in the editor's left column under its title (« Recherche »). */
  .search {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* The field, as the search in the file draws it: a well, its three toggles inside. */
  .box {
    margin: 0 4px;
    height: 28px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px 0 0;
    border-radius: 7px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .box:focus-within {
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--p) 60%, transparent),
      0 0 0 3px color-mix(in oklch, var(--p) 14%, transparent);
  }
  .box.invalid {
    box-shadow: inset 0 0 0 1px var(--del);
  }
  .box input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 9px;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 12.5px;
    outline: none;
  }
  .opt {
    min-width: 22px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0 3px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .opt:hover {
    background: var(--hover);
    color: var(--text);
  }
  .opt.on {
    background: color-mix(in oklch, var(--p) 24%, transparent);
    color: var(--text);
  }
  .problem {
    margin: 0 4px;
    padding: 5px 8px;
    border-radius: 0 0 7px 7px;
    background: oklch(from var(--del) l c h / 0.1);
    box-shadow: inset 0 0 0 1px oklch(from var(--del) l c h / 0.4);
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    margin-top: 8px;
    overflow: auto;
  }
  .results {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 0 12px;
    outline: none;
  }
  /* The answer to come replaces these. */
  .results.stale {
    opacity: 0.55;
  }
  .row {
    width: 100%;
    flex: none;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--soft);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    /* Thousands of rows: those out of view cost no layout. */
    content-visibility: auto;
    contain-intrinsic-size: auto 26px;
  }
  .row:hover {
    background: var(--hover);
  }
  .row:focus-visible {
    outline: 2px solid var(--p-ink);
    outline-offset: -2px;
  }
  .row.line {
    padding-left: 30px;
  }
  .twistie {
    width: 14px;
    flex: none;
    display: grid;
    place-items: center;
    color: var(--dim);
  }
  .name {
    flex: none;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11.5px;
    color: var(--muted);
  }
  .count {
    flex: none;
    margin-left: auto;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 99px;
    background: rgba(var(--fg-rgb), 0.06);
    color: var(--muted);
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--muted);
  }
  mark {
    border-radius: 3px;
    background: color-mix(in oklch, var(--p) 32%, transparent);
    color: var(--text);
  }
  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 8px 8px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--muted);
  }
  /* Nothing to tell: no bar drawn, the status kept for what comes. */
  .foot.idle {
    padding: 0;
    border-top: none;
  }
  .limit {
    color: var(--warn-ink);
  }
</style>
