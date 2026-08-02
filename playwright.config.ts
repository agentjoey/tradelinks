import { defineConfig, devices } from "@playwright/test";

// Default is the plan's contract (http://127.0.0.1:3000); E2E_PORT only
// relocates a local run when 3000 is already occupied on the dev machine.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: `PORT=${port} pnpm start`, url: baseURL, reuseExistingServer: false },
});
