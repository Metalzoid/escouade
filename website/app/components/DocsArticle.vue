<script setup lang="ts">
import { fmt } from '~/data/catalog';
import { DOC_GROUPS, DOC_SLUGS, docPath, docRoute, docSource, type DocSlug } from '~/data/docs';
import { REPO } from '~/data/site';

// A page of the documentation: its group, its title and lede, its content, then where to edit it and the pages
// before and after it; its summary beside it.
const { lang, text } = useLang();
const route = useRoute();
const slug = String(route.params.slug) as DocSlug;
const { load } = useDocs();

// The page's payload keeps what it shows: the search loads the pages itself.
const { data: doc } = await useAsyncData(`doc:${lang.value}:${slug}`, async () => {
  const d = await load(lang.value, slug);
  return d && { title: d.title, lede: d.lede, html: d.html, headings: d.headings };
});
if (!doc.value) throw createError({ statusCode: 404, statusMessage: text.value.notFound.title, fatal: true });

const group = DOC_GROUPS.find((g) => (g.pages as readonly string[]).includes(slug))!;
const at = DOC_SLUGS.indexOf(slug);
const previous = DOC_SLUGS[at - 1];
const next = DOC_SLUGS[at + 1];
const edit = `${REPO}/edit/main/website/${docSource(lang.value, slug)}`;

useDocHead({ title: fmt(text.value.docs.pageTitle, { title: doc.value.title }), description: doc.value.lede, slug });

// The links of the content are plain HTML: one to another page of the documentation goes through the router, like
// those of the sidebar, rather than loading the whole site again.
const base = useRuntimeConfig().app.baseURL;
function follow(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest('a');
  const to = a && docRoute(new URL(a.href), location.origin, base, route.path);
  if (!to) return;
  e.preventDefault();
  navigateTo(to);
}
</script>

<template>
  <div v-if="doc" class="page">
    <article class="article">
      <p class="group">{{ text.docs.groups[group.id].title }}</p>
      <h1>{{ doc.title }}</h1>
      <p class="lede">{{ doc.lede }}</p>
      <!-- The pages are the repository's own Markdown, rendered without their HTML (see data/render.ts). -->
      <div class="prose" @click="follow" v-html="doc.html" />
      <footer class="end">
        <a class="edit" :href="edit">{{ text.docs.edit }}</a>
        <div class="pager">
          <NuxtLink v-if="previous" class="turn previous" :to="docPath(lang, previous)">
            <span class="dir">← {{ text.docs.previous }}</span>
            <span class="name">{{ text.docs.pages[previous] }}</span>
          </NuxtLink>
          <NuxtLink v-if="next" class="turn next" :to="docPath(lang, next)">
            <span class="dir">{{ text.docs.next }} →</span>
            <span class="name">{{ text.docs.pages[next] }}</span>
          </NuxtLink>
        </div>
      </footer>
    </article>
    <DocsToc :headings="doc.headings" />
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(0, 740px) 220px;
  justify-content: space-between;
  gap: 64px;
  padding: 56px var(--gutter) 112px clamp(32px, 5vw, 72px);
}
.group {
  margin-bottom: 12px;
  color: var(--brand);
  font-size: 13.5px;
  font-weight: 550;
}
h1 {
  font-size: clamp(32px, 3.4vw, 42px);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: -0.032em;
  text-wrap: balance;
}
.lede {
  margin: 16px 0 8px;
  color: var(--muted);
  font-size: 18.5px;
  line-height: 1.6;
  text-wrap: pretty;
}

.end {
  margin-top: 72px;
  padding-top: 28px;
  border-top: 1px solid var(--line);
}
.edit {
  color: var(--muted);
  font-size: 14px;
  transition: color 0.2s var(--ease);
}
.edit:hover {
  color: var(--text);
}
.pager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 28px;
}
.turn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  transition:
    border-color 0.2s var(--ease),
    background-color 0.2s var(--ease);
}
.turn:hover {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.02);
}
.next {
  grid-column: 2;
  text-align: right;
}
.dir {
  color: var(--dim);
  font-size: 13px;
}
.name {
  font-size: 15.5px;
  font-weight: 550;
  letter-spacing: -0.01em;
}

@media (max-width: 1200px) {
  .page {
    grid-template-columns: minmax(0, 760px);
  }
}
@media (max-width: 900px) {
  .page {
    padding: 40px var(--gutter) 88px;
  }
}
@media (max-width: 560px) {
  .pager {
    grid-template-columns: 1fr;
  }
  .next {
    grid-column: 1;
  }
}
</style>
