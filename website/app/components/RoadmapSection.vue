<script setup lang="ts">
import { fmt } from '~/data/catalog';
import { CHANGELOG, NEXT, PLAN } from '~/data/site';

// What comes next: the version in the works and what it brings, with its detailed plan and what is already out.
const { text } = useLang();
</script>

<template>
  <section :id="text.anchors.roadmap" class="section">
    <div class="wrap">
      <p class="eyebrow">{{ text.roadmap.eyebrow }}</p>
      <h2>{{ text.roadmap.title }}</h2>
      <p class="lead">{{ text.roadmap.lead }}</p>
      <p class="next">{{ fmt(text.roadmap.next, { version: NEXT }) }}</p>
      <ul class="items">
        <li v-for="i in text.roadmap.items" :key="i.title" class="item">
          <h3>{{ i.title }}</h3>
          <p>{{ i.text }}</p>
        </li>
      </ul>
      <p class="links">
        <a :href="PLAN">{{ text.roadmap.plan }} →</a>
        <a :href="CHANGELOG">{{ text.roadmap.changelog }} →</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.next {
  display: inline-block;
  margin: 0;
  padding: 5px 12px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 13px;
}
.items {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}
.item {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--panel);
}
h3 {
  margin: 0 0 8px;
  font-size: 19px;
}
.item p {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin: 28px 0 0;
}
.links a {
  color: var(--brand);
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
}
.links a:hover {
  text-decoration: underline;
}
@media (max-width: 900px) {
  .items {
    grid-template-columns: 1fr;
  }
}
</style>
