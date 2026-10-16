import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { MAX_IMAGES, NotImageError, draftImages, imagesChanged, readTicketImage, shownImage, type FormImage } from './ticket-images';

const MB = 1024 * 1024;
const file = (name: string, type = '', body: BlobPart = 'x') => new File([body], name, { type });
/** The first bytes of a PNG and of a JPEG: what make their content one. */
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
/** A file that says it weighs `bytes`. */
const weighing = (name: string, bytes: number) => {
  const f = file(name, 'image/png', new Uint8Array(PNG));
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
};
const pasted = (over: Partial<FormImage> = {}): FormImage => ({
  name: 'capture.png',
  mediaType: 'image/png',
  file: '',
  data: 'iVBO',
  url: 'data:image/png;base64,iVBO',
  size: 3,
  ...over,
});

describe('readTicketImage', () => {
  afterEach(() => setLang('fr'));

  it('reads an image pasted or dropped, with its preview', async () => {
    const i = await readTicketImage(file('capture.png', 'image/png', new Uint8Array(PNG)), []);
    expect(i).toEqual({
      name: 'capture.png',
      mediaType: 'image/png',
      file: '',
      data: b64(PNG),
      url: `data:image/png;base64,${b64(PNG)}`,
      size: 8,
    });
    // Windows often gives no type: the extension says it.
    expect((await readTicketImage(file('photo.JPG', '', new Uint8Array(JPEG)), [])).mediaType).toBe('image/jpeg');
  });

  it('takes its type from its content, which the API checks, and refuses one that is no image', async () => {
    const i = await readTicketImage(file('capture.png', 'image/png', new Uint8Array(JPEG)), []);
    expect(i).toMatchObject({ name: 'capture.png', mediaType: 'image/jpeg', url: `data:image/jpeg;base64,${b64(JPEG)}` });
    for (const body of ['bonjour', '', new Uint8Array(PNG.slice(0, 4))]) {
      await expect(readTicketImage(file('x.png', 'image/png', body), [])).rejects.toThrow(
        "« x.png » n'est pas une image : un ticket prend les images PNG, JPEG, GIF et WebP.",
      );
    }
    const gif = await readTicketImage(file('a.gif', '', 'GIF89a...'), []);
    expect(gif.mediaType).toBe('image/gif');
    const webp = await readTicketImage(file('a.webp', '', 'RIFF' + '\0'.repeat(4) + 'WEBPVP8 '), []);
    expect(webp.mediaType).toBe('image/webp');
  });

  it('says with its own kind of error that a file is no image, which the form attaches as a file instead', async () => {
    for (const f of [file('x.png', 'image/png', 'bonjour'), file('rapport.pdf', 'application/pdf', '%PDF-1.4')]) {
      await expect(readTicketImage(f, [])).rejects.toBeInstanceOf(NotImageError);
    }
    // Any other reason to refuse an image is the user's to read.
    const full = Array.from({ length: 20 }, () => pasted());
    const refused = await readTicketImage(file('x.png', 'image/png', new Uint8Array(PNG)), full).catch((e) => e);
    expect(refused).toBeInstanceOf(Error);
    expect(refused).not.toBeInstanceOf(NotImageError);
  });

  it('takes the images of the chat alone, no other file', async () => {
    await expect(readTicketImage(file('rapport.pdf', 'application/pdf', '%PDF-1.4'), [])).rejects.toThrow(
      "« rapport.pdf » n'est pas une image : un ticket prend les images PNG, JPEG, GIF et WebP.",
    );
    await expect(readTicketImage(file('scan.bmp', 'image/bmp'), [])).rejects.toThrow(/scan\.bmp/);
    await expect(readTicketImage(file('notes.md', '', '# Notes'), [])).rejects.toThrow(/notes\.md/);
  });

  it('keeps to the limits of the chat: 5 MB an image, 18 MB in all', async () => {
    await expect(readTicketImage(weighing('photo.png', 5 * MB + 1), [])).rejects.toThrow('photo.png dépasse 5 Mo');
    const have = [pasted({ size: 5 * MB }), pasted({ size: 5 * MB }), pasted({ size: 5 * MB })];
    await expect(readTicketImage(weighing('quatre.png', 3 * MB + 1), have)).rejects.toThrow(
      "quatre.png n'est pas ajoutée : les images d'un ticket sont limitées à 18 Mo en tout.",
    );
    await expect(readTicketImage(weighing('quatre.png', 3 * MB), have)).resolves.toMatchObject({ name: 'quatre.png' });
  });

  it('takes 20 images at most, however small, before it reads the one more', async () => {
    expect(MAX_IMAGES).toBe(20);
    const twenty = Array.from({ length: 20 }, () => pasted());
    await expect(readTicketImage(file('vingt-et-un.png', 'image/png', new Uint8Array(PNG)), twenty)).rejects.toThrow(
      "vingt-et-un.png n'est pas ajoutée : un ticket prend 20 images au plus.",
    );
    // Refused before it is read: one too big says it has no place, not that it is too big.
    await expect(readTicketImage(weighing('enorme.png', 5 * MB + 1), twenty)).rejects.toThrow(
      "enorme.png n'est pas ajoutée : un ticket prend 20 images au plus.",
    );
    await expect(readTicketImage(file('vingtieme.png', 'image/png', new Uint8Array(PNG)), twenty.slice(1))).resolves.toMatchObject({
      name: 'vingtieme.png',
    });
  });

  it('says why in English', async () => {
    setLang('en');
    await expect(readTicketImage(file('rapport.pdf', 'application/pdf'), [])).rejects.toThrow(
      '“rapport.pdf” isn’t an image: a ticket takes PNG, JPEG, GIF and WebP images.',
    );
    const have = [pasted({ size: 18 * MB })];
    await expect(readTicketImage(weighing('b.png', 1), have)).rejects.toThrow(
      'b.png wasn’t added: a ticket’s images are limited to 18 MB in total.',
    );
    await expect(
      readTicketImage(
        weighing('c.png', 1),
        Array.from({ length: 20 }, () => pasted()),
      ),
    ).rejects.toThrow('c.png wasn’t added: a ticket takes 20 images at most.');
  });
});

describe('the images of a ticket in its form', () => {
  it('shows an image the ticket has, by its file', () => {
    expect(shownImage({ file: 'a1.png', name: 'capture.png', mediaType: 'image/png', data: 'iVBORw==' })).toEqual({
      name: 'capture.png',
      mediaType: 'image/png',
      file: 'a1.png',
      data: '',
      url: 'data:image/png;base64,iVBORw==',
      size: 4,
    });
  });

  it('sends those kept by their file, those pasted with their content', () => {
    expect(draftImages([pasted({ file: 'a1.png', data: '' }), pasted({ name: 'b.gif', mediaType: 'image/gif', data: 'R0lG' })])).toEqual([
      { name: 'capture.png', mediaType: 'image/png', file: 'a1.png', data: '' },
      { name: 'b.gif', mediaType: 'image/gif', file: '', data: 'R0lG' },
    ]);
  });

  it('tells when they are no longer those the ticket had', () => {
    const a1 = pasted({ file: 'a1.png', data: '' });
    const b2 = pasted({ file: 'b2.png', data: '' });
    expect(imagesChanged([a1, b2], ['a1.png', 'b2.png'])).toBe(false);
    expect(imagesChanged([], [])).toBe(false);
    expect(imagesChanged([b2, a1], ['a1.png', 'b2.png'])).toBe(true);
    expect(imagesChanged([a1], ['a1.png', 'b2.png'])).toBe(true);
    expect(imagesChanged([a1, b2, pasted()], ['a1.png', 'b2.png'])).toBe(true);
    expect(imagesChanged([pasted()], [])).toBe(true);
  });
});
