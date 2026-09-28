import { defineConfig } from "vitest/config";

export default defineConfig({
  // Baked into the SW registration URL (src/main.ts). The browser byte-diffs
  // the SW script URL to decide whether to update, so a build-scoped query
  // string is what guarantees a stale offline shell is replaced on the first
  // visit after each deploy. Set VEYLUNE_BUILD_ID in CI for a stable id.
  define: {
    __VEYLUNE_BUILD__: JSON.stringify(process.env.VEYLUNE_BUILD_ID ?? new Date().toISOString().replace(/[:.]/g, "-")),
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: "index.html",
    },
  },

  server: {
    allowedHosts: ["parenting-pants-suzuki-furnished.trycloudflare.com"],
  },

  worker: {
    format: "es",
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});