/**
 * Validates the registry-level model manifest defined by
 * `models/manifest.schema.json` and `docs/21-model-registry-and-provenance.md`
 * — the richer, docs-governed contract every `models/<model-id>/manifest.json`
 * must satisfy before a model is even a *candidate* in the registry. This is
 * distinct from `manifest-validation.ts`'s `ModelManifest`, which validates
 * the leaner artifact manifest an `InferenceRuntime` loads at run time; a
 * model graduates from "has a registry manifest" (here) to "loadable at
 * run time" (there) as separate gates.
 */

export type CapabilityTier = "preview" | "balanced" | "high" | "maximum";
export type RegistryBackend = "webgpu" | "wasm" | "wasm-simd" | "wasm-threads" | "native";
export type ApprovalStatus = "candidate" | "approved" | "rejected" | "deprecated";

export interface ModelRegistryManifest {
  readonly modelId: string;
  readonly version: string;
  readonly artifactDigest: string;
  readonly sourceUri: string;
  readonly license: string;
  readonly modelCardUri: string;
  readonly supportedBackends: readonly RegistryBackend[];
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly preprocessingVersion: string;
  readonly postprocessingVersion: string;
  readonly minimumCapabilityTier: CapabilityTier;
  readonly knownLimitations: readonly string[];
  readonly evaluationDataset: { readonly id: string; readonly version: string };
  readonly approvalStatus: ApprovalStatus;
}

const REQUIRED_STRING_FIELDS = [
  "modelId", "version", "artifactDigest", "sourceUri", "license",
  "modelCardUri", "preprocessingVersion", "postprocessingVersion",
] as const;
const CAPABILITY_TIERS: readonly CapabilityTier[] = ["preview", "balanced", "high", "maximum"];
const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["candidate", "approved", "rejected", "deprecated"];
const BACKENDS: readonly RegistryBackend[] = ["webgpu", "wasm", "wasm-simd", "wasm-threads", "native"];

/** Throws with a specific message on the first violation, rather than
 * collecting all of them — callers are tooling/tests, not a form UI, so a
 * fast first failure is more useful than an aggregate report. */
export function validateModelRegistryManifest(manifest: unknown): asserts manifest is ModelRegistryManifest {
  if (typeof manifest !== "object" || manifest === null) throw new Error("Model registry manifest must be an object.");
  const m = manifest as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof m[field] !== "string" || (m[field] as string).trim() === "") {
      throw new Error(`Model registry manifest field "${field}" is required and must be a non-empty string.`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/i.test(m.artifactDigest as string)) {
    throw new Error('Model registry manifest "artifactDigest" must match "sha256:<64 hex chars>".');
  }
  if (!Array.isArray(m.supportedBackends) || m.supportedBackends.length === 0) {
    throw new Error('Model registry manifest "supportedBackends" must be a non-empty array.');
  }
  for (const backend of m.supportedBackends as unknown[]) {
    if (!BACKENDS.includes(backend as RegistryBackend)) throw new Error(`Model registry manifest declares unknown backend "${String(backend)}".`);
  }
  if (typeof m.inputSchema !== "object" || m.inputSchema === null) throw new Error('Model registry manifest "inputSchema" must be an object.');
  if (typeof m.outputSchema !== "object" || m.outputSchema === null) throw new Error('Model registry manifest "outputSchema" must be an object.');
  if (!CAPABILITY_TIERS.includes(m.minimumCapabilityTier as CapabilityTier)) {
    throw new Error(`Model registry manifest "minimumCapabilityTier" must be one of ${CAPABILITY_TIERS.join(", ")}.`);
  }
  if (!Array.isArray(m.knownLimitations) || m.knownLimitations.length === 0 || !m.knownLimitations.every((v) => typeof v === "string" && v.trim() !== "")) {
    throw new Error('Model registry manifest "knownLimitations" must be a non-empty array of non-empty strings — an empty list reads as "no known limitations," which is never true for a candidate model.');
  }
  const dataset = m.evaluationDataset as Record<string, unknown> | undefined;
  if (typeof dataset !== "object" || dataset === null || typeof dataset.id !== "string" || typeof dataset.version !== "string") {
    throw new Error('Model registry manifest "evaluationDataset" must be an object with string "id" and "version".');
  }
  if (!APPROVAL_STATUSES.includes(m.approvalStatus as ApprovalStatus)) {
    throw new Error(`Model registry manifest "approvalStatus" must be one of ${APPROVAL_STATUSES.join(", ")}.`);
  }
}

/** A model may only be wired into the live `InferenceEngineRegistry` once
 * its registry manifest says so — this is the single gate every future
 * engine-registration call site should check first, per the model-selection
 * decision boundary in `docs/42-vision-model-selection.md`. */
export function isApprovedForProduction(manifest: ModelRegistryManifest): boolean {
  return manifest.approvalStatus === "approved";
}
