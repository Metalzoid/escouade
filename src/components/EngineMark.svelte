<script lang="ts">
  import { engineName, showsMark } from '../lib/engines';
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tip';
  import type { EngineId } from '../lib/types';

  // The brand of an agent's harness, a word in a hairline (« Claude », « Codex », « OpenCode », « Copilot »), never a
  // colour: the same on its card, in the overview, its header, its ticket and the menus. Only once agents run on two
  // harnesses: with one, it would say nothing. `large`: in a header, or beside a title.
  // `always`: shown whatever the agents run on (the menu « Harness », where it names each harness).
  let { engine, large = false, always = false }: { engine: EngineId | null | undefined; large?: boolean; always?: boolean } = $props();

  const name = $derived(engineName(engine ?? 'claude'));
  /** Its first word: « Claude » for Claude Code, « Copilot » for Copilot CLI. */
  const short = $derived(name.split(' ')[0]);
</script>

{#if always || showsMark()}
  <span
    class="mark"
    class:large
    data-engine={engine ?? 'claude'}
    role="img"
    aria-label={t('nav.sidebar.engineMark', { engine: name })}
    use:tip={{ text: t('nav.sidebar.engineMark', { engine: name }), aria: false }}>{short}</span
  >
{/if}

<style>
  .mark {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 5px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--line-2);
    color: var(--soft);
    font-size: 10.5px;
    font-weight: 560;
    line-height: 1;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  .mark.large {
    height: 20px;
    padding: 0 7px;
    font-size: 11.5px;
  }
</style>
