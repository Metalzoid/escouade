<script setup lang="ts">
const { text } = useLang();
</script>

<template>
  <section id="faq" class="section">
    <div class="wrap grid">
      <h2 class="title">{{ text.faq.title }}</h2>
      <div class="list">
        <details v-for="f in text.faq.items" :key="f.q" class="item">
          <summary>
            {{ f.q }}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: 48px;
  align-items: start;
}
.list {
  border-top: 1px solid var(--line);
}
.item {
  border-bottom: 1px solid var(--line);
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 0;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary svg {
  flex: none;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.6;
  stroke-linecap: round;
  transition:
    transform 0.3s var(--ease),
    stroke 0.2s var(--ease);
}
summary:hover svg {
  stroke: var(--text);
}
.item[open] summary svg {
  transform: rotate(45deg);
  stroke: var(--brand);
}
.item p {
  max-width: 68ch;
  padding: 0 40px 24px 0;
  color: var(--muted);
  font-size: 15.5px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
  }
}
</style>
