<script setup lang="ts">
import { VIDEO, imageOf } from '~/data/site';

const { lang, text } = useLang();
const asset = useAsset();
const video = computed(() => VIDEO[lang.value]);
</script>

<template>
  <section id="video" class="section">
    <div class="wrap">
      <h2 class="title">{{ text.video.title }}</h2>
      <video class="player" controls preload="none" playsinline width="1920" height="1080" :poster="asset(imageOf(lang, 'poster.jpg'))">
        <source :src="asset(video.src)" type="video/mp4" />
        <!-- The voice over, as text. The voice is French: the English page turns the English track on (an
             English visitor could not follow otherwise); the French page leaves it to the player, as shown
             by default it would hide the app's status bar the video talks about. -->
        <track
          v-for="t in video.tracks"
          :key="t.src"
          :kind="t.kind"
          :srclang="t.srclang"
          :label="t.label"
          :src="asset(t.src)"
          :default="t.default"
        />
      </video>
    </div>
  </section>
</template>

<style scoped>
.player {
  width: 100%;
  height: auto;
  margin-top: 48px;
  border-radius: 16px;
  background: #1a1917;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 30px 80px -30px rgba(0, 0, 0, 0.9);
}
</style>
