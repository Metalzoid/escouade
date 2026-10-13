// @vitest-environment node
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForPortToClose } from './port';

const servers: net.Server[] = [];

/** A server on a port of its own; `close()` frees the port. */
async function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => socket.destroy());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

describe('waitForPortToClose', () => {
  it('returns at once when nothing listens on the port', async () => {
    const taken = await listen();
    await taken.close();
    expect(await waitForPortToClose(taken.port, { timeoutMs: 5000, intervalMs: 50 })).toBe(true);
  });

  it('waits for the program that listens on the port to stop', async () => {
    const taken = await listen();
    let stopped = false;
    setTimeout(() => {
      stopped = true;
      void taken.close();
    }, 400);
    expect(await waitForPortToClose(taken.port, { timeoutMs: 5000, intervalMs: 50 })).toBe(true);
    expect(stopped).toBe(true);
  });

  it('gives up after its delay when the port stays taken', async () => {
    const taken = await listen();
    const started = Date.now();
    expect(await waitForPortToClose(taken.port, { timeoutMs: 300, intervalMs: 50 })).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
  });
});
