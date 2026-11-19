import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // One API + one SQLite file shared by every test; specs reset the demo burrow
  // between tests, so they cannot run concurrently.
  workers: 1,
  // A rich answer streams ~600 tokens, so give each test room past 30s.
  timeout: 30_000,
  // A 1.5px edge layer only moves ~100 pixels of a full screenshot, so the
  // golden budget is absolute pixels; a ratio would let the edges disappear.
  expect: { toHaveScreenshot: { maxDiffPixels: 40 } },
  use: { baseURL: "http://localhost:5173", viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: "npm run api",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      // FAKE_FAIL_ASK lets a spec force a real model failure once, then retry clean.
      // Two rounds so the loop and progress lines are real in the browser; the
      // short latency keeps progress visible without slowing the suite.
      env: {
        DATA_DIR: "data/test",
        FAKE_PACE_MS: "20",
        FAKE_LATENCY_MS: "100",
        FAKE_ROUNDS: "2",
        FAKE_FAIL_ASK: "zzfail",
      },
    },
    {
      command: "npm run dev -w @deepburrow/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
