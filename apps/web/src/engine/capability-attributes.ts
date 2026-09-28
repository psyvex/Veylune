import type { CapabilityProfile } from "../runtime/capabilities";
import { toEngineCapabilities } from "../runtime/capabilities";
import { enginePreferredBackend, engineVersion, loadEngine } from "./index.js";

/**
 * Loads the Rust/WASM engine and writes what it reports onto `root`'s
 * dataset, so the capability profile is visible end to end — Rust
 * `CapabilityProfile`/backend-selection logic through to a DOM attribute —
 * per Phase 0's acceptance criteria (ADR-013, Stage 0 task 8). Extracted out
 * of `main.ts` (an entry script that runs its top-level code on import,
 * which is awkward to exercise directly) so this specific hop has its own
 * test: `capability-attributes.test.ts` calls it against a real loaded
 * engine (via `node-loader.ts`) and a real `HTMLElement`, not a mock of
 * either side.
 */
export async function applyEngineCapabilityAttributes(root: HTMLElement, capabilities: CapabilityProfile): Promise<void> {
  await loadEngine();
  root.dataset.engineVersion = engineVersion();
  root.dataset.enginePreferredBackend = enginePreferredBackend(toEngineCapabilities(capabilities), "balanced");
}
