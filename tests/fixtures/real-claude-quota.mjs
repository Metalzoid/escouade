// The real `claude` (ESCOUADE_REAL_CLAUDE), with a usage limit simulated (ESC-52, the handover of ESC-88 tried for real):
// everything goes through as it is, but while the file REAL_CLAUDE_LIMIT names is there, a message of the user's is not
// given to Claude Code: its turn is stopped by the usage limit, as Claude Code tells it (the same three lines as
// fake-claude.mjs's « limite »). Only for the real trials (tests/e2e/real-harnesses.spec.ts).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';

const real = process.env.ESCOUADE_REAL_CLAUDE;
if (!real) {
  process.stderr.write('real-claude-quota: ESCOUADE_REAL_CLAUDE is not set\n');
  process.exit(2);
}
const marker = process.env.REAL_CLAUDE_LIMIT ?? '';
const limited = () => marker !== '' && fs.existsSync(marker);

const child = spawn(real, process.argv.slice(2), { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
let sessionId = null;
const out = (line) => process.stdout.write(`${line}\n`);

readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
  try {
    const id = JSON.parse(line)?.session_id;
    if (typeof id === 'string') sessionId = id;
  } catch {
    // not a line of JSON (`--version`)
  }
  out(line);
});

let n = 0;
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  let user = false;
  try {
    user = JSON.parse(line)?.type === 'user';
  } catch {
    // given as it is
  }
  if (!user || !limited()) {
    child.stdin.write(`${line}\n`);
    return;
  }
  n++;
  const resetsAt = Math.floor(Date.now() / 1000) + 3600;
  out(
    JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'rejected',
        resetsAt,
        rateLimitType: 'five_hour',
        unifiedWindows: { five_hour: { utilization: 1, resetsAt } },
      },
      session_id: sessionId,
    }),
  );
  out(
    JSON.stringify({
      type: 'assistant',
      error: 'rate_limit',
      message: { id: `msg_limit${n}`, role: 'assistant', content: [{ type: 'text', text: "You've hit your limit · resets 3pm" }] },
      parent_tool_use_id: null,
      session_id: sessionId,
    }),
  );
  out(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      duration_ms: 100,
      session_id: sessionId,
      result: "You've hit your limit · resets 3pm",
    }),
  );
});
process.stdin.on('end', () => child.stdin.end());
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
