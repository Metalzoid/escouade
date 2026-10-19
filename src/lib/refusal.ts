// The refusals of the backend as the window says them.

import type { EngineId } from './types';

/** A refusal for want of an account of a harness, as the backend sends it (`no-account:<harness>|<text>`, `commands::err`). */
const NO_ACCOUNT = /^no-account:([a-z]+)\|/;

/** What a refusal says, without the mark of a missing account. */
export function errorText(e: unknown): string {
  return String(e).replace(NO_ACCOUNT, '');
}

/** The harness a refusal wants an account of (ESC-128), if it is one for want of an account. */
export function missingAccountOf(e: unknown): EngineId | null {
  const m = String(e).match(NO_ACCOUNT);
  return m ? (m[1] as EngineId) : null;
}
