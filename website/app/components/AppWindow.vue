<script setup lang="ts">
import { SHOT, WINDOW } from '~/data/shots';

// A screenshot of the app cropped to its window, without the backdrop the shot carries around it.
defineProps<{ src: string; alt: string }>();

const pct = (n: number, of: number) => `${(n / of) * 100}%`;
const style = {
  width: pct(SHOT.w, WINDOW.w),
  left: pct(-WINDOW.x, WINDOW.w),
  top: pct(-WINDOW.y, WINDOW.h),
};
</script>

<template>
  <div class="window">
    <img :src="src" :alt="alt" :width="SHOT.w" :height="SHOT.h" :style="style" fetchpriority="high" />
  </div>
</template>

<style scoped>
.window {
  position: relative;
  aspect-ratio: 1500 / 844;
  overflow: hidden;
  border-radius: 12px;
}
img {
  position: absolute;
  max-width: none;
  height: auto;
}
</style>
