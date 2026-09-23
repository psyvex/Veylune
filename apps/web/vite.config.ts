import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: "index.html",
    },
  },
  worker: {
    format: "es",
  },
});
