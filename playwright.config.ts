import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // One API + one SQLite file shared by every test; specs reset the demo burrow
  // between tests, so they cannot run concurrently.
  workers: 1,
  use: { baseURL: "http://localhost:5173", viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: "npm run api",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      // FAKE_FAIL_ASK lets a spec force a real model failure once, then retry clean.
      env: { DATA_DIR: "data/test", FAKE_PACE_MS: "30", FAKE_FAIL_ASK: "zzfail" },
    },
    {
      command: "npm run dev -w @deepburrow/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
