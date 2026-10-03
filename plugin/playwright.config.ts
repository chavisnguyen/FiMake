import { defineConfig } from "@playwright/test";

// E2E drives the REAL built UI bundle (plugin/dist) against a REAL mcp
// server, faking only the Figma main thread (START_TASK -> TASK_FINISHED).
// Uses Playwright's bundled Chromium (npx playwright install chromium) so CI
// and fresh machines work without a Google Chrome install.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  timeout: 90000,
  retries: 0,
  use: {
    headless: true,
  },
});
