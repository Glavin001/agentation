import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npx vite --port 3399",
    port: 3399,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
