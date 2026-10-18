import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real Tauri app (debug build with the embedded frontend:
// `npx tauri build --debug --no-bundle`) through WebView2's DevTools protocol.
export default defineConfig({
  testDir: 'tests/e2e',
  // Only the tests: tests/e2e also holds the unit tests of the fixture's helpers (`*.test.ts`, Vitest's).
  testMatch: '**/*.spec.ts',
  // A temporary folder of its own, the app's too, removed at the end (scripts/test-tmp.ts).
  globalSetup: './tests/e2e/global-tmp.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  // On CI a test that fails runs again, twice: the one that passes then is reported as flaky (a run that
  // is green all the same), the one that fails every time is a failure.
  retries: process.env.CI ? 2 : 0,
  // When the app cannot be driven at all, every test would wait for it in turn: stop early. Only a test
  // that failed at every try counts, so a few flaky ones never stop the run.
  maxFailures: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // The trace of the first new try on CI (there is none without a retry, so locally, a failure keeps its own).
  use: { trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure' },
});
