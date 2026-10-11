<script setup lang="ts">
import { DOWNLOAD, REPO } from '~/data/site';

const { text } = useLang();
</script>

<template>
  <header class="top">
    <div class="bar">
      <a class="brand" href="#top"><LogoMark :size="26" /><span>Escouade</span></a>
      <nav class="nav" :aria-label="text.header.sections">
        <a href="#video">{{ text.header.video }}</a>
        <a :href="`#${text.anchors.features}`">{{ text.header.features }}</a>
        <a :href="`#${text.anchors.install}`">{{ text.header.install }}</a>
        <a :href="`#${text.anchors.roadmap}`">{{ text.header.roadmap }}</a>
        <a href="#faq">{{ text.header.faq }}</a>
      </nav>
      <div class="tools">
        <LangSwitch />
        <a class="link" :href="REPO">{{ text.header.github }}</a>
        <a class="get" :href="DOWNLOAD">{{ text.header.download }}</a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: saturate(1.4) blur(14px);
  -webkit-backdrop-filter: saturate(1.4) blur(14px);
}
.bar {
  display: flex;
  align-items: center;
  gap: 40px;
  height: 64px;
  padding: 0 var(--gutter);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.015em;
}
.nav {
  display: flex;
  gap: 28px;
}
.tools {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-left: auto;
}
.nav a,
.link {
  color: var(--muted);
  font-size: 14.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.2s var(--ease);
}
.nav a:hover,
.link:hover {
  color: var(--text);
}
.get {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--text);
  color: var(--bg);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: background-color 0.2s var(--ease);
}
.get:hover {
  background: #fff;
}

/* Five links on one line need the room: below it, only the brand, the language, GitHub and the download stay. */
@media (max-width: 1080px) {
  .nav {
    display: none;
  }
}
@media (max-width: 560px) {
  .link {
    display: none;
  }
}
</style>
