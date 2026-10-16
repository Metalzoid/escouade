import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend } from '../test/ipc';
import { fileOrigins } from './file-origin';

const file = (name: string) => new File(['x'], name);

/** What the WebView2 of Windows gives the page: a bridge to the host that takes files along with a message. */
function webview(post: (message: string, objects: File[]) => void = () => {}) {
  const postMessageWithAdditionalObjects = vi.fn(post);
  (window as unknown as { chrome?: unknown }).chrome = { webview: { postMessageWithAdditionalObjects } };
  return postMessageWithAdditionalObjects;
}

/** The id the page posted with each file, by the name of the file. */
function posted(post: (message: string, objects: File[]) => void = () => {}) {
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const bridge = webview((message, objects) => {
    post(message, objects);
    const id = JSON.parse(message).escouadeFileOrigin;
    ids.set(objects[0].name, id);
    names.set(id, objects[0].name);
  });
  return { bridge, ids, names };
}

afterEach(() => {
  delete (window as unknown as { chrome?: unknown }).chrome;
});

describe('the origin of a file on Windows', () => {
  it('asks the host through WebView2 and gives the id of each file whose path the host read, never the path', async () => {
    const { bridge, ids, names } = posted();
    const backend = fakeBackend({ file_origin: ({ id }: { id: string }) => `C:\\Users\\Jean\\Documents\\${names.get(id)}` });
    const origins = await fileOrigins([file('rapport.xlsx'), file('sources.zip')], 'windows');
    // The id posted with the file is the one the page keeps, one by file.
    expect(origins).toEqual([ids.get('rapport.xlsx'), ids.get('sources.zip')]);
    expect(new Set(origins).size).toBe(2);
    expect(JSON.stringify(origins)).not.toContain('Documents');
    // A message of JSON, with a different id for each file.
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(bridge.mock.calls.map(([message]) => Object.keys(JSON.parse(message)))).toEqual([
      ['escouadeFileOrigin'],
      ['escouadeFileOrigin'],
    ]);
    expect(
      backend
        .called('file_origin')
        .map((c) => c.args.id)
        .sort(),
    ).toEqual([...names.keys()].sort());
  });

  it('gives null for a file that is none of the disk (a screenshot pasted), the others keeping their id', async () => {
    const { ids, names } = posted();
    fakeBackend({ file_origin: ({ id }: { id: string }) => (names.get(id) === 'image.png' ? null : `C:\\x\\${names.get(id)}`) });
    expect(await fileOrigins([file('image.png'), file('a.zip')], 'windows')).toEqual([null, ids.get('a.zip')]);
  });

  it('gives null, never an error, when there is no bridge, the bridge refuses the file or the backend fails', async () => {
    const backend = fakeBackend({ file_origin: () => 'C:\\x\\a.zip' });
    // Not WebView2 (a test, an embedded browser): no bridge, nothing to ask.
    expect(await fileOrigins([file('a.zip')], 'windows')).toEqual([null]);
    expect(backend.calls).toEqual([]);
    webview(() => {
      throw new Error('not a file');
    });
    expect(await fileOrigins([file('a.zip')], 'windows')).toEqual([null]);
    webview();
    fakeBackend({
      file_origin: () => {
        throw 'pas de réponse';
      },
    });
    expect(await fileOrigins([file('a.zip')], 'windows')).toEqual([null]);
  });

  it('answers for each file even when the bridge refuses one of them', async () => {
    const { ids } = posted((_, objects) => {
      if (objects[0].name === 'bad.zip') throw new Error('refused');
    });
    fakeBackend({ file_origin: () => 'C:\\x\\good.zip' });
    expect(await fileOrigins([file('bad.zip'), file('good.zip')], 'windows')).toEqual([null, ids.get('good.zip')]);
  });

  it('gives nothing for no file', async () => {
    expect(await fileOrigins([], 'windows')).toEqual([]);
  });
});

describe('the origin of a file elsewhere', () => {
  // There is no host to read a path: the page would be the one to say where the file is, which is never believed. The files are copied.
  it.each(['linux', 'mac'] as const)('is not known on %s: nothing is asked of the host and the files are copied', async (os) => {
    const backend = fakeBackend();
    const bridge = webview();
    expect(await fileOrigins([file('a.zip'), file('b.zip')], os)).toEqual([null, null]);
    expect(bridge).not.toHaveBeenCalled();
    expect(backend.calls).toEqual([]);
  });
});
