<script setup lang="ts">
import { pageSource, type PageId } from '~/data/privacy';
import { REPO } from '~/data/site';

const props = defineProps<{ id: PageId }>();

// A page of its own (privacy, legal notice): its title and lede, then its content, rendered from the repository’s Markdown.
const { lang, text } = useLang();
const asset = useAsset();

const { data: doc } = await useAsyncData(`${props.id}:${lang.value}`, async () => {
  const d = await loadPage(props.id, lang.value, asset);
  return d && { title: d.title, lede: d.lede, html: d.html };
});
if (!doc.value) throw createError({ statusCode: 404, statusMessage: text.value.notFound.title, fatal: true });

usePageHead(props.id, { title: `${doc.value.title} · Escouade`, description: doc.value.lede });
const edit = `${REPO}/edit/main/website/${pageSource(props.id, lang.value)}`;
</script>

<template>
  <SiteHeader page />
  <main v-if="doc" class="page">
    <article class="article">
      <h1>{{ doc.title }}</h1>
      <p class="lede">{{ doc.lede }}</p>
      <!-- The page is the repository’s own Markdown, rendered without its HTML (see data/render.ts). -->
      <div class="prose" v-html="doc.html" />
      <footer class="end">
        <a class="edit" :href="edit">{{ text.docs.edit }}</a>
      </footer>
    </article>
  </main>
  <SiteFooter />
</template>

<style scoped>
.page {
  max-width: 800px;
  margin: 0 auto;
  padding: 72px var(--gutter) 112px;
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
</style>
