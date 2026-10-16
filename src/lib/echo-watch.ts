// Watches how long a keystroke (or a paste) takes to come back on screen in a terminal (ESC-100): users have seen 1 to
// 2 s, which no measure here shows. A slow echo is reported with its durations, and where its chunk stands in the output
// the terminal received, which tells the backend which of its reads was the echo; the backend adds its own to the log.
// Only durations are measured (`performance.now()`): the backend's clock is another one, never compared with.

import type { TermReport } from './ipc';

export type SlowEcho = Extract<TermReport, { kind: 'slowEcho' }>;

/** What the user did: typed one key (what xterm.js sent for it), or pasted. */
export type InputKind = 'key' | 'paste';

export interface TrackedInput {
  data: string;
  kind: InputKind;
  /** The number the backend gave the write of `data`. */
  seq: Promise<number>;
}

/** The answer of a write: the number the backend gave it, and when (`now`) that came back. */
interface Answer {
  seq: number;
  at: number;
}

/** The output that answers an input, with what was known of the input when it came in. */
export interface EchoToken {
  /** Settles when the write is answered, never rejects. */
  answer: Promise<Answer | null>;
  bytes: number;
  sentAt: number;
  receivedAt: number;
  /** The bytes of output the terminal had received once this chunk came in, the chunk included. */
  outputEnd: number;
}

export interface EchoWatchOptions {
  /** `performance.now`: ms, fractional. */
  now: () => number;
  /** The window is shown: while hidden (tray, minimised) nothing is painted, so nothing is measured. */
  visible: () => boolean;
  report: (report: SlowEcho) => void;
  /** From how long after the write an echo is slow. */
  threshold?: number;
  /** Past this, an output was no echo: a key that prints nothing, a password prompt. */
  giveUpAfter?: number;
  /** At most one report in so long: a slow terminal is slow on every key. */
  every?: number;
}

const encoder = new TextEncoder();

/**
 * Escape sequences, whole or cut at the end of a chunk: strings (OSC, DCS…) up to BEL or ST, CSI, a character set
 * (`\e(B`), any other escape and the one character after it.
 */
const ESCAPES = /\x1b[\]P_^X][^\x07\x1b]*(?:\x07|\x1b\\|$)|\x1b\[[0-?]*[ -/]*(?:[@-~]|$)|\x1b[ -/]+[0-~]|\x1b[\s\S]?/g;

/** What a chunk of output shows: its text, without the escape sequences. */
export function visibleText(output: string): string {
  return output.replace(ESCAPES, '');
}

/**
 * The one printable character of a key's data (a single code point, as 'é' or '🙂'), else null. Not a space: ConPTY
 * draws a typed space as a cursor move (ESC[C), so no space shows and unrelated output would answer it.
 */
function printable(data: string): string | null {
  const chars = [...data];
  if (chars.length !== 1) return null;
  const code = chars[0].codePointAt(0)!;
  return code > 0x20 && code !== 0x7f ? chars[0] : null;
}

export function echoWatch({ now, visible, report, threshold = 300, giveUpAfter = 10_000, every = 10_000 }: EchoWatchOptions) {
  /**
   * The oldest input still unanswered: the later ones are not tracked, the echo comes in their order.
   * `char` is what a typed key prints, which its echo shows; a paste has none and is answered by any output.
   */
  let waiting: { sentAt: number; bytes: number; answer: Promise<Answer | null>; char: string | null } | null = null;
  let reportedAt: number | null = null;

  /** Drops the input that waited so long its answer, if any comes, is none. */
  const forgetStale = () => {
    if (waiting && now() - waiting.sentAt >= giveUpAfter) waiting = null;
  };

  return {
    /** An input left the window: the user's own, not what xterm.js writes by itself (focus, cursor and mouse reports). */
    sent({ data, kind, seq }: TrackedInput) {
      forgetStale();
      if (waiting || !visible()) return;
      const char = kind === 'key' ? printable(data) : null;
      // Other keys (Enter, arrows, Ctrl+…) echo nothing a chunk of output could be told by.
      if (kind === 'key' && char === null) return;
      // The caller deals with a failing write; a measure of it is only dropped, with no unhandled rejection of its own.
      const answer = seq.then(
        (n): Answer | null => ({ seq: n, at: now() }),
        () => null,
      );
      waiting = { sentAt: now(), bytes: encoder.encode(data).length, answer, char };
    },
    /**
     * A chunk of the terminal's output came in: a token when it answers the input waited for, to give to `painted`.
     * `text` decodes the chunk, which is only asked while a typed key waits: a spinner redrawn meanwhile is no echo.
     * `end` is how many bytes of output the terminal has received, this chunk included (every chunk counts, not only the
     * ones asked about): the backend finds the echo among its reads by it.
     */
    received(text: () => string, end: number): EchoToken | null {
      forgetStale();
      if (!waiting) return null;
      if (waiting.char !== null && !visibleText(text()).includes(waiting.char)) return null;
      const { sentAt, bytes, answer } = waiting;
      // Answered: the next input starts a new measure, whenever this output gets painted.
      waiting = null;
      return { answer, bytes, sentAt, receivedAt: now(), outputEnd: end };
    },
    /** The chunk of that token was painted. */
    painted(token: EchoToken) {
      const paintedAt = now();
      // The frame of a hidden window comes whenever it shows again: that wait is not the terminal's.
      if (!visible()) return;
      const sentToReceived = token.receivedAt - token.sentAt;
      const receivedToPainted = paintedAt - token.receivedAt;
      const took = sentToReceived + receivedToPainted;
      if (took < threshold || took >= giveUpAfter) return;
      if (reportedAt !== null && paintedAt - reportedAt < every) return;
      reportedAt = paintedAt;
      // Told once the write has its number; a write that failed has none to tell.
      token.answer.then((answer) => {
        if (!answer) return;
        report({
          kind: 'slowEcho',
          seq: answer.seq,
          bytes: token.bytes,
          sentToReceived,
          receivedToPainted,
          sentToAcked: answer.at - token.sentAt,
          outputEnd: token.outputEnd,
        });
      });
    },
  };
}
