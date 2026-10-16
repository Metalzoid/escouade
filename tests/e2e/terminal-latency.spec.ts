// How long a keystroke, and a paste, take to come back as an echo on screen in an embedded terminal (ESC-100), step by step,
// with the app idle and under load (terminals that print without a pause, agents hard at work). A measure, not a test of
// the app: skipped unless ESCOUADE_TERM_BENCH is set.
//
//   ESCOUADE_TERM_BENCH=1 [ESCOUADE_TERM_BENCH_LABEL=before] [ESCOUADE_TERM_BENCH_AGENTS=4] [ESCOUADE_E2E_EXE=…]
//     [ESCOUADE_TERM_BENCH_SCENARIO=flood-real] [ESCOUADE_TERM_BENCH_SCREENS=3] [ESCOUADE_TERM_BENCH_SHELL=pwsh|bash|wsl|claude]
//     npx playwright test tests/e2e/terminal-latency.spec.ts
//
// The terminal under test (SHELL): a PowerShell (the default), a Git Bash, a WSL, or the first agent's « Vue Claude Code » (the
// fake CLI's interface, which draws its prompt line again at each key, as Claude Code's does). A shell the machine does not offer
// skips the test. With the « Vue Claude Code » the first agent shows it, so the agents at work are AGENTS more.
// TERMINALS is the number of terminals more that print without a pause (0: none, and the phases they make are left out).
//
// The load: SCENARIO is what each agent is told to play (the fake CLI's `flood`, small events; or `flood-real`, a busy superpowers
// agent: a plan of tasks, subagents, results of 2 to 30 KB); SCREENS is the number of terminals more that redraw a whole screen
// 30 times a second, like a TUI. Each phase also records the app's events (their number, size, which of them went through the
// slow path of Tauri's channels: a JSON of 8192 bytes or more, an output of 1024 or more) and the CPU of the app's processes.
//
// The way of a keystroke: keydown, xterm.js's onData, the `term_write` command (IPC, then the Rust command, which queues it for
// the terminal's input thread — before ESC-100's fix, it took a lock of all the terminals and wrote itself —, the write to the
// pseudo-console: "rust lock wait" is the time to queue, "rust pty write" the wait in the queue and the write), the shell's echo read by the backend's thread, the channel message to
// the page, xterm.js's parsing, and the frame that paints it. The page is instrumented from here (the wrappers of
// `window.__TAURI_INTERNALS__.invoke` and `.transformCallback`, which the Tauri API calls at each call: nothing in the app
// changes); the backend writes the times of its own steps to app.log when it runs with ESCOUADE_TERM_TRACE (set below; the
// build under test must have it). Every time is in ms since the epoch: the page's `performance.timeOrigin + performance.now()`
// and the backend's wall clock are compared as they are.
//
// "Painted" is the first animation frame after xterm.js parsed the echo (its callback, not the pixels). The pixels are measured
// apart, on PIXELS keystrokes a phase: the clip of the screen around the cursor is captured as fast as possible by
// `Page.captureScreenshot` (the composited frame, the WebGL canvas included) until it shows something it did not before the key
// was pressed. Before each of those keys the same clip is captured for 1.3 s without any key (the baseline: the cursor blinks,
// so the clip has two states at least, and a capture that shows one of the states seen then is no echo). Half of them are
// pressed while the captures go on (warm), half after the captures stopped for 0.5 s (cold: the screen idle).
//
// Limits: a key's origin is the event's own time stamp (when the browser built it from Playwright's command, not when
// Playwright sent it); a capture is a copy of the compositor's latest frame (not what the display scanned out), it is taken
// somewhere between its request and its answer (hence the cadence and the duration of the captures, recorded), and the captures
// themselves make the compositor draw frames (the cold keys tell how much that matters); the backend traces the first read after a write only, so an echo read before the next write is taken
// is the only one it can link to its write (keystrokes whose echoes pile up are left without their backend steps).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { test, expect, addProject, send } from './fixture';

test.skip(!process.env.ESCOUADE_TERM_BENCH, 'a measure to run by hand: ESCOUADE_TERM_BENCH=1');
test.use({ appEnv: { ESCOUADE_TERM_TRACE: '1' } });

const LABEL = process.env.ESCOUADE_TERM_BENCH_LABEL || 'run';
const AGENTS = Number(process.env.ESCOUADE_TERM_BENCH_AGENTS || 4);
/** Keystrokes per phase, typed by groups of `GROUP` (a line is cleared after each: its letters stay distinct). */
const KEYS = 40;
const GROUP = 10;
const FLOODING_TERMINALS = Number(process.env.ESCOUADE_TERM_BENCH_TERMINALS ?? 3);
/** What each agent is told in the phases with agents: the fake CLI's `flood` (small events) or `flood-real`. */
const SCENARIO = process.env.ESCOUADE_TERM_BENCH_SCENARIO || 'flood';
/** Terminals more, each running a full-screen program (see SCREEN_SCRIPT). */
const SCREENS = Number(process.env.ESCOUADE_TERM_BENCH_SCREENS || 0);
/** The terminal under test. */
type Kind = 'pwsh' | 'bash' | 'wsl' | 'claude';
const SHELL = (process.env.ESCOUADE_TERM_BENCH_SHELL || 'pwsh') as Kind;
const KINDS: Record<Kind, { menu: RegExp | null; clear: string; field: string; what: string }> = {
  // Escape clears PSReadLine's line; Ctrl+U readline's (and the fake interface's).
  pwsh: { menu: /PowerShell/, clear: 'Escape', field: '.tv .xterm-helper-textarea', what: 'PowerShell' },
  bash: { menu: /Git Bash/, clear: 'Control+u', field: '.tv .xterm-helper-textarea', what: 'Git Bash' },
  wsl: { menu: /WSL/, clear: 'Control+u', field: '.tv .xterm-helper-textarea', what: 'WSL' },
  claude: { menu: null, clear: 'Control+u', field: 'main .tui .xterm-helper-textarea', what: '« Vue Claude Code »' },
};
if (!KINDS[SHELL]) throw new Error(`ESCOUADE_TERM_BENCH_SHELL: pwsh, bash, wsl or claude (got ${SHELL})`);
const KIND = KINDS[SHELL];
/** Terminals of the sidebar the terminal under test takes (the « Vue Claude Code » is no sidebar row). */
const BENCH_ROWS = SHELL === 'claude' ? 0 : 1;
/** Keystrokes of a phase whose echo is looked for in the screen's pixels, by index, and how (the others only by the page). */
const PIXELS = Number(process.env.ESCOUADE_TERM_BENCH_PIXELS ?? 10);
const PIXEL_KEYS: Record<number, 'warm' | 'cold'> = Object.fromEntries(
  [
    [0, 'warm'],
    [10, 'warm'],
    [20, 'warm'],
    [30, 'warm'],
    [7, 'warm'],
    [3, 'cold'],
    [13, 'cold'],
    [17, 'cold'],
    [25, 'cold'],
    [35, 'cold'],
  ].slice(0, PIXELS),
);
/** The clip around the cursor: this many cells from the cursor's to the right. */
const CLIP_CELLS = 8;
/** Captures of the clip with no key, before a key whose pixels are looked for (ms), and the idle time before a cold key. */
const BASELINE_MS = 1300;
const COLD_IDLE_MS = 500;
/** Changes of a box of the page, looked for in the captures at the start of each phase: the reference for the pixels of a key. */
const CALIBRATIONS = Number(process.env.ESCOUADE_TERM_BENCH_CALIBRATIONS ?? 6);
/** Captures at the end that must all show the echo (none a state of the baseline) for it to count. */
const CONFIRM = 3;
/** How long the captures go on once the echo is seen (ms): to see whether it stays. */
const TAIL_MS = Number(process.env.ESCOUADE_TERM_BENCH_TAIL ?? 400);
/** How long a key is waited for on screen (ms). */
const PIXEL_TIMEOUT = 3000;
/** Captures in flight at once. */
const PIXEL_WORKERS = Number(process.env.ESCOUADE_TERM_BENCH_WORKERS || 2);
/** A folder where the distinct images of the captures are kept (<hash>.png), to look at what the states are. */
const DUMP = process.env.ESCOUADE_TERM_BENCH_DUMP;
/** Stops after the phase with nothing else running, to try the bench out. */
const IDLE_ONLY = !!process.env.ESCOUADE_TERM_BENCH_IDLE_ONLY;

/** A terminal that prints a line of ~110 characters every 5 ms. */
const FLOOD_COMMAND = `node -e "setInterval(()=>console.log(Date.now()+' '+'x'.repeat(100)),5)"`;
/**
 * A full-screen program, as a TUI redraws itself: 30 times a second the cursor goes home and 40 lines of 120 changing
 * characters, a few colours on each, are written at once (~5.5 KB a frame). It goes in a file (quotes in a PowerShell line).
 */
const SCREEN_SCRIPT = `
const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
let n = 0;
process.stdout.write('\\x1b[?25l\\x1b[?7l\\x1b[2J');
setInterval(() => {
  n++;
  const rows = [];
  for (let row = 0; row < 40; row++) {
    let line = '';
    for (let part = 0; part < 4; part++) {
      let text = '';
      for (let c = 0; c < 30; c++) text += pool[(n * 3 + row * 7 + part * 11 + c * 5) % pool.length];
      line += '\\x1b[' + (31 + ((row + part + n) % 6)) + 'm' + text;
    }
    rows.push(line + '\\x1b[0m');
  }
  process.stdout.write('\\x1b[H' + rows.join('\\r\\n'));
}, 28);
`;
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ';
const PASTES: [string, number][] = [
  ['paste 2000 chars #1', 2000],
  ['paste 2000 chars #2', 2000],
  ['paste 2000 chars #3', 2000],
  ['paste 200 chars', 200],
];
/** Between a page's time and the backend's: both are wall clocks, so only the rounding of a time stamp. */
const TOLERANCE = 5;

// ---------- what the page records ----------

interface Write {
  id: string;
  data: string;
  called: number;
  resolved?: number;
  failed?: boolean;
}
interface Spawn {
  channel: number;
  called: number;
  resolved?: number;
  termId?: string;
}
interface Chunk {
  ch: number;
  t: number;
  bytes: number;
  index: number;
  painted?: number;
  text?: string;
}
interface Key {
  key: string;
  ts: number;
  seen: number;
  /** Pressed with Control (Ctrl+U clears the line: it is no letter typed). */
  ctrl?: boolean;
}
interface UiMessage {
  /** When it came. */
  t: number;
  /** Its JSON in bytes (as the backend serialized it: the way Tauri chooses to send it is by that size). */
  n: number;
  /** Its `type` (agent, conv, git…). */
  k: string;
  /** The agent it is about. */
  a?: string;
}
interface Drained {
  writes: Write[];
  chunks: Chunk[];
  /** Each message that is no terminal output and no answer to a command (the app's events, other channels). */
  ui: UiMessage[];
  /** Requests for the data of a channel message too big to be sent in the page's script (`plugin:__TAURI_CHANNEL__|fetch`). */
  fetches: number;
  /** Answers to commands that came. */
  replies: number;
  /** Commands sent, by name. */
  ipc: Record<string, number>;
  keys: Key[];
  longtasks: { start: number; duration: number }[];
  /** How late the page's 20 ms timer fired each time (ms). */
  lags: number[];
}

/**
 * Runs in the page, before the bench terminal opens. Tauri's `invoke` and `transformCallback` cannot be wrapped (read-only
 * properties of `window.__TAURI_INTERNALS__`), but they go through two things that can: `window.fetch` (each command is a
 * request to the `ipc` protocol, its callbacks named in the headers) and the `Map` of callbacks (`set` is looked up on it at each
 * registration, `runCallback` takes from it).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function instrument() {
  const w = window as any;
  if (w.__bench) return;
  const now = () => performance.timeOrigin + performance.now();
  const ti = w.__TAURI_INTERNALS__;
  const b: any = {
    now,
    writes: [],
    spawns: [],
    chunks: [],
    ui: [],
    fetches: 0,
    replies: 0,
    ipc: {},
    keys: [],
    longtasks: [],
    lags: [],
    lastAt: {},
    lastText: {},
    total: {},
  };
  b.drain = () => {
    const out = {
      writes: b.writes,
      chunks: b.chunks,
      ui: b.ui,
      fetches: b.fetches,
      replies: b.replies,
      ipc: b.ipc,
      keys: b.keys,
      longtasks: b.longtasks,
      lags: b.lags,
    };
    b.writes = [];
    b.chunks = [];
    b.ui = [];
    b.fetches = 0;
    b.replies = 0;
    b.ipc = {};
    b.keys = [];
    b.longtasks = [];
    b.lags = [];
    return out;
  };

  // The commands the page sent, by the callback that answers (and the one that fails).
  const calls = new Map<number, any>();
  const fetch0 = window.fetch;
  window.fetch = function (this: unknown, input: any, init?: any) {
    const called = now();
    const m = /^(?:https?:\/\/ipc\.localhost|ipc:\/\/localhost)\/([^?]+)/.exec(
      typeof input === 'string' ? input : String(input?.url ?? input),
    );
    if (m && decodeURIComponent(m[1]).includes('__TAURI_CHANNEL__')) b.fetches++;
    if (m && init?.headers?.get) {
      const cmd = decodeURIComponent(m[1]);
      b.ipc[cmd] = (b.ipc[cmd] ?? 0) + 1;
      let rec: any = { cmd };
      if (cmd === 'term_write') {
        const payload = JSON.parse(init.body);
        rec = { cmd, id: payload.id, data: payload.data, called };
        b.writes.push(rec);
      } else if (cmd === 'term_spawn' || cmd === 'agent_terminal') {
        // The terminal's id comes with the answer; its output arrives on the channel passed as `output`.
        // (`agent_terminal`: the « Vue Claude Code ».)
        rec = { cmd, channel: Number(String(JSON.parse(init.body).output).replace('__CHANNEL__:', '')), called };
        b.spawns.push(rec);
      }
      const ok = Number(init.headers.get('Tauri-Callback'));
      const err = Number(init.headers.get('Tauri-Error'));
      calls.set(ok, { rec, error: false, other: err });
      calls.set(err, { rec, error: true, other: ok });
    }
    return fetch0.apply(this, arguments as any);
  } as typeof fetch;

  const wrap = (id: number, fn: (data: any) => unknown) =>
    function (this: unknown, data: any) {
      const t = now();
      const call = calls.get(id);
      if (call) {
        // The answer to a command.
        calls.delete(id);
        calls.delete(call.other);
        b.replies++;
        if (call.rec.cmd === 'term_write' || call.rec.cmd === 'term_spawn' || call.rec.cmd === 'agent_terminal') {
          call.rec.resolved = t;
          if (call.error) call.rec.failed = true;
          else if (call.rec.cmd !== 'term_write') call.rec.termId = data?.id;
        }
        return fn.call(this, data);
      }
      const message = data?.message;
      if (!(message instanceof ArrayBuffer)) {
        if (data && 'message' in data) {
          const json = JSON.stringify(message) ?? '';
          const n = /[\u0080-\uffff]/.test(json) ? new TextEncoder().encode(json).length : json.length;
          b.ui.push({
            t,
            n,
            k: typeof message?.type === 'string' ? message.type : typeof message,
            a: message?.agent?.id ?? message?.agentId,
          });
        }
        return fn.call(this, data);
      }
      const chunk: any = { ch: id, t, bytes: message.byteLength, index: data.index };
      if (message.byteLength <= 600) chunk.text = new TextDecoder().decode(message);
      b.chunks.push(chunk);
      b.lastAt[id] = t;
      b.lastText[id] = chunk.text;
      b.total[id] = (b.total[id] ?? 0) + 1;
      try {
        return fn.call(this, data);
      } finally {
        // xterm.js parses in a timer, then paints in a frame: this lands right after.
        setTimeout(() => requestAnimationFrame(() => (chunk.painted = now())), 0);
      }
    };
  const set = ti.callbacks.set;
  ti.callbacks.set = function (this: Map<number, unknown>, id: number, fn: (data: any) => unknown) {
    return set.call(this, id, wrap(id, fn));
  };
  // Those registered before this (the channel of the app's events, among others) are wrapped too.
  for (const [id, fn] of [...ti.callbacks.entries()]) set.call(ti.callbacks, id, wrap(id, fn));

  window.addEventListener(
    'keydown',
    (e) => b.keys.push({ key: e.key, ts: performance.timeOrigin + e.timeStamp, seen: now(), ctrl: e.ctrlKey }),
    true,
  );
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) b.longtasks.push({ start: performance.timeOrigin + e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // not supported
  }
  let last = now();
  setInterval(() => {
    const t = now();
    b.lags.push(Math.max(0, t - last - 20));
    last = t;
  }, 20);
  w.__bench = b;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- what the backend logs ----------

interface RustWrite {
  id: string;
  bytes: number;
  called: number;
  locked: number;
  done: number;
}
interface RustRead {
  id: string;
  bytes: number;
  at: number;
  sent: number;
}

/** The `term-trace` lines of app.log, their times in ms since the epoch. */
function rustTrace(log: string): { writes: RustWrite[]; reads: RustRead[] } {
  const writes: RustWrite[] = [];
  const reads: RustRead[] = [];
  if (!fs.existsSync(log)) return { writes, reads };
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    const m = /term-trace (write|read) (.*)$/.exec(line);
    if (!m) continue;
    const kv = Object.fromEntries([...m[2].matchAll(/(\w+)=(\S+)/g)].map((x) => [x[1], x[2]]));
    const ms = (us: string) => Number(us) / 1000;
    if (m[1] === 'write') {
      writes.push({ id: kv.id, bytes: Number(kv.bytes), called: ms(kv.called), locked: ms(kv.locked), done: ms(kv.done) });
    } else {
      reads.push({ id: kv.id, bytes: Number(kv.bytes), at: ms(kv.at), sent: ms(kv.sent) });
    }
  }
  return { writes, reads };
}

// ---------- CPU of the app's processes ----------

interface Proc {
  pid: number;
  ppid: number;
  name: string;
  cmd: string;
  /** Seconds of processor time (kernel + user) since the process started. */
  cpu: number;
}
interface Snapshot {
  /** The middle of the query (it takes a moment). */
  at: number;
  procs: Proc[];
}

/** Every process of the machine, with its processor time (one CIM query: a PowerShell start costs ~0.5 s, at a phase's edges only). */
function snapshot(): Snapshot {
  const before = Date.now();
  const script =
    "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}|{4}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, ($_.KernelModeTime + $_.UserModeTime), ($_.CommandLine -replace '\\s+', ' ') }";
  const text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    maxBuffer: 256 << 20,
  });
  const procs: Proc[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d+)\|(\d+)\|([^|]*)\|(\d+)\|(.*)$/.exec(line);
    if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3], cmd: m[5], cpu: Number(m[4]) / 1e7 });
  }
  return { at: (before + Date.now()) / 2, procs };
}

/** The app's processes, by what they are: the main process, the webview's (browser, renderer, gpu…), what the app started. */
function roles(snap: Snapshot, root: string): Map<number, string> {
  const tag = path.basename(root);
  const web = snap.procs.filter((p) => /msedgewebview2/i.test(p.name) && p.cmd.includes(tag));
  const kind = (p: Proc) => /--type=([\w-]+)/.exec(p.cmd)?.[1] ?? 'browser';
  const main = snap.procs.find((p) => p.pid === web.find((w) => kind(w) === 'browser')?.ppid);
  const out = new Map<number, string>();
  if (main) out.set(main.pid, 'main (escouade.exe)');
  for (const p of web) out.set(p.pid, `webview ${kind(p)}`);
  // What the app started (the fake CLIs, the shells and what they run, the pseudo-consoles), at any depth below the main process.
  const below = new Set(main ? [main.pid] : []);
  for (let more = true; more;) {
    more = false;
    for (const p of snap.procs) {
      if (below.has(p.pid) || out.has(p.pid) || !below.has(p.ppid)) continue;
      below.add(p.pid);
      out.set(p.pid, 'children (agents, shells, programs)');
      more = true;
    }
  }
  return out;
}

interface Cpu {
  /** Per kind of process, as % of one core (the sum of the processes of that kind). */
  byRole: Record<string, number>;
  /** The processes of the webview and of the main one, one by one (the renderers are not all the page's). */
  procs: { pid: number; role: string; cpu: number }[];
  seconds: number;
}

/** CPU of the app's processes between two snapshots, as % of one core. */
function cpuBetween(a: Snapshot, b: Snapshot, root: string): Cpu {
  const seconds = (b.at - a.at) / 1000;
  const roleOf = roles(b, root);
  const was = new Map(a.procs.map((p) => [p.pid, p.cpu]));
  const byRole: Record<string, number> = {};
  const procs: Cpu['procs'] = [];
  for (const p of b.procs) {
    const role = roleOf.get(p.pid);
    if (!role) continue;
    const cpu = ((p.cpu - (was.get(p.pid) ?? 0)) / seconds) * 100;
    byRole[role] = (byRole[role] ?? 0) + cpu;
    if (!role.startsWith('children')) procs.push({ pid: p.pid, role, cpu });
  }
  return { byRole, procs, seconds };
}

// ---------- numbers ----------

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
/** Nearest rank. */
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
interface Stat {
  n: number;
  median?: number;
  p95?: number;
  max?: number;
}
function stat(xs: number[]): Stat {
  const ok = xs.filter((x) => Number.isFinite(x));
  return ok.length ? { n: ok.length, median: median(ok), p95: percentile(ok, 95), max: Math.max(...ok) } : { n: 0 };
}
const f1 = (x: number | undefined) => (x === undefined ? '-' : x.toFixed(1));

// ---------- the chain of a keystroke ----------

/**
 * What the steps are called, in the order of a keystroke's way. The ones without brackets add up to the TOTAL (up to the
 * ~1 ms between the page's clock and the backend's); the ones in brackets are a part of the step before or run beside it.
 *
 * The shell answers a key with two outputs, not one: the first (read by the backend right after the write) only hides the
 * cursor (ESC[?25l), the letter comes ~10 ms later in the second one, which is what the screen waits for.
 */
const STEPS = [
  'key -> invoke (term_write)',
  '  (key -> page handler)',
  'invoke -> rust called (IPC in)',
  'rust lock wait',
  'rust pty write',
  '  (invoke round trip, js side)',
  'rust done -> first output read',
  'first output read -> js received',
  '  (rust channel send)',
  'first output -> letter output (js)',
  'letter output received -> painted',
  'TOTAL key -> painted',
] as const;
type Step = (typeof STEPS)[number];

interface Linked {
  js: Write;
  rust?: RustWrite;
  /** The backend's read of the first output after the write. */
  read?: RustRead;
  /** The first message after the write: the one the backend's read is the source of. */
  first?: Chunk;
  /** The message that carries the key's letter (the first one for a key that has none). */
  chunk?: Chunk;
  /** Whether `first` was linked through the backend's read (same size, after it) or only by time (first output after the write). */
  by?: 'rust' | 'time';
}

/** What a terminal shows of an output: without its escape sequences. */
const visible = (text: string | undefined) =>
  (text ?? '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[()][0-9A-Za-z]/g, '');

interface Bench {
  termId: string;
  channel: number;
}

/** Links each write of the page to the backend's write, to the read of its echo and to the message that carried it. */
function link(writes: Write[], bench: Bench, rust: { writes: RustWrite[]; reads: RustRead[] }, chunks: Chunk[]): Linked[] {
  const mine = writes.filter((x) => x.id === bench.termId).sort((a, b) => a.called - b.called);
  const rws = rust.writes.filter((x) => x.id === bench.termId).sort((a, b) => a.locked - b.locked);
  const reads = rust.reads.filter((x) => x.id === bench.termId).sort((a, b) => a.at - b.at);
  const out = chunks.filter((c) => c.ch === bench.channel).sort((a, b) => a.t - b.t);
  const taken = new Set<RustWrite>();
  let next = 0;
  return mine.map((js) => {
    const l: Linked = { js };
    const size = Buffer.byteLength(js.data);
    l.rust = rws.find((r) => !taken.has(r) && r.bytes === size && r.called >= js.called - TOLERANCE);
    if (l.rust) {
      taken.add(l.rust);
      // Its echo: the first read after the write was taken, unless another write came in between (it would own it).
      const r = l.rust;
      const after = rws.find((x) => x.locked > r.locked)?.locked ?? Infinity;
      l.read = reads.find((e) => e.at >= r.locked && e.at < after);
    }
    let first = -1;
    if (l.read) {
      const read = l.read;
      first = out.findIndex((c, k) => k >= next && c.t >= read.at - TOLERANCE && c.bytes === read.bytes);
      if (first >= 0) l.by = 'rust';
    }
    if (first < 0) {
      first = out.findIndex((c) => c.t >= js.called);
      if (first >= 0) l.by = 'time';
    }
    if (first >= 0) {
      next = first + 1;
      l.first = out[first];
      // A letter shows in the first output that has it once the escape sequences are gone (the line is drawn again whole
      // at each key, so the letters of the keys before it are there too: a group's letters are all different).
      l.chunk = /^[a-z]$/i.test(js.data) ? out.slice(first).find((c) => visible(c.text).includes(js.data)) : l.first;
    }
    return l;
  });
}

function steps(key: Key | undefined, l: Linked): Partial<Record<Step, number>> {
  const { js, rust, read, first, chunk } = l;
  const s: Partial<Record<Step, number>> = {};
  if (key) {
    s['  (key -> page handler)'] = key.seen - key.ts;
    s['key -> invoke (term_write)'] = js.called - key.ts;
  }
  if (js.resolved !== undefined) s['  (invoke round trip, js side)'] = js.resolved - js.called;
  if (rust) {
    s['invoke -> rust called (IPC in)'] = rust.called - js.called;
    s['rust lock wait'] = rust.locked - rust.called;
    s['rust pty write'] = rust.done - rust.locked;
  }
  if (rust && read) {
    s['rust done -> first output read'] = read.at - rust.done;
    s['  (rust channel send)'] = read.sent - read.at;
    if (first && l.by === 'rust') s['first output read -> js received'] = first.t - read.at;
  }
  if (first && chunk) s['first output -> letter output (js)'] = chunk.t - first.t;
  if (chunk?.painted !== undefined) {
    s['letter output received -> painted'] = chunk.painted - chunk.t;
    if (key) s['TOTAL key -> painted'] = chunk.painted - key.ts;
  }
  return s;
}

interface KeyRow {
  key: string;
  at: number;
  /** When the frame after the echo's parsing came (ms since the epoch). */
  painted?: number;
  by?: 'rust' | 'time';
  steps: Partial<Record<Step, number>>;
}

/** The keystrokes of a phase: each letter the page saw pressed, with the write xterm.js made of it. */
function keystrokes(data: Drained, linked: Linked[]): KeyRow[] {
  const letters = linked.filter((l) => /^[a-z]$/.test(l.js.data));
  const used = new Set<Linked>();
  const rows: KeyRow[] = [];
  // (Ctrl+U, which clears the line, is no letter.)
  for (const key of data.keys.filter((k) => !k.ctrl && /^[a-z]$/.test(k.key))) {
    const l = letters.find((x) => !used.has(x) && x.js.data === key.key && x.js.called >= key.ts - TOLERANCE);
    if (!l) continue;
    used.add(l);
    rows.push({ key: key.key, at: key.ts, painted: l.chunk?.painted, by: l.by, steps: steps(key, l) });
  }
  return rows;
}

interface Freeze {
  /** The first key of the run, as a local time. */
  at: string;
  keys: number;
  /** From the first key of the run to the last one's. */
  spanMs: number;
  /** Key → painted of the first key (how long it waited). */
  waitedMs: number;
}

/** Keys that came to the screen all at once: typed 200 ms apart, several painted within the same few ms (the page was stuck). */
function freezes(keys: KeyRow[]): Freeze[] {
  const sorted = keys.filter((k) => k.painted !== undefined).sort((a, b) => a.at - b.at);
  const out: Freeze[] = [];
  let run: KeyRow[] = [];
  const flush = () => {
    if (run.length >= 2) {
      out.push({
        at: new Date(run[0].at).toTimeString().slice(0, 8) + '.' + String(Math.round(run[0].at) % 1000).padStart(3, '0'),
        keys: run.length,
        spanMs: run.at(-1)!.at - run[0].at,
        waitedMs: run[0].painted! - run[0].at,
      });
    }
    run = [];
  };
  for (const k of sorted) {
    if (run.length && Math.abs(k.painted! - run.at(-1)!.painted!) > 5) flush();
    run.push(k);
  }
  flush();
  return out;
}

interface PasteRow {
  label: string;
  chars: number;
  /** ms since the paste event was dispatched, or durations between two steps. */
  steps: Record<string, number | undefined>;
  chunks: number;
  bytes: number;
}

function pasteRow(label: string, chars: number, t0: number, tEnd: number, linked: Linked[], chunks: Chunk[], bench: Bench): PasteRow {
  const l = linked.find((x) => x.js.called >= t0 - TOLERANCE && x.js.data.length >= chars);
  const s: Record<string, number | undefined> = {};
  const echoes = chunks.filter((c) => c.ch === bench.channel && c.t >= (l?.js.called ?? t0) && c.t <= tEnd).sort((a, b) => a.t - b.t);
  if (l) {
    const { js, rust, read } = l;
    s['paste -> invoke'] = js.called - t0;
    s['invoke -> rust called'] = rust ? rust.called - js.called : undefined;
    s['rust lock wait'] = rust ? rust.locked - rust.called : undefined;
    s['rust pty write'] = rust ? rust.done - rust.locked : undefined;
    s['invoke round trip'] = js.resolved !== undefined ? js.resolved - js.called : undefined;
    s['rust done -> first output read'] = rust && read ? read.at - rust.done : undefined;
    s['first output read -> js received'] = read && echoes[0] ? echoes[0].t - read.at : undefined;
    s['paste -> first output received'] = echoes[0] ? echoes[0].t - t0 : undefined;
    const text = echoes.find((c) => visible(c.text).trim());
    s['paste -> first text received'] = text ? text.t - t0 : undefined;
    s['first -> last echo received'] = echoes.length ? echoes.at(-1)!.t - echoes[0].t : undefined;
    const painted = echoes.map((c) => c.painted).filter((p): p is number => p !== undefined);
    s['paste -> last echo painted'] = painted.length ? Math.max(...painted) - t0 : undefined;
  }
  return { label, chars, steps: s, chunks: echoes.length, bytes: echoes.reduce((n, c) => n + c.bytes, 0) };
}

// ---------- driving the app ----------

/** The page's clock (`performance.timeOrigin + now()`) minus the system's (`Date.now()`, the backend's): the median of 21. */
async function pageSkew(page: Page): Promise<number> {
  return page.evaluate(() => {
    const xs: number[] = [];
    for (let i = 0; i < 21; i++) xs.push((window as any).__bench.now() - Date.now()); // eslint-disable-line @typescript-eslint/no-explicit-any
    return xs.sort((a, b) => a - b)[10];
  });
}

async function drain(page: Page): Promise<Drained> {
  return page.evaluate(() => (window as any).__bench.drain()); // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function spawns(page: Page): Promise<Spawn[]> {
  return page.evaluate(() => (window as any).__bench.spawns); // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Waits until the channel has had output and has been silent for `quietMs`. */
async function quiet(page: Page, channel: number, quietMs: number, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < until) {
    const s = await page.evaluate((ch) => {
      const b = (window as any).__bench; // eslint-disable-line @typescript-eslint/no-explicit-any
      return { total: b.total[ch] ?? 0, since: b.now() - (b.lastAt[ch] ?? 0), last: String(b.lastText[ch]).slice(-120) };
    }, channel);
    last = s;
    if (s.total > 0 && s.since >= quietMs) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`channel ${channel} never went quiet for ${quietMs} ms: ${JSON.stringify(last)}`);
}

/** Output messages the channel received in `ms`, per second. */
async function rate(page: Page, channel: number, ms: number): Promise<number> {
  const total = () => page.evaluate((ch) => (window as any).__bench.total[ch] ?? 0, channel); // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = await total();
  await page.waitForTimeout(ms);
  return ((await total()) - a) / (ms / 1000);
}

/**
 * Opens a terminal of the menu `menu` matches (a PowerShell unless told otherwise; the view shows it), once it has drawn its
 * prompt. `required`: the test is skipped when the machine does not offer that shell.
 */
async function newTerminal(page: Page, quietMs: number, menu: RegExp = /PowerShell/, required = false): Promise<Bench> {
  const before = (await spawns(page)).length;
  await page.getByRole('button', { name: 'Nouveau terminal' }).click();
  const items = page.getByRole('menuitem');
  await items
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
  const item = items.filter({ hasText: menu }).first();
  if (required && !(await item.count())) {
    const offered = await items.allTextContents();
    await page.keyboard.press('Escape');
    test.skip(true, `${KIND.what} is not offered by this machine (the menu has: ${offered.join(', ') || 'nothing'})`);
  }
  await item.click();
  return spawned(page, before, quietMs);
}

/** The terminal the `before`th spawn of the page opened, once its output has been silent for `quietMs`. */
async function spawned(page: Page, before: number, quietMs: number): Promise<Bench> {
  await expect.poll(async () => (await spawns(page))[before]?.termId, { timeout: 60_000 }).toBeTruthy();
  const spawn = (await spawns(page))[before];
  await quiet(page, spawn.channel, quietMs);
  return { termId: spawn.termId!, channel: spawn.channel };
}

/** Opens the terminal under test, and waits until it echoes a key (a shell reads its input only once it is up). */
async function openBench(page: Page): Promise<Bench> {
  let bench: Bench;
  if (SHELL === 'claude') {
    const before = (await spawns(page)).length;
    // The first agent's header (it is the one shown after the project was added).
    await page.getByRole('button', { name: 'Vue Claude Code' }).click();
    await expect(page.locator(KIND.field)).toHaveCount(1, { timeout: 30_000 });
    bench = await spawned(page, before, 2000);
  } else {
    bench = await newTerminal(page, SHELL === 'wsl' ? 4000 : 3000, KIND.menu!, true);
  }
  await page.locator(KIND.field).focus();
  const t0 = await page.evaluate(() => (window as any).__bench.now()); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press('q');
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ ch, t0 }) => {
            const b = (window as any).__bench; // eslint-disable-line @typescript-eslint/no-explicit-any
            return b.chunks.some((c: Chunk) => c.ch === ch && c.t > t0 && (c.text ?? '').includes('q'));
          },
          { ch: bench.channel, t0 },
        ),
      { timeout: 60_000, message: `${KIND.what} never echoed a key` },
    )
    .toBe(true);
  await page.keyboard.press(KIND.clear);
  await quiet(page, bench.channel, 1500);
  return bench;
}

/** Shows the terminal under test, and puts the keyboard in it. */
async function showBench(page: Page) {
  await (SHELL === 'claude' ? page.locator('.card').first() : page.locator('.term').first()).click();
  await expect(page.locator(KIND.field)).toHaveCount(1);
  await page.locator(KIND.field).focus();
  await page.waitForTimeout(300);
}

interface PhaseResult {
  name: string;
  startMs: number;
  endMs: number;
  seconds: number;
  keys: KeyRow[];
  keyStats: Record<string, Stat>;
  /** The keys the pixels were looked for, and what they say. */
  pixels: PixelRow[];
  pixelStats: PixelStats;
  /** The reference (see calibrate). */
  calibration: CalibRow[];
  calibStats: CalibStats;
  /** Keys that came to the screen all at once. */
  freezes: Freeze[];
  pastes: PasteRow[];
  rates: Record<string, number | string>;
  /** The app's events and the way they came: by type, then all together. */
  ui: UiStats;
  cpu: Cpu;
  raw: { drained: Drained; linked: Linked[] };
}

/** The Rust side of Tauri sends a JSON of this many bytes or more by an extra request (3 hops) rather than in the page's script. */
const JSON_FETCH_FROM = 8192;
/** The same for a raw output (a terminal's). */
const RAW_FETCH_FROM = 1024;

interface UiStats {
  n: number;
  perSecond: number;
  kbPerSecond: number;
  bytes: Stat;
  /** Events of 8192 bytes or more, the ones that went through the extra request. */
  bigPerSecond: number;
  /** Terminal outputs of 1024 bytes or more, same. */
  bigTerminalPerSecond: number;
  /** The requests the page made for the data of a channel message. */
  fetchesPerSecond: number;
  byType: Record<string, { perSecond: number; kbPerSecond: number; bytes: Stat; bigPerSecond: number }>;
  /** Agents the events are about, in the phase. */
  agents: number;
}

function uiStats(drained: Drained, seconds: number): UiStats {
  const sizes = (xs: UiMessage[]) => stat(xs.map((u) => u.n));
  const kb = (xs: UiMessage[]) => xs.reduce((n, u) => n + u.n, 0) / 1024 / seconds;
  const big = (xs: UiMessage[]) => xs.filter((u) => u.n >= JSON_FETCH_FROM).length / seconds;
  const byType: UiStats['byType'] = {};
  for (const k of new Set(drained.ui.map((u) => u.k))) {
    const xs = drained.ui.filter((u) => u.k === k);
    byType[k] = { perSecond: xs.length / seconds, kbPerSecond: kb(xs), bytes: sizes(xs), bigPerSecond: big(xs) };
  }
  return {
    n: drained.ui.length,
    perSecond: drained.ui.length / seconds,
    kbPerSecond: kb(drained.ui),
    bytes: sizes(drained.ui),
    bigPerSecond: big(drained.ui),
    bigTerminalPerSecond: drained.chunks.filter((c) => c.bytes >= RAW_FETCH_FROM).length / seconds,
    fetchesPerSecond: drained.fetches / seconds,
    byType,
    agents: new Set(drained.ui.map((u) => u.a).filter(Boolean)).size,
  };
}

// ---------- the pixels ----------

/** A rectangle of the page, in CSS pixels. */
interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Capture {
  /** Asked / answered (ms since the epoch, this process's clock). */
  t0: number;
  t1: number;
  /** A hash of the image's bytes. */
  hash: string;
}
/**
 * What looking for a change in the pixels found. The captures are taken somewhere between their request and their answer: the
 * change came after the request of the last capture that did not show it (`lastSameFrom`) and before the answer to the first
 * that did (`shownAt`, the upper bound the numbers below use; `shownFrom` is when that one was asked).
 */
interface Probe {
  /** When the stimulus (the key, the change of the box) was started (ms since the epoch, this process's clock). */
  pressAt: number;
  /** None: PIXEL_TIMEOUT in vain. */
  shownFrom?: number;
  shownAt?: number;
  lastSameFrom?: number;
  lastSameAt?: number;
  /** Captures answered between the stimulus and the one that showed it. */
  captures: number;
  /** Whether CONFIRM captures in a row (the last ones) showed it: not, when the wait for it ended first. */
  confirmed: boolean;
  /** A capture asked after those that confirmed it showed a state of the baseline again. */
  flipped: boolean;
  /** The states the captures showed from the one that showed the echo on, for TAIL_MS (see probe). */
  tail: string;
  /** The captures after the stimulus, when it was not confirmed. */
  unconfirmed?: { baseline: string[]; after: { asked: number; answered: number; state: string; inBaseline: boolean }[] };
  /** The gap between the answers, and the time one capture takes (medians over the captures after the stimulus). */
  cadenceMs?: number;
  captureMs?: number;
  /** The baseline: captures with no stimulus, the states they show (a blinking cursor makes two), the changes from one to the next. */
  baseline: { captures: number; states: number; changes: number; cadenceMs?: number };
}
type Mode = 'warm' | 'cold';
interface PixelRow extends Probe {
  /** The index of the key in the phase, and its letter. */
  index: number;
  key: string;
  /** Pressed while the captures went on (warm) or after they had stopped for COLD_IDLE_MS (cold). */
  mode: Mode;
  clip: Clip;
  /** The key's time stamp, and from it to the pixels (shownAt on the page's clock), to the capture's request, to the earlier capture's request, to the page's rAF; and the rAF's TOTAL. */
  keyAt?: number;
  pixelMs?: number;
  askedMs?: number;
  lowMs?: number;
  paintedMs?: number;
  afterPaintMs?: number;
}
/** The reference: a box of the page changes colour in an animation frame (no terminal, no WebGL), and the captures see it. */
interface CalibRow extends Probe {
  mode: Mode;
  /** The time of the animation frame that changed the box (the page's clock), and from it to the capture that showed it. */
  setAt?: number;
  afterSetMs?: number;
}
interface PixelStats {
  /** Key event → first capture that differs, answered. */
  all: Stat;
  warm: Stat;
  cold: Stat;
  /** Key event → request of that capture, and → request of the capture before it. */
  asked: Stat;
  low: Stat;
  /** The TOTAL key → painted (the page's rAF) of the same keys. */
  painted: Stat;
  /** Pixels - painted, key by key. */
  afterPaint: Stat;
  cadence: Stat;
  capture: Stat;
  /** Keys never seen on screen within PIXEL_TIMEOUT; seen, but not confirmed by the captures after; seen before the page's own frame (suspect). */
  timeouts: number;
  unconfirmed: number;
  flipped: number;
  early: number;
  /** Over the baselines: captures, how many states they show at most, and the changes of state per second. */
  baseline: { captures: number; maxStates: number; changesPerSecond: number };
}
interface CalibStats {
  all: Stat;
  warm: Stat;
  cold: Stat;
  capture: Stat;
  cadence: Stat;
  timeouts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nodeNow = () => performance.timeOrigin + performance.now();

/** The cell the cursor is in and the CLIP_CELLS after it, on the line (xterm.js keeps its hidden textarea on the cursor's cell). */
async function cursorClip(page: Page): Promise<Clip> {
  return page.locator(KIND.field).evaluate((ta, cells) => {
    const r = ta.getBoundingClientRect();
    const screen = ta.closest('.xterm')!.querySelector('.xterm-screen')!.getBoundingClientRect();
    return { x: r.x, y: r.y, width: Math.max(1, Math.min(cells * r.width, screen.right - r.x)), height: r.height };
  }, CLIP_CELLS);
}

/** One capture of the clip, as the compositor has it (the WebGL canvas included). */
async function capture(cdp: CDPSession, clip: Clip): Promise<Capture> {
  const t0 = nodeNow();
  const r = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, scale: 1 },
    fromSurface: true,
    optimizeForSpeed: true,
  });
  const t1 = nodeNow();
  const hash = crypto.createHash('md5').update(r.data).digest('hex');
  if (DUMP) {
    fs.mkdirSync(DUMP, { recursive: true });
    const file = path.join(DUMP, `${hash}.png`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
  return { t0, t1, hash };
}

/** Captures as fast as possible (PIXEL_WORKERS at once, each after its own last one) until `stopped`; each answer goes to `each`. */
function capturing(cdp: CDPSession, clip: Clip, each: (c: Capture) => void, stopped: () => boolean): Promise<unknown> {
  const loop = async (i: number) => {
    await sleep(i * 8);
    while (!stopped()) each(await capture(cdp, clip));
  };
  return Promise.all(Array.from({ length: PIXEL_WORKERS }, (_, i) => loop(i)));
}

/**
 * Starts `stimulus` and looks for its effect in the pixels of `clip`: the clip is captured with no stimulus for `baselineMs`
 * (the states it shows are the baseline: a cursor that blinks is one of them), then the stimulus goes, and the effect is the
 * first capture after it that shows a state the baseline did not, provided the captures that follow (CONFIRM of them, in the
 * order they were asked) show none of the baseline's states again (a state seen once in passing is no echo). Cold: the captures
 * stop for COLD_IDLE_MS before the stimulus, and start again with it.
 */
async function probe(cdp: CDPSession, clip: Clip, mode: Mode, baselineMs: number, stimulus: () => Promise<unknown>): Promise<Probe> {
  const caps: Capture[] = [];
  let before = new Set<string>();
  let pressAt = 0;
  let stop = false;
  const each = (c: Capture) => caps.push(c);
  let poll = capturing(cdp, clip, each, () => stop);
  await sleep(baselineMs);
  if (mode === 'cold') {
    stop = true;
    await poll;
    await sleep(COLD_IDLE_MS);
  }
  const baseline = [...caps].sort((a, b) => a.t1 - b.t1);
  before = new Set(baseline.map((c) => c.hash));
  pressAt = nodeNow();
  if (mode === 'cold') {
    stop = false;
    poll = capturing(cdp, clip, each, () => stop);
  }
  // The captures answered after the stimulus, in the order they were asked; what follows the last one that shows a state of the baseline.
  const afterPress = () => caps.filter((c) => c.t1 > pressAt).sort((a, b) => a.t0 - b.t0);
  const shown = (): Capture[] => {
    const all = afterPress();
    let last = -1;
    all.forEach((c, i) => {
      if (before.has(c.hash)) last = i;
    });
    return all.slice(last + 1);
  };
  await stimulus();
  let run = shown();
  while (run.length < CONFIRM && nodeNow() < pressAt + PIXEL_TIMEOUT) {
    await sleep(1);
    run = shown();
  }
  // The first answer of any capture that shows it.
  const hit = run.length ? run.reduce((x, y) => (y.t1 < x.t1 ? y : x)) : undefined;
  // The captures go on a while: does the echo stay on screen?
  if (hit) await sleep(TAIL_MS);
  stop = true;
  await poll;
  const asked = afterPress();
  // What the captures asked from the one that showed it on: 'B' a state of the baseline again, else a letter per state (in the order they came).
  const news: string[] = [];
  const tail = asked
    .filter((c) => hit && c.t0 >= hit.t0)
    .map((c) => {
      if (before.has(c.hash)) return 'B';
      if (!news.includes(c.hash)) news.push(c.hash);
      return String.fromCharCode(97 + news.indexOf(c.hash));
    })
    .join('');
  const flipped = tail.includes('B');
  const upTo = hit ? asked.filter((c) => c.t1 <= hit.t1) : asked;
  const gaps = (xs: Capture[]) => xs.slice(1).map((c, i) => c.t1 - xs[i].t1);
  const med = (xs: number[]) => (xs.length ? median(xs) : undefined);
  // The last capture asked before the first that shows it: its state is the baseline's.
  const lastSame = run.length ? asked[asked.indexOf(run[0]) - 1] : asked.at(-1);
  return {
    pressAt,
    shownFrom: hit?.t0,
    shownAt: hit?.t1,
    lastSameFrom: (lastSame ?? baseline.at(-1))?.t0,
    lastSameAt: (lastSame ?? baseline.at(-1))?.t1,
    captures: upTo.length,
    cadenceMs: med(gaps([...upTo].sort((x, y) => x.t1 - y.t1))),
    captureMs: med(upTo.map((c) => c.t1 - c.t0)),
    confirmed: run.length >= CONFIRM,
    tail,
    flipped,
    // What the captures showed, when the echo was not confirmed (their hashes: 0 is the first state seen, and so on).
    unconfirmed:
      run.length >= CONFIRM && !flipped
        ? undefined
        : {
            baseline: [...before],
            after: asked.map((c) => ({ asked: c.t0 - pressAt, answered: c.t1 - pressAt, state: c.hash, inBaseline: before.has(c.hash) })),
          },
    baseline: {
      captures: baseline.length,
      states: before.size,
      changes: baseline.slice(1).filter((c, i) => c.hash !== baseline[i].hash).length,
      cadenceMs: med(gaps(baseline)),
    },
  };
}

/** Presses `letter` and looks for its echo in the pixels around the cursor. */
async function pixelKey(page: Page, cdp: CDPSession, index: number, letter: string, mode: Mode): Promise<PixelRow> {
  const clip = await cursorClip(page);
  const p = await probe(cdp, clip, mode, BASELINE_MS, () => page.keyboard.press(letter));
  return { index, key: letter, mode, clip, ...p };
}

/**
 * The reference for the pixels above: how long after an animation frame changed a box of the page (a plain DOM change, nothing
 * of the terminal's) the captures show it. What a key takes from its frame to the pixels is to be read against this.
 */
async function calibrate(page: Page, cdp: CDPSession, skew: number): Promise<CalibRow[]> {
  const clip: Clip = { x: 0, y: 0, width: 90, height: 20 };
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__calib';
    d.style.cssText = 'position:fixed;left:0;top:0;width:90px;height:20px;z-index:2147483647;pointer-events:none;background:#000';
    document.body.appendChild(d);
  });
  const rows: CalibRow[] = [];
  try {
    for (let i = 0; i < CALIBRATIONS; i++) {
      const mode: Mode = i % 2 ? 'cold' : 'warm';
      let setAt: number | undefined;
      const p = await probe(cdp, clip, mode, 500, async () => {
        setAt = await page.evaluate(
          () =>
            new Promise<number>((resolve) =>
              requestAnimationFrame(() => {
                const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
                w.__calibN = (w.__calibN ?? 0) + 1;
                document.getElementById('__calib')!.style.background = w.__calibN % 2 ? '#fff' : '#000';
                resolve(w.__bench.now());
              }),
            ),
        );
      });
      rows.push({ mode, setAt, afterSetMs: p.shownAt !== undefined && setAt !== undefined ? p.shownAt + skew - setAt : undefined, ...p });
    }
  } finally {
    await page.evaluate(() => document.getElementById('__calib')?.remove());
  }
  return rows;
}

function calibStats(rows: CalibRow[]): CalibStats {
  const ms = (xs: CalibRow[]) => stat(xs.map((r) => r.afterSetMs ?? NaN));
  return {
    all: ms(rows),
    warm: ms(rows.filter((r) => r.mode === 'warm')),
    cold: ms(rows.filter((r) => r.mode === 'cold')),
    capture: stat(rows.map((r) => r.captureMs ?? NaN)),
    cadence: stat(rows.map((r) => r.cadenceMs ?? NaN)),
    timeouts: rows.filter((r) => r.shownAt === undefined).length,
  };
}

/** The numbers of the pixel rows, once each knows its key's time stamp. */
function pixelStats(rows: PixelRow[]): PixelStats {
  const seen = rows.filter((r) => r.pixelMs !== undefined);
  const baselineMs = rows.reduce((n, r) => n + (r.baseline.captures > 1 ? BASELINE_MS : 0), 0);
  return {
    all: stat(seen.map((r) => r.pixelMs!)),
    warm: stat(seen.filter((r) => r.mode === 'warm').map((r) => r.pixelMs!)),
    cold: stat(seen.filter((r) => r.mode === 'cold').map((r) => r.pixelMs!)),
    asked: stat(seen.map((r) => r.askedMs ?? NaN)),
    low: stat(seen.map((r) => r.lowMs ?? NaN)),
    painted: stat(seen.map((r) => r.paintedMs ?? NaN)),
    afterPaint: stat(seen.map((r) => r.afterPaintMs ?? NaN)),
    cadence: stat(rows.map((r) => r.cadenceMs ?? NaN)),
    capture: stat(rows.map((r) => r.captureMs ?? NaN)),
    timeouts: rows.filter((r) => r.shownAt === undefined).length,
    unconfirmed: rows.filter((r) => r.shownAt !== undefined && !r.confirmed).length,
    flipped: rows.filter((r) => r.flipped).length,
    early: rows.filter((r) => r.afterPaintMs !== undefined && r.afterPaintMs < 0).length,
    baseline: {
      captures: rows.reduce((n, r) => n + r.baseline.captures, 0),
      maxStates: Math.max(0, ...rows.map((r) => r.baseline.states)),
      changesPerSecond: baselineMs ? (rows.reduce((n, r) => n + r.baseline.changes, 0) / baselineMs) * 1000 : 0,
    },
  };
}

/** Types the letters, a group at a time, and clears the line after each. The keys in PIXEL_KEYS are looked for on screen too. */
async function typeKeys(page: Page, cdp: CDPSession): Promise<PixelRow[]> {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const pixels: PixelRow[] = [];
  for (let i = 0; i < KEYS; i++) {
    const mode = PIXEL_KEYS[i];
    if (mode) pixels.push(await pixelKey(page, cdp, i, alphabet[i % 26], mode));
    else await page.keyboard.press(alphabet[i % 26]);
    await page.waitForTimeout(200 + Math.random() * 50);
    if (i % GROUP === GROUP - 1) {
      await page.keyboard.press(KIND.clear);
      await page.waitForTimeout(500);
    }
  }
  return pixels;
}

/** Pastes `text` the way the browser does; returns when the echo has been quiet for 500 ms. [t0, end] */
async function pasteText(page: Page, bench: Bench, text: string): Promise<[number, number]> {
  const t0 = await page.locator(KIND.field).evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const t0 = (window as any).__bench.now(); // eslint-disable-line @typescript-eslint/no-explicit-any
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return t0;
  }, text);
  const until = Date.now() + 60_000;
  // The end on the page's clock, as the outputs' times: this process's clock drifts from it (see `pageSkew`), and the
  // clearing key's own output, which comes right after, would be counted in the paste's.
  let end = t0;
  for (;;) {
    await page.waitForTimeout(250);
    const s = await page.evaluate((ch) => {
      const b = (window as any).__bench; // eslint-disable-line @typescript-eslint/no-explicit-any
      return { last: b.lastAt[ch] ?? 0, now: b.now() };
    }, bench.channel);
    end = s.now;
    if ((s.last > t0 && s.now - s.last >= 500) || Date.now() > until) break;
  }
  await page.keyboard.press(KIND.clear);
  await page.waitForTimeout(1000);
  return [t0, end];
}

async function measure(
  page: Page,
  cdp: CDPSession,
  skew: number,
  name: string,
  bench: Bench,
  log: string,
  root: string,
): Promise<PhaseResult> {
  await showBench(page);
  // The page's clock is monotonic from its load, the system's (the backend's, this process's) is slewed: they drift
  // apart by a few ms a minute, more than the tolerance of the links after a few phases. Taken again here and at the end.
  skew = await pageSkew(page);
  const calibration = CALIBRATIONS ? await calibrate(page, cdp, skew) : [];
  await quiet(page, bench.channel, 1500);
  await drain(page);
  const cpuFrom = snapshot();
  const startMs = Date.now();
  const pixels = await typeKeys(page, cdp);
  const times: [string, number, number, number][] = [];
  for (const [label, chars] of PASTES) {
    const text = WORDS.repeat(Math.ceil(chars / WORDS.length)).slice(0, chars);
    const [t0, end] = await pasteText(page, bench, text);
    times.push([label, chars, t0, end]);
  }
  const endMs = Date.now();
  const cpu = cpuBetween(cpuFrom, snapshot(), root);
  await page.waitForTimeout(300);
  const drained = await drain(page);

  const trace = rustTrace(log);
  const window = (x: { called: number }) => x.called >= startMs - 100 && x.called <= endMs + 5000;
  // The backend's times, on the page's clock: the drift between the two moves linearly over the phase.
  const skewEnd = await pageSkew(page);
  const onPage = (t: number) => t + skew + ((skewEnd - skew) * (t - startMs)) / Math.max(1, endMs - startMs);
  const rust = {
    writes: trace.writes.filter(window).map((w) => ({ ...w, called: onPage(w.called), locked: onPage(w.locked), done: onPage(w.done) })),
    reads: trace.reads
      .filter((r) => r.at >= startMs - 100 && r.at <= endMs + 5000)
      .map((r) => ({ ...r, at: onPage(r.at), sent: onPage(r.sent) })),
  };
  const linked = link(drained.writes, bench, rust, drained.chunks);
  const keys = keystrokes(drained, linked);
  const keyStats: Record<string, Stat> = {};
  for (const step of STEPS) keyStats[step] = stat(keys.map((k) => k.steps[step] ?? NaN));
  // Each key looked for on screen, now that the page's time stamp of it is known (the clocks differ by `skew`).
  for (const px of pixels) {
    const ev = drained.keys.find((k) => !k.ctrl && k.key === px.key && k.ts >= px.pressAt + skew - 20 && k.ts <= px.pressAt + skew + 1000);
    if (!ev || px.shownAt === undefined) continue;
    px.keyAt = ev.ts;
    px.pixelMs = px.shownAt + skew - ev.ts;
    if (px.shownFrom !== undefined) px.askedMs = px.shownFrom + skew - ev.ts;
    if (px.lastSameFrom !== undefined) px.lowMs = px.lastSameFrom + skew - ev.ts;
    const row = keys.find((k) => k.at === ev.ts);
    if (row?.painted !== undefined) {
      px.paintedMs = row.painted - ev.ts;
      px.afterPaintMs = px.shownAt + skew - row.painted;
    }
  }
  const pastes = times.map(([label, chars, t0, end]) => pasteRow(label, chars, t0, end, linked, drained.chunks, bench));

  const seconds = (endMs - startMs) / 1000;
  const long = drained.longtasks.map((x) => x.duration);
  const kb = drained.chunks.reduce((n, c) => n + c.bytes, 0) / 1024;
  const ui = uiStats(drained, seconds);
  const rates = {
    'ui events / s': ui.perSecond,
    'ui events KB / s': ui.kbPerSecond,
    'ui events >= 8192 B (extra request) / s': ui.bigPerSecond,
    'terminal outputs >= 1024 B (extra request) / s': ui.bigTerminalPerSecond,
    'channel data requests seen by the page / s': ui.fetchesPerSecond,
    'agents the events are about': ui.agents,
    'ipc commands / s (all)': Object.values(drained.ipc).reduce((a, b) => a + b, 0) / seconds,
    'ipc commands / s, the most sent': Object.entries(drained.ipc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cmd, n]) => `${cmd} ${(n / seconds).toFixed(1)}`)
      .join(', '),
    'terminal output msgs / s (all terminals)': drained.chunks.length / seconds,
    'terminal output msgs / s (bench terminal)': drained.chunks.filter((c) => c.ch === bench.channel).length / seconds,
    'terminal output KB / s (all terminals)': kb / seconds,
    longtasks: long.length,
    'longtasks total ms': long.reduce((a, b) => a + b, 0),
    'longtasks max ms': long.length ? Math.max(...long) : 0,
    'timer lag median ms': drained.lags.length ? median(drained.lags) : 0,
    'timer lag p95 ms': drained.lags.length ? percentile(drained.lags, 95) : 0,
    'timer lag max ms': drained.lags.length ? Math.max(...drained.lags) : 0,
    'keystrokes typed': drained.keys.filter((k) => !k.ctrl && /^[a-z]$/.test(k.key)).length,
    'keystrokes linked to a page write': keys.length,
    'keystrokes linked to the backend trace': keys.filter((k) => k.steps['rust lock wait'] !== undefined).length,
    'keystrokes whose echo is linked through the backend': keys.filter((k) => k.by === 'rust').length,
    'keystrokes with a TOTAL': keys.filter((k) => k.steps['TOTAL key -> painted'] !== undefined).length,
  };
  return {
    name,
    startMs,
    endMs,
    seconds,
    keys,
    keyStats,
    pixels,
    pixelStats: pixelStats(pixels),
    calibration,
    calibStats: calibStats(calibration),
    freezes: freezes(keys),
    pastes,
    rates,
    ui,
    cpu,
    raw: { drained, linked },
  };
}

function report(p: PhaseResult): string {
  const lines = [`\n===== phase ${p.name} (${p.seconds.toFixed(1)} s) =====`];
  lines.push(`${'keystroke step (ms)'.padEnd(36)} ${'n'.padStart(3)} ${'median'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)}`);
  for (const step of STEPS) {
    const s = p.keyStats[step];
    lines.push(
      `${step.padEnd(36)} ${String(s.n).padStart(3)} ${f1(s.median).padStart(8)} ${f1(s.p95).padStart(8)} ${f1(s.max).padStart(8)}`,
    );
  }
  const x = p.pixelStats;
  const statRow = (label: string, s: Stat) =>
    lines.push(
      `${label.padEnd(36)} ${String(s.n).padStart(3)} ${f1(s.median).padStart(8)} ${f1(s.p95).padStart(8)} ${f1(s.max).padStart(8)}`,
    );
  if (p.calibration.length) {
    const c = p.calibStats;
    lines.push(
      '',
      `reference: a box of the page changes colour in an animation frame (${p.calibration.length} times; ms from that frame to the first capture that shows it)`,
      `${''.padEnd(36)} ${'n'.padStart(3)} ${'median'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)}`,
    );
    statRow('REFERENCE frame -> first capture', c.all);
    statRow('  (warm)', c.warm);
    statRow('  (cold)', c.cold);
    statRow('  (ms between two captures)', c.cadence);
    statRow('  (ms a capture takes)', c.capture);
    if (c.timeouts) lines.push(`  not seen within ${PIXEL_TIMEOUT} ms: ${c.timeouts}`);
  }
  if (p.pixels.length) {
    lines.push(
      '',
      `on the screen's pixels (${p.pixels.length} keys; ms from the key event to the first capture that differs, answered)`,
      `${''.padEnd(36)} ${'n'.padStart(3)} ${'median'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)}`,
    );
    const row = statRow;
    row('PIXELS key -> first differing capture', x.all);
    row('  (warm: captures going on)', x.warm);
    row('  (cold: idle 500 ms before the key)', x.cold);
    row('  (key -> that capture was asked)', x.asked);
    row('  (key -> the one before was asked)', x.low);
    row('  (TOTAL key -> painted, same keys)', x.painted);
    row('  (pixels - painted)', x.afterPaint);
    row('  (ms between two captures)', x.cadence);
    row('  (ms a capture takes)', x.capture);
    lines.push(
      `  keys never seen within ${PIXEL_TIMEOUT} ms: ${x.timeouts}, seen but not confirmed: ${x.unconfirmed}, flipped back after: ${x.flipped}, seen before the page's frame: ${x.early}; baseline (no key): ${x.baseline.captures} captures, up to ${x.baseline.maxStates} states, ${x.baseline.changesPerSecond.toFixed(2)} changes / s`,
    );
    for (const r of p.pixels)
      lines.push(
        `  key ${String(r.index).padStart(2)} '${r.key}' ${r.mode.padEnd(4)} pixels ${f1(r.pixelMs).padStart(7)}  painted ${f1(r.paintedMs).padStart(6)}  captures ${String(r.captures).padStart(3)}  baseline states ${r.baseline.states} changes ${r.baseline.changes}`,
      );
  }
  if (p.freezes.length)
    for (const z of p.freezes)
      lines.push(
        '',
        `FREEZE at ${z.at}: ${z.keys} keys painted together, the first waited ${z.waitedMs.toFixed(0)} ms (the run spans ${z.spanMs.toFixed(0)} ms)`,
      );
  lines.push('');
  for (const [k, v] of Object.entries(p.rates))
    lines.push(`${k.padEnd(52)} ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v}`);
  lines.push(
    '',
    `${'app events (bytes of JSON)'.padEnd(26)} ${'/ s'.padStart(7)} ${'KB / s'.padStart(8)} ${'median'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)} ${'>= 8192 / s'.padStart(12)}`,
  );
  const row = (k: string, n: number, kb: number, b: Stat, bigs: number) =>
    lines.push(
      `${k.padEnd(26)} ${n.toFixed(1).padStart(7)} ${kb.toFixed(1).padStart(8)} ${f1(b.median).padStart(8)} ${f1(b.p95).padStart(8)} ${f1(b.max).padStart(8)} ${bigs.toFixed(1).padStart(12)}`,
    );
  row('all', p.ui.perSecond, p.ui.kbPerSecond, p.ui.bytes, p.ui.bigPerSecond);
  for (const [k, v] of Object.entries(p.ui.byType).sort((a, b) => b[1].kbPerSecond - a[1].kbPerSecond))
    row(k, v.perSecond, v.kbPerSecond, v.bytes, v.bigPerSecond);
  lines.push('', `CPU, % of one core, over ${p.cpu.seconds.toFixed(1)} s:`);
  for (const [role, cpu] of Object.entries(p.cpu.byRole)) lines.push(`  ${role.padEnd(40)} ${cpu.toFixed(1).padStart(7)}`);
  for (const x of p.cpu.procs.filter((x) => x.role.startsWith('webview') && x.cpu >= 1))
    lines.push(`    pid ${String(x.pid).padEnd(8)} ${x.role.padEnd(30)} ${x.cpu.toFixed(1).padStart(7)}`);
  for (const r of p.pastes) {
    lines.push('', `${r.label}: ${r.chunks} echo messages, ${r.bytes} bytes`);
    for (const [k, v] of Object.entries(r.steps)) lines.push(`  ${k.padEnd(34)} ${f1(v).padStart(9)} ms`);
  }
  return lines.join('\n');
}

test('latency of a keystroke and of a paste in a terminal, idle and under load', async ({ app }) => {
  test.setTimeout(15 * 60_000);
  const { page } = app;
  await page.evaluate(instrument);
  const skew = await page.evaluate(() => (window as any).__bench.now() - Date.now()); // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`terminal under test: ${KIND.what}; page clock - node clock: ${skew.toFixed(1)} ms`);
  const cdp = await page.context().newCDPSession(page);
  await addProject(page, app.repo);
  const log = path.join(app.data, 'app.log');

  const bench = await openBench(page);
  const results: PhaseResult[] = [];
  const phase = async (name: string) => {
    const p = await measure(page, cdp, skew, name, bench, log, app.root);
    console.log(report(p));
    results.push(p);
  };

  // 1. Nothing else: one project, its first agent (not asked anything), the bench terminal.
  await phase('idle');

  const floods: Bench[] = [];
  if (!IDLE_ONLY) {
    // 2. Terminals that print without a pause (each in its own shell, hidden behind the bench terminal), if there are to be any.
    for (let i = 0; i < FLOODING_TERMINALS; i++) {
      const t = await newTerminal(page, 1500);
      await page.locator('.tv .xterm-helper-textarea').focus();
      await page.keyboard.type(FLOOD_COMMAND);
      await page.keyboard.press('Enter');
      console.log(`flooding terminal ${i + 1}: ${(await rate(page, t.channel, 2000)).toFixed(0)} messages / s`);
      floods.push(t);
    }
    // And, in the same phase, SCREENS terminals that redraw a whole screen 30 times a second.
    const screen = path.join(app.root, 'screen.cjs');
    fs.writeFileSync(screen, SCREEN_SCRIPT);
    for (let i = 0; i < SCREENS; i++) {
      const t = await newTerminal(page, 1500);
      await page.locator('.tv .xterm-helper-textarea').focus();
      await page.keyboard.type(`node "${screen}"`);
      await page.keyboard.press('Enter');
      const before = await page.evaluate((ch) => (window as any).__bench.total[ch] ?? 0, t.channel); // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log(`full-screen terminal ${i + 1}: ${(await rate(page, t.channel, 2000)).toFixed(0)} messages / s (${before} before)`);
      floods.push(t);
    }
    if (floods.length) {
      await page.waitForTimeout(3000);
      await phase('terminals');
    }

    // 3. And agents at work: AGENTS of them, each told to flood for 10 minutes (the first agent shows the « Vue Claude Code »
    // when that is the terminal under test: the AGENTS are the ones after it).
    const first = SHELL === 'claude' ? 1 : 0;
    const cards = page.locator('.card');
    for (let n = await cards.count(); n < first + AGENTS; n++) {
      await page.getByRole('button', { name: '+ Nouvel agent' }).first().click();
      await expect(cards).toHaveCount(n + 1);
    }
    for (let i = first; i < first + AGENTS; i++) {
      await cards.nth(i).click();
      await send(page, `${SCENARIO} 600s`);
    }
    await expect.poll(() => app.launches().length, { timeout: 30_000 }).toBeGreaterThanOrEqual(first + AGENTS);
    await page.waitForTimeout(3000);
    if (floods.length) await phase('terminals + agents');

    // 4. The flooding and full-screen terminals closed (their program went on printing after a Ctrl+C in a try), the agents still at work.
    for (let i = 0; i < floods.length; i++) await page.locator('.term').nth(BENCH_ROWS).locator('.x').click();
    await expect(page.locator('.term')).toHaveCount(BENCH_ROWS);
    for (const t of floods) await quiet(page, t.channel, 1500);
    await page.waitForTimeout(2000);
    await phase('agents');
  }

  const trace = rustTrace(log);
  // What the app itself noted of slow echoes (a build with ESC-100's watch): none is expected while every echo is fast.
  const slowEchoes = fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter((l) => l.includes('echo of a'));
  console.log(`slow echoes the app noted: ${slowEchoes.length}${slowEchoes.length ? `\n${slowEchoes.join('\n')}` : ''}`);
  const out = path.join(process.cwd(), 'test-results', `terminal-latency-${LABEL}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        label: LABEL,
        shell: SHELL,
        exe: process.env.ESCOUADE_E2E_EXE ?? 'debug build',
        agents: AGENTS,
        scenario: SCENARIO,
        screens: SCREENS,
        floodingTerminals: FLOODING_TERMINALS,
        bench,
        clockSkewMs: skew,
        // What the other terminals printed is not kept, only when each message came.
        phases: results.map((p) => ({
          ...p,
          raw: {
            ...p.raw,
            drained: {
              ...p.raw.drained,
              chunks: p.raw.drained.chunks.map((c) => (c.ch === bench.channel ? c : { ...c, text: undefined })),
            },
          },
        })),
        rust: trace,
      },
      null,
      1,
    ),
  );
  console.log(`\nraw records and stats: ${out}`);

  // The backend's steps are there only for a build that logs them (ESCOUADE_TERM_TRACE): not an installed release.
  const traced = trace.writes.length + trace.reads.length > 0;
  console.log(traced ? 'the backend trace is there' : 'no backend trace (a build without ESCOUADE_TERM_TRACE): its steps are empty');
  for (const p of results) {
    expect.soft(p.keys.length, `${p.name}: keystrokes linked to a write`).toBeGreaterThanOrEqual(30);
    if (traced) expect.soft(p.keyStats['rust lock wait'].n, `${p.name}: keystrokes linked to the backend trace`).toBeGreaterThanOrEqual(30);
    expect.soft(p.keyStats['TOTAL key -> painted'].n, `${p.name}: keystrokes measured up to the paint`).toBeGreaterThanOrEqual(30);
    if (PIXELS)
      expect.soft(p.pixelStats.all.n, `${p.name}: keystrokes seen on the screen's pixels`).toBeGreaterThanOrEqual(Math.min(PIXELS, 10) - 2);
  }
});
