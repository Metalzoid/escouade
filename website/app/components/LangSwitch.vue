<script setup lang="ts">
import { LANGS, rememberLanguage, type LangInfo } from '~/data/language';

// Two real links, one per page, so that the switch works without a script too; the click also keeps the choice.
const { lang, text } = useLang();
const asset = useAsset();

/** The French link asks for French explicitly: the first visit's redirection would send the visitor away again. */
const href = (l: LangInfo) => `${asset(l.path)}${l.code === 'fr' ? '?lang=fr' : ''}`;

function choose(l: LangInfo, e: MouseEvent) {
  rememberLanguage(l.code);
  // Already there: nothing to load.
  if (l.code === lang.value) e.preventDefault();
}
</script>

<template>
  <nav class="lang" :aria-label="text.header.language">
    <a
      v-for="l in LANGS"
      :key="l.code"
      :href="href(l)"
      :lang="l.code"
      :hreflang="l.code"
      :title="l.name"
      :aria-current="l.code === lang ? 'page' : undefined"
      @click="choose(l, $event)"
      >{{ l.label }}</a
    >
  </nav>
</template>

<style scoped>
/* Two languages, side by side; the one shown is lit. */
.lang {
  display: flex;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.lang a {
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: color 0.2s var(--ease);
}
.lang a:hover {
  color: var(--text);
}
.lang a[aria-current='page'] {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.lang a:focus-visible {
  outline-offset: -2px;
}
</style>
