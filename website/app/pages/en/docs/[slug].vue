<script setup lang="ts">
import { isDocSlug } from '~/data/docs';

// Any other address under the documentation is a page that does not exist.
definePageMeta({ layout: 'docs', validate: (route) => isDocSlug(String(route.params.slug)) });
</script>

<template>
  <DocsArticle />
</template>
