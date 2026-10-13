#!/usr/bin/env node
// Turns what `cargo nextest run --profile ci` left (its log, the JUnit report) into annotations of
// the workflow run, which can be read without reading the job's log (that takes admin rights).
//   node scripts/nextest-annotations.mjs nextest.log target/nextest/ci/junit.xml <exit code>
// An error with the failures when the run failed, and a warning naming the tests that failed and
// then passed at a new try (nextest's retries hide them otherwise).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The longest failure report put in an annotation. */
export const MAX_LINES = 150;
/** The longest reason given for a flaky test. */
const MAX_WHY = 300;

const COLORS = /\u001b\[[0-9;]*m/g;

/** `text` as the data of a workflow command (one line). */
export function escapeData(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

const lines = (text) => text.replace(/\r\n/g, '\n').replace(COLORS, '').split('\n');
/** `all` without the empty lines at its end. */
const trimEnd = (all) => {
  let end = all.length;
  while (end > 0 && all[end - 1].trim() === '') end--;
  return all.slice(0, end);
};

const FLAKY_LINE = /^\s*FLAKY \d+\/\d+ \[[^\]]*\]\s*(?:\([^)]*\)\s*)?(\S.*?)\s*$/;

/**
 * What nextest wrote about the tests that failed, once all ran: the report that follows its
 * summary (their output, repeated there by the profile), without the flaky ones. The end of the
 * log when there is no summary (the build failed).
 */
export function failureReport(log) {
  const all = lines(log);
  const summary = all.findIndex((l) => /^\s*Summary \[/.test(l));
  if (summary < 0) return trimEnd(all).slice(-MAX_LINES).join('\n');
  const report = all.slice(summary + 1).filter((l) => !FLAKY_LINE.test(l));
  return trimEnd(report).slice(0, MAX_LINES).join('\n');
}

const ENTITIES = { '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const decode = (s) => s.replace(/&(?:apos|quot|lt|gt|amp);/g, (e) => ENTITIES[e]);
const attribute = (attributes, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return m ? decode(m[1]) : '';
};

/** Why a flaky test failed the first time: what it printed, else the kind of failure. */
function whyFailed(attributes, body) {
  const text = decode(body.split(/<system-(?:out|err)>/)[0])
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('note: run with'))
    .join(' ');
  return (text || attribute(attributes, 'type')).slice(0, MAX_WHY);
}

/** The tests of a JUnit report that failed and then passed (`flakyFailure`), and why. */
export function flakyTests(junit) {
  const found = [];
  for (const testcase of junit.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const flaky = /<flakyFailure\b([^>]*?)(?:\/>|>([\s\S]*?)<\/flakyFailure>)/.exec(testcase[2] ?? '');
    if (!flaky) continue;
    const name = [attribute(testcase[1], 'classname'), attribute(testcase[1], 'name')].filter(Boolean).join(' ');
    found.push({ name, why: whyFailed(flaky[1], flaky[2] ?? '') });
  }
  return found;
}

/** The flaky tests nextest's log names, when there is no JUnit report to ask. */
function flakyInLog(log) {
  const names = new Set();
  for (const line of lines(log)) {
    const m = FLAKY_LINE.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names].map((name) => ({ name, why: '' }));
}

/** The workflow commands for a run: `status` is nextest's exit code. */
export function annotations({ log, junit, status }) {
  const out = [];
  if (status !== 0) {
    const report = failureReport(log) || `cargo nextest run failed (exit code ${status}).`;
    out.push(`::error title=cargo nextest::${escapeData(report)}`);
  }
  let flaky = flakyTests(junit);
  if (!flaky.length) flaky = flakyInLog(log);
  if (flaky.length) {
    const list = flaky.map((t) => (t.why ? `- ${t.name} — ${t.why}` : `- ${t.name}`));
    const text = ['Ces tests ont échoué, puis réussi à un nouvel essai :', ...list].join('\n');
    out.push(`::warning title=Tests instables::${escapeData(text)}`);
  }
  return out;
}

const read = (file) => (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [logFile, junitFile, status] = process.argv.slice(2);
  const commands = annotations({
    log: read(logFile),
    junit: read(junitFile),
    status: Number(status ?? 0),
  });
  for (const command of commands) console.log(command);
}
