import { describe, expect, it } from 'vitest';
import { MAX_FILES, draftFiles, filesChanged, keptFile, ticketPlace, type FormFile } from './ticket-files';

const MB = 1024 * 1024;
/** A file that says it weighs `bytes`, without holding them. */
const weighing = (name: string, bytes: number, type = '') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
};
/** A file the form copied to a draft. */
const copied = (name = 'sources.zip', over: Partial<FormFile> = {}): FormFile => ({
  kind: 'file',
  name,
  mediaType: '',
  data: '',
  size: 4,
  kept: '',
  file: { name, size: 4, origin: false, path: `/data/attachments/_drafts/1f2e3d4c/${name}`, claudePath: '' },
  ...over,
});

describe('where a file of a ticket goes', () => {
  it('keeps the images the chat reads as images of the ticket, 5 MB at most', () => {
    expect(ticketPlace(weighing('capture.png', 1, 'image/png'))).toBe('image');
    expect(ticketPlace(weighing('photo.JPG', 5 * MB))).toBe('image');
    expect(ticketPlace(weighing('anim.gif', 1))).toBe('image');
    expect(ticketPlace(weighing('maquette.webp', 5 * MB, 'image/webp'))).toBe('image');
  });

  it('makes a file of an image over 5 MB, and of any other file', () => {
    expect(ticketPlace(weighing('photo.png', 5 * MB + 1, 'image/png'))).toBe('file');
    for (const name of ['rapport.pdf', 'sources.zip', 'budget.xlsx', 'notes.md', 'scan.bmp', 'film.mkv', 'Jenkinsfile']) {
      expect(ticketPlace(weighing(name, 1))).toBe('file');
    }
  });

  it('takes 20 files at most, as 20 images', () => {
    expect(MAX_FILES).toBe(20);
  });
});

describe('the files of a ticket in its form', () => {
  it('shows a file the ticket has as a chip kept by its file', () => {
    expect(keptFile({ name: 'budget.xlsx', file: 'ab12cd34/budget.xlsx', size: 2048 })).toEqual({
      kind: 'file',
      name: 'budget.xlsx',
      mediaType: '',
      data: '',
      size: 2048,
      kept: 'ab12cd34/budget.xlsx',
    });
  });

  it('sends those kept by their file, those copied by the path of their copy', () => {
    expect(draftFiles([keptFile({ name: 'a.xlsx', file: 'ab/a.xlsx', size: 1 }), copied('b.zip')])).toEqual([
      { name: 'a.xlsx', file: 'ab/a.xlsx', path: '' },
      { name: 'b.zip', file: '', path: '/data/attachments/_drafts/1f2e3d4c/b.zip' },
    ]);
  });

  it('sends nothing of a chip that has no copy yet or any more', () => {
    expect(draftFiles([copied('a.zip', { file: undefined })])).toEqual([]);
  });

  it('tells when they are no longer those the ticket had (`start`, their files in their order)', () => {
    const a = keptFile({ name: 'a', file: 'ab/a', size: 1 });
    const b = keptFile({ name: 'b', file: 'cd/b', size: 1 });
    expect(filesChanged([a, b], ['ab/a', 'cd/b'])).toBe(false);
    expect(filesChanged([], [])).toBe(false);
    expect(filesChanged([b, a], ['ab/a', 'cd/b'])).toBe(true);
    expect(filesChanged([a], ['ab/a', 'cd/b'])).toBe(true);
    expect(filesChanged([a, b, copied()], ['ab/a', 'cd/b'])).toBe(true);
    expect(filesChanged([copied()], [])).toBe(true);
  });
});
