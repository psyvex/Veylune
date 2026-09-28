import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isApprovedForProduction, validateModelRegistryManifest, type ModelRegistryManifest } from "./model-registry-manifest.js";

/**
 * Proves the schema in `models/manifest.schema.json` and the validator here
 * agree on at least one real, checked-in manifest (Stage 0 task 4 of
 * `docs/75-production-task-pipeline.md`) — not a synthetic fixture, the
 * actual `models/movenet-singlepose-lightning/manifest.json` this repo
 * ships.
 */

async function readManifest(modelId: string): Promise<unknown> {
  const path = join(process.cwd(), "..", "..", "models", modelId, "manifest.json");
  const bytes = await readFile(path);
  return JSON.parse(new TextDecoder("utf-8").decode(bytes));
}

describe("model registry manifest", () => {
  it("validates the checked-in MoveNet SinglePose Lightning manifest", async () => {
    const manifest = await readManifest("movenet-singlepose-lightning");
    expect(() => validateModelRegistryManifest(manifest)).not.toThrow();
  });

  it("is not yet approved for production — still a candidate pending the docs/42 verification gate", async () => {
    const manifest = await readManifest("movenet-singlepose-lightning");
    validateModelRegistryManifest(manifest);
    expect(isApprovedForProduction(manifest)).toBe(false);
    expect(manifest.approvalStatus).toBe("candidate");
  });

  it("rejects a manifest with an empty knownLimitations list", () => {
    const base: ModelRegistryManifest = {
      modelId: "x", version: "1", artifactDigest: `sha256:${"a".repeat(64)}`, sourceUri: "https://example.com/m.onnx",
      license: "Apache-2.0", modelCardUri: "models/x/model-card.md", supportedBackends: ["wasm"],
      inputSchema: {}, outputSchema: {}, preprocessingVersion: "1", postprocessingVersion: "1",
      minimumCapabilityTier: "preview", knownLimitations: [], evaluationDataset: { id: "none", version: "unevaluated" },
      approvalStatus: "candidate",
    };
    expect(() => validateModelRegistryManifest(base)).toThrow(/knownLimitations/);
  });

  it("rejects a malformed artifact digest", () => {
    const manifest = { modelId: "x", version: "1", artifactDigest: "not-a-digest", sourceUri: "https://example.com/m.onnx", license: "Apache-2.0", modelCardUri: "c.md", supportedBackends: ["wasm"], inputSchema: {}, outputSchema: {}, preprocessingVersion: "1", postprocessingVersion: "1", minimumCapabilityTier: "preview", knownLimitations: ["x"], evaluationDataset: { id: "none", version: "unevaluated" }, approvalStatus: "candidate" };
    expect(() => validateModelRegistryManifest(manifest)).toThrow(/artifactDigest/);
  });
});
