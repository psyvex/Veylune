// Node-only helper that reads the built wasm-bridge artifact off disk and
// hands its bytes to `loadEngineFromBytes`. Used by tests running under
// Vitest's jsdom environment, which has no document base URL for the
// browser `loadEngine` path's relative asset fetch to resolve against.
//
// This module is never imported by application code (see src/main.ts and
// src/engine/index.ts), so it never reaches the production browser bundle.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEngineFromBytes } from "./index.js";

export async function loadEngineForNode(): Promise<void> {
  const wasmPath = join(process.cwd(), "src/engine/wasm-bridge-gen/veylune_wasm_bridge_bg.wasm");
  const bytes = await readFile(wasmPath);
  loadEngineFromBytes(bytes);
}
