<script setup lang="ts">
import { DOC_GROUPS, docPath } from '~/data/docs';

// Every page, by group. Beside the page on a wide screen; over it, opened from the header, on a narrow one.
const { lang, text } = useLang();
const route = useRoute();
const current = computed(() => route.params.slug);
const menu = useDocsMenu();
const nav = ref<HTMLElement>();

/** Any link closes the sidebar opened over the page, the current page's too. */
function close(e: MouseEvent) {
  if ((e.target as Element).closest('a')) menu.value = false;
}

// A page reached directly may sit far down the list: the sidebar scrolls to it, without moving the page.
onMounted(() => {
  const link = nav.value?.querySelector<HTMLElement>('[aria-current="page"]');
  if (nav.value && link && link.offsetTop + link.offsetHeight > nav.value.clientHeight) {
    nav.value.scrollTop = link.offsetTop - nav.value.clientHeight / 2;
  }
});
</script>

<template>
  <nav id="docs-nav" ref="nav" class="sidebar" :aria-label="text.docs.nav" @click="close">
    <div v-for="g in DOC_GROUPS" :key="g.id" class="group">
      <p class="group-title">{{ text.docs.groups[g.id].title }}</p>
      <ul>
        <li v-for="slug in g.pages" :key="slug">
          <NuxtLink :to="docPath(lang, slug)" :aria-current="slug === current ? 'page' : undefined">{{ text.docs.pages[slug] }}</NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  position: sticky;
  top: 64px;
  height: calc(100dvh - 64px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 36px 20px 48px var(--gutter);
  border-right: 1px solid var(--line);
  scrollbar-width: thin;
}
.group + .group {
  margin-top: 28px;
}
.group-title {
  margin: 0 0 8px 10px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li a {
  display: block;
  padding: 5px 10px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
  transition:
    color 0.15s var(--ease),
    background-color 0.15s var(--ease);
}
li a:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.03);
}
li a[aria-current='page'] {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 2px 0 0 var(--brand);
}

/* Too narrow to sit beside the page: it covers it, under the header, once opened. */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    inset: 64px 0 0;
    z-index: 9;
    display: none;
    height: auto;
    padding: 24px var(--gutter) 48px;
    border-right: 0;
    background: var(--bg);
  }
  .sidebar.open {
    display: block;
  }
}
</style>
