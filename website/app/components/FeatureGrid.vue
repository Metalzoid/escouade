<script setup lang="ts">
import { featuresFor } from '~/data/catalogs';
import { FOCUS } from '~/data/shots';
import type { FeatureId } from '~/data/site';

// The features as tiles of unequal sizes, each with a close-up of the app on what it is about, then what else the
// app does, one line each.

const { lang, text } = useLang();
const features = featuresFor(lang.value);
const asset = useAsset();

/** How wide each tile is, on twelve columns, in the page's order of rows. */
const SPAN: Record<FeatureId, number> = {
  agents: 7,
  chat: 5,
  tableau: 5,
  integrations: 7,
  notifications: 4,
  git: 4,
  editeur: 4,
  test: 4,
  lancement: 4,
  stats: 4,
  remote: 12,
};
/** The order of the tiles: the features' order, regrouped so that each row fills its twelve columns. */
const ORDER: FeatureId[] = [
  'agents',
  'chat',
  'tableau',
  'integrations',
  'notifications',
  'git',
  'editeur',
  'test',
  'lancement',
  'stats',
  'remote',
];
const tiles = ORDER.map((id) => features.find((f) => f.id === id)!);

const look = (id: FeatureId) => {
  const f = FOCUS[id];
  return { objectPosition: `${f.x}% ${f.y}%`, transformOrigin: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom})` };
};
</script>

<template>
  <section :id="text.anchors.features" class="section">
    <div class="wrap">
      <h2 class="title">
        {{ text.features.title }} <span class="more">{{ text.features.lead }}</span>
      </h2>
      <div class="grid">
        <article v-for="f in tiles" :key="f.id" class="tile" :class="[`span-${SPAN[f.id]}`, f.id]">
          <div class="words">
            <h3>{{ f.title }}</h3>
            <p>{{ f.text }}</p>
          </div>
          <div class="media">
            <img :src="asset(f.image)" :alt="f.alt" width="1920" height="960" loading="lazy" decoding="async" :style="look(f.id)" />
          </div>
        </article>
      </div>
      <ul class="more-list">
        <li v-for="c in text.cards" :key="c.title">
          <h3>{{ c.title }}</h3>
          <p>{{ c.text }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
  margin-top: 56px;
}
.tile {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-2), var(--surface) 60%);
  transition: border-color 0.3s var(--ease);
}
.tile:hover {
  border-color: var(--line-strong);
}
.span-4 {
  grid-column: span 4;
}
.span-5 {
  grid-column: span 5;
}
.span-7 {
  grid-column: span 7;
}
.span-12 {
  grid-column: span 12;
  flex-direction: row;
  align-items: stretch;
}
.words {
  padding: 28px 28px 0;
}
.span-12 .words {
  flex: 0 0 38%;
  align-self: center;
  padding: 36px;
}
h3 {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
}
.words p {
  margin-top: 10px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
}

/* The app, peeking in from the tile's lower right corner. */
.media {
  position: relative;
  flex: 1;
  min-height: 240px;
  margin: 28px 0 0 28px;
  overflow: hidden;
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line-strong);
  border-radius: 10px 0 0 0;
  background: #1b1917;
}
.span-7 .media,
.span-5 .media {
  min-height: 300px;
}
.span-12 .media {
  min-height: 380px;
  margin: 36px 0 0;
}
.media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  transition: translate 0.6s var(--ease);
}
.tile:hover .media img {
  translate: 0 -6px;
}

.more-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 32px;
  margin: 56px 0 0;
  padding: 0;
  list-style: none;
}
.more-list li {
  padding: 24px 0;
  border-top: 1px solid var(--line);
}
.more-list h3 {
  font-size: 15.5px;
}
.more-list p {
  margin-top: 6px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
}

@media (max-width: 1080px) {
  .span-4 {
    grid-column: span 6;
  }
  .span-5,
  .span-7 {
    grid-column: span 12;
  }
  .more-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .grid > .tile {
    grid-column: span 12;
  }
  .span-12 {
    flex-direction: column;
  }
  .span-12 .words {
    padding: 28px 28px 0;
  }
  .span-12 .media {
    margin: 28px 0 0 28px;
    min-height: 260px;
  }
  .more-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .media img {
    transition: none;
  }
  .tile:hover .media img {
    translate: none;
  }
}
</style>
