import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";
const authenticated = process.env.E2E_AUTH_LOCAL === "1";
if (authenticated && !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Authenticated browser tests require the disposable local Supabase API");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { ...devices["Desktop Chrome"], baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: authenticated ? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" : "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: authenticated ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" : ""
    }
  }
});
