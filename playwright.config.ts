import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:5173", viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: "npm run mock",
      url: "http://localhost:8787/burrow",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -w @deepburrow/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
