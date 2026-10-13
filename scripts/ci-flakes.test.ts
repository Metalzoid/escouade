// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { finishedRuns, formatTable, parseLog, systemOf, tally } from './ci-flakes.mjs';

// What `gh run view <id> --log` prints: `job<TAB>step<TAB>timestamp text`. The lines below are the
// real ones of CI runs (cargo test, cargo-nextest as the `ci` profile reports it, Playwright's list
// reporter), trimmed; the first line of a step starts with a byte order mark.
const WIN = 'Lint, tests and end-to-end';
const LINUX = 'Linux (lint, tests and packages)';
const MAC = 'macOS (lint, tests and app bundle)';
const RUST = 'Rust tests (unit + integration with the fake claude CLI)';
const E2E = 'End-to-end tests (Playwright over WebView2)';
const line = (job: string, step: string, text: string, at = '2026-10-12T19:23:23.9041917Z') => `${job}\t${step}\t${at} ${text}`;
const log = (...lines: string[]) => lines.join('\n') + '\n';

describe('systemOf', () => {
  it('names the system of a job of the CI', () => {
    expect(systemOf(WIN)).toBe('Windows');
    expect(systemOf(LINUX)).toBe('Linux');
    expect(systemOf(MAC)).toBe('macOS');
  });

  it('keeps the name of a job it does not know', () => {
    expect(systemOf('Website')).toBe('Website');
    expect(systemOf('')).toBe('?');
  });
});

describe('parseLog', () => {
  it('finds a cargo test that failed, on the system of its job', () => {
    const text = log(
      line(WIN, RUST, 'test pty::tests::closing_a_terminal_kills_the_programs_it_started ... FAILED'),
      line(WIN, RUST, 'test result: FAILED. 1311 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 243.42s'),
    );
    expect(parseLog(text)).toEqual([
      { system: 'Windows', test: 'pty::tests::closing_a_terminal_kills_the_programs_it_started', kind: 'failed' },
    ]);
  });

  it('finds a cargo test that ran for over a minute (a blocked one)', () => {
    const text = log(
      line(
        WIN,
        'UNKNOWN STEP',
        'test tui_tests::a_hook_without_the_token_of_an_interface_is_refused has been running for over 60 seconds',
        '2026-10-12T12:29:49.6812448Z',
      ),
    );
    expect(parseLog(text)).toEqual([
      { system: 'Windows', test: 'tui_tests::a_hook_without_the_token_of_an_interface_is_refused', kind: 'hung' },
    ]);
  });

  it('reads the timestamp-less and byte-order-marked lines of the log too', () => {
    const text = `${WIN}\t${RUST}\t﻿2026-10-12T19:23:23.9041917Z test a::b ... FAILED\r\ntest c::d ... FAILED\n`;
    expect(parseLog(text)).toEqual([
      { system: 'Windows', test: 'a::b', kind: 'failed' },
      { system: '?', test: 'c::d', kind: 'failed' },
    ]);
  });

  it('counts a test once per log, whatever the number of lines about it', () => {
    const text = log(
      line(MAC, RUST, 'test mcp::tests::a_stopped_server ... FAILED'),
      line(MAC, RUST, '  TRY 1 FAIL [   0.010s] (───) escouade mcp::tests::a_stopped_server'),
      line(MAC, RUST, '  TRY 3 FAIL [   0.009s] (2/3) escouade mcp::tests::a_stopped_server'),
      line(MAC, RUST, '        FAIL [   0.009s] (2/3) escouade mcp::tests::a_stopped_server'),
    );
    expect(parseLog(text)).toEqual([{ system: 'macOS', test: 'mcp::tests::a_stopped_server', kind: 'failed' }]);
  });

  it('keeps one test apart on each system', () => {
    const text = log(line(LINUX, RUST, 'test mcp::tests::a ... FAILED'), line(MAC, RUST, 'test mcp::tests::a ... FAILED'));
    expect(parseLog(text).map((r) => r.system)).toEqual(['Linux', 'macOS']);
  });

  describe('cargo-nextest', () => {
    // A test that passed at its second try, one that failed three times, one that was killed.
    const NEXTEST = log(
      line(LINUX, RUST, '  TRY 1 FAIL [   0.010s] (───) escouade probe::probe_fail'),
      line(LINUX, RUST, '  stdout ───'),
      line(LINUX, RUST, '    test probe::probe_fail ... FAILED'),
      line(LINUX, RUST, '   DELAY 2/3 by   1.000s (───) escouade probe::probe_fail'),
      line(LINUX, RUST, '  TRY 1 FAIL [   0.014s] (───) escouade probe::probe_flaky'),
      line(LINUX, RUST, '    test probe::probe_flaky ... FAILED'),
      line(LINUX, RUST, '  TRY 2 PASS [   0.009s] (1/3) escouade probe::probe_flaky'),
      line(LINUX, RUST, '        SLOW [> 60.000s] (───) escouade probe::probe_hang'),
      line(LINUX, RUST, '    test probe::probe_hang has been running for over 60 seconds'),
      line(LINUX, RUST, '────────────'),
      line(LINUX, RUST, '     Summary [ 542.086s] 3 tests run: 1 passed (1 flaky), 1 failed, 1 timed out, 1318 skipped'),
      line(LINUX, RUST, '   FLAKY 2/3 [   0.009s] (1/3) escouade probe::probe_flaky'),
      line(LINUX, RUST, '  TRY 3 FAIL [   0.009s] (2/3) escouade probe::probe_fail'),
      line(LINUX, RUST, '   TRY 3 TMT [ 180.016s] (3/3) escouade probe::probe_hang'),
    );

    it('reports a test that failed at its last try as failed', () => {
      expect(parseLog(NEXTEST)).toContainEqual({ system: 'Linux', test: 'probe::probe_fail', kind: 'failed' });
    });

    it('reports a test that passed at a new try as flaky, not as failed', () => {
      const found = parseLog(NEXTEST).filter((r) => r.test === 'probe::probe_flaky');
      expect(found).toEqual([{ system: 'Linux', test: 'probe::probe_flaky', kind: 'flaky' }]);
    });

    it('reports a test killed after its delay as blocked, not as failed', () => {
      const found = parseLog(NEXTEST).filter((r) => r.test === 'probe::probe_hang');
      expect(found).toEqual([{ system: 'Linux', test: 'probe::probe_hang', kind: 'hung' }]);
    });

    it('does not take a slow test that ended for a blocked one', () => {
      // nextest says SLOW past the minute, whether the test ends in 61 s or never; it kills the one
      // that never ends (TIMEOUT / TMT), and a test that ends passes.
      const text = log(
        line(WIN, RUST, '        SLOW [>  60.000s] ( 400/1318) escouade branches_tests::a_slow_one'),
        line(WIN, RUST, '        PASS [  75.113s] ( 401/1318) escouade branches_tests::a_slow_one'),
      );
      expect(parseLog(text)).toEqual([]);
    });

    it('reads the name of a test in an integration binary', () => {
      const text = log(line(WIN, RUST, '        TIMEOUT [ 180.016s] (3/3) escouade::core_tests agents::a_stopped_agent'));
      expect(parseLog(text)).toEqual([{ system: 'Windows', test: 'agents::a_stopped_agent', kind: 'hung' }]);
    });

    it('reads a test that passed at a new try from a run that is otherwise green', () => {
      const text = log(
        line(MAC, RUST, '────────────'),
        line(MAC, RUST, '     Summary [  50.113s] 1318 tests run: 1318 passed (1 flaky), 0 skipped'),
        line(MAC, RUST, '   FLAKY 2/3 [   0.009s] (1/3) escouade mcp::tests::a_stopped_server'),
      );
      expect(parseLog(text)).toEqual([{ system: 'macOS', test: 'mcp::tests::a_stopped_server', kind: 'flaky' }]);
    });

    it('does not mistake the summary or the tests that passed for a problem', () => {
      const text = log(
        line(MAC, RUST, '        PASS [   0.011s] ( 1/1318) escouade mcp::tests::fine'),
        line(MAC, RUST, '     Summary [  50.113s] 1318 tests run: 1318 passed, 0 skipped'),
      );
      expect(parseLog(text)).toEqual([]);
    });
  });

  describe('Playwright', () => {
    it('finds a test that failed at every try', () => {
      const text = log(
        line(WIN, E2E, '  x  37 tests\\e2e\\english.spec.ts:8:1 › the interface in English, then in French without a restart (18.4s)'),
        line(
          WIN,
          E2E,
          '  x  38 tests\\e2e\\english.spec.ts:8:1 › the interface in English, then in French without a restart (retry #1) (18.0s)',
        ),
        line(
          WIN,
          E2E,
          '  x  39 tests\\e2e\\english.spec.ts:8:1 › the interface in English, then in French without a restart (retry #2) (18.2s)',
        ),
        line(WIN, E2E, '##[error]  1) tests\\e2e\\english.spec.ts:8:1 › the interface in English, then in French without a restart ────'),
        line(WIN, E2E, '  1 failed'),
        line(WIN, E2E, '  45 passed (4.6m)'),
      );
      expect(parseLog(text)).toEqual([
        { system: 'Windows', test: 'english.spec.ts › the interface in English, then in French without a restart', kind: 'failed' },
      ]);
    });

    it('finds a test that failed, then passed at a new try, as flaky', () => {
      const text = log(
        line(WIN, E2E, '  ok 35 tests\\e2e\\app.spec.ts:761:1 › a ticket is written in a large window (4.8s)'),
        line(WIN, E2E, '  x  36 tests\\e2e\\branches.spec.ts:6:1 › a branch is created from the status bar (4.8s)'),
        line(WIN, E2E, '  ok 37 tests\\e2e\\branches.spec.ts:6:1 › a branch is created from the status bar (retry #1) (4.6s)'),
      );
      expect(parseLog(text)).toEqual([
        { system: 'Windows', test: 'branches.spec.ts › a branch is created from the status bar', kind: 'flaky' },
      ]);
    });

    it('reads the marks of other platforms and the project of the test', () => {
      const text = log(
        line(WIN, E2E, '  ✘  1 [chromium] › tests/e2e/app.spec.ts:6:1 › a new project opens an agent (3.4s)'),
        line(WIN, E2E, '  ×  2 tests/e2e/app.spec.ts:21:1 › the model picker (3.1s)'),
        line(WIN, E2E, '  ✓  3 tests/e2e/app.spec.ts:21:1 › the model picker (retry #1) (3.1s)'),
      );
      expect(parseLog(text)).toEqual([
        { system: 'Windows', test: 'app.spec.ts › a new project opens an agent', kind: 'failed' },
        { system: 'Windows', test: 'app.spec.ts › the model picker', kind: 'flaky' },
      ]);
    });

    it('keeps a line number out of the name: the same test is the same after an edit of its file', () => {
      const before = parseLog(line(WIN, E2E, '  x  1 tests\\e2e\\a.spec.ts:8:1 › t (1.0s)'));
      const after = parseLog(line(WIN, E2E, '  x  1 tests\\e2e\\a.spec.ts:42:3 › t (1.0s)'));
      expect(before).toEqual(after);
    });

    it('does not mistake the tests that passed for a problem', () => {
      const text = log(
        line(WIN, E2E, '  ok  3 tests\\e2e\\app.spec.ts:6:1 › a new project opens an agent that streams Claude’s reply (3.4s)'),
        line(WIN, E2E, '  -  4 tests\\e2e\\app.spec.ts:7:1 › skipped'),
      );
      expect(parseLog(text)).toEqual([]);
    });
  });

  it('is empty for a log with nothing to say', () => {
    expect(parseLog('')).toEqual([]);
    expect(parseLog(line(WIN, 'Set up job', 'Current runner version: 2.330.0'))).toEqual([]);
  });

  it('ignores the colors of a terminal', () => {
    const text = line(WIN, RUST, '\u001b[31mtest a::b ... FAILED\u001b[0m');
    expect(parseLog(text)).toEqual([{ system: 'Windows', test: 'a::b', kind: 'failed' }]);
  });
});

describe('tally', () => {
  const ran = (system: string, test: string, kind: 'failed' | 'hung' | 'flaky') => ({ system, test, kind });

  it('counts by test and system the runs in which it failed, hung or was flaky', () => {
    const rows = tally([
      [ran('Windows', 'a::b', 'failed'), ran('macOS', 'a::b', 'hung')],
      [ran('Windows', 'a::b', 'failed')],
      [ran('Windows', 'a::b', 'flaky')],
    ]);
    expect(rows).toEqual([
      { system: 'Windows', test: 'a::b', failed: 2, hung: 0, flaky: 1 },
      { system: 'macOS', test: 'a::b', failed: 0, hung: 1, flaky: 0 },
    ]);
  });

  it('sorts the worst first, then by system and name', () => {
    const rows = tally([
      [ran('Linux', 'z', 'flaky'), ran('Linux', 'a', 'flaky'), ran('macOS', 'a', 'flaky')],
      [ran('Windows', 'few', 'flaky'), ran('Windows', 'many', 'failed')],
      [ran('Windows', 'many', 'hung')],
    ]);
    expect(rows.map((r) => `${r.system} ${r.test}`)).toEqual(['Windows many', 'Linux a', 'Linux z', 'macOS a', 'Windows few']);
  });

  it('is empty when nothing went wrong', () => {
    expect(tally([[], []])).toEqual([]);
  });
});

describe('formatTable', () => {
  it('prints the rows as aligned columns under a header, with the number of runs read', () => {
    const rows = [
      { system: 'Windows', test: 'pty::tests::closing', failed: 2, hung: 0, flaky: 1 },
      { system: 'macOS', test: 'mcp::a', failed: 0, hung: 1, flaky: 0 },
    ];
    const text = formatTable(rows, { read: 12, unreadable: 0 });
    const lines = text.split('\n');
    expect(lines[0]).toBe('12 runs read.');
    expect(lines[2]).toMatch(/^System\s+Failed\s+Hung\s+Flaky\s+Test$/);
    expect(lines[3]).toMatch(/^Windows\s+2\s+0\s+1\s+pty::tests::closing$/);
    expect(lines[4]).toMatch(/^macOS\s+0\s+1\s+0\s+mcp::a$/);
    // The columns start at the same place on every row.
    const start = (l: string) => l.indexOf(l.endsWith('closing') ? 'pty' : l.endsWith('mcp::a') ? 'mcp' : 'Test');
    expect(new Set([2, 3, 4].map((i) => start(lines[i]))).size).toBe(1);
  });

  it('says so when nothing went wrong, and how many runs could not be read', () => {
    const text = formatTable([], { read: 5, unreadable: 2 });
    expect(text).toContain('5 runs read');
    expect(text).toContain('2 could not be read');
    expect(text).toContain('Nothing failed');
  });
});

describe('finishedRuns', () => {
  const run = (databaseId: number, status: string, conclusion: string) => ({ databaseId, status, conclusion });

  it('keeps the runs that are over and went green or red, not the cancelled or the running ones', () => {
    const list = [
      run(1, 'in_progress', ''),
      run(2, 'completed', 'success'),
      run(3, 'completed', 'cancelled'),
      run(4, 'completed', 'failure'),
      run(5, 'queued', ''),
      run(6, 'completed', 'skipped'),
    ];
    expect(finishedRuns(list).map((r) => r.databaseId)).toEqual([2, 4]);
  });
});
