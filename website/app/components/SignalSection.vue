<script setup lang="ts">
// What Escouade is for, proven on the spot: an Escouade window whose agent asks a question the visitor answers.
const { text } = useLang();
</script>

<template>
  <section class="section signal">
    <div class="wrap grid">
      <div class="copy">
        <h2 class="title">{{ text.spotlight.title }}</h2>
        <p class="text">{{ text.spotlight.text }}</p>
        <ul class="points">
          <li v-for="p in text.spotlight.points" :key="p">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>
            {{ p }}
          </li>
        </ul>
      </div>
      <SquadDemo />
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  align-items: center;
  gap: clamp(40px, 6vw, 88px);
}
.text {
  max-width: 460px;
  margin-top: 20px;
  color: var(--muted);
  font-size: 17.5px;
}
.points {
  display: grid;
  gap: 12px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}
.points li {
  display: flex;
  gap: 12px;
  color: var(--text);
  font-size: 15.5px;
  line-height: 1.5;
}
.points svg {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  fill: none;
  stroke: var(--brand);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
