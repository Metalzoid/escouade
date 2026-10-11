<script setup lang="ts">
withDefaults(defineProps<{ size: number; /** What it sits on: its front window hides the ones behind it. */ fill?: string }>(), {
  fill: '#08090a',
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true">
    <rect x="26" y="8" width="66" height="66" rx="14" fill="none" stroke="#35C1BD" stroke-opacity="0.35" stroke-width="5" />
    <rect x="17" y="17" width="66" height="66" rx="14" fill="none" stroke="#35C1BD" stroke-opacity="0.6" stroke-width="5" />
    <rect x="8" y="26" width="66" height="66" rx="14" :fill="fill" stroke="#35C1BD" stroke-width="5" />
    <g transform="translate(41 59)" stroke="#35C1BD" stroke-linecap="round">
      <path d="M0 -20V20M-20 0H20" stroke-width="6.2" />
      <path d="M-11.8 -11.8L11.8 11.8M-11.8 11.8L11.8 -11.8" stroke-width="5" />
    </g>
  </svg>
</template>
