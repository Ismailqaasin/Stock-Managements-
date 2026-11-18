import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.E2E_URL ?? "http://127.0.0.1:3000",
    viewport: { width: 1360, height: 860 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/api/auth/config",
        reuseExistingServer: !process.env.CI,
        timeout: 90000,
      },
});
