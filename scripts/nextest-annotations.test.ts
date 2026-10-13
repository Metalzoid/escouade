// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { annotations, escapeData, failureReport, flakyTests, MAX_LINES } from './nextest-annotations.mjs';

// What cargo-nextest wrote (its profile `ci`), trimmed: a test that passed at its second try, one
// that failed three times, one that was killed after its delay.
const LOG = `   Compiling escouade v1.7.4 (C:\\dev\\src-tauri)
    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 15.53s
────────────
 Nextest run ID bb6803cf with nextest profile: ci
    Starting 3 tests across 2 binaries (1318 tests skipped)
  TRY 1 FAIL [   0.010s] (───) escouade probe::probe_fail
  stdout ───

    running 1 test
    test probe::probe_fail ... FAILED

  stderr ───

    thread 'probe::probe_fail' (46096) panicked at src\\probe.rs:10:5:
    probe failing on purpose: left 1, right 2

   DELAY 2/3 by   1.000s (───) escouade probe::probe_fail
  TRY 2 PASS [   0.009s] (1/3) escouade probe::probe_flaky
        SLOW [> 60.000s] (───) escouade probe::probe_hang
────────────
     Summary [ 542.086s] 3 tests run: 1 passed (1 flaky), 1 failed, 1 timed out, 1318 skipped
   FLAKY 2/3 [   0.009s] (1/3) escouade probe::probe_flaky
  TRY 3 FAIL [   0.009s] (2/3) escouade probe::probe_fail
  stdout ───

    running 1 test
    test probe::probe_fail ... FAILED

  stderr ───

    thread 'probe::probe_fail' (41468) panicked at src\\probe.rs:10:5:
    probe failing on purpose: left 1, right 2

   TRY 3 TMT [ 180.016s] (3/3) escouade probe::probe_hang
  stdout ───

    running 1 test
    test probe::probe_hang has been running for over 60 seconds

    (test timed out)

error: test run failed
`;

const GREEN = `────────────
     Summary [  50.113s] 1318 tests run: 1318 passed, 0 skipped
`;

const FLAKY_ONLY = `────────────
     Summary [  50.113s] 1318 tests run: 1318 passed (1 flaky), 0 skipped
   FLAKY 2/3 [   0.009s] (1/3) escouade probe::probe_flaky
`;

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="nextest-run" tests="4">
    <testsuite name="escouade" tests="4">
        <testcase name="probe::passes" classname="escouade" time="0.1"/>
        <testcase name="probe::probe_flaky" classname="escouade" time="0.009">
            <flakyFailure timestamp="2026" time="0.014" message="thread &apos;probe::probe_flaky&apos; (43672) panicked at src\\probe.rs:19:9" type="test failure with exit code 101">thread &apos;probe::probe_flaky&apos; (43672) panicked at src\\probe.rs:19:9:
left == right &amp; more
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace
                <system-out>
running 1 test
</system-out>
            </flakyFailure>
        </testcase>
        <testcase name="probe::probe_slow" classname="escouade" time="180.02">
            <flakyFailure timestamp="2026" time="180.0" type="test timeout">
                <system-out>
running 1 test
</system-out>
            </flakyFailure>
        </testcase>
        <testcase name="probe::probe_fail" classname="escouade" time="0.010">
            <failure message="panicked" type="test failure with exit code 101">boom</failure>
            <rerunFailure message="panicked" type="test failure with exit code 101">boom</rerunFailure>
        </testcase>
    </testsuite>
</testsuites>
`;

describe('annotation text', () => {
  it('escapes what a workflow command would otherwise read as its own syntax', () => {
    expect(escapeData('100%\r\nnext\nlast')).toBe('100%25%0D%0Anext%0Alast');
  });
});

describe('the failures of a nextest log', () => {
  it('is the report written after the summary, without its flaky lines', () => {
    const report = failureReport(LOG);
    expect(report).toContain('TRY 3 FAIL [   0.009s] (2/3) escouade probe::probe_fail');
    expect(report).toContain('probe failing on purpose: left 1, right 2');
    expect(report).toContain('TRY 3 TMT [ 180.016s] (3/3) escouade probe::probe_hang');
    expect(report).toContain('(test timed out)');
    expect(report).not.toContain('FLAKY');
    expect(report).not.toContain('Summary');
    expect(report).not.toContain('Compiling');
  });

  it('is the end of the log when there is no summary (the build failed)', () => {
    const log = ['error[E0432]: unresolved import', ...Array(300).fill('  --> src/lib.rs'), 'error: could not compile'].join('\n');
    const lines = failureReport(log).split('\n');
    expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(lines.at(-1)).toBe('error: could not compile');
  });

  it('is cut at MAX_LINES', () => {
    const log = `     Summary [ 1s] 1 tests run: 1 failed\n${Array(500).fill('  line').join('\n')}\n`;
    expect(failureReport(log).split('\n')).toHaveLength(MAX_LINES);
  });
});

describe('the flaky tests of a JUnit report', () => {
  it('are the tests that passed after a failed try, with what the first one said', () => {
    expect(flakyTests(JUNIT)).toEqual([
      {
        name: 'escouade probe::probe_flaky',
        why: "thread 'probe::probe_flaky' (43672) panicked at src\\probe.rs:19:9: left == right & more",
      },
      { name: 'escouade probe::probe_slow', why: 'test timeout' },
    ]);
  });

  it('are none in a report without any, or none at all', () => {
    expect(flakyTests('<testsuites><testcase name="a" classname="b"/></testsuites>')).toEqual([]);
    expect(flakyTests('')).toEqual([]);
  });
});

describe('the annotations of a run', () => {
  it('say nothing when everything passed at the first try', () => {
    expect(annotations({ log: GREEN, junit: '', status: 0 })).toEqual([]);
  });

  it('warn about the tests that needed a second try, naming them and what failed first', () => {
    const [warning, ...rest] = annotations({ log: FLAKY_ONLY, junit: JUNIT, status: 0 });
    expect(rest).toEqual([]);
    expect(warning.startsWith('::warning title=Tests instables::')).toBe(true);
    expect(warning).toContain('escouade probe::probe_flaky');
    expect(warning).toContain('escouade probe::probe_slow');
    expect(warning).not.toContain('probe_fail');
    expect(warning).not.toContain('\n');
  });

  it('name the flaky tests of the log when the JUnit report is missing', () => {
    const [warning] = annotations({ log: FLAKY_ONLY, junit: '', status: 0 });
    expect(warning).toContain('escouade probe::probe_flaky');
  });

  it('report the failures as an error, on one line a workflow command can carry', () => {
    const [error, warning] = annotations({ log: LOG, junit: JUNIT, status: 101 });
    expect(error.startsWith('::error title=cargo nextest::')).toBe(true);
    expect(error).toContain('probe failing on purpose');
    expect(error).toContain('%0A');
    expect(error).not.toContain('\n');
    expect(warning.startsWith('::warning title=Tests instables::')).toBe(true);
  });

  it('report a failed run whose log says nothing known', () => {
    const [error] = annotations({ log: '', junit: '', status: 1 });
    expect(error.startsWith('::error title=cargo nextest::')).toBe(true);
  });
});
