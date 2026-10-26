// The shared Kanban's actions (ESC-190): share a ticket or stop, asking the user's name first when none was given.

import { t } from './i18n';
import { api } from './ipc';
import { myName, sharedFile } from './sharing';
import { app } from './state.svelte';
import type { Project, Ticket } from './types';

/**
 * « Partager avec l'équipe » (`on`) or « Arrêter le partage » of a ticket of ours, then the notification that says which
 * file is to be committed. Without a name yet, the first launch's window asks it, then shares.
 */
export async function shareTicket(ticket: Ticket, project: Project, on: boolean): Promise<void> {
  if (on && !myName(app.settings, project)) {
    app.modal = { kind: 'teamName', projectId: project.id, then: () => void shareTicket(ticket, project, true) };
    return;
  }
  const done = await app.run(api.ticketShare(ticket.id, on));
  if (!done) return;
  app.tickets[done.id] = done;
  if (on) {
    app.toast(t('share.toast.shared', { key: done.key, file: sharedFile(done) ?? '' }), 'ok');
  } else app.toast(t('share.toast.unshared', { key: done.key }), 'ok');
}
