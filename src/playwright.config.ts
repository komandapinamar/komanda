import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const webServerReadyURL = new URL("/login", baseURL).toString();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "multitenant",
      use: { ...devices["Desktop Chrome"] },
      metadata: { tenantSlug: "multitenant" },
    },
    {
      name: "tenant-a",
      use: { ...devices["Desktop Chrome"] },
      metadata: { tenantSlug: "tenant-a" },
    },
    {
      name: "tenant-b",
      use: { ...devices["Desktop Chrome"] },
      metadata: { tenantSlug: "tenant-b" },
    },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1",
        url: webServerReadyURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          KOMANDA_TEST_MODE: "1",
        },
      },
});
