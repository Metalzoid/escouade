// The temporary folder of a run of the JavaScript tests (Vitest's, the end-to-end ones'): one of its own,
// `<system temp>/escouade-js-tests/<kind>-<pid>`, set as TMP, TEMP and TMPDIR before its workers start, so whatever
// they, the app and the processes they start write there goes with it at the end (`globalSetup`). Those a run killed
// before its end left go at the start of the next one (their process is gone). The Rust tests have theirs
// (src-tauri/src/test_tmp.rs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VARS = ['TMP', 'TEMP', 'TMPDIR'] as const;

/** Whether the process `pid` runs. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function remove(dir: string, tries = 10): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: tries, retryDelay: 300 });
  } catch (e) {
    // A process killed late still has a file open there (Windows): the next run removes it.
    console.warn(`could not remove ${dir}: ${(e as Error).message}`);
  }
}

/** Gives this process, and those it starts afterwards, a temporary folder of their own; what removes it. */
export function ownTemporaryFolder(kind: string, base = os.tmpdir()): () => void {
  const root = path.join(base, 'escouade-js-tests');
  fs.mkdirSync(root, { recursive: true });
  for (const name of fs.readdirSync(root)) {
    const pid = Number(name.slice(name.lastIndexOf('-') + 1));
    if (Number.isInteger(pid) && pid !== process.pid && !alive(pid)) remove(path.join(root, name), 2);
  }
  const dir = path.join(root, `${kind}-${process.pid}`);
  remove(dir, 2);
  fs.mkdirSync(dir);
  const before = VARS.map((k) => process.env[k]);
  for (const k of VARS) process.env[k] = dir;
  return () => {
    VARS.forEach((k, i) => {
      if (before[i] === undefined) delete process.env[k];
      else process.env[k] = before[i];
    });
    remove(dir);
    try {
      fs.rmdirSync(root);
    } catch {
      // Another run's folder is there.
    }
  };
}
