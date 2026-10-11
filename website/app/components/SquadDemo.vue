<script setup lang="ts">
import { fmt, plural } from '~/data/catalog';
import { BEAT_MS, SNAPSHOT, fUsd, squadAt, type Answer } from '~/data/squad';

// An Escouade window, drawn in the app's own colours: five agents of one project at work, one of them asking a
// question the visitor can answer, a ticket agent looping on its criteria. Without JavaScript, or with less
// motion asked, it stands still on a telling moment.

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
  const answering = list.value?.contains(document.activeElement) && document.activeElement?.matches('.option');
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
  <figure ref="root" class="squad" :class="{ still: !playing }">
    <div class="win">
      <div class="titlebar">
        <LogoMark :size="18" />
        <span class="tab">
          <i class="swatch" />
          <b>{{ squad.project.name }}</b>
          <!-- As in the app's tab: a pill counting the agents that wait, or a dot while they all work. -->
          <span v-if="squad.counts.waiting" class="badge">{{ squad.counts.waiting }}</span>
          <i v-else-if="squad.counts.running" class="live" aria-hidden="true" />
          <span class="delta">Δ {{ squad.project.delta }}</span>
        </span>
        <span v-for="p in squad.projects" :key="p.name" class="tab other" aria-hidden="true">
          <i class="swatch" :style="{ background: p.color }" />
          {{ p.name }}
          <span v-if="p.agents.includes('question')" class="badge">{{ p.agents.filter((s) => s === 'question').length }}</span>
        </span>
        <span class="branch">{{ squad.project.branch }}</span>
      </div>
      <div class="head">
        <span>{{ text.demo.agents }}</span
        ><span class="n">{{ squad.agents.length }}</span>
      </div>
      <ul ref="list" class="agents">
        <li v-for="a in squad.agents" :key="a.slot">
          <AgentCard :agent="a" @answer="answer" />
        </li>
      </ul>
      <div class="statusbar">
        <span class="count"><i class="mini running" />{{ fmt(text.demo.running, { count: squad.counts.running }) }}</span>
        <span class="count"><i class="mini question" />{{ fmt(text.demo.waiting, { count: squad.counts.waiting }) }}</span>
        <span class="count done"><i class="mini done" />{{ plural(lang, text.demo.done, squad.counts.done) }}</span>
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
  /* The app's own colours (src/app.css): this is the app, not the site. */
  --text: #ede7df;
  --muted: #a8a095;
  --dim: #8a8276;
  --line: rgba(255, 236, 214, 0.08);
  --line2: rgba(255, 236, 214, 0.15);
  --panel: #211f1c;
  --ink: #1b1512;
  --accent: oklch(0.72 0.12 48);
  --ok: oklch(0.76 0.12 150);
  --wait: oklch(0.82 0.13 80);
  --wait-soft: oklch(0.82 0.13 80 / 0.08);
  --wait-ring: oklch(0.82 0.13 80 / 0.6);
  --add: oklch(0.76 0.12 150);
  --del: oklch(0.72 0.14 25);
  --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Menlo, monospace;
  margin: 0;
  color: var(--text);
}
.win {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background: #1d1a17;
  font-size: 14px;
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
  height: 44px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  overflow: hidden;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tab b {
  font-weight: 700;
}
.tab.other {
  color: var(--muted);
}
.swatch {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 2.5px;
  background: var(--accent);
}
.live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.delta {
  padding: 0 6px;
  border-radius: 5px;
  background: var(--line);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
}
.badge {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--wait);
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 800;
  text-align: center;
}
.branch {
  margin-left: auto;
  color: var(--dim);
  font-family: var(--mono);
  font-size: 12px;
}
.head {
  display: flex;
  gap: 8px;
  padding: 14px 20px 6px;
  color: var(--dim);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.head .n {
  font-family: var(--mono);
  font-weight: 400;
}
.agents {
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 0 8px 8px;
  list-style: none;
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 7px 10px 7px 20px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.mini {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}
.mini.question {
  background: var(--wait);
}
.mini.done {
  background: color-mix(in oklch, var(--ok) 45%, transparent);
}
.today {
  margin-left: auto;
  color: var(--text);
}
.pause {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--line2);
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.pause:hover {
  border-color: #35c1bd;
  color: var(--text);
}
.pause svg {
  width: 15px;
  height: 15px;
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
  .tab.other,
  .branch,
  .statusbar .count,
  .agents :deep(.spend) {
    display: none;
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
