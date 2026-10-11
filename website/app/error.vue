<script setup lang="ts">
import type { NuxtError } from '#app';
import { LANGS } from '~/data/language';

// GitHub Pages answers an unknown address with 404.html, which shows this in the language of the address
// asked for; Nuxt's own page for it is white, and in English. Any other error gets the same page with its message
// (`NuxtError` is no registered component in Nuxt 4.5, only `NuxtErrorBoundary` is).
const props = defineProps<{ error: NuxtError }>();
const gone = computed(() => props.error.statusCode === 404);
const message = computed(() => props.error.statusMessage || props.error.message || '');
const { lang, text } = useLang();
const asset = useAsset();
const home = asset(LANGS.find((l) => l.code === lang.value)!.path);

useHead({
  htmlAttrs: { lang: lang.value },
  title: gone.value ? text.value.notFound.title : text.value.failure.title,
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>

<template>
  <main class="gone">
    <LogoMark :size="48" />
    <p class="code">{{ error.statusCode || 500 }}</p>
    <h1>{{ gone ? text.notFound.title : text.failure.title }}</h1>
    <p v-if="gone" class="text">{{ text.notFound.text }}</p>
    <p v-else-if="message" class="text">{{ message }}</p>
    <a class="btn primary" :href="home">{{ gone ? text.notFound.home : text.failure.home }}</a>
  </main>
</template>

<style scoped>
.gone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 100svh;
  padding: 48px var(--gutter);
  text-align: center;
}
.code {
  margin-top: 12px;
  color: var(--dim);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}
h1 {
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.035em;
}
.text {
  margin-bottom: 12px;
  color: var(--muted);
}
</style>
