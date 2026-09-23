import type { ModelManifest } from "./model";

export function validateModelManifest(manifest: ModelManifest): void {
  if (!manifest.id.trim()) throw new Error("Model ID is required.");
  if (!manifest.version.trim()) throw new Error("Model version is required.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.digest)) throw new Error("Model digest must be a SHA-256 hex digest.");
  if (!manifest.license.trim()) throw new Error("Model license is required.");
  if (!manifest.inputSchema.trim()) throw new Error("Model input schema is required.");
  if (!manifest.outputSchema.trim()) throw new Error("Model output schema is required.");
  if (manifest.supportedBackends.length === 0) throw new Error("Model must declare at least one backend.");
}
