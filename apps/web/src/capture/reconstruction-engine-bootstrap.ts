import { isEngineLoaded, loadEngine } from "../engine/index.js";

let readyPromise: Promise<boolean> | undefined;

/**
 * Fire-and-forget WASM engine load for a caller that can await (currently
 * `reconstruction-worker-entry.ts`, at worker startup). `main.ts` also
 * loads the engine independently, on the main thread, for the
 * capability-display DOM attribute — both go through the same
 * `engine/index.ts` module-level `loadEngine()`, so whichever caller loads
 * it first, `isReconstructionEngineReady()` (below) sees it as ready
 * everywhere in that module instance (main thread or worker; each has its
 * own instance, so each needs its own load).
 *
 * Idempotent and safe to call from multiple message handlers or tests —
 * the underlying `loadEngine()` is itself idempotent, and this caches its
 * settled outcome (success or graceful failure) rather than re-attempting.
 * `false` means "stay on the TS math," which is always safe — nothing that
 * routes on `isReconstructionEngineReady()` requires the engine.
 */
export function ensureReconstructionEngineReady(): Promise<boolean> {
  readyPromise ??= loadEngine().then(() => true).catch(() => false);
  return readyPromise;
}

/**
 * Synchronous readiness check for call sites that cannot await (the
 * Levenberg-Marquardt loop in `bundle-optimizer.ts` and the per-frame
 * tracking loop in `capture-pipeline.ts` are both synchronous, and making
 * either async would ripple through the worker job contract or the live
 * camera loop for no benefit). Delegates to `engine/index.ts`'s
 * `isEngineLoaded()` — the actual source of truth — rather than tracking a
 * separate flag here, so it reflects a load kicked off by *any* caller in
 * this module instance (`ensureReconstructionEngineReady()` above, or
 * `main.ts`'s independent `loadEngine()` call on the main thread), not only
 * one started through this file.
 */
export function isReconstructionEngineReady(): boolean {
  return isEngineLoaded();
}
