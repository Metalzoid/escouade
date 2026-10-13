<script setup lang="ts">
// The documentation's frame: the site's header with the search, the pages in a sidebar, the page itself, the footer.
// It stays in place from one page to the next, so the sidebar keeps where it was scrolled to.
const menu = useDocsMenu();
const route = useRoute();
watch(
  () => route.path,
  () => (menu.value = false),
);

// Opened over the page on a narrow screen, the sidebar holds the scroll, and Esc closes it.
watch(menu, (open) => document.documentElement.classList.toggle('menu-open', open));
function escape(e: KeyboardEvent) {
  if (e.key === 'Escape' && menu.value) menu.value = false;
}
onMounted(() => addEventListener('keydown', escape));
onBeforeUnmount(() => {
  removeEventListener('keydown', escape);
  document.documentElement.classList.remove('menu-open');
});
</script>

<template>
  <SiteHeader docs />
  <div class="docs">
    <DocsSidebar :class="{ open: menu }" />
    <main class="main">
      <slot />
    </main>
  </div>
  <SiteFooter />
</template>

<style scoped>
.docs {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  max-width: 1440px;
  margin: 0 auto;
}
.main {
  min-width: 0;
}

@media (max-width: 900px) {
  .docs {
    display: block;
  }
}
</style>

<style>
@media (max-width: 900px) {
  html.menu-open {
    overflow: hidden;
  }
}
</style>
