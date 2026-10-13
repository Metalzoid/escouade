<script setup lang="ts">
import type { DocHeading } from '~/data/render';

// The page's sections and subsections, beside it; the one being read is lit as the page scrolls.
const props = defineProps<{ headings: DocHeading[] }>();
const { text } = useLang();
const active = ref('');

/** The last heading that has gone past the top of the window, under the header. */
function spy() {
  let id = '';
  for (const h of props.headings) {
    const el = document.getElementById(h.id);
    if (el && el.getBoundingClientRect().top <= 120) id = h.id;
  }
  active.value = id;
}

let frame = 0;
const onScroll = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(spy);
};
onMounted(() => {
  spy();
  addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  removeEventListener('scroll', onScroll);
});
</script>

<template>
  <aside v-if="headings.length" class="toc">
    <p class="title">{{ text.docs.toc }}</p>
    <ul>
      <li v-for="h in headings" :key="h.id" :class="[`d${h.depth}`, { on: h.id === active }]">
        <a :href="`#${h.id}`">{{ h.text }}</a>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.toc {
  position: sticky;
  top: 104px;
  align-self: start;
  max-height: calc(100dvh - 140px);
  overflow-y: auto;
  scrollbar-width: thin;
}
.title {
  margin-bottom: 12px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid var(--line);
}
li a {
  display: block;
  margin-left: -1px;
  padding: 4px 0 4px 14px;
  border-left: 1px solid transparent;
  color: var(--dim);
  font-size: 13.5px;
  line-height: 1.45;
  transition:
    color 0.15s var(--ease),
    border-color 0.15s var(--ease);
}
li.d3 a {
  padding-left: 26px;
  font-size: 13px;
}
li a:hover {
  color: var(--text);
}
li.on a {
  border-left-color: var(--brand);
  color: var(--text);
}

@media (max-width: 1200px) {
  .toc {
    display: none;
  }
}
</style>
