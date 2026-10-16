import { describe, expect, it, vi } from 'vitest';
import { echoWatch, visibleText } from './echo-watch';

/** A watcher on a clock the test moves and a window it shows or hides; `report` is what it told. */
function watcher(options: { threshold?: number; giveUpAfter?: number; every?: number } = {}) {
  const clock = { t: 1_000 };
  const window = { visible: true };
  const report = vi.fn();
  const watch = echoWatch({ now: () => clock.t, visible: () => window.visible, report, ...options });
  return { clock, window, report, watch, wait: (ms: number) => (clock.t += ms) };
}

/** What a report is told once the promise of the write's number settled. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A key the user typed, and a paste, as xterm.js gives them to `onData`. */
const typed = (data = 'a', seq = 1) => ({ data, kind: 'key' as const, seq: Promise.resolve(seq) });
const pasted = (data = 'hello', seq = 1) => ({ data, kind: 'paste' as const, seq: Promise.resolve(seq) });
const encoder = new TextEncoder();
/**
 * A chunk of output as the watcher is given it: its text, decoded only if the watcher asks for it, and where the
 * terminal's output stands once it came in (`before` bytes came earlier, none by default).
 */
const chunk = (text: string, before = 0): [() => string, number] => [() => text, before + encoder.encode(text).length];

describe('echoWatch', () => {
  describe('what it measures', () => {
    it.each([
      ['a letter', 'a'],
      ['an accented letter', 'é'],
      ['a symbol', '€'],
      ['a character outside the basic plane', '🙂'],
      ['a digit', '7'],
    ])('measures %s the user typed', (_name, c) => {
      const { watch } = watcher();
      watch.sent(typed(c));
      expect(watch.received(...chunk(c))).not.toBeNull();
    });

    it.each([
      ['Enter', '\r'],
      ['Tab', '\t'],
      ['Backspace', '\x7f'],
      ['Escape', '\x1b'],
      ['an arrow', '\x1b[A'],
      ['Ctrl+C', '\x03'],
      ['Alt+b', '\x1bb'],
      ['a focus report', '\x1b[I'],
      // ConPTY draws a typed space as a cursor move (ESC[C): no space shows, unrelated output would answer it.
      ['a space', ' '],
      ['two characters at once', 'ab'],
      ['nothing', ''],
    ])('does not measure %s: it is no printable character', (_name, data) => {
      const { watch } = watcher();
      watch.sent(typed(data));
      // Whatever comes in, nothing waits for it.
      expect(watch.received(...chunk(`${data}x`))).toBeNull();
    });

    it('measures a paste, whatever it holds', () => {
      const { watch } = watcher();
      watch.sent(pasted('\x1b[200~git status\r\x1b[201~'));
      expect(watch.received(...chunk('anything'))).not.toBeNull();
    });
  });

  describe('what answers a typed character', () => {
    it('is the first output whose visible text holds it: a spinner redrawn meanwhile does not answer', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('x'));
      wait(100);
      expect(watch.received(...chunk('\x1b[2K⠋ Thinking…'))).toBeNull();
      wait(100);
      expect(watch.received(...chunk('\x1b[2K⠙ Thinking…'))).toBeNull();
      wait(300);
      const token = watch.received(...chunk('\x1b[2K> x'));
      expect(token).not.toBeNull();
      wait(10);
      watch.painted(token!);
      await flush();
      // From the write to the chunk with the letter, not to the first one.
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ sentToReceived: 500, receivedToPainted: 10 }));
    });

    it('does not count a letter inside an escape sequence', () => {
      const { watch } = watcher();
      watch.sent(typed('m'));
      expect(watch.received(...chunk('\x1b[0m\x1b[1;31m\x1b]0;mmm\x07\x1b]8;;http://m\x1b\\\x1b(B'))).toBeNull();
      expect(watch.received(...chunk('\x1b[0mm'))).not.toBeNull();
    });

    it('asks for the text of a chunk only while a measure waits for a letter', () => {
      const { watch } = watcher();
      const text = vi.fn(() => 'a');
      // Nothing sent.
      expect(watch.received(text, 1)).toBeNull();
      // A key that is not measured.
      watch.sent(typed('\r'));
      expect(watch.received(text, 1)).toBeNull();
      // A paste is answered by the first output, whatever it says.
      watch.sent(pasted());
      expect(watch.received(text, 1)).not.toBeNull();
      expect(text).not.toHaveBeenCalled();
      // The measure answered, nothing waits any more.
      expect(watch.received(text, 1)).toBeNull();
      expect(text).not.toHaveBeenCalled();
      watch.sent(typed('a'));
      expect(watch.received(text, 1)).not.toBeNull();
      expect(text).toHaveBeenCalledOnce();
    });

    it('gives a token to the first answer only', () => {
      const { watch } = watcher();
      expect(watch.received(...chunk('a'))).toBeNull();
      watch.sent(typed('a'));
      expect(watch.received(...chunk('a'))).not.toBeNull();
      expect(watch.received(...chunk('a'))).toBeNull();
    });
  });

  describe('what answers a paste', () => {
    it('is the first output after it, which is reported when late', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(pasted('é🙂', 12));
      wait(500);
      const token = watch.received(...chunk('⠋'));
      wait(30);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith({
        kind: 'slowEcho',
        seq: 12,
        bytes: 6,
        sentToReceived: 500,
        receivedToPainted: 30,
        sentToAcked: expect.any(Number),
        outputEnd: 3,
      });
    });
  });

  describe('reporting', () => {
    it('tells the number of the write, its size in UTF-8 bytes, and both durations', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('é', 41));
      wait(1500);
      const token = watch.received(...chunk('é'));
      wait(40);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith({
        kind: 'slowEcho',
        seq: 41,
        bytes: 2,
        sentToReceived: 1500,
        receivedToPainted: 40,
        sentToAcked: expect.any(Number),
        outputEnd: 2,
      });
    });

    it('says nothing of an echo that came in time', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed());
      wait(20);
      const token = watch.received(...chunk('a'));
      wait(10);
      watch.painted(token!);
      await flush();
      expect(report).not.toHaveBeenCalled();
    });

    it('reports from 300 ms on, both durations added, not under', async () => {
      const under = watcher();
      under.watch.sent(typed());
      under.wait(200);
      const quick = under.watch.received(...chunk('a'));
      under.wait(99);
      under.watch.painted(quick!);

      const at = watcher();
      at.watch.sent(typed());
      at.wait(200);
      const slow = at.watch.received(...chunk('a'));
      at.wait(100);
      at.watch.painted(slow!);
      await flush();
      expect(under.report).not.toHaveBeenCalled();
      expect(at.report).toHaveBeenCalledOnce();
    });

    it('takes the threshold it is given', async () => {
      const { watch, report, wait } = watcher({ threshold: 50 });
      watch.sent(typed());
      const token = watch.received(...chunk('a'));
      wait(60);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
    });

    it('times from the oldest input still unanswered: the next ones are not tracked meanwhile', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('a', 1));
      wait(200);
      watch.sent(typed('b', 2));
      wait(200);
      watch.sent(pasted('c', 3));
      wait(400);
      const token = watch.received(...chunk('abc'));
      wait(10);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith({
        kind: 'slowEcho',
        seq: 1,
        bytes: 1,
        sentToReceived: 800,
        receivedToPainted: 10,
        sentToAcked: expect.any(Number),
        outputEnd: 3,
      });
    });

    it('times a new input once the echo of the one before came in, even before that echo is painted', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('a', 1));
      const first = watch.received(...chunk('a'));
      wait(100);
      watch.sent(typed('b', 2));
      wait(900);
      const second = watch.received(...chunk('b'));
      watch.painted(second!);
      watch.painted(first!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 2, sentToReceived: 900 }));
    });

    it('says nothing when the output came after 10 s: that was no echo (a key that prints nothing, a password prompt)', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('a'));
      wait(10_000);
      // Dropped: the output that comes is not its echo.
      expect(watch.received(...chunk('a'))).toBeNull();
      watch.sent(typed('b', 2));
      const token = watch.received(...chunk('b'));
      wait(1000);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 2, sentToReceived: 0, receivedToPainted: 1000 }));
    });

    it('says nothing of an echo that took 10 s, and just under it still counts', async () => {
      const late = watcher();
      late.watch.sent(typed());
      late.wait(9_000);
      const token = late.watch.received(...chunk('a'));
      late.wait(1_000);
      late.watch.painted(token!);

      const near = watcher();
      near.watch.sent(typed());
      near.wait(9_000);
      const last = near.watch.received(...chunk('a'));
      near.wait(999);
      near.watch.painted(last!);
      await flush();
      expect(late.report).not.toHaveBeenCalled();
      expect(near.report).toHaveBeenCalledOnce();
    });

    it('drops an input unanswered for 10 s when the next one is sent, which then starts its own measure', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('a', 1));
      wait(12_000);
      watch.sent(typed('b', 2));
      wait(500);
      const token = watch.received(...chunk('b'));
      wait(100);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledWith({
        kind: 'slowEcho',
        seq: 2,
        bytes: 1,
        sentToReceived: 500,
        receivedToPainted: 100,
        sentToAcked: expect.any(Number),
        outputEnd: 1,
      });
    });

    it('keeps the measure of an input unanswered for less than 10 s when others are sent', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('a', 1));
      wait(9_000);
      watch.sent(typed('b', 2));
      wait(500);
      const token = watch.received(...chunk('ab'));
      watch.painted(token!);
      await flush();
      // 9.5 s since the first one: slow, and still its echo.
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 1, sentToReceived: 9_500 }));
    });

    it('reports at most once every 10 s', async () => {
      const { watch, report, wait } = watcher();
      const slowEcho = () => {
        watch.sent(typed());
        const token = watch.received(...chunk('a'));
        wait(400);
        watch.painted(token!);
      };
      slowEcho();
      await flush();
      expect(report).toHaveBeenCalledTimes(1);
      // 400 ms after the report, then 5 s later: still within the 10 s.
      slowEcho();
      wait(5_000);
      slowEcho();
      await flush();
      expect(report).toHaveBeenCalledTimes(1);
      // 10 s after the report: told again.
      wait(5_000);
      slowEcho();
      await flush();
      expect(report).toHaveBeenCalledTimes(2);
    });

    it('does not count a fast echo, or one it did not report, as a report', async () => {
      const { watch, report, wait } = watcher({ every: 1_000 });
      watch.sent(typed());
      const fast = watch.received(...chunk('a'));
      wait(10);
      watch.painted(fast!);
      watch.sent(typed());
      const slow = watch.received(...chunk('a'));
      wait(500);
      watch.painted(slow!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
    });

    it('takes the delay between reports it is given', async () => {
      const { watch, report, wait } = watcher({ every: 1_000 });
      for (let i = 0; i < 2; i++) {
        watch.sent(typed());
        const token = watch.received(...chunk('a'));
        wait(500);
        watch.painted(token!);
      }
      await flush();
      // 500 ms after the first report: too soon.
      expect(report).toHaveBeenCalledTimes(1);
      wait(600);
      watch.sent(typed());
      const token = watch.received(...chunk('a'));
      wait(500);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledTimes(2);
    });

    it('takes the time it gives up after', async () => {
      const { watch, report, wait } = watcher({ giveUpAfter: 2_000 });
      watch.sent(typed());
      const token = watch.received(...chunk('a'));
      wait(2_000);
      watch.painted(token!);
      await flush();
      expect(report).not.toHaveBeenCalled();
    });
  });

  describe('the place of the echo in the output', () => {
    it('is the bytes the terminal had received once the echo came in, the echo included', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('x', 1));
      wait(100);
      // 4 bytes of prompt came before the write was answered: those are not counted by the watcher, but given.
      expect(watch.received(...chunk('\x1b[2K⠋', 4))).toBeNull();
      wait(300);
      // 4 + 7 bytes before, 7 in the chunk of the letter.
      const token = watch.received(...chunk('\x1b[2K> x', 11));
      wait(10);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 1, outputEnd: 18 }));
    });

    it('is not moved by the output that comes after the echo, painted or not', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(typed('x', 1));
      wait(400);
      const token = watch.received(...chunk('x', 20));
      // More output meanwhile, then the echo is painted.
      expect(watch.received(...chunk('\x1b[2K⠙ Thinking…', 21))).toBeNull();
      watch.sent(typed('y', 2));
      expect(watch.received(...chunk('y', 40))).not.toBeNull();
      wait(10);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 1, outputEnd: 21 }));
    });

    it('is the end of the chunk that answers a paste, whatever it says', async () => {
      const { watch, report, wait } = watcher();
      watch.sent(pasted('npm test', 3));
      wait(500);
      const token = watch.received(...chunk('⠋', 100));
      wait(10);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 3, outputEnd: 103 }));
    });
  });

  describe('the answer of the write', () => {
    /** A write the test answers with `answer`, when it wants. */
    const unanswered = (data: string, kind: 'key' | 'paste' = 'key') => {
      let answer!: (seq: number) => void;
      const seq = new Promise<number>((r) => (answer = r));
      return { input: { data, kind, seq }, answer };
    };

    it('is timed from the write to its answer: the way to the backend and back', async () => {
      const { watch, report, wait } = watcher();
      const { input, answer } = unanswered('a');
      watch.sent(input);
      wait(150);
      answer(7);
      // The answer is taken when its promise settles.
      await flush();
      wait(250);
      const token = watch.received(...chunk('a'));
      wait(20);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith({
        kind: 'slowEcho',
        seq: 7,
        bytes: 1,
        sentToReceived: 400,
        receivedToPainted: 20,
        sentToAcked: 150,
        outputEnd: 1,
      });
    });

    it('is timed even when it comes after the echo was painted: the report waits for it', async () => {
      const { watch, report, wait } = watcher();
      const { input, answer } = unanswered('a');
      watch.sent(input);
      wait(400);
      const token = watch.received(...chunk('a'));
      wait(20);
      watch.painted(token!);
      await flush();
      expect(report).not.toHaveBeenCalled();
      wait(180);
      answer(7);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ seq: 7, sentToReceived: 400, receivedToPainted: 20, sentToAcked: 600 }),
      );
    });

    it('is the one of the write that is measured, not of the ones sent while it waited', async () => {
      const { watch, report, wait } = watcher();
      const first = unanswered('a');
      const second = unanswered('b');
      watch.sent(first.input);
      wait(50);
      watch.sent(second.input);
      wait(100);
      second.answer(2);
      await flush();
      wait(100);
      first.answer(1);
      await flush();
      wait(200);
      const token = watch.received(...chunk('ab'));
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 1, sentToAcked: 250 }));
    });

    it('is told for a paste too', async () => {
      const { watch, report, wait } = watcher();
      const { input, answer } = unanswered('npm test', 'paste');
      watch.sent(input);
      wait(60);
      answer(4);
      await flush();
      wait(440);
      watch.painted(watch.received(...chunk('npm test'))!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 4, sentToAcked: 60, sentToReceived: 500 }));
    });
  });

  describe('the number of the write', () => {
    it('is waited for: nothing is told before the write has its number', async () => {
      const { watch, report, wait } = watcher();
      let numbered!: (seq: number) => void;
      watch.sent({ data: 'a', kind: 'key', seq: new Promise<number>((r) => (numbered = r)) });
      wait(400);
      const token = watch.received(...chunk('a'));
      watch.painted(token!);
      await flush();
      expect(report).not.toHaveBeenCalled();
      numbered(9);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 9 }));
    });

    it('tells nothing when the write failed, and goes on measuring', async () => {
      const { watch, report, wait } = watcher();
      watch.sent({ data: 'a', kind: 'key', seq: Promise.reject('terminal introuvable') });
      wait(400);
      watch.painted(watch.received(...chunk('a'))!);
      await flush();
      expect(report).not.toHaveBeenCalled();

      wait(10_000);
      watch.sent(typed('b', 2));
      const token = watch.received(...chunk('b'));
      wait(400);
      watch.painted(token!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 }));
    });
  });

  describe('a window out of sight', () => {
    it('measures no input sent while it is hidden (tray, minimised): nothing is painted then', async () => {
      const { watch, window, report, wait } = watcher();
      window.visible = false;
      watch.sent(typed());
      window.visible = true;
      wait(500);
      // Nothing waits for it.
      expect(watch.received(...chunk('a'))).toBeNull();
      await flush();
      expect(report).not.toHaveBeenCalled();
    });

    it('does not take the place of the measure of an input sent while it is visible', async () => {
      const { watch, window, report, wait } = watcher();
      window.visible = false;
      watch.sent(typed('a', 1));
      window.visible = true;
      watch.sent(typed('b', 2));
      wait(500);
      watch.painted(watch.received(...chunk('b'))!);
      await flush();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 }));
    });

    it('says nothing of an echo painted while it is hidden, and measures the next', async () => {
      const { watch, window, report, wait } = watcher();
      watch.sent(typed('a', 1));
      wait(100);
      const token = watch.received(...chunk('a'));
      // The animation frame only comes when the window shows again.
      window.visible = false;
      wait(3_000);
      watch.painted(token!);
      window.visible = true;
      await flush();
      expect(report).not.toHaveBeenCalled();

      watch.sent(typed('b', 2));
      const next = watch.received(...chunk('b'));
      wait(400);
      watch.painted(next!);
      await flush();
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 }));
    });
  });
});

describe('visibleText', () => {
  it('keeps the text and drops the escape sequences', () => {
    expect(visibleText('\x1b[2K\x1b[1;32m⠋ Thinking…\x1b[0m')).toBe('⠋ Thinking…');
    expect(visibleText('a\x1b[?25lb\x1b[38;2;1;2;3mc\x1b[Hd')).toBe('abcd');
  });

  it('drops an OSC to its BEL or its ST, and what is not terminated up to the end of the chunk', () => {
    expect(visibleText('a\x1b]0;title\x07b\x1b]8;;http://x\x1b\\c')).toBe('abc');
    expect(visibleText('a\x1b]0;title')).toBe('a');
  });

  it('drops an escape and the one character after it', () => {
    expect(visibleText('a\x1b7b\x1b=c\x1bMd')).toBe('abcd');
    // A character set: its name is no text either.
    expect(visibleText('a\x1b(Bb')).toBe('ab');
  });

  it('drops a sequence cut at the end of the chunk', () => {
    expect(visibleText('a\x1b[1;3')).toBe('a');
    expect(visibleText('a\x1b')).toBe('a');
  });
});
