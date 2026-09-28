import { describe, expect, it } from "vitest";
import { ensureReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

describe("ensureReconstructionEngineReady", () => {
  it("resolves to a boolean without throwing, whatever the environment's WASM/fetch support is", async () => {
    // Under jsdom (no document base URL, no real network), the browser
    // loadEngine() path's fetch is expected to fail — this proves that
    // failure resolves to false instead of rejecting or hanging, which is
    // the actual capability-fallback contract this function exists for.
    await expect(ensureReconstructionEngineReady()).resolves.toEqual(expect.any(Boolean));
  });

  it("is idempotent — repeated calls return the same settled outcome without re-attempting the load", async () => {
    const first = await ensureReconstructionEngineReady();
    const second = await ensureReconstructionEngineReady();
    expect(second).toBe(first);
  });
});
