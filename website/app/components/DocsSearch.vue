<script setup lang="ts">
import { fmt } from '~/data/catalog';
import { docPath } from '~/data/docs';
import { searchDocs, searchEntries, type SearchEntry, type SearchHit } from '~/data/search';

// The search of the documentation, from the header's button, Ctrl+K (⌘K) or “/”: a window over the page, the
// sections that hold every word typed, and the keyboard to move through them. The pages of the language are
// loaded the first time it opens.
const { lang, text } = useLang();
const { all } = useDocs();
const asset = useAsset();

const dialog = ref<HTMLDialogElement>();
const input = ref<HTMLInputElement>();
const query = ref('');
const entries = shallowRef<SearchEntry[] | null>(null);
const selected = ref(0);
const failed = ref(false);
const mac = ref(false);
const menu = useDocsMenu();

const hits = computed(() => (entries.value ? searchDocs(entries.value, query.value) : []));
watch(query, () => (selected.value = 0));

async function open() {
  if (!dialog.value || dialog.value.open) return;
  dialog.value.showModal();
  input.value?.select();
  if (entries.value) return;
  try {
    entries.value = (await all(lang.value)).flatMap(({ slug, doc }) => searchEntries(slug, doc));
    failed.value = false;
  } catch {
    // Offline, or a page that would not load: said in the window, and tried again on the next opening.
    failed.value = true;
  }
}
const close = () => dialog.value?.close();

const href = (h: SearchHit) => `${docPath(lang.value, h.slug)}${h.id ? `#${h.id}` : ''}`;
function go(h: SearchHit | undefined) {
  if (!h) return;
  close();
  menu.value = false;
  navigateTo(href(h));
}
/** A click on a result opens it here; with Ctrl, ⌘ or Shift, the browser opens it elsewhere. */
function pick(e: MouseEvent, h: SearchHit) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(h);
}

function move(by: number) {
  if (!hits.value.length) return;
  selected.value = Math.min(Math.max(selected.value + by, 0), hits.value.length - 1);
  nextTick(() => document.getElementById(`docs-hit-${selected.value}`)?.scrollIntoView({ block: 'nearest' }));
}
function keys(e: KeyboardEvent) {
  // Keys that pick a character in an input method editor are not the search's.
  if (e.isComposing) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    go(hits.value[selected.value]);
  }
}

/**
 * A click on the dimmed page around the window, which is the dialog itself (its content fills it). Pressed there too:
 * a selection dragged from the field out of the window is no click outside.
 */
let pressed: EventTarget | null = null;
const press = (e: PointerEvent) => (pressed = e.target);
function outside(e: MouseEvent) {
  if (e.target === dialog.value && pressed === dialog.value) close();
}

function shortcut(e: KeyboardEvent) {
  const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
  const k = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
  if (k || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
    e.preventDefault();
    open();
  }
}
onMounted(() => {
  mac.value = /Mac|iPhone|iPad/.test(navigator.platform);
  addEventListener('keydown', shortcut);
});
onBeforeUnmount(() => removeEventListener('keydown', shortcut));
</script>

<template>
  <button class="search" type="button" aria-haspopup="dialog" @click="open">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <span class="label">{{ text.docs.search.button }}</span>
    <kbd>{{ mac ? '⌘' : 'Ctrl' }} K</kbd>
  </button>
  <dialog ref="dialog" class="dialog" :aria-label="text.docs.search.button" @pointerdown="press" @click="outside" @close="query = ''">
    <div class="box">
      <div class="field">
        <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          ref="input"
          v-model="query"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="docs-hits"
          :aria-expanded="hits.length > 0"
          :aria-activedescendant="hits.length ? `docs-hit-${selected}` : undefined"
          :aria-label="text.docs.search.placeholder"
          :placeholder="text.docs.search.placeholder"
          autocomplete="off"
          spellcheck="false"
          @keydown="keys"
        />
        <button class="close" type="button" @click="close">{{ text.docs.search.close }}</button>
      </div>
      <ul v-show="hits.length" id="docs-hits" class="hits" role="listbox" :aria-label="text.docs.search.button">
        <li
          v-for="(h, i) in hits"
          :id="`docs-hit-${i}`"
          :key="`${h.slug}#${h.id}`"
          role="option"
          :aria-selected="i === selected"
          @mousemove="selected = i"
        >
          <a :href="asset(href(h))" tabindex="-1" @click="pick($event, h)">
            <span class="where">
              {{ h.page }}<template v-if="h.heading"><span class="sep" aria-hidden="true"> › </span>{{ h.heading }}</template>
            </span>
            <span class="snippet"
              >{{ h.snippet.before }}<mark v-if="h.snippet.match">{{ h.snippet.match }}</mark
              >{{ h.snippet.after }}</span
            >
          </a>
        </li>
      </ul>
      <p v-if="failed" class="empty">{{ text.docs.search.failed }}</p>
      <p v-else-if="!hits.length && query.trim() && entries" class="empty">{{ fmt(text.docs.search.empty, { query: query.trim() }) }}</p>
      <p class="keys">{{ text.docs.search.keys }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.search {
  display: inline-flex;
  flex: 0 1 280px;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--dim);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
.search:hover {
  border-color: var(--line-strong);
  color: var(--muted);
}
.label {
  flex: 1;
  text-align: left;
}
kbd {
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--dim);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
}

.dialog {
  width: min(640px, 100vw - 32px);
  max-height: min(620px, 100dvh - 32px);
  margin: 12vh auto auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--surface-2);
  color: var(--text);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}
.dialog::backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}
.box {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}
.field {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--line);
  color: var(--dim);
}
input {
  flex: 1;
  min-width: 0;
  height: 56px;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 16.5px;
}
input::placeholder {
  color: var(--dim);
}
.close {
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
  color: var(--dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.close:hover {
  color: var(--text);
}
.hits {
  min-height: 0;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  list-style: none;
}
.hits a {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 9px;
}
li[aria-selected='true'] a {
  background: rgba(255, 255, 255, 0.06);
}
.where {
  font-size: 14.5px;
  font-weight: 550;
  letter-spacing: -0.005em;
}
.sep {
  color: var(--dim);
}
.snippet {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.5;
}
mark {
  background: none;
  color: var(--brand-hi);
  font-weight: 600;
}
.empty {
  padding: 28px 20px;
  color: var(--muted);
  font-size: 14.5px;
  text-align: center;
}
.keys {
  padding: 10px 18px;
  border-top: 1px solid var(--line);
  color: var(--dim);
  font-size: 12px;
}

/* Beside a narrow header's other tools, only its icon. */
@media (max-width: 900px) {
  .search {
    flex: 0 0 auto;
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .label,
  kbd {
    display: none;
  }
}
@media (max-width: 640px) {
  .keys {
    display: none;
  }
}
</style>
