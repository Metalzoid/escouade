// The app's updates as the updater plugin's `check` gives them, but checked and downloaded by the
// backend: they follow the network settings as they are now (proxy, TLS verification off).

import { api } from './ipc';
import type { UpdateTrouble as Trouble } from './types';

/** A check or a download that failed: the backend says why, whether to tell the user now, and where to take it from instead. */
export class UpdateTrouble extends Error {
  /** Tell the user now; otherwise the backend retries in silence and the failure only counts toward telling later. */
  readonly show: boolean;
  /** The page of the release, for a download that failed: the installer can be taken from there in the browser. */
  readonly page: string | null;

  constructor(trouble: Trouble) {
    super(trouble.message);
    this.name = 'UpdateTrouble';
    this.show = trouble.show;
    this.page = trouble.page;
  }
}

export interface FoundUpdate {
  version: string;
  body?: string;
  /**
   * Downloads it, its signature checked, and the backend keeps it until it installs: true once it is the one ready,
   * false when a newer one took its place meanwhile. A failure raises an `UpdateTrouble`.
   */
  download(): Promise<boolean>;
  /** It is no longer offered: the backend lets go of it. */
  close(): Promise<void>;
}

/**
 * The update on offer, or null when the app is up to date. A failure raises an `UpdateTrouble`.
 * `manual`: the user asked for the check, which the backend takes for the download that follows it as well.
 */
export async function check(manual = false): Promise<FoundUpdate | null> {
  const checked = await api.updateCheck(manual);
  if (checked.kind === 'failed') throw new UpdateTrouble(checked.trouble);
  if (checked.kind === 'none') return null;
  const found = checked.update;
  return {
    version: found.version,
    body: found.notes,
    download: async () => {
      const downloaded = await api.updateDownload(found.id, manual);
      if (downloaded.kind === 'failed') throw new UpdateTrouble(downloaded.trouble);
      return downloaded.kind === 'ready';
    },
    close: () => api.updateClose(found.id),
  };
}
