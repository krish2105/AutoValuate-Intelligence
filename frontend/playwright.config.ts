import { defineConfig } from "@playwright/test";

/**
 * E2E gate (master plan WS F2). Locally it reuses a running dev server on :3000;
 * in CI it boots the production build (`next start`) after `npm run build`.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Fast UI suite — everything except the on-device scan.
      name: "ui",
      testIgnore: /cv-scan\.spec\.ts/,
    },
    {
      // The CV specs download and run the real 44 MB ONNX model through WASM, so a single
      // test costs seconds rather than milliseconds. They are deliberately NOT mocked —
      // mocking inference would void the very privacy and provenance guarantees they
      // exist to prove — so they get their own project and a realistic timeout instead.
      //   npm run test:e2e      → fast suite
      //   npm run test:e2e:cv   → the scan suite
      name: "cv",
      testMatch: /cv-scan\.spec\.ts/,
      timeout: 240_000,
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
