// The files other than images pasted, dropped or picked in a ticket's window: the backend keeps them as copies in the
// ticket's folder (first in the drafts, where the form copies them at once), and its agent gets their paths with its first
// message. The images the chat reads stay the images of the ticket (`ticket-images.ts`).

import { MAX_IMAGE, imageType, type DraftAttachment } from './attachments';
import type { DraftFile, TicketFile } from './types';

/** The most files a ticket takes (as many as images): its agent gets a line for each with its first message. */
export const MAX_FILES = 20;

/**
 * A file of a ticket's form, drawn as the chat's chips are: one the ticket has (`kept`, its file in the ticket's folder; no
 * `file`), or a copy the form made in the drafts (`file`; `kept` empty), whose chip stands for it while it is written.
 */
export interface FormFile extends DraftAttachment {
  kept: string;
}

/** Where a file of a ticket goes: an image the chat reads shows as an image of the ticket, anything else is a file. */
export function ticketPlace(f: File): 'image' | 'file' {
  return imageType(f) && f.size <= MAX_IMAGE ? 'image' : 'file';
}

/** A file the ticket has, as its form shows it. */
export function keptFile(f: TicketFile): FormFile {
  return { kind: 'file', name: f.name, mediaType: '', data: '', size: f.size, kept: f.file };
}

/** What the form sends of its files: those the ticket keeps by their file, the copies by their path (once they are made). */
export function draftFiles(files: FormFile[]): DraftFile[] {
  return files.flatMap((f) => {
    if (f.kept) return [{ name: f.name, file: f.kept, path: '' }];
    return f.file ? [{ name: f.name, file: '', path: f.file.path }] : [];
  });
}

/** The files are no longer those the ticket had (`start`, their files in their order): one added, one taken away or moved. */
export function filesChanged(files: FormFile[], start: string[]): boolean {
  return files.length !== start.length || files.some((f, n) => f.kept !== start[n]);
}
