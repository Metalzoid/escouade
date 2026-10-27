// The messages typed in an agent's composer during its turn, kept by the window for as long as they can be: the delay
// of « Délai avant l’envoi pendant un tour » for a harness that reads them at its turn's next step (Claude Code, Codex,
// Copilot CLI), the end of the turn for one that waits for it anyway (Cursor, OpenCode: `midTurn` `turnEnd`). Until
// then each can be edited (given back to the composer), cancelled, or sent at once; the backend hears of it only once
// it goes, the composer's own way (`sendDraft`), so nothing is ever taken out of a conversation.

import type { DraftAttachment } from './attachments';
import { flushDrafts, giveBack } from './drafts';
import { capsOf } from './engines';
import { api } from './ipc';
import { reportRefusal, sendDraft } from './send.svelte';
import { app, atWork } from './state.svelte';
import type { Agent } from './types';

/** `delay`: it goes once its delay is over; `turnEnd`: at the end of the turn, one per end. */
export type HoldMode = 'delay' | 'turnEnd';

export interface Held {
  id: string;
  agentId: string;
  body: string;
  files: DraftAttachment[];
  mode: HoldMode;
  /** When it goes, in ms since the epoch; null for one that waits for the end of the turn. */
  at: number | null;
}

/** By agent, oldest first. Raw: the attachments it holds are not the window's to watch. */
let held = $state.raw<Record<string, Held[]>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** The sends of each agent, one after the other: a message held never overtakes one held before it. */
const chains = new Map<string, Promise<void>>();
let seq = 0;

export function heldOf(agentId: string): Held[] {
  return held[agentId] ?? [];
}

/**
 * How a message typed now in the composer of `agent` is held, or null when it goes at once: behind one still held
 * (even at rest), as that one is; during a turn, as its harness takes such a message. Never during the preparation of
 * its worktree, which holds it its own way, nor for a harness that refuses it.
 */
export function holdModeOf(agent: Agent): HoldMode | null {
  const before = heldOf(agent.id).at(-1);
  if (before) return before.mode;
  if (!atWork(agent) || agent.setup || agent.worktreePending) return null;
  switch (capsOf(agent.engine)?.midTurn) {
    case 'turnEnd':
      return 'turnEnd';
    case 'queued':
    case 'immediate':
      return app.settings.midTurnDelaySecs > 0 ? 'delay' : null;
    default:
      return null;
  }
}

export function hold(agentId: string, body: string, files: DraftAttachment[], mode: HoldMode): Held {
  const delay = Math.max(0, app.settings.midTurnDelaySecs) * 1000;
  const h: Held = { id: `held-${++seq}`, agentId, body, files, mode, at: mode === 'delay' ? Date.now() + delay : null };
  put(agentId, [...heldOf(agentId), h]);
  if (mode === 'delay')
    timers.set(
      h.id,
      setTimeout(() => sendNow(h.id), delay),
    );
  return h;
}

/** Sends the message `id` now, and before it the ones of its agent held before it. */
export function sendNow(id: string) {
  const h = find(id);
  if (!h) return;
  const list = heldOf(h.agentId);
  for (const m of list.slice(0, list.indexOf(h) + 1)) release(m);
}

/** Gives the message back to its agent's composer, before what was typed there since, and sends nothing. */
export function editHeld(id: string) {
  const h = find(id);
  if (!h) return;
  drop(h);
  giveBack(h.agentId, h.body, h.files);
  app.focusComposer++;
}

/** Drops the message, and the copies of the files it joined (never a file joined where it is). */
export function cancelHeld(id: string) {
  const h = find(id);
  if (!h) return;
  drop(h);
  for (const f of h.files) if (f.file && !f.file.origin) api.attachDiscard(h.agentId, f.file.path).catch(() => {});
}

/** Gives every message held for `agentId` back to its draft, sending none (an agent being archived), in their order. */
export function returnHeld(agentId: string) {
  // Each goes before what the draft holds: the newest first, so that the oldest ends at its head.
  for (const h of [...heldOf(agentId)].reverse()) {
    drop(h);
    giveBack(agentId, h.body, h.files);
  }
}

function find(id: string): Held | undefined {
  for (const list of Object.values(held)) {
    const h = list.find((m) => m.id === id);
    if (h) return h;
  }
}

function put(agentId: string, list: Held[]) {
  const { [agentId]: _, ...rest } = held;
  held = list.length ? { ...rest, [agentId]: list } : rest;
}

/** Takes the message out of the outbox, its timer with it. */
function drop(h: Held) {
  clearTimeout(timers.get(h.id));
  timers.delete(h.id);
  put(
    h.agentId,
    heldOf(h.agentId).filter((m) => m.id !== h.id),
  );
}

function release(h: Held) {
  drop(h);
  const before = chains.get(h.agentId) ?? Promise.resolve();
  const mine = before.then(() => deliver(h));
  chains.set(h.agentId, mine);
  void mine.then(() => {
    if (chains.get(h.agentId) === mine) chains.delete(h.agentId);
  });
}

async function deliver(h: Held) {
  const agent = app.agents[h.agentId];
  // Removed meanwhile: nothing to send to. Archived: it reads nothing more, the message waits in its draft.
  if (!agent) return;
  if (agent.archived) return giveBack(h.agentId, h.body, h.files);
  try {
    await sendDraft(h.agentId, h.body, h.files);
  } catch (e) {
    giveBack(h.agentId, h.body, h.files);
    reportRefusal(h.agentId, e);
  }
}

/** The end of a turn: the first message waiting for it goes, and starts the next (an archived agent's go back to its draft). */
function turnEnded(agentId: string) {
  if (app.agents[agentId]?.archived) return returnHeld(agentId);
  const first = heldOf(agentId).find((m) => m.mode === 'turnEnd');
  if (first) release(first);
}

/** The window closing or reloading, or the app restarting for an update: what is held is written in the drafts. */
function returnAll() {
  for (const agentId of Object.keys(held)) returnHeld(agentId);
  flushDrafts();
}

app.onTurnEnded(turnEnded);
app.onAgentRemoved((agentId) => {
  for (const h of heldOf(agentId)) drop(h);
});
app.onRestartWarned(returnAll);
if (typeof window !== 'undefined') window.addEventListener('pagehide', returnAll);
