// The DevTools port of the app under test (fixture.ts): a test must never attach to the instance of
// the test before, which is dying but still answers on it.

import net from 'node:net';

/** How long a connection may take to be answered, which a closed port does (refused) in about two seconds on Windows. */
const ANSWER_MS = 5000;

/** Whether something accepts connections on 127.0.0.1:`port` (an unanswered attempt counts as yes). */
function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(ANSWER_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * Waits until nothing listens on `port` any more: true then, false when something still does after
 * `timeoutMs` (30 s by default).
 */
export async function waitForPortToClose(
  port: number,
  { timeoutMs = 30_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (await isListening(port)) {
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return true;
}
