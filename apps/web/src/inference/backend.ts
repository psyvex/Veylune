import type { CapabilityProfile } from "../runtime/capabilities";
import type { InferenceBackend, ModelManifest } from "./model";

const order: readonly InferenceBackend[] = ["webgpu", "webnn", "wasm"];

export function selectInferenceBackend(
  capabilities: CapabilityProfile,
  model: ModelManifest,
): InferenceBackend | undefined {
  return order.find((backend) => {
    if (!model.supportedBackends.includes(backend)) return false;
    if (backend === "webgpu") return capabilities.webgpu === "supported";
    if (backend === "webnn") return capabilities.webnn === "supported";
    return capabilities.wasm === "supported";
  });
}
