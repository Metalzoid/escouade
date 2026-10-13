<script setup lang="ts">
import { DOC_GROUPS, docPath } from '~/data/docs';

// The documentation's home: what it covers, then its groups, each with what it is about and its pages.
const { lang, text } = useLang();
useDocHead({ title: text.value.docs.meta.title, description: text.value.docs.meta.description });
</script>

<template>
  <div class="home">
    <h1>{{ text.docs.title }}</h1>
    <p class="lede">{{ text.docs.lead }}</p>
    <div class="groups">
      <section v-for="g in DOC_GROUPS" :key="g.id" class="group">
        <h2>
          <NuxtLink :to="docPath(lang, g.pages[0])">{{ text.docs.groups[g.id].title }}</NuxtLink>
        </h2>
        <p>{{ text.docs.groups[g.id].text }}</p>
        <ul>
          <li v-for="slug in g.pages" :key="slug">
            <NuxtLink :to="docPath(lang, slug)">{{ text.docs.pages[slug] }}</NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 1040px;
  padding: 64px var(--gutter) 112px clamp(32px, 5vw, 72px);
}
h1 {
  font-size: clamp(36px, 4vw, 52px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.035em;
}
.lede {
  max-width: 640px;
  margin-top: 16px;
  color: var(--muted);
  font-size: 19px;
  line-height: 1.6;
  text-wrap: pretty;
}
.groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 56px;
}
.group {
  padding: 24px 24px 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}
h2 {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.015em;
}
h2 a:hover {
  color: var(--brand-hi);
}
.group p {
  margin-top: 6px;
  color: var(--muted);
  font-size: 14.5px;
  line-height: 1.55;
}
ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
li a {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: color-mix(in srgb, var(--text) 84%, var(--muted));
  font-size: 13.5px;
  transition:
    border-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
li a:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

@media (max-width: 760px) {
  .groups {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 900px) {
  .home {
    padding: 40px var(--gutter) 88px;
  }
}
</style>
