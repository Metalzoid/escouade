<script setup lang="ts">
import { isDocSlug, slugOf } from '~/data/docs';

// Any other address under the documentation is a page that does not exist.
definePageMeta({ layout: 'docs', validate: (route) => isDocSlug(slugOf(route.params.slug)) });
</script>

<template>
  <DocsArticle />
</template>
