import { describe, expect, it } from 'vitest';
import { fakeBackend } from '../test/ipc';
import { check, UpdateTrouble } from './update-check';

const FOUND = { kind: 'found', update: { id: 3, version: '1.6.0', notes: 'Notes 1.6.0' } };

describe('check', () => {
  it('finds an update through the backend, which downloads or frees it', async () => {
    const backend = fakeBackend({
      update_check: () => FOUND,
      update_download: () => ({ kind: 'ready' }),
    });
    const update = await check();
    expect(update).toMatchObject({ version: '1.6.0', body: 'Notes 1.6.0' });
    expect(await update!.download()).toBe(true);
    expect(backend.called('update_download').map((c) => c.args)).toEqual([{ id: 3, manual: false }]);
    await update!.close();
    expect(backend.called('update_close').map((c) => c.args)).toEqual([{ id: 3 }]);
  });

  it('tells the backend who asked, for the check and for the download that follows it', async () => {
    const backend = fakeBackend({ update_check: () => FOUND, update_download: () => ({ kind: 'ready' }) });
    await check();
    const asked = await check(true);
    await asked!.download();
    expect(backend.called('update_check').map((c) => c.args)).toEqual([{ manual: false }, { manual: true }]);
    expect(backend.called('update_download').map((c) => c.args)).toEqual([{ id: 3, manual: true }]);
  });

  it('finds nothing when the app is up to date, and lets a failure of the call through', async () => {
    fakeBackend({ update_check: () => ({ kind: 'none' }) });
    expect(await check()).toBeNull();
    fakeBackend({ update_check: () => Promise.reject('Escouade injoignable') });
    await expect(check()).rejects.toBe('Escouade injoignable');
  });

  it('raises the trouble the backend reports for a check, with what to show of it', async () => {
    const trouble = { message: 'connexion impossible à github.com', show: true, page: null };
    fakeBackend({ update_check: () => ({ kind: 'failed', trouble }) });
    const failure = await check(true).catch((e) => e);
    expect(failure).toBeInstanceOf(UpdateTrouble);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'connexion impossible à github.com', show: true, page: null });

    fakeBackend({ update_check: () => ({ kind: 'failed', trouble: { ...trouble, show: false } }) });
    await expect(check()).rejects.toMatchObject({ show: false });
  });

  it('tells whether the download left the update ready, or was overtaken by a newer one', async () => {
    fakeBackend({ update_check: () => FOUND, update_download: () => ({ kind: 'superseded' }) });
    const update = await check();
    expect(await update!.download()).toBe(false);
  });

  it('raises the trouble the backend reports for a download, with the page of the release', async () => {
    const page = 'https://github.com/guillaume-gagnaire/escouade/releases/tag/v1.6.0';
    const trouble = { message: '403 Forbidden de release-assets.githubusercontent.com', show: true, page };
    fakeBackend({ update_check: () => FOUND, update_download: () => ({ kind: 'failed', trouble }) });
    const update = await check();
    const failure = await update!.download().catch((e) => e);
    expect(failure).toBeInstanceOf(UpdateTrouble);
    expect(failure).toMatchObject({ message: '403 Forbidden de release-assets.githubusercontent.com', show: true, page });
  });

  it('lets a failure of the download call through as it is', async () => {
    fakeBackend({ update_check: () => FOUND, update_download: () => Promise.reject('Escouade injoignable') });
    const update = await check();
    await expect(update!.download()).rejects.toBe('Escouade injoignable');
  });
});
