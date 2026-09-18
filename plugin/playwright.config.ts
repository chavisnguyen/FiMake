import { defineConfig } from "@playwright/test";

// E2E drives the REAL built UI bundle (plugin/dist) against a REAL mcp
// server, faking only the Figma main thread (START_TASK -> TASK_FINISHED).
// Uses installed Google Chrome — no browser download needed.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  timeout: 90000,
  retries: 0,
  use: {
    channel: "chrome",
    headless: true,
  },
});
