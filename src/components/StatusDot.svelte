<script lang="ts">
  import type { AgentStatus } from '../lib/types';

  // The state of an agent in a dot (2.0 design): full while it works (green), asks (amber, its ring breathing) or failed
  // (red); a ring once ready or done; `awaits`, a turn over with work still going on (« Attend », « Réveil à … »): the
  // empty ring of the green of work. Nothing moves with prefers-reduced-motion.
  let { status, size = 8, awaits = false }: { status: AgentStatus; size?: number; awaits?: boolean } = $props();
</script>

<i class="state-dot {status}" class:awaits data-status={status} style:--size="{size}px" aria-hidden="true"></i>

<style>
  .state-dot {
    --tone: var(--run);
    position: relative;
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--tone);
  }
  .waiting {
    --tone: var(--wait);
  }
  .error {
    --tone: var(--del);
  }
  .idle {
    --tone: var(--idle);
  }
  .done {
    --tone: var(--done);
    width: calc(var(--size) + 1px);
    height: calc(var(--size) + 1px);
  }
  .idle,
  .done,
  .awaits {
    background: none;
    box-shadow: inset 0 0 0 1.5px var(--tone);
  }
  .awaits {
    --tone: var(--run);
  }
  .waiting::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1.5px solid var(--wait);
    animation: ring 2.2s var(--ease) infinite;
  }
  @keyframes ring {
    0% {
      transform: scale(0.5);
      opacity: 0.9;
    }
    70%,
    100% {
      transform: scale(1.35);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .waiting::after {
      animation: none;
      opacity: 0.45;
    }
  }
</style>
