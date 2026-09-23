import type { CapabilityProfile } from "../runtime/capabilities";
import type { ModelManifest } from "./model";
import { selectInferenceBackend } from "./backend";
import { validateModelManifest } from "./manifest-validation";

export type ReadinessFailure = "invalid_manifest" | "unsupported_backend" | "benchmark_required";

export interface InferenceReadiness {
  readonly ready: boolean;
  readonly backend?: ReturnType<typeof selectInferenceBackend>;
  readonly failure?: ReadinessFailure;
}

export function assessInferenceReadiness(
  capabilities: CapabilityProfile,
  manifest: ModelManifest,
  benchmarkPassed: boolean,
): InferenceReadiness {
  try {
    validateModelManifest(manifest);
  } catch {
    return { ready: false, failure: "invalid_manifest" };
  }

  const backend = selectInferenceBackend(capabilities, manifest);
  if (!backend) return { ready: false, failure: "unsupported_backend" };
  if (!benchmarkPassed) return { ready: false, backend, failure: "benchmark_required" };
  return { ready: true, backend };
}
