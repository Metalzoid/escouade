import { defineConfig } from '@playwright/test';

// The website's screenshots, taken in the real app (`npm run site-shots`, tests/site-shots/README.md): the same tooling as
// the end-to-end tests (debug build, throwaway data folder, fake harnesses, hidden window), on made-up projects kept in a
// folder whose path shows nothing of the machine. Once in French, once in English.

/** Where the demo's projects and the app's data go: a path that tells nothing of the user (no C:\Users\…). */
process.env.ESCOUADE_E2E_ROOT ??= 'C:\\escouade-demo';

export default defineConfig({
  testDir: 'tests/site-shots',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/site-shots/global-tmp.ts',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  use: { actionTimeout: 30_000 },
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'fr', use: { language: 'fr' } },
    { name: 'en', use: { language: 'en' } },
  ],
});
