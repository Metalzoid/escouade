<script setup lang="ts">
import { fmt, plural } from '~/data/catalog';
import { BEAT_MS, SNAPSHOT, fUsd, squadAt, type Answer } from '~/data/squad';

// An Escouade window as the app 2.0 draws it (design/app-redesign, DESIGN.md): the projects' tiles on the left, five
// agents of one project at work on three harnesses, one of them asking a question the visitor can answer, a ticket
// agent looping on its criteria. Without JavaScript, or with less motion asked, it stands still on a telling moment.

const { lang, text } = useLang();
const t = ref(SNAPSHOT);
const answers = ref<Answer[]>([]);
const squad = computed(() => squadAt(t.value, answers.value, lang.value));

const root = ref<HTMLElement>();
const list = ref<HTMLElement>();
/** Whether the demo should run: the visitor's choice, playing by default unless they ask for less motion. */
const wanted = ref(false);
const inView = ref(false);
const pageShown = ref(true);
const playing = computed(() => wanted.value && inView.value && pageShown.value);

let timer: ReturnType<typeof setInterval> | undefined;
let last = 0;
function tick() {
  const now = performance.now();
  // Nothing moves under a visitor about to answer the question.
  const answering = list.value?.contains(document.activeElement) && document.activeElement?.matches('.opt');
  if (!answering) t.value += (now - last) / BEAT_MS;
  last = now;
}
watch(playing, (on) => {
  clearInterval(timer);
  if (!on) return;
  last = performance.now();
  timer = setInterval(tick, 250);
});

const onVisibility = () => (pageShown.value = document.visibilityState === 'visible');
let observer: IntersectionObserver | undefined;
let started = false;
onMounted(() => {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) wanted.value = true;
  observer = new IntersectionObserver((entries) => {
    inView.value = entries[entries.length - 1].isIntersecting;
    // The first time it comes into view, from just before the question: the visitor sees it being asked.
    if (inView.value && wanted.value && !started) {
      started = true;
      t.value = 1;
    }
  });
  observer.observe(root.value!);
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();
});
onBeforeUnmount(() => {
  clearInterval(timer);
  observer?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
});

function answer(option: number) {
  answers.value = [...answers.value, { at: t.value, option }];
}
</script>

<template>
  <figure ref="root" class="squad" :class="{ still: !playing }" :style="{ '--p': squad.project.color }">
    <div class="win">
      <div class="titlebar">
        <LogoMark :size="18" />
        <span class="project">
          <i class="swatch" />
          <b>{{ squad.project.name }}</b>
          <span class="delta">Δ {{ squad.project.delta }}</span>
        </span>
        <span class="branch">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="4.75" cy="3.75" r="1.5" />
            <circle cx="4.75" cy="12.25" r="1.5" />
            <circle cx="11.25" cy="5.25" r="1.5" />
            <path d="M4.75 5.25v5.5M11.25 6.75c0 2.6-2.1 3.4-5.6 4.25" /></svg
          >{{ squad.project.branch }}
        </span>
      </div>
      <div class="body">
        <ul class="rail" :aria-label="text.demo.projects">
          <li class="tile on" :style="{ '--t': squad.project.color }">
            {{ squad.project.letters }}
            <span v-if="squad.counts.waiting" class="badge">{{ squad.counts.waiting }}</span>
            <i v-else-if="squad.counts.running" class="live" aria-hidden="true" />
          </li>
          <li v-for="p in squad.projects" :key="p.name" class="tile" :style="{ '--t': p.color }" :title="p.name">
            {{ p.letters }}
            <span v-if="p.agents.includes('question')" class="badge">{{ p.agents.filter((s) => s === 'question').length }}</span>
            <i v-else-if="p.agents.includes('running')" class="live" aria-hidden="true" />
          </li>
        </ul>
        <div class="side">
          <div class="seg" aria-hidden="true">
            <span class="on"
              >{{ text.demo.agents }} <span class="n">{{ squad.agents.length }}</span></span
            >
            <span>{{ text.demo.kanban }}</span>
          </div>
          <ul ref="list" class="agents">
            <li v-for="a in squad.agents" :key="a.slot">
              <AgentCard :agent="a" @answer="answer" />
            </li>
          </ul>
        </div>
      </div>
      <div class="statusbar">
        <span class="count"><i class="mini running" />{{ fmt(text.demo.running, { count: squad.counts.running }) }}</span>
        <span class="count" :class="{ waits: squad.counts.waiting }"
          ><i class="mini question" />{{ fmt(text.demo.waiting, { count: squad.counts.waiting }) }}</span
        >
        <span class="count done">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          {{ plural(lang, text.demo.done, squad.counts.done) }}
        </span>
        <span class="today">{{ fmt(text.demo.today, { amount: fUsd(squad.today, lang) }) }}</span>
        <button type="button" class="pause" :aria-label="text.demo.pause" :aria-pressed="!wanted" @click="wanted = !wanted">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="wanted" d="M5.5 3.5v9M10.5 3.5v9" />
            <path v-else d="M5 3.2l7.5 4.8L5 12.8z" class="fill" />
          </svg>
        </button>
      </div>
    </div>
    <figcaption>
      {{ text.demo.caption }}
      <span class="sr-only">{{ text.demo.description }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.squad {
  /* The app's own tokens (src/app.css, the 2.0 design, dark theme): this is the app, not the site. `--p` is the colour of
     the project in front, which tints the frame as in the app. */
  --frame: color-mix(in oklch, var(--p) 8%, #08090a);
  --line: rgba(255, 255, 255, 0.075);
  --line-2: rgba(255, 255, 255, 0.12);
  --line-3: rgba(255, 255, 255, 0.2);
  --text: #f7f8f8;
  --soft: #d0d3d8;
  --muted: #989da6;
  --sep: #4a4e55;
  --p-ink: color-mix(in oklch, var(--p) 70%, white);
  --run: oklch(0.79 0.15 155);
  --wait: oklch(0.84 0.14 82);
  --wait-bg: oklch(0.84 0.14 82 / 0.07);
  --wait-line: oklch(0.84 0.14 82 / 0.32);
  --add: oklch(0.8 0.13 155);
  --del: oklch(0.74 0.14 22);
  --on-tile: #101114;
  --on-wait: #1a1405;
  --font: 'Inter Variable', Inter, system-ui, 'Segoe UI', sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Menlo, monospace;
  margin: 0;
  color: var(--text);
}
.win {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: var(--frame);
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.45;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 40px 100px -30px color-mix(in srgb, #35c1bd 22%, transparent),
    0 30px 60px -30px rgba(0, 0, 0, 0.9);
}
.titlebar {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 40px;
  padding: 0 14px 0 17px;
  white-space: nowrap;
  overflow: hidden;
}
.project {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
}
.project b {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2.5px;
  background: var(--p);
}
.delta {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.branch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}
.branch svg,
.count svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.body {
  display: flex;
  min-height: 0;
}
.rail {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 52px;
  margin: 0;
  padding: 8px 0 10px;
  list-style: none;
}
.tile {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--t);
  color: var(--on-tile);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  opacity: 0.8;
}
.tile.on {
  opacity: 1;
  box-shadow:
    0 0 0 2px var(--frame),
    0 0 0 3.5px var(--t);
}
.badge {
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--wait);
  box-shadow: 0 0 0 2px var(--frame);
  color: var(--on-wait);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.live {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--run);
  box-shadow: 0 0 0 2px var(--frame);
}
.side {
  flex: 1;
  min-width: 0;
  padding: 0 8px 8px 0;
}
.seg {
  display: flex;
  gap: 2px;
  margin: 2px 4px 8px;
  padding: 3px;
  border-radius: 9px;
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 550;
}
.seg span {
  flex: 1;
  padding: 4px 0;
  border-radius: 6px;
  text-align: center;
}
.seg .on {
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px var(--line-2);
  color: var(--text);
}
.seg .n {
  color: var(--muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.agents {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0 4px;
  list-style: none;
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 34px;
  padding: 0 8px 0 16px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.count.waits {
  color: var(--wait);
}
.mini {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--run);
}
.mini.question {
  background: var(--wait);
}
.today {
  margin-left: auto;
  color: var(--soft);
}
.pause {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
}
.pause:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}
.pause svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pause .fill {
  fill: currentColor;
}
figcaption {
  margin-top: 14px;
  color: #7b8089;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 640px) {
  .rail,
  .branch,
  .statusbar .count,
  .agents :deep(.spend) {
    display: none;
  }
  .side {
    padding-left: 8px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .mini.question,
  .badge {
    animation: blink 1.4s ease-in-out infinite;
  }
  /* Paused, nothing blinks either. */
  .squad.still .mini.question,
  .squad.still .badge,
  .squad.still :deep(.agent.question .dot) {
    animation: none;
  }
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
</style>
