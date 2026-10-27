// A message of a draft sent to its agent, and what is said when the backend refuses it: the composer's and the
// outbox's (a message held during a turn, sent once its wait is over).

import type { DraftAttachment } from './attachments';
import { conversationOf } from './conversations.svelte';
import { api } from './ipc';
import { errorText, missingAccountOf } from './refusal';
import { app } from './state.svelte';

/** Sends `body` with the attachments of a draft: the ones read in the message, then the files joined by their path. */
export function sendDraft(agentId: string, body: string, files: DraftAttachment[]): Promise<void> {
  return api.sendMessage(
    agentId,
    body,
    files.filter((f) => f.kind !== 'file').map(({ name, mediaType, data }) => ({ name, mediaType, data })),
    files.filter((f) => f.file).map((f) => $state.snapshot(f.file!)),
  );
}

/** Says why a message to `owner` was refused: for want of an account of its harness, in its conversation (choice 19), else in a toast. */
export function reportRefusal(owner: string, e: unknown) {
  const missing = missingAccountOf(e);
  if (missing) conversationOf(owner).noAccount = { engine: missing, text: errorText(e) };
  else app.toast(errorText(e), 'error');
}
