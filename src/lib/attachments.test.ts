import { describe, expect, it } from 'vitest';
import { fakeBackend } from '../test/ipc';
import {
  CHUNK,
  type AttachSettings,
  attachByPath,
  attachmentKind,
  copyToDisk,
  fileCategory,
  guardFileDrops,
  inMessageBytes,
  planAttachment,
  planByPath,
  readAttachment,
  readForMessage,
  sizeLabel,
} from './attachments';
import { setLang } from './i18n';
import type { AttachedFile } from './types';

const file = (name: string, type = '', body: BlobPart = 'x') => new File([body], name, { type });
/** A file that says it has `size` bytes, without holding them. */
const sized = (name: string, size: number, type = '') => {
  const f = file(name, type);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const MB = 1024 * 1024;

describe('attachmentKind', () => {
  it('recognises the images the API reads, PDFs and text files', () => {
    expect(attachmentKind(file('capture.png', 'image/png'))).toBe('image');
    expect(attachmentKind(file('photo.JPG'))).toBe('image');
    expect(attachmentKind(file('rapport.pdf', 'application/pdf'))).toBe('pdf');
    expect(attachmentKind(file('rapport.pdf'))).toBe('pdf');
    expect(attachmentKind(file('data.json', 'application/json'))).toBe('text');
    expect(attachmentKind(file('journal', 'text/plain'))).toBe('text');
    expect(attachmentKind(file('Dockerfile'))).toBe('text');
  });

  it('goes by the extension first, as Windows often gives no type or a wrong one', () => {
    expect(attachmentKind(file('notes.md'))).toBe('text');
    expect(attachmentKind(file('script.ps1'))).toBe('text');
    // The Windows registry maps .ts to MPEG transport streams.
    expect(attachmentKind(file('app.ts', 'video/mp2t'))).toBe('text');
    expect(attachmentKind(file('export.csv', 'application/vnd.ms-excel'))).toBe('text');
  });

  it('refuses the rest', () => {
    expect(attachmentKind(file('plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBeNull();
    expect(attachmentKind(file('sources.zip', 'application/zip'))).toBeNull();
    expect(attachmentKind(file('setup.exe'))).toBeNull();
    expect(attachmentKind(file('scan.bmp', 'image/bmp'))).toBeNull();
    expect(attachmentKind(file('x.constructor'))).toBeNull();
  });
});

describe('readAttachment', () => {
  it('reads a text file as text, whatever its type', async () => {
    const a = await readAttachment(file('notes.md', '', '# Notes\nà faire'));
    expect(a).toMatchObject({ kind: 'text', name: 'notes.md', mediaType: 'text/plain', data: '# Notes\nà faire' });
  });

  it('reads a PDF as base64', async () => {
    const a = await readAttachment(file('rapport.pdf', '', '%PDF-1.4'));
    expect(a).toMatchObject({ kind: 'pdf', name: 'rapport.pdf', mediaType: 'application/pdf', data: btoa('%PDF-1.4') });
  });

  it('keeps an image preview', async () => {
    const a = await readAttachment(file('capture.png', 'image/png', new Uint8Array([137, 80, 78, 71])));
    expect(a.kind).toBe('image');
    expect(a.url).toMatch(/^data:image\/png;base64,/);
    expect(a.data).toBe(a.url!.slice(a.url!.indexOf(',') + 1));
  });

  it('says which files are supported when one is not', async () => {
    await expect(readAttachment(file('sources.zip', 'application/zip'))).rejects.toThrow(/sources\.zip.*images.*PDF.*texte/);
  });

  it('reads the text encodings Windows writes, and refuses binary content', async () => {
    // Excel's CSV exports on a French Windows: Windows-1252.
    const csv = await readAttachment(file('export.csv', '', new Uint8Array([0x63, 0xe9, 0x74, 0xe9, 0x80])));
    expect(csv.data).toBe('cété€');
    // PowerShell 5's Out-File: UTF-16 with its BOM.
    const log = await readAttachment(file('out.txt', '', new Uint8Array([0xff, 0xfe, 0x6f, 0, 0x6b, 0])));
    expect(log.data).toBe('ok');
    await expect(readAttachment(file('binaire.log', '', new Uint8Array([0x61, 0, 0x62])))).rejects.toThrow(/binaire\.log/);
  });

  it('reads as text a file of no known kind that Windows gives no type, when it is text', async () => {
    expect(await readAttachment(file('.env.local', '', 'PORT=3000'))).toMatchObject({ kind: 'text', data: 'PORT=3000' });
    expect(await readAttachment(file('Jenkinsfile', '', 'pipeline {}'))).toMatchObject({ kind: 'text' });
    const binary = file('data.bin', '', new Uint8Array([0x61, 0, 0x62]));
    await expect(readAttachment(binary)).rejects.toThrow(/data\.bin.*images.*PDF.*texte/);
    // Only known text files get the Windows-1252 reading: this is not UTF-8, so not text.
    await expect(readAttachment(file('blob.xyz', '', new Uint8Array([0xe9, 0x80, 0x41])))).rejects.toThrow(/blob\.xyz/);
    // A type from the system is trusted.
    await expect(readAttachment(file('sources.zip', 'application/zip', 'PK'))).rejects.toThrow(/sources\.zip/);
  });

  it('refuses a file over the size limit of its kind', async () => {
    const big = (name: string, kb: number) => {
      const f = file(name);
      Object.defineProperty(f, 'size', { value: kb * 1024 + 1 });
      return f;
    };
    await expect(readAttachment(big('capture.png', 5 * 1024))).rejects.toThrow('capture.png dépasse 5 Mo');
    // Within what a whole message may carry (18 MB, sent in base64 under the API's 32 MB).
    await expect(readAttachment(big('rapport.pdf', 18 * 1024))).rejects.toThrow('rapport.pdf dépasse 18 Mo');
    // More text would fill Claude's context.
    await expect(readAttachment(big('notes.md', 256))).rejects.toThrow('notes.md dépasse 256 Ko');
  });
});

describe('guardFileDrops', () => {
  const drag = (type: string, types: string[]) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types, dropEffect: 'copy' } });
    return e as DragEvent;
  };

  it('keeps a file dropped outside the composer from replacing the app', () => {
    const stop = guardFileDrops(window);
    try {
      const over = drag('dragover', ['Files']);
      document.body.dispatchEvent(over);
      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer!.dropEffect).toBe('none');
      const drop = drag('drop', ['Files']);
      document.body.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      // Dragging text into a field keeps working.
      const text = drag('drop', ['text/plain']);
      document.body.dispatchEvent(text);
      expect(text.defaultPrevented).toBe(false);
    } finally {
      stop();
    }
  });

  it('lets a drop zone accept the file', () => {
    const stop = guardFileDrops(window);
    const zone = document.createElement('div');
    document.body.append(zone);
    zone.addEventListener('dragover', (e) => e.preventDefault());
    try {
      const over = drag('dragover', ['Files']);
      zone.dispatchEvent(over);
      expect(over.dataTransfer!.dropEffect).toBe('copy');
    } finally {
      stop();
      zone.remove();
    }
  });
});

describe('the sizes and the refusals in English', () => {
  const big = (name: string, kb: number) => {
    const f = file(name);
    Object.defineProperty(f, 'size', { value: kb * 1024 + 1 });
    return f;
  };

  it('writes a size with the unit of each language', () => {
    expect(sizeLabel(5 * 1024 * 1024)).toBe('5 Mo');
    expect(sizeLabel(256 * 1024)).toBe('256 Ko');
    setLang('en');
    expect(sizeLabel(5 * 1024 * 1024)).toBe('5 MB');
    expect(sizeLabel(256 * 1024)).toBe('256 KB');
  });

  it('says in English why a file cannot be attached', async () => {
    setLang('en');
    await expect(readAttachment(file('sources.zip', 'application/zip', 'PK'))).rejects.toThrow(
      '“sources.zip” can’t be attached. Supported files are images (PNG, JPEG, GIF, WebP), PDFs and text files.',
    );
    await expect(readAttachment(big('capture.png', 5 * 1024))).rejects.toThrow('capture.png is over 5 MB');
    await expect(readAttachment(big('notes.md', 256))).rejects.toThrow('notes.md is over 256 KB');
    await expect(readAttachment(file('binary.log', '', new Uint8Array([0x61, 0, 0x62])))).rejects.toThrow(
      'binary.log isn’t a text file, so it can’t be attached.',
    );
  });
});

describe('planAttachment: what is done with a file', () => {
  const SETTINGS: AttachSettings = { attachMaxMb: 0, attachWarnMb: 200, attachBigText: 'path' };
  const plan = (f: File, over: Partial<AttachSettings> = {}, messageBytes = 0) =>
    planAttachment(f, { settings: { ...SETTINGS, ...over }, messageBytes });

  it('keeps in the message what the API reads, up to its limits', () => {
    expect(plan(sized('capture.png', 5 * MB, 'image/png'))).toEqual({ kind: 'image', warn: false });
    expect(plan(sized('rapport.pdf', 18 * MB, 'application/pdf'))).toEqual({ kind: 'pdf', warn: false });
    expect(plan(sized('notes.md', 256 * 1024))).toEqual({ kind: 'text', warn: false });
  });

  it('attaches by its path an image over 5 Mo, a PDF over 18 Mo and a text over 256 Ko', () => {
    expect(plan(sized('ecran-5k.png', 5 * MB + 1, 'image/png'))).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('livre.pdf', 18 * MB + 1, 'application/pdf'))).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('journal.log', 256 * 1024 + 1))).toEqual({ kind: 'file', warn: false });
  });

  it('refuses a text over 256 Ko when the setting says so, and only a text', () => {
    const refuse: Partial<AttachSettings> = { attachBigText: 'refuse' };
    expect(plan(sized('journal.log', 256 * 1024 + 1), refuse)).toEqual({ refusal: 'journal.log dépasse 256 Ko' });
    expect(plan(sized('journal.log', 256 * 1024), refuse)).toEqual({ kind: 'text', warn: false });
    expect(plan(sized('ecran-5k.png', 5 * MB + 1, 'image/png'), refuse)).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('sources.zip', 300 * 1024), refuse)).toEqual({ kind: 'file', warn: false });
    // Wherever a file goes by its path (a ticket's form, the terminal), the same refusal applies.
    expect(planByPath(sized('journal.log', 256 * 1024 + 1), { ...SETTINGS, ...refuse })).toEqual({
      refusal: 'journal.log dépasse 256 Ko',
    });
    expect(planByPath(sized('journal.log', 256 * 1024 + 1), SETTINGS)).toEqual({ kind: 'file', warn: false });
  });

  it('attaches by its path any file the API does not read', () => {
    for (const name of ['sources.zip', 'budget.xlsx', 'demo.mp4', 'setup.exe', 'scan.bmp', 'plan.docx', 'x.constructor']) {
      expect(plan(sized(name, 3 * MB)), name).toEqual({ kind: 'file', warn: false });
    }
    // Windows gives these a type, and it is trusted: not text.
    expect(plan(sized('data.bin', 10 * 1024, 'application/zip'))).toEqual({ kind: 'file', warn: false });
  });

  it('takes for text, until it is read, a file of no kind that Windows gives no type', () => {
    expect(plan(sized('.env.local', 100))).toEqual({ kind: 'text', warn: false });
    expect(plan(sized('Jenkinsfile', 100, 'application/octet-stream'))).toEqual({ kind: 'text', warn: false });
    expect(plan(sized('Jenkinsfile', 256 * 1024 + 1))).toEqual({ kind: 'file', warn: false });
  });

  it('sends by its path what no longer fits the 18 Mo of the message, the last file first', () => {
    // 10 + 8 is all the message takes: the next one goes by its path.
    expect(plan(sized('a.pdf', 8 * MB, 'application/pdf'), {}, 10 * MB)).toEqual({ kind: 'pdf', warn: false });
    expect(plan(sized('b.pdf', 8 * MB + 1, 'application/pdf'), {}, 10 * MB)).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('c.png', 1, 'image/png'), {}, 18 * MB)).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('notes.md', 10, ''), {}, 18 * MB)).toEqual({ kind: 'file', warn: false });
  });

  it('refuses a file over the maximum size, which is none at 0', () => {
    expect(plan(sized('film.mkv', 5000 * MB), { attachMaxMb: 0 })).toEqual({ kind: 'file', warn: true });
    expect(plan(sized('film.mkv', 100 * MB), { attachMaxMb: 100 })).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('film.mkv', 100 * MB + 1), { attachMaxMb: 100 })).toEqual({ refusal: 'film.mkv dépasse 100 Mo' });
    // A text sent by its path has the same limit.
    expect(plan(sized('dump.sql', 300 * 1024 + 1), { attachMaxMb: 0 })).toEqual({ kind: 'file', warn: false });
  });

  it('warns past the threshold, which is never at 0, and warns of nothing in the message', () => {
    expect(plan(sized('film.mkv', 200 * MB))).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('film.mkv', 200 * MB + 1))).toEqual({ kind: 'file', warn: true });
    expect(plan(sized('film.mkv', 50 * MB + 1), { attachWarnMb: 50 })).toEqual({ kind: 'file', warn: true });
    expect(plan(sized('film.mkv', 5000 * MB), { attachWarnMb: 0 })).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('capture.png', 3 * MB, 'image/png'), { attachWarnMb: 1 })).toEqual({ kind: 'image', warn: false });
  });

  it('attaches an empty file', () => {
    expect(plan(sized('vide.zip', 0, 'application/zip'))).toEqual({ kind: 'file', warn: false });
    expect(plan(sized('vide.txt', 0))).toEqual({ kind: 'text', warn: false });
  });

  it('refuses in English too', () => {
    setLang('en');
    expect(plan(sized('film.mkv', 2 * MB + 1), { attachMaxMb: 2 })).toEqual({ refusal: 'film.mkv is over 2 MB' });
  });
});

describe('inMessageBytes', () => {
  it('counts what the message holds, not the files sent by their path', () => {
    const a = (kind: 'image' | 'pdf' | 'text' | 'file', size: number) => ({ kind, size, name: 'x', mediaType: '', data: '' });
    expect(inMessageBytes([a('image', 10), a('file', 500 * MB), a('pdf', 5), a('text', 1)])).toBe(16);
    expect(inMessageBytes([])).toBe(0);
  });
});

describe('fileCategory', () => {
  it('tells an archive, a spreadsheet, a document, a video, a sound and code from the rest, by extension', () => {
    expect(fileCategory('sources.zip')).toBe('archive');
    expect(fileCategory('backup.TAR.GZ')).toBe('archive');
    expect(fileCategory('budget.xlsx')).toBe('sheet');
    expect(fileCategory('export.csv')).toBe('sheet');
    expect(fileCategory('plan.docx')).toBe('document');
    expect(fileCategory('rapport.pdf')).toBe('document');
    expect(fileCategory('notes.md')).toBe('document');
    expect(fileCategory('demo.mp4')).toBe('video');
    expect(fileCategory('memo.m4a')).toBe('audio');
    expect(fileCategory('main.rs')).toBe('code');
    expect(fileCategory('config.json')).toBe('code');
    expect(fileCategory('Dockerfile')).toBe('code');
  });

  it('gives any other file, or none with an extension, the generic one', () => {
    expect(fileCategory('setup.exe')).toBe('generic');
    expect(fileCategory('scan.bmp')).toBe('generic');
    expect(fileCategory('LISEZMOI')).toBe('generic');
    expect(fileCategory('x.constructor')).toBe('generic');
  });
});

describe('readForMessage', () => {
  it('reads each kind as the message carries it', async () => {
    expect(await readForMessage(file('notes.md', '', 'à faire'), 'text')).toMatchObject({ kind: 'text', data: 'à faire', size: 8 });
    expect(await readForMessage(file('rapport.pdf', '', '%PDF-1.4'), 'pdf')).toMatchObject({ kind: 'pdf', data: btoa('%PDF-1.4') });
    const png = await readForMessage(file('capture.png', 'image/png', new Uint8Array([137, 80])), 'image');
    expect(png?.url).toMatch(/^data:image\/png;base64,/);
  });

  it('gives null for a text that is not one, to be attached by its path', async () => {
    expect(await readForMessage(file('binaire.log', '', new Uint8Array([0x61, 0, 0x62])), 'text')).toBeNull();
    expect(await readForMessage(file('data.bin', '', new Uint8Array([0xe9, 0x80, 0x41])), 'text')).toBeNull();
  });
});

describe('copyToDisk', () => {
  const copy: AttachedFile = {
    name: 'archive.bin',
    path: '/data/a1/1f2e/archive.bin',
    claudePath: '/data/a1/1f2e/archive.bin',
    size: 10 * MB,
    origin: false,
  };

  /** A file of `size` bytes, each the number of its 4 Mo chunk. */
  const patterned = (size: number) => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(i / CHUNK) + 1;
    return new File([bytes], 'archive.bin');
  };

  it('copies by chunks of 4 Mo, in order, and tells how far it went', async () => {
    expect(CHUNK).toBe(4 * MB);
    const chunks: Uint8Array[] = [];
    const backend = fakeBackend({
      attach_open: () => 'h1',
      attach_chunk: (bytes: Uint8Array) => void chunks.push(bytes),
      attach_finish: () => copy,
    });
    const progress: number[] = [];
    const done = await copyToDisk(patterned(10 * MB), 'a1', { onProgress: (n) => progress.push(n) });
    expect(done).toEqual(copy);
    expect(backend.called('attach_open')[0].args).toEqual({ owner: 'a1', name: 'archive.bin', size: 10 * MB });
    expect(chunks.map((c) => c.byteLength)).toEqual([4 * MB, 4 * MB, 2 * MB]);
    expect(chunks.map((c) => [c[0], c[c.length - 1]])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(progress).toEqual([4 * MB, 8 * MB, 10 * MB]);
    expect(backend.called('attach_finish')[0].args).toEqual({ handle: 'h1' });
    expect(backend.called('attach_cancel')).toHaveLength(0);
  });

  it('opens and finishes a file with no content, without a chunk', async () => {
    const backend = fakeBackend({ attach_open: () => 'h1', attach_finish: () => ({ ...copy, size: 0 }) });
    await copyToDisk(new File([], 'vide.zip'), 'a1');
    expect(backend.calls.map((c) => c.cmd)).toEqual(['attach_open', 'attach_finish']);
  });

  it('takes the file it is given as one chunk when it fits in one', async () => {
    const backend = fakeBackend({ attach_open: () => 'h1', attach_finish: () => copy });
    await copyToDisk(file('rapport.xlsx', '', 'PK'), 'a1');
    expect(backend.called('attach_chunk')).toHaveLength(1);
    expect([...(backend.called('attach_chunk')[0].args as unknown as Uint8Array)]).toEqual([...new TextEncoder().encode('PK')]);
  });

  it('erases the half-written file, and says why, when a chunk fails', async () => {
    let n = 0;
    const backend = fakeBackend({
      attach_open: () => 'h1',
      attach_chunk: () => {
        if (++n === 2) throw 'disque plein';
      },
    });
    await expect(copyToDisk(patterned(10 * MB), 'a1')).rejects.toBe('disque plein');
    expect(backend.called('attach_chunk')).toHaveLength(2);
    expect(backend.called('attach_cancel').map((c) => c.args)).toEqual([{ handle: 'h1' }]);
    expect(backend.called('attach_finish')).toHaveLength(0);
  });

  it('erases the half-written file when the backend refuses to finish it', async () => {
    const backend = fakeBackend({
      attach_open: () => 'h1',
      attach_finish: () => {
        throw 'taille inattendue';
      },
    });
    await expect(copyToDisk(file('a.zip'), 'a1')).rejects.toBe('taille inattendue');
    expect(backend.called('attach_cancel')).toHaveLength(1);
  });

  it('writes nothing, and has nothing to erase, when the backend refuses to open it', async () => {
    const backend = fakeBackend({
      attach_open: () => {
        throw 'film.mkv dépasse 100 Mo';
      },
    });
    await expect(copyToDisk(file('film.mkv'), 'a1')).rejects.toBe('film.mkv dépasse 100 Mo');
    expect(backend.calls.map((c) => c.cmd)).toEqual(['attach_open']);
  });

  it('stops at the next chunk when cancelled, and erases what was written', async () => {
    const abort = new AbortController();
    const backend = fakeBackend({ attach_open: () => 'h1', attach_finish: () => copy });
    const done = copyToDisk(patterned(10 * MB), 'a1', { signal: abort.signal, onProgress: () => abort.abort() });
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(backend.called('attach_chunk')).toHaveLength(1);
    expect(backend.called('attach_cancel').map((c) => c.args)).toEqual([{ handle: 'h1' }]);
    expect(backend.called('attach_finish')).toHaveLength(0);
  });

  it('erases the copy at once when cancelled before it is open', async () => {
    const abort = new AbortController();
    let open: (h: string) => void = () => {};
    const backend = fakeBackend({ attach_open: () => new Promise((r) => (open = r)) });
    const done = copyToDisk(file('a.zip'), 'a1', { signal: abort.signal });
    abort.abort();
    open('h1');
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(backend.called('attach_chunk')).toHaveLength(0);
    expect(backend.called('attach_cancel').map((c) => c.args)).toEqual([{ handle: 'h1' }]);
  });

  it('discards the copy finished while it was cancelled', async () => {
    const abort = new AbortController();
    const backend = fakeBackend({
      attach_open: () => 'h1',
      attach_finish: () => {
        abort.abort();
        return copy;
      },
    });
    await expect(copyToDisk(file('a.zip'), 'a1', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(backend.called('attach_discard').map((c) => c.args)).toEqual([{ owner: 'a1', path: copy.path }]);
  });
});

describe('attachByPath', () => {
  const original: AttachedFile = {
    name: 'rapport.xlsx',
    path: '/home/jean/rapport.xlsx',
    claudePath: '/home/jean/rapport.xlsx',
    size: 2,
    origin: true,
  };
  const copy: AttachedFile = { ...original, path: '/data/a1/1f2e/rapport.xlsx', claudePath: '/data/a1/1f2e/rapport.xlsx', origin: false };

  it('attaches the file where it is, without copying it, when the host knows it: by its id, never a path', async () => {
    const backend = fakeBackend({ attach_origin: () => original });
    const done = await attachByPath(file('rapport.xlsx', '', 'PK'), 'a1', { origin: '3f2a9c10-1d5e-4a77-9e0b-5a1c2d3e4f50' });
    expect(done).toEqual(original);
    expect(backend.calls).toEqual([{ cmd: 'attach_origin', args: { owner: 'a1', id: '3f2a9c10-1d5e-4a77-9e0b-5a1c2d3e4f50' } }]);
  });

  it('copies it when the host does not know it', async () => {
    const backend = fakeBackend({ attach_open: () => 'h1', attach_finish: () => copy });
    expect(await attachByPath(file('rapport.xlsx', '', 'PK'), 'a1', { origin: null })).toEqual(copy);
    expect(backend.calls.map((c) => c.cmd)).toEqual(['attach_open', 'attach_chunk', 'attach_finish']);
    await attachByPath(file('rapport.xlsx', '', 'PK'), 'a1', {});
    expect(backend.called('attach_origin')).toHaveLength(0);
  });

  it('says why when the backend refuses the file where it is', async () => {
    fakeBackend({
      attach_origin: () => {
        throw 'rapport.xlsx est illisible';
      },
    });
    await expect(attachByPath(file('rapport.xlsx'), 'a1', { origin: '3f2a' })).rejects.toBe('rapport.xlsx est illisible');
  });

  it('does not copy the file when the host refuses its id: the refusal is the answer', async () => {
    const backend = fakeBackend({
      attach_origin: () => {
        throw 'Fichier inconnu';
      },
      attach_open: () => 'h1',
    });
    await expect(attachByPath(file('rapport.xlsx'), 'a1', { origin: '3f2a' })).rejects.toBe('Fichier inconnu');
    expect(backend.called('attach_open')).toHaveLength(0);
  });

  it('gives up without a word when cancelled while its origin is looked for', async () => {
    const abort = new AbortController();
    const backend = fakeBackend({ attach_origin: () => original });
    abort.abort();
    await expect(attachByPath(file('rapport.xlsx'), 'a1', { origin: '3f2a', signal: abort.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(backend.calls).toEqual([]);
  });
});
