import { defineConfig, devices } from "@playwright/test";
import { MOCK_PROVIDER_PORT } from "./tests/mock-provider.ts";

export default defineConfig({
  testDir: "./tests",
  // One baseline per screenshot, not one per OS. Cross-platform rendering is
  // covered by the diff budget below.
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}",
  // One API + one SQLite file shared by every test; specs reset the demo burrow
  // between tests, so they cannot run concurrently.
  workers: 1,
  // A rich answer streams ~600 tokens, so give each test room past 30s.
  timeout: 30_000,
  // 5% absorbs font and antialiasing drift between macOS and Linux; keep it
  // tight enough that real layout regressions still fail.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.05 } },
  use: { baseURL: "http://localhost:5173", viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: "npm run api",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      // The mock provider lives on loopback, so the SSRF guard gets a dev bypass.
      env: {
        DATA_DIR: "data/test",
        APP_ORIGIN: "http://localhost:5173",
        TOKEN_PACE_MS: "20",
        RUN_TIMEOUT_MS: process.env.RUN_TIMEOUT_MS ?? "6000",
        ALLOW_PRIVATE_PROVIDERS: "1",
        LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS ?? "2000",
      },
    },
    {
      // All specs talk to this OpenAI-compatible server; the API has no fake model.
      command: "node tests/mock-provider-server.ts",
      url: `http://127.0.0.1:${MOCK_PROVIDER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_LATENCY_MS: "500" },
    },
    {
      command: "npm run dev -w @deepburrow/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
