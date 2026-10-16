// The images pasted or dropped in a ticket's window: the images of the chat's attachments, with their limits. The backend
// keeps them as files of the ticket's folder, and its agent gets them with its first message.

import { MAX_TOTAL, imageType, readAttachment, sizeLabel } from './attachments';
import { t } from './i18n';
import type { DraftImage, TicketImageData } from './types';

/** An image of a ticket's form: one the ticket has (`file`), or one pasted or dropped (`data`). */
export interface FormImage {
  name: string;
  mediaType: string;
  /** Its file in the ticket's folder; empty for one pasted. */
  file: string;
  /** Base64, of one pasted; empty for one the ticket has. */
  data: string;
  /** What shows it; empty while the ticket's own is read. */
  url: string;
  /** In bytes; 0 while the ticket's own is read. */
  size: number;
}

/**
 * The most images a ticket takes, however small: its agent gets them all with its first message, which the API refuses past
 * about a hundred blocks. The backend refuses more as well; the form says so first.
 */
export const MAX_IMAGES = 20;

/** The file is no image: its form attaches it as a file instead (a PDF, or a « .png » that holds something else). */
export class NotImageError extends Error {}

/**
 * Reads an image pasted or dropped in the form, `have` being those it has already; rejects with the reason to show (a
 * `NotImageError` for a file that is none).
 */
export async function readTicketImage(f: File, have: FormImage[]): Promise<FormImage> {
  if (!imageType(f)) throw new NotImageError(t('board.form.images.notImage', { name: f.name }));
  // Before it is read: one more has no place, whatever its size.
  if (have.length >= MAX_IMAGES) throw new Error(t('board.form.images.tooMany', { name: f.name, max: MAX_IMAGES }));
  // Its size, as the chat refuses it.
  const a = await readAttachment(f);
  const mediaType = sniff(a.data);
  if (!mediaType) throw new NotImageError(t('board.form.images.notImage', { name: f.name }));
  if (have.reduce((n, x) => n + x.size, a.size) > MAX_TOTAL) {
    throw new Error(t('board.form.images.totalTooBig', { name: f.name, max: sizeLabel(MAX_TOTAL) }));
  }
  return { name: a.name, mediaType, file: '', data: a.data, url: `data:${mediaType};base64,${a.data}`, size: a.size };
}

/**
 * The type of the image of this content (base64), as its first bytes say; null for none. Not as its name or the system
 * say: the API refuses an image of another type than it is told, and with it every later turn of the agent's session.
 */
function sniff(data: string): string | null {
  const head = atob(data.slice(0, 16));
  const bytes = (...b: number[]) => b.every((x, i) => head.charCodeAt(i) === x);
  if (bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (bytes(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** An image the ticket has, read by the backend, as its form shows it. */
export function shownImage(i: TicketImageData): FormImage {
  const padding = i.data.length - i.data.replace(/=+$/, '').length;
  return {
    name: i.name,
    mediaType: i.mediaType,
    file: i.file,
    data: '',
    url: `data:${i.mediaType};base64,${i.data}`,
    size: (i.data.length / 4) * 3 - padding,
  };
}

/** What the form sends of its images: those the ticket keeps by their file, those pasted with their content. */
export function draftImages(images: FormImage[]): DraftImage[] {
  return images.map(({ name, mediaType, file, data }) => ({ name, mediaType, file, data: file ? '' : data }));
}

/** The images are no longer those the ticket had (`start`, their files in their order): one pasted, one taken away or moved. */
export function imagesChanged(images: FormImage[], start: string[]): boolean {
  return images.length !== start.length || images.some((i, n) => i.file !== start[n]);
}
