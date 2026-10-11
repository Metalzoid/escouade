<script setup lang="ts">
import { DOWNLOAD, REPO } from '~/data/site';

// The page's last word: one more chance to download, under Escouade's light.
const { text } = useLang();
</script>

<template>
  <section class="section close">
    <div class="wrap inner">
      <LogoMark :size="56" />
      <h2 class="title">{{ text.close.title }}</h2>
      <p class="actions">
        <a class="btn primary" :href="DOWNLOAD">{{ text.hero.download }}</a>
        <a class="btn" :href="REPO">{{ text.hero.github }}</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.close {
  position: relative;
  padding-bottom: clamp(96px, 12vw, 160px);
  overflow: hidden;
}
.close::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -40%;
  width: min(1100px, 120%);
  aspect-ratio: 2;
  translate: -50% 0;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--brand) 16%, transparent), transparent);
  filter: blur(20px);
  pointer-events: none;
}
.inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.title {
  margin-top: 28px;
  font-size: clamp(36px, 4.6vw, 60px);
  letter-spacing: -0.04em;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 36px;
}
</style>
