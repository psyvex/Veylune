import { defineConfig } from "vitest/config";

export default defineConfig({
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