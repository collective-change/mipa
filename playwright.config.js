import { defineConfig, devices } from "@playwright/test";

// Explicit default target: run against the local app + Firebase Auth/Firestore emulators
// rather than production. Pass BASE_URL explicitly only for intentional live checks.
const baseURL = process.env.BASE_URL || "http://127.0.0.1:9000";
const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(baseURL);

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: isLocalTarget
    ? {
        command: "npx quasar dev -p 9000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          useEmulators: "true",
          apiKey: "demo-api-key",
          projectId: "demo-mipa",
          authDomain: "demo-mipa.firebaseapp.com",
          ...process.env
        }
      }
    : undefined
});
