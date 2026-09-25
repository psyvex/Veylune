// Builds crates/wasm-bridge to a web-target ESM package and drops it into
// src/engine/wasm-bridge-gen, which is generated (gitignored) and imported
// directly by TypeScript. Run automatically before dev/build/test via the
// package.json scripts, or manually:
//
//   node scripts/build-wasm.mjs          # dev profile, fast, unoptimized
//   node scripts/build-wasm.mjs --release  # release profile

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const crateDir = join(webRoot, "..", "..", "crates", "wasm-bridge");
const outDir = join(webRoot, "src", "engine", "wasm-bridge-gen");

const release = process.argv.includes("--release");

const args = [
  "wasm-pack",
  "build",
  ...(release ? [] : ["--dev"]),
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  "veylune_wasm_bridge",
  crateDir,
];

console.log(`[build-wasm] ${args.join(" ")}`);
const result = spawnSync("npx", ["--yes", "wasm-pack@0.15.0", ...args.slice(1)], {
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("[build-wasm] wasm-pack build failed");
  process.exit(result.status ?? 1);
}

if (!existsSync(join(outDir, "veylune_wasm_bridge.js"))) {
  console.error(`[build-wasm] expected output not found in ${outDir}`);
  process.exit(1);
}

console.log(`[build-wasm] wrote ${outDir}`);
