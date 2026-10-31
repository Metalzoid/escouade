// « Partager » of the docs (ESC-258, the gesture of ESC-257's backend): commits not pushed of the code would leave with
// the docs, so they are told first and go only once confirmed; a conflict stays in the status bar, for « L'agent résout »
// or « Annuler ».
import { t } from './i18n';
import { api } from './ipc';
import { app } from './state.svelte';
import type { DocsShared } from './types';

async function run(projectId: string, withCode: boolean) {
  const done: DocsShared | undefined = await app.run(api.docsShare(projectId, null, withCode));
  if (!done) return;
  if (done.kind === 'nothing') app.toast(t('docs.share.nothing'));
  else if (done.kind === 'done') app.toast(t('docs.share.done', { count: done.committed }));
  else app.docsShare[projectId] = { pending: app.docsShare[projectId]?.pending ?? 0, conflict: done.conflict };
  const p = await api.docsPending(projectId).catch(() => null);
  if (p) app.docsShare[projectId] = { pending: p.count, conflict: p.conflict };
}

/** « Partager »: what is left to share read first, a confirmation when code would go with it. */
export async function shareDocs(projectId: string) {
  const p = await app.run(api.docsPending(projectId));
  if (!p) return;
  if (p.codeCommits > 0) {
    app.modal = {
      kind: 'confirm',
      title: t('docs.share.withCodeTitle'),
      body: t('docs.share.withCode', { count: p.codeCommits }),
      confirm: t('docs.share.goAll'),
      onConfirm: () => run(projectId, true),
    };
    return;
  }
  await run(projectId, false);
}

/** « L'agent résout » the conflict a « Partager » stopped on. */
export async function resolveDocsConflict(projectId: string) {
  const c = await app.run(api.docsShareResolve(projectId));
  if (c) app.docsShare[projectId] = { pending: app.docsShare[projectId]?.pending ?? 0, conflict: c };
}

/** « Annuler » it: the docs as they were before. */
export async function cancelDocsConflict(projectId: string) {
  const done = await app.run(api.docsShareCancel(projectId).then(() => true));
  if (!done) return;
  app.docsShare[projectId] = { pending: app.docsShare[projectId]?.pending ?? 0, conflict: null };
}
