<script setup lang="ts">
const { text } = useLang();
</script>

<template>
  <section :id="text.anchors.install" class="section">
    <div class="wrap">
      <h2 class="title">{{ text.install.title }}</h2>
      <ol class="steps">
        <li v-for="(s, i) in text.install.steps" :key="s.title" class="step">
          <span class="n" aria-hidden="true">{{ i + 1 }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
          <a v-if="s.link" class="arrow" :href="s.link.href">{{ s.link.label }}</a>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}
.n {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  color: var(--brand);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
h3 {
  margin-top: 22px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
p {
  margin-top: 8px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
}
.arrow {
  margin-top: auto;
  padding-top: 20px;
  font-size: 15px;
}

@media (max-width: 900px) {
  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
