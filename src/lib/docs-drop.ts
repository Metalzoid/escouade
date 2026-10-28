// Files dropped in the drive of the documents (ESC-260): asked about first when they are heavy and no LFS rule of the
// repository takes them, then each handed to the backend by its path when the host knows it (`file-origin.ts`), else
// by a copy that goes once the drive has its own. The backend reads, indexes and files each one (`docsdrive.rs`).
import { copyToDisk } from './attachments';
import { fileOrigins } from './file-origin';
import { api } from './ipc';
import type { DocsCheck, DocsDropped } from './types';

/** The owner of the copies: the drafts', which the backend clears by itself. */
const OWNER = 'draft';

export interface DropHooks {
  /** The files over 50 MB that no LFS rule takes: true adds them anyway, false leaves them out. */
  ask: (large: DocsCheck[]) => Promise<boolean>;
  /** A file starts being read. */
  started?: (name: string) => void;
  /** A file is in the drive (`dropped`), or failed (`error`). */
  ended?: (name: string, dropped: DocsDropped | null, error?: string) => void;
}

/**
 * Puts `files` in the drive of `projectId`: in `folder`, or filed by Escouade when it is null. One after the other, so
 * that each is filed knowing the ones before. What went in.
 */
export async function dropDocuments(projectId: string, files: File[], folder: string | null, hooks: DropHooks): Promise<DocsDropped[]> {
  if (!files.length) return [];
  const checks = await api.docsDocumentCheck(
    projectId,
    folder,
    files.map((f) => ({ name: f.name, size: f.size })),
  );
  const large = checks.filter((c) => c.large);
  const confirmed = large.length ? await hooks.ask(large) : false;
  const kept = files.filter((_, i) => !checks[i]?.large || confirmed);
  const origins = await fileOrigins(kept);
  const out: DocsDropped[] = [];
  for (const [i, f] of kept.entries()) {
    hooks.started?.(f.name);
    try {
      const origin = origins[i];
      const attached = origin ? await api.attachOrigin(OWNER, origin) : await copyToDisk(f, OWNER);
      try {
        const dropped = await api.docsDocumentAdd(projectId, folder, attached.path, confirmed);
        out.push(dropped);
        hooks.ended?.(f.name, dropped);
      } finally {
        if (!attached.origin) await api.attachDiscard(OWNER, attached.path).catch(() => {});
      }
    } catch (e) {
      hooks.ended?.(f.name, null, String(e));
    }
  }
  return out;
}
