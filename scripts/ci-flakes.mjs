#!/usr/bin/env node
// Which tests of the CI fail, block or only pass at a new try, and on which system, over its last
// runs (to know what to fix first, and to measure it again after a fix).
//   node scripts/ci-flakes.mjs [N]      N: the number of runs to read, 50 by default
// Needs the GitHub CLI (`gh`), signed in with the rights to read the logs of the repository's runs.
//
// `gh run view <id> --log` prints `job<TAB>step<TAB>timestamp text` for every line. Not
// `--log-failed`: a test that passed at a new try (nextest's retries, Playwright's) leaves a green
// run, which that one does not print.
//
// What is read: `test <name> ... FAILED` and `<name> has been running for over 60 seconds` (cargo
// test), the FAIL / TIMEOUT / TMT / FLAKY lines of cargo-nextest, and Playwright's list of tests
// (`x`, or `✘`, for a try that failed, `ok`, or `✓`, for one that passed). Not nextest's SLOW: it is
// said of every test past the minute, one that ends included, which is slow and not blocked
// (nextest kills the one that never ends: TIMEOUT / TMT).

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COLORS = /\u001b\[[0-9;]*m/g;
const STAMP = /^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/;

/** The system a job of the CI ran on (the jobs are named after it). */
export function systemOf(job) {
  if (/^linux/i.test(job)) return 'Linux';
  if (/^macos/i.test(job)) return 'macOS';
  if (/^windows|end-to-end/i.test(job)) return 'Windows';
  return job || '?';
}

/** A line of the log: the job it comes from (empty without the prefix) and its text. */
function split(raw) {
  const line = raw.replace(/\r$/, '').replace(COLORS, '');
  const parts = line.split('\t');
  const [job, text] = parts.length >= 3 ? [parts[0], parts.slice(2).join('\t')] : ['', line];
  return { job: job.replace(/^﻿/, ''), text: text.replace(STAMP, '') };
}

const CARGO_FAILED = /\btest (\S+) \.\.\. FAILED\b/;
const CARGO_HUNG = /\btest (\S+) has been running for over \d+ seconds/;
// `  TRY 3 FAIL [   0.009s] (2/3) escouade probe::probe_fail`, `FLAKY 2/3 [ 0.009s] (1/3) escouade
// probe::probe_flaky`, `TMT [ 180.016s] (3/3) escouade probe::probe_hang`: the status, the time, the
// progress, the test's binary and its name.
const NEXTEST = /^\s*(?:TRY \d+ )?(FAIL|TIMEOUT|TMT|FLAKY)\b(?: \d+\/\d+)?\s*\[[^\]]*\]\s*(?:\([^)]*\)\s*)?(.*\S)\s*$/;
const NEXTEST_KIND = { FAIL: 'failed', TIMEOUT: 'hung', TMT: 'hung', FLAKY: 'flaky' };
// `  x  37 tests\e2e\english.spec.ts:8:1 › the title (retry #1) (18.4s)`
const PLAYWRIGHT =
  /^\s*(x|✘|×|ok|✓|✔)\s+\d+\s+(?:\[[^\]]*\]\s+›\s+)?(\S+\.spec\.[cm]?[jt]sx?):\d+:\d+\s+›\s+(.*?)(?:\s+\(retry #\d+\))?(?:\s+\(\d+(?:\.\d+)?(?:ms|s|m)\))?\s*$/;

/**
 * The problems a CI log tells of, once each: `{ system, test, kind }`, `kind` being `failed` (it
 * failed, at its last try), `hung` (cargo test says it ran for over a minute, or nextest killed it
 * after its delay; a test nextest only calls slow is not) or
 * `flaky` (it failed, then passed at a new try). A test's name does not hold its line number.
 */
export function parseLog(log) {
  const tests = new Map();
  const seen = (system, test) => {
    const key = `${system}\u0000${test}`;
    if (!tests.has(key)) tests.set(key, { system, test });
    return tests.get(key);
  };
  for (const raw of log.split('\n')) {
    const { job, text } = split(raw);
    const system = systemOf(job);
    let m;
    if ((m = CARGO_FAILED.exec(text))) seen(system, m[1]).failed = true;
    else if ((m = CARGO_HUNG.exec(text))) seen(system, m[1]).hung = true;
    else if ((m = NEXTEST.exec(text))) {
      const name = m[2].split(/\s+/).pop();
      seen(system, name)[NEXTEST_KIND[m[1]]] = true;
    } else if ((m = PLAYWRIGHT.exec(text))) {
      const test = seen(system, `${m[2].split(/[\\/]/).pop()} › ${m[3]}`);
      if (/^(?:ok|✓|✔)$/.test(m[1])) test.passed = true;
      else test.failed = test.attemptFailed = true;
    }
  }
  const found = [];
  for (const { system, test, ...flags } of tests.values()) {
    // A try that failed, then one that passed: nextest says so (FLAKY), Playwright's list shows both.
    const flaky = flags.flaky || (flags.attemptFailed && flags.passed);
    if (flags.hung) found.push({ system, test, kind: 'hung' });
    if (flaky) found.push({ system, test, kind: 'flaky' });
    else if (flags.failed) found.push({ system, test, kind: 'failed' });
  }
  return found;
}

/** For each test and system, in how many runs it failed, hung and was flaky; the worst first. */
export function tally(runs) {
  const rows = new Map();
  for (const found of runs) {
    for (const { system, test, kind } of found) {
      const key = `${system}\u0000${test}`;
      if (!rows.has(key)) rows.set(key, { system, test, failed: 0, hung: 0, flaky: 0 });
      rows.get(key)[kind]++;
    }
  }
  const total = (r) => r.failed + r.hung + r.flaky;
  return [...rows.values()].sort(
    (a, b) => total(b) - total(a) || a.system.localeCompare(b.system, 'en') || a.test.localeCompare(b.test, 'en'),
  );
}

/** The table `tally` made, under the number of runs it comes from. */
export function formatTable(rows, { read, unreadable }) {
  const runs = `${read} run${read === 1 ? '' : 's'} read`;
  const head = unreadable ? `${runs} (${unreadable} could not be read).` : `${runs}.`;
  if (!rows.length) return `${head}\n\nNothing failed, hung or was flaky.`;
  const width = (title, values) => Math.max(title.length, ...values.map((v) => String(v).length));
  const system = width(
    'System',
    rows.map((r) => r.system),
  );
  const failed = width(
    'Failed',
    rows.map((r) => r.failed),
  );
  const hung = width(
    'Hung',
    rows.map((r) => r.hung),
  );
  const flaky = width(
    'Flaky',
    rows.map((r) => r.flaky),
  );
  const row = (s, f, h, k, test) =>
    `${String(s).padEnd(system)}  ${String(f).padStart(failed)}  ${String(h).padStart(hung)}  ${String(k).padStart(flaky)}  ${test}`;
  return [
    head,
    '',
    row('System', 'Failed', 'Hung', 'Flaky', 'Test'),
    ...rows.map((r) => row(r.system, r.failed, r.hung, r.flaky, r.test)),
  ].join('\n');
}

/** The runs of `gh run list` that are over, and green or red (not cancelled, skipped, or running). */
export function finishedRuns(list) {
  return list.filter((r) => r.status === 'completed' && (r.conclusion === 'success' || r.conclusion === 'failure'));
}

const gh = (args) =>
  new Promise((resolve, reject) =>
    execFile('gh', args, { maxBuffer: 1 << 28, windowsHide: true }, (error, stdout, stderr) =>
      error
        ? reject(
            new Error(
              String(stderr || error.message)
                .trim()
                .split('\n')[0],
            ),
          )
        : resolve(stdout),
    ),
  );

/** `fn` on every item, `limit` at a time. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main(args) {
  const count = args[0] === undefined ? 50 : Number(args[0]);
  if (!Number.isInteger(count) || count < 1) {
    console.error('Usage: node scripts/ci-flakes.mjs [N]   (N: the number of runs to read, 50 by default)');
    process.exit(2);
  }
  const list = JSON.parse(
    await gh(['run', 'list', '--workflow', 'ci.yml', '--limit', String(count), '--json', 'databaseId,status,conclusion']),
  );
  const runs = finishedRuns(list);
  let unreadable = 0;
  let done = 0;
  const found = await mapLimit(runs, 4, async (run) => {
    try {
      return parseLog(await gh(['run', 'view', String(run.databaseId), '--log']));
    } catch (e) {
      unreadable++;
      console.error(`run ${run.databaseId}: ${e.message}`);
      return [];
    } finally {
      console.error(`${++done}/${runs.length} runs read`);
    }
  });
  console.log(formatTable(tally(found), { read: runs.length - unreadable, unreadable }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
